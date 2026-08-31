// Owner-only dashboard. Reads only the `profiles` table (id, email,
// created_at, last_active_at) -- never any of the actual tracked content,
// which stays locked to each user by RLS regardless of who's signed in here.
const SUPABASE_URL = 'https://olfbcqtinzbhxvwipedb.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_Xk_aSrS3MnKtIoEUUc0uJw_5JUl1IiI';
const ADMIN_EMAIL = 'abdulrehmanjavaid16@gmail.com';

const sb = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true }
});

function show(id, disp){ document.getElementById(id).style.display = disp; }
function esc(s){
  return String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
}
function dateStr(d){
  const y = d.getFullYear();
  const m = String(d.getMonth()+1).padStart(2,'0');
  const day = String(d.getDate()).padStart(2,'0');
  return `${y}-${m}-${day}`;
}

document.getElementById('google-signin').addEventListener('click', async ()=>{
  await sb.auth.signInWithOAuth({
    provider: 'google',
    options: { redirectTo: window.location.origin + window.location.pathname }
  });
});

async function checkSession(){
  const {data} = await sb.auth.getSession();
  if(data.session) onLoggedIn(data.session.user);
  else show('screen-auth','block');
}
sb.auth.onAuthStateChange((event, session)=>{ if(session) onLoggedIn(session.user); });

function onLoggedIn(user){
  history.replaceState(null, '', window.location.pathname);
  show('screen-auth','none');
  if(user.email !== ADMIN_EMAIL){
    document.getElementById('denied-email').textContent = user.email;
    show('screen-denied','block');
    return;
  }
  show('dashboard','block');
  loadDashboard();
}

document.querySelectorAll('.tab').forEach(t=>{
  t.addEventListener('click', ()=>{
    document.querySelectorAll('.tab').forEach(x=>x.classList.remove('active'));
    document.querySelectorAll('.panel').forEach(x=>x.classList.remove('active'));
    t.classList.add('active');
    document.getElementById('panel-'+t.dataset.tab).classList.add('active');
    if(t.dataset.tab==='blog') loadBlogList();
  });
});

async function loadDashboard(){
  const {data, error} = await sb.from('profiles').select('id,email,created_at,last_active_at');
  if(error){ document.getElementById('admin-error').textContent = error.message; return; }
  renderStats(data);
  renderChart(data);
  renderList(data);
  loadSearchConsole(); // independent of the profiles data above; doesn't block it
}

// ---- Search Console (via the gsc-sync service account, proxied through
// netlify/functions/gsc-search-analytics.js -- see that file's header for
// why a server-side function rather than a client-side OAuth scope) ----
async function fetchGscRows(body, accessToken){
  try{
    const res = await fetch('/.netlify/functions/gsc-search-analytics', {
      method:'POST',
      headers:{ 'Content-Type':'application/json', Authorization:`Bearer ${accessToken}` },
      body: JSON.stringify(body)
    });
    const data = await res.json();
    if(!res.ok) return { error: data.error || `Request failed (${res.status})` };
    return { rows: data.rows || [] };
  } catch(e){
    return { error: e.message };
  }
}
function renderGscRows(containerId, rows, kind){
  const el = document.getElementById(containerId);
  if(!rows || rows.length===0){ el.innerHTML = '<div class="empty">No data yet.</div>'; return; }
  el.innerHTML = rows.map(r=>{
    const label = (r.keys && r.keys[0]) || '(unknown)';
    const shown = kind==='page' ? label.replace(/^https:\/\/groundworklog\.com/, '') || '/' : label;
    const ctr = ((r.ctr||0)*100).toFixed(1);
    return `
      <div class="entry">
        <div class="entry-head"><span class="entry-title">${esc(shown)}</span><span>${r.clicks} clicks</span></div>
        <div class="entry-note">${r.impressions} impressions &middot; ${ctr}% CTR &middot; avg position ${(r.position||0).toFixed(1)}</div>
      </div>`;
  }).join('');
}
async function loadSearchConsole(){
  const statusEl = document.getElementById('gsc-status');
  const contentEl = document.getElementById('gsc-content');
  try{
    const {data:{session}} = await sb.auth.getSession();
    if(!session){ statusEl.textContent = 'Not signed in.'; return; }
    const [queries, pages] = await Promise.all([
      fetchGscRows({dimensions:['query']}, session.access_token),
      fetchGscRows({dimensions:['page']}, session.access_token),
    ]);
    if(queries.error){ statusEl.textContent = queries.error; return; }
    if(pages.error){ statusEl.textContent = pages.error; return; }
    statusEl.style.display = 'none';
    contentEl.style.display = 'block';
    renderGscRows('gsc-queries', queries.rows, 'query');
    renderGscRows('gsc-pages', pages.rows, 'page');
  } catch(e){
    statusEl.textContent = `Couldn't load Search Console data: ${e.message}`;
  }
}

