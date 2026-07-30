-- Run this once in Supabase: SQL Editor -> New query -> paste -> Run

create table reading_entries (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users not null default auth.uid(),
  date date not null,
  book text,
  minutes numeric default 0,
  learning text,
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
  created_at timestamptz default now()
);

create table study_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users not null default auth.uid(),
  date date not null,
  subject text,
  minutes numeric default 0,
  notes text,
  created_at timestamptz default now()
);

create table journal_entries (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users not null default auth.uid(),
  date date not null,
  title text,
  content text,
  created_at timestamptz default now()
);

alter table reading_entries enable row level security;
alter table words enable row level security;
alter table gym_logs enable row level security;
alter table study_logs enable row level security;
alter table journal_entries enable row level security;

create policy "own rows" on reading_entries for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "own rows" on words for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "own rows" on gym_logs for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "own rows" on study_logs for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "own rows" on journal_entries for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
