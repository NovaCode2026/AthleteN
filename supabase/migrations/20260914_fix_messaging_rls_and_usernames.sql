create or replace function public.is_conversation_member(p_conversation_id uuid)
returns boolean
language sql
security definer
stable
set search_path = ''
as $$
  select exists (
    select 1
    from public.conversation_members cm
    where cm.conversation_id = p_conversation_id
      and cm.user_id = (select auth.uid())
  );
$$;

revoke all on function public.is_conversation_member(uuid) from public, anon;
grant execute on function public.is_conversation_member(uuid) to authenticated;

drop policy if exists "conversation members can read conversations" on public.conversations;
create policy "conversation members can read conversations"
on public.conversations for select to authenticated
using ((select public.is_conversation_member(id)));

drop policy if exists "members can read membership" on public.conversation_members;
create policy "members can read membership"
on public.conversation_members for select to authenticated
using (
  user_id = (select auth.uid())
  or (select public.is_conversation_member(conversation_id))
);

drop policy if exists "members can read messages" on public.messages;
create policy "members can read messages"
on public.messages for select to authenticated
using ((select public.is_conversation_member(conversation_id)));

create unique index if not exists profiles_username_lower_unique
on public.profiles (lower(username))
where username is not null;

update public.profiles
set username = lower(
  regexp_replace(
    coalesce(nullif(trim(full_name), ''), 'athlete'),
    '[^a-zA-Z0-9]+', '_', 'g'
  ) || '_' || left(replace(user_id::text, '-', ''), 6)
)
where username is null;

alter table public.profiles drop constraint if exists profiles_username_format;
alter table public.profiles add constraint profiles_username_format
check (username is null or username ~ '^[a-z0-9][a-z0-9_.-]{2,29}$');
