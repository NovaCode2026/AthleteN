-- Add durable source identity for attendance notifications.
-- The linked attendance record is set NULL if the source record is removed.
alter table public.notifications
  add column if not exists attendance_record_id uuid;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'notifications_attendance_record_id_fkey'
      and conrelid = 'public.notifications'::regclass
  ) then
    alter table public.notifications
      add constraint notifications_attendance_record_id_fkey
      foreign key (attendance_record_id)
      references public.attendance_records(id)
      on delete set null;
  end if;
end;
$$;

create index if not exists notifications_attendance_record_id_idx
  on public.notifications(attendance_record_id)
  where attendance_record_id is not null;

create or replace function public.athleten_notify_attendance_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_status text;
begin
  if tg_op = 'UPDATE' and new.status is not distinct from old.status then
    return new;
  end if;

  v_status := coalesce(nullif(btrim(new.status), ''), 'updated');

  insert into public.notifications (
    user_id, title, body, notification_type, action_route,
    attendance_record_id, created_at, updated_at
  ) values (
    new.user_id,
    'Training attendance updated',
    'Your coach marked your attendance: ' || replace(v_status, '_', ' ') || '.',
    'training',
    '/notifications?attendance=' || new.id::text,
    new.id,
    now(),
    now()
  );

  return new;
end;
$$;

revoke all on function public.athleten_notify_attendance_change() from public, anon, authenticated;

create or replace function public.notify_published_announcement()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
begin
  if new.published_at is null then return new; end if;

  insert into public.notifications(
    user_id, title, body, notification_type, announcement_id, action_route
  )
  select
    p.user_id,
    new.title,
    new.body,
    'announcement',
    new.id,
    '/notifications?announcement=' || new.id::text
  from public.profiles p
  left join public.notification_preferences np on np.user_id = p.user_id
  where coalesce(np.system, true) = true
    and (
      new.audience = 'all'
      or (new.audience = 'athletes' and p.role = 'athlete')
      or (new.audience = 'coaches' and p.role = 'coach')
      or (new.audience = 'academies' and p.role = 'academy_admin')
      or (new.audience = 'admins' and p.role in ('support_admin', 'admin', 'super_admin'))
    )
  on conflict (announcement_id, user_id)
    where announcement_id is not null do nothing;

  return new;
end;
$function$;

revoke all on function public.notify_published_announcement() from public, anon, authenticated;
