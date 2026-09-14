create or replace function public.search_messaging_users(p_query text)
returns table (user_id uuid, full_name text, academy text, role text)
language sql
security definer
set search_path = public
as $$
  select p.user_id, p.full_name, p.academy, p.role
  from public.profiles p
  where p.user_id <> (select auth.uid())
    and length(trim(coalesce(p_query, ''))) >= 2
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
  v_user uuid := auth.uid();
  v_conversation uuid;
begin
  if v_user is null then raise exception 'Authentication required'; end if;
  if p_recipient_id is null or p_recipient_id = v_user then raise exception 'Invalid recipient'; end if;
  if not exists (select 1 from public.profiles where user_id = p_recipient_id) then raise exception 'Recipient not found'; end if;

  select c.id into v_conversation
  from public.conversations c
  join public.conversation_members m1 on m1.conversation_id = c.id and m1.user_id = v_user
  join public.conversation_members m2 on m2.conversation_id = c.id and m2.user_id = p_recipient_id
  where c.kind = 'direct'
  group by c.id
  having count(*) = 2
  limit 1;

  if v_conversation is not null then return v_conversation; end if;

  insert into public.conversations (kind, created_by)
  values ('direct', v_user)
  returning id into v_conversation;

  insert into public.conversation_members (conversation_id, user_id)
  values (v_conversation, v_user), (v_conversation, p_recipient_id);

  return v_conversation;
end;
$$;

create or replace function public.add_group_member_by_user(p_conversation_id uuid, p_user_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user uuid := auth.uid();
begin
  if v_user is null then raise exception 'Authentication required'; end if;
  if not exists (
    select 1 from public.conversations
    where id = p_conversation_id and kind = 'group' and created_by = v_user
  ) then raise exception 'Only the group creator can add members'; end if;
  if not exists (select 1 from public.profiles where user_id = p_user_id) then raise exception 'User not found'; end if;
  insert into public.conversation_members (conversation_id, user_id)
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
