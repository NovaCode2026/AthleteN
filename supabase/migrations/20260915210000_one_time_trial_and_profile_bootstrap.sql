create extension if not exists pgcrypto;

create table if not exists public.account_entitlements (
  user_id uuid primary key references auth.users(id) on delete cascade,
  selected_plan_id text not null default 'free' check (selected_plan_id in ('free','student','pro','champion','academy')),
  trial_claimed_at timestamptz,
  trial_plan_id text check (trial_plan_id is null or trial_plan_id in ('student','pro','champion','academy')),
  trial_started_at timestamptz,
  trial_ends_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists account_entitlements_trial_idx on public.account_entitlements(trial_ends_at);
alter table public.account_entitlements enable row level security;
drop policy if exists account_entitlements_select_own on public.account_entitlements;
create policy account_entitlements_select_own on public.account_entitlements for select to authenticated using ((select auth.uid()) = user_id);

create or replace function public.bootstrap_profile_from_auth() returns trigger
language plpgsql security definer set search_path = public
as $$
declare v_name text;
begin
  v_name := nullif(btrim(coalesce(new.raw_user_meta_data->>'full_name', new.raw_user_meta_data->>'name', '')),'');
  if v_name is null then v_name := nullif(btrim(split_part(coalesce(new.email,''),'@',1)),''); end if;
  if v_name is null then v_name := 'Athlete'; end if;
  insert into public.profiles(user_id,full_name,plan_id,role,verified_athlete,founder_badge)
  values(new.id,v_name,'free','user',false,false)
  on conflict(user_id) do nothing;
  return new;
end;
$$;
revoke all on function public.bootstrap_profile_from_auth() from public;
drop trigger if exists on_auth_user_created_bootstrap_profile on auth.users;
create trigger on_auth_user_created_bootstrap_profile after insert on auth.users for each row execute function public.bootstrap_profile_from_auth();

create or replace function public.choose_account_plan(p_plan_id text, p_start_trial boolean default false)
returns public.account_entitlements
language plpgsql security definer set search_path = public
as $$
declare v_user uuid := auth.uid(); v_row public.account_entitlements; v_now timestamptz := now(); v_end timestamptz;
begin
  if v_user is null then raise exception 'Authentication required'; end if;
  if p_plan_id not in ('free','student','pro','champion','academy') then raise exception 'Invalid plan'; end if;
  select * into v_row from public.account_entitlements where user_id=v_user for update;
  if p_start_trial then
    if p_plan_id='free' then raise exception 'The Free plan does not need a trial.'; end if;
    if v_row.trial_claimed_at is not null then raise exception 'Your one-time trial has already been used.'; end if;
    v_end := v_now + interval '7 days';
    insert into public.account_entitlements(user_id,selected_plan_id,trial_claimed_at,trial_plan_id,trial_started_at,trial_ends_at,updated_at)
    values(v_user,p_plan_id,v_now,p_plan_id,v_now,v_end,v_now)
    on conflict(user_id) do update set selected_plan_id=excluded.selected_plan_id,trial_claimed_at=excluded.trial_claimed_at,trial_plan_id=excluded.trial_plan_id,trial_started_at=excluded.trial_started_at,trial_ends_at=excluded.trial_ends_at,updated_at=v_now
    returning * into v_row;
    insert into public.subscriptions(user_id,plan_id,provider,status,current_period_end)
    values(v_user,p_plan_id,'manual','trialing',v_end)
    on conflict(user_id) do update set plan_id=excluded.plan_id,provider='manual',status='trialing',current_period_end=v_end,updated_at=v_now;
  else
    if p_plan_id <> 'free' then raise exception 'A paid plan requires an active trial or authorized billing.'; end if;
    insert into public.account_entitlements(user_id,selected_plan_id,updated_at)
    values(v_user,'free',v_now)
    on conflict(user_id) do update set selected_plan_id='free',updated_at=v_now
    returning * into v_row;
    update public.subscriptions set status='canceled',current_period_end=v_now,updated_at=v_now where user_id=v_user and status='trialing';
  end if;
  return v_row;
end;
$$;
revoke all on function public.choose_account_plan(text,boolean) from public,anon;
grant execute on function public.choose_account_plan(text,boolean) to authenticated;

create or replace function public.change_account_plan(p_plan_id text)
returns public.account_entitlements
language plpgsql security definer set search_path = public
as $$
declare v_user uuid := auth.uid(); v_row public.account_entitlements; v_now timestamptz := now();
begin
  if v_user is null then raise exception 'Authentication required'; end if;
  if p_plan_id not in ('free','student','pro','champion','academy') then raise exception 'Invalid plan'; end if;
  select * into v_row from public.account_entitlements where user_id=v_user for update;
  if not found then raise exception 'Choose your account plan first.'; end if;
  if p_plan_id='free' then
    update public.account_entitlements set selected_plan_id='free',updated_at=v_now where user_id=v_user returning * into v_row;
    update public.subscriptions set status='canceled',current_period_end=v_now,updated_at=v_now where user_id=v_user and status='trialing';
    return v_row;
  end if;
  if v_row.trial_claimed_at is null or v_row.trial_ends_at is null or v_row.trial_ends_at <= v_now then raise exception 'Your one-time trial is not active.'; end if;
  update public.account_entitlements set selected_plan_id=p_plan_id,trial_plan_id=p_plan_id,updated_at=v_now where user_id=v_user returning * into v_row;
  update public.subscriptions set plan_id=p_plan_id,updated_at=v_now where user_id=v_user and status='trialing';
  return v_row;
end;
$$;
revoke all on function public.change_account_plan(text) from public,anon;
grant execute on function public.change_account_plan(text) to authenticated;

insert into public.account_entitlements(user_id,selected_plan_id)
select p.user_id,coalesce(p.plan_id,'free') from public.profiles p
on conflict(user_id) do nothing;
