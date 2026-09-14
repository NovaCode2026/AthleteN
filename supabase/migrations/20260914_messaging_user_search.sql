-- Messaging user directory helpers. These expose only minimal profile fields to signed-in users.

create or replace function public.search_messaging_users(p_query text)
returns table (user_id uuid, full_name text, academy text, role text)
language sql
security definer
set search_path = public
as $$
  select p.user_id, p.full_name, p.academy, p.role
  from public.profiles p
  where auth.uid() is not null
    and p.user_id <> auth.uid()
    and char_length(trim(coalesce(p_query, ''))) >= 2
    and (
      p.full_name ilike '%' || trim(p_query) || '%'
      or coalesce(p.academy, '') ilike '%' || trim(p_query) || '%'
    )
  order by p.full_name
  limit 20;
$$;

create or replace function public.create_direct_conversation_by_user(p_recipient_id uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  caller uuid := auth.uid();
  existing_id uuid;
  conversation_id uuid;
begin
  if caller is null then raise exception 'Authentication required'; end if;
  if p_recipient_id is null then raise exception 'Recipient is required'; end if;
  if p_recipient_id = caller then raise exception 'You cannot message yourself'; end if;
  if not exists (select 1 from auth.users where id = p_recipient_id) then
    raise exception 'Recipient account not found';
  end if;

  select c.id into existing_id
  from public.conversations c
  where c.kind = 'direct'
    and exists (select 1 from public.conversation_members cm where cm.conversation_id = c.id and cm.user_id = caller)
    and exists (select 1 from public.conversation_members cm where cm.conversation_id = c.id and cm.user_id = p_recipient_id)
    and (select count(*) from public.conversation_members cm where cm.conversation_id = c.id) = 2
  limit 1;

  if existing_id is not null then return existing_id; end if;

  insert into public.conversations(kind, created_by)
  values ('direct', caller)
  returning id into conversation_id;

  insert into public.conversation_members(conversation_id, user_id)
  values (conversation_id, caller), (conversation_id, p_recipient_id);

  return conversation_id;
end;
$$;

create or replace function public.add_group_member_by_user(p_conversation_id uuid, p_user_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  caller uuid := auth.uid();
  creator uuid;
begin
  if caller is null then raise exception 'Authentication required'; end if;
  select created_by into creator
  from public.conversations
  where id = p_conversation_id and kind = 'group';
  if creator is null or creator <> caller then
    raise exception 'Only the group creator can add members';
  end if;
  if p_user_id is null or not exists (select 1 from auth.users where id = p_user_id) then
    raise exception 'Member account not found';
  end if;
  insert into public.conversation_members(conversation_id, user_id)
  values (p_conversation_id, p_user_id)
  on conflict do nothing;
end;
$$;

revoke all on function public.search_messaging_users(text) from public, anon;
grant execute on function public.search_messaging_users(text) to authenticated;
revoke all on function public.create_direct_conversation_by_user(uuid) from public, anon;
grant execute on function public.create_direct_conversation_by_user(uuid) to authenticated;
revoke all on function public.add_group_member_by_user(uuid, uuid) from public, anon;
grant execute on function public.add_group_member_by_user(uuid, uuid) to authenticated;
