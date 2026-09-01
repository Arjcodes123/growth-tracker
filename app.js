// ---- backend config ----
// This app ships with one shared Supabase project. Every visitor signs in with
// their own Google account; row-level security (see schema.sql) keeps each
// person's rows visible only to them. The anon key below is meant to be public.
const SUPABASE_URL = 'https://olfbcqtinzbhxvwipedb.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_Xk_aSrS3MnKtIoEUUc0uJw_5JUl1IiI';

let sb = null;
let user = null;

// Trackers that share the "date + one label field + one numeric field + notes
// + deep/medium/shallow intensity" shape.
const SIMPLE_TRACKERS = [
  { key:'gym', table:'gym_logs', prefix:'g', fieldCol:'workout_type', numCol:'duration_min', numLabel:'min', titleFallback:'Workout', emptyMsg:'No workouts logged yet. Even a short session counts.' },
  { key:'study', table:'study_logs', prefix:'s', fieldCol:'subject', numCol:'minutes', numLabel:'min', titleFallback:'Study', emptyMsg:'No study sessions yet. Start with just one.' },
  { key:'work', table:'work_logs', prefix:'w', fieldCol:'project', numCol:'minutes', numLabel:'min', titleFallback:'Work', emptyMsg:'Nothing logged yet. Put in the first brick.' },
];
const INTENSITIES = ['deep','medium','shallow'];

// Trackers that share the "date + optional title + freeform content" shape.
const CONTENT_TRACKERS = [
  { key:'journal', table:'journal_entries', prefix:'j', hasTitle:true, titleFallback:'(untitled)', dashboard:true, emptyMsg:'Nothing written yet. Start with a sentence.' },
  { key:'gratitude', table:'gratitude_entries', prefix:'gr', hasTitle:false, titleFallback:'Gratitude', dashboard:true, emptyMsg:"Nothing here yet. What are you grateful for today?" },
];

// Tabs a user can turn on/off via onboarding or Settings. Dashboard and
// Settings themselves aren't in this list -- they're always on.
const TAB_LABELS = { reading:'Reading', gym:'Gym', study:'Study', work:'Work', journal:'Journal', gratitude:'Gratitude', finance:'Finance', vocab:'Vocabulary' };
const OPTIONAL_TABS = Object.keys(TAB_LABELS);

// Fixed expense categories (income stays freeform -- see the finance form).
// "Travelling" and "Miscellaneous" aren't separate entries here -- they're
// the same concept as the existing Travel and Other, so folding them in
// avoids a near-duplicate category rather than adding one.
// Colors are a validated categorical set (see dataviz skill); "Other" and any
// legacy freeform category from before this list existed get a neutral gray
// rather than a generated hue.
const EXPENSE_CATEGORIES = ['Food','Travel','Rent','Bills','Leisure','Investment','Health','Shopping','Donations','Family/Friends','Other'];
const CATEGORY_COLORS = {
  Food:'#2a78d6', Travel:'#eb6834', Rent:'#1baf7a', Bills:'#eda100', Leisure:'#e87ba4',
  Investment:'#008300', Health:'#4a3aa7', Shopping:'#e34948', Donations:'#8e44ad',
  'Family/Friends':'#b8860b', Other:'#8a7a5c'
};

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

// ---- onboarding & tab customization ----
let userSettings = null; // { enabled_tabs: string[], onboarded: bool }

async function fetchUserSettings(){
  const {data,error} = await sb.from('user_settings').select('*').eq('user_id', user.id).maybeSingle();
  if(error){ flash(error.message, true); return null; }
  return data;
}
async function saveUserSettings(enabledTabs, onboarded){
  const {error} = await sb.from('user_settings')
    .upsert({user_id:user.id, enabled_tabs:enabledTabs, onboarded, updated_at:new Date().toISOString()}, {onConflict:'user_id'});
  if(error){ flash(error.message, true); return false; }
  return true;
}
function toggleListHtml(idPrefix, selectedSet){
  return OPTIONAL_TABS.map(key => `
    <div class="toggle-row">
      <input type="checkbox" id="${idPrefix}-${key}" data-tab="${key}" ${selectedSet.has(key)?'checked':''}>
      <label for="${idPrefix}-${key}">${TAB_LABELS[key]}</label>
    </div>`).join('');
}
// Hides/shows the optional tab buttons per the user's chosen set. If the
// currently active tab just got hidden, falls back to the dashboard so the
// user never lands on a panel they can't navigate away from via the bar.
function applyTabVisibility(enabledTabs){
  const enabled = new Set(enabledTabs);
  document.querySelectorAll('.tab').forEach(t=>{
    if(OPTIONAL_TABS.includes(t.dataset.tab)) t.style.display = enabled.has(t.dataset.tab) ? '' : 'none';
  });
  const activeTab = document.querySelector('.tab.active');
  if(activeTab && activeTab.style.display === 'none'){
    document.querySelectorAll('.tab').forEach(x=>x.classList.remove('active'));
    document.querySelectorAll('.panel').forEach(x=>x.classList.remove('active'));
    document.querySelector('.tab[data-tab="dashboard"]').classList.add('active');
    document.getElementById('panel-dashboard').classList.add('active');
  }
}
function renderSettingsToggles(){
  const el = document.getElementById('settings-tabs-list');
  if(!el || !userSettings) return;
  el.innerHTML = toggleListHtml('settings', new Set(userSettings.enabled_tabs));
}
document.getElementById('settings-tabs-save').addEventListener('click', async ()=>{
  const selected = [...document.querySelectorAll('#settings-tabs-list input:checked')].map(cb=>cb.dataset.tab);
  const ok = await saveUserSettings(selected, true);
  if(!ok) return;
  userSettings.enabled_tabs = selected;
  applyTabVisibility(selected);
  flash('Saved.');
});
// todo_checks isn't listed here -- it cascade-deletes when its parent todos
// row goes (schema.sql: `todo_id uuid references todos on delete cascade`).
const DELETE_ON_ACCOUNT_WIPE = [
  'reading_entries','words','gym_logs','study_logs','work_logs','journal_entries',
  'gratitude_entries','finance_entries','receivables','todos','user_settings'
];
document.getElementById('delete-data-btn').addEventListener('click', async ()=>{
  if(!confirm('This permanently deletes everything you\'ve tracked and cannot be undone. Continue?')) return;
  if(!confirm('Final confirmation: delete all your data now?')) return;
  for(const table of DELETE_ON_ACCOUNT_WIPE){
    const {error} = await sb.from(table).delete().eq('user_id', user.id);
    if(error){ flash(error.message, true); return; }
  }
  await sb.from('profiles').delete().eq('id', user.id);
  await sb.auth.signOut();
  location.reload();
});

