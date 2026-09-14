create or replace function public.create_direct_conversation_by_username(p_username text)
returns uuid
language plpgsql
security definer
set search_path=public
as $$
declare v_recipient uuid;
begin
  select p.user_id into v_recipient from public.profiles p where lower(p.username)=lower(btrim(p_username)) limit 1;
  if v_recipient is null then raise exception 'User not found'; end if;
  return public.create_direct_conversation_by_user(v_recipient);
end;
$$;
revoke all on function public.create_direct_conversation_by_username(text) from public,anon;
grant execute on function public.create_direct_conversation_by_username(text) to authenticated;
