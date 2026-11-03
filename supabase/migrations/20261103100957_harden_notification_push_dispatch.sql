-- Keep durable in-app notification inserts successful even when enqueueing remote push fails.
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