document.getElementById('onboard-continue').addEventListener('click', async ()=>{
  const selected = [...document.querySelectorAll('#onboard-list input:checked')].map(cb=>cb.dataset.tab);
  const ok = await saveUserSettings(selected, true);
  if(!ok) return;
  userSettings = { enabled_tabs: selected, onboarded: true };
  enterApp();
});

function enterApp(){
  applyTabVisibility(userSettings.enabled_tabs);
  show('screen-onboarding','none');
  document.getElementById('app').style.display='block';
  ['r-date','g-date','s-date','w-date','j-date','gr-date','f-date','rc-date'].forEach(id=>{ document.getElementById(id).value = todayLocal(); });
  if(document.getElementById('r-words').children.length === 0) addWordRow();
  renderAll();
}

async function onLoggedIn(){
  history.replaceState(null, '', window.location.pathname);
  show('screen-auth','none');
  show('topbar','flex');
  document.getElementById('whoami').textContent = user.email;
  document.getElementById('subline').style.display='none';

  // Fire-and-forget: lets the admin dashboard show signup/active counts
  // without ever touching what anyone actually tracks.
  sb.from('profiles').upsert({id:user.id, email:user.email, last_active_at:new Date().toISOString()}, {onConflict:'id'});

  const settings = await fetchUserSettings();
  if(!settings || !settings.onboarded){
    userSettings = { enabled_tabs: settings?.enabled_tabs || OPTIONAL_TABS.slice(), onboarded:false };
    document.getElementById('onboard-list').innerHTML = toggleListHtml('onboard', new Set(userSettings.enabled_tabs));
    show('screen-onboarding','block');
    return;
  }
  userSettings = settings;
  enterApp();
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
// Table name -> cache key, used to invalidate the right slice of the cache
// after a write instead of refetching everything.
const TABLE_KEY = {
  reading_entries:'reading', words:'words', gym_logs:'gym', study_logs:'study', work_logs:'work',
  journal_entries:'journal', gratitude_entries:'gratitude', finance_entries:'finance',
  receivables:'receivables', todos:'todos'
};
const ROW_LIMIT = 500; // caps payload size regardless of how much history a user builds up

async function fetchAll(table){
  const {data,error} = await sb.from(table).select('*').order('date',{ascending:false}).limit(ROW_LIMIT);
  if(error){ flash(error.message, true); return []; }
  return data;
}
async function insertRow(table,row){
  row.user_id = user.id;
  const {data,error} = await sb.from(table).insert(row).select();
  if(error){ flash(error.message, true); return null; }
  loaded.delete(TABLE_KEY[table]);
  return data[0];
}
async function deleteRow(table,id){
  const {error} = await sb.from(table).delete().eq('id',id);
  if(error){ flash(error.message, true); return; }
  loaded.delete(TABLE_KEY[table]);
  renderAll();
}
function listHtml(rows, table, renderItem, emptyMsg='No entries yet.'){
  if(rows.length===0) return `<div class="empty">${emptyMsg}</div>`;
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

// ---- per-tab insights ("Ground Level") ----
// Shared by every tracker's stats card: sum/count a field over a date range,
// then compare this-week to the prior week for a one-line, data-driven nudge.
function rangeSum(rows, field, fromStr, toStrExclusive){
  return rows.filter(e=>e.date>=fromStr && e.date<toStrExclusive).reduce((s,e)=>s+(Number(e[field])||0),0);
}
function rangeCount(rows, fromStr, toStrExclusive){
  return rows.filter(e=>e.date>=fromStr && e.date<toStrExclusive).length;
}
// Two adjacent 7-day windows ending today, with no gap or overlap between them.
function last7Bounds(){
  const today = new Date();
  const startThis = new Date(today); startThis.setDate(startThis.getDate()-6);
  const startLast = new Date(today); startLast.setDate(startLast.getDate()-13);
  const tomorrow = new Date(today); tomorrow.setDate(tomorrow.getDate()+1);
  return { thisFrom: dateStr(startThis), thisTo: dateStr(tomorrow), lastFrom: dateStr(startLast), lastTo: dateStr(startThis) };
}
// Generalized version of last7Bounds() for the Analytics card: any [from,to]
// range compared against the immediately preceding range of equal length
// (the same rule "this week vs last week" already uses, just not pinned to
// 7 days -- so "this month vs last month" and a custom range both fall out
// of the same logic instead of needing special-cased boundaries).
function addDaysDate(d, n){ const r = new Date(d); r.setDate(r.getDate()+n); return r; }
function priorEqualPeriod(fromStr, toStr){
  const from = new Date(fromStr+'T00:00:00');
  const to = new Date(toStr+'T00:00:00');
  const days = Math.round((to-from)/86400000) + 1; // inclusive day count
  const priorTo = addDaysDate(from, -1);
  const priorFrom = addDaysDate(priorTo, -(days-1));
  return { from: dateStr(priorFrom), to: dateStr(priorTo) };
}
function periodBounds(preset, customFrom, customTo){
  const today = new Date();
  let fromStr, toStr;
  if(preset==='month'){
    fromStr = dateStr(new Date(today.getFullYear(), today.getMonth(), 1));
    toStr = todayLocal();
  } else if(preset==='custom'){
    fromStr = customFrom; toStr = customTo;
  } else { // week
    fromStr = dateStr(addDaysDate(today,-6));
    toStr = todayLocal();
  }
  const prior = priorEqualPeriod(fromStr, toStr);
  return {
    thisFrom: fromStr, thisTo: dateStr(addDaysDate(new Date(toStr+'T00:00:00'),1)),
    lastFrom: prior.from, lastTo: dateStr(addDaysDate(new Date(prior.to+'T00:00:00'),1))
  };
}
// labels defaults to weekly phrasing since every existing caller (the
// per-tracker "Ground Level" cards) is genuinely week-over-week; the
// Analytics card is the only caller that overrides it, for month/custom.
function trendLine(current, previous, noun, labels={cur:'this week', prev:'last week'}){
  if(current===0 && previous===0) return `Nothing logged yet ${labels.cur}. Lay the first brick.`;
  if(previous===0) return `${current} ${noun} ${labels.cur}. Fresh start, keep it going.`;
  const pct = Math.round(((current-previous)/previous)*100);
  if(pct>=20) return `Up ${pct}% from ${labels.prev}. That's real momentum.`;
  if(pct>0) return `Up ${pct}% from ${labels.prev}. Steady progress.`;
  if(pct===0) return `Matching ${labels.prev} exactly. Steady as bedrock.`;
  if(pct>-20) return `Down ${Math.abs(pct)}% from ${labels.prev}. Still plenty of time left.`;
  return `Down ${Math.abs(pct)}% from ${labels.prev}. Time to get back to it.`;
}
function spendTrendLine(current, previous, labels={cur:'this week', prev:'last week'}){
  if(current===0 && previous===0) return `No spending logged ${labels.cur}.`;
  if(previous===0) return `${current} spent ${labels.cur}.`;
  const pct = Math.round(((current-previous)/previous)*100);
  if(pct>20) return `Spending's up ${pct}% from ${labels.prev}. Worth a glance.`;
  if(pct>0) return `Spending's up ${pct}% from ${labels.prev}.`;
  if(pct===0) return `Spending's flat versus ${labels.prev}.`;
  return `Spending's down ${Math.abs(pct)}% from ${labels.prev}. Nice.`;
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

function renderReadingStats(){
  const el = document.getElementById('r-stats'); if(!el) return;
  const total = cache.reading.reduce((s,e)=>s+(Number(e.minutes)||0),0);
  const {thisFrom,thisTo,lastFrom,lastTo} = last7Bounds();
  const thisWk = rangeSum(cache.reading,'minutes',thisFrom,thisTo);
  const lastWk = rangeSum(cache.reading,'minutes',lastFrom,lastTo);
  el.innerHTML = `
    <div class="toprow"><strong>Ground Level</strong></div>
    <div class="insight">${trendLine(thisWk,lastWk,'minutes')}</div>
    <div class="stats">
      <div class="stat"><div class="num">${total}</div><div class="lbl">Total minutes</div></div>
      <div class="stat"><div class="num">${cache.reading.length}</div><div class="lbl">Entries</div></div>
      <div class="stat"><div class="num">${cache.words.length}</div><div class="lbl">Words learned</div></div>
      <div class="stat"><div class="num">${thisWk}</div><div class="lbl">This week</div></div>
    </div>`;
}
function renderReading(){
  renderReadingStats();
  const el = document.getElementById('r-list');
  el.innerHTML = listHtml(cache.reading, 'reading_entries', e=>`
    <div class="entry-head"><span class="entry-title">${esc(e.book)||'(no book)'}</span><span>${esc(e.date)} &middot; ${esc(e.minutes)||0} min</span></div>
    ${e.learning?`<div class="entry-note">${esc(e.learning)}</div>`:''}
    ${cache.words.filter(w=>w.reading_entry_id===e.id).map(w=>`<span class="tag">${esc(w.word)}</span>`).join('')}
    ${renderCustomFields(e.custom_fields)}
  `, `No reading logged yet. Pick something up and jot down what you learn.`);
  bindDeletes(el);
}

// ---- simple trackers: gym, study, diet ----
function wireSimpleTracker(cfg){
  document.getElementById(cfg.prefix+'-addfield').addEventListener('click', ()=>addCustomFieldRow(document.getElementById(cfg.prefix+'-fields')));
  const intensityGroup = document.getElementById(cfg.prefix+'-intensity');
  const resetIntensity = ()=>{
    intensityGroup.querySelectorAll('.pill').forEach(b=>b.classList.toggle('active', b.dataset.value==='medium'));
  };
  intensityGroup.querySelectorAll('.pill').forEach(btn=>{
    btn.addEventListener('click', ()=>{
      intensityGroup.querySelectorAll('.pill').forEach(b=>b.classList.remove('active'));
      btn.classList.add('active');
    });
  });
  document.getElementById(cfg.prefix+'-save').addEventListener('click', async ()=>{
    const date = document.getElementById(cfg.prefix+'-date').value;
    const fieldVal = document.getElementById(cfg.prefix+'-field').value.trim();
    const numVal = parseFloat(document.getElementById(cfg.prefix+'-num').value)||0;
    const notes = document.getElementById(cfg.prefix+'-notes').value.trim();
    const intensity = intensityGroup.querySelector('.pill.active')?.dataset.value || 'medium';
    const custom_fields = collectCustomFields(document.getElementById(cfg.prefix+'-fields'));
    if(!date){ flash('Pick a date.', true); return; }
    const row = { date, notes, custom_fields, intensity };
    row[cfg.fieldCol] = fieldVal;
    row[cfg.numCol] = numVal;
    const r = await insertRow(cfg.table, row);
    if(!r) return;
    flash('Saved.');
    document.getElementById(cfg.prefix+'-field').value='';
    document.getElementById(cfg.prefix+'-num').value='';
    document.getElementById(cfg.prefix+'-notes').value='';
    document.getElementById(cfg.prefix+'-fields').innerHTML='';
    resetIntensity();
    renderAll();
  });
}
function renderTrackerStats(cfg){
  const el = document.getElementById(cfg.prefix+'-stats'); if(!el) return;
  const rows = cache[cfg.key];
  const total = rows.reduce((s,e)=>s+(Number(e[cfg.numCol])||0),0);
  const deepCount = rows.filter(e=>e.intensity==='deep').length;
  const {thisFrom,thisTo,lastFrom,lastTo} = last7Bounds();
  const thisWk = rangeSum(rows,cfg.numCol,thisFrom,thisTo);
  const lastWk = rangeSum(rows,cfg.numCol,lastFrom,lastTo);
  el.innerHTML = `
    <div class="toprow"><strong>Ground Level</strong></div>
    <div class="insight">${trendLine(thisWk,lastWk,cfg.numLabel)}</div>
    <div class="stats">
      <div class="stat"><div class="num">${total}</div><div class="lbl">Total ${cfg.numLabel}</div></div>
      <div class="stat"><div class="num">${rows.length}</div><div class="lbl">Sessions</div></div>
      <div class="stat"><div class="num">${deepCount}</div><div class="lbl">Deep sessions</div></div>
      <div class="stat"><div class="num">${thisWk}</div><div class="lbl">This week</div></div>
    </div>`;
}
function renderSimpleTracker(cfg){
  renderTrackerStats(cfg);
  const el = document.getElementById(cfg.prefix+'-list');
  el.innerHTML = listHtml(cache[cfg.key], cfg.table, e=>`
    <div class="entry-head"><span class="entry-title">${esc(e[cfg.fieldCol])||cfg.titleFallback}</span><span>${esc(e.date)} &middot; ${esc(e[cfg.numCol])||0} ${cfg.numLabel}</span></div>
    <span class="badge badge-${esc(e.intensity||'medium')}">${esc(e.intensity||'medium')}</span>
    ${e.notes?`<div class="entry-note">${esc(e.notes)}</div>`:''}
    ${renderCustomFields(e.custom_fields)}
  `, cfg.emptyMsg);
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
function renderContentStats(cfg){
  const el = document.getElementById(cfg.prefix+'-stats'); if(!el) return;
  const rows = cache[cfg.key];
  const {thisFrom,thisTo,lastFrom,lastTo} = last7Bounds();
  const thisWk = rangeCount(rows,thisFrom,thisTo);
  const lastWk = rangeCount(rows,lastFrom,lastTo);
  el.innerHTML = `
    <div class="toprow"><strong>Ground Level</strong></div>
    <div class="insight">${trendLine(thisWk,lastWk,'entries')}</div>
    <div class="stats">
      <div class="stat"><div class="num">${rows.length}</div><div class="lbl">Total entries</div></div>
      <div class="stat"><div class="num">${thisWk}</div><div class="lbl">This week</div></div>
    </div>`;
}
function renderContentTracker(cfg){
  renderContentStats(cfg);
  const el = document.getElementById(cfg.prefix+'-list');
  el.innerHTML = listHtml(cache[cfg.key], cfg.table, e=>`
    <div class="entry-head">${cfg.hasTitle ? `<span class="entry-title">${esc(e.title)||cfg.titleFallback}</span>` : '<span></span>'}<span>${esc(e.date)}</span></div>
    <div class="entry-note">${esc(e.content)}</div>
    ${renderCustomFields(e.custom_fields)}
  `, cfg.emptyMsg);
  bindDeletes(el);
}
CONTENT_TRACKERS.forEach(wireContentTracker);

// ---- finance ----
// Expenses pick from a fixed category list (for the spend-by-category chart);
// income stays freeform since income sources vary too much to bucket usefully.
function updateFinanceCategoryField(){
  const isIncome = document.getElementById('f-type').value === 'income';
  document.getElementById('f-category-select').style.display = isIncome ? 'none' : '';
  document.getElementById('f-category-text').style.display = isIncome ? '' : 'none';
}
document.getElementById('f-type').addEventListener('change', updateFinanceCategoryField);
updateFinanceCategoryField();

document.getElementById('f-addfield').addEventListener('click', ()=>addCustomFieldRow(document.getElementById('f-fields')));
document.getElementById('f-save').addEventListener('click', async ()=>{
  const date = document.getElementById('f-date').value;
  const type = document.getElementById('f-type').value;
  const category = type === 'income'
    ? document.getElementById('f-category-text').value.trim()
    : document.getElementById('f-category-select').value;
  const amount = parseFloat(document.getElementById('f-amount').value)||0;
  const notes = document.getElementById('f-notes').value.trim();
  const custom_fields = collectCustomFields(document.getElementById('f-fields'));
  if(!date){ flash('Pick a date.', true); return; }
  const r = await insertRow('finance_entries', {date, type, category, amount, notes, custom_fields});
  if(!r) return;
  flash('Saved.');
  document.getElementById('f-category-text').value=''; document.getElementById('f-amount').value='';
  document.getElementById('f-notes').value=''; document.getElementById('f-fields').innerHTML='';
  renderAll();
});
function renderFinanceStats(){
  const el = document.getElementById('f-stats'); if(!el) return;
  const netMonth = cache.finance.filter(e=>isThisMonth(e.date)).reduce((s,e)=>s+(e.type==='income'?1:-1)*(Number(e.amount)||0),0);
  const owed = cache.receivables.filter(e=>e.status==='pending').reduce((s,e)=>s+(Number(e.amount)||0),0);
  const expenses = cache.finance.filter(e=>e.type==='expense');
  const {thisFrom,thisTo,lastFrom,lastTo} = last7Bounds();
  const spendThis = rangeSum(expenses,'amount',thisFrom,thisTo);
  const spendLast = rangeSum(expenses,'amount',lastFrom,lastTo);
  el.innerHTML = `
    <div class="toprow"><strong>Ground Level</strong></div>
    <div class="insight">${spendTrendLine(spendThis,spendLast)}</div>
    <div class="stats">
      <div class="stat"><div class="num" style="color:${netMonth<0?'var(--danger)':'var(--positive)'}">${netMonth}</div><div class="lbl">Net this month</div></div>
      <div class="stat"><div class="num"${owed>0?' style="color:var(--terracotta)"':''}>${owed}</div><div class="lbl">Owed to you</div></div>
      <div class="stat"><div class="num">${spendThis}</div><div class="lbl">Spent this week</div></div>
    </div>`;
}
function renderFinance(){
  renderFinanceStats();
  const el = document.getElementById('f-list');
  el.innerHTML = listHtml(cache.finance, 'finance_entries', e=>`
    <div class="entry-head"><span class="entry-title">${esc(e.category)||(e.type==='income'?'Income':'Expense')}</span><span>${esc(e.date)} &middot; ${e.type==='income'?'+':'-'}${esc(e.amount)||0}</span></div>
    ${e.notes?`<div class="entry-note">${esc(e.notes)}</div>`:''}
    ${renderCustomFields(e.custom_fields)}
  `, 'No transactions yet.');
  bindDeletes(el);
  renderFinanceCategoryChart();
}
// Spend-by-category, this month. Any row predating the fixed category list
// (or with unrecognized freeform text) folds into "Other" for this chart only
// -- the entry list above still shows its original text untouched.
function renderFinanceCategoryChart(){
  const canvas = document.getElementById('chart-category'); if(!canvas) return;
  const empty = document.getElementById('category-empty');
  const monthExpenses = cache.finance.filter(e=>e.type==='expense' && isThisMonth(e.date));
  const totals = {};
  monthExpenses.forEach(e=>{
    const cat = EXPENSE_CATEGORIES.includes(e.category) ? e.category : 'Other';
    totals[cat] = (totals[cat]||0) + (Number(e.amount)||0);
  });
  const cats = EXPENSE_CATEGORIES.filter(c => totals[c] > 0);
  if(charts.category){ charts.category.destroy(); charts.category = null; }
  if(cats.length===0){ canvas.style.display='none'; empty.style.display='block'; return; }
  canvas.style.display=''; empty.style.display='none';
  charts.category = new Chart(canvas, {
    type:'bar',
    data:{ labels: cats, datasets:[{ data: cats.map(c=>totals[c]), backgroundColor: cats.map(c=>CATEGORY_COLORS[c]), borderRadius:4, maxBarThickness:44 }] },
    options:{
      scales:{ x:{ticks:{color:'#6b5c40'}, grid:{display:false}}, y:{beginAtZero:true, ticks:{color:'#6b5c40'}, grid:{color:'#ddccaa'}} },
      plugins:{ legend:{display:false} }
    }
  });
}

// ---- receivables (owed to you: friend debts, unpaid freelance work) ----
document.getElementById('rc-category').querySelectorAll('.pill').forEach(btn=>{
  btn.addEventListener('click', ()=>{
    document.getElementById('rc-category').querySelectorAll('.pill').forEach(b=>b.classList.remove('active'));
    btn.classList.add('active');
  });
});
document.getElementById('rc-save').addEventListener('click', async ()=>{
  const date = document.getElementById('rc-date').value;
  const from_name = document.getElementById('rc-from').value.trim();
  const amount = parseFloat(document.getElementById('rc-amount').value)||0;
  const category = document.getElementById('rc-category').querySelector('.pill.active')?.dataset.value || 'personal';
  const notes = document.getElementById('rc-notes').value.trim();
  if(!date || !from_name){ flash('Pick a date and who owes you.', true); return; }
  const r = await insertRow('receivables', {date, from_name, amount, category, notes, status:'pending'});
  if(!r) return;
  flash('Saved.');
  document.getElementById('rc-from').value=''; document.getElementById('rc-amount').value='';
  document.getElementById('rc-notes').value='';
  renderAll();
});
function daysAgo(d){
  return Math.floor((new Date(todayLocal()+'T00:00:00') - new Date(d+'T00:00:00')) / 86400000);
}
async function setReceivableStatus(id, status){
  const {error} = await sb.from('receivables').update({status}).eq('id', id);
  if(error){ flash(error.message, true); return; }
  loaded.delete('receivables');
  renderAll();
}
function renderReceivables(){
  const el = document.getElementById('rc-list');
  const rows = [...cache.receivables].sort((a,b)=>{
    if((a.status==='pending') !== (b.status==='pending')) return a.status==='pending' ? -1 : 1;
    return a.date.localeCompare(b.date);
  });
  if(rows.length===0){ el.innerHTML = '<div class="empty">Nobody owes you anything on record.</div>'; return; }
  el.innerHTML = rows.map(e=>{
    const days = daysAgo(e.date);
    const agingColor = e.status!=='pending' ? null : days>30 ? 'var(--danger)' : days>14 ? 'var(--terracotta)' : 'var(--positive)';
    const statusLabel = e.status==='paid' ? 'Paid' : e.status==='written_off' ? 'Written off' : `${days} day${days===1?'':'s'} outstanding`;
    return `
    <div class="entry">
      <div class="entry-head">
        <span class="entry-title">${esc(e.from_name)}</span>
        <span>${esc(e.date)} &middot; ${e.category==='freelance'?'Freelance':'Personal'} &middot; ${esc(e.amount)||0}</span>
      </div>
      <div class="entry-note"${agingColor?` style="color:${agingColor};font-weight:600;"`:''}>${statusLabel}</div>
      ${e.notes?`<div class="entry-note">${esc(e.notes)}</div>`:''}
      <div style="margin-top:8px;display:flex;gap:8px;flex-wrap:wrap;">
        ${e.status==='pending' ? `<button class="btn secondary small rc-paid" data-id="${e.id}">Mark paid</button>
        <button class="btn secondary small rc-writeoff" data-id="${e.id}">Write off</button>` : ''}
        <button class="btn secondary small del" data-table="receivables" data-id="${e.id}">Delete</button>
      </div>
    </div>`;
  }).join('');
  el.querySelectorAll('.rc-paid').forEach(b=>b.addEventListener('click', ()=>setReceivableStatus(b.dataset.id,'paid')));
  el.querySelectorAll('.rc-writeoff').forEach(b=>b.addEventListener('click', ()=>setReceivableStatus(b.dataset.id,'written_off')));
  bindDeletes(el);
}

// ---- vocab ----
document.getElementById('vocab-search').addEventListener('input', e=>renderVocab(e.target.value));
function renderVocabStats(){
  const el = document.getElementById('vocab-stats'); if(!el) return;
  const {thisFrom,thisTo,lastFrom,lastTo} = last7Bounds();
  const thisWk = rangeCount(cache.words,thisFrom,thisTo);
  const lastWk = rangeCount(cache.words,lastFrom,lastTo);
  el.innerHTML = `
    <div class="toprow"><strong>Ground Level</strong></div>
    <div class="insight">${trendLine(thisWk,lastWk,'words')}</div>
    <div class="stats">
      <div class="stat"><div class="num">${cache.words.length}</div><div class="lbl">Total words</div></div>
      <div class="stat"><div class="num">${thisWk}</div><div class="lbl">This week</div></div>
    </div>`;
}
function renderVocab(filter=''){
  renderVocabStats();
  const words = cache.words.filter(w =>
    (w.word||'').toLowerCase().includes(filter.toLowerCase()) || (w.meaning||'').toLowerCase().includes(filter.toLowerCase())
  );
  const el = document.getElementById('vocab-list');
  if(words.length===0){ el.innerHTML = '<div class="empty">No words logged yet. They\'ll collect here as you read.</div>'; return; }
  el.innerHTML = words.map(w => `
    <div class="entry"><div class="entry-head"><span class="entry-title">${esc(w.word)}</span><span>${esc(w.date)}</span></div>
    <div class="entry-note">${esc(w.meaning)}</div></div>`).join('');
}

// ---- todos ----
const TODO_CADENCES = [
  { key:'daily', label:'Today' },
  { key:'weekly', label:'This Week' },
  { key:'monthly', label:'This Month' },
  { key:'yearly', label:'This Year' },
];

// Monday-start week. All period boundaries build on the local-date helpers
// above (dateStr/todayLocal) so "today" agrees everywhere in the app.
function startOfWeek(d){
  const dow = (d.getDay()+6)%7; // 0=Mon..6=Sun
  return new Date(d.getFullYear(), d.getMonth(), d.getDate()-dow);
}
function periodStartStr(cadence, ref=new Date()){
  let start;
  if(cadence==='weekly') start = startOfWeek(ref);
  else if(cadence==='monthly') start = new Date(ref.getFullYear(), ref.getMonth(), 1);
  else if(cadence==='yearly') start = new Date(ref.getFullYear(), 0, 1);
  else start = new Date(ref.getFullYear(), ref.getMonth(), ref.getDate()); // daily
  return dateStr(start);
}

async function fetchTodos(){
  const {data,error} = await sb.from('todos').select('*').eq('archived', false).order('created_at',{ascending:true});
  if(error){ flash(error.message, true); return []; }
  return data;
}
async function fetchTodoChecks(){
  const sinceYear = periodStartStr('yearly');
  const {data,error} = await sb.from('todo_checks').select('*').gte('date', sinceYear);
  if(error){ flash(error.message, true); return []; }
  return data;
}

async function addTodo(cadence, title){
  const r = await insertRow('todos', {title, cadence});
  if(!r) return;
  renderAll();
}
async function checkTodo(todoId){
  const {error} = await sb.from('todo_checks')
    .upsert({todo_id:todoId, user_id:user.id, date:todayLocal()}, {onConflict:'todo_id,date', ignoreDuplicates:true});
  if(error){ flash(error.message, true); return; }
  loaded.delete('todoChecks');
  renderAll();
}
async function uncheckTodo(todoId, cadence){
  const start = periodStartStr(cadence);
  const {error} = await sb.from('todo_checks').delete()
    .eq('todo_id', todoId).eq('user_id', user.id).gte('date', start);
  if(error){ flash(error.message, true); return; }
  loaded.delete('todoChecks');
  renderAll();
}
async function archiveTodo(todoId){
  const {error} = await sb.from('todos').update({archived:true}).eq('id', todoId);
  if(error){ flash(error.message, true); return; }
  loaded.delete('todos');
  renderAll();
}

function renderTodoBoard(){
  const board = document.getElementById('todo-board');
  board.innerHTML = TODO_CADENCES.map(cfg=>{
    const start = periodStartStr(cfg.key);
    const items = cache.todos.filter(t=>t.cadence===cfg.key);
    const rows = items.length ? items.map(t=>{
      const done = cache.todoChecks.some(c=>c.todo_id===t.id && c.date>=start);
      return `
        <div class="todo-row ${done?'done':''}" data-id="${t.id}" data-cadence="${cfg.key}">
          <input type="checkbox" class="todo-check" ${done?'checked':''}>
          <span class="todo-title">${esc(t.title)}</span>
          <button class="btn secondary small todo-archive" title="Remove">&times;</button>
        </div>`;
    }).join('') : '<div class="empty">Nothing yet.</div>';
    return `
      <div class="todo-section">
        <div class="toprow"><strong>${cfg.label}</strong></div>
        <div class="todo-list">${rows}</div>
        <div class="todo-add-row">
          <input type="text" class="todo-add-input" data-cadence="${cfg.key}" placeholder="Add a to-do">
          <button class="btn secondary small todo-add-btn" data-cadence="${cfg.key}">Add</button>
        </div>
      </div>`;
  }).join('');

  board.querySelectorAll('.todo-check').forEach(cb=>{
    cb.addEventListener('change', e=>{
      const row = e.target.closest('.todo-row');
      if(e.target.checked) checkTodo(row.dataset.id);
      else uncheckTodo(row.dataset.id, row.dataset.cadence);
    });
  });
  board.querySelectorAll('.todo-archive').forEach(btn=>{
    btn.addEventListener('click', e=>archiveTodo(e.target.closest('.todo-row').dataset.id));
  });
  const addFromInput = (cadence)=>{
    const input = board.querySelector(`.todo-add-input[data-cadence="${cadence}"]`);
    const title = input.value.trim();
    if(!title) return;
    addTodo(cadence, title);
  };
  board.querySelectorAll('.todo-add-btn').forEach(btn=>{
    btn.addEventListener('click', ()=>addFromInput(btn.dataset.cadence));
  });
  board.querySelectorAll('.todo-add-input').forEach(inp=>{
    inp.addEventListener('keydown', e=>{ if(e.key==='Enter') addFromInput(inp.dataset.cadence); });
  });
}

// ---- render orchestration ----
let cache = { reading:[], gym:[], study:[], work:[], journal:[], gratitude:[], finance:[], receivables:[], words:[], todos:[], todoChecks:[] };
// Tracks which cache keys already reflect the server, so switching tabs back
// and forth doesn't refetch data that hasn't changed. insertRow/deleteRow
// clear the relevant key so the next render pulls fresh data for it.
let loaded = new Set();
async function ensureLoaded(key, table, fetcher){
  if(loaded.has(key)) return;
  cache[key] = fetcher ? await fetcher() : await fetchAll(table);
  loaded.add(key);
}

async function renderAll(){
  const activeTab = document.querySelector('.tab.active')?.dataset.tab;

  if(activeTab==='reading' || activeTab==='dashboard' || activeTab==='vocab'){
    await ensureLoaded('reading', 'reading_entries');
    await ensureLoaded('words', 'words');
  }
  for(const cfg of SIMPLE_TRACKERS){
    if(activeTab===cfg.key || activeTab==='dashboard') await ensureLoaded(cfg.key, cfg.table);
  }
  for(const cfg of CONTENT_TRACKERS){
    if(activeTab===cfg.key || (cfg.dashboard && activeTab==='dashboard')) await ensureLoaded(cfg.key, cfg.table);
  }
  if(activeTab==='finance' || activeTab==='dashboard') await ensureLoaded('finance', 'finance_entries');
  if(activeTab==='finance' || activeTab==='dashboard') await ensureLoaded('receivables', 'receivables');
  if(activeTab==='dashboard'){
    await ensureLoaded('todos', 'todos', fetchTodos);
    await ensureLoaded('todoChecks', 'todo_checks', fetchTodoChecks);
  }

  if(activeTab==='reading') renderReading();
  for(const cfg of SIMPLE_TRACKERS){ if(activeTab===cfg.key) renderSimpleTracker(cfg); }
  for(const cfg of CONTENT_TRACKERS){ if(activeTab===cfg.key) renderContentTracker(cfg); }
  if(activeTab==='finance'){ renderFinance(); renderReceivables(); }
  if(activeTab==='vocab') renderVocab(document.getElementById('vocab-search').value);
  if(activeTab==='dashboard'){ renderTodoBoard(); renderDashboard(); }
  if(activeTab==='settings') renderSettingsToggles();
}

// ---- dashboard ----
let charts = {};
// Local calendar date, not UTC (toISOString() is UTC and can be a day off from
// the user's actual "today" depending on timezone/time of day).
function dateStr(d){
  const y = d.getFullYear();
  const m = String(d.getMonth()+1).padStart(2,'0');
  const day = String(d.getDate()).padStart(2,'0');
  return `${y}-${m}-${day}`;
}
function todayLocal(){ return dateStr(new Date()); }
function lastNDates(n){ const arr=[]; const t=new Date(); for(let i=n-1;i>=0;i--){ const d=new Date(t); d.setDate(d.getDate()-i); arr.push(dateStr(d)); } return arr; }
function isThisMonth(dateStr){
  const d = new Date(dateStr+'T00:00:00');
  const now = new Date();
  return d.getFullYear()===now.getFullYear() && d.getMonth()===now.getMonth();
}

// Single source of truth for "what was active on date X", shared by the
// day-streak stat and the heatmap so they can't disagree about what counts.
function activityByDate(){
  const map = new Map(); // date -> Set of tracker keys active that day
  const add = (rows, key) => rows.forEach(e=>{
    if(!e.date) return;
    if(!map.has(e.date)) map.set(e.date, new Set());
    map.get(e.date).add(key);
  });
  add(cache.reading,'reading'); add(cache.gym,'gym'); add(cache.study,'study'); add(cache.work,'work');
  add(cache.journal,'journal'); add(cache.gratitude,'gratitude');
  add(cache.finance,'finance'); add(cache.todoChecks,'todos');
  return map;
}

function renderHeatmap(activity){
  const el = document.getElementById('heatmap');
  if(!el) return;
  const weeks = 13;
  const today = new Date();
  const firstWeekStart = startOfWeek(today);
  firstWeekStart.setDate(firstWeekStart.getDate() - (weeks-1)*7);

  let maxCount = 1;
  const cols = [];
  for(let w=0; w<weeks; w++){
    const col = [];
    for(let dow=0; dow<7; dow++){
      const d = new Date(firstWeekStart);
      d.setDate(d.getDate() + w*7 + dow);
      const ds = dateStr(d);
      const count = activity.get(ds)?.size || 0;
      maxCount = Math.max(maxCount, count);
      col.push({date:ds, count});
    }
    cols.push(col);
  }
  const levelFor = c => {
    if(c===0) return 0;
    const r = c/maxCount;
    return r>.75 ? 4 : r>.5 ? 3 : r>.25 ? 2 : 1;
  };
  el.innerHTML = `<div class="heatmap-grid">${cols.map(col=>
    `<div class="heatmap-col">${col.map(c=>
      `<div class="heatmap-cell level-${levelFor(c.count)}" title="${c.date}: ${c.count} tracker${c.count===1?'':'s'} active"></div>`
    ).join('')}</div>`
  ).join('')}</div>`;
}

function renderDashInsight(activity){
  const el = document.getElementById('dash-insight'); if(!el) return;
  const {thisFrom,thisTo,lastFrom,lastTo} = last7Bounds();
  const countActiveDays = (fromStr,toStrExcl) => {
    let n=0;
    for(const d of activity.keys()){ if(d>=fromStr && d<toStrExcl) n++; }
    return n;
  };
  const thisWk = countActiveDays(thisFrom,thisTo);
  const lastWk = countActiveDays(lastFrom,lastTo);
  if(thisWk===0 && lastWk===0){ el.textContent = `No activity logged yet. Lay your first brick today.`; return; }
  if(thisWk>=6){ el.textContent = `Active ${thisWk} of the last 7 days. That's proper consistency.`; return; }
  el.textContent = trendLine(thisWk,lastWk,'active days');
}
// ---- analytics card (week vs week / month vs month / custom range) ----
function datesBetween(fromStr, toStrInclusive){
  const arr = []; let d = new Date(fromStr+'T00:00:00'); const end = new Date(toStrInclusive+'T00:00:00');
  while(d<=end){ arr.push(dateStr(d)); d = addDaysDate(d,1); }
  return arr;
}
const ANALYTICS_METRICS = {
  reading:   { label:'Reading minutes',  noun:'min' },
  gym:       { label:'Gym minutes',      noun:'min' },
  study:     { label:'Study minutes',    noun:'min' },
  work:      { label:'Work minutes',     noun:'min' },
  deepwork:  { label:'Deep work minutes',noun:'min' },
  spend:     { label:'Spend',            noun:null }, // uses spendTrendLine instead
  words:     { label:'Words learned',    noun:'words' },
  gratitude: { label:'Gratitude entries',noun:'entries' },
  activedays:{ label:'Active days',      noun:'active days' },
};
// One day-by-day series for a metric over an inclusive date range. Shares the
// same underlying cache/fields every other view in the app reads from, so
// "this week" means the same thing here as it does on each tracker's own tab.
function dailySeries(metricKey, fromStr, toStrInclusive){
  const dates = datesBetween(fromStr, toStrInclusive);
  if(metricKey==='deepwork'){
    const deepRows = [
      ...cache.gym.filter(e=>e.intensity==='deep').map(e=>({date:e.date, val:e.duration_min})),
      ...cache.study.filter(e=>e.intensity==='deep').map(e=>({date:e.date, val:e.minutes})),
      ...cache.work.filter(e=>e.intensity==='deep').map(e=>({date:e.date, val:e.minutes})),
    ];
    return dates.map(d => deepRows.filter(e=>e.date===d).reduce((s,e)=>s+(Number(e.val)||0),0));
  }
  if(metricKey==='activedays'){
    const activity = activityByDate();
    return dates.map(d => activity.has(d) ? 1 : 0);
  }
  const table = { reading:[cache.reading,'minutes'], gym:[cache.gym,'duration_min'], study:[cache.study,'minutes'],
    work:[cache.work,'minutes'], spend:[cache.finance.filter(e=>e.type==='expense'),'amount'],
    words:[cache.words,null], gratitude:[cache.gratitude,null] };
  const [rows, field] = table[metricKey];
  if(field) return dates.map(d => rows.filter(e=>e.date===d).reduce((s,e)=>s+(Number(e[field])||0),0));
  return dates.map(d => rows.filter(e=>e.date===d).length);
}
function renderAnalytics(){
  const canvas = document.getElementById('chart-analytics'); if(!canvas) return;
  const metric = document.getElementById('an-metric').value;
  const preset = document.getElementById('an-preset').value;
  document.getElementById('an-custom-row').style.display = preset==='custom' ? 'flex' : 'none';

  let customFrom = document.getElementById('an-from').value;
  let customTo = document.getElementById('an-to').value;
  if(preset==='custom' && (!customFrom || !customTo)){
    // Default the custom pickers to last-7 the first time so the chart
    // isn't blank before the user has touched them.
    const {thisFrom,thisTo} = periodBounds('week');
    customTo = dateStr(addDaysDate(new Date(thisTo+'T00:00:00'),-1));
    customFrom = thisFrom;
    document.getElementById('an-from').value = customFrom;
    document.getElementById('an-to').value = customTo;
  }

  const {thisFrom,thisTo,lastFrom,lastTo} = periodBounds(preset, customFrom, customTo);
  const thisToIncl = dateStr(addDaysDate(new Date(thisTo+'T00:00:00'),-1));
  const lastToIncl = dateStr(addDaysDate(new Date(lastTo+'T00:00:00'),-1));
  const curDates = datesBetween(thisFrom, thisToIncl);
  const lastDates = datesBetween(lastFrom, lastToIncl);
  const curSeries = dailySeries(metric, thisFrom, thisToIncl);
  const prevSeries = dailySeries(metric, lastFrom, lastToIncl);
  const curTotal = curSeries.reduce((a,b)=>a+b,0);
  const prevTotal = prevSeries.reduce((a,b)=>a+b,0);
  const meta = ANALYTICS_METRICS[metric];
  const periodLabels = preset==='month' ? {cur:'this month', prev:'last month'}
    : preset==='custom' ? {cur:'this period', prev:'the previous period'}
    : {cur:'this week', prev:'last week'};
  document.getElementById('an-insight').textContent = metric==='spend'
    ? spendTrendLine(curTotal, prevTotal, periodLabels)
    : trendLine(curTotal, prevTotal, meta.noun, periodLabels);

  const labels = curSeries.map((_,i)=>`Day ${i+1}`);
  if(charts.analytics){ charts.analytics.destroy(); charts.analytics = null; }
  charts.analytics = new Chart(canvas, {
    type:'line',
    data:{ labels, datasets:[
      { label:'Current period', data:curSeries, borderColor:'#a8672a', backgroundColor:'rgba(168,103,42,.15)', borderWidth:2, pointRadius:3, tension:.2, fill:true },
      { label:'Previous period', data:prevSeries, borderColor:'#8a7a5c', borderDash:[5,4], borderWidth:2, pointRadius:0, tension:.2, fill:false }
    ]},
    options:{
      scales:{ y:{beginAtZero:true, ticks:{color:'#6b5c40'}, grid:{color:'#ddccaa'}}, x:{ticks:{color:'#6b5c40'}, grid:{display:false}} },
      plugins:{
        legend:{ display:true, labels:{color:'#33291a'} },
        tooltip:{ callbacks:{ title: items => {
          const i = items[0].dataIndex;
          return [`Current: ${curDates[i]||''}`, `Previous: ${lastDates[i]||''}`];
        } } }
      }
    }
  });
}
['an-metric','an-preset','an-from','an-to'].forEach(id=>{
  document.getElementById(id).addEventListener('change', renderAnalytics);
});

function renderDashboard(){
  const netBalance = cache.finance
    .filter(e=>isThisMonth(e.date))
    .reduce((s,e)=>s+(e.type==='income'?1:-1)*(Number(e.amount)||0),0);
  const owedToYou = cache.receivables
    .filter(e=>e.status==='pending')
    .reduce((s,e)=>s+(Number(e.amount)||0),0);

  const activity = activityByDate();
  let streak=0; let d=new Date();
  while(activity.has(dateStr(d))){ streak++; d.setDate(d.getDate()-1); }
  renderHeatmap(activity);
  renderDashInsight(activity);
  renderAnalytics();

  // Deliberately just 3 tiles here, each unambiguous about its own time
  // window (a running balance, an explicit "this month", a streak). Per-
  // metric totals and week-over-week comparisons live in the Analytics card
  // above instead of an unlabeled all-time number that reads as "this week".
  document.getElementById('stats').innerHTML = `
    <div class="stat"><div class="num">${streak}</div><div class="lbl">Day streak</div></div>
    <div class="stat"><div class="num" style="color:${netBalance<0?'var(--danger)':'var(--positive)'}">${netBalance}</div><div class="lbl">Net this month</div></div>
    <div class="stat"><div class="num"${owedToYou>0?' style="color:var(--terracotta)"':''}>${owedToYou}</div><div class="lbl">Owed to you</div></div>
  `;

  const last21 = lastNDates(21);
  const byDay = (rows,field) => last21.map(d => rows.filter(e=>e.date===d).reduce((s,e)=>s+(Number(e[field])||0),0));
  if(charts.time) charts.time.destroy();
  charts.time = new Chart(document.getElementById('chart-time'), {
    type:'bar',
    data:{ labels: last21.map(d=>d.slice(5)), datasets:[
      { label:'Reading', data: byDay(cache.reading,'minutes'), backgroundColor:'#a8672a' },
      { label:'Gym', data: byDay(cache.gym,'duration_min'), backgroundColor:'#a8502f' },
      { label:'Study', data: byDay(cache.study,'minutes'), backgroundColor:'#3f7a54' },
      { label:'Work', data: byDay(cache.work,'minutes'), backgroundColor:'#6a5a8c' }
    ]},
    options:{ scales:{ x:{stacked:true, ticks:{color:'#6b5c40'}, grid:{display:false}}, y:{stacked:true, ticks:{color:'#6b5c40'}, grid:{color:'#ddccaa'}} },
      plugins:{ legend:{labels:{color:'#33291a'}} } }
  });

  const sorted = [...cache.words].sort((a,b)=>a.date.localeCompare(b.date));
  const dates = [...new Set(sorted.map(w=>w.date))];
  let running=0;
  const cum = dates.map(d=>{ running += sorted.filter(w=>w.date===d).length; return running; });
  if(charts.words) charts.words.destroy();
  charts.words = new Chart(document.getElementById('chart-words'), {
    type:'line',
    data:{ labels: dates, datasets:[{ label:'Cumulative words', data: cum, borderColor:'#a8672a', backgroundColor:'rgba(168,103,42,.15)', fill:true, tension:.25 }] },
    options:{ scales:{ y:{beginAtZero:true, ticks:{color:'#6b5c40'}, grid:{color:'#ddccaa'}}, x:{ticks:{color:'#6b5c40'}, grid:{display:false}} }, plugins:{legend:{display:false}} }
  });
}

checkSession();

if('serviceWorker' in navigator){
  window.addEventListener('load', ()=>{
    navigator.serviceWorker.register('/sw.js').catch(err=>console.error('SW registration failed', err));
  });
}

// ---- install button ----
let deferredInstallPrompt = null;
function isStandalone(){
  return window.matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;
}
function isIOS(){
  return /iphone|ipad|ipod/i.test(navigator.userAgent);
}
function updateInstallUI(){
  const btn = document.getElementById('install-btn');
  const hint = document.getElementById('install-hint');
  if(!btn) return;
  btn.style.display = 'none';
  hint.style.display = 'none';
  if(isStandalone()){
    hint.textContent = 'This app is already installed.';
    hint.style.display = 'block';
  } else if(deferredInstallPrompt){
    btn.style.display = 'inline-block';
  } else if(isIOS()){
    hint.textContent = 'To install: tap the Share icon in Safari, then "Add to Home Screen."';
    hint.style.display = 'block';
  } else {
    hint.textContent = "Install isn't available in this browser yet. Try Chrome or Edge.";
    hint.style.display = 'block';
  }
}
window.addEventListener('beforeinstallprompt', (e)=>{
  e.preventDefault();
  deferredInstallPrompt = e;
  updateInstallUI();
});
window.addEventListener('appinstalled', ()=>{
  deferredInstallPrompt = null;
  updateInstallUI();
});
document.getElementById('install-btn').addEventListener('click', async ()=>{
  if(!deferredInstallPrompt) return;
  deferredInstallPrompt.prompt();
  await deferredInstallPrompt.userChoice;
  deferredInstallPrompt = null;
  updateInstallUI();
});
updateInstallUI();