function renderStats(rows){
  const now = new Date();
  const today = dateStr(now);
  const weekAgo = new Date(now); weekAgo.setDate(weekAgo.getDate()-7);
  const monthAgo = new Date(now); monthAgo.setDate(monthAgo.getDate()-30);

  const total = rows.length;
  const signupsWeek = rows.filter(r=>new Date(r.created_at) >= weekAgo).length;
  const dau = rows.filter(r=>dateStr(new Date(r.last_active_at)) === today).length;
  const wau = rows.filter(r=>new Date(r.last_active_at) >= weekAgo).length;
  const mau = rows.filter(r=>new Date(r.last_active_at) >= monthAgo).length;

  document.getElementById('admin-stats').innerHTML = `
    <div class="stat"><div class="num">${total}</div><div class="lbl">Total signups</div></div>
    <div class="stat"><div class="num">${signupsWeek}</div><div class="lbl">Signups this week</div></div>
    <div class="stat"><div class="num">${dau}</div><div class="lbl">Active today</div></div>
    <div class="stat"><div class="num">${wau}</div><div class="lbl">Active this week</div></div>
    <div class="stat"><div class="num">${mau}</div><div class="lbl">Active this month</div></div>
  `;
}

let chart;
function renderChart(rows){
  const days = [];
  const t = new Date();
  for(let i=29;i>=0;i--){ const d=new Date(t); d.setDate(d.getDate()-i); days.push(dateStr(d)); }
  const counts = days.map(d => rows.filter(r=>dateStr(new Date(r.created_at))===d).length);
  if(chart) chart.destroy();
  chart = new Chart(document.getElementById('chart-signups'), {
    type:'bar',
    data:{ labels: days.map(d=>d.slice(5)), datasets:[{ label:'Signups', data:counts, backgroundColor:'#a8672a' }] },
    options:{
      scales:{
        x:{ ticks:{color:'#6b5c40'}, grid:{display:false} },
        y:{ beginAtZero:true, ticks:{color:'#6b5c40', precision:0}, grid:{color:'#ddccaa'} }
      },
      plugins:{ legend:{display:false} }
    }
  });
}

function renderList(rows){
  const sorted = [...rows].sort((a,b)=> new Date(b.created_at) - new Date(a.created_at));
  const el = document.getElementById('admin-list');
  if(sorted.length===0){ el.innerHTML = '<div class="empty">No signups yet.</div>'; return; }
  el.innerHTML = sorted.slice(0,50).map(r=>`
    <div class="entry">
      <div class="entry-head"><span class="entry-title">${esc(r.email)}</span><span>joined ${esc(r.created_at.slice(0,10))}</span></div>
      <div class="entry-note">last active ${esc(r.last_active_at.slice(0,10))}</div>
    </div>`).join('');
}

// ---- blog CMS ----
let posts = [];
let editingPostId = null; // null = creating a new post
let slugManuallyEdited = false;

async function loadBlogList(){
  const {data, error} = await sb.from('posts').select('*').order('updated_at', {ascending:false});
  if(error){ document.getElementById('blog-list').innerHTML = `<p class="hint" style="color:var(--danger)">${esc(error.message)}</p>`; return; }
  posts = data;
  renderBlogList();
}

