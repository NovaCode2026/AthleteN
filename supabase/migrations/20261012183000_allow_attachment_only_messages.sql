-- Support attachment-only messages on both web and native clients.
-- Keep a non-empty body requirement unless a private attachment is present.
alter table public.messages
  drop constraint if exists messages_body_check;
alter table public.messages
  drop constraint if exists messages_body_or_attachment_check;
alter table public.messages
  add constraint messages_body_or_attachment_check
  check (
    (char_length(trim(coalesce(body, ''))) between 1 and 4000)
    or attachment_path is not null
  );
