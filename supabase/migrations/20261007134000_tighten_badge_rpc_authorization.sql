-- Tighten badge RPC authorization and automatically evaluate earned achievements.
create or replace function public.admin_award_badge(p_user_id uuid,p_badge_key text,p_metadata jsonb default '{}'::jsonb)
returns uuid language plpgsql security definer set search_path='' as $$
declare v_id uuid; v_label text; v_system boolean;
begin
 if auth.uid() is null or not public.is_platform_admin() then raise exception 'Administrator access required'; end if;
 select badge_label,is_system_badge into v_label,v_system from public.badge_definitions where badge_key=p_badge_key;
 if v_label is null then raise exception 'Unknown badge'; end if;
 if v_system then raise exception 'System badges are assigned automatically and cannot be manually awarded'; end if;
 insert into public.athlete_badges(user_id,badge_key,badge_label,awarded_by,permanent,metadata)
 values(p_user_id,p_badge_key,v_label,auth.uid(),false,coalesce(p_metadata,'{}'::jsonb))
 on conflict(user_id,badge_key) do update set awarded_by=auth.uid(),metadata=excluded.metadata returning id into v_id;
 insert into public.audit_logs(actor_user_id,action,entity_table,entity_id,metadata)
 values(auth.uid(),'badge.award','athlete_badges',v_id,jsonb_build_object('user_id',p_user_id,'badge_key',p_badge_key));
 return v_id;
end $$;

create or replace function public.evaluate_athlete_badges(p_user_id uuid)
returns integer language plpgsql security definer set search_path='' as $$
declare v_count integer:=0; v_sessions integer; v_matches integer; v_medals integer; v_gold integer; v_goals integer; v_completed integer; v_milestones integer; v_records integer; r record;
begin
 if auth.uid() is null or (p_user_id <> auth.uid() and not public.is_platform_admin()) then raise exception 'Only the athlete or an administrator can evaluate badges'; end if;
 select count(*) into v_sessions from public.training_sessions where user_id=p_user_id;
 select count(*) into v_matches from public.matches where user_id=p_user_id;
 select count(*) into v_medals from public.medals where user_id=p_user_id and verification_status='verified';
 select count(*) into v_gold from public.medals where user_id=p_user_id and verification_status='verified' and lower(medal_type)='gold';
 select count(*) into v_goals from public.goals where user_id=p_user_id;
 select count(*) into v_completed from public.goals where user_id=p_user_id and lower(status)='completed';
 select count(*) into v_milestones from public.athlete_milestones where user_id=p_user_id;
 select count(*) into v_records from public.personal_records where user_id=p_user_id;
 for r in select * from (values ('first_session',v_sessions>=1),('training_beast',v_sessions>=25),('century_athlete',v_sessions>=100),('first_fight',v_matches>=1),('podium_finish',v_medals>=1),('gold_standard',v_gold>=1),('medal_machine',v_medals>=5),('goal_setter',v_goals>=1),('goal_crusher',v_completed>=5),('journey_started',v_milestones>=1),('personal_best',v_records>=1)) as x(badge_key,eligible) where x.eligible loop
  insert into public.athlete_badges(user_id,badge_key,badge_label,awarded_by,permanent,metadata)
  select p_user_id,d.badge_key,d.badge_label,null,false,jsonb_build_object('system_assigned',true,'evaluation','athlete_progress')
  from public.badge_definitions d where d.badge_key=r.badge_key on conflict(user_id,badge_key) do nothing;
  if found then v_count:=v_count+1; end if;
 end loop;
 return v_count;
end $$;

create or replace function public.trg_evaluate_athlete_badges()
returns trigger language plpgsql security definer set search_path='' as $$
begin perform public.evaluate_athlete_badges(new.user_id); return new; end $$;

drop trigger if exists training_sessions_badge_evaluation on public.training_sessions;
create trigger training_sessions_badge_evaluation after insert or update on public.training_sessions for each row execute function public.trg_evaluate_athlete_badges();
drop trigger if exists matches_badge_evaluation on public.matches;
create trigger matches_badge_evaluation after insert or update on public.matches for each row execute function public.trg_evaluate_athlete_badges();
drop trigger if exists medals_badge_evaluation on public.medals;
create trigger medals_badge_evaluation after insert or update on public.medals for each row execute function public.trg_evaluate_athlete_badges();
drop trigger if exists goals_badge_evaluation on public.goals;
create trigger goals_badge_evaluation after insert or update on public.goals for each row execute function public.trg_evaluate_athlete_badges();
drop trigger if exists milestones_badge_evaluation on public.athlete_milestones;
create trigger milestones_badge_evaluation after insert or update on public.athlete_milestones for each row execute function public.trg_evaluate_athlete_badges();
drop trigger if exists personal_records_badge_evaluation on public.personal_records;
create trigger personal_records_badge_evaluation after insert or update on public.personal_records for each row execute function public.trg_evaluate_athlete_badges();
