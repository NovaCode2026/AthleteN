-- Strict trial lifecycle:
-- 1. A paid trial cannot be activated before payment is confirmed.
-- 2. An active trial cannot be switched to another plan.
-- 3. A used trial can never be started again.
-- 4. Once the seven-day trial expires, the authoritative plan returns to Free.

create or replace function public.normalize_account_trial(p_user_id uuid default auth.uid())
returns public.account_entitlements
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row public.account_entitlements;
  v_now timestamptz := now();
begin
  if p_user_id is null then raise exception 'Authentication required'; end if;
  select * into v_row from public.account_entitlements where user_id = p_user_id for update;
  if not found then raise exception 'Account entitlement not found.'; end if;

  if v_row.trial_ends_at is not null and v_row.trial_ends_at <= v_now
     and v_row.selected_plan_id <> 'free' then
    update public.account_entitlements
      set selected_plan_id = 'free',
          updated_at = v_now
      where user_id = p_user_id
      returning * into v_row;
    update public.subscriptions
      set status = 'canceled', current_period_end = v_now, updated_at = v_now
      where user_id = p_user_id and status = 'trialing';
  end if;
  return v_row;
end;
$$;
revoke all on function public.normalize_account_trial(uuid) from public, anon;
grant execute on function public.normalize_account_trial(uuid) to authenticated;

create or replace function public.get_account_entitlement()
returns public.account_entitlements
language plpgsql
security definer
set search_path = public
as $$
begin
  return public.normalize_account_trial(auth.uid());
end;
$$;
revoke all on function public.get_account_entitlement() from public, anon;
grant execute on function public.get_account_entitlement() to authenticated;

create or replace function public.choose_account_plan(p_plan_id text, p_start_trial boolean default false)
returns public.account_entitlements
language plpgsql
security definer
set search_path = public
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
  if not found then
    insert into public.account_entitlements(user_id,selected_plan_id,updated_at)
    values(v_user,'free',v_now)
    returning * into v_row;
  end if;

  if v_row.trial_ends_at is not null and v_row.trial_ends_at <= v_now and v_row.selected_plan_id <> 'free' then
    update public.account_entitlements set selected_plan_id='free', updated_at=v_now where user_id=v_user returning * into v_row;
    update public.subscriptions set status='canceled', current_period_end=v_now, updated_at=v_now where user_id=v_user and status='trialing';
  end if;

  if p_plan_id = 'free' then
    if v_row.trial_ends_at is not null and v_row.trial_ends_at > v_now then
      raise exception 'Your active trial cannot be changed before it ends.';
    end if;
    update public.account_entitlements set selected_plan_id='free', updated_at=v_now where user_id=v_user returning * into v_row;
    update public.subscriptions set status='canceled', current_period_end=v_now, updated_at=v_now where user_id=v_user and status='trialing';
    return v_row;
  end if;

  if p_start_trial is distinct from true then
    raise exception 'Paid plans require the one-time trial payment before access is activated.';
  end if;
  if v_row.trial_claimed_at is not null then
    raise exception 'Your one-time trial has already been used.';
  end if;
  if coalesce(v_row.trial_payment_status,'not_required') <> 'paid' then
    raise exception 'Complete the ₹9 trial payment before using the trial.';
  end if;

  v_end := v_now + interval '7 days';
  update public.account_entitlements
    set selected_plan_id=p_plan_id,
        trial_claimed_at=coalesce(trial_claimed_at,v_now),
        trial_plan_id=p_plan_id,
        trial_started_at=coalesce(trial_started_at,v_now),
        trial_ends_at=v_end,
        updated_at=v_now
    where user_id=v_user
    returning * into v_row;

  insert into public.subscriptions(user_id,plan_id,provider,status,current_period_end)
  values(v_user,p_plan_id,coalesce(v_row.trial_payment_provider,'manual'),'trialing',v_end)
  on conflict(user_id) do update set plan_id=excluded.plan_id,provider=excluded.provider,status='trialing',current_period_end=v_end,updated_at=v_now;
  return v_row;
end;
$$;
revoke all on function public.choose_account_plan(text,boolean) from public, anon;
grant execute on function public.choose_account_plan(text,boolean) to authenticated;

create or replace function public.change_account_plan(p_plan_id text)
returns public.account_entitlements
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user uuid := auth.uid();
  v_row public.account_entitlements;
  v_now timestamptz := now();
begin
  if v_user is null then raise exception 'Authentication required'; end if;
  if p_plan_id not in ('free','student','pro','champion','academy') then raise exception 'Invalid plan'; end if;
  select * into v_row from public.account_entitlements where user_id=v_user for update;
  if not found then raise exception 'Choose your account plan first.'; end if;

  if v_row.trial_ends_at is not null and v_row.trial_ends_at <= v_now and v_row.selected_plan_id <> 'free' then
    update public.account_entitlements set selected_plan_id='free', updated_at=v_now where user_id=v_user returning * into v_row;
    update public.subscriptions set status='canceled', current_period_end=v_now, updated_at=v_now where user_id=v_user and status='trialing';
  end if;

  if v_row.trial_ends_at is not null and v_row.trial_ends_at > v_now then
    raise exception 'Your trial plan is locked until the seven-day trial ends.';
  end if;

  if p_plan_id <> 'free' then
    raise exception 'A new paid plan requires payment. Your one-time trial cannot be reused.';
  end if;

  update public.account_entitlements set selected_plan_id='free',updated_at=v_now where user_id=v_user returning * into v_row;
  update public.subscriptions set status='canceled',current_period_end=v_now,updated_at=v_now where user_id=v_user and status='trialing';
  return v_row;
end;
$$;
revoke all on function public.change_account_plan(text) from public, anon;
grant execute on function public.change_account_plan(text) to authenticated;
