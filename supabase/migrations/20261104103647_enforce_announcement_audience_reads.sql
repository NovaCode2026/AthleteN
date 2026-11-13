-- Enforce announcement audience in RLS.
-- The former broad age-approval policy was permissive and could bypass the audience selector.
drop policy if exists "age approval required" on public.announcements;
drop policy if exists "announcements_select_active_or_admin" on public.announcements;
drop policy if exists "announcements public published read" on public.announcements;
create policy "announcements_select_published_audience" on public.announcements
for select to authenticated
using (
  (select private.is_platform_admin())
  or (
    (select public.is_age_approved((select auth.uid())))
    and published_at is not null
    and published_at <= now()
    and (
      audience = 'all'
      or (audience = 'athletes' and exists(select 1 from public.profiles p where p.user_id=(select auth.uid()) and p.role='athlete'))
      or (audience = 'coaches' and exists(select 1 from public.profiles p where p.user_id=(select auth.uid()) and p.role='coach'))
      or (audience = 'academies' and exists(select 1 from public.profiles p where p.user_id=(select auth.uid()) and p.role='academy_admin'))
      or (audience = 'admins' and (select private.is_platform_admin()))
    )
  )
);
