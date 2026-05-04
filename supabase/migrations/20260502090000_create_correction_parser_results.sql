create table if not exists public.correction_results (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  input_text text not null,
  purpose text not null default 'general',
  result jsonb not null,
  score integer not null default 0,
  word_count integer not null default 0,
  issue_count integer not null default 0,
  saved_words_count integer not null default 0,
  created_at timestamptz not null default now()
);

create index if not exists correction_results_user_created_idx
  on public.correction_results(user_id, created_at desc);

alter table public.correction_results enable row level security;

drop policy if exists "Users can read own correction results" on public.correction_results;
create policy "Users can read own correction results"
  on public.correction_results for select
  using (auth.uid() = user_id);

drop policy if exists "Users can insert own correction results" on public.correction_results;
create policy "Users can insert own correction results"
  on public.correction_results for insert
  with check (auth.uid() = user_id);

drop policy if exists "Users can update own correction results" on public.correction_results;
create policy "Users can update own correction results"
  on public.correction_results for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create table if not exists public.parser_results (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  input_text text not null,
  depth text not null default 'clause',
  result jsonb not null,
  word_count integer not null default 0,
  clause_count integer not null default 0,
  saved_words_count integer not null default 0,
  created_at timestamptz not null default now()
);

create index if not exists parser_results_user_created_idx
  on public.parser_results(user_id, created_at desc);

alter table public.parser_results enable row level security;

drop policy if exists "Users can read own parser results" on public.parser_results;
create policy "Users can read own parser results"
  on public.parser_results for select
  using (auth.uid() = user_id);

drop policy if exists "Users can insert own parser results" on public.parser_results;
create policy "Users can insert own parser results"
  on public.parser_results for insert
  with check (auth.uid() = user_id);

drop policy if exists "Users can update own parser results" on public.parser_results;
create policy "Users can update own parser results"
  on public.parser_results for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);
