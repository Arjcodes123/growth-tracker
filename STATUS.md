# Status — paused for Netlify billing, resume after Sept 1 2026

Netlify paused production deploys on this account ("running on operational
credits"). The live site keeps serving its last successful deploy; nothing
breaks, but new pushes won't go out until the team is upgraded or the next
billing cycle resets (~Sept 1 2026). Everything below is written and pushed
to `master` on GitHub already — it just hasn't deployed yet.

## First thing when picking this back up

1. Confirm Netlify deploys have resumed (check
   https://app.netlify.com/projects/studyers-growth-tracker/deploys — should
   say "Published master@aea8c2f" or later, not stuck at `8c299c6`).
2. Live-test `/blog/test-something` end to end again: create a throwaway
   post in `/admin.html` → Blog tab, publish it, confirm the post page at
   `/blog/<slug>` actually renders (title, body, meta tags) instead of the
   blank/unstyled page the relative-path bug caused, then delete the test
   post the same way we did before (Blog tab → open post → Delete, or via
   `sb.from('posts').delete()` in devtools if the UI button isn't handy).
3. If that renders clean, the blog CMS is fully done and this file can be
   deleted.

## What's already built and working (independent of the deploy pause)

- Domain, DNS, security headers, security audit, Supabase/Google OAuth
  wiring — all live and verified.
- Per-tab "Ground Level" stats + insights, onboarding + Settings tab
  customization, finance debt/pending-payment tracking — all live and
  verified.
- Public landing page + SEO meta/OG tags, `/app.html` split, sitemap,
  robots.txt — all live and verified.
- Admin dashboard (`/admin.html`) — signups, DAU/WAU/MAU, signups chart —
  live and verified with real data.
- Privacy policy (`/privacy.html`) — live, linked from landing footer, app
  Settings tab, and every blog/policy page nav.
- Google Search Console verification file is live
  (`google57eeb28a7a2fa523.html`) — confirm with the user whether they
  finished clicking "Verify" in Search Console.
- Blog CMS (`/blog`, `/blog/:slug`, admin Blog tab, SEO/readability
  scorer) — fully built, tested locally and with real writes against
  production Supabase. One bug was caught live and fixed (relative asset
  paths breaking under `/blog/:slug`'s nested URL) — that fix is pushed
  but **not yet deployed** because of the billing pause. This is the one
  piece that still needs a final live check once deploys resume (see
  above).

## Explicitly deferred, needs the user's input before starting

- **Search Console / Analytics data integration** into the admin
  dashboard (keyword rankings, page performance). Needs GSC actually
  verified (in progress, user doing this themselves) and a decision on
  how to pull the data in.
- **Real contact email / self-serve account deletion** for the privacy
  policy. Currently says a contact channel is "on the way" rather than
  exposing a personal email. Swap in a real address whenever one exists,
  and/or build an actual delete-account flow later.
- **Server-rendered blog post pages** (Netlify Edge Function) for proper
  social link-preview cards (Slack/Twitter/iMessage). Current pages are
  client-rendered like the rest of the app — fine for Google indexing,
  but a shared post link shows the generic site preview instead of that
  post's own title/image until this exists. Flagged as optional/future,
  not started.
