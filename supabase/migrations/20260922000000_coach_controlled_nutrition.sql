alter table public.profiles add column if not exists gender text;
alter table public.profiles add column if not exists sport text;
alter table public.profiles add column if not exists club text;
alter table public.profiles add column if not exists discipline text check (discipline is null or discipline in ('Kyorugi','Poomsae'));

create table if not exists public.athlete_feature_controls (
  id uuid primary key default gen_random_uuid(),
  athlete_user_id uuid not null references auth.users(id) on delete cascade,
  feature_key text not null,
  enabled boolean not null default false,
  set_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (athlete_user_id, feature_key)
);

create table if not exists public.nutrition_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  log_date date not null default current_date,
  meal_type text not null default 'meal' check (meal_type in ('breakfast','lunch','dinner','snack','meal')),
  meal_note text,
  calories integer check (calories is null or calories >= 0),
  protein_g numeric(6,1) check (protein_g is null or protein_g >= 0),
  carbs_g numeric(6,1) check (carbs_g is null or carbs_g >= 0),
  fat_g numeric(6,1) check (fat_g is null or fat_g >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.hydration_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  log_date date not null default current_date,
  water_ml integer not null check (water_ml > 0),
  note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_athlete_feature_controls_user_feature on public.athlete_feature_controls(athlete_user_id, feature_key);
create index if not exists idx_nutrition_logs_user_date on public.nutrition_logs(user_id, log_date desc);
create index if not exists idx_hydration_logs_user_date on public.hydration_logs(user_id, log_date desc);

alter table public.athlete_feature_controls enable row level security;
alter table public.nutrition_logs enable row level security;
alter table public.hydration_logs enable row level security;

create or replace function public.can_manage_athlete_feature(target_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.training_plans tp
    where tp.user_id = target_user_id
      and tp.coach_user_id = (select auth.uid())
      and tp.status <> 'archived'
  )
  or exists (
    select 1
    from public.academy_memberships coach_m
    join public.academy_memberships athlete_m on athlete_m.academy_id = coach_m.academy_id
    where coach_m.user_id = (select auth.uid())
      and coach_m.role = 'coach'
      and coach_m.status = 'active'
      and athlete_m.user_id = target_user_id
      and athlete_m.role = 'athlete'
      and athlete_m.status = 'active'
  )
  or private.is_super_admin();
$$;

revoke execute on function public.can_manage_athlete_feature(uuid) from public, anon;
grant execute on function public.can_manage_athlete_feature(uuid) to authenticated;

drop policy if exists "feature controls athlete read" on public.athlete_feature_controls;
drop policy if exists "feature controls athlete write" on public.athlete_feature_controls;
drop policy if exists "feature controls coach manage" on public.athlete_feature_controls;

create policy "feature controls athlete read"
on public.athlete_feature_controls for select to authenticated
using (athlete_user_id = (select auth.uid()) or public.can_manage_athlete_feature(athlete_user_id));

create policy "feature controls coach manage"
on public.athlete_feature_controls for all to authenticated
using (public.can_manage_athlete_feature(athlete_user_id))
with check (public.can_manage_athlete_feature(athlete_user_id));

create policy "feature controls athlete write"
on public.athlete_feature_controls for insert to authenticated
with check (athlete_user_id = (select auth.uid()) and false);

drop policy if exists "nutrition own rows" on public.nutrition_logs;
create policy "nutrition own rows" on public.nutrition_logs
for all to authenticated
using (user_id = (select auth.uid()))
with check (
  user_id = (select auth.uid())
  and exists (
    select 1 from public.athlete_feature_controls
    where athlete_user_id = (select auth.uid())
      and feature_key = 'nutrition'
      and enabled = true
  )
);

drop policy if exists "hydration own rows" on public.hydration_logs;
create policy "hydration own rows" on public.hydration_logs
for all to authenticated
using (user_id = (select auth.uid()))
with check (
  user_id = (select auth.uid())
  and exists (
    select 1 from public.athlete_feature_controls
    where athlete_user_id = (select auth.uid())
      and feature_key = 'nutrition'
      and enabled = true
  )
);

drop trigger if exists set_athlete_feature_controls_updated_at on public.athlete_feature_controls;
create trigger set_athlete_feature_controls_updated_at
before update on public.athlete_feature_controls
for each row execute function public.set_updated_at();

drop trigger if exists set_nutrition_logs_updated_at on public.nutrition_logs;
create trigger set_nutrition_logs_updated_at
before update on public.nutrition_logs
for each row execute function public.set_updated_at();

drop trigger if exists set_hydration_logs_updated_at on public.hydration_logs;
create trigger set_hydration_logs_updated_at
before update on public.hydration_logs
for each row execute function public.set_updated_at();

grant select, insert, update, delete on public.athlete_feature_controls to authenticated;
grant select, insert, update, delete on public.nutrition_logs to authenticated;
grant select, insert, update, delete on public.hydration_logs to authenticated;
