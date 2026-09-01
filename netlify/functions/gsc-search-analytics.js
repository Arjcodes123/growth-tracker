// Server-side proxy for Search Console's searchAnalytics.query, called from
// the admin dashboard (admin.js). Authenticates as the gsc-sync service
// account -- its key lives in the GSC_SERVICE_ACCOUNT_KEY Netlify
// environment variable (paste the full downloaded JSON key file as the
// value; never commit it here) -- rather than any user's own OAuth session,
// so this keeps working without anyone needing to periodically re-consent.
// gsc-sync has "Restricted" (read-only) access on the groundworklog.com
// Search Console property; see STATUS.md for how that was set up.
//
// Classic Node Netlify Function (not an Edge Function) specifically so this
// can use Node's built-in `crypto` for the JWT signature below with zero
// added dependencies -- lives in netlify/functions, the directory already
// configured as this site's Functions directory.
//
// Only the site owner should ever get data back from this -- every request
// must carry the caller's Supabase access token, checked against Supabase's
// own /auth/v1/user endpoint and the same admin email admin.js and the
// "admin reads all profiles" RLS policy already gate on.

const crypto = require('crypto');

const ADMIN_EMAIL = 'abdulrehmanjavaid16@gmail.com';
const SITE_URL = 'https://groundworklog.com/'; // must exactly match the GSC property's resource, trailing slash included
const SUPABASE_URL = 'https://olfbcqtinzbhxvwipedb.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_Xk_aSrS3MnKtIoEUUc0uJw_5JUl1IiI';

function base64url(input){
  return Buffer.from(input).toString('base64').replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');
}

// Exchanges the service account key for a short-lived Search Console access
// token via the standard JWT-bearer grant -- no OAuth consent screen, no
// stored refresh token, just this key.
async function getAccessToken(){
  const keyJson = JSON.parse(process.env.GSC_SERVICE_ACCOUNT_KEY);
  const now = Math.floor(Date.now()/1000);
  const header = { alg:'RS256', typ:'JWT' };
  const claim = {
    iss: keyJson.client_email,
    scope: 'https://www.googleapis.com/auth/webmasters.readonly',
    aud: 'https://oauth2.googleapis.com/token',
    iat: now,
    exp: now + 3600,
  };
  const unsigned = `${base64url(JSON.stringify(header))}.${base64url(JSON.stringify(claim))}`;
  const signature = crypto.createSign('RSA-SHA256').update(unsigned).sign(keyJson.private_key)
    .toString('base64').replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');
  const jwt = `${unsigned}.${signature}`;

  const res = await fetch('https://oauth2.googleapis.com/token', {
    method:'POST',
    headers:{ 'Content-Type':'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type:'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion: jwt })
  });
  if(!res.ok) throw new Error(`Token exchange failed: ${res.status} ${await res.text()}`);
  return (await res.json()).access_token;
}

exports.handler = async (event) => {
  if(event.httpMethod !== 'POST'){
    return { statusCode: 405, body: JSON.stringify({error:'Method not allowed'}) };
  }

  const authHeader = event.headers.authorization || event.headers.Authorization || '';
  const token = authHeader.replace(/^Bearer\s+/i, '');
  if(!token) return { statusCode: 401, body: JSON.stringify({error:'Missing auth token'}) };

  const userRes = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
    headers: { apikey: SUPABASE_ANON_KEY, Authorization: `Bearer ${token}` }
  });
  if(!userRes.ok) return { statusCode: 401, body: JSON.stringify({error:'Invalid session'}) };
  const userData = await userRes.json();
  if(userData.email !== ADMIN_EMAIL) return { statusCode: 403, body: JSON.stringify({error:'Forbidden'}) };

  if(!process.env.GSC_SERVICE_ACCOUNT_KEY){
    return { statusCode: 500, body: JSON.stringify({error:'GSC_SERVICE_ACCOUNT_KEY is not set on this site yet.'}) };
  }

  let body = {};
  try{ body = JSON.parse(event.body || '{}'); } catch(e){ /* use defaults below */ }
  const days = Math.min(Math.max(Number(body.days)||28, 1), 90);
  const endDate = new Date(); endDate.setDate(endDate.getDate()-2); // GSC data lags ~2 days
  const startDate = new Date(endDate); startDate.setDate(startDate.getDate()-days);
  const fmt = d => d.toISOString().slice(0,10);

  try{
    const accessToken = await getAccessToken();
    const gscRes = await fetch(`https://searchconsole.googleapis.com/webmasters/v3/sites/${encodeURIComponent(SITE_URL)}/searchAnalytics/query`, {
      method:'POST',
      headers:{ Authorization:`Bearer ${accessToken}`, 'Content-Type':'application/json' },
      body: JSON.stringify({
        startDate: fmt(startDate), endDate: fmt(endDate),
        dimensions: Array.isArray(body.dimensions) ? body.dimensions : ['query'],
        rowLimit: 25
      })
    });
    const text = await gscRes.text();
    if(!gscRes.ok) return { statusCode: 502, body: JSON.stringify({error:`GSC API error: ${gscRes.status}`, detail: text}) };
    return { statusCode: 200, headers:{'Content-Type':'application/json'}, body: text };
  } catch(e){
    return { statusCode: 500, body: JSON.stringify({error: e.message}) };
  }
};
