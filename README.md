# Groundwork

A single-page habit and journal tracker for reading, gym, study and personal writing, with a dashboard that visualizes streaks and time invested over the last three weeks.

## Features

- **Reading log** with per-entry takeaways and a running vocabulary list
- **Gym and study logs** with type/subject, duration, and notes
- **Journal** for free-form daily writing
- **Vocabulary bank**, searchable, auto-collected from reading entries
- **Dashboard** with totals, a day streak, a stacked minutes-per-day chart, and a cumulative words-learned chart
- **Google sign-in**, no passwords, no account setup
- Each person's data is private to their own account, enforced at the database layer, not just in the UI

## Stack

- Plain HTML/CSS/JS, no build step, no framework
- [Supabase](https://supabase.com) (Postgres + Auth) as the backend
- [Chart.js](https://www.chartjs.org/) for the dashboard charts
- Deployable to any static host (Netlify, Vercel, GitHub Pages)

## How it's secured

- Every table has row-level security policies scoped to `auth.uid()`, so Postgres itself refuses to return or modify another user's rows, regardless of what the client sends
- The Supabase anon key embedded in the page is meant to be public; it grants no access on its own, RLS is the actual gate
- Authentication is handled entirely by Supabase Auth via Google OAuth, this app never sees or stores a password

See `schema.sql` for the table and policy definitions.

## Running your own copy

See `SETUP.md` for the full checklist: create a Supabase project, run `schema.sql`, configure Google sign-in, drop your Project URL and anon key into `index.html`, and deploy.

## License

MIT
