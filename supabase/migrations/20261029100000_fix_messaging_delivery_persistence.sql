-- AthleteN messaging delivery/persistence hardening.
-- Keep the existing age-approval restrictive policies in place; this migration
-- does not grant unapproved accounts access to messaging.

-- Support attachment-only messages while still rejecting empty text-only messages.
alter table public.messages alter column body drop not null;
alter table public.messages drop constraint if exists messages_body_check;
alter table public.messages drop constraint if exists messages_body_or_attachment_check;
alter table public.messages add constraint messages_body_or_attachment_check
  check (
    (char_length(trim(coalesce(body, ''))) between 1 and 4000)
    or attachment_path is not null
  );

-- Keep direct-message reads and writes tied to actual conversation membership.
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

drop policy if exists "members can read messages" on public.messages;
create policy "members can read messages"
on public.messages for select to authenticated
using ((select public.is_conversation_member(conversation_id)));

drop policy if exists "members can send their own messages" on public.messages;
create policy "members can send their own messages"
on public.messages for insert to authenticated
with check (
  sender_id = (select auth.uid())
  and (select public.is_conversation_member(conversation_id))
  and (
    char_length(trim(coalesce(body, ''))) between 1 and 4000
    or attachment_path is not null
  )
);

grant select, insert on public.messages to authenticated;

create index if not exists idx_messages_conversation_created
  on public.messages(conversation_id, created_at);
