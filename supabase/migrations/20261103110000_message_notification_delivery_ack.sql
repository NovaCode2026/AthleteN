-- Connect durable message notifications to app-level delivery acknowledgements.
alter table public.notifications
  add column if not exists message_id uuid;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'notifications_message_id_fkey'
      and conrelid = 'public.notifications'::regclass
  ) then
    alter table public.notifications
      add constraint notifications_message_id_fkey
      foreign key (message_id) references public.messages(id) on delete set null;
  end if;
end;
$$;

create index if not exists notifications_message_id_idx
  on public.notifications(message_id)
  where message_id is not null;

create or replace function public.create_message_delivery_records()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
begin
  insert into public.message_receipts(message_id, user_id)
  select new.id, cm.user_id
  from public.conversation_members cm
  where cm.conversation_id = new.conversation_id
    and cm.user_id <> new.sender_id
  on conflict (message_id, user_id) do nothing;

  insert into public.notifications(user_id, title, body, notification_type, action_route, message_id)
  select cm.user_id,
         'New message',
         case
           when nullif(btrim(new.body), '') is not null then 'Open AthleteN to view your new message.'
           else 'You received an attachment in AthleteN.'
         end,
         'message',
         '/messages',
         new.id
  from public.conversation_members cm
  left join public.notification_preferences np on np.user_id = cm.user_id
  where cm.conversation_id = new.conversation_id
    and cm.user_id <> new.sender_id
    and coalesce(np.messages, true) = true;

  return new;
end;
$function$;

revoke all on function public.create_message_delivery_records() from public, anon, authenticated;

create or replace function public.dispatch_notification_push()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
declare
  token_row record;
  push_body jsonb;
begin
  for token_row in
    select dpt.token
    from public.device_push_tokens dpt
    where dpt.user_id = new.user_id
      and (
        dpt.token like 'ExponentPushToken[%'
        or dpt.token like 'ExpoPushToken[%'
      )
  loop
    begin
      push_body := jsonb_build_object(
        'to', token_row.token,
        'title', coalesce(new.title, 'AthleteN'),
        'body', coalesce(new.body, ''),
        'sound', 'default',
        'priority', 'high',
        'channelId', 'athleten-default-v2',
        'data', jsonb_build_object(
          'notificationId', new.id::text,
          'notificationType', coalesce(new.notification_type, 'general'),
          'messageId', new.message_id::text,
          'route', coalesce(new.action_route, '/notifications')
        )
      );

      perform net.http_post(
        url := 'https://exp.host/--/api/v2/push/send',
        body := push_body,
        headers := '{"Content-Type":"application/json"}'::jsonb,
        timeout_milliseconds := 5000
      );
    exception when others then
      raise warning 'AthleteN push enqueue failed for notification % (SQLSTATE %)',
        new.id, SQLSTATE;
    end;
  end loop;

  return new;
end;
$function$;

revoke all on function public.dispatch_notification_push() from public, anon, authenticated;
