create or replace function public.dispatch_notification_push()
returns trigger language plpgsql security definer set search_path = '' as $function$
declare token_row record; push_body jsonb;
begin
  for token_row in select dpt.token from public.device_push_tokens dpt
    where dpt.user_id=new.user_id and dpt.token like 'ExponentPushToken[%'
  loop
    push_body:=jsonb_build_object('to',token_row.token,'title',coalesce(new.title,'AthleteN'),'body',coalesce(new.body,''),'sound','default','priority','high','channelId','athleten-default-v2',
      'data',jsonb_build_object('notificationId',new.id::text,'notificationType',coalesce(new.notification_type,'general'),'route',coalesce(new.action_route,'/notifications')));
    perform net.http_post(url:='https://exp.host/--/api/v2/push/send',body:=push_body,headers:='{"Content-Type":"application/json"}'::jsonb,timeout_milliseconds:=5000);
  end loop;
  return new;
end;
$function$;

create unique index if not exists notifications_announcement_user_uidx
  on public.notifications(announcement_id,user_id) where announcement_id is not null;

create or replace function public.notify_published_announcement()
returns trigger language plpgsql security definer set search_path = '' as $function$
begin
  if new.published_at is null then return new; end if;
  insert into public.notifications(user_id,title,body,notification_type,announcement_id,action_route)
  select p.user_id,new.title,new.body,'announcement',new.id,'/notifications'
  from public.profiles p
  left join public.notification_preferences np on np.user_id=p.user_id
  where coalesce(np.system,true)=true
  on conflict (announcement_id,user_id) where announcement_id is not null do nothing;
  return new;
end;
$function$;
drop trigger if exists announcements_notify_published on public.announcements;
create trigger announcements_notify_published after insert or update of published_at,title,body,audience
on public.announcements for each row
when (new.published_at is not null and new.audience='all')
execute function public.notify_published_announcement();
revoke all on function public.notify_published_announcement() from public,anon,authenticated;
