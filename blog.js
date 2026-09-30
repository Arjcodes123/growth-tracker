const SUPABASE_URL = 'https://olfbcqtinzbhxvwipedb.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_Xk_aSrS3MnKtIoEUUc0uJw_5JUl1IiI';
const sb = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

const CATEGORY_LABELS = { reading:'Reading', study:'Study', gym:'Gym', journaling:'Journaling', finance:'Finance', general:'General' };

function esc(s){
  return String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
}

let allPosts = [];
let activeCategory = 'all';

function renderFilters(){
  const el = document.getElementById('blog-filters');
  const present = [...new Set(allPosts.map(p => p.category).filter(Boolean))];
  if(present.length === 0){ el.style.display = 'none'; return; }
  el.style.display = 'flex';
  const pills = ['all', ...present];
  el.innerHTML = pills.map(c => `
    <div class="tab ${c===activeCategory?'active':''}" data-cat="${esc(c)}">${c==='all'?'All':esc(CATEGORY_LABELS[c]||c)}</div>
  `).join('');
  el.querySelectorAll('[data-cat]').forEach(t=>{
    t.addEventListener('click', ()=>{ activeCategory = t.dataset.cat; renderFilters(); renderGrid(); });
  });
}

function renderGrid(){
  const el = document.getElementById('blog-grid');
  const posts = activeCategory === 'all' ? allPosts : allPosts.filter(p => p.category === activeCategory);
  if(posts.length===0){ el.innerHTML = '<p class="hint">No posts in this category yet.</p>'; return; }
  el.innerHTML = posts.map(p => `
    <article class="blog-card">
      <div class="blog-date">${esc((p.published_at||'').slice(0,10))}${p.category ? ` &middot; <span class="tag" style="margin:0;">${esc(CATEGORY_LABELS[p.category]||p.category)}</span>` : ''}</div>
      <h2><a href="/blog/${esc(p.slug)}">${esc(p.title)}</a></h2>
      <p>${esc(p.meta_description||'')}</p>
    </article>`).join('');
}

async function loadPosts(){
  const el = document.getElementById('blog-grid');
  const {data, error} = await sb.from('posts')
    .select('slug,title,meta_description,published_at,category')
    .eq('status', 'published')
    .order('published_at', {ascending:false});
  if(error){ el.innerHTML = `<p class="hint">${esc(error.message)}</p>`; return; }
  if(!data || data.length===0){ el.innerHTML = '<p class="hint">No posts yet. Check back soon.</p>'; return; }
  allPosts = data;
  renderFilters();
  renderGrid();
}
loadPosts();
