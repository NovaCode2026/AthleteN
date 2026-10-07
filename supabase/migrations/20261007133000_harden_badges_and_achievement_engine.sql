-- Badge hardening and achievement engine.
-- Keep this migration identical in behavior to the production migration applied on 2026-10-07.

insert into public.badge_definitions (badge_key,badge_label,description,category,rarity,icon,is_system_badge) values
('founding_member','Founding Member','Joined AthleteN during its founding community phase.','founding','rare','🏛️',true),
('early_adopter','Early Adopter','Joined AthleteN during the early stage before public launch.','founding','rare','🚀',true),
('launch_member','Launch Member','Joined AthleteN around the public launch.','founding','limited','🌟',true),
('first_session','First Session','Completed your first recorded training session.','training','common','🥋',false),
('training_beast','Training Beast','Completed 25 recorded training sessions.','training','rare','🔥',false),
('century_athlete','Century Athlete','Completed 100 recorded training sessions.','training','epic','💯',false),
('first_fight','First Fight','Recorded your first competition match.','competition','common','🥊',false),
('podium_finish','Podium Finish','Recorded a verified medal result.','competition','rare','🏆',false),
('gold_standard','Gold Standard','Recorded a verified gold medal.','competition','epic','🥇',false),
('medal_machine','Medal Machine','Recorded five verified medals.','competition','legendary','🏅',false),
('goal_setter','Goal Setter','Created your first athlete goal.','goals','common','🎯',false),
('goal_crusher','Goal Crusher','Completed five athlete goals.','goals','epic','🚀',false),
('personal_best','Personal Best','Recorded a personal milestone.','milestones','rare','📈',false),
('journey_started','Journey Started','Recorded your first athlete milestone.','milestones','common','🧭',false)
on conflict (badge_key) do update set badge_label=excluded.badge_label,description=excluded.description,category=excluded.category,rarity=excluded.rarity,icon=excluded.icon,is_system_badge=excluded.is_system_badge;

drop policy if exists "Users can manage own badges" on public.athlete_badges;
drop policy if exists "age approval required" on public.athlete_badges;
drop policy if exists "athlete badges readable" on public.athlete_badges;
create policy "athlete badges own read" on public.athlete_badges for select to authenticated using ((select auth.uid())=user_id or (select private.is_platform_admin()));

create index if not exists athlete_badges_user_awarded_idx on public.athlete_badges(user_id,awarded_at desc);

create or replace function public.admin_award_badge(p_user_id uuid,p_badge_key text,p_metadata jsonb default '{}'::jsonb)
returns uuid language plpgsql security definer set search_path='' as $$
declare v_id uuid; v_label text; v_system boolean;
begin
 if auth.uid() is null or not public.is_platform_admin() then raise exception 'Administrator access required'; end if;
 select badge_label,is_system_badge into v_label,v_system from public.badge_definitions where badge_key=p_badge_key;
 if v_label is null then raise exception 'Unknown badge'; end if;
 insert into public.athlete_badges(user_id,badge_key,badge_label,awarded_by,permanent,metadata) values(p_user_id,p_badge_key,v_label,auth.uid(),v_system,coalesce(p_metadata,'{}'::jsonb))
 on conflict(user_id,badge_key) do update set awarded_by=auth.uid(),metadata=excluded.metadata,permanent=public.athlete_badges.permanent or excluded.permanent returning id into v_id;
 insert into public.audit_logs(actor_user_id,action,entity_table,entity_id,metadata) values(auth.uid(),'badge.award','athlete_badges',v_id,jsonb_build_object('user_id',p_user_id,'badge_key',p_badge_key,'permanent',v_system));
 return v_id;
end $$;

create or replace function public.admin_revoke_badge(p_badge_id uuid)
returns boolean language plpgsql security definer set search_path='' as $$
declare r record;
begin
 if auth.uid() is null or not public.is_platform_admin() then raise exception 'Administrator access required'; end if;
 select * into r from public.athlete_badges where id=p_badge_id for update;
 if r.id is null then raise exception 'Badge award not found'; end if;
 if r.permanent or exists(select 1 from public.badge_definitions d where d.badge_key=r.badge_key and d.is_system_badge) then raise exception 'Permanent system badges cannot be revoked'; end if;
 delete from public.athlete_badges where id=p_badge_id;
 insert into public.audit_logs(actor_user_id,action,entity_table,entity_id,metadata) values(auth.uid(),'badge.revoke','athlete_badges',p_badge_id,jsonb_build_object('user_id',r.user_id,'badge_key',r.badge_key));
 return true;
end $$;

