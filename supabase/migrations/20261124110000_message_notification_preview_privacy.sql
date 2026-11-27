-- Per-user opt-in for message text on lock screens.
-- Defaults to private previews; push dispatch only includes message text when enabled.
alter table public.notification_preferences
  add column if not exists message_preview boolean not null default false;

create or replace function public.dispatch_notification_push()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
declare
  token_row record;
  push_body jsonb;
  v_sender_name text;
  v_message_body text;
  v_conversation_id uuid;
  v_preview_enabled boolean := false;
  v_title text;
  v_body text;
begin
  if new.notification_type = 'message' and new.message_id is not null then
    select
      coalesce(nullif(btrim(p.full_name), ''), 'AthleteN member'),
      m.body,
      m.conversation_id,
      coalesce(np.message_preview, false)
    into v_sender_name, v_message_body, v_conversation_id, v_preview_enabled
    from public.messages m
    left join public.profiles p on p.user_id = m.sender_id
    left join public.notification_preferences np on np.user_id = new.user_id
    where m.id = new.message_id;

    v_title := case when v_preview_enabled
      then 'New message from ' || coalesce(v_sender_name, 'AthleteN member')
      else 'New message'
    end;
    v_body := case
      when v_preview_enabled and nullif(btrim(v_message_body), '') is not null then v_message_body
      when v_preview_enabled then 'You received an attachment.'
      else 'Open AthleteN to view your new message.'
    end;
  else
    v_title := coalesce(new.title, 'AthleteN');
    v_body := coalesce(new.body, '');
  end if;

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
        'title', v_title,
        'body', v_body,
        'sound', 'default',
        'priority', 'high',
        'channelId', 'athleten-default-v2',
        'data', jsonb_build_object(
          'notificationId', new.id::text,
          'notificationType', coalesce(new.notification_type, 'general'),
          'messageId', new.message_id::text,
          'conversationId', v_conversation_id::text,
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
