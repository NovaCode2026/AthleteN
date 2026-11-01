create or replace function public.notify_published_announcement()
returns trigger language plpgsql security definer set search_path = '' as $function$
begin
  if new.published_at is null then return new; end if;
  insert into public.notifications(user_id,title,body,notification_type,announcement_id,action_route)
  select p.user_id,new.title,new.body,'announcement',new.id,'/notifications'
  from public.profiles p
  left join public.notification_preferences np on np.user_id=p.user_id
  where coalesce(np.system,true)=true
    and (
      new.audience='all'
      or (new.audience='athletes' and p.role='athlete')
      or (new.audience='coaches' and p.role='coach')
      or (new.audience='academies' and p.role='academy_admin')
      or (new.audience='admins' and p.role in ('support_admin','admin','super_admin'))
    )
  on conflict (announcement_id,user_id) where announcement_id is not null do nothing;
  return new;
end;
$function$;
drop trigger if exists announcements_notify_published on public.announcements;
create trigger announcements_notify_published after insert or update of published_at,title,body,audience
on public.announcements for each row when (new.published_at is not null)
execute function public.notify_published_announcement();
