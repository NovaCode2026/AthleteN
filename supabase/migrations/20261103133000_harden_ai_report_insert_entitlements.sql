-- Saving AI reports requires the matching paid product and verified role.
drop policy if exists "AI reports can be created by their owner" on public.ai_intelligence_reports;
create policy "AI reports require matching paid plan"
  on public.ai_intelligence_reports for insert to authenticated
  with check (
    (select auth.uid()) = user_id
    and subject_role = (
      select p.role from public.profiles p where p.user_id = (select auth.uid()) limit 1
    )
    and exists (
      select 1
      from public.profiles p
      where p.user_id = (select auth.uid())
        and (
          (p.role = 'athlete' and p.plan_id in ('student','pro','elite')
            and (p.plan_id <> 'student' or exists (
              select 1 from public.student_verifications sv
              where sv.user_id = p.user_id and sv.status = 'approved'
            )))
          or (p.role = 'coach' and p.plan_id = 'coach')
          or (p.role = 'academy_admin' and p.plan_id = 'academy')
        )
    )
  );
