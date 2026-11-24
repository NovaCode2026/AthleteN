-- Server-enforced message edit/delete actions.
-- Candidate only: do not apply until Supabase migration history is reconciled
-- and the additive migration is replayed and tested in an isolated staging database.

alter table public.messages
  add column if not exists edited_at timestamptz,
  add column if not exists deleted_for_everyone_at timestamptz;

create table if not exists public.messaging_hidden_messages (
  user_id uuid not null references auth.users(id) on delete cascade,
  message_id uuid not null references public.messages(id) on delete cascade,
  hidden_at timestamptz not null default now(),
  primary key (user_id, message_id)
);

alter table public.messaging_hidden_messages enable row level security;
drop policy if exists "Users can read their own hidden messages" on public.messaging_hidden_messages;
create policy "Users can read their own hidden messages"
  on public.messaging_hidden_messages
  for select to authenticated
  using (user_id = (select auth.uid()));

revoke all on public.messaging_hidden_messages from public, anon, authenticated;
grant select on public.messaging_hidden_messages to authenticated;

create or replace function public.hide_message_for_me(p_message_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_user uuid := auth.uid();
  v_conversation_id uuid;
begin
  if v_user is null then raise exception 'Authentication required'; end if;
  if not public.is_age_approved(v_user) then raise exception 'Age approval required before using messaging'; end if;
  if p_message_id is null then raise exception 'Message is required'; end if;

  select m.conversation_id into v_conversation_id
  from public.messages m
  where m.id = p_message_id;

  if v_conversation_id is null or not public.is_conversation_member(v_conversation_id) then
    raise exception 'Message not found or conversation access denied';
  end if;

  insert into public.messaging_hidden_messages(user_id, message_id)
  values (v_user, p_message_id)
  on conflict (user_id, message_id) do nothing;
end;
$function$;

create or replace function public.edit_message(
  p_message_id uuid,
  p_body text
)
returns void
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_user uuid := auth.uid();
  v_message public.messages%rowtype;
begin
  if v_user is null then raise exception 'Authentication required'; end if;
  if not public.is_age_approved(v_user) then raise exception 'Age approval required before editing messages'; end if;
  if p_message_id is null then raise exception 'Message is required'; end if;
  if p_body is null or char_length(btrim(p_body)) not between 1 and 4000 then
    raise exception 'Message must contain between 1 and 4000 characters';
  end if;

  select * into v_message
  from public.messages m
  where m.id = p_message_id
  for update;

  if v_message.id is null then raise exception 'Message not found'; end if;
  if v_message.sender_id <> v_user then raise exception 'Only the sender can edit this message'; end if;
  if not public.is_conversation_member(v_message.conversation_id) then raise exception 'Conversation access denied'; end if;
  if v_message.deleted_for_everyone_at is not null then raise exception 'Deleted messages cannot be edited'; end if;
  if v_message.attachment_path is not null then raise exception 'Attachment messages cannot be edited'; end if;
  if v_message.created_at < now() - interval '15 minutes' then raise exception 'Messages can only be edited for 15 minutes after sending'; end if;

  update public.messages
  set body = btrim(p_body),
      edited_at = now()
  where id = p_message_id;
end;
$function$;

create or replace function public.delete_message_for_everyone(p_message_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_user uuid := auth.uid();
  v_message public.messages%rowtype;
begin
  if v_user is null then raise exception 'Authentication required'; end if;
  if not public.is_age_approved(v_user) then raise exception 'Age approval required before deleting messages'; end if;
  if p_message_id is null then raise exception 'Message is required'; end if;

  select * into v_message
  from public.messages m
  where m.id = p_message_id
  for update;

  if v_message.id is null then raise exception 'Message not found'; end if;
  if v_message.sender_id <> v_user then raise exception 'Only the sender can delete this message for everyone'; end if;
  if not public.is_conversation_member(v_message.conversation_id) then raise exception 'Conversation access denied'; end if;
  if v_message.deleted_for_everyone_at is not null then return; end if;
  if v_message.attachment_path is not null then
    raise exception 'Attachment messages cannot be deleted for everyone yet; use Delete for me';
  end if;
  if v_message.created_at < now() - interval '15 minutes' then
    raise exception 'Messages can only be deleted for everyone for 15 minutes after sending';
  end if;

  update public.messages
  set body = 'This message was deleted',
      message_type = 'normal',
      edited_at = null,
      deleted_for_everyone_at = now()
  where id = p_message_id;
end;
$function$;

revoke all on function public.hide_message_for_me(uuid) from public, anon;
revoke all on function public.edit_message(uuid, text) from public, anon;
revoke all on function public.delete_message_for_everyone(uuid) from public, anon;
grant execute on function public.hide_message_for_me(uuid) to authenticated;
grant execute on function public.edit_message(uuid, text) to authenticated;
grant execute on function public.delete_message_for_everyone(uuid) to authenticated;

comment on column public.messages.edited_at is
  'Timestamp of the most recent sender-authorized edit within the 15-minute edit window.';
comment on column public.messages.deleted_for_everyone_at is
  'Soft-delete tombstone visible to conversation members; original message body is replaced.';