function renderBlogList(){
  const el = document.getElementById('blog-list');
  if(posts.length===0){ el.innerHTML = '<div class="empty">No posts yet.</div>'; return; }
  el.innerHTML = posts.map(p => `
    <div class="entry">
      <div class="entry-head">
        <span class="entry-title">${esc(p.title || '(untitled)')}</span>
        <span>${esc((p.updated_at||p.created_at).slice(0,10))}</span>
      </div>
      <span class="badge badge-${p.status==='published'?'deep':'shallow'}">${esc(p.status)}</span>
      <div style="margin-top:8px;"><button class="btn secondary small" data-edit="${p.id}">Edit</button></div>
    </div>`).join('');
  el.querySelectorAll('[data-edit]').forEach(btn=>{
    btn.addEventListener('click', ()=>openEditor(btn.dataset.edit));
  });
}

function slugify(s){
  return String(s||'').toLowerCase().trim()
    .replace(/[^a-z0-9\s-]/g,'')
    .replace(/\s+/g,'-')
    .replace(/-+/g,'-')
    .replace(/^-|-$/g,'');
}

document.getElementById('post-title').addEventListener('input', e=>{
  if(!slugManuallyEdited) document.getElementById('post-slug').value = slugify(e.target.value);
  runSeoCheck();
});
document.getElementById('post-slug').addEventListener('input', ()=>{ slugManuallyEdited = true; });
['post-meta-description','post-keyphrase','post-related','post-body'].forEach(id=>{
  document.getElementById(id).addEventListener('input', runSeoCheck);
});
document.getElementById('post-meta-description').addEventListener('input', e=>{
  document.getElementById('post-meta-count').textContent = `(${e.target.value.length} chars)`;
});

document.getElementById('post-new-btn').addEventListener('click', ()=>openEditor(null));
document.getElementById('post-cancel-btn').addEventListener('click', closeEditor);

function openEditor(id){
  editingPostId = id;
  slugManuallyEdited = !!id;
  const p = id ? posts.find(x=>x.id===id) : null;
  document.getElementById('post-title').value = p?.title || '';
  document.getElementById('post-slug').value = p?.slug || '';
  document.getElementById('post-meta-description').value = p?.meta_description || '';
  document.getElementById('post-meta-count').textContent = `(${(p?.meta_description||'').length} chars)`;
  document.getElementById('post-keyphrase').value = p?.focus_keyphrase || '';
  document.getElementById('post-related').value = p?.related_keywords || '';
  document.getElementById('post-cover').value = p?.cover_image_url || '';
  document.getElementById('post-body').value = p?.body || '';
  document.getElementById('post-delete-btn').style.display = id ? 'inline-block' : 'none';
  show('blog-list-card','none');
  show('post-editor-card','block');
  runSeoCheck();
}
function closeEditor(){
  show('post-editor-card','none');
  show('blog-list-card','block');
}

function collectPostFields(){
  return {
    title: document.getElementById('post-title').value.trim(),
    slug: document.getElementById('post-slug').value.trim(),
    meta_description: document.getElementById('post-meta-description').value.trim(),
    focus_keyphrase: document.getElementById('post-keyphrase').value.trim(),
    related_keywords: document.getElementById('post-related').value.trim(),
    cover_image_url: document.getElementById('post-cover').value.trim(),
    body: document.getElementById('post-body').value,
  };
}

async function savePost(status){
  const fields = collectPostFields();
  if(!fields.title || !fields.slug){ alert('Title and slug are required.'); return; }
  fields.status = status;
  fields.updated_at = new Date().toISOString();
  if(status==='published') fields.published_at = new Date().toISOString();

  let error;
  if(editingPostId){
    ({error} = await sb.from('posts').update(fields).eq('id', editingPostId));
  } else {
    const {data, error: insertError} = await sb.from('posts').insert(fields).select();
    error = insertError;
    if(data && data[0]) editingPostId = data[0].id;
  }
  if(error){ alert(error.message); return; }
  await loadBlogList();
  closeEditor();
}
document.getElementById('post-save-draft-btn').addEventListener('click', ()=>savePost('draft'));
document.getElementById('post-publish-btn').addEventListener('click', ()=>savePost('published'));
document.getElementById('post-delete-btn').addEventListener('click', async ()=>{
  if(!editingPostId) return;
  if(!confirm('Delete this post permanently?')) return;
  const {error} = await sb.from('posts').delete().eq('id', editingPostId);
  if(error){ alert(error.message); return; }
  await loadBlogList();
  closeEditor();
});

