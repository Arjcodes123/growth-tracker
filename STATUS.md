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
  dashboard (keyword rankings, page performance). GSC domain verification
  is done. Approach decided: admin re-runs Google sign-in with the added
  `webmasters.readonly` scope and calls the GSC API client-side with the
  transient `provider_token` Supabase exposes right after that OAuth
  round-trip (no server secret, but needs an occasional "Reconnect" click
  since Supabase doesn't refresh Google's provider token in the
  background). **Blocked on the user confirming two things in Google
  Cloud Console** (not something Claude can click through): the "Google
  Search Console API" is enabled on the GCP project behind Supabase's
  Google OAuth client, and the admin's Google account can consent to
  that scope (test-user allowlist if the OAuth consent screen is still
  in Testing mode). Once confirmed, the admin.js/admin.html wiring is a
  contained addition.
- ~~Real contact email / self-serve account deletion~~ — done (2026-08-30).
  Privacy policy has a real contact address; Settings tab has a
  "Delete all my data" button (deletes all tracked data + profile row,
  signs out; doesn't remove the underlying auth identity — that still
  needs a service-role Supabase Edge Function, flagged as a future
  upgrade if ever wanted).
- ~~Server-rendered blog post pages~~ — done (2026-08-30), not yet
  verified live. `netlify/edge-functions/blog-meta.js` rewrites
  `/blog/:slug` responses' title/description/OG tags per-post via Deno's
  HTMLRewriter, using the same public anon-key read the
  "anyone reads published posts" RLS policy already allows. Client-side
  render in blog-post.js is unchanged and still runs as the fallback.
  Needs a live check once Netlify's deploy pause lifts and this is on
  `master` (same checklist as the blog CMS above): share a `/blog/<slug>`
  link and confirm Slack/Twitter/iMessage show that post's own
  title/image instead of the generic site card.

## Also fixed this session (2026-08-30), not in the original list

Dashboard's top stats row was showing all-time per-tracker totals
(e.g. "Gym min") unlabeled as such, directly under weekly-activity
copy — easy to misread as "this week" (source of a real bug report:
"250 min gym when I didn't go this week"). Replaced with an Analytics
card (metric picker, this-week/month/custom vs. the prior equal-length
period, line chart + trend copy) and trimmed the dashboard's stat row to
three tiles that are unambiguous about their own time window. Finance
expenses now pick from a fixed category list with a "spend by category"
chart. All on `dev`, not yet on `master`.
