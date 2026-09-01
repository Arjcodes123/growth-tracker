# Status — one thing left open: Search Console

Netlify's billing pause is over (new billing period started Aug 31); deploys
are live and auto-publishing from `master` again. Everything that was
blocked on that is done and verified live, including the blog CMS end-to-end
check (see below). The only thing still open is finishing the Search Console
integration, which needs two manual, credential-handling steps only the
account owner can do.

## Search Console integration — needs the user to finish setup

Built and live: `netlify/functions/gsc-search-analytics.js` (signs its own
JWT with Node's built-in `crypto`, no dependencies, gated on the caller
being the admin via their Supabase session) and the "Search Console" card
on `/admin.html`'s Overview tab. The `gsc-sync@studyers-search-console.iam.gserviceaccount.com`
service account has Restricted access on the groundworklog.com property.

Still needed, deliberately left to the user (Claude doesn't handle raw
credentials):

1. Generate a fresh service-account key: Google Cloud Console → IAM →
   Service Accounts → `gsc-sync` → Keys → Add key → JSON. (An earlier key
   from Aug 26 exists but its material was never seen here and is gone, so
   a new one is required.)
2. Paste that JSON's full contents into a Netlify environment variable
   named `GSC_SERVICE_ACCOUNT_KEY` (site → Project configuration →
   Environment variables), then redeploy.
3. Confirm the admin dashboard's "Search Console" card loads real rows
   instead of an error.

## Verified live (2026-09-01/02)

- Production deploy from `master` succeeds (confirmed via a real push).
- Blog CMS end-to-end: created a throwaway published post, confirmed
  `/blog/<slug>` renders fully styled (title, date, formatted body,
  internal/external links) instead of the old blank/unstyled page, and
  confirmed the server-rendered social-preview tags
  (`netlify/edge-functions/blog-meta.js`) show the post's real
  title/description in the raw HTML response, not the generic site
  default. Caught and fixed one real bug in the process: `HTMLRewriter`
  isn't a Netlify/Deno global (it's a Cloudflare Workers API) — needed an
  explicit import. Deleted the test post afterward; admin Blog tab
  confirmed clean ("No posts yet").
- Dashboard analytics (week/month/custom comparisons), fixed expense
  categories (now including Donations and Family/Friends) with the
  spend-by-category chart, contact email + self-serve data deletion — all
  live and spot-checked.
