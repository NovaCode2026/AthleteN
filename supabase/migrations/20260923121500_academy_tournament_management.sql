create or replace function public.academy_create_tournament(
 p_name text,p_starts_at date,p_location text,p_athlete_user_id uuid,
 p_discipline text default null,p_coach_user_id uuid default null
) returns uuid
language plpgsql security definer set search_path=public
as $$
declare v_academy uuid; v_id uuid;
begin
 select academy_id into v_academy from public.profiles where user_id=auth.uid() and role='academy_admin';
 if v_academy is null then raise exception 'Academy admin access required'; end if;
 if not exists(select 1 from public.academy_memberships where academy_id=v_academy and user_id=p_athlete_user_id and role='athlete' and status='active') then raise exception 'Athlete is not an active member of this academy'; end if;
 if p_coach_user_id is not null and not exists(select 1 from public.academy_memberships where academy_id=v_academy and user_id=p_coach_user_id and role='coach' and status='active') then raise exception 'Coach is not an active member of this academy'; end if;
 insert into public.tournaments(user_id,name,starts_at,location,status,sport,discipline,coach_user_id)
 values(p_athlete_user_id,trim(p_name),p_starts_at,nullif(trim(p_location),''),'scheduled','Taekwondo',nullif(trim(p_discipline),''),p_coach_user_id)
 returning id into v_id;
 return v_id;
end $$;
revoke all on function public.academy_create_tournament(text,date,text,uuid,text,uuid) from public,anon;
grant execute on function public.academy_create_tournament(text,date,text,uuid,text,uuid) to authenticated;