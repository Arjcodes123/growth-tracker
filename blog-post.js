const SUPABASE_URL = 'https://olfbcqtinzbhxvwipedb.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_Xk_aSrS3MnKtIoEUUc0uJw_5JUl1IiI';
const sb = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

function esc(s){
  return String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
}
// URL is /blog/<slug>; the slug is always the last path segment.
function getSlug(){
  const parts = window.location.pathname.split('/').filter(Boolean);
  return parts.length >= 2 ? decodeURIComponent(parts[parts.length - 1]) : '';
}
function showError(msg){
  document.getElementById('post-error').textContent = msg;
  document.getElementById('post-error').style.display = 'block';
}

async function loadPost(){
  const slug = getSlug();
  if(!slug){ showError('Post not found.'); return; }
  const {data, error} = await sb.from('posts').select('*').eq('slug', slug).eq('status', 'published').maybeSingle();
  if(error || !data){ showError('Post not found.'); return; }
  renderPost(data);
}

function renderPost(post){
  const pageTitle = `${post.title}: Groundwork`;
  document.title = pageTitle;
  document.getElementById('page-title').textContent = pageTitle;
  document.getElementById('page-description').setAttribute('content', post.meta_description || '');
  document.getElementById('og-title').setAttribute('content', post.title);
  document.getElementById('og-description').setAttribute('content', post.meta_description || '');
  if(post.cover_image_url) document.getElementById('og-image').setAttribute('content', post.cover_image_url);

  const date = (post.published_at || post.created_at || '').slice(0, 10);
  const bodyHtml = marked.parse(post.body || '');
  document.getElementById('post-content').innerHTML = `
    <header class="post-header">
      <div class="blog-date">${esc(date)}</div>
      <h1>${esc(post.title)}</h1>
    </header>
    ${post.cover_image_url ? `<img class="post-cover" src="${esc(post.cover_image_url)}" alt="${esc(post.title)}">` : ''}
    <article class="post-body">${bodyHtml}</article>
  `;
}
loadPost();
