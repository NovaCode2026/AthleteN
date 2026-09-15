alter table public.profiles add column if not exists gender text;
alter table public.profiles add column if not exists sport text;
alter table public.profiles add column if not exists discipline text;
alter table public.profiles add column if not exists academy_id uuid references public.academies(id) on delete set null;
alter table public.profiles add column if not exists coach_user_id uuid references auth.users(id) on delete set null;
alter table public.profiles drop constraint if exists profiles_sport_check;
alter table public.profiles drop constraint if exists profiles_discipline_check;
alter table public.profiles drop constraint if exists profiles_taekwondo_discipline_check;
alter table public.profiles add constraint profiles_sport_check check (sport is null or sport='taekwondo');
alter table public.profiles add constraint profiles_discipline_check check (discipline is null or discipline in ('kyorugi','poomsae'));
alter table public.profiles add constraint profiles_taekwondo_discipline_check check (sport is null or (sport='taekwondo' and discipline in ('kyorugi','poomsae')));

alter table public.training_sessions add column if not exists sport text;
alter table public.training_sessions add column if not exists discipline text;
alter table public.tournaments add column if not exists sport text;
alter table public.tournaments add column if not exists discipline text;
alter table public.matches add column if not exists sport text;
alter table public.matches add column if not exists discipline text;
alter table public.medals add column if not exists sport text;
alter table public.medals add column if not exists discipline text;
alter table public.weight_logs add column if not exists sport text;
alter table public.weight_logs add column if not exists discipline text;

create table if not exists public.kyorugi_bouts (id uuid primary key default gen_random_uuid(), user_id uuid not null references auth.users(id) on delete cascade, tournament_id uuid references public.tournaments(id) on delete set null, bout_date date not null default current_date, opponent_name text, opponent_club text, category text, round_name text, result text check (result in ('win','loss','draw','walkover','other')), points_scored integer check (points_scored>=0), points_conceded integer check (points_conceded>=0), penalties integer not null default 0 check (penalties>=0), rounds_completed integer check (rounds_completed>=0), coach_notes text, attack_notes text, defence_notes text, techniques text[], preparation_notes text, created_at timestamptz not null default now(), updated_at timestamptz not null default now());
create table if not exists public.kyorugi_training_metrics (id uuid primary key default gen_random_uuid(), user_id uuid not null references auth.users(id) on delete cascade, training_session_id uuid references public.training_sessions(id) on delete set null, metric_date date not null default current_date, attack_score numeric(5,2) check (attack_score between 0 and 100), defence_score numeric(5,2) check (defence_score between 0 and 100), footwork_score numeric(5,2) check (footwork_score between 0 and 100), reaction_score numeric(5,2) check (reaction_score between 0 and 100), conditioning_score numeric(5,2) check (conditioning_score between 0 and 100), technique_notes text, coach_notes text, created_at timestamptz not null default now(), updated_at timestamptz not null default now());
create table if not exists public.poomsae_performances (id uuid primary key default gen_random_uuid(), user_id uuid not null references auth.users(id) on delete cascade, tournament_id uuid references public.tournaments(id) on delete set null, performance_date date not null default current_date, category text, format text check (format in ('individual','pair','team')), poomsae_name text not null, technical_score numeric(5,2) check (technical_score>=0), presentation_score numeric(5,2) check (presentation_score>=0), total_score numeric(6,2) check (total_score>=0), judge_scores jsonb not null default '[]'::jsonb, coach_feedback text, preparation_notes text, result text, created_at timestamptz not null default now(), updated_at timestamptz not null default now());
create table if not exists public.poomsae_training_metrics (id uuid primary key default gen_random_uuid(), user_id uuid not null references auth.users(id) on delete cascade, training_session_id uuid references public.training_sessions(id) on delete set null, metric_date date not null default current_date, technical_execution_score numeric(5,2) check (technical_execution_score between 0 and 100), presentation_score numeric(5,2) check (presentation_score between 0 and 100), balance_score numeric(5,2) check (balance_score between 0 and 100), power_score numeric(5,2) check (power_score between 0 and 100), precision_score numeric(5,2) check (precision_score between 0 and 100), poomsae_name text, coach_notes text, preparation_notes text, created_at timestamptz not null default now(), updated_at timestamptz not null default now());

create index if not exists profiles_sport_discipline_idx on public.profiles(sport,discipline);
create index if not exists kyorugi_bouts_user_date_idx on public.kyorugi_bouts(user_id,bout_date desc);
create index if not exists kyorugi_metrics_user_date_idx on public.kyorugi_training_metrics(user_id,metric_date desc);
create index if not exists poomsae_performances_user_date_idx on public.poomsae_performances(user_id,performance_date desc);
create index if not exists poomsae_metrics_user_date_idx on public.poomsae_training_metrics(user_id,metric_date desc);

alter table public.kyorugi_bouts enable row level security;
alter table public.kyorugi_training_metrics enable row level security;
alter table public.poomsae_performances enable row level security;
alter table public.poomsae_training_metrics enable row level security;
drop policy if exists kyorugi_bouts_own on public.kyorugi_bouts;
drop policy if exists kyorugi_metrics_own on public.kyorugi_training_metrics;
drop policy if exists poomsae_performances_own on public.poomsae_performances;
drop policy if exists poomsae_metrics_own on public.poomsae_training_metrics;
create policy kyorugi_bouts_own on public.kyorugi_bouts for all to authenticated using (user_id=auth.uid()) with check (user_id=auth.uid());
create policy kyorugi_metrics_own on public.kyorugi_training_metrics for all to authenticated using (user_id=auth.uid()) with check (user_id=auth.uid());
create policy poomsae_performances_own on public.poomsae_performances for all to authenticated using (user_id=auth.uid()) with check (user_id=auth.uid());
create policy poomsae_metrics_own on public.poomsae_training_metrics for all to authenticated using (user_id=auth.uid()) with check (user_id=auth.uid());
