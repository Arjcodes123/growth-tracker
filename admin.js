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
  if(!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(fields.slug)){ alert('Slug must be lowercase letters, numbers, and hyphens only (e.g. my-post-title).'); return; }
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
// Ported from a reusable analysis-engine kit (12-point SEO/AEO checklist +
// scored readability check, 0-100 each) built for a Next.js/Prisma project.
// The scoring rules and thresholds are kept faithful to that spec; only the
// extraction layer changes, since posts here are stored as raw Markdown
// (with inline HTML allowed) rather than editor-generated HTML -- so
// "extract headings/paragraphs/links/images" reads Markdown syntax (and the
// occasional raw tag) via regex instead of parsing <p>/<h2>/<a>/<img> tags.

const SEO_THRESHOLDS = {
  minKeyphraseOccurrences: 2, minKeyphraseDensity: 0.5, maxKeyphraseDensity: 3.0,
  minContentWords: 300, metaDescMin: 120, metaDescMax: 156, titleMin: 40, titleMax: 60,
};
const READABILITY_THRESHOLDS = { paragraphMaxWords: 55, sectionMaxWords: 300, minContentWords: 300 };

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
function wordCount(text){ const t = text.trim(); return t ? t.split(/\s+/).length : 0; }
function countOccurrences(haystack, needle){
  if(!needle) return 0;
  let count = 0, pos = 0;
  while((pos = haystack.indexOf(needle, pos)) !== -1){ count++; pos += needle.length; }
  return count;
}
function hasPhrase(text, phrase){ return phrase.length>0 && text.toLowerCase().includes(phrase.toLowerCase()); }

