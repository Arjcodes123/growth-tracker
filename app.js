// ---- backend config ----
// This app ships with one shared Supabase project. Every visitor signs in with
// their own Google account; row-level security (see schema.sql) keeps each
// person's rows visible only to them. The anon key below is meant to be public.
const SUPABASE_URL = 'https://olfbcqtinzbhxvwipedb.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_Xk_aSrS3MnKtIoEUUc0uJw_5JUl1IiI';

let sb = null;
let user = null;

// Trackers that share the "date + one label field + one numeric field + notes" shape.
const SIMPLE_TRACKERS = [
  { key:'gym', table:'gym_logs', prefix:'g', fieldCol:'workout_type', numCol:'duration_min', numLabel:'min', titleFallback:'Workout' },
  { key:'study', table:'study_logs', prefix:'s', fieldCol:'subject', numCol:'minutes', numLabel:'min', titleFallback:'Study' },
  { key:'diet', table:'diet_logs', prefix:'d', fieldCol:'meal', numCol:'calories', numLabel:'cal', titleFallback:'Meal' },
];

// Trackers that share the "date + optional title + freeform content" shape.
const CONTENT_TRACKERS = [
  { key:'journal', table:'journal_entries', prefix:'j', hasTitle:true, titleFallback:'(untitled)', dashboard:false },
  { key:'gratitude', table:'gratitude_entries', prefix:'gr', hasTitle:false, titleFallback:'Gratitude', dashboard:true },
];

function esc(s){
  return String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
}
function flash(msg, isErr){
  const f = document.getElementById('flash');
  f.textContent = msg; f.className = 'flash' + (isErr ? ' err' : '');
  f.style.display='block';
  setTimeout(()=>f.style.display='none', 2500);
}
function show(id, disp){ document.getElementById(id).style.display = disp; }

// ---- auth ----
sb = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true }
});

document.getElementById('google-signin').addEventListener('click', async ()=>{
  const { error } = await sb.auth.signInWithOAuth({
    provider: 'google',
    options: { redirectTo: window.location.origin + window.location.pathname }
  });
  if(error) flash(error.message, true);
});
document.getElementById('signout-btn').addEventListener('click', async ()=>{
  await sb.auth.signOut();
  location.reload();
});

async function checkSession(){
  const {data} = await sb.auth.getSession();
  if(data.session){ user = data.session.user; onLoggedIn(); }
  else { show('screen-auth','block'); }
}
sb.auth.onAuthStateChange((event, session)=>{
  if(session && !user){ user = session.user; onLoggedIn(); }
  if(event === 'SIGNED_OUT'){ user = null; }
});

function onLoggedIn(){
  history.replaceState(null, '', window.location.pathname);
  show('screen-auth','none');
  show('topbar','flex');
  document.getElementById('whoami').textContent = user.email;
  document.getElementById('subline').style.display='none';
  document.getElementById('app').style.display='block';
  ['r-date','g-date','s-date','d-date','j-date','gr-date','f-date'].forEach(id=>{ document.getElementById(id).valueAsDate = new Date(); });
  if(document.getElementById('r-words').children.length === 0) addWordRow();
  renderAll();
}

// ---- tabs ----
document.querySelectorAll('.tab').forEach(t=>{
  t.addEventListener('click', ()=>{
    document.querySelectorAll('.tab').forEach(x=>x.classList.remove('active'));
    document.querySelectorAll('.panel').forEach(x=>x.classList.remove('active'));
    t.classList.add('active');
    document.getElementById('panel-'+t.dataset.tab).classList.add('active');
    renderAll();
  });
});

