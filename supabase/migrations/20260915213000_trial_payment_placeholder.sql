alter table public.account_entitlements
  add column if not exists trial_fee_paise integer not null default 900,
  add column if not exists trial_payment_status text not null default 'not_required' check (trial_payment_status in ('not_required','pending','paid','failed','refunded')),
  add column if not exists trial_payment_provider text,
  add column if not exists trial_payment_reference text;

create index if not exists account_entitlements_payment_status_idx on public.account_entitlements(trial_payment_status);

create or replace function public.choose_account_plan(p_plan_id text, p_start_trial boolean default false)
returns public.account_entitlements
language plpgsql security definer set search_path = public
as $$
declare
  v_user uuid := auth.uid();
  v_row public.account_entitlements;
  v_now timestamptz := now();
  v_end timestamptz;
begin
  if v_user is null then raise exception 'Authentication required'; end if;
  if p_plan_id not in ('free','student','pro','champion','academy') then raise exception 'Invalid plan'; end if;
  select * into v_row from public.account_entitlements where user_id=v_user for update;

  if p_start_trial then
    if p_plan_id='free' then raise exception 'The Free plan does not need a trial.'; end if;
    if v_row.trial_claimed_at is not null then raise exception 'Your one-time trial has already been used.'; end if;
    v_end := v_now + interval '7 days';
    insert into public.account_entitlements(user_id,selected_plan_id,trial_claimed_at,trial_plan_id,trial_started_at,trial_ends_at,trial_fee_paise,trial_payment_status,updated_at)
    values(v_user,p_plan_id,v_now,p_plan_id,v_now,v_end,900,'pending',v_now)
    on conflict(user_id) do update set selected_plan_id=excluded.selected_plan_id,trial_claimed_at=excluded.trial_claimed_at,trial_plan_id=excluded.trial_plan_id,trial_started_at=excluded.trial_started_at,trial_ends_at=excluded.trial_ends_at,trial_fee_paise=900,trial_payment_status='pending',updated_at=v_now
    returning * into v_row;
    insert into public.subscriptions(user_id,plan_id,provider,status,current_period_end)
    values(v_user,p_plan_id,'manual','trialing',v_end)
    on conflict(user_id) do update set plan_id=excluded.plan_id,provider='manual',status='trialing',current_period_end=v_end,updated_at=v_now;
  else
    if p_plan_id <> 'free' then raise exception 'A paid plan requires the ₹9 trial payment.'; end if;
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
