create or replace function public.get_or_create_my_coach_finance_account()
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_role text;
  v_id uuid;
begin
  if v_uid is null then
    raise exception 'Not authenticated';
  end if;
  select role into v_role from public.profiles where user_id = v_uid;
  if v_role <> 'coach' then
    raise exception 'Only coach accounts can use coach finance';
  end if;
  select id into v_id from public.finance_accounts
  where owner_type = 'coach' and owner_user_id = v_uid
  order by created_at asc limit 1;
  if v_id is null then
    insert into public.finance_accounts(owner_user_id, owner_type, name, currency)
    values (v_uid, 'coach', 'Coach Finance', 'INR')
    returning id into v_id;
  end if;
  return v_id;
end;
$$;

revoke all on function public.get_or_create_my_coach_finance_account() from public;
grant execute on function public.get_or_create_my_coach_finance_account() to authenticated;