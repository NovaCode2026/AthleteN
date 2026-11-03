-- Student proof requests and resubmissions are for Athlete role accounts only.
drop policy if exists student_verifications_insert_own_or_admin on public.student_verifications;
create policy student_verifications_insert_athlete_or_admin
  on public.student_verifications for insert to authenticated
  with check (
    (user_id = (select auth.uid()) and exists (
      select 1 from public.profiles p where p.user_id = (select auth.uid()) and p.role = 'athlete'
    ))
    or (select private.is_platform_admin())
  );

drop policy if exists student_verifications_update_own_pending_or_admin on public.student_verifications;
create policy student_verifications_update_own_athlete_pending_or_admin
  on public.student_verifications for update to authenticated
  using (
    ((user_id = (select auth.uid())) and status in ('pending','rejected')
      and exists (select 1 from public.profiles p where p.user_id = (select auth.uid()) and p.role = 'athlete'))
    or (select private.is_platform_admin())
  )
  with check (
    ((user_id = (select auth.uid())) and status in ('pending','rejected')
      and exists (select 1 from public.profiles p where p.user_id = (select auth.uid()) and p.role = 'athlete'))
    or (select private.is_platform_admin())
  );
