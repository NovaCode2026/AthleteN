-- Expose only the authenticated athlete's own pending coach invitations.
create or replace function public.list_my_coach_invitations()
returns table (
  link_id uuid,
  coach_user_id uuid,
  coach_name text,
  coach_username text,
  academy_name text,
  invited_at timestamptz
)
language plpgsql
security definer
set search_path = public
as $function$
declare
  v_athlete_id uuid := auth.uid();
begin
  if v_athlete_id is null then
    raise exception 'Authentication required';
  end if;

  return query
  select
    l.id,
    l.coach_user_id,
    p.full_name,
    p.username,
    a.name,
    l.created_at
  from public.coach_athlete_links l
  join public.profiles p on p.user_id = l.coach_user_id
  left join public.academies a on a.id = l.academy_id
  where l.athlete_user_id = v_athlete_id
    and l.status = 'pending'
  order by l.created_at desc;
end;
$function$;

revoke all on function public.list_my_coach_invitations() from public, anon;
grant execute on function public.list_my_coach_invitations() to authenticated;
