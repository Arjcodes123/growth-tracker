-- Run this once in Supabase: SQL Editor -> New query -> paste -> Run

create table reading_entries (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users not null default auth.uid(),
  date date not null,
  book text,
  minutes numeric default 0,
  learning text,
  custom_fields jsonb not null default '{}',
  created_at timestamptz default now()
);

create table words (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users not null default auth.uid(),
  reading_entry_id uuid references reading_entries on delete set null,
  word text not null,
  meaning text,
  date date not null,
  created_at timestamptz default now()
);

create table gym_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users not null default auth.uid(),
  date date not null,
  workout_type text,
  duration_min numeric default 0,
  notes text,
  intensity text not null default 'medium' check (intensity in ('deep','medium','shallow')),
  custom_fields jsonb not null default '{}',
  created_at timestamptz default now()
);

create table study_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users not null default auth.uid(),
  date date not null,
  subject text,
  minutes numeric default 0,
  notes text,
  intensity text not null default 'medium' check (intensity in ('deep','medium','shallow')),
  custom_fields jsonb not null default '{}',
  created_at timestamptz default now()
);

create table work_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users not null default auth.uid(),
  date date not null,
  project text,
  minutes numeric default 0,
  notes text,
  intensity text not null default 'medium' check (intensity in ('deep','medium','shallow')),
  custom_fields jsonb not null default '{}',
  created_at timestamptz default now()
);

create table journal_entries (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users not null default auth.uid(),
  date date not null,
  title text,
  content text,
  custom_fields jsonb not null default '{}',
  created_at timestamptz default now()
);

create table gratitude_entries (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users not null default auth.uid(),
  date date not null,
  content text,
  custom_fields jsonb not null default '{}',
  created_at timestamptz default now()
);

create table finance_entries (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users not null default auth.uid(),
  date date not null,
  type text not null default 'expense',
  category text,
  amount numeric default 0,
  notes text,
  custom_fields jsonb not null default '{}',
  created_at timestamptz default now()
);

create table receivables (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users not null default auth.uid(),
  date date not null,
  from_name text not null,
  category text not null default 'personal' check (category in ('personal','freelance')),
  amount numeric not null default 0,
  status text not null default 'pending' check (status in ('pending','paid','written_off')),
  notes text,
  custom_fields jsonb not null default '{}',
  created_at timestamptz default now()
);

-- Minimal, privacy-scoped record used only for the owner's admin dashboard
-- (signup counts, daily/weekly active users). Deliberately holds nothing
-- about what anyone actually tracks -- no reading/gym/journal/finance rows
-- are ever readable outside the owning user, admin included.
create table profiles (
  id uuid primary key references auth.users not null,
  email text not null,
  created_at timestamptz not null default now(),
  last_active_at timestamptz not null default now()
);

-- Blog posts. Published posts are readable by anyone (the public blog
-- pages fetch them with the anon key); drafts are owner-only.
create table posts (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  title text not null,
  meta_description text,
  focus_keyphrase text,
  related_keywords text,
  cover_image_url text,
  body text not null default '',
  status text not null default 'draft' check (status in ('draft','published')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  published_at timestamptz
);

create table user_settings (
  user_id uuid primary key references auth.users not null default auth.uid(),
  enabled_tabs jsonb not null default '["reading","gym","study","work","journal","gratitude","finance","vocab"]',
  onboarded boolean not null default false,
  updated_at timestamptz default now()
);

create table todos (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users not null default auth.uid(),
  title text not null,
  cadence text not null default 'daily', -- 'daily' | 'weekly' | 'monthly' | 'yearly'
  archived boolean not null default false,
  created_at timestamptz default now()
);

create table todo_checks (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users not null default auth.uid(),
  todo_id uuid references todos on delete cascade not null,
  date date not null default current_date,
  created_at timestamptz default now(),
  unique (todo_id, date)
);

alter table profiles enable row level security;
alter table posts enable row level security;
alter table reading_entries enable row level security;
alter table words enable row level security;
alter table gym_logs enable row level security;
alter table study_logs enable row level security;
alter table work_logs enable row level security;
alter table journal_entries enable row level security;
alter table gratitude_entries enable row level security;
alter table finance_entries enable row level security;
alter table receivables enable row level security;
alter table user_settings enable row level security;
alter table todos enable row level security;
alter table todo_checks enable row level security;

-- Every user can see and update only their own profile row. The second
-- policy grants the site owner (by email, checked from the JWT) read access
-- to every row, for the admin dashboard's signup/DAU counts -- nothing else.
create policy "own profile" on profiles for select using (auth.uid() = id);
create policy "own profile update" on profiles for update using (auth.uid() = id) with check (auth.uid() = id);
create policy "own profile insert" on profiles for insert with check (auth.uid() = id);
create policy "admin reads all profiles" on profiles for select using (auth.jwt() ->> 'email' = 'abdulrehmanjavaid16@gmail.com');

-- Anyone (including signed-out visitors) can read published posts; only the
-- site owner can see drafts or write/delete anything.
create policy "anyone reads published posts" on posts for select using (status = 'published');
create policy "admin manages all posts" on posts for all
  using (auth.jwt() ->> 'email' = 'abdulrehmanjavaid16@gmail.com')
  with check (auth.jwt() ->> 'email' = 'abdulrehmanjavaid16@gmail.com');

create policy "own rows" on reading_entries for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "own rows" on words for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "own rows" on gym_logs for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "own rows" on study_logs for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "own rows" on work_logs for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "own rows" on journal_entries for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "own rows" on gratitude_entries for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "own rows" on finance_entries for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "own rows" on receivables for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "own rows" on user_settings for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "own rows" on todos for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "own rows" on todo_checks for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- Explicit grants so the app works regardless of the project's
-- "automatically expose new tables" default. Only signed-in users
-- (the `authenticated` role) get any access; RLS above then narrows
-- that down to each user's own rows. The `anon` role gets nothing,
-- since every screen in the app requires a signed-in session.
grant usage on schema public to authenticated;
grant usage on schema public to anon;
grant select, insert, update, delete on
  reading_entries, words, gym_logs, study_logs, work_logs, journal_entries,
  gratitude_entries, finance_entries, receivables, user_settings, todos, todo_checks
to authenticated;
grant select, insert, update on profiles to authenticated;
grant select on posts to anon;
grant select, insert, update, delete on posts to authenticated;

-- Auto-create a profile row the moment someone signs up, so signup counts
-- are accurate from the first session onward without relying on the client.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.profiles (id, email)
  values (new.id, new.email)
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();
