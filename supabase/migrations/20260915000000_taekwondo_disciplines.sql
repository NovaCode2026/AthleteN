-- AthleteN Taekwondo-first schema
-- Shared athlete features remain unchanged. Kyorugi and Poomsae get separate domain records.

alter table public.profiles
  add column if not exists sport text default 'taekwondo',
  add column if not exists discipline text;

alter table public.profiles
  drop constraint if exists profiles_sport_check;
alter table public.profiles
  add constraint profiles_sport_check check (sport is null or sport = 'taekwondo');

alter table public.profiles
  drop constraint if exists profiles_discipline_check;
alter table public.profiles
  add constraint profiles_discipline_check check (discipline is null or discipline in ('kyorugi','poomsae'));

create table if not exists public.taekwondo_kyorugi_bouts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  event_name text not null,
  event_date date,
  opponent_name text,
  round_name text,
  result text check (result in ('win','loss','draw','no_contest')),
  athlete_score integer,
  opponent_score integer,
  decision text,
  notes text,
  is_official boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists public.taekwondo_poomsae_performances (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  event_name text not null,
  event_date date,
  poomsae_name text,
  category text,
  score numeric(6,3),
  "placing" integer,
  result text check (result in ('gold','silver','bronze','placed','not_placed')),
  notes text,
  is_official boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists public.taekwondo_training_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  discipline text not null check (discipline in ('kyorugi','poomsae')),
  title text not null,
  session_date date not null,
  focus text,
  rounds integer,
  repetitions integer,
  notes text,
  is_official boolean not null default false,
  created_at timestamptz not null default now()
);

alter table public.taekwondo_training_logs add column if not exists repetitions integer;

create index if not exists idx_tkd_kyorugi_user_date on public.taekwondo_kyorugi_bouts(user_id, event_date desc);
create index if not exists idx_tkd_poomsae_user_date on public.taekwondo_poomsae_performances(user_id, event_date desc);
create index if not exists idx_tkd_training_user_date on public.taekwondo_training_logs(user_id, session_date desc);
create index if not exists idx_tkd_training_user_discipline on public.taekwondo_training_logs(user_id, discipline);

alter table public.taekwondo_kyorugi_bouts enable row level security;
alter table public.taekwondo_poomsae_performances enable row level security;
alter table public.taekwondo_training_logs enable row level security;

drop policy if exists "kyorugi owner select" on public.taekwondo_kyorugi_bouts;
drop policy if exists "kyorugi owner insert" on public.taekwondo_kyorugi_bouts;
drop policy if exists "kyorugi owner update" on public.taekwondo_kyorugi_bouts;
drop policy if exists "kyorugi owner delete" on public.taekwondo_kyorugi_bouts;
create policy "kyorugi owner select" on public.taekwondo_kyorugi_bouts for select using (auth.uid() = user_id);
create policy "kyorugi owner insert" on public.taekwondo_kyorugi_bouts for insert with check (auth.uid() = user_id);
create policy "kyorugi owner update" on public.taekwondo_kyorugi_bouts for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "kyorugi owner delete" on public.taekwondo_kyorugi_bouts for delete using (auth.uid() = user_id);

drop policy if exists "poomsae owner select" on public.taekwondo_poomsae_performances;
drop policy if exists "poomsae owner insert" on public.taekwondo_poomsae_performances;
drop policy if exists "poomsae owner update" on public.taekwondo_poomsae_performances;
drop policy if exists "poomsae owner delete" on public.taekwondo_poomsae_performances;
create policy "poomsae owner select" on public.taekwondo_poomsae_performances for select using (auth.uid() = user_id);
create policy "poomsae owner insert" on public.taekwondo_poomsae_performances for insert with check (auth.uid() = user_id);
create policy "poomsae owner update" on public.taekwondo_poomsae_performances for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "poomsae owner delete" on public.taekwondo_poomsae_performances for delete using (auth.uid() = user_id);

drop policy if exists "tkd training owner select" on public.taekwondo_training_logs;
drop policy if exists "tkd training owner insert" on public.taekwondo_training_logs;
drop policy if exists "tkd training owner update" on public.taekwondo_training_logs;
drop policy if exists "tkd training owner delete" on public.taekwondo_training_logs;
create policy "tkd training owner select" on public.taekwondo_training_logs for select using (auth.uid() = user_id);
create policy "tkd training owner insert" on public.taekwondo_training_logs for insert with check (auth.uid() = user_id);
create policy "tkd training owner update" on public.taekwondo_training_logs for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "tkd training owner delete" on public.taekwondo_training_logs for delete using (auth.uid() = user_id);

-- Keep existing generic training/tournament/medal/document/plan/message features intact.
