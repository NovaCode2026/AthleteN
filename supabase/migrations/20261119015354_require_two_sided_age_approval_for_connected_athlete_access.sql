create or replace function private.user_age_is_approved(p_user_id uuid)
returns boolean language sql stable security definer set search_path=''
as $function$
 select exists (
   select 1 from public.age_verifications a
   where a.user_id=p_user_id
     and (
       a.status='approved'
       or (a.status='not_required' and a.date_of_birth <= (current_date - interval '18 years')::date)
     )
 )
 or (
   p_user_id=(select auth.uid())
   and exists(select 1 from private.qa_age_verification_overrides q where q.user_id=p_user_id)
 );
$function$;

create or replace function public.can_view_athlete(target_user_id uuid)
returns boolean language sql stable security definer set search_path=''
as $function$
 select auth.uid() is not null
   and (
     public.is_platform_admin()
     or (
       public.is_age_approved(auth.uid())
       and private.user_age_is_approved(target_user_id)
       and (
         target_user_id=auth.uid()
         or exists(select 1 from public.coach_athlete_links l
           where l.athlete_user_id=target_user_id and l.coach_user_id=auth.uid() and l.status='active')
         or exists(select 1 from public.academy_memberships am
           join public.profiles p on p.user_id=target_user_id
           where am.user_id=auth.uid() and am.academy_id=p.academy_id
             and am.status='active' and am.role in ('coach','academy_admin'))
         or exists(select 1 from public.academies a
           join public.profiles p on p.academy_id=a.id
           where p.user_id=target_user_id and a.owner_user_id=auth.uid())
       )
     )
   );
$function$;

create or replace function private.user_can_manage_athlete(p_athlete_user_id uuid)
returns boolean language sql stable security definer set search_path=''
as $function$
 select auth.uid() is not null
   and public.is_age_approved(auth.uid())
   and private.user_age_is_approved(p_athlete_user_id)
   and (
     exists(select 1 from public.coach_athlete_links l
       where l.coach_user_id=auth.uid() and l.athlete_user_id=p_athlete_user_id and l.status='active')
     or exists(
       select 1 from public.profiles p
       join public.academy_memberships coach_m
         on coach_m.academy_id=p.academy_id and coach_m.user_id=auth.uid()
        and coach_m.status='active' and coach_m.role in ('coach','academy_admin')
       join public.academy_memberships athlete_m
         on athlete_m.academy_id=p.academy_id and athlete_m.user_id=p_athlete_user_id
        and athlete_m.status='active' and athlete_m.role='athlete'
     )
   );
$function$;

revoke all on function public.can_view_athlete(uuid) from public,anon;
grant execute on function public.can_view_athlete(uuid) to authenticated;
revoke all on function private.user_can_manage_athlete(uuid) from public,anon;
grant execute on function private.user_can_manage_athlete(uuid) to authenticated;
