-- Make revocation remove downstream coach access, and require an active
-- accepted relationship for coach-managed records and approval workflows.

-- Existing production status constraint predates consent decline/revoke states.
-- Extend the enum-like CHECK deliberately so the RPC status transitions are valid.
alter table public.coach_athlete_links
  drop constraint if exists coach_athlete_links_status_check;
alter table public.coach_athlete_links
  add constraint coach_athlete_links_status_check
  check (status in ('pending', 'active', 'suspended', 'ended', 'declined', 'revoked'));


create or replace function public.can_manage_athlete_feature(target_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $function$
  select auth.uid() is not null
    and (
      private.user_can_manage_athlete(target_user_id)
      or private.is_super_admin()
    );
$function$;

-- Coaches can request a relationship; academy administrators must share their
-- academy code and let the athlete initiate membership themselves.
create or replace function public.coach_connect_athlete(
  p_username text,
  p_academy_id uuid default null
)
returns uuid
language plpgsql
security invoker
set search_path = ''
as $function$
declare
  v_coach_id uuid := auth.uid();
  v_role text;
  v_academy_id uuid;
  v_athlete_id uuid;
begin
  if v_coach_id is null then
    raise exception 'Authentication required';
  end if;

  select role, academy_id
    into v_role, v_academy_id
  from public.profiles
  where user_id = v_coach_id;

  if v_role = 'academy_admin' then
    raise exception 'Share your Academy connection code. The athlete must redeem it from their own account.';
  end if;
  if v_role is distinct from 'coach' then
    raise exception 'Coach account required';
  end if;
  if not coalesce(public.is_age_approved(v_coach_id), false) then
    raise exception 'Coach account must complete age approval first';
  end if;
  if p_academy_id is not null and p_academy_id is distinct from v_academy_id then
    raise exception 'Academy does not match this coach account';
  end if;

  select user_id into v_athlete_id
  from public.lookup_taekwondo_athlete_for_coach(btrim(coalesce(p_username, '')))
  limit 1;

  if v_athlete_id is null then
    raise exception 'Approved Taekwondo athlete username was not found';
  end if;

  return public.request_coach_athlete_link(v_athlete_id);
end;
$function$;

revoke all on function public.coach_connect_athlete(text, uuid) from public, anon;
grant execute on function public.coach_connect_athlete(text, uuid) to authenticated;

-- Keep the profile's legacy display fields aligned with the authoritative link.
create or replace function public.respond_to_coach_invitation(
  p_link_id uuid,
  p_accept boolean
)
returns text
language plpgsql
security definer
set search_path = public, private
as $function$
declare
  v_athlete_id uuid := auth.uid();
  v_coach_id uuid;
  v_academy_id uuid;
  v_status text;
  v_coach_name text;
  v_academy_name text;
begin
  if v_athlete_id is null then
    raise exception 'Authentication required';
  end if;
  if p_link_id is null then
    raise exception 'Invitation is required';
  end if;
  if not coalesce(public.is_age_approved(v_athlete_id), false) then
    raise exception 'Athlete account must complete age/guardian approval first';
  end if;

  select coach_user_id, academy_id, status
    into v_coach_id, v_academy_id, v_status
  from public.coach_athlete_links
  where id = p_link_id
    and athlete_user_id = v_athlete_id
  for update;

  if not found or v_status <> 'pending' then
    raise exception 'Pending invitation not found';
  end if;

  if p_accept then
    if not coalesce(public.is_age_approved(v_coach_id), false) then
      raise exception 'Coach account is not eligible for connections';
    end if;

    update public.coach_athlete_links
    set status = 'active', updated_at = now()
    where id = p_link_id and athlete_user_id = v_athlete_id;

    select full_name into v_coach_name
    from public.profiles where user_id = v_coach_id;

    select name into v_academy_name
    from public.academies where id = v_academy_id;

    update public.profiles
    set coach_user_id = v_coach_id,
        coach = v_coach_name,
        academy_id = coalesce(v_academy_id, academy_id),
        academy = coalesce(v_academy_name, academy)
    where user_id = v_athlete_id;

    return 'active';
  end if;

  update public.coach_athlete_links
  set status = 'declined', updated_at = now()
  where id = p_link_id and athlete_user_id = v_athlete_id;

  return 'declined';
end;
$function$;

revoke all on function public.respond_to_coach_invitation(uuid, boolean) from public, anon;
grant execute on function public.respond_to_coach_invitation(uuid, boolean) to authenticated;

create or replace function public.revoke_coach_athlete_link(p_link_id uuid)
returns void
language plpgsql
security definer
set search_path = public, private
as $function$
declare
  v_user_id uuid := auth.uid();
  v_coach_id uuid;
  v_athlete_id uuid;
  v_link_academy_id uuid;
  v_next_coach_id uuid;
  v_next_coach_name text;
begin
  if v_user_id is null then
    raise exception 'Authentication required';
  end if;
  if p_link_id is null then
    raise exception 'Relationship is required';
  end if;

  select coach_user_id, athlete_user_id, academy_id
    into v_coach_id, v_athlete_id, v_link_academy_id
  from public.coach_athlete_links
  where id = p_link_id
    and (coach_user_id = v_user_id or athlete_user_id = v_user_id)
    and status in ('pending', 'active')
  for update;

  if not found then
    raise exception 'Active or pending relationship not found';
  end if;

  update public.coach_athlete_links
  set status = 'revoked', updated_at = now()
  where id = p_link_id
    and (coach_user_id = v_user_id or athlete_user_id = v_user_id);

  update public.coach_approval_requests
  set status = 'withdrawn', reviewed_at = now(), updated_at = now()
  where coach_user_id = v_coach_id
    and athlete_user_id = v_athlete_id
    and academy_id is not distinct from v_link_academy_id
    and status = 'pending';

  if not exists (
    select 1
    from public.coach_athlete_links l
    where l.coach_user_id = v_coach_id
      and l.athlete_user_id = v_athlete_id
      and l.status = 'active'
  ) and not exists (
    select 1
    from public.academy_memberships coach_m
    join public.academy_memberships athlete_m
      on athlete_m.academy_id = coach_m.academy_id
    where coach_m.user_id = v_coach_id
      and coach_m.role in ('coach', 'academy_admin')
      and coach_m.status = 'active'
      and athlete_m.user_id = v_athlete_id
      and athlete_m.role = 'athlete'
      and athlete_m.status = 'active'
  ) then
    -- The trigger on training_group_members also removes the athlete from the
    -- associated group conversation, preventing post-revocation chat access.
    delete from public.training_group_members m
    using public.training_groups g
    where g.id = m.group_id
      and g.coach_user_id = v_coach_id
      and m.athlete_user_id = v_athlete_id;
  end if;

  select l.coach_user_id, p.full_name
    into v_next_coach_id, v_next_coach_name
  from public.coach_athlete_links l
  join public.profiles p on p.user_id = l.coach_user_id
  where l.athlete_user_id = v_athlete_id
    and l.status = 'active'
  order by l.created_at desc
  limit 1;

  update public.profiles
  set coach_user_id = v_next_coach_id,
      coach = v_next_coach_name
  where user_id = v_athlete_id
    and coach_user_id = v_coach_id;
end;
$function$;

revoke all on function public.revoke_coach_athlete_link(uuid) from public, anon;
grant execute on function public.revoke_coach_athlete_link(uuid) to authenticated;

-- An old helper also trusted the denormalized profiles.coach_user_id and
-- training_plans.coach_user_id fields, which may outlive a revoked connection.
-- Management must be backed by the authoritative active relationship or academy membership.
drop policy if exists "coach manages group members" on public.training_group_members;
create policy "coach manages currently linked group members"
on public.training_group_members
for all to authenticated
using (
  exists (
    select 1
    from public.training_groups g
    where g.id = training_group_members.group_id
      and g.coach_user_id = (select auth.uid())
      and (
        private.user_can_manage_athlete(training_group_members.athlete_user_id)
        or private.is_platform_admin()
      )
  )
)
with check (
  exists (
    select 1
    from public.training_groups g
    where g.id = training_group_members.group_id
      and g.coach_user_id = (select auth.uid())
      and (
        private.user_can_manage_athlete(training_group_members.athlete_user_id)
        or private.is_platform_admin()
      )
  )
);

-- The old permissive ALL policy allowed every age-approved account to
-- mutate every athlete's plan. Replace it with an owner-scoped policy.
drop policy if exists "age approval required" on public.training_plans;
drop policy if exists "Users can manage own training plans" on public.training_plans;
create policy "Users manage own approved training plans"
on public.training_plans
for all to authenticated
using (
  (user_id = (select auth.uid())
    and (select public.is_age_approved((select auth.uid()))))
  or (select private.is_platform_admin())
)
with check (
  (user_id = (select auth.uid())
    and (select public.is_age_approved((select auth.uid()))))
  or (select private.is_platform_admin())
);

drop policy if exists "Coaches can delete managed training plans" on public.training_plans;
create policy "Coaches can delete currently managed training plans"
on public.training_plans
for delete to authenticated
using (
  private.user_can_manage_athlete(user_id)
  or private.is_platform_admin()
);

drop policy if exists "Coaches can update managed training plans" on public.training_plans;
create policy "Coaches can update currently managed training plans"
on public.training_plans
for update to authenticated
using (
  private.user_can_manage_athlete(user_id)
  or private.is_platform_admin()
)
with check (
  private.user_can_manage_athlete(user_id)
  or private.is_platform_admin()
);

-- Athlete approval requests must be bound to an accepted coach relationship.
-- This removes the earlier self-comparison predicate that was always true.
drop policy if exists "approval participants can view" on public.coach_approval_requests;
create policy "approval participants can view active relationship"
on public.coach_approval_requests
for select to authenticated
using (
  athlete_user_id = (select auth.uid())
  or (
    coach_user_id = (select auth.uid())
    and private.user_can_manage_athlete(athlete_user_id)
  )
  or (
    academy_id is not null
    and (select private.user_is_academy_staff(coach_approval_requests.academy_id))
    and exists (
      select 1
      from public.academy_memberships am
      where am.academy_id = coach_approval_requests.academy_id
        and am.user_id = coach_approval_requests.athlete_user_id
        and am.role = 'athlete'
        and am.status = 'active'
    )
  )
  or (select private.is_platform_admin())
);

drop policy if exists "athletes can request approval" on public.coach_approval_requests;
create policy "athletes request approval from active coach"
on public.coach_approval_requests
for insert to authenticated
with check (
  athlete_user_id = (select auth.uid())
  and (select public.is_age_approved((select auth.uid())))
  and exists (
    select 1
    from public.coach_athlete_links l
    where l.coach_user_id = coach_approval_requests.coach_user_id
      and l.athlete_user_id = coach_approval_requests.athlete_user_id
      and l.academy_id is not distinct from coach_approval_requests.academy_id
      and l.status = 'active'
      and (select public.is_age_approved(l.coach_user_id))
  )
);

drop policy if exists "coaches can review approvals" on public.coach_approval_requests;
drop policy if exists "coaches review approvals for active athletes" on public.coach_approval_requests;
-- Updates are performed only through the checked SECURITY DEFINER review RPC below.

create or replace function public.review_coach_approval(
  p_request_id uuid,
  p_status text,
  p_notes text default null
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $function$
declare
  r public.coach_approval_requests%rowtype;
  p public.profiles%rowtype;
begin
  if auth.uid() is null
    or not exists (
      select 1 from public.profiles actor
      where actor.user_id = auth.uid() and actor.role = 'coach'
    )
    or not coalesce(public.is_age_approved(auth.uid()), false) then
    raise exception 'Approved coach account required';
  end if;
  if p_status not in ('approved', 'rejected') then
    raise exception 'Invalid review status';
  end if;

  select * into r
  from public.coach_approval_requests
  where id = p_request_id
    and coach_user_id = auth.uid()
    and status = 'pending'
    and private.user_can_manage_athlete(athlete_user_id)
  for update;

  if not found then
    raise exception 'Approval request not found, relationship revoked, or already reviewed';
  end if;

  if not coalesce(public.is_age_approved(r.athlete_user_id), false) then
    raise exception 'Athlete account approval is required';
  end if;

  select * into p
  from public.profiles
  where user_id = r.athlete_user_id;

  if p_status = 'approved' then
    if r.request_type = 'belt_change' then
      insert into public.taekwondo_belt_history
        (athlete_user_id, coach_user_id, academy_id, previous_belt, new_belt, notes)
      values
        (r.athlete_user_id, auth.uid(), r.academy_id, p.belt, r.requested_value, p_notes);
      update public.profiles
      set belt = r.requested_value
      where user_id = r.athlete_user_id;
    elsif r.request_type = 'competition_weight_category' then
      insert into public.taekwondo_weight_category_decisions
        (athlete_user_id, coach_user_id, academy_id, athlete_weight_kg, category, notes)
      values
        (r.athlete_user_id, auth.uid(), r.academy_id,
         coalesce(r.athlete_weight_kg, p.weight_kg, 0), r.requested_value, p_notes);
      update public.profiles
      set competition_weight_category = r.requested_value,
          competition_weight_category_updated_at = now()
      where user_id = r.athlete_user_id;
    end if;
  end if;

  update public.coach_approval_requests
  set status = p_status,
      reviewed_at = now(),
      notes = coalesce(p_notes, notes),
      updated_at = now()
  where id = p_request_id
    and coach_user_id = auth.uid()
    and status = 'pending';

  insert into public.audit_logs(actor_user_id, action, entity_table, entity_id, metadata)
  values (
    auth.uid(),
    'coach_approval_' || p_status,
    'coach_approval_requests',
    p_request_id,
    jsonb_build_object(
      'request_type', r.request_type,
      'athlete_user_id', r.athlete_user_id,
      'requested_value', r.requested_value
    )
  );

  return true;
end;
$function$;

revoke all on function public.review_coach_approval(uuid, text, text) from public, anon;
grant execute on function public.review_coach_approval(uuid, text, text) to authenticated;

-- Administrative visibility must not become an alternate path for activating
-- athlete relationships without the athlete's acceptance.
drop policy if exists "super admin full access" on public.coach_athlete_links;
drop policy if exists "super admins can view coach athlete links" on public.coach_athlete_links;
create policy "super admins can view coach athlete links"
on public.coach_athlete_links
for select to authenticated
using ((select private.is_super_admin()));

-- Avoid telling a coach an invitation was sent when the athlete is already
-- connected, and serialize duplicate requests for the same coach/athlete pair.
create or replace function public.request_coach_athlete_link(p_athlete_user_id uuid)
returns uuid
language plpgsql
security definer
set search_path = public, private
as $function$
declare
  v_coach_id uuid := auth.uid();
  v_coach_role text;
  v_athlete_role text;
  v_athlete_sport text;
  v_academy_id uuid;
  v_link_id uuid;
  v_status text;
begin
  if v_coach_id is null then
    raise exception 'Authentication required';
  end if;
  if p_athlete_user_id is null or p_athlete_user_id = v_coach_id then
    raise exception 'A valid athlete account is required';
  end if;

  select role, academy_id into v_coach_role, v_academy_id
  from public.profiles where user_id = v_coach_id;
  if v_coach_role is distinct from 'coach' then
    raise exception 'Coach account required';
  end if;
  if not coalesce(public.is_age_approved(v_coach_id), false) then
    raise exception 'Coach account must complete age approval';
  end if;

  select role, sport into v_athlete_role, v_athlete_sport
  from public.profiles where user_id = p_athlete_user_id;
  if v_athlete_role is distinct from 'athlete'
    or lower(coalesce(v_athlete_sport, '')) <> 'taekwondo' then
    raise exception 'A Taekwondo athlete account is required';
  end if;
  if not coalesce(public.is_age_approved(p_athlete_user_id), false) then
    raise exception 'Athlete account must complete age/guardian approval first';
  end if;

  perform pg_advisory_xact_lock(
    hashtext(v_coach_id::text),
    hashtext(p_athlete_user_id::text)
  );

  select id into v_link_id
  from public.coach_athlete_links
  where coach_user_id = v_coach_id
    and athlete_user_id = p_athlete_user_id
    and status = 'active'
  order by created_at desc
  limit 1
  for update;

  if v_link_id is not null then
    raise exception 'Athlete is already connected to this coach';
  end if;

  select id into v_link_id
  from public.coach_athlete_links
  where coach_user_id = v_coach_id
    and athlete_user_id = p_athlete_user_id
    and status = 'pending'
  order by created_at desc
  limit 1
  for update;

  if v_link_id is not null then
    return v_link_id;
  end if;

  select id, status into v_link_id, v_status
  from public.coach_athlete_links
  where coach_user_id = v_coach_id
    and athlete_user_id = p_athlete_user_id
  order by created_at desc
  limit 1
  for update;

  if found then
    if v_status = 'suspended' then
      raise exception 'This coach-athlete relationship is suspended and cannot be re-requested';
    end if;
    update public.coach_athlete_links
    set status = 'pending',
        academy_id = v_academy_id,
        updated_at = now()
    where id = v_link_id;
    return v_link_id;
  end if;

  insert into public.coach_athlete_links
    (coach_user_id, athlete_user_id, academy_id, status)
  values
    (v_coach_id, p_athlete_user_id, v_academy_id, 'pending')
  returning id into v_link_id;

  return v_link_id;
end;
$function$;

revoke all on function public.request_coach_athlete_link(uuid) from public, anon;
grant execute on function public.request_coach_athlete_link(uuid) to authenticated;
