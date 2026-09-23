-- Academy workspace hardening: finance access, included coach seats, and academy training-group creation.
-- The SQL is also applied to the live Supabase project; this file keeps the repo reproducible.

create or replace function public.can_manage_finance_account(account uuid) returns boolean
language sql stable security definer set search_path=public as $$
 select exists(
   select 1 from public.finance_accounts f
   where f.id=account and (
     (f.owner_type='coach' and f.owner_user_id=auth.uid())
     or (f.owner_type='academy' and (
       exists(select 1 from public.academy_memberships am where am.academy_id=f.academy_id and am.user_id=auth.uid() and am.role='academy_admin' and am.status='active')
       or exists(select 1 from public.academies a where a.id=f.academy_id and a.owner_user_id=auth.uid())
     ))
     or public.is_platform_admin()
   )
 ); $$;

drop policy if exists "finance accounts owner" on public.finance_accounts;
create policy "finance accounts owner" on public.finance_accounts for all to authenticated
using(
 (owner_type='coach' and owner_user_id=auth.uid())
 or (owner_type='academy' and (
   exists(select 1 from public.academy_memberships am where am.academy_id=finance_accounts.academy_id and am.user_id=auth.uid() and am.role='academy_admin' and am.status='active')
   or exists(select 1 from public.academies a where a.id=finance_accounts.academy_id and a.owner_user_id=auth.uid())
 ))
 or public.is_platform_admin()
)
with check(
 (owner_type='coach' and owner_user_id=auth.uid())
 or (owner_type='academy' and (
   exists(select 1 from public.academy_memberships am where am.academy_id=finance_accounts.academy_id and am.user_id=auth.uid() and am.role='academy_admin' and am.status='active')
   or exists(select 1 from public.academies a where a.id=finance_accounts.academy_id and a.owner_user_id=auth.uid())
 ))
 or public.is_platform_admin();

create or replace function public.academy_add_coach(p_username text) returns uuid
language plpgsql security definer set search_path=public as $$
declare v_coach uuid; v_academy uuid; v_active integer; v_seat uuid;
begin
 if auth.uid() is null then raise exception 'Authentication required'; end if;
 select academy_id into v_academy from public.profiles where user_id=auth.uid() and role='academy_admin' and academy_id is not null limit 1;
 if v_academy is null then select id into v_academy from public.academies where owner_user_id=auth.uid() and status='active' order by created_at desc limit 1; end if;
 if v_academy is null then raise exception 'Academy operator access required'; end if;
 select user_id into v_coach from public.profiles where lower(username)=lower(trim(p_username)) and role='coach' limit 1;
 if v_coach is null then raise exception 'Coach username was not found'; end if;
 if exists(select 1 from public.academy_memberships where academy_id=v_academy and user_id=v_coach and status='active') then
   select id into v_seat from public.academy_coach_seats where academy_id=v_academy and coach_user_id=v_coach and status='active' limit 1; return v_seat;
 end if;
 select count(*) into v_active from public.academy_coach_seats where academy_id=v_academy and status='active';
 if v_active >= 2 then raise exception 'Both included coach seats are already in use. Additional coach seats require paid activation.'; end if;
 insert into public.academy_memberships(academy_id,user_id,role,status) values(v_academy,v_coach,'coach','active') on conflict (academy_id,user_id) do update set role='coach',status='active';
 insert into public.academy_coach_seats(academy_id,coach_user_id,seat_type,activation_fee,monthly_fee,status) values(v_academy,v_coach,'included',0,0,'active') on conflict (academy_id,coach_user_id) do update set status='active',updated_at=now() returning id into v_seat;
 update public.profiles set academy_id=v_academy where user_id=v_coach; return v_seat;
end; $$;

create or replace function public.academy_create_training_group(p_name text,p_focus text,p_recurrence_days text[],p_start_time time,p_duration_minutes integer,p_coach_user_id uuid,p_athlete_ids uuid[]) returns uuid
language plpgsql security definer set search_path=public as $$
declare v_academy uuid; v_group uuid; v_day text; v_date date; v_i integer; v_day_num integer; v_athlete uuid;
begin
 select academy_id into v_academy from public.profiles where user_id=auth.uid() and role='academy_admin';
 if v_academy is null then raise exception 'Academy admin access required'; end if;
 if not exists(select 1 from public.academy_memberships where academy_id=v_academy and user_id=p_coach_user_id and role='coach' and status='active') then raise exception 'Coach is not an active member of this academy'; end if;
 foreach v_athlete in array coalesce(p_athlete_ids,'{}') loop
   if not exists(select 1 from public.academy_memberships where academy_id=v_academy and user_id=v_athlete and role='athlete' and status='active') then raise exception 'Every selected athlete must be an active academy member'; end if;
 end loop;
 insert into public.training_groups(coach_user_id,name,focus_area,recurrence_days,start_time,duration_minutes) values(p_coach_user_id,trim(p_name),nullif(trim(p_focus),''),coalesce(p_recurrence_days,'{}'),p_start_time,greatest(15,coalesce(p_duration_minutes,90))) returning id into v_group;
 foreach v_athlete in array coalesce(p_athlete_ids,'{}') loop insert into public.training_group_members(group_id,athlete_user_id) values(v_group,v_athlete) on conflict do nothing; end loop;
 foreach v_day in array coalesce(p_recurrence_days,'{}') loop
   v_day_num:=case lower(v_day) when 'sun' then 0 when 'mon' then 1 when 'tue' then 2 when 'wed' then 3 when 'thu' then 4 when 'fri' then 5 when 'sat' then 6 else null end;
   if v_day_num is not null then for v_i in 0..55 loop v_date:=current_date+v_i; if extract(dow from v_date)::integer=v_day_num then insert into public.training_group_sessions(group_id,session_date,start_time,title,status,training_type) values(v_group,v_date,p_start_time,trim(p_name),'scheduled','regular'); end if; end loop; end if;
 end loop;
 return v_group;
end; $$;
revoke execute on function public.academy_create_training_group(text,text,text[],time,integer,uuid,uuid[]) from public,anon;
grant execute on function public.academy_create_training_group(text,text,text[],time,integer,uuid,uuid[]) to authenticated;
