alter table public.account_entitlements
  add column if not exists trial_fee_paise integer,
  add column if not exists trial_payment_status text,
  add column if not exists trial_payment_provider text,
  add column if not exists trial_payment_reference text;

update public.account_entitlements
set trial_fee_paise = coalesce(trial_fee_paise, 900),
    trial_payment_status = coalesce(trial_payment_status, 'not_required')
where trial_fee_paise is null or trial_payment_status is null;

alter table public.account_entitlements
  alter column trial_fee_paise set default 900,
  alter column trial_payment_status set default 'not_required';

alter table public.account_entitlements
  drop constraint if exists account_entitlements_trial_payment_status_check;
alter table public.account_entitlements
  add constraint account_entitlements_trial_payment_status_check
  check (trial_payment_status in ('not_required','pending','paid','failed','refunded'));

create or replace function public.activate_trial_after_payment(
  p_user_id uuid,
  p_plan_id text,
  p_provider text,
  p_payment_reference text,
  p_amount_paise integer default 900
)
returns public.account_entitlements
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row public.account_entitlements;
  v_now timestamptz := now();
  v_end timestamptz;
begin
  if p_user_id is null then raise exception 'User is required'; end if;
  if p_plan_id not in ('student','pro','champion') then raise exception 'Invalid trial plan'; end if;
  if p_amount_paise <> 900 then raise exception 'Invalid trial payment amount'; end if;
  if p_provider is null or btrim(p_provider) = '' then raise exception 'Payment provider is required'; end if;
  if p_payment_reference is null or btrim(p_payment_reference) = '' then raise exception 'Payment reference is required'; end if;

  select * into v_row from public.account_entitlements where user_id = p_user_id for update;
  if not found then
    insert into public.account_entitlements(user_id, selected_plan_id, trial_fee_paise, trial_payment_status, updated_at)
    values(p_user_id, 'free', 900, 'not_required', v_now)
    returning * into v_row;
  end if;

  if v_row.trial_claimed_at is not null then return v_row; end if;
  if v_row.trial_payment_status = 'paid' and v_row.trial_payment_reference = p_payment_reference then return v_row; end if;

  v_end := v_now + interval '7 days';
  update public.account_entitlements
  set trial_fee_paise = 900,
      trial_payment_status = 'paid',
      trial_payment_provider = p_provider,
      trial_payment_reference = p_payment_reference,
      selected_plan_id = p_plan_id,
      trial_claimed_at = v_now,
      trial_plan_id = p_plan_id,
      trial_started_at = v_now,
      trial_ends_at = v_end,
      updated_at = v_now
  where user_id = p_user_id
  returning * into v_row;

  insert into public.subscriptions(user_id, plan_id, provider, provider_subscription_id, status, current_period_end)
  values(p_user_id, p_plan_id, p_provider, p_payment_reference, 'trialing', v_end)
  on conflict(user_id) do update
    set plan_id = excluded.plan_id,
        provider = excluded.provider,
        provider_subscription_id = excluded.provider_subscription_id,
        status = 'trialing',
        current_period_end = v_end,
        updated_at = v_now;

  return v_row;
end;
$$;

revoke all on function public.activate_trial_after_payment(uuid,text,text,text,integer) from public, anon, authenticated;
grant execute on function public.activate_trial_after_payment(uuid,text,text,text,integer) to service_role;