// ---- generic helpers ----
async function fetchAll(table){
  const {data,error} = await sb.from(table).select('*').order('date',{ascending:false});
  if(error){ flash(error.message, true); return []; }
  return data;
}
async function insertRow(table,row){
  row.user_id = user.id;
  const {data,error} = await sb.from(table).insert(row).select();
  if(error){ flash(error.message, true); return null; }
  return data[0];
}
async function deleteRow(table,id){
  const {error} = await sb.from(table).delete().eq('id',id);
  if(error){ flash(error.message, true); return; }
  renderAll();
}
function listHtml(rows, table, renderItem){
  if(rows.length===0) return '<div class="empty">No entries yet.</div>';
  return rows.map(e => `
    <div class="entry">
      ${renderItem(e)}
      <div style="margin-top:8px;"><button class="btn secondary small del" data-table="${table}" data-id="${e.id}">Delete</button></div>
    </div>`).join('');
}
function bindDeletes(container){
  container.querySelectorAll('.del').forEach(btn=>{
    btn.addEventListener('click', ()=>deleteRow(btn.dataset.table, btn.dataset.id));
  });
}

// ---- custom fields (shared by every tracker) ----
function addCustomFieldRow(container, label='', value=''){
  const div = document.createElement('div');
  div.className='word-row';
  const labelInput = document.createElement('input');
  labelInput.type='text'; labelInput.className='cf-label'; labelInput.placeholder='field name'; labelInput.value=label;
  const valueInput = document.createElement('input');
  valueInput.type='text'; valueInput.className='cf-value'; valueInput.placeholder='value'; valueInput.value=value;
  const rm = document.createElement('button');
  rm.className='btn secondary small rm'; rm.textContent='Remove';
  rm.addEventListener('click', ()=>div.remove());
  div.append(labelInput, valueInput, rm);
  container.appendChild(div);
}
function collectCustomFields(container){
  const obj = {};
  container.querySelectorAll('.word-row').forEach(row=>{
    const label = row.querySelector('.cf-label').value.trim();
    const value = row.querySelector('.cf-value').value.trim();
    if(label) obj[label] = value;
  });
  return obj;
}
function renderCustomFields(obj){
  if(!obj || Object.keys(obj).length===0) return '';
  return Object.entries(obj).map(([k,v])=>`<span class="tag">${esc(k)}: ${esc(v)}</span>`).join('');
}

// ---- reading ----
function addWordRow(word='',meaning=''){
  const div = document.createElement('div');
  div.className='word-row';
  const wInput = document.createElement('input');
  wInput.type='text'; wInput.className='w-word'; wInput.placeholder='word'; wInput.value=word;
  const mInput = document.createElement('input');
  mInput.type='text'; mInput.className='w-meaning'; mInput.placeholder='meaning'; mInput.value=meaning;
  const rm = document.createElement('button');
  rm.className='btn secondary small rm'; rm.textContent='Remove';
  rm.addEventListener('click', ()=>div.remove());
  div.append(wInput, mInput, rm);
  document.getElementById('r-words').appendChild(div);
}
document.getElementById('r-addword').addEventListener('click', ()=>addWordRow());
document.getElementById('r-addfield').addEventListener('click', ()=>addCustomFieldRow(document.getElementById('r-fields')));

document.getElementById('r-save').addEventListener('click', async ()=>{
  const date = document.getElementById('r-date').value;
  const book = document.getElementById('r-book').value.trim();
  const minutes = parseFloat(document.getElementById('r-minutes').value)||0;
  const learning = document.getElementById('r-learning').value.trim();
  const custom_fields = collectCustomFields(document.getElementById('r-fields'));
  const words = [...document.querySelectorAll('#r-words .word-row')].map(r=>({
    word: r.querySelector('.w-word').value.trim(), meaning: r.querySelector('.w-meaning').value.trim()
  })).filter(w=>w.word);
  if(!date){ flash('Pick a date.', true); return; }
  const entry = await insertRow('reading_entries', {date, book, minutes, learning, custom_fields});
  if(!entry) return;
  for(const w of words){ await insertRow('words', {date, word:w.word, meaning:w.meaning, reading_entry_id: entry.id}); }
  flash('Saved.');
  document.getElementById('r-book').value=''; document.getElementById('r-minutes').value='';
  document.getElementById('r-learning').value=''; document.getElementById('r-words').innerHTML='';
  document.getElementById('r-fields').innerHTML='';
  addWordRow();
  renderAll();
});

