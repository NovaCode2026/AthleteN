-- Restrict coach-side athlete discovery to approved Taekwondo accounts and minimal profile fields.
create or replace function public.lookup_taekwondo_athlete_for_coach(p_search text)
returns table (
  user_id uuid,
  full_name text,
  username text,
  discipline text,
  belt text,
  role text
)
language plpgsql
security definer
set search_path = public, private
as $function$
declare
  v_coach_id uuid := auth.uid();
  v_coach_role text;
  v_search text := btrim(coalesce(p_search, ''));
  v_target_id uuid;
begin
  if v_coach_id is null then
    raise exception 'Authentication required';
  end if;
  if length(v_search) < 3 or length(v_search) > 64 then
    raise exception 'Enter a valid athlete username or user ID';
  end if;

  select p.role into v_coach_role
  from public.profiles p where p.user_id = v_coach_id;
  if v_coach_role is distinct from 'coach' then
    raise exception 'Coach account required';
  end if;
  if not coalesce(public.is_age_approved(v_coach_id), false) then
    raise exception 'Coach account must complete age approval';
  end if;

  if v_search ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$' then
    v_target_id := v_search::uuid;
  end if;

  return query
  select p.user_id, p.full_name, p.username, p.discipline, p.belt, p.role
  from public.profiles p
  where p.role = 'athlete'
    and lower(coalesce(p.sport, '')) = 'taekwondo'
    and coalesce(public.is_age_approved(p.user_id), false)
    and (
      (v_target_id is not null and p.user_id = v_target_id)
      or (v_target_id is null and lower(coalesce(p.username, '')) = lower(regexp_replace(v_search, '^@', '')))
    )
  limit 1;
end;
$function$;

revoke all on function public.lookup_taekwondo_athlete_for_coach(text) from public, anon;
grant execute on function public.lookup_taekwondo_athlete_for_coach(text) to authenticated;
