-- Day 3 core integrity fixes.
-- account_entitlements is the authoritative account-plan source.
-- profiles.plan_id and subscriptions are synchronized projections for legacy/UI consumers.

-- Repair profiles created by the old bootstrap implementation.
update public.profiles
set role = 'athlete'
where role::text = 'user';

-- Repair the auth bootstrap trigger so newly-created profiles use a valid role.
create or replace function public.bootstrap_profile_from_auth() returns trigger
language plpgsql security definer set search_path = public
as $$
declare
  v_name text;
begin
  v_name := nullif(btrim(coalesce(new.raw_user_meta_data->>'full_name', new.raw_user_meta_data->>'name', '')),'');
  if v_name is null then v_name := nullif(btrim(split_part(coalesce(new.email,''),'@',1)),''); end if;
  if v_name is null then v_name := 'Athlete'; end if;
  insert into public.profiles(user_id,full_name,plan_id,role,verified_athlete,founder_badge)
  values(new.id,v_name,'free','athlete',false,false)
  on conflict(user_id) do nothing;
  insert into public.account_entitlements(user_id,selected_plan_id)
  values(new.id,'free')
  on conflict(user_id) do nothing;
  return new;
end;
$$;

-- Keep the canonical entitlement and legacy/UI projections synchronized.
create or replace function public.sync_account_entitlement_to_profile() returns trigger
language plpgsql security definer set search_path = public
as $$
declare
  v_role text;
begin
  v_role := case new.selected_plan_id
    when 'champion' then 'coach'
    when 'academy' then 'academy_admin'
    else 'athlete'
  end;

  update public.profiles
  set plan_id = new.selected_plan_id,
      role = case
        when role in ('support_admin','admin','super_admin') then role
        else v_role
      end
  where user_id = new.user_id;

  if new.selected_plan_id = 'free' then
    update public.subscriptions
    set status = 'canceled', current_period_end = coalesce(new.updated_at, now()), updated_at = now()
    where user_id = new.user_id and status = 'trialing';
  elsif new.trial_ends_at is not null and new.trial_ends_at > now() then
    insert into public.subscriptions(user_id,plan_id,provider,status,current_period_end)
    values(new.user_id,new.selected_plan_id,'manual','trialing',new.trial_ends_at)
    on conflict(user_id) do update
      set plan_id = excluded.plan_id,
          provider = 'manual',
          status = 'trialing',
          current_period_end = excluded.current_period_end,
          updated_at = now();
  end if;
  return new;
end;
$$;

drop trigger if exists trg_sync_account_entitlement_to_profile on public.account_entitlements;
create trigger trg_sync_account_entitlement_to_profile
after insert or update of selected_plan_id, trial_ends_at on public.account_entitlements
for each row execute function public.sync_account_entitlement_to_profile();

-- Make account_entitlements authoritative even when a client tries to write
-- plan_id or a normal-user role directly through profiles.
create or replace function public.enforce_profile_entitlement_projection() returns trigger
language plpgsql security definer set search_path = public
as $$
declare
  v_plan text;
  v_role text;
begin
  select selected_plan_id into v_plan
  from public.account_entitlements
  where user_id = new.user_id;

  if v_plan is not null then
    new.plan_id := v_plan;
    if coalesce(old.role::text, 'athlete') not in ('support_admin','admin','super_admin') then
      v_role := case v_plan when 'champion' then 'coach' when 'academy' then 'academy_admin' else 'athlete' end;
      new.role := v_role;
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_enforce_profile_entitlement_projection on public.profiles;
create trigger trg_enforce_profile_entitlement_projection
before update of plan_id, role on public.profiles
for each row execute function public.enforce_profile_entitlement_projection();

-- Ensure existing accounts have the authoritative entitlement and synchronize projections.
insert into public.account_entitlements(user_id,selected_plan_id)
select p.user_id, coalesce(p.plan_id,'free')
from public.profiles p
on conflict(user_id) do nothing;

update public.account_entitlements ae
set updated_at = now()
where exists (select 1 from public.profiles p where p.user_id = ae.user_id);

-- Separate Kyorugi rounds from Poomsae repetitions. Existing Poomsae values
-- stored in the old rounds field are copied into the new semantic column.
alter table public.taekwondo_training_logs
  add column if not exists repetitions integer;

update public.taekwondo_training_logs
set repetitions = rounds
where discipline = 'poomsae'
  and repetitions is null
  and rounds is not null;

alter table public.taekwondo_training_logs
  drop constraint if exists taekwondo_training_logs_repetitions_check;
alter table public.taekwondo_training_logs
  add constraint taekwondo_training_logs_repetitions_check
  check (repetitions is null or repetitions >= 0);

alter table public.taekwondo_training_logs
  drop constraint if exists taekwondo_training_logs_rounds_check;
alter table public.taekwondo_training_logs
  add constraint taekwondo_training_logs_rounds_check
  check (rounds is null or rounds >= 0);

-- Poomsae scores use the conventional 0-10 scale used by the current UI.
alter table public.taekwondo_poomsae_performances
  drop constraint if exists taekwondo_poomsae_score_range_check;
alter table public.taekwondo_poomsae_performances
  add constraint taekwondo_poomsae_score_range_check
  check (score is null or (score >= 0 and score <= 10));
