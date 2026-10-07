-- Canonical mobile/web plan IDs and cross-device navigation preferences.
-- Canonical IDs: free, student, pro, elite, coach, academy.

create table if not exists public.user_navigation_preferences (
  user_id uuid primary key references auth.users(id) on delete cascade,
  item_ids text[] not null default array['index','training','ai','compete','profile','explore'],
  updated_at timestamptz not null default now()
);

alter table public.user_navigation_preferences enable row level security;
drop policy if exists "user navigation own" on public.user_navigation_preferences;
create policy "user navigation own" on public.user_navigation_preferences
for all to authenticated
using (user_id=auth.uid() or private.is_platform_admin())
with check (user_id=auth.uid() or private.is_platform_admin());

create or replace function public.get_my_navigation_preferences()
returns text[] language sql security invoker set search_path=public as $$
  select coalesce((select item_ids from public.user_navigation_preferences where user_id=auth.uid()), array['index','training','ai','compete','profile','explore']::text[]);
$$;

create or replace function public.set_my_navigation_preferences(p_item_ids text[])
returns text[] language plpgsql security invoker set search_path=public as $$
declare v_ids text[];
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  if p_item_ids is null or cardinality(p_item_ids)=0 then raise exception 'Navigation cannot be empty'; end if;
  v_ids := array(select distinct x from unnest(p_item_ids) x where x is not null and length(trim(x))>0 limit 6);
  if cardinality(v_ids)=0 then raise exception 'Navigation cannot be empty'; end if;
  insert into public.user_navigation_preferences(user_id,item_ids) values(auth.uid(),v_ids)
  on conflict(user_id) do update set item_ids=excluded.item_ids,updated_at=now();
  return v_ids;
end;
$$;

revoke all on function public.get_my_navigation_preferences() from public,anon;
grant execute on function public.get_my_navigation_preferences() to authenticated;
revoke all on function public.set_my_navigation_preferences(text[]) from public,anon;
grant execute on function public.set_my_navigation_preferences(text[]) to authenticated;

create or replace function public.sync_account_entitlement_to_profile()
returns trigger language plpgsql security definer set search_path=public as $$
declare v_role text;
begin
  v_role:=case new.selected_plan_id when 'coach' then 'coach' when 'academy' then 'academy_admin' else 'athlete' end;
  update public.profiles set plan_id=new.selected_plan_id,
    role=case when role::text in ('support_admin','admin','super_admin') then role else v_role end
    where user_id=new.user_id;
  return new;
end;
$$;

create or replace function public.enforce_profile_entitlement_projection()
returns trigger language plpgsql security definer set search_path=public as $$
declare v_plan text; v_role text;
begin
  select selected_plan_id into v_plan from public.account_entitlements where user_id=new.user_id;
  if v_plan is not null then
    new.plan_id:=v_plan;
    if coalesce(old.role::text,'athlete') not in ('support_admin','admin','super_admin') then
      new.role:=case when v_plan='coach' then 'coach' when v_plan='academy' then 'academy_admin' else 'athlete' end;
    end if;
  end if;
  return new;
end;
$$;

create or replace function public.choose_account_plan(p_plan_id text,p_start_trial boolean default false)
returns public.account_entitlements language plpgsql security definer set search_path=public as $$
declare v_user uuid:=auth.uid(); v_row public.account_entitlements; v_now timestamptz:=now(); v_end timestamptz;
begin
  if v_user is null then raise exception 'Authentication required'; end if;
  if p_plan_id not in ('free','student','pro','elite','coach','academy') then raise exception 'Invalid plan'; end if;
  select * into v_row from public.account_entitlements where user_id=v_user for update;
  if not found then insert into public.account_entitlements(user_id,selected_plan_id,updated_at) values(v_user,'free',v_now) returning * into v_row; end if;
  if p_plan_id='free' then
    update public.account_entitlements set selected_plan_id='free',updated_at=v_now where user_id=v_user returning * into v_row;
    update public.subscriptions set status='canceled',current_period_end=v_now,updated_at=v_now where user_id=v_user and status='trialing';
    return v_row;
  end if;
  if p_start_trial is distinct from true then raise exception 'Paid plans require the one-time trial payment before access is activated.'; end if;
  if v_row.trial_claimed_at is not null then raise exception 'Your one-time trial has already been used.'; end if;
  if coalesce(v_row.trial_payment_status,'not_required')<>'paid' then raise exception 'Complete the ₹9 trial payment before using the trial.'; end if;
  v_end:=v_now+interval '7 days';
  update public.account_entitlements set selected_plan_id=p_plan_id,trial_claimed_at=coalesce(trial_claimed_at,v_now),trial_plan_id=p_plan_id,trial_started_at=coalesce(trial_started_at,v_now),trial_ends_at=v_end,updated_at=v_now where user_id=v_user returning * into v_row;
  insert into public.subscriptions(user_id,plan_id,provider,status,current_period_end) values(v_user,p_plan_id,coalesce(v_row.trial_payment_provider,'manual'),'trialing',v_end)
  on conflict(user_id) do update set plan_id=excluded.plan_id,provider=excluded.provider,status='trialing',current_period_end=excluded.current_period_end,updated_at=v_now;
  return v_row;
