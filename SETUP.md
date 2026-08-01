# Growth Tracker Setup Checklist

This is the one-time setup for the person hosting the app (you). Visitors never see any of this; they just click "Continue with Google."

Files in this folder:
- `index.html`: the app (open directly in a browser, or deploy it)
- `schema.sql`: database tables and row-level security, run once in Supabase
- `SETUP.md`: this checklist
- `README.md`: project overview

## 1. Create the database (Supabase)

- [ ] Go to supabase.com, sign up (free), **New project**
- [ ] Set a project name (org name can be anything, e.g. your name, it's just a label)
- [ ] Set a database password and save it somewhere (a password manager or note)
- [ ] Pick the nearest region, wait ~2 minutes while it provisions

## 2. Create the tables

- [ ] Open your project, **SQL Editor**, New query
- [ ] Paste the entire contents of `schema.sql`, **Run**
- [ ] Confirm no errors (10 tables should now exist: `reading_entries`, `words`, `gym_logs`, `study_logs`, `work_logs`, `journal_entries`, `gratitude_entries`, `finance_entries`, `todos`, `todo_checks`, all with row-level security enabled)

## 3. Set up "Sign in with Google"

- [ ] Go to [Google Cloud Console](https://console.cloud.google.com/) → create a project (or reuse one)
- [ ] **APIs & Services → OAuth consent screen** → set it up (External, add your app name/logo, your email as support contact)
- [ ] **APIs & Services → Credentials → Create Credentials → OAuth client ID** → Application type: **Web application**
- [ ] In Supabase: **Authentication → Providers → Google** to find the exact **Callback URL** you must add as an Authorized redirect URI (it looks like `https://YOUR-PROJECT-REF.supabase.co/auth/v1/callback`), then copy it into the Google Cloud OAuth client's "Authorized redirect URIs"
- [ ] Copy the generated **Client ID** and **Client Secret** from Google Cloud back into Supabase's Google provider settings, then toggle it **on**
- [ ] In Supabase **Authentication → URL Configuration**, set the **Site URL** to your real deployed URL once you have one (step 6), and add `http://localhost:*` and any preview URLs under **Redirect URLs** while you're testing locally

Google sign-in needs a real `http://` or `https://` URL to redirect to, so opening `index.html` straight from disk (`file://...`) won't work for the OAuth step. Serve it locally (e.g. `npx serve .`) or just test on the deployed URL from step 6.

- [ ] Optional: turn off the **Email** provider in Supabase (**Authentication → Providers → Email**) since this app only uses Google sign-in

## 4. Get your API keys and wire them into the app

- [ ] In Supabase: **Settings → API**
- [ ] Copy the **Project URL** and the **anon public** key
  (Safe to embed in the page. Supabase's row-level security, set up by `schema.sql`, is what actually keeps everyone's data private, not secrecy of this key.)
- [ ] Open `app.js`, find the `SUPABASE_URL` / `SUPABASE_ANON_KEY` constants near the top, and paste your values in

## 5. Try it locally

- [ ] Serve the folder over HTTP (`npx serve .` or similar), open it in a browser
- [ ] Click **Continue with Google**, confirm you land back in the app signed in
- [ ] Add an entry in each tab, confirm it shows up on the Dashboard

## 6. Put it on GitHub

- [ ] Public repo is fine here: the anon key isn't a secret, and there's nothing else sensitive in the code
- [ ] Push `index.html`, `style.css`, `app.js`, `schema.sql`, `SETUP.md`, `README.md`

## 7. Deploy for a real URL

- [ ] Go to netlify.com (or vercel.com) → sign in with GitHub → **Import** your repo → deploy (no build config needed, it's a static file)
- [ ] Once you have the live URL, go back to Supabase **Authentication → URL Configuration** and set it as the **Site URL**, plus add it under **Redirect URLs**
- [ ] Any future change: edit the file, push to GitHub, the live site updates automatically
- [ ] Optional: buy a custom domain later and point it at Netlify, then update the Supabase URL Configuration again

## Notes on running this for other people

- Data lives in Supabase (real Postgres), not in the browser, safe across devices and browser resets.
- Every row is locked to its own `user_id` via row-level security policies, so one visitor can never read or edit another visitor's entries, even though everyone shares the same database.
- You (the project owner) can see all rows via the Supabase Table Editor or SQL Editor since you hold the database credentials; visitors cannot.
- If you outgrow the free Supabase tier or want paid plans later, that's a billing/product decision on top of this setup, not a change to how the security model works.
