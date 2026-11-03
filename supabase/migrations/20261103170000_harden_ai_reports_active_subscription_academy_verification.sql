-- AI reports are visible and writable only while the matching role-specific paid product is active.
-- Academy verification reuses the existing academy setup + contact-email verification workflow.
-- Coach access relies on the existing approved Coach account role; no duplicate verification flow is introduced.

drop policy if exists "AI reports are readable by their owner" on public.ai_intelligence_reports;
create policy "AI reports require active paid entitlement to read"
  on public.ai_intelligence_reports
  for select
  to authenticated
  using (
    (select auth.uid()) = user_id
    and exists (
      select 1
      from public.profiles p
      where p.user_id = (select auth.uid())
        and (
          (
            p.role = 'athlete'
            and p.plan_id in ('student', 'pro', 'elite')
            and (
              p.plan_id <> 'student'
              or (
                select sv.status
                from public.student_verifications sv
                where sv.user_id = p.user_id
                order by sv.created_at desc
                limit 1
              ) = 'approved'
            )
          )
          or (p.role = 'coach' and p.plan_id = 'coach')
          or (
            p.role = 'academy_admin'
            and p.plan_id = 'academy'
            and p.academy_id is not null
            and exists (
              select 1
              from public.academies a
              where a.id = p.academy_id
                and a.owner_user_id = p.user_id
                and a.status = 'active'
                and a.setup_completed = true
                and a.contact_email_verified_at is not null
            )
          )
        )
        and exists (
          select 1
          from public.subscriptions s
          where s.user_id = p.user_id
            and s.plan_id = p.plan_id
            and s.status in ('active', 'trialing')
            and (s.current_period_end is null or s.current_period_end > now())
        )
    )
  );

drop policy if exists "AI reports require matching paid plan" on public.ai_intelligence_reports;
create policy "AI reports require active matching paid entitlement"
  on public.ai_intelligence_reports
  for insert
  to authenticated
  with check (
    (select auth.uid()) = user_id
    and subject_role = (
      select p.role
      from public.profiles p
      where p.user_id = (select auth.uid())
      limit 1
    )
    and exists (
      select 1
      from public.profiles p
      where p.user_id = (select auth.uid())
        and (
          (
            p.role = 'athlete'
            and p.plan_id in ('student', 'pro', 'elite')
            and (
              p.plan_id <> 'student'
              or (
                select sv.status
                from public.student_verifications sv
                where sv.user_id = p.user_id
                order by sv.created_at desc
                limit 1
              ) = 'approved'
            )
          )
          or (p.role = 'coach' and p.plan_id = 'coach')
          or (
            p.role = 'academy_admin'
            and p.plan_id = 'academy'
            and p.academy_id is not null
            and exists (
              select 1
              from public.academies a
              where a.id = p.academy_id
                and a.owner_user_id = p.user_id
                and a.status = 'active'
                and a.setup_completed = true
                and a.contact_email_verified_at is not null
            )
          )
        )
        and exists (
          select 1
          from public.subscriptions s
          where s.user_id = p.user_id
            and s.plan_id = p.plan_id
            and s.status in ('active', 'trialing')
            and (s.current_period_end is null or s.current_period_end > now())
        )
    )
  );

-- Re-check Academy verification at payment activation time, not only when checkout is created.
create or replace function public.activate_paid_subscription(
  p_user_id uuid,
  p_plan_id text,
  p_provider text,
  p_provider_customer_id text default null,
  p_provider_subscription_id text default null,
  p_current_period_end timestamptz default null
)
returns public.subscriptions
language plpgsql
security definer
set search_path = public
as $function$
declare
  result public.subscriptions;
  v_role text;
  v_academy_id uuid;
begin
  if p_user_id is null or p_plan_id is null then
    raise exception 'USER_AND_PLAN_REQUIRED';
  end if;

  select role, academy_id
    into v_role, v_academy_id
  from public.profiles
  where user_id = p_user_id;

  if v_role is null then
    raise exception 'PROFILE_NOT_FOUND';
  end if;

  if p_plan_id = 'student' then
    if v_role <> 'athlete' or (
      select sv.status
      from public.student_verifications sv
      where sv.user_id = p_user_id
      order by sv.created_at desc
      limit 1
    ) is distinct from 'approved' then
      raise exception 'STUDENT_NOT_VERIFIED';
    end if;
  elsif p_plan_id in ('pro', 'elite') and v_role <> 'athlete' then
    raise exception 'ATHLETE_PLAN_REQUIRES_ATHLETE_ROLE';
  elsif p_plan_id = 'coach' and v_role <> 'coach' then
    raise exception 'COACH_PLAN_REQUIRES_COACH_ROLE';
  elsif p_plan_id = 'academy' then
    if v_role <> 'academy_admin'
      or v_academy_id is null
      or not exists (
        select 1
        from public.academies a
        where a.id = v_academy_id
          and a.owner_user_id = p_user_id
          and a.status = 'active'
          and a.setup_completed = true
          and a.contact_email_verified_at is not null
      )
    then
      raise exception 'ACADEMY_NOT_VERIFIED';
    end if;
  elsif p_plan_id not in ('student', 'pro', 'elite', 'coach', 'academy') then
    raise exception 'INVALID_PAID_PLAN';
  end if;

  insert into public.subscriptions (
    user_id, plan_id, provider, provider_customer_id,
    provider_subscription_id, status, current_period_end
  )
  values (
    p_user_id, p_plan_id, p_provider, p_provider_customer_id,
    p_provider_subscription_id, 'active', p_current_period_end
  )
  on conflict (user_id, plan_id) do update set
    provider = excluded.provider,
    provider_customer_id = excluded.provider_customer_id,
    provider_subscription_id = excluded.provider_subscription_id,
    status = 'active',
    current_period_end = excluded.current_period_end,
    updated_at = now()
  returning * into result;

  update public.profiles
  set plan_id = p_plan_id, updated_at = now()
  where user_id = p_user_id;

  insert into public.account_entitlements (user_id, selected_plan_id, updated_at)
  values (p_user_id, p_plan_id, now())
  on conflict (user_id) do update
    set selected_plan_id = excluded.selected_plan_id, updated_at = now();

  return result;
end;
$function$;

-- Keep activation restricted to the payment webhook's service role and the database owner.
revoke all on function public.activate_paid_subscription(uuid,text,text,text,text,timestamptz) from public, anon, authenticated;
grant execute on function public.activate_paid_subscription(uuid,text,text,text,text,timestamptz) to service_role;
