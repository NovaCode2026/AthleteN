-- Usernames are chosen by the account holder. Do not generate usernames automatically.
-- Existing usernames remain valid; users can change them from Messages/Profile.
drop trigger if exists profiles_username_trigger on public.profiles;
drop function if exists public.generate_profile_username();

-- Direct messaging by public username, including the official @novacode.admin account.
create or replace function public.create_direct_conversation_by_username(p_username text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user uuid := auth.uid();
  v_recipient uuid;
  v_conversation uuid;
  v_username text := lower(btrim(p_username));
begin
  if v_user is null then raise exception 'Authentication required'; end if;
  if v_username = '' then raise exception 'Username is required'; end if;

  select p.user_id into v_recipient
  from public.profiles p
  where lower(p.username) = v_username
  limit 1;

  if v_recipient is null then raise exception 'Username not found'; end if;
  if v_recipient = v_user then raise exception 'You cannot message yourself'; end if;

  select c.id into v_conversation
  from public.conversations c
  join public.conversation_members m1 on m1.conversation_id = c.id and m1.user_id = v_user
  join public.conversation_members m2 on m2.conversation_id = c.id and m2.user_id = v_recipient
  where c.kind = 'direct'
  group by c.id
  having count(*) = 2
  limit 1;

  if v_conversation is not null then return v_conversation; end if;

  insert into public.conversations (kind, created_by)
  values ('direct', v_user)
  returning id into v_conversation;

  insert into public.conversation_members (conversation_id, user_id)
  values (v_conversation, v_user), (v_conversation, v_recipient);

  return v_conversation;
end;
$$;

revoke all on function public.create_direct_conversation_by_username(text) from public, anon;
grant execute on function public.create_direct_conversation_by_username(text) to authenticated;
