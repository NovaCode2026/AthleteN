-- Messaging UX: custom account codes, searchable identities, blocking and per-user conversation removal.
create table if not exists public.messaging_hidden_conversations (
  user_id uuid not null references auth.users(id) on delete cascade,
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  hidden_at timestamptz not null default now(),
  primary key (user_id, conversation_id)
);
alter table public.messaging_hidden_conversations enable row level security;
drop policy if exists "users manage hidden conversations" on public.messaging_hidden_conversations;
create policy "users manage hidden conversations" on public.messaging_hidden_conversations
for all to authenticated
using (user_id = auth.uid())
with check (user_id = auth.uid());

-- Let signed-in users display profile pictures in messaging. These are profile images,
-- not private documents.
drop policy if exists "authenticated can view profile avatars" on storage.objects;
create policy "authenticated can view profile avatars"
on storage.objects for select to authenticated
using (bucket_id = 'avatars');

create or replace function public.search_messaging_users(p_query text)
returns table(
  user_id uuid,
  username text,
  full_name text,
  account_code text,
  academy text,
  role text,
  profile_image_path text
)
language sql
security definer
set search_path = public
as $$
  select p.user_id,p.username,p.full_name,p.account_code,p.academy,p.role,p.profile_image_path
  from public.profiles p
  where p.user_id <> auth.uid()
    and p.username is not null
    and not exists (
      select 1 from public.user_blocks b
      where (b.blocker_user_id = auth.uid() and b.blocked_user_id = p.user_id)
         or (b.blocker_user_id = p.user_id and b.blocked_user_id = auth.uid())
    )
    and (
      lower(p.username) like lower('%' || left(btrim(coalesce(p_query,'')),40) || '%')
      or lower(coalesce(p.full_name,'')) like lower('%' || left(btrim(coalesce(p_query,'')),40) || '%')
      or lower(coalesce(p.account_code,'')) like lower('%' || left(btrim(coalesce(p_query,'')),40) || '%')
    )
  order by
    case when lower(p.username)=lower(btrim(coalesce(p_query,''))) then 0
         when lower(coalesce(p.account_code,''))=lower(btrim(coalesce(p_query,''))) then 1
         else 2 end,
    p.username
  limit 20;
$$;
revoke all on function public.search_messaging_users(text) from public, anon;
grant execute on function public.search_messaging_users(text) to authenticated;

create or replace function public.hide_my_conversation(p_conversation_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not exists (
    select 1 from public.conversation_members
    where conversation_id=p_conversation_id and user_id=auth.uid()
  ) then
    raise exception 'Conversation not found';
  end if;
  insert into public.messaging_hidden_conversations(user_id,conversation_id)
  values(auth.uid(),p_conversation_id)
  on conflict (user_id,conversation_id) do update set hidden_at=now();
end;
$$;
revoke all on function public.hide_my_conversation(uuid) from public, anon;
grant execute on function public.hide_my_conversation(uuid) to authenticated;

create or replace function public.unhide_my_conversation(p_conversation_id uuid)
returns void
language sql
security definer
set search_path = public
as $$
  delete from public.messaging_hidden_conversations
  where user_id=auth.uid() and conversation_id=p_conversation_id;
$$;
revoke all on function public.unhide_my_conversation(uuid) from public, anon;
grant execute on function public.unhide_my_conversation(uuid) to authenticated;

create or replace function public.block_messaging_user(p_user_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null or p_user_id is null or p_user_id=auth.uid() then
    raise exception 'Invalid user';
  end if;
  insert into public.user_blocks(blocker_user_id,blocked_user_id)
  values(auth.uid(),p_user_id)
  on conflict do nothing;
end;
$$;
revoke all on function public.block_messaging_user(uuid) from public, anon;
grant execute on function public.block_messaging_user(uuid) to authenticated;

create or replace function public.unblock_messaging_user(p_user_id uuid)
returns void
language sql
security definer
set search_path = public
as $$
  delete from public.user_blocks
  where blocker_user_id=auth.uid() and blocked_user_id=p_user_id;
$$;
revoke all on function public.unblock_messaging_user(uuid) from public, anon;
grant execute on function public.unblock_messaging_user(uuid) to authenticated;
