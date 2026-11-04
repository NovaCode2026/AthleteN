-- Academy-scoped announcements with sender-only read receipts.
alter table public.announcements
  add column if not exists academy_id uuid references public.academies(id) on delete cascade;

create index if not exists idx_announcements_academy_published
  on public.announcements(academy_id, published_at desc)
  where academy_id is not null;

create or replace function public.publish_academy_announcement(
  p_academy_id uuid,
  p_title text,
  p_body text
)
returns uuid
language plpgsql
security definer
set search_path = public, private
as $function$
declare
  v_user_id uuid := auth.uid();
  v_announcement_id uuid;
begin
  if v_user_id is null then
    raise exception 'Authentication required';
  end if;
  if p_academy_id is null then
    raise exception 'Academy is required';
  end if;
  if not coalesce(public.is_age_approved(v_user_id), false) then
    raise exception 'Account must complete age approval first';
  end if;
  if length(btrim(coalesce(p_title, ''))) not between 3 and 120 then
    raise exception 'Announcement title must be 3 to 120 characters';
  end if;
  if length(btrim(coalesce(p_body, ''))) not between 1 and 2000 then
    raise exception 'Announcement body must be 1 to 2000 characters';
  end if;

  if not (
    exists (
      select 1
      from public.academy_memberships m
      where m.academy_id = p_academy_id
        and m.user_id = v_user_id
        and m.status = 'active'
        and m.role in ('coach', 'academy_admin')
    )
    or exists (
      select 1 from public.academies a
      where a.id = p_academy_id and a.owner_user_id = v_user_id
    )
  ) then
    raise exception 'Active academy coach or administrator access required';
  end if;

  insert into public.announcements
    (title, body, audience, academy_id, created_by, published_at)
  values
    (btrim(p_title), btrim(p_body), 'all', p_academy_id, v_user_id, now())
  returning id into v_announcement_id;

  return v_announcement_id;
end;
$function$;

revoke all on function public.publish_academy_announcement(uuid, text, text) from public, anon;
grant execute on function public.publish_academy_announcement(uuid, text, text) to authenticated;

drop policy if exists "announcements_select_published_audience" on public.announcements;
create policy "announcements_select_published_audience"
on public.announcements
for select to authenticated
using (
  (select private.is_platform_admin())
  or (
    created_by = (select auth.uid())
    and published_at is not null
    and published_at <= now()
  )
  or (
    (select public.is_age_approved((select auth.uid())))
    and published_at is not null
    and published_at <= now()
    and (
      audience = 'all'
      or (audience = 'athletes' and exists (
        select 1 from public.profiles p
        where p.user_id = (select auth.uid()) and p.role = 'athlete'
      ))
      or (audience = 'coaches' and exists (
        select 1 from public.profiles p
        where p.user_id = (select auth.uid()) and p.role = 'coach'
      ))
      or (audience = 'academies' and exists (
        select 1 from public.profiles p
        where p.user_id = (select auth.uid()) and p.role = 'academy_admin'
      ))
      or (audience = 'admins' and (select private.is_platform_admin()))
    )
    and (
      academy_id is null
      or exists (
        select 1 from public.academy_memberships m
        where m.academy_id = announcements.academy_id
          and m.user_id = (select auth.uid())
          and m.status = 'active'
      )
      or exists (
        select 1 from public.academies a
        where a.id = announcements.academy_id
          and a.owner_user_id = (select auth.uid())
      )
      or exists (
        select 1 from public.coach_athlete_links l
        where l.academy_id = announcements.academy_id
          and (l.coach_user_id = (select auth.uid()) or l.athlete_user_id = (select auth.uid()))
          and l.status = 'active'
      )
    )
  )
);

drop policy if exists "announcement_reads_select_sender" on public.announcement_reads;
create policy "announcement_reads_select_sender"
on public.announcement_reads
for select to authenticated
using (
  exists (
    select 1 from public.announcements a
    where a.id = announcement_reads.announcement_id
      and a.created_by = (select auth.uid())
      and a.academy_id is not null
  )
);
