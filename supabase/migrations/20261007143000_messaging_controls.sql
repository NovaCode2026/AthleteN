-- AthleteN messaging controls: leave/delete conversations and manage custom account codes.

create or replace function public.set_my_account_code(p_code text)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
  normalized text := lower(trim(coalesce(p_code,'')));
begin
  if uid is null then raise exception 'Authentication required'; end if;
  if normalized !~ '^[a-z0-9][a-z0-9._-]{2,29}$' then
    raise exception 'Account code must be 3-30 characters and use only letters, numbers, dots, underscores, or hyphens.';
  end if;
  if exists(select 1 from public.profiles where lower(trim(account_code))=normalized and user_id<>uid) then
    raise exception 'That account code is already in use.';
  end if;
  update public.profiles set account_code=normalized, username=normalized, updated_at=now() where user_id=uid;
  if not found then raise exception 'Profile not found'; end if;
  return normalized;
end;
$$;

revoke all on function public.set_my_account_code(text) from public, anon;
grant execute on function public.set_my_account_code(text) to authenticated;

create or replace function public.leave_my_conversation(p_conversation_id uuid)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
  is_member boolean;
  remaining integer;
begin
  if uid is null then raise exception 'Authentication required'; end if;
  select exists(select 1 from public.conversation_members where conversation_id=p_conversation_id and user_id=uid) into is_member;
  if not is_member then raise exception 'Conversation not found'; end if;

  delete from public.conversation_members where conversation_id=p_conversation_id and user_id=uid;
  select count(*) into remaining from public.conversation_members where conversation_id=p_conversation_id;

  if remaining=0 then
    delete from public.conversations where id=p_conversation_id;
  end if;
  return true;
end;
$$;

revoke all on function public.leave_my_conversation(uuid) from public, anon;
grant execute on function public.leave_my_conversation(uuid) to authenticated;
