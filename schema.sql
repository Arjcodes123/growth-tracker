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

create table diet_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users not null default auth.uid(),
  date date not null,
  meal text,
  description text,
  calories numeric default 0,
  notes text,
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

alter table reading_entries enable row level security;
alter table words enable row level security;
alter table gym_logs enable row level security;
alter table study_logs enable row level security;
alter table journal_entries enable row level security;
alter table gratitude_entries enable row level security;
alter table diet_logs enable row level security;
alter table finance_entries enable row level security;
alter table todos enable row level security;
alter table todo_checks enable row level security;

create policy "own rows" on reading_entries for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "own rows" on words for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "own rows" on gym_logs for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "own rows" on study_logs for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "own rows" on journal_entries for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "own rows" on gratitude_entries for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "own rows" on diet_logs for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "own rows" on finance_entries for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "own rows" on todos for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "own rows" on todo_checks for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- Explicit grants so the app works regardless of the project's
-- "automatically expose new tables" default. Only signed-in users
-- (the `authenticated` role) get any access; RLS above then narrows
-- that down to each user's own rows. The `anon` role gets nothing,
-- since every screen in the app requires a signed-in session.
grant usage on schema public to authenticated;
grant select, insert, update, delete on
  reading_entries, words, gym_logs, study_logs, journal_entries,
  gratitude_entries, diet_logs, finance_entries, todos, todo_checks
to authenticated;