// ---- SEO & readability scorer ----
// Strips Markdown syntax and HTML tags so word/phrase counts reflect what a
// reader (and a search engine) actually sees, not the markup.
function toPlainText(body){
  return String(body||'')
    .replace(/<[^>]+>/g, ' ')
    .replace(/!\[[^\]]*\]\([^)]*\)/g, ' ')
    .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/[#*_>`~]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}
function countOccurrences(haystack, needle){
  if(!needle) return 0;
  let count = 0, pos = 0;
  while((pos = haystack.indexOf(needle, pos)) !== -1){ count++; pos += needle.length; }
  return count;
}
const AI_TELL_PHRASES = [
  "delve into", "in today's fast-paced world", "it's important to note",
  "moreover,", "furthermore,", "unleash", "unlock the power", "in conclusion,",
  "navigating the", "a testament to", "plays a crucial role", "left an indelible mark",
  "stands as a", "in the realm of", "when it comes to", "it is worth noting",
];

function analyzePost(fields){
  const checks = [];
  const plain = toPlainText(fields.body);
  const plainLower = plain.toLowerCase();

  // Title
  const titleLen = fields.title.length;
  if(titleLen===0) checks.push({level:'error', msg:'Title is empty.'});
  else if(titleLen<30 || titleLen>65) checks.push({level:'warn', msg:`Title is ${titleLen} characters. Aim for 30 to 65 so it doesn't get cut off in search results.`});
  else checks.push({level:'ok', msg:'Title length looks good.'});

  // Meta description
  const metaLen = fields.meta_description.length;
  if(metaLen===0) checks.push({level:'error', msg:'Meta description is empty.'});
  else if(metaLen<120 || metaLen>160) checks.push({level:'warn', msg:`Meta description is ${metaLen} characters. Aim for 120 to 160.`});
  else checks.push({level:'ok', msg:'Meta description length looks good.'});

  // Focus keyphrase
  if(!fields.focus_keyphrase){
    checks.push({level:'warn', msg:'No focus keyphrase set.'});
  } else {
    const kp = fields.focus_keyphrase.toLowerCase();
    const count = countOccurrences(plainLower, kp);
    if(count===0) checks.push({level:'error', msg:`Focus keyphrase "${fields.focus_keyphrase}" does not appear in the body.`});
    else if(count===1) checks.push({level:'warn', msg:'Focus keyphrase appears only once. Consider using it 2 to 4 times.'});
    else if(count>8) checks.push({level:'warn', msg:`Focus keyphrase appears ${count} times. That may read as keyword stuffing.`});
    else checks.push({level:'ok', msg:`Focus keyphrase appears ${count} times.`});
    if(fields.title && !fields.title.toLowerCase().includes(kp)) checks.push({level:'warn', msg:'Focus keyphrase is missing from the title.'});
  }

  // Related keywords
  if(fields.related_keywords){
    const keywords = fields.related_keywords.split(',').map(k=>k.trim()).filter(Boolean);
    const missing = keywords.filter(k => !plainLower.includes(k.toLowerCase()));
    if(missing.length) checks.push({level:'warn', msg:`Related keywords not found in body: ${missing.join(', ')}`});
    else if(keywords.length) checks.push({level:'ok', msg:'All related keywords appear in the body.'});
  }

  // Em dashes
  const emDashCount = (fields.body.match(/—/g)||[]).length;
  if(emDashCount>0) checks.push({level:'warn', msg:`Found ${emDashCount} em dash${emDashCount===1?'':'es'}. Often reads as AI-written; consider a period or comma instead.`});
  else checks.push({level:'ok', msg:'No em dashes.'});

  // AI-tell phrases
  const foundPhrases = AI_TELL_PHRASES.filter(p => plainLower.includes(p));
  if(foundPhrases.length) checks.push({level:'warn', msg:`Phrases that read as AI-generated: ${foundPhrases.join(', ')}`});
  else checks.push({level:'ok', msg:'No common AI-tell phrases found.'});

  // Paragraph length (roughly 3 to 4 lines ~ 480 characters)
  const paragraphs = fields.body.split(/\n\s*\n/).map(p=>p.trim()).filter(p => p && !p.startsWith('#'));
  const longParas = paragraphs.filter(p => p.replace(/\s+/g,' ').length > 480);
  if(longParas.length) checks.push({level:'warn', msg:`${longParas.length} paragraph${longParas.length===1?'':'s'} run longer than 3 to 4 lines. Consider breaking them up.`});
  else if(paragraphs.length) checks.push({level:'ok', msg:'Paragraph lengths look good.'});

  // Section length (content between headings)
  const sections = fields.body.split(/\n#{1,3}\s+/).slice(1);
  const longSections = sections.filter(s => toPlainText(s).split(/\s+/).filter(Boolean).length > 250);
  if(longSections.length) checks.push({level:'warn', msg:`${longSections.length} section${longSections.length===1?'':'s'} run long without a subheading break.`});
  else if(sections.length) checks.push({level:'ok', msg:'Section lengths look good.'});

  // Links and images
  const internalLinks = (fields.body.match(/(?<!!)\[[^\]]*\]\(\/[^)]*\)/g)||[]).length + (fields.body.match(/href=["']\/(?!\/)[^"']*/g)||[]).length;
  const externalLinks = (fields.body.match(/(?<!!)\[[^\]]*\]\(https?:\/\/[^)]*\)/g)||[]).length + (fields.body.match(/href=["']https?:\/\/[^"']*/g)||[]).length;
  const images = (fields.body.match(/!\[[^\]]*\]\([^)]*\)/g)||[]).length + (fields.body.match(/<img[\s>]/g)||[]).length;
  checks.push(internalLinks===0 ? {level:'warn', msg:'No internal links found.'} : {level:'ok', msg:`${internalLinks} internal link${internalLinks===1?'':'s'} found.`});
  checks.push(externalLinks===0 ? {level:'warn', msg:'No external links found.'} : {level:'ok', msg:`${externalLinks} external link${externalLinks===1?'':'s'} found.`});
  checks.push(images===0 ? {level:'warn', msg:'No images found.'} : {level:'ok', msg:`${images} image${images===1?'':'s'} found.`});

  // Stray head-level tags pasted into the body
  if(/<head[\s>]|<title[\s>]|<meta\s/i.test(fields.body)){
    checks.push({level:'error', msg:'Body contains head/title/meta tags. Those belong in the dedicated fields above, not the post body, and will not render correctly inline.'});
  }

  // Word count, informational
  const wordCount = plain.split(/\s+/).filter(Boolean).length;
  checks.push({level:'info', msg:`${wordCount} words.`});

  return checks;
}

function runSeoCheck(){
  const fields = collectPostFields();
  const checks = analyzePost(fields);
  const errors = checks.filter(c=>c.level==='error').length;
  const warns = checks.filter(c=>c.level==='warn').length;
  const oks = checks.filter(c=>c.level==='ok').length;
  document.getElementById('seo-summary').textContent = `${oks} good, ${warns} to review, ${errors} missing`;
  document.getElementById('seo-checks').innerHTML = checks.map(c=>{
    const color = c.level==='error' ? 'var(--danger)' : c.level==='warn' ? 'var(--terracotta)' : c.level==='ok' ? 'var(--positive)' : 'var(--muted)';
    return `<div class="entry-note" style="color:${color};">${esc(c.msg)}</div>`;
  }).join('');
}

checkSession();
