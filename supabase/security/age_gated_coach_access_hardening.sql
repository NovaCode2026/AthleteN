-- REVIEW DRAFT ONLY — NOT A DEPLOYABLE MIGRATION.
-- Reconcile migration history and test on the full local Supabase schema first.
-- This closes connected-team reads for users whose account or athlete approval is pending.

-- SECURITY DEFINER read helper: require both the caller and target athlete to
-- have a completed age-approval state before any connected-team data is exposed.
create or replace function public.can_view_athlete(target_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $function$
  select
    auth.uid() is not null
    and (
      public.is_platform_admin()
      or (
        public.is_age_approved(auth.uid())
        and public.is_age_approved(target_user_id)
        and (
          target_user_id = auth.uid()
          or exists (
            select 1
            from public.coach_athlete_links l
            where l.athlete_user_id = target_user_id
              and l.coach_user_id = auth.uid()
              and l.status = 'active'
          )
          or exists (
            select 1
            from public.academy_memberships am
            join public.profiles p on p.academy_id = am.academy_id
            where am.user_id = auth.uid()
              and p.user_id = target_user_id
              and am.status = 'active'
              and am.role in ('coach', 'academy_admin')
          )
          or exists (
            select 1
            from public.academies a
            join public.profiles p on p.academy_id = a.id
            where p.user_id = target_user_id
              and a.owner_user_id = auth.uid()
          )
        )
      )
    );
$function$;

-- Shared write/management helper: the same two-sided approval gate applies
-- before a coach can manage an athlete through a direct link or academy.
create or replace function private.user_can_manage_athlete(p_athlete_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $function$
  select
    auth.uid() is not null
    and public.is_age_approved(auth.uid())
    and public.is_age_approved(p_athlete_user_id)
    and (
      exists (
        select 1
        from public.coach_athlete_links l
        where l.coach_user_id = auth.uid()
          and l.athlete_user_id = p_athlete_user_id
          and l.status = 'active'
      )
      or exists (
        select 1
        from public.profiles p
        join public.academy_memberships coach_m
          on coach_m.academy_id = p.academy_id
         and coach_m.user_id = auth.uid()
         and coach_m.status = 'active'
         and coach_m.role in ('coach', 'academy_admin')
        join public.academy_memberships athlete_m
          on athlete_m.academy_id = p.academy_id
         and athlete_m.user_id = p_athlete_user_id
         and athlete_m.status = 'active'
         and athlete_m.role = 'athlete'
      )
    );
$function$;

-- These connected-team resources had a permissive team-read policy but no
-- restrictive age gate. A restrictive policy ANDs with their existing access
-- policies, covering both own-record and connected-team reads/writes.
drop policy if exists "age approval required" on public.hydration_logs;
create policy "age approval required" on public.hydration_logs
  as restrictive for all to authenticated
  using (
    (public.is_age_approved(auth.uid()) and public.is_age_approved(user_id))
    or private.is_platform_admin()
  )
  with check (
    (public.is_age_approved(auth.uid()) and public.is_age_approved(user_id))
    or private.is_platform_admin()
  );

drop policy if exists "age approval required" on public.kyorugi_bouts;
create policy "age approval required" on public.kyorugi_bouts
  as restrictive for all to authenticated
  using (
    (public.is_age_approved(auth.uid()) and public.is_age_approved(user_id))
    or private.is_platform_admin()
  )
  with check (
    (public.is_age_approved(auth.uid()) and public.is_age_approved(user_id))
    or private.is_platform_admin()
  );

drop policy if exists "age approval required" on public.kyorugi_training_metrics;
create policy "age approval required" on public.kyorugi_training_metrics
  as restrictive for all to authenticated
  using (
    (public.is_age_approved(auth.uid()) and public.is_age_approved(user_id))
    or private.is_platform_admin()
  )
  with check (
    (public.is_age_approved(auth.uid()) and public.is_age_approved(user_id))
    or private.is_platform_admin()
  );

drop policy if exists "age approval required" on public.nutrition_logs;
create policy "age approval required" on public.nutrition_logs
  as restrictive for all to authenticated
  using (
    (public.is_age_approved(auth.uid()) and public.is_age_approved(user_id))
    or private.is_platform_admin()
  )
  with check (
    (public.is_age_approved(auth.uid()) and public.is_age_approved(user_id))
    or private.is_platform_admin()
  );

drop policy if exists "age approval required" on public.poomsae_performances;
create policy "age approval required" on public.poomsae_performances
  as restrictive for all to authenticated
  using (
    (public.is_age_approved(auth.uid()) and public.is_age_approved(user_id))
    or private.is_platform_admin()
  )
  with check (
    (public.is_age_approved(auth.uid()) and public.is_age_approved(user_id))
    or private.is_platform_admin()
  );

drop policy if exists "age approval required" on public.poomsae_training_metrics;
create policy "age approval required" on public.poomsae_training_metrics
  as restrictive for all to authenticated
  using (
    (public.is_age_approved(auth.uid()) and public.is_age_approved(user_id))
    or private.is_platform_admin()
  )
  with check (
    (public.is_age_approved(auth.uid()) and public.is_age_approved(user_id))
    or private.is_platform_admin()
  );

drop policy if exists "age approval required" on public.taekwondo_belt_history;
create policy "age approval required" on public.taekwondo_belt_history
  as restrictive for all to authenticated
  using (
    (public.is_age_approved(auth.uid()) and public.is_age_approved(athlete_user_id))
    or private.is_platform_admin()
  )
  with check (
    (public.is_age_approved(auth.uid()) and public.is_age_approved(athlete_user_id))
    or private.is_platform_admin()
  );

drop policy if exists "age approval required" on public.taekwondo_training_logs;
create policy "age approval required" on public.taekwondo_training_logs
  as restrictive for all to authenticated
  using (
    (public.is_age_approved(auth.uid()) and public.is_age_approved(user_id))
    or private.is_platform_admin()
  )
  with check (
    (public.is_age_approved(auth.uid()) and public.is_age_approved(user_id))
    or private.is_platform_admin()
  );

drop policy if exists "age approval required" on public.taekwondo_weight_category_decisions;
create policy "age approval required" on public.taekwondo_weight_category_decisions
  as restrictive for all to authenticated
  using (
    (public.is_age_approved(auth.uid()) and public.is_age_approved(athlete_user_id))
    or private.is_platform_admin()
  )
  with check (
    (public.is_age_approved(auth.uid()) and public.is_age_approved(athlete_user_id))
    or private.is_platform_admin()
  );

revoke all on function public.can_view_athlete(uuid) from public, anon;
grant execute on function public.can_view_athlete(uuid) to authenticated;
revoke all on function private.user_can_manage_athlete(uuid) from public, anon;
grant execute on function private.user_can_manage_athlete(uuid) to authenticated;
