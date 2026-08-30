// Server-rendered meta tags for individual blog posts, so a link shared on
// Slack/Twitter/iMessage shows that post's own title/description/image
// instead of the site-wide default. blog-post.html/js still render the page
// itself client-side as before -- this only rewrites the <head> tags in the
// HTML response before it reaches the requester, using the same public,
// anon-key read the "anyone reads published posts" RLS policy already
// allows (schema.sql). No secrets, no new infra.
//
// Matches /blog/:slug via the `config.path` glob below -- not /blog itself
// (the listing page), which has no slug segment.

const SUPABASE_URL = 'https://olfbcqtinzbhxvwipedb.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_Xk_aSrS3MnKtIoEUUc0uJw_5JUl1IiI';

// Mirrors blog-post.js's own getSlug(): slug is the last path segment, and
// only counts when there's a segment before it (i.e. this isn't just /blog).
function getSlug(pathname){
  const parts = pathname.split('/').filter(Boolean);
  return parts.length >= 2 ? decodeURIComponent(parts[parts.length - 1]) : '';
}

export default async (request, context) => {
  const url = new URL(request.url);
  const slug = getSlug(url.pathname);
  const response = await context.next();
  if(!slug) return response;

  let post = null;
  try{
    const apiUrl = `${SUPABASE_URL}/rest/v1/posts?slug=eq.${encodeURIComponent(slug)}&status=eq.published&select=title,meta_description,cover_image_url&limit=1`;
    const res = await fetch(apiUrl, { headers: { apikey: SUPABASE_ANON_KEY, Authorization: `Bearer ${SUPABASE_ANON_KEY}` } });
    if(res.ok){
      const rows = await res.json();
      post = rows[0] || null;
    }
  } catch(e){
    // Any fetch/parse failure just falls through to the unmodified response
    // below -- the client-side render in blog-post.js is the fallback either way.
  }
  if(!post) return response;

  const title = `${post.title}: Groundwork`;
  const description = post.meta_description || '';

  // Twitter Cards fall back to the og:* tags when twitter:title/description/
  // image aren't present (blog-post.html doesn't declare them), so rewriting
  // og:* alone covers both.
  const rewriter = new HTMLRewriter()
    .on('title', { element(el){ el.setInnerContent(title); } })
    .on('meta[name="description"]', { element(el){ el.setAttribute('content', description); } })
    .on('meta[property="og:title"]', { element(el){ el.setAttribute('content', post.title); } })
    .on('meta[property="og:description"]', { element(el){ el.setAttribute('content', description); } });
  if(post.cover_image_url){
    rewriter.on('meta[property="og:image"]', { element(el){ el.setAttribute('content', post.cover_image_url); } });
  }
  return rewriter.transform(response);
};

export const config = { path: '/blog/*' };
