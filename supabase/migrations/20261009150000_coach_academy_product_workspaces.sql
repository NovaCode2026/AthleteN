-- AthleteN product subscriptions and role workspaces
alter table public.subscriptions drop constraint if exists subscriptions_user_id_key;
alter table public.subscriptions add constraint subscriptions_user_id_plan_id_key unique (user_id, plan_id);

create table if not exists public.account_product_roles (
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null check (role in ('athlete','coach','academy_admin')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (user_id, role)
);

alter table public.account_product_roles enable row level security;
revoke all on public.account_product_roles from anon;
grant select on public.account_product_roles to authenticated;

drop policy if exists "Users can view own product roles" on public.account_product_roles;
create policy "Users can view own product roles"
on public.account_product_roles for select to authenticated
using ((select auth.uid()) = user_id);

create or replace function public.switch_my_product_role(p_target_role text)
returns jsonb language plpgsql security definer set search_path=''
as $$
declare
  v_user uuid := auth.uid();
  v_current text;
  v_active_coach_links integer := 0;
  v_active_academy_members integer := 0;
begin
  if v_user is null then raise exception 'Authentication required'; end if;
  if p_target_role not in ('athlete','coach','academy_admin') then raise exception 'Invalid product role'; end if;
  select role into v_current from public.profiles where user_id=v_user for update;
  if v_current is null then raise exception 'Profile not found'; end if;

  if v_current='coach' and p_target_role<>'coach' then
    select count(*) into v_active_coach_links from public.coach_athlete_links
    where coach_user_id=v_user and status in ('pending','active');
    if v_active_coach_links > 0 then raise exception 'COACH_HAS_ACTIVE_ATHLETES'; end if;
  elsif v_current='academy_admin' and p_target_role<>'academy_admin' then
    select count(*) into v_active_academy_members
    from public.academy_memberships am join public.academies a on a.id=am.academy_id
    where a.owner_user_id=v_user and am.status in ('invited','active') and am.user_id<>v_user;
    if v_active_academy_members > 0 then raise exception 'ACADEMY_HAS_ACTIVE_MEMBERS'; end if;
  end if;

  insert into public.account_product_roles(user_id,role) values(v_user,p_target_role)
  on conflict do nothing;

  perform set_config('athleten.privileged_profile_mutation','1',true);
  update public.profiles set role=p_target_role,
    plan_id=case p_target_role when 'athlete' then 'free' when 'coach' then 'coach' when 'academy_admin' then 'academy' end,
    updated_at=now() where user_id=v_user;
  perform set_config('athleten.privileged_profile_mutation','',true);

  return jsonb_build_object('role',p_target_role,'changed',v_current<>p_target_role);
end;
$$;

revoke all on function public.switch_my_product_role(text) from public;
revoke all on function public.switch_my_product_role(text) from anon;
grant execute on function public.switch_my_product_role(text) to authenticated;