function renderReading(){
  const el = document.getElementById('r-list');
  el.innerHTML = listHtml(cache.reading, 'reading_entries', e=>`
    <div class="entry-head"><span class="entry-title">${esc(e.book)||'(no book)'}</span><span>${esc(e.date)} &middot; ${esc(e.minutes)||0} min</span></div>
    ${e.learning?`<div class="entry-note">${esc(e.learning)}</div>`:''}
    ${cache.words.filter(w=>w.reading_entry_id===e.id).map(w=>`<span class="tag">${esc(w.word)}</span>`).join('')}
    ${renderCustomFields(e.custom_fields)}
  `);
  bindDeletes(el);
}

// ---- simple trackers: gym, study, diet ----
function wireSimpleTracker(cfg){
  document.getElementById(cfg.prefix+'-addfield').addEventListener('click', ()=>addCustomFieldRow(document.getElementById(cfg.prefix+'-fields')));
  document.getElementById(cfg.prefix+'-save').addEventListener('click', async ()=>{
    const date = document.getElementById(cfg.prefix+'-date').value;
    const fieldVal = document.getElementById(cfg.prefix+'-field').value.trim();
    const numVal = parseFloat(document.getElementById(cfg.prefix+'-num').value)||0;
    const notes = document.getElementById(cfg.prefix+'-notes').value.trim();
    const custom_fields = collectCustomFields(document.getElementById(cfg.prefix+'-fields'));
    if(!date){ flash('Pick a date.', true); return; }
    const row = { date, notes, custom_fields };
    row[cfg.fieldCol] = fieldVal;
    row[cfg.numCol] = numVal;
    const r = await insertRow(cfg.table, row);
    if(!r) return;
    flash('Saved.');
    document.getElementById(cfg.prefix+'-field').value='';
    document.getElementById(cfg.prefix+'-num').value='';
    document.getElementById(cfg.prefix+'-notes').value='';
    document.getElementById(cfg.prefix+'-fields').innerHTML='';
    renderAll();
  });
}
function renderSimpleTracker(cfg){
  const el = document.getElementById(cfg.prefix+'-list');
  el.innerHTML = listHtml(cache[cfg.key], cfg.table, e=>`
    <div class="entry-head"><span class="entry-title">${esc(e[cfg.fieldCol])||cfg.titleFallback}</span><span>${esc(e.date)} &middot; ${esc(e[cfg.numCol])||0} ${cfg.numLabel}</span></div>
    ${e.notes?`<div class="entry-note">${esc(e.notes)}</div>`:''}
    ${renderCustomFields(e.custom_fields)}
  `);
  bindDeletes(el);
}
SIMPLE_TRACKERS.forEach(wireSimpleTracker);

// ---- content trackers: journal, gratitude ----
function wireContentTracker(cfg){
  document.getElementById(cfg.prefix+'-addfield').addEventListener('click', ()=>addCustomFieldRow(document.getElementById(cfg.prefix+'-fields')));
  document.getElementById(cfg.prefix+'-save').addEventListener('click', async ()=>{
    const date = document.getElementById(cfg.prefix+'-date').value;
    const content = document.getElementById(cfg.prefix+'-content').value.trim();
    const custom_fields = collectCustomFields(document.getElementById(cfg.prefix+'-fields'));
    if(!date || !content){ flash('Write something first.', true); return; }
    const row = { date, content, custom_fields };
    if(cfg.hasTitle) row.title = document.getElementById(cfg.prefix+'-title').value.trim();
    const r = await insertRow(cfg.table, row);
    if(!r) return;
    flash('Saved.');
    if(cfg.hasTitle) document.getElementById(cfg.prefix+'-title').value='';
    document.getElementById(cfg.prefix+'-content').value='';
    document.getElementById(cfg.prefix+'-fields').innerHTML='';
    renderAll();
  });
}
function renderContentTracker(cfg){
  const el = document.getElementById(cfg.prefix+'-list');
  el.innerHTML = listHtml(cache[cfg.key], cfg.table, e=>`
    <div class="entry-head">${cfg.hasTitle ? `<span class="entry-title">${esc(e.title)||cfg.titleFallback}</span>` : '<span></span>'}<span>${esc(e.date)}</span></div>
    <div class="entry-note">${esc(e.content)}</div>
    ${renderCustomFields(e.custom_fields)}
  `);
  bindDeletes(el);
}
CONTENT_TRACKERS.forEach(wireContentTracker);

