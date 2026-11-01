create extension if not exists pgcrypto;

alter table public.messages add column if not exists client_message_id uuid;
create unique index if not exists messages_sender_client_message_id_uidx on public.messages(sender_id, client_message_id) where client_message_id is not null;

create table if not exists public.message_receipts (
  id uuid primary key default gen_random_uuid(),
  message_id uuid not null references public.messages(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  delivered_at timestamptz,
  read_at timestamptz,
  created_at timestamptz not null default now(),
  unique(message_id, user_id),
  constraint message_receipts_read_requires_delivery check (read_at is null or delivered_at is not null)
);
create index if not exists message_receipts_user_unread_idx on public.message_receipts(user_id, read_at, delivered_at);
alter table public.message_receipts enable row level security;
drop policy if exists "Participants can read their own message receipts" on public.message_receipts;
create policy "Participants can read their own message receipts" on public.message_receipts for select to authenticated using (user_id = auth.uid());
revoke all on public.message_receipts from anon, public;
grant select on public.message_receipts to authenticated;

create or replace function public.create_message_delivery_records()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.message_receipts(message_id,user_id)
  select new.id,cm.user_id from public.conversation_members cm
  where cm.conversation_id=new.conversation_id and cm.user_id<>new.sender_id
  on conflict (message_id,user_id) do nothing;

  insert into public.notifications(user_id,title,body,notification_type,action_route)
  select cm.user_id,'New message',
    case when nullif(btrim(new.body),'') is not null then left(new.body,160) else coalesce(new.attachment_name,'You received an attachment') end,
    'message','/messages'
  from public.conversation_members cm
  left join public.notification_preferences np on np.user_id=cm.user_id
  where cm.conversation_id=new.conversation_id and cm.user_id<>new.sender_id and coalesce(np.messages,true)=true;
  return new;
end;
$$;
drop trigger if exists messages_create_delivery_records on public.messages;
create trigger messages_create_delivery_records after insert on public.messages for each row execute function public.create_message_delivery_records();

create or replace function public.mark_messages_delivered(p_message_ids uuid[])
returns integer language plpgsql security definer set search_path = public as $$
declare changed integer;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  update public.message_receipts mr set delivered_at=coalesce(mr.delivered_at,now())
  from public.messages m where mr.message_id=m.id and mr.user_id=auth.uid()
  and m.id=any(coalesce(p_message_ids,'{}'::uuid[])) and mr.delivered_at is null;
  get diagnostics changed=row_count;
  return changed;
end;
$$;
create or replace function public.mark_messages_read(p_conversation_id uuid)
returns integer language plpgsql security definer set search_path = public as $$
declare changed integer;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  if not public.is_conversation_member(p_conversation_id) then raise exception 'Conversation access denied'; end if;
  update public.message_receipts mr set delivered_at=coalesce(mr.delivered_at,now()),read_at=coalesce(mr.read_at,now())
  from public.messages m where mr.message_id=m.id and mr.user_id=auth.uid()
  and m.conversation_id=p_conversation_id and m.sender_id<>auth.uid() and mr.read_at is null;
  get diagnostics changed=row_count;
  return changed;
end;
$$;
revoke all on function public.create_message_delivery_records() from public,anon,authenticated;
revoke all on function public.mark_messages_delivered(uuid[]) from public,anon;
revoke all on function public.mark_messages_read(uuid) from public,anon;
grant execute on function public.mark_messages_delivered(uuid[]) to authenticated;
grant execute on function public.mark_messages_read(uuid) to authenticated;
do $$ begin
  if not exists(select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename='message_receipts') then
    alter publication supabase_realtime add table public.message_receipts;
  end if;
end $$;
