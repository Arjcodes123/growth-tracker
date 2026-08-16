const SUPABASE_URL = 'https://olfbcqtinzbhxvwipedb.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_Xk_aSrS3MnKtIoEUUc0uJw_5JUl1IiI';
const sb = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

function esc(s){
  return String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
}

async function loadPosts(){
  const el = document.getElementById('blog-grid');
  const {data, error} = await sb.from('posts')
    .select('slug,title,meta_description,published_at')
    .eq('status', 'published')
    .order('published_at', {ascending:false});
  if(error){ el.innerHTML = `<p class="hint">${esc(error.message)}</p>`; return; }
  if(!data || data.length===0){ el.innerHTML = '<p class="hint">No posts yet. Check back soon.</p>'; return; }
  el.innerHTML = data.map(p => `
    <article class="blog-card">
      <div class="blog-date">${esc((p.published_at||'').slice(0,10))}</div>
      <h2><a href="/blog/${esc(p.slug)}">${esc(p.title)}</a></h2>
      <p>${esc(p.meta_description||'')}</p>
    </article>`).join('');
}
loadPosts();