create or replace function public.evaluate_athlete_badges(p_user_id uuid)
returns integer language plpgsql security definer set search_path='' as $$
declare v_count integer:=0; v_sessions integer; v_matches integer; v_medals integer; v_gold integer; v_goals integer; v_completed integer; v_milestones integer; r record;
begin
 select count(*) into v_sessions from public.training_sessions where user_id=p_user_id;
 select count(*) into v_matches from public.matches where user_id=p_user_id;
 select count(*) into v_medals from public.medals where user_id=p_user_id and verification_status='verified';
 select count(*) into v_gold from public.medals where user_id=p_user_id and verification_status='verified' and lower(medal_type)='gold';
 select count(*) into v_goals from public.goals where user_id=p_user_id;
 select count(*) into v_completed from public.goals where user_id=p_user_id and lower(status)='completed';
 select count(*) into v_milestones from public.athlete_milestones where user_id=p_user_id;
 for r in select * from (values ('first_session',v_sessions>=1),('training_beast',v_sessions>=25),('century_athlete',v_sessions>=100),('first_fight',v_matches>=1),('podium_finish',v_medals>=1),('gold_standard',v_gold>=1),('medal_machine',v_medals>=5),('goal_setter',v_goals>=1),('goal_crusher',v_completed>=5),('journey_started',v_milestones>=1),('personal_best',v_milestones>=1)) as x(badge_key,eligible) where x.eligible
 loop
  insert into public.athlete_badges(user_id,badge_key,badge_label,awarded_by,permanent,metadata) select p_user_id,d.badge_key,d.badge_label,null,false,jsonb_build_object('system_assigned',true,'evaluation','athlete_progress') from public.badge_definitions d where d.badge_key=r.badge_key on conflict(user_id,badge_key) do nothing;
  if found then v_count:=v_count+1; end if;
 end loop;
 return v_count;
end $$;

create or replace function public.sync_system_badges()
returns void language plpgsql security definer set search_path='' as $$
declare r record; rank_no integer; k text;
begin
 for r in select p.user_id,p.created_at from public.profiles p where p.role='athlete' order by p.created_at,p.user_id limit 10 loop
  select count(*) into rank_no from public.profiles p2 where p2.role='athlete' and (p2.created_at<r.created_at or (p2.created_at=r.created_at and p2.user_id<=r.user_id));
  k:='founding_athlete_'||lpad(rank_no::text,3,'0');
  insert into public.athlete_badges(user_id,badge_key,badge_label,awarded_by,permanent,metadata) select r.user_id,d.badge_key,d.badge_label,null,true,jsonb_build_object('founding_rank',rank_no,'system_assigned',true) from public.badge_definitions d where d.badge_key=k on conflict(user_id,badge_key) do nothing;
 end loop;
 for r in select p.user_id from public.profiles p order by p.created_at,p.user_id limit 25 loop
  insert into public.athlete_badges(user_id,badge_key,badge_label,awarded_by,permanent,metadata) select r.user_id,d.badge_key,d.badge_label,null,true,jsonb_build_object('system_assigned',true,'founding_member',true) from public.badge_definitions d where d.badge_key='founding_member' on conflict(user_id,badge_key) do nothing;
 end loop;
 insert into public.athlete_badges(user_id,badge_key,badge_label,awarded_by,permanent,metadata) select p.user_id,d.badge_key,d.badge_label,null,true,jsonb_build_object('system_assigned',true,'cutoff','2026-10-23') from public.profiles p cross join public.badge_definitions d where p.created_at<timestamptz '2026-10-23 00:00:00+00' and d.badge_key='early_adopter' on conflict(user_id,badge_key) do nothing;
 insert into public.athlete_badges(user_id,badge_key,badge_label,awarded_by,permanent,metadata) select p.user_id,d.badge_key,d.badge_label,null,true,jsonb_build_object('system_assigned',true,'launch_window','2026-10-23/2026-10-30') from public.profiles p cross join public.badge_definitions d where p.created_at>=timestamptz '2026-10-23 00:00:00+00' and p.created_at<timestamptz '2026-10-30 00:00:00+00' and d.badge_key='launch_member' on conflict(user_id,badge_key) do nothing;
 insert into public.athlete_badges(user_id,badge_key,badge_label,awarded_by,permanent,metadata) select p.user_id,'founder','Founder',null,true,jsonb_build_object('system_assigned',true) from public.profiles p where p.founder_badge=true on conflict(user_id,badge_key) do nothing;
 insert into public.athlete_badges(user_id,badge_key,badge_label,awarded_by,permanent,metadata) select p.user_id,'administrator','Administrator',null,true,jsonb_build_object('system_assigned',true,'role',p.role) from public.profiles p where p.role in('support_admin','admin','super_admin') on conflict(user_id,badge_key) do nothing;
end $$;

revoke all on function public.admin_award_badge(uuid,text,jsonb) from public,anon;
grant execute on function public.admin_award_badge(uuid,text,jsonb) to authenticated;
revoke all on function public.admin_revoke_badge(uuid) from public,anon;
grant execute on function public.admin_revoke_badge(uuid) to authenticated;
revoke all on function public.evaluate_athlete_badges(uuid) from public,anon;
grant execute on function public.evaluate_athlete_badges(uuid) to authenticated;
revoke all on function public.sync_system_badges() from public,anon,authenticated;

select public.sync_system_badges();
do $$ declare r record; begin for r in select user_id from public.profiles loop perform public.evaluate_athlete_badges(r.user_id); end loop; end $$;
