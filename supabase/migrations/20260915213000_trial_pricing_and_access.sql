alter table public.account_entitlements
  add column if not exists trial_price_inr numeric(10,2) not null default 9.00,
  add column if not exists trial_access_level text not null default 'standard_trial' check (trial_access_level in ('standard_trial','full_paid'));

update public.account_entitlements
set trial_price_inr = 9.00,
    trial_access_level = 'standard_trial'
where trial_claimed_at is not null;

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
    if p_plan_id='free' then raise exception 'The ₹9 trial is for the app trial experience. Free access does not require a trial.'; end if;
    if v_row.trial_claimed_at is not null then raise exception 'Your one-time 7-day trial has already been used.'; end if;
    v_end := v_now + interval '7 days';
    insert into public.account_entitlements(user_id,selected_plan_id,trial_claimed_at,trial_plan_id,trial_started_at,trial_ends_at,trial_price_inr,trial_access_level,updated_at)
    values(v_user,p_plan_id,v_now,p_plan_id,v_now,v_end,9.00,'standard_trial',v_now)
    on conflict(user_id) do update set selected_plan_id=excluded.selected_plan_id,trial_claimed_at=excluded.trial_claimed_at,trial_plan_id=excluded.trial_plan_id,trial_started_at=excluded.trial_started_at,trial_ends_at=excluded.trial_ends_at,trial_price_inr=9.00,trial_access_level='standard_trial',updated_at=v_now
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
