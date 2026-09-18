-- Messaging attachments and support-friendly error metadata
alter table public.messages
  add column if not exists attachment_path text,
  add column if not exists attachment_name text,
  add column if not exists attachment_type text,
  add column if not exists attachment_size bigint;

insert into storage.buckets (id, name, public)
values ('message-attachments', 'message-attachments', false)
on conflict (id) do nothing;

create policy "message attachment upload by conversation member"
on storage.objects for insert to authenticated
with check (
  bucket_id = 'message-attachments'
  and exists (
    select 1 from public.conversation_members cm
    where cm.conversation_id::text = (storage.foldername(name))[1]
      and cm.user_id = auth.uid()
  )
);

create policy "message attachment read by conversation member"
on storage.objects for select to authenticated
using (
  bucket_id = 'message-attachments'
  and exists (
    select 1 from public.conversation_members cm
    where cm.conversation_id::text = (storage.foldername(name))[1]
      and cm.user_id = auth.uid()
  )
);

create policy "message attachment delete by uploader"
on storage.objects for delete to authenticated
using (
  bucket_id = 'message-attachments'
  and owner_id = auth.uid()::text
);
