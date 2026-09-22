create or replace function public.connect_coach_to_academy_by_code(p_code text)
returns jsonb language plpgsql security definer set search_path=public as $$
declare v_uid uuid:=auth.uid(); v_role text; v_code text:=upper(trim(p_code)); v_academy_id uuid; v_academy_name text;
begin
 if v_uid is null then raise exception 'Not authenticated'; end if;
 select role into v_role from public.profiles where user_id=v_uid;
 if v_role<>'coach' then raise exception 'Only coach accounts can join an academy'; end if;
 select cc.academy_id into v_academy_id from public.connection_codes cc where cc.active=true and lower(cc.code)=lower(v_code) and cc.owner_type='academy' and cc.academy_id is not null limit 1;
 if v_academy_id is null then raise exception 'Academy connection code not found'; end if;
 insert into public.academy_memberships(academy_id,user_id,role,status,joined_at) values(v_academy_id,v_uid,'coach','active',now())
 on conflict (academy_id,user_id) do update set role='coach',status='active',updated_at=now(),joined_at=coalesce(public.academy_memberships.joined_at,now());
 update public.profiles set academy_id=v_academy_id,updated_at=now() where user_id=v_uid;
 select name into v_academy_name from public.academies where id=v_academy_id;
 return jsonb_build_object('academy_id',v_academy_id,'academy_name',coalesce(v_academy_name,'Academy'));
end; $$;
revoke all on function public.connect_coach_to_academy_by_code(text) from public;
grant execute on function public.connect_coach_to_academy_by_code(text) to authenticated;