// Markdown-aware equivalents of the kit's HTML extractors.
function extractParagraphs(body){
  return String(body||'').split(/\n\s*\n/).map(p=>p.trim())
    .filter(p => p && !p.startsWith('#'))
    .map((text,index) => ({ index, text: toPlainText(text), words: wordCount(toPlainText(text)) }));
}
function extractHeadings(body){
  return [...String(body||'').matchAll(/^(#{1,6})\s+(.*)$/gm)]
    .map(m => ({ level: m[1].length, text: m[2].trim() }));
}
function extractSections(body){
  const parts = String(body||'').split(/\n#{2,3}\s+/);
  const headingMatches = [...String(body||'').matchAll(/\n#{2,3}\s+([^\n]*)/g)].map(m=>m[1].trim());
  return parts.map((chunk,i) => ({ heading: i===0 ? null : (headingMatches[i-1]||null), words: wordCount(toPlainText(chunk)) }));
}
function extractLinks(body){
  const internal = (body.match(/(?<!!)\[[^\]]*\]\(\/[^)]*\)/g)||[]).length + (body.match(/href=["']\/(?!\/)[^"']*/g)||[]).length;
  const external = (body.match(/(?<!!)\[[^\]]*\]\(https?:\/\/[^)]*\)/g)||[]).length + (body.match(/href=["']https?:\/\/[^"']*/g)||[]).length;
  return { internal, external };
}
function extractImages(body){
  const mdImages = [...String(body||'').matchAll(/!\[([^\]]*)\]\([^)]*\)/g)].map(m => ({ hasAlt: m[1].trim().length>0 }));
  const rawImages = [...String(body||'').matchAll(/<img\b[^>]*>/gi)].map(tag => {
    const altMatch = tag[0].match(/alt=["']([^"']*)["']/i);
    return { hasAlt: !!(altMatch && altMatch[1].trim().length>0) };
  });
  const all = [...mdImages, ...rawImages];
  return { count: all.length, missingAlt: all.filter(i=>!i.hasAlt).length };
}

const AI_CLICHE_PHRASES = [
  "in today's fast-paced world", "in today's digital age", "in the ever-evolving landscape",
  "in the ever-changing landscape", "in the realm of", "delve into", "delving into", "dive into",
  "diving into", "let's dive in", "unlock the power of", "unleash the power of", "elevate your",
  "game changer", "game-changer", "it's important to note that", "it is important to note that",
  "moreover,", "furthermore,", "in conclusion,", "to sum up,", "in summary,", "navigating the",
  "testament to", "a testament to", "tapestry of", "rich tapestry", "vibrant tapestry",
  "unwavering commitment", "plethora of", "myriad of", "seamless", "seamlessly", "robust",
  "cutting-edge", "state-of-the-art", "leverage", "leveraging", "harness the power of",
  "at the end of the day", "when it comes to", "in a world where", "boasts", "stands as a testament",
  "whether you're", "look no further", "buckle up", "the world of", "as an ai language model",
  "revolutionize", "revolutionizing", "transformative", "holistic approach", "synergy", "synergize",
  "paradigm shift", "unparalleled", "top-notch", "in this article, we", "in this blog post, we",
  "without further ado",
];

// 12-point SEO/AEO checklist, 0-100 score built from points-earned /
// points-available across all checks (not a flat pass/fail count).
function analyzeSeo(fields){
  const T = SEO_THRESHOLDS;
  const plain = toPlainText(fields.body);
  const bodyWords = wordCount(plain);
  const kp = fields.focus_keyphrase.trim();
  const kpLower = kp.toLowerCase();
  const plainLower = plain.toLowerCase();

  const keyphraseCount = kp ? countOccurrences(plainLower, kpLower) : 0;
  const keyphraseDensity = bodyWords>0 ? (keyphraseCount/bodyWords)*100 : 0;
  const keyphraseCountMet = keyphraseCount >= T.minKeyphraseOccurrences && keyphraseDensity >= T.minKeyphraseDensity;

  const paragraphs = extractParagraphs(fields.body);
  const firstParagraph = paragraphs[0]?.text || '';
  const subheadings = extractHeadings(fields.body).filter(h => h.level>=2);
  const links = extractLinks(fields.body);
  const images = extractImages(fields.body);

  const checks = [];
  const push = (id, level, msg, points, maxPoints) => checks.push({id, level, msg, points, maxPoints});

  if(!kp) push('kp-set','error','No focus keyphrase set. Add one to unlock the rest of the SEO checklist.',0,5);
  else push('kp-set','ok',`Focus keyphrase: "${kp}"`,5,5);

  if(kp && hasPhrase(fields.title, kp)) push('kp-title','ok','Focus keyphrase found in the title.',10,10);
  else push('kp-title', kp?'error':'warn', 'Focus keyphrase is missing from the title.',0,10);

  if(kp && hasPhrase(fields.slug.replace(/-/g,' '), kp)) push('kp-slug','ok','Focus keyphrase found in the URL slug.',8,8);
  else push('kp-slug','warn','Focus keyphrase is missing from the URL slug.',0,8);

  if(kp && hasPhrase(firstParagraph, kp)) push('kp-intro','ok','Focus keyphrase appears early, in the first paragraph.',10,10);
  else push('kp-intro', kp?'error':'warn', "Focus keyphrase doesn't appear in the first paragraph.",0,10);

  const kpInHeading = kp && subheadings.some(h => hasPhrase(h.text, kp));
  if(kpInHeading) push('kp-heading','ok','Focus keyphrase found in a subheading.',8,8);
  else push('kp-heading','warn',"Focus keyphrase doesn't appear in any H2/H3 subheading.",0,8);

  if(!kp) push('kp-density','warn','Set a focus keyphrase to check density.',0,12);
  else if(keyphraseCount===0) push('kp-density','error',"Focus keyphrase doesn't appear in the body content at all.",0,12);
  else if(keyphraseDensity < T.minKeyphraseDensity) push('kp-density','warn',`Keyphrase density is ${keyphraseDensity.toFixed(2)}% (${keyphraseCount}×), a little low. Aim for ${T.minKeyphraseDensity} to ${T.maxKeyphraseDensity}%.`,6,12);
  else if(keyphraseDensity > T.maxKeyphraseDensity) push('kp-density','error',`Keyphrase density is ${keyphraseDensity.toFixed(2)}% (${keyphraseCount}×), too high. Reads as keyword stuffing.`,4,12);
  else push('kp-density','ok',`Keyphrase density is ${keyphraseDensity.toFixed(2)}% (${keyphraseCount}×). Healthy range.`,12,12);

  if(!fields.meta_description){
    push('meta-desc','warn', keyphraseCountMet ? "No meta description yet. You've used the keyphrase enough times, go ahead and write one." : `Meta description is locked until the focus keyphrase appears at least ${T.minKeyphraseOccurrences}× at healthy density.`, 0, 12);
  } else {
    const len = fields.meta_description.length;
    const containsKp = kp && hasPhrase(fields.meta_description, kp);
    if(!containsKp) push('meta-desc','warn',"Meta description doesn't contain the focus keyphrase.",5,12);
    else if(len < T.metaDescMin || len > T.metaDescMax) push('meta-desc','warn',`Meta description is ${len} characters. Aim for ${T.metaDescMin}-${T.metaDescMax}.`,8,12);
    else push('meta-desc','ok',`Meta description looks good (${len} characters, includes keyphrase).`,12,12);
  }

  const titleLen = fields.title.length;
  if(titleLen < T.titleMin || titleLen > T.titleMax) push('title-length','warn',`Title is ${titleLen} characters. Aim for ${T.titleMin}-${T.titleMax} so it doesn't get cut off in search results.`,4,8);
  else push('title-length','ok',`Title length is good (${titleLen} characters).`,8,8);

  if(links.internal>0) push('internal-links','ok',`${links.internal} internal link${links.internal===1?'':'s'} found.`,10,10);
  else push('internal-links','error','No internal links. Link to at least one other page on the site.',0,10);

  if(links.external>0) push('external-links','ok',`${links.external} external link${links.external===1?'':'s'} found.`,8,8);
  else push('external-links','warn','No external links. Linking to a reputable source can help credibility.',0,8);

  if(images.count===0) push('images','error','No images in this post. Add at least one.',0,9);
  else if(images.missingAlt>0) push('images','warn',`${images.count} image${images.count===1?'':'s'} found, but ${images.missingAlt} missing alt text.`,5,9);
  else push('images','ok',`${images.count} image${images.count===1?'':'s'}, all with alt text.`,9,9);

  if(bodyWords < T.minContentWords) push('length','warn',`${bodyWords} words. Under ${T.minContentWords} is thin for competitive ranking.`,4,8);
  else push('length','ok',`${bodyWords} words, solid length for SEO.`,8,8);

  // Related keywords: informational occurrence counts, no pass/fail gate.
  const relatedResults = fields.related_keywords.split(',').map(k=>k.trim()).filter(Boolean)
    .map(keyword => ({ keyword, count: countOccurrences(plainLower, keyword.toLowerCase()) }));
  if(relatedResults.length){
    const summary = relatedResults.map(r => `"${r.keyword}" (${r.count}×)`).join(', ');
    push('related', relatedResults.every(r=>r.count>0) ? 'ok' : 'warn', `Related keywords: ${summary}`, 0, 0);
  }

  const earned = checks.reduce((s,c)=>s+c.points,0);
  const total = checks.reduce((s,c)=>s+c.maxPoints,0);
  return { score: total>0 ? Math.round((earned/total)*100) : 0, keyphraseCountMet, checks };
}

// Scored readability check: starts at 100, deducts per offending instance
// (capped per category so one wild paragraph can't zero the score).
function analyzeReadability(fields){
  const T = READABILITY_THRESHOLDS;
  const plain = toPlainText(fields.body);
  const words = wordCount(plain);
  const plainLower = plain.toLowerCase();
  const issues = [];

  const emDashCount = (fields.body.match(/—/g)||[]).length + (fields.body.match(/&mdash;/g)||[]).length;
  issues.push(emDashCount>0
    ? {level: emDashCount>3?'error':'warn', msg:`${emDashCount} em dash${emDashCount===1?'':'es'} found. Often a tell for AI-written text, consider a period, comma, or parentheses instead.`}
    : {level:'ok', msg:'No em dashes found.'});

  const aiMatches = AI_CLICHE_PHRASES.map(p => ({phrase:p, count: countOccurrences(plainLower, p)})).filter(m=>m.count>0);
  const totalAiPhrases = aiMatches.reduce((s,m)=>s+m.count,0);
  if(totalAiPhrases>0){
    const preview = aiMatches.slice(0,5).map(m => `"${m.phrase}"${m.count>1?` (×${m.count})`:''}`).join(', ');
    issues.push({level: totalAiPhrases>4?'error':'warn', msg:`${totalAiPhrases} AI-cliché phrase${totalAiPhrases===1?'':'s'} found: ${preview}${aiMatches.length>5?'…':''}`});
  } else {
    issues.push({level:'ok', msg:'No stock AI phrases detected.'});
  }

  const paragraphs = extractParagraphs(fields.body);
  const longParagraphs = paragraphs.filter(p => p.words > T.paragraphMaxWords);
  if(longParagraphs.length){
    issues.push({level: longParagraphs.length>2?'error':'warn', msg:`${longParagraphs.length} paragraph${longParagraphs.length===1?'':'s'} run longer than ~3-4 lines (paragraph ${longParagraphs.map(p=>`#${p.index+1}`).join(', ')}). Break them up for scannability.`});
  } else if(paragraphs.length){
    issues.push({level:'ok', msg:'Paragraph lengths look scannable.'});
  }

  const sections = extractSections(fields.body);
  const longSections = sections.filter(s => s.words > T.sectionMaxWords);
  if(longSections.length){
    issues.push({level:'warn', msg:`${longSections.length} section${longSections.length===1?'':'s'} run past ${T.sectionMaxWords} words without a subheading (${longSections.map(s=>`"${s.heading||'intro'}": ${s.words}w`).join(', ')}). Consider adding an H2/H3 to break it up.`});
  } else if(sections.length){
    issues.push({level:'ok', msg:'Sections are well broken up with subheadings.'});
  }

  if(words < T.minContentWords) issues.push({level:'warn', msg:`Only ${words} words so far. Under ${T.minContentWords} words is thin for a ranking-focused article.`});
  else issues.push({level:'ok', msg:`${words} words, solid length.`});

  if(/<head[\s>]|<title[\s>]|<meta\s/i.test(fields.body)){
    issues.push({level:'error', msg:'Body contains head/title/meta tags. Those belong in the dedicated fields above, not the post body, and will not render correctly inline.'});
  }

  let score = 100;
  score -= Math.min(emDashCount,8)*3;
  score -= Math.min(totalAiPhrases,10)*4;
  score -= Math.min(longParagraphs.length,6)*5;
  score -= Math.min(longSections.length,5)*6;
  if(words < T.minContentWords) score -= 15;
  score = Math.max(0, Math.min(100, Math.round(score)));

  return { score, issues };
}

function levelColor(level){
  return level==='error' ? 'var(--danger)' : level==='warn' ? 'var(--terracotta)' : level==='ok' ? 'var(--positive)' : 'var(--muted)';
}
function renderChecklist(containerId, items){
  document.getElementById(containerId).innerHTML = items.map(c=>
    `<div class="entry-note" style="color:${levelColor(c.level)};">${esc(c.msg)}</div>`
  ).join('');
}
function runSeoCheck(){
  const fields = collectPostFields();
  const seo = analyzeSeo(fields);
  const readability = analyzeReadability(fields);

  document.getElementById('seo-score').textContent = `${seo.score}/100`;
  renderChecklist('seo-checks', seo.checks);

  document.getElementById('readability-score').textContent = `${readability.score}/100`;
  renderChecklist('readability-checks', readability.issues);

  // Meta description gate: locked only while empty and the keyphrase hasn't
  // earned it yet, so editing an existing description is never blocked --
  // per the kit's spec, this is a UI nudge, never a save blocker.
  const metaField = document.getElementById('post-meta-description');
  metaField.disabled = !seo.keyphraseCountMet && !fields.meta_description;
  metaField.title = metaField.disabled ? `Add your focus keyphrase at least ${SEO_THRESHOLDS.minKeyphraseOccurrences} times in the body first.` : '';
}

checkSession();
