-- Keep coach group attendance as the operational source while mirroring it
-- into attendance_records so athlete history and Web coach/academy analytics
-- use the same saved attendance event.
--
-- Also enforce the lock at the database boundary. A disabled mobile button is
-- not an authorization control: once a session is locked or cancelled, a coach
-- must not be able to insert, update, or delete its attendance through the API.

alter table public.attendance_records
  add column if not exists training_group_session_id uuid
  references public.training_group_sessions(id) on delete cascade;

create unique index if not exists attendance_records_group_session_user_uidx
  on public.attendance_records(training_group_session_id, user_id)
  where training_group_session_id is not null;

create or replace function public.sync_training_group_attendance_to_records()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_session_date date;
  v_start_time time without time zone;
  v_coach_user_id uuid;
  v_academy_id uuid;
  v_attended_at timestamptz;
begin
  if tg_op = 'DELETE' then
    delete from public.attendance_records
    where training_group_session_id = old.session_id
      and user_id = old.athlete_user_id;
    return old;
  end if;

  select
    s.session_date,
    s.start_time,
    g.coach_user_id,
    p.academy_id
  into
    v_session_date,
    v_start_time,
    v_coach_user_id,
    v_academy_id
  from public.training_group_sessions s
  join public.training_groups g on g.id = s.group_id
  left join public.profiles p on p.user_id = g.coach_user_id
  where s.id = new.session_id;

  if not found then
    raise exception 'Training session not found';
  end if;

  -- Record the scheduled local session time, not the time an administrator
  -- happened to run the migration or the time the coach tapped the button.
  v_attended_at :=
    (v_session_date + coalesce(v_start_time, time '00:00'))
    at time zone 'Asia/Kolkata';

  insert into public.attendance_records (
    user_id,
    academy_id,
    training_group_session_id,
    attended_at,
    status,
    notes
  )
  values (
    new.athlete_user_id,
    v_academy_id,
    new.session_id,
    v_attended_at,
    new.status,
    new.note
  )
  on conflict (training_group_session_id, user_id)
    where training_group_session_id is not null
  do update set
    academy_id = excluded.academy_id,
    attended_at = excluded.attended_at,
    status = excluded.status,
    notes = excluded.notes,
    updated_at = now();

  return new;
end;
$function$;

revoke all on function public.sync_training_group_attendance_to_records()
  from public, anon, authenticated, service_role;
grant execute on function public.sync_training_group_attendance_to_records()
  to postgres;

drop trigger if exists training_group_attendance_sync_record
  on public.training_group_attendance;

create trigger training_group_attendance_sync_record
after insert or update or delete
on public.training_group_attendance
for each row
execute function public.sync_training_group_attendance_to_records();

-- Coaches may still read locked attendance, but mutations are allowed only
-- while the session is unlocked and not cancelled.
drop policy if exists "coach manages attendance"
  on public.training_group_attendance;

create policy "coach views own group attendance"
on public.training_group_attendance
for select
to authenticated
using (
  exists (
    select 1
    from public.training_group_sessions s
    join public.training_groups g on g.id = s.group_id
    join public.training_group_members m
      on m.group_id = s.group_id
     and m.athlete_user_id = training_group_attendance.athlete_user_id
     and m.status = 'active'
    where s.id = training_group_attendance.session_id
      and g.coach_user_id = (select auth.uid())
  )
);

create policy "coach inserts attendance before lock"
on public.training_group_attendance
for insert
to authenticated
with check (
  exists (
    select 1
    from public.training_group_sessions s
    join public.training_groups g on g.id = s.group_id
    join public.training_group_members m
      on m.group_id = s.group_id
     and m.athlete_user_id = training_group_attendance.athlete_user_id
     and m.status = 'active'
    where s.id = training_group_attendance.session_id
      and g.coach_user_id = (select auth.uid())
      and s.locked = false
      and s.status <> 'cancelled'
  )
);

create policy "coach updates attendance before lock"
on public.training_group_attendance
for update
to authenticated
using (
  exists (
    select 1
    from public.training_group_sessions s
    join public.training_groups g on g.id = s.group_id
    join public.training_group_members m
      on m.group_id = s.group_id
     and m.athlete_user_id = training_group_attendance.athlete_user_id
     and m.status = 'active'
    where s.id = training_group_attendance.session_id
      and g.coach_user_id = (select auth.uid())
      and s.locked = false
      and s.status <> 'cancelled'
  )
)
with check (
  exists (
    select 1
    from public.training_group_sessions s
    join public.training_groups g on g.id = s.group_id
    join public.training_group_members m
      on m.group_id = s.group_id
     and m.athlete_user_id = training_group_attendance.athlete_user_id
     and m.status = 'active'
    where s.id = training_group_attendance.session_id
      and g.coach_user_id = (select auth.uid())
      and s.locked = false
      and s.status <> 'cancelled'
  )
);

create policy "coach deletes attendance before lock"
on public.training_group_attendance
for delete
to authenticated
using (
  exists (
    select 1
    from public.training_group_sessions s
    join public.training_groups g on g.id = s.group_id
    join public.training_group_members m
      on m.group_id = s.group_id
     and m.athlete_user_id = training_group_attendance.athlete_user_id
     and m.status = 'active'
    where s.id = training_group_attendance.session_id
      and g.coach_user_id = (select auth.uid())
      and s.locked = false
      and s.status <> 'cancelled'
  )
);
