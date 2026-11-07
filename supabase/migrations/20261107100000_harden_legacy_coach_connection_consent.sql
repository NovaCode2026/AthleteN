-- Close legacy coach-link bypasses while preserving athlete-initiated consent.
-- A coach account-code lookup may request a connection but may not activate one.
-- An athlete may activate a connection by explicitly redeeming a coach code, but
-- only after their account approval gate has passed.

create or replace function public.coach_add_athlete_by_account_code(p_code text)
returns jsonb
language plpgsql
security definer
set search_path = public, private
as $function$
declare
  v_coach_id uuid := auth.uid();
  v_coach_role text;
  v_athlete_id uuid;
  v_athlete_name text;
  v_athlete_username text;
  v_link_id uuid;
  v_code text := lower(btrim(coalesce(p_code, '')));
begin
  if v_coach_id is null then
    raise exception 'Authentication required';
  end if;
  if length(v_code) < 3 or length(v_code) > 30 then
    raise exception 'Enter a valid athlete username or account code';
  end if;

  select role into v_coach_role
  from public.profiles
  where user_id = v_coach_id;

  if v_coach_role is distinct from 'coach' then
    raise exception 'Coach access required';
  end if;
  if not coalesce(public.is_age_approved(v_coach_id), false) then
    raise exception 'Coach account must complete age approval first';
  end if;

  select p.user_id, p.full_name, p.username
    into v_athlete_id, v_athlete_name, v_athlete_username
  from public.profiles p
  where p.role = 'athlete'
    and lower(coalesce(p.sport, '')) = 'taekwondo'
    and lower(btrim(coalesce(p.account_code, ''))) = v_code
    and coalesce(public.is_age_approved(p.user_id), false)
  limit 1;

  if v_athlete_id is null then
    raise exception 'Approved Taekwondo athlete account was not found';
  end if;
  if v_athlete_id = v_coach_id then
    raise exception 'You cannot connect your account to itself';
  end if;

  -- The shared request function creates a pending invitation only.
  v_link_id := public.request_coach_athlete_link(v_athlete_id);

  return jsonb_build_object(
    'link_id', v_link_id,
    'user_id', v_athlete_id,
    'full_name', v_athlete_name,
    'username', v_athlete_username,
    'account_code', v_code,
    'status', 'pending'
  );
end;
$function$;

create or replace function public.connect_athlete_by_code(p_code text)
returns jsonb
language plpgsql
security definer
set search_path = public, private
as $function$
declare
  v_athlete_id uuid := auth.uid();
  v_athlete_role text;
  v_athlete_sport text;
  v_coach_role text;
  v_code text := upper(btrim(coalesce(p_code, '')));
  c record;
  v_link_id uuid;
begin
  if v_athlete_id is null then
    raise exception 'Authentication required';
  end if;
  if length(v_code) < 4 or length(v_code) > 30 then
    raise exception 'Enter a valid team connection code';
  end if;

  select role, sport into v_athlete_role, v_athlete_sport
  from public.profiles
  where user_id = v_athlete_id;

  if v_athlete_role is distinct from 'athlete' then
    raise exception 'Only athlete accounts can use team connection codes';
  end if;
  if lower(coalesce(v_athlete_sport, '')) <> 'taekwondo' then
    raise exception 'This connection code is currently for Taekwondo athletes';
  end if;
  if not coalesce(public.is_age_approved(v_athlete_id), false) then
    raise exception 'Complete the required age/guardian approval before connecting to a team';
  end if;

  select *
    into c
  from public.connection_codes
  where active = true
    and upper(btrim(code)) = v_code
  limit 1;

  if not found then
    raise exception 'Connection code not found';
  end if;

  if c.owner_type = 'coach' then
    if c.owner_user_id is null or c.owner_user_id = v_athlete_id then
      raise exception 'Invalid coach connection code';
    end if;

    select role into v_coach_role
    from public.profiles
    where user_id = c.owner_user_id;

    if v_coach_role is distinct from 'coach'
      or not coalesce(public.is_age_approved(c.owner_user_id), false) then
      raise exception 'Coach account is not eligible for connections';
    end if;

    insert into public.coach_athlete_links
      (coach_user_id, athlete_user_id, academy_id, status)
    values
      (c.owner_user_id, v_athlete_id, c.academy_id, 'active')
    on conflict (coach_user_id, athlete_user_id)
    do update set
      academy_id = excluded.academy_id,
      status = 'active',
      updated_at = now()
    returning id into v_link_id;

    update public.profiles
    set coach_user_id = c.owner_user_id,
        coach = (select full_name from public.profiles where user_id = c.owner_user_id),
        academy_id = coalesce(c.academy_id, academy_id),
        academy = coalesce((select name from public.academies where id = c.academy_id), academy)
    where user_id = v_athlete_id;

    return jsonb_build_object(
      'type', 'coach',
      'status', 'active',
      'link_id', v_link_id,
      'owner_user_id', c.owner_user_id,
      'academy_id', c.academy_id
    );
  elsif c.owner_type = 'academy' then
    if c.academy_id is null or c.owner_user_id is null then
      raise exception 'Invalid academy connection code';
    end if;

    select role, academy_id
      into v_coach_role, v_athlete_sport
    from public.profiles
    where user_id = c.owner_user_id;

    if v_coach_role is distinct from 'academy_admin'
      or v_athlete_sport::text is distinct from c.academy_id::text
      or not coalesce(public.is_age_approved(c.owner_user_id), false) then
      raise exception 'Academy administrator is not eligible for connections';
    end if;

    insert into public.academy_memberships
      (academy_id, user_id, role, status, joined_at)
    values
      (c.academy_id, v_athlete_id, 'athlete', 'active', now())
    on conflict (academy_id, user_id)
    do update set
      role = 'athlete',
      status = 'active',
      joined_at = now();

    update public.profiles
    set academy_id = c.academy_id,
        academy = (select name from public.academies where id = c.academy_id)
    where user_id = v_athlete_id;

    return jsonb_build_object(
      'type', 'academy',
      'status', 'active',
      'owner_user_id', c.owner_user_id,
      'academy_id', c.academy_id
    );
  end if;

  raise exception 'Unsupported team connection code';
end;
$function$;

revoke all on function public.coach_add_athlete_by_account_code(text) from public, anon;
revoke all on function public.connect_athlete_by_code(text) from public, anon;
grant execute on function public.coach_add_athlete_by_account_code(text) to authenticated;
grant execute on function public.connect_athlete_by_code(text) to authenticated;
