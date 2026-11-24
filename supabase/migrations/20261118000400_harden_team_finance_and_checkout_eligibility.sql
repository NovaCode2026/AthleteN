-- Candidate security migration for AthleteN's November 30 release.
-- DO NOT apply to production until migration history reconciliation is complete,
-- the full migration chain passes on an isolated Supabase stack, and the exact
-- PR commit is approved. This source is tested through the PostgreSQL 17 CI gate.

-- This RPC has no current Web/Mobile caller and lets any authenticated user
-- enroll themselves into a Coach or Academy Admin product role. Role assignment
-- must remain in the verified/admin-controlled role workflow until there is a
-- separately approved product-role enrollment design.
revoke all on function public.switch_my_product_role(text) from public, anon, authenticated;

-- A finance account row is not proof of an authorized Coach/Academy account.
-- Gate transaction reads/writes on the signed-in user's age approval and their
-- current verified product role/academy membership, not only owner_user_id.
create or replace function public.can_manage_finance_account(account uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $function$
  select
    auth.uid() is not null
    and public.is_age_approved(auth.uid())
    and exists (
      select 1
      from public.finance_accounts f
      where f.id = account
        and (
          (
            f.owner_type = 'coach'
            and f.owner_user_id = auth.uid()
            and exists (
              select 1
              from public.profiles p
              where p.user_id = auth.uid()
                and p.role = 'coach'
            )
          )
          or (
            f.owner_type = 'academy'
            and exists (
              select 1
              from public.profiles p
              where p.user_id = auth.uid()
                and p.role = 'academy_admin'
            )
            and (
              exists (
                select 1
                from public.academy_memberships am
                where am.academy_id = f.academy_id
                  and am.user_id = auth.uid()
                  and am.role = 'academy_admin'
                  and am.status = 'active'
              )
              or exists (
                select 1
                from public.academies a
                where a.id = f.academy_id
                  and a.owner_user_id = auth.uid()
              )
            )
          )
          or public.is_platform_admin()
        )
    );
$function$;

-- The helper is called by authenticated RLS policies. Keep its required
-- authenticated EXECUTE permission, but do not expose it to anon/PUBLIC.
revoke all on function public.can_manage_finance_account(uuid) from public, anon;
grant execute on function public.can_manage_finance_account(uuid) to authenticated;

drop policy if exists "finance accounts owner" on public.finance_accounts;
create policy "finance accounts owner"
on public.finance_accounts
for all
to authenticated
using (
  public.is_age_approved(auth.uid())
  and (
    (
      owner_type = 'coach'
      and owner_user_id = auth.uid()
      and exists (
        select 1 from public.profiles p
        where p.user_id = auth.uid() and p.role = 'coach'
      )
    )
    or (
      owner_type = 'academy'
      and exists (
        select 1 from public.profiles p
        where p.user_id = auth.uid() and p.role = 'academy_admin'
      )
      and (
        exists (
          select 1 from public.academy_memberships am
          where am.academy_id = finance_accounts.academy_id
            and am.user_id = auth.uid()
            and am.role = 'academy_admin'
            and am.status = 'active'
        )
        or exists (
          select 1 from public.academies a
          where a.id = finance_accounts.academy_id
            and a.owner_user_id = auth.uid()
        )
      )
    )
    or public.is_platform_admin()
  )
)
with check (
  public.is_age_approved(auth.uid())
  and (
    (
      owner_type = 'coach'
      and owner_user_id = auth.uid()
      and exists (
        select 1 from public.profiles p
        where p.user_id = auth.uid() and p.role = 'coach'
      )
    )
    or (
      owner_type = 'academy'
      and exists (
        select 1 from public.profiles p
        where p.user_id = auth.uid() and p.role = 'academy_admin'
      )
      and (
        exists (
          select 1 from public.academy_memberships am
          where am.academy_id = finance_accounts.academy_id
            and am.user_id = auth.uid()
            and am.role = 'academy_admin'
            and am.status = 'active'
        )
        or exists (
          select 1 from public.academies a
          where a.id = finance_accounts.academy_id
            and a.owner_user_id = auth.uid()
        )
      )
    )
    or public.is_platform_admin()
  )
);

-- The existing finance-transactions policy delegates both USING and WITH CHECK
-- to can_manage_finance_account, so it now inherits the role/age gate.
drop policy if exists "finance transactions owner" on public.finance_transactions;
create policy "finance transactions owner"
on public.finance_transactions
for all
to authenticated
using (public.can_manage_finance_account(account_id))
with check (public.can_manage_finance_account(account_id));

-- The RPC itself is retained for legitimate coach accounts but now enforces
-- the same age and role requirements even when called outside the UI.
create or replace function public.get_or_create_my_coach_finance_account()
returns uuid
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_uid uuid := auth.uid();
  v_role text;
  v_id uuid;
begin
  if v_uid is null then
    raise exception 'Authentication required';
  end if;

  if not public.is_age_approved(v_uid) then
    raise exception 'Account approval is required before using Coach Finance';
  end if;

  select p.role
    into v_role
    from public.profiles p
   where p.user_id = v_uid;

  if v_role is distinct from 'coach' then
    raise exception 'Only approved Coach accounts can use Coach Finance';
  end if;

  select f.id
    into v_id
    from public.finance_accounts f
   where f.owner_type = 'coach'
     and f.owner_user_id = v_uid
   order by f.created_at asc
   limit 1;

  if v_id is null then
    insert into public.finance_accounts(owner_user_id, owner_type, name, currency)
    values (v_uid, 'coach', 'Coach Finance', 'INR')
    returning id into v_id;
  end if;

  return v_id;
end;
$function$;

revoke all on function public.get_or_create_my_coach_finance_account() from public, anon;
grant execute on function public.get_or_create_my_coach_finance_account() to authenticated;


-- Disable the legacy plan-selection RPC. Current Web/Mobile source has no caller;
-- authenticated execution should not be able to alter trial entitlements or
-- plan selection outside the paid checkout/verified server-owned flow.
REVOKE ALL ON FUNCTION public.choose_account_plan(text, boolean)
  FROM PUBLIC, anon, authenticated;

-- Checkout preflight now mirrors the server-side eligibility requirements. This
-- RPC is informational only; server checkout and subscription activation repeat
-- the checks independently.
CREATE OR REPLACE FUNCTION public.can_start_paid_checkout(
  p_user_id uuid,
  p_plan_id text
)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_role text;
  v_academy_id uuid;
BEGIN
  IF auth.uid() IS NULL OR auth.uid() IS DISTINCT FROM p_user_id THEN
    RETURN false;
  END IF;

  IF NOT public.is_age_approved(p_user_id) THEN
    RETURN false;
  END IF;

  SELECT p.role, p.academy_id
    INTO v_role, v_academy_id
    FROM public.profiles p
   WHERE p.user_id = p_user_id;

  IF v_role IS NULL THEN
    RETURN false;
  END IF;

  IF p_plan_id = 'student' THEN
    RETURN v_role = 'athlete'
      AND (
        SELECT sv.status
          FROM public.student_verifications sv
         WHERE sv.user_id = p_user_id
         ORDER BY sv.created_at DESC, sv.id DESC
         LIMIT 1
      ) IS NOT DISTINCT FROM 'approved';
  ELSIF p_plan_id IN ('pro', 'elite') THEN
    RETURN v_role = 'athlete';
  ELSIF p_plan_id = 'coach' THEN
    RETURN v_role = 'coach';
  ELSIF p_plan_id = 'academy' THEN
    RETURN v_role = 'academy_admin'
      AND v_academy_id IS NOT NULL
      AND EXISTS (
        SELECT 1
          FROM public.academies a
         WHERE a.id = v_academy_id
           AND a.owner_user_id = p_user_id
           AND a.status = 'active'
           AND a.setup_completed = true
           AND a.contact_email_verified_at IS NOT NULL
      );
  END IF;

  RETURN false;
END;
$function$;

REVOKE ALL ON FUNCTION public.can_start_paid_checkout(uuid, text)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.can_start_paid_checkout(uuid, text)
  TO authenticated;

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

