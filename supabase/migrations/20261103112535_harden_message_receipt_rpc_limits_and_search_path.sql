create or replace function public.mark_messages_delivered(p_message_ids uuid[])
returns integer
language plpgsql
security definer
set search_path = ''
as $function$
declare
  changed integer;
  requested_count integer := coalesce(array_length(p_message_ids, 1), 0);
begin
  if auth.uid() is null then
    raise exception 'Authentication required';
  end if;

  if requested_count > 200 then
    raise exception 'A delivery acknowledgement can include at most 200 messages';
  end if;

  update public.message_receipts mr
     set delivered_at = coalesce(mr.delivered_at, now())
    from public.messages m
   where mr.message_id = m.id
     and mr.user_id = auth.uid()
     and m.id = any(coalesce(p_message_ids, '{}'::uuid[]))
     and mr.delivered_at is null;

  get diagnostics changed = row_count;
  return changed;
end;
$function$;

create or replace function public.mark_messages_read(p_conversation_id uuid)
returns integer
language plpgsql
security definer
set search_path = ''
as $function$
declare
  changed integer;
begin
  if auth.uid() is null then
    raise exception 'Authentication required';
  end if;

  if not public.is_conversation_member(p_conversation_id) then
    raise exception 'Conversation access denied';
  end if;

  update public.message_receipts mr
     set delivered_at = coalesce(mr.delivered_at, now()),
         read_at = coalesce(mr.read_at, now())
    from public.messages m
   where mr.message_id = m.id
     and mr.user_id = auth.uid()
     and m.conversation_id = p_conversation_id
     and m.sender_id <> auth.uid()
     and mr.read_at is null;

  get diagnostics changed = row_count;
  return changed;
end;
$function$;

revoke all on function public.mark_messages_delivered(uuid[]) from public, anon;
revoke all on function public.mark_messages_read(uuid) from public, anon;
grant execute on function public.mark_messages_delivered(uuid[]) to authenticated;
grant execute on function public.mark_messages_read(uuid) to authenticated;
