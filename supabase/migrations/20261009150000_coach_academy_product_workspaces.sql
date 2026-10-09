-- AthleteN: separate Coach/Academy products, multi-product subscriptions, and safe workspace switching.

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
returns jsonb
language plpgsql
security definer
set search_path=''
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
    select count(*) into v_active_coach_links
    from public.coach_athlete_links
    where coach_user_id=v_user and status in ('pending','active');
    if v_active_coach_links > 0 then raise exception 'COACH_HAS_ACTIVE_ATHLETES'; end if;
  elsif v_current='academy_admin' and p_target_role<>'academy_admin' then
    select count(*) into v_active_academy_members
    from public.academy_memberships am
    join public.academies a on a.id=am.academy_id
    where a.owner_user_id=v_user
      and am.status in ('invited','active')
      and am.user_id<>v_user;
    if v_active_academy_members > 0 then raise exception 'ACADEMY_HAS_ACTIVE_MEMBERS'; end if;
  end if;

  insert into public.account_product_roles(user_id,role)
  values(v_user,p_target_role)
  on conflict do nothing;

  perform set_config('athleten.privileged_profile_mutation','1',true);
  update public.profiles
  set role=p_target_role,
      plan_id=case p_target_role
        when 'athlete' then 'free'
        when 'coach' then 'coach'
        when 'academy_admin' then 'academy'
      end,
      updated_at=now()
  where user_id=v_user;
  perform set_config('athleten.privileged_profile_mutation','',true);

  return jsonb_build_object('role',p_target_role,'changed',v_current<>p_target_role);
end;
$$;

revoke all on function public.switch_my_product_role(text) from public;
revoke all on function public.switch_my_product_role(text) from anon;
grant execute on function public.switch_my_product_role(text) to authenticated;

create or replace function public.activate_paid_subscription(
  p_user_id uuid,
  p_plan_id text,
  p_provider text,
  p_provider_customer_id text default null,
  p_provider_subscription_id text default null,
  p_current_period_end timestamptz default null
) returns public.subscriptions
language plpgsql
security definer
set search_path=public
as $$
declare
  result public.subscriptions;
  v_role text;
begin
  if p_user_id is null or p_plan_id is null then raise exception 'USER_AND_PLAN_REQUIRED'; end if;
  select role into v_role from public.profiles where user_id=p_user_id;
  if v_role is null then raise exception 'PROFILE_NOT_FOUND'; end if;

  if p_plan_id='student' then
    if v_role<>'athlete' or not exists(
      select 1 from public.student_verifications
      where user_id=p_user_id and status='approved'
    ) then raise exception 'STUDENT_NOT_VERIFIED'; end if;
  elsif p_plan_id in ('pro','elite') and v_role<>'athlete' then
    raise exception 'ATHLETE_PLAN_REQUIRES_ATHLETE_ROLE';
  elsif p_plan_id='coach' and v_role<>'coach' then
    raise exception 'COACH_PLAN_REQUIRES_COACH_ROLE';
  elsif p_plan_id='academy' and v_role<>'academy_admin' then
    raise exception 'ACADEMY_PLAN_REQUIRES_ACADEMY_ROLE';
  elsif p_plan_id not in ('student','pro','elite','coach','academy') then
    raise exception 'INVALID_PAID_PLAN';
  end if;

  insert into public.subscriptions(
    user_id,plan_id,provider,provider_customer_id,
    provider_subscription_id,status,current_period_end
  )
  values(
    p_user_id,p_plan_id,p_provider,p_provider_customer_id,
    p_provider_subscription_id,'active',p_current_period_end
  )
  on conflict(user_id,plan_id) do update set
    provider=excluded.provider,
    provider_customer_id=excluded.provider_customer_id,
    provider_subscription_id=excluded.provider_subscription_id,
    status='active',
    current_period_end=excluded.current_period_end,
    updated_at=now()
  returning * into result;

  update public.profiles
  set plan_id=case
    when p_plan_id in ('student','pro','elite') and v_role='athlete' then p_plan_id
    when p_plan_id='coach' and v_role='coach' then 'coach'
    when p_plan_id='academy' and v_role='academy_admin' then 'academy'
    else plan_id
  end,
  updated_at=now()
  where user_id=p_user_id;

  insert into public.account_entitlements(user_id,selected_plan_id,updated_at)
  values(p_user_id,p_plan_id,now())
  on conflict(user_id) do update set
    selected_plan_id=excluded.selected_plan_id,
    updated_at=now();

  return result;
end;
$$;

revoke all on function public.activate_paid_subscription(uuid,text,text,text,text,timestamptz) from public;
revoke all on function public.activate_paid_subscription(uuid,text,text,text,text,timestamptz) from anon;
revoke all on function public.activate_paid_subscription(uuid,text,text,text,text,timestamptz) from authenticated;
grant execute on function public.activate_paid_subscription(uuid,text,text,text,text,timestamptz) to service_role;

create or replace function public.admin_set_user_role(p_user_id uuid,p_role text)
returns void
language plpgsql
security definer
set search_path=public
as $$
declare
  v_old text;
  v_name text;
begin
 if auth.uid() is null or not public.is_platform_admin() then raise exception 'Administrator access required'; end if;
 if p_role not in ('athlete','coach','academy_admin','support_admin','admin','super_admin') then raise exception 'Invalid role'; end if;
 if p_user_id=auth.uid() and p_role<>'super_admin' then raise exception 'Super Admin cannot demote itself'; end if;
 if p_role='super_admin' and not exists(
   select 1 from public.profiles where user_id=auth.uid() and role='super_admin'
 ) then raise exception 'Only a Super Admin can grant Super Admin'; end if;

 select role,full_name into v_old,v_name
 from public.profiles where user_id=p_user_id for update;
 if v_old is null then raise exception 'User profile not found'; end if;

 perform set_config('athleten.privileged_profile_mutation','1',true);
 update public.profiles set role=p_role,updated_at=now() where user_id=p_user_id;
 perform set_config('athleten.privileged_profile_mutation','',true);

 insert into public.audit_logs(actor_user_id,action,entity_table,entity_id,metadata)
 values(
   auth.uid(),'user.role_change','profiles',
   (select id from public.profiles where user_id=p_user_id),
   jsonb_build_object(
     'target_user_id',p_user_id,
     'target_name',v_name,
     'from',v_old,
     'to',p_role
   )
 );

 if p_role in ('support_admin','admin','super_admin') then
  insert into public.athlete_badges(
    user_id,badge_key,badge_label,awarded_by,permanent,metadata
  )
  values(
    p_user_id,'administrator','Administrator',null,true,
    jsonb_build_object('system_assigned',true,'role',p_role)
  )
  on conflict(user_id,badge_key) do update
    set permanent=true,metadata=excluded.metadata;
 end if;
end;
$$;

revoke all on function public.admin_set_user_role(uuid,text) from public;
revoke all on function public.admin_set_user_role(uuid,text) from anon;
grant execute on function public.admin_set_user_role(uuid,text) to authenticated;

insert into public.account_product_roles(user_id,role)
select user_id,role
from public.profiles
where role in ('athlete','coach','academy_admin')
on conflict do nothing;