end;
$$;

create or replace function public.activate_trial_after_payment(p_user_id uuid,p_plan_id text,p_provider text,p_payment_reference text,p_amount_paise integer default 900)
returns public.account_entitlements language plpgsql security definer set search_path=public as $$
declare v_row public.account_entitlements; v_now timestamptz:=now(); v_end timestamptz;
begin
  if p_user_id is null then raise exception 'User is required'; end if;
  if p_plan_id not in ('student','pro','elite','coach','academy') then raise exception 'Invalid trial plan'; end if;
  if p_amount_paise<>900 then raise exception 'Invalid trial payment amount'; end if;
  if p_provider is null or btrim(p_provider)='' then raise exception 'Payment provider is required'; end if;
  if p_payment_reference is null or btrim(p_payment_reference)='' then raise exception 'Payment reference is required'; end if;
  select * into v_row from public.account_entitlements where user_id=p_user_id for update;
  if not found then insert into public.account_entitlements(user_id,selected_plan_id,trial_fee_paise,trial_payment_status,updated_at) values(p_user_id,'free',900,'not_required',v_now) returning * into v_row; end if;
  if v_row.trial_claimed_at is not null then return v_row; end if;
  v_end:=v_now+interval '7 days';
  update public.account_entitlements set trial_fee_paise=900,trial_payment_status='paid',trial_payment_provider=p_provider,trial_payment_reference=p_payment_reference,selected_plan_id=p_plan_id,trial_claimed_at=v_now,trial_plan_id=p_plan_id,trial_started_at=v_now,trial_ends_at=v_end,updated_at=v_now where user_id=p_user_id returning * into v_row;
  insert into public.subscriptions(user_id,plan_id,provider,provider_subscription_id,status,current_period_end) values(p_user_id,p_plan_id,p_provider,p_payment_reference,'trialing',v_end)
  on conflict(user_id) do update set plan_id=excluded.plan_id,provider=excluded.provider,provider_subscription_id=excluded.provider_subscription_id,status='trialing',current_period_end=v_end,updated_at=v_now;
  return v_row;
end;
$$;

-- Security hardening: navigation writes accept only known mobile route IDs.
create or replace function public.set_my_navigation_preferences(p_item_ids text[])
returns text[] language plpgsql security invoker set search_path=public as $$
declare
  v_ids text[];
  v_allowed constant text[] := array[
    'index','training','ai','compete','profile','explore',
    'calendar','journey','weight','messages','documents','attendance',
    'analytics','competition-analysis','reports','coach','verification-review','academy'
  ];
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  if p_item_ids is null or cardinality(p_item_ids)=0 then raise exception 'Navigation cannot be empty'; end if;
  v_ids := array(
    select distinct x from unnest(p_item_ids) as u(x)
    where x = any(v_allowed) and length(trim(x)) > 0 limit 6
  );
  if cardinality(v_ids)=0 then raise exception 'Navigation contains no supported features'; end if;
  insert into public.user_navigation_preferences(user_id,item_ids) values(auth.uid(),v_ids)
  on conflict(user_id) do update set item_ids=excluded.item_ids,updated_at=now();
  return v_ids;
end;
$$;
revoke all on function public.set_my_navigation_preferences(text[]) from public,anon;
grant execute on function public.set_my_navigation_preferences(text[]) to authenticated;

-- Trigger-only audit function; never expose it as an RPC endpoint.
revoke all on function public.audit_athlete_record_change() from public,anon,authenticated;
