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

async function loadDashboard(){
  const {data, error} = await sb.from('profiles').select('id,email,created_at,last_active_at');
  if(error){ document.getElementById('admin-error').textContent = error.message; return; }
  renderStats(data);
  renderChart(data);
  renderList(data);
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

checkSession();