// ---- finance ----
document.getElementById('f-addfield').addEventListener('click', ()=>addCustomFieldRow(document.getElementById('f-fields')));
document.getElementById('f-save').addEventListener('click', async ()=>{
  const date = document.getElementById('f-date').value;
  const type = document.getElementById('f-type').value;
  const category = document.getElementById('f-category').value.trim();
  const amount = parseFloat(document.getElementById('f-amount').value)||0;
  const notes = document.getElementById('f-notes').value.trim();
  const custom_fields = collectCustomFields(document.getElementById('f-fields'));
  if(!date){ flash('Pick a date.', true); return; }
  const r = await insertRow('finance_entries', {date, type, category, amount, notes, custom_fields});
  if(!r) return;
  flash('Saved.');
  document.getElementById('f-category').value=''; document.getElementById('f-amount').value='';
  document.getElementById('f-notes').value=''; document.getElementById('f-fields').innerHTML='';
  renderAll();
});
function renderFinance(){
  const el = document.getElementById('f-list');
  el.innerHTML = listHtml(cache.finance, 'finance_entries', e=>`
    <div class="entry-head"><span class="entry-title">${esc(e.category)||(e.type==='income'?'Income':'Expense')}</span><span>${esc(e.date)} &middot; ${e.type==='income'?'+':'-'}${esc(e.amount)||0}</span></div>
    ${e.notes?`<div class="entry-note">${esc(e.notes)}</div>`:''}
    ${renderCustomFields(e.custom_fields)}
  `);
  bindDeletes(el);
}

// ---- vocab ----
document.getElementById('vocab-search').addEventListener('input', e=>renderVocab(e.target.value));
function renderVocab(filter=''){
  const words = cache.words.filter(w =>
    (w.word||'').toLowerCase().includes(filter.toLowerCase()) || (w.meaning||'').toLowerCase().includes(filter.toLowerCase())
  );
  const el = document.getElementById('vocab-list');
  if(words.length===0){ el.innerHTML = '<div class="empty">No words yet.</div>'; return; }
  el.innerHTML = words.map(w => `
    <div class="entry"><div class="entry-head"><span class="entry-title">${esc(w.word)}</span><span>${esc(w.date)}</span></div>
    <div class="entry-note">${esc(w.meaning)}</div></div>`).join('');
}

// ---- render orchestration ----
let cache = { reading:[], gym:[], study:[], diet:[], journal:[], gratitude:[], finance:[], words:[] };

async function renderAll(){
  const activeTab = document.querySelector('.tab.active')?.dataset.tab;

  if(activeTab==='reading' || activeTab==='dashboard' || activeTab==='vocab'){
    cache.reading = await fetchAll('reading_entries');
    cache.words = await fetchAll('words');
  }
  for(const cfg of SIMPLE_TRACKERS){
    if(activeTab===cfg.key || activeTab==='dashboard') cache[cfg.key] = await fetchAll(cfg.table);
  }
  for(const cfg of CONTENT_TRACKERS){
    if(activeTab===cfg.key || (cfg.dashboard && activeTab==='dashboard')) cache[cfg.key] = await fetchAll(cfg.table);
  }
  if(activeTab==='finance' || activeTab==='dashboard') cache.finance = await fetchAll('finance_entries');

  if(activeTab==='reading') renderReading();
  for(const cfg of SIMPLE_TRACKERS){ if(activeTab===cfg.key) renderSimpleTracker(cfg); }
  for(const cfg of CONTENT_TRACKERS){ if(activeTab===cfg.key) renderContentTracker(cfg); }
  if(activeTab==='finance') renderFinance();
  if(activeTab==='vocab') renderVocab(document.getElementById('vocab-search').value);
  if(activeTab==='dashboard') renderDashboard();
}

