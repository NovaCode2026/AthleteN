-- Consent-safe coach/athlete relationships and tournament checklist permissions.
-- Apply only after reviewing this migration against the live schema and testing both users.

-- Relationships must be initiated by the coach but activated only by the athlete.
drop policy if exists "coach links coaches can create" on public.coach_athlete_links;
drop policy if exists "coach links coaches can update" on public.coach_athlete_links;
drop policy if exists "coach links coaches can delete" on public.coach_athlete_links;

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
  if v_coach_role <> 'coach' then
    raise exception 'Coach account required';
  end if;
  if not public.is_age_approved(v_coach_id) then
    raise exception 'Coach account must complete age approval';
  end if;

  select role, sport into v_athlete_role, v_athlete_sport
  from public.profiles where user_id = p_athlete_user_id;
  if v_athlete_role <> 'athlete' or lower(coalesce(v_athlete_sport, '')) <> 'taekwondo' then
    raise exception 'A Taekwondo athlete account is required';
  end if;
  if not public.is_age_approved(p_athlete_user_id) then
    raise exception 'Athlete account must complete age/guardian approval first';
  end if;

  select id, status into v_link_id, v_status
  from public.coach_athlete_links
  where coach_user_id = v_coach_id and athlete_user_id = p_athlete_user_id
  order by created_at desc
  limit 1
  for update;

  if found then
    if v_status in ('pending', 'active') then
      return v_link_id;
    end if;
    update public.coach_athlete_links
    set status = 'pending', academy_id = v_academy_id, updated_at = now()
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
  v_status text;
begin
  if v_athlete_id is null then
    raise exception 'Authentication required';
  end if;
  if p_link_id is null then
    raise exception 'Invitation is required';
  end if;
  if not public.is_age_approved(v_athlete_id) then
    raise exception 'Athlete account must complete age/guardian approval first';
  end if;

  select status into v_status
  from public.coach_athlete_links
  where id = p_link_id and athlete_user_id = v_athlete_id
  for update;

  if not found or v_status <> 'pending' then
    raise exception 'Pending invitation not found';
  end if;

  update public.coach_athlete_links
  set status = case when p_accept then 'active' else 'declined' end,
      updated_at = now()
  where id = p_link_id and athlete_user_id = v_athlete_id;

  return case when p_accept then 'active' else 'declined' end;
end;
$function$;

create or replace function public.revoke_coach_athlete_link(p_link_id uuid)
returns void
language plpgsql
security definer
set search_path = public, private
as $function$
declare
  v_user_id uuid := auth.uid();
begin
  if v_user_id is null then
    raise exception 'Authentication required';
  end if;
  if p_link_id is null then
    raise exception 'Relationship is required';
  end if;

  update public.coach_athlete_links
  set status = 'revoked', updated_at = now()
  where id = p_link_id
    and (coach_user_id = v_user_id or athlete_user_id = v_user_id)
    and status in ('pending', 'active');

  if not found then
    raise exception 'Active or pending relationship not found';
  end if;
end;
$function$;

revoke all on function public.request_coach_athlete_link(uuid) from public, anon;
revoke all on function public.respond_to_coach_invitation(uuid, boolean) from public, anon;
revoke all on function public.revoke_coach_athlete_link(uuid) from public, anon;
grant execute on function public.request_coach_athlete_link(uuid) to authenticated;
grant execute on function public.respond_to_coach_invitation(uuid, boolean) to authenticated;
grant execute on function public.revoke_coach_athlete_link(uuid) to authenticated;

-- Remove the broad age-approval ALL policy: age approval must not grant access to
-- every athlete's checklist. The owner policy is row-scoped and tournament-scoped.
drop policy if exists "Users can manage own checklists" on public.competition_checklists;
drop policy if exists "age approval required" on public.competition_checklists;

create policy "checklists_owner_manage_approved"
on public.competition_checklists
for all to authenticated
using (
  (user_id = (select auth.uid()) and (select public.is_age_approved((select auth.uid()))))
  or (select private.is_platform_admin())
)
with check (
  (
    user_id = (select auth.uid())
    and (select public.is_age_approved((select auth.uid())))
    and (
      tournament_id is null
      or exists (
        select 1 from public.tournaments t
        where t.id = competition_checklists.tournament_id
          and t.user_id = competition_checklists.user_id
      )
    )
  )
  or (select private.is_platform_admin())
);

-- An accepted coach relationship grants the coach checklist operations only for
-- that linked athlete and only for tournaments owned by that athlete.
create policy "connected_coach_manage_athlete_checklists"
on public.competition_checklists
for all to authenticated
using (
  exists (
    select 1
    from public.coach_athlete_links l
    join public.profiles cp on cp.user_id = l.coach_user_id
    where l.coach_user_id = (select auth.uid())
      and l.athlete_user_id = competition_checklists.user_id
      and l.status = 'active'
      and cp.role = 'coach'
  )
)
with check (
  exists (
    select 1
    from public.coach_athlete_links l
    join public.profiles cp on cp.user_id = l.coach_user_id
    where l.coach_user_id = (select auth.uid())
      and l.athlete_user_id = competition_checklists.user_id
      and l.status = 'active'
      and cp.role = 'coach'
  )
  and (
    tournament_id is null
    or exists (
      select 1 from public.tournaments t
      where t.id = competition_checklists.tournament_id
        and t.user_id = competition_checklists.user_id
    )
  )
);
