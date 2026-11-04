-- Group-scoped coach announcements with athlete read receipts.
-- Coach access is limited to groups owned by auth.uid(); athletes may read
-- published group announcements only while they are active group members.

alter table public.announcements
  add column if not exists target_group_id uuid
  references public.training_groups(id) on delete cascade;

alter table public.announcements
  drop constraint if exists announcements_audience_check;

alter table public.announcements
  add constraint announcements_audience_check
  check (audience = any (array['all','athletes','coaches','academies','admins','group']::text[]));

alter table public.announcements
  drop constraint if exists announcements_group_target_check;

alter table public.announcements
  add constraint announcements_group_target_check
  check (
    (audience = 'group' and target_group_id is not null)
    or (audience <> 'group' and target_group_id is null)
  );

create index if not exists announcements_target_group_published_idx
  on public.announcements(target_group_id, published_at desc)
  where target_group_id is not null;

drop policy if exists "announcements_group_coach_insert" on public.announcements;
create policy "announcements_group_coach_insert"
on public.announcements
for insert
to authenticated
with check (
  audience = 'group'
  and target_group_id is not null
  and created_by = (select auth.uid())
  and published_at is not null
  and exists (
    select 1 from public.training_groups g
    where g.id = announcements.target_group_id
      and g.coach_user_id = (select auth.uid())
      and g.active = true
  )
);

drop policy if exists "announcements_group_coach_update" on public.announcements;
create policy "announcements_group_coach_update"
on public.announcements
for update
to authenticated
using (
  audience = 'group'
  and created_by = (select auth.uid())
  and exists (
    select 1 from public.training_groups g
    where g.id = announcements.target_group_id
      and g.coach_user_id = (select auth.uid())
  )
)
with check (
  audience = 'group'
  and target_group_id is not null
  and created_by = (select auth.uid())
  and exists (
    select 1 from public.training_groups g
    where g.id = announcements.target_group_id
      and g.coach_user_id = (select auth.uid())
      and g.active = true
  )
);

drop policy if exists "announcements_select_group_members_and_coach" on public.announcements;
create policy "announcements_select_group_members_and_coach"
on public.announcements
for select
to authenticated
using (
  audience = 'group'
  and published_at is not null
  and published_at <= now()
  and (
    exists (
      select 1 from public.training_groups g
      where g.id = announcements.target_group_id
        and g.coach_user_id = (select auth.uid())
    )
    or (
      (select public.is_age_approved((select auth.uid())))
      and exists (
        select 1 from public.training_group_members m
        where m.group_id = announcements.target_group_id
          and m.athlete_user_id = (select auth.uid())
          and m.status = 'active'
      )
    )
  )
);

drop policy if exists "announcement_reads_group_coach_select" on public.announcement_reads;
create policy "announcement_reads_group_coach_select"
on public.announcement_reads
for select
to authenticated
using (
  exists (
    select 1
    from public.announcements a
    join public.training_groups g on g.id = a.target_group_id
    where a.id = announcement_reads.announcement_id
      and a.audience = 'group'
      and g.coach_user_id = (select auth.uid())
  )
);

create or replace function public.notify_published_announcement()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
begin
  if new.published_at is null then
    return new;
  end if;

  insert into public.notifications (
    user_id,
    title,
    body,
    notification_type,
    announcement_id,
    action_route
  )
  select
    p.user_id,
    new.title,
    new.body,
    'announcement',
    new.id,
    '/notifications'
  from public.profiles p
  left join public.notification_preferences np on np.user_id = p.user_id
  where coalesce(np.system, true) = true
    and (
      new.audience = 'all'
      or (new.audience = 'athletes' and p.role = 'athlete')
      or (new.audience = 'coaches' and p.role = 'coach')
      or (new.audience = 'academies' and p.role = 'academy_admin')
      or (new.audience = 'admins' and p.role in ('support_admin','admin','super_admin'))
      or (
        new.audience = 'group'
        and exists (
          select 1
          from public.training_group_members m
          where m.group_id = new.target_group_id
            and m.athlete_user_id = p.user_id
            and m.status = 'active'
            and (select public.is_age_approved(p.user_id))
        )
      )
    )
  on conflict (announcement_id, user_id)
    where announcement_id is not null
  do nothing;

  return new;
end;
$function$;

revoke all on function public.notify_published_announcement()
  from public, anon, authenticated, service_role;
grant execute on function public.notify_published_announcement()
  to postgres;

drop trigger if exists announcements_notify_published on public.announcements;
create trigger announcements_notify_published
after insert or update of published_at, title, body, audience, target_group_id
on public.announcements
for each row
when (new.published_at is not null)
execute function public.notify_published_announcement();