// ---- dashboard ----
let charts = {};
function dateStr(d){ return d.toISOString().slice(0,10); }
function lastNDates(n){ const arr=[]; const t=new Date(); for(let i=n-1;i>=0;i--){ const d=new Date(t); d.setDate(d.getDate()-i); arr.push(dateStr(d)); } return arr; }
function isThisMonth(dateStr){
  const d = new Date(dateStr+'T00:00:00');
  const now = new Date();
  return d.getFullYear()===now.getFullYear() && d.getMonth()===now.getMonth();
}

function renderDashboard(){
  const readMin = cache.reading.reduce((s,e)=>s+(Number(e.minutes)||0),0);
  const gymMin = cache.gym.reduce((s,e)=>s+(Number(e.duration_min)||0),0);
  const studyMin = cache.study.reduce((s,e)=>s+(Number(e.minutes)||0),0);
  const wordsCount = cache.words.length;
  const gratitudeCount = cache.gratitude.length;
  const netBalance = cache.finance
    .filter(e=>isThisMonth(e.date))
    .reduce((s,e)=>s+(e.type==='income'?1:-1)*(Number(e.amount)||0),0);

  const days = new Set([...cache.reading,...cache.gym,...cache.study,...cache.diet,...cache.gratitude].map(e=>e.date));
  let streak=0; let d=new Date();
  while(days.has(dateStr(d))){ streak++; d.setDate(d.getDate()-1); }

  document.getElementById('stats').innerHTML = `
    <div class="stat"><div class="num">${readMin}</div><div class="lbl">Reading min</div></div>
    <div class="stat"><div class="num">${gymMin}</div><div class="lbl">Gym min</div></div>
    <div class="stat"><div class="num">${studyMin}</div><div class="lbl">Study min</div></div>
    <div class="stat"><div class="num">${wordsCount}</div><div class="lbl">Words learned</div></div>
    <div class="stat"><div class="num">${gratitudeCount}</div><div class="lbl">Gratitude entries</div></div>
    <div class="stat"><div class="num" style="color:${netBalance<0?'var(--danger)':'var(--positive)'}">${netBalance}</div><div class="lbl">Net this month</div></div>
    <div class="stat"><div class="num">${streak}</div><div class="lbl">Day streak</div></div>
  `;

  const last21 = lastNDates(21);
  const byDay = (rows,field) => last21.map(d => rows.filter(e=>e.date===d).reduce((s,e)=>s+(Number(e[field])||0),0));
  if(charts.time) charts.time.destroy();
  charts.time = new Chart(document.getElementById('chart-time'), {
    type:'bar',
    data:{ labels: last21.map(d=>d.slice(5)), datasets:[
      { label:'Reading', data: byDay(cache.reading,'minutes'), backgroundColor:'#d7a24a' },
      { label:'Gym', data: byDay(cache.gym,'duration_min'), backgroundColor:'#c9714f' },
      { label:'Study', data: byDay(cache.study,'minutes'), backgroundColor:'#6bbf8e' }
    ]},
    options:{ scales:{ x:{stacked:true, ticks:{color:'#8b909c'}, grid:{display:false}}, y:{stacked:true, ticks:{color:'#8b909c'}, grid:{color:'#262a33'}} },
      plugins:{ legend:{labels:{color:'#eef0f3'}} } }
  });

  const sorted = [...cache.words].sort((a,b)=>a.date.localeCompare(b.date));
  const dates = [...new Set(sorted.map(w=>w.date))];
  let running=0;
  const cum = dates.map(d=>{ running += sorted.filter(w=>w.date===d).length; return running; });
  if(charts.words) charts.words.destroy();
  charts.words = new Chart(document.getElementById('chart-words'), {
    type:'line',
    data:{ labels: dates, datasets:[{ label:'Cumulative words', data: cum, borderColor:'#d7a24a', backgroundColor:'rgba(215,162,74,.15)', fill:true, tension:.25 }] },
    options:{ scales:{ y:{beginAtZero:true, ticks:{color:'#8b909c'}, grid:{color:'#262a33'}}, x:{ticks:{color:'#8b909c'}, grid:{display:false}} }, plugins:{legend:{display:false}} }
  });
}

checkSession();
