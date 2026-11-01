drop policy if exists "Participants can read their own message receipts" on public.message_receipts;
drop policy if exists "Conversation members can read message receipts" on public.message_receipts;
create policy "Conversation members can read message receipts"
on public.message_receipts for select to authenticated
using (
  exists (
    select 1 from public.messages m
    where m.id = message_receipts.message_id
      and public.is_conversation_member(m.conversation_id)
  )
);
