-- Enforce approved-account and relationship boundaries on academy and group messaging.
-- Training-group triggers are part of the messaging boundary: a group must not create
-- a chat, or admit a chat member, until both coach and athlete accounts are approved.

CREATE OR REPLACE FUNCTION public.academy_add_coach(p_username text)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $function$
DECLARE v_uid uuid:=auth.uid(); v_coach uuid; v_academy uuid; v_active integer; v_seat uuid;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Authentication required'; END IF;
  IF NOT public.is_age_approved(v_uid) THEN
    RAISE EXCEPTION 'Account approval is required before managing academy members';
  END IF;

  SELECT p.academy_id INTO v_academy FROM public.profiles p
  WHERE p.user_id=v_uid AND p.role='academy_admin' AND p.academy_id IS NOT NULL LIMIT 1;
  IF v_academy IS NULL THEN
    SELECT a.id INTO v_academy FROM public.academies a
    WHERE a.owner_user_id=v_uid AND a.status='active'
    ORDER BY a.created_at DESC LIMIT 1;
  END IF;
  IF v_academy IS NULL OR NOT EXISTS (
    SELECT 1 FROM public.academies a WHERE a.id=v_academy AND (
      a.owner_user_id=v_uid OR EXISTS (
        SELECT 1 FROM public.academy_memberships am
        WHERE am.academy_id=v_academy AND am.user_id=v_uid
          AND am.role='academy_admin' AND am.status='active'
      )
    )
  ) THEN RAISE EXCEPTION 'Active academy administrator access required'; END IF;

  SELECT p.user_id INTO v_coach FROM public.profiles p
  WHERE lower(p.username)=lower(trim(p_username)) AND p.role='coach' LIMIT 1;
  IF v_coach IS NULL THEN RAISE EXCEPTION 'Coach username was not found'; END IF;
  IF NOT public.is_age_approved(v_coach) THEN
    RAISE EXCEPTION 'Coach account approval is required before adding this coach';
  END IF;

  IF EXISTS (SELECT 1 FROM public.academy_memberships am
    WHERE am.academy_id=v_academy AND am.user_id=v_coach AND am.status='active') THEN
    SELECT s.id INTO v_seat FROM public.academy_coach_seats s
    WHERE s.academy_id=v_academy AND s.coach_user_id=v_coach AND s.status='active' LIMIT 1;
    RETURN v_seat;
  END IF;

  SELECT count(*) INTO v_active FROM public.academy_coach_seats s
  WHERE s.academy_id=v_academy AND s.status='active';
  IF v_active>=2 THEN
    RAISE EXCEPTION 'Both included coach seats are already in use. Additional coach seats require paid activation.';
  END IF;

  INSERT INTO public.academy_memberships(academy_id,user_id,role,status)
  VALUES(v_academy,v_coach,'coach','active')
  ON CONFLICT(academy_id,user_id)
  DO UPDATE SET role='coach',status='active',updated_at=now();

  INSERT INTO public.academy_coach_seats(
    academy_id,coach_user_id,seat_type,activation_fee,monthly_fee,status
  ) VALUES(v_academy,v_coach,'included',0,0,'active')
  ON CONFLICT(academy_id,coach_user_id)
  DO UPDATE SET status='active',updated_at=now()
  RETURNING id INTO v_seat;

  UPDATE public.profiles SET academy_id=v_academy,updated_at=now() WHERE user_id=v_coach;
  RETURN v_seat;
END;
$function$;
REVOKE ALL ON FUNCTION public.academy_add_coach(text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.academy_add_coach(text) TO authenticated;


CREATE OR REPLACE FUNCTION public.academy_create_tournament(
  p_name text,p_starts_at date,p_location text,p_athlete_user_id uuid,
  p_discipline text DEFAULT NULL,p_coach_user_id uuid DEFAULT NULL
)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $function$
DECLARE v_uid uuid:=auth.uid(); v_academy uuid; v_id uuid;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Authentication required'; END IF;
  IF NOT public.is_age_approved(v_uid) THEN
    RAISE EXCEPTION 'Account approval is required before managing academy competitions';
  END IF;

  SELECT p.academy_id INTO v_academy FROM public.profiles p
  WHERE p.user_id=v_uid AND p.role='academy_admin';
  IF v_academy IS NULL OR NOT EXISTS (
    SELECT 1 FROM public.academies a WHERE a.id=v_academy AND (
      a.owner_user_id=v_uid OR EXISTS (
        SELECT 1 FROM public.academy_memberships am
        WHERE am.academy_id=v_academy AND am.user_id=v_uid
          AND am.role='academy_admin' AND am.status='active'
      )
    )
  ) THEN RAISE EXCEPTION 'Active academy administrator access required'; END IF;

  IF NOT EXISTS (SELECT 1 FROM public.academy_memberships am
    WHERE am.academy_id=v_academy AND am.user_id=p_athlete_user_id
      AND am.role='athlete' AND am.status='active') THEN
    RAISE EXCEPTION 'Athlete is not an active member of this academy';
  END IF;
  IF NOT public.is_age_approved(p_athlete_user_id) THEN
    RAISE EXCEPTION 'Athlete account approval is required before assigning a competition';
  END IF;

  IF p_coach_user_id IS NOT NULL THEN
    IF NOT EXISTS (SELECT 1 FROM public.academy_memberships am
      WHERE am.academy_id=v_academy AND am.user_id=p_coach_user_id
        AND am.role='coach' AND am.status='active') THEN
      RAISE EXCEPTION 'Coach is not an active member of this academy';
    END IF;
    IF NOT public.is_age_approved(p_coach_user_id) THEN
      RAISE EXCEPTION 'Coach account approval is required before assigning a competition';
    END IF;
  END IF;

  INSERT INTO public.tournaments(
    user_id,name,starts_at,location,status,sport,discipline,coach_user_id
  ) VALUES(
    p_athlete_user_id,trim(p_name),p_starts_at,nullif(trim(p_location),''),
    'scheduled','Taekwondo',nullif(trim(p_discipline),''),p_coach_user_id
  ) RETURNING id INTO v_id;
  RETURN v_id;
END;
$function$;
REVOKE ALL ON FUNCTION public.academy_create_tournament(text,date,text,uuid,text,uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.academy_create_tournament(text,date,text,uuid,text,uuid) TO authenticated;


CREATE OR REPLACE FUNCTION public.academy_create_training_group(
  p_name text,p_focus text,p_recurrence_days text[],p_start_time time,
  p_duration_minutes integer,p_coach_user_id uuid,p_athlete_ids uuid[]
)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $function$
DECLARE
  v_uid uuid:=auth.uid(); v_academy uuid; v_group uuid;
  v_day text; v_date date; v_i integer; v_day_num integer; v_athlete uuid;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Authentication required'; END IF;
  IF NOT public.is_age_approved(v_uid) THEN
    RAISE EXCEPTION 'Account approval is required before creating training groups';
  END IF;

  SELECT p.academy_id INTO v_academy FROM public.profiles p
  WHERE p.user_id=v_uid AND p.role='academy_admin';
  IF v_academy IS NULL OR NOT EXISTS (
    SELECT 1 FROM public.academies a WHERE a.id=v_academy AND (
      a.owner_user_id=v_uid OR EXISTS (
        SELECT 1 FROM public.academy_memberships am
        WHERE am.academy_id=v_academy AND am.user_id=v_uid
          AND am.role='academy_admin' AND am.status='active'
      )
    )
  ) THEN RAISE EXCEPTION 'Active academy administrator access required'; END IF;

  IF NOT EXISTS (SELECT 1 FROM public.academy_memberships am
    WHERE am.academy_id=v_academy AND am.user_id=p_coach_user_id
      AND am.role='coach' AND am.status='active') THEN
    RAISE EXCEPTION 'Coach is not an active member of this academy';
  END IF;
  IF NOT public.is_age_approved(p_coach_user_id) THEN
    RAISE EXCEPTION 'Coach account approval is required before creating a training group';
  END IF;

  FOREACH v_athlete IN ARRAY coalesce(p_athlete_ids,'{}') LOOP
    IF NOT EXISTS (SELECT 1 FROM public.academy_memberships am
      WHERE am.academy_id=v_academy AND am.user_id=v_athlete
        AND am.role='athlete' AND am.status='active') THEN
      RAISE EXCEPTION 'Every selected athlete must be an active academy member';
    END IF;
    IF NOT public.is_age_approved(v_athlete) THEN
      RAISE EXCEPTION 'Every selected athlete must have account approval before joining a training group';
    END IF;
  END LOOP;

  INSERT INTO public.training_groups(
    coach_user_id,name,focus_area,recurrence_days,start_time,duration_minutes
  ) VALUES(
    p_coach_user_id,trim(p_name),nullif(trim(p_focus),''),
    coalesce(p_recurrence_days,'{}'),p_start_time,
    greatest(15,coalesce(p_duration_minutes,90))
  ) RETURNING id INTO v_group;

  FOREACH v_athlete IN ARRAY coalesce(p_athlete_ids,'{}') LOOP
    INSERT INTO public.training_group_members(group_id,athlete_user_id)
    VALUES(v_group,v_athlete) ON CONFLICT DO NOTHING;
  END LOOP;

  FOREACH v_day IN ARRAY coalesce(p_recurrence_days,'{}') LOOP
    v_day_num:=CASE lower(v_day)
      WHEN 'sun' THEN 0 WHEN 'mon' THEN 1 WHEN 'tue' THEN 2
      WHEN 'wed' THEN 3 WHEN 'thu' THEN 4 WHEN 'fri' THEN 5
      WHEN 'sat' THEN 6 ELSE NULL END;
    IF v_day_num IS NOT NULL THEN
      FOR v_i IN 0..55 LOOP
        v_date:=current_date+v_i;
        IF extract(dow FROM v_date)::integer=v_day_num THEN
          INSERT INTO public.training_group_sessions(
            group_id,session_date,start_time,title,status,training_type
          ) VALUES(v_group,v_date,p_start_time,trim(p_name),'scheduled','regular');
        END IF;
      END LOOP;
    END IF;
  END LOOP;
  RETURN v_group;
END;
$function$;
REVOKE ALL ON FUNCTION public.academy_create_training_group(text,text,text[],time,integer,uuid,uuid[]) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.academy_create_training_group(text,text,text[],time,integer,uuid,uuid[]) TO authenticated;


CREATE OR REPLACE FUNCTION public.create_coach_training_group(
  p_name text,p_focus text,p_recurrence_days text[],p_start_time time,
  p_duration_minutes integer,p_athlete_ids uuid[]
)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $function$
DECLARE
  v_uid uuid:=auth.uid(); v_group uuid; v_day text; v_date date;
  v_i integer; v_day_num integer; v_athlete uuid;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Authentication required'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.profiles p WHERE p.user_id=v_uid AND p.role='coach') THEN
    RAISE EXCEPTION 'Coach access required';
  END IF;
  IF NOT public.is_age_approved(v_uid) THEN
    RAISE EXCEPTION 'Account approval is required before creating training groups';
  END IF;

  FOREACH v_athlete IN ARRAY coalesce(p_athlete_ids,'{}') LOOP
    IF NOT EXISTS (SELECT 1 FROM public.coach_athlete_links l
      WHERE l.coach_user_id=v_uid AND l.athlete_user_id=v_athlete AND l.status='active') THEN
      RAISE EXCEPTION 'Every selected athlete must be actively connected to this coach';
    END IF;
    IF NOT public.is_age_approved(v_athlete) THEN
      RAISE EXCEPTION 'Every selected athlete must have account approval before joining a training group';
    END IF;
  END LOOP;

  INSERT INTO public.training_groups(
    coach_user_id,name,focus_area,recurrence_days,start_time,duration_minutes
  ) VALUES(
    v_uid,trim(p_name),nullif(trim(p_focus),''),
    coalesce(p_recurrence_days,'{}'),p_start_time,
    greatest(15,coalesce(p_duration_minutes,90))
  ) RETURNING id INTO v_group;

  FOREACH v_athlete IN ARRAY coalesce(p_athlete_ids,'{}') LOOP
    INSERT INTO public.training_group_members(group_id,athlete_user_id)
    VALUES(v_group,v_athlete) ON CONFLICT DO NOTHING;
  END LOOP;

  FOREACH v_day IN ARRAY coalesce(p_recurrence_days,'{}') LOOP
    v_day_num:=CASE lower(v_day)
      WHEN 'sun' THEN 0 WHEN 'mon' THEN 1 WHEN 'tue' THEN 2
      WHEN 'wed' THEN 3 WHEN 'thu' THEN 4 WHEN 'fri' THEN 5
      WHEN 'sat' THEN 6 ELSE NULL END;
    IF v_day_num IS NOT NULL THEN
      FOR v_i IN 0..55 LOOP
        v_date:=current_date+v_i;
        IF extract(dow FROM v_date)::integer=v_day_num THEN
          INSERT INTO public.training_group_sessions(
            group_id,session_date,start_time,title,status,training_type
          ) VALUES(v_group,v_date,p_start_time,trim(p_name),'scheduled','regular');
        END IF;
      END LOOP;
    END IF;
  END LOOP;
  RETURN v_group;
END;
$function$;
REVOKE ALL ON FUNCTION public.create_coach_training_group(text,text,text[],time,integer,uuid[]) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.create_coach_training_group(text,text,text[],time,integer,uuid[]) TO authenticated;


CREATE OR REPLACE FUNCTION public.create_coach_extra_training(
  p_group_id uuid,p_session_date date,p_start_time time,p_duration_minutes integer,
  p_training_type text,p_title text,p_focus text DEFAULT NULL,
  p_venue text DEFAULT NULL,p_notes text DEFAULT NULL
)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $function$
DECLARE v_user uuid:=auth.uid(); v_id uuid;
BEGIN
  IF v_user IS NULL THEN RAISE EXCEPTION 'Authentication required'; END IF;
  IF NOT public.is_age_approved(v_user) THEN
    RAISE EXCEPTION 'Account approval is required before managing training sessions';
  END IF;
  IF p_group_id IS NULL OR p_session_date IS NULL OR p_start_time IS NULL THEN
    RAISE EXCEPTION 'Group, date and start time are required';
  END IF;
  IF p_duration_minutes IS NULL OR p_duration_minutes NOT BETWEEN 15 AND 360 THEN
    RAISE EXCEPTION 'Session duration must be between 15 and 360 minutes';
  END IF;
  IF p_title IS NULL OR length(trim(p_title)) NOT BETWEEN 1 AND 120 THEN
    RAISE EXCEPTION 'Session title must be between 1 and 120 characters';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.training_groups g WHERE g.id=p_group_id AND g.coach_user_id=v_user) THEN
    RAISE EXCEPTION 'Coach access required';
  END IF;
  INSERT INTO public.training_group_sessions(
    group_id,session_date,start_time,title,status,training_type,venue,notes
  ) VALUES(
    p_group_id,p_session_date,p_start_time,trim(p_title),'scheduled',
    coalesce(nullif(trim(p_training_type),''),'other'),
    nullif(trim(p_venue),''),nullif(trim(p_notes),'')
  ) RETURNING id INTO v_id;
  RETURN v_id;
END;
$function$;
REVOKE ALL ON FUNCTION public.create_coach_extra_training(uuid,date,time,integer,text,text,text,text,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.create_coach_extra_training(uuid,date,time,integer,text,text,text,text,text) TO authenticated;


CREATE OR REPLACE FUNCTION public.cancel_coach_training_date(
  p_date date,p_group_id uuid DEFAULT NULL,p_reason text DEFAULT 'Academy holiday'
)
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $function$
DECLARE v_user uuid:=auth.uid(); v_count integer;
BEGIN
  IF v_user IS NULL THEN RAISE EXCEPTION 'Authentication required'; END IF;
  IF NOT public.is_age_approved(v_user) THEN
    RAISE EXCEPTION 'Account approval is required before managing training sessions';
  END IF;
  IF p_date IS NULL THEN RAISE EXCEPTION 'Training date is required'; END IF;
  UPDATE public.training_group_sessions s
  SET status='cancelled',notes=nullif(trim(p_reason),''),updated_at=now()
  FROM public.training_groups g
  WHERE s.group_id=g.id AND g.coach_user_id=v_user
    AND s.session_date=p_date AND s.status<>'cancelled'
    AND (p_group_id IS NULL OR s.group_id=p_group_id);
  GET DIAGNOSTICS v_count=ROW_COUNT;
  RETURN v_count;
END;
$function$;
REVOKE ALL ON FUNCTION public.cancel_coach_training_date(date,uuid,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.cancel_coach_training_date(date,uuid,text) TO authenticated;


CREATE OR REPLACE FUNCTION public.cancel_coach_training_session(p_session_id uuid,p_reason text DEFAULT NULL)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $function$
DECLARE v_user uuid:=auth.uid(); v_coach uuid;
BEGIN
  IF v_user IS NULL THEN RAISE EXCEPTION 'Authentication required'; END IF;
  IF NOT public.is_age_approved(v_user) THEN
    RAISE EXCEPTION 'Account approval is required before managing training sessions';
  END IF;
  IF p_session_id IS NULL THEN RAISE EXCEPTION 'Training session is required'; END IF;
  SELECT g.coach_user_id INTO v_coach
  FROM public.training_group_sessions s
  JOIN public.training_groups g ON g.id=s.group_id
  WHERE s.id=p_session_id;
  IF v_coach IS NULL OR v_coach<>v_user THEN RAISE EXCEPTION 'Coach access required'; END IF;
  UPDATE public.training_group_sessions
  SET status='cancelled',notes=nullif(trim(p_reason),''),updated_at=now()
  WHERE id=p_session_id AND status<>'cancelled';
END;
$function$;
REVOKE ALL ON FUNCTION public.cancel_coach_training_session(uuid,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.cancel_coach_training_session(uuid,text) TO authenticated;


CREATE OR REPLACE FUNCTION public.update_coach_training_session(
  p_session_id uuid,p_start_time time DEFAULT NULL,p_duration_minutes integer DEFAULT NULL,
  p_training_type text DEFAULT NULL,p_venue text DEFAULT NULL,p_notes text DEFAULT NULL
)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $function$
DECLARE v_user uuid:=auth.uid();
BEGIN
  IF v_user IS NULL THEN RAISE EXCEPTION 'Authentication required'; END IF;
  IF NOT public.is_age_approved(v_user) THEN
    RAISE EXCEPTION 'Account approval is required before managing training sessions';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.training_group_sessions s
    JOIN public.training_groups g ON g.id=s.group_id
    WHERE s.id=p_session_id AND g.coach_user_id=v_user
  ) THEN RAISE EXCEPTION 'Coach access required'; END IF;
  UPDATE public.training_group_sessions
  SET start_time=coalesce(p_start_time,start_time),
      training_type=coalesce(nullif(trim(p_training_type),''),training_type),
      venue=coalesce(nullif(trim(p_venue),''),venue),
      notes=coalesce(p_notes,notes),
      updated_at=now()
  WHERE id=p_session_id AND locked=false AND status<>'cancelled';
END;
$function$;
REVOKE ALL ON FUNCTION public.update_coach_training_session(uuid,time,integer,text,text,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.update_coach_training_session(uuid,time,integer,text,text,text) TO authenticated;


CREATE OR REPLACE FUNCTION public.create_group_conversation(p_name text)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $function$
DECLARE v_user uuid:=auth.uid(); v_role text; v_conversation uuid;
BEGIN
  IF v_user IS NULL THEN RAISE EXCEPTION 'Authentication required'; END IF;
  IF NOT public.is_age_approved(v_user) THEN
    RAISE EXCEPTION 'Age approval is required before creating messaging groups';
  END IF;
  SELECT p.role INTO v_role FROM public.profiles p WHERE p.user_id=v_user;
  IF v_role NOT IN ('coach','academy_admin','admin','super_admin') THEN
    RAISE EXCEPTION 'Only coaches or authorized admins can create groups';
  END IF;
  IF char_length(trim(coalesce(p_name,''))) NOT BETWEEN 2 AND 80 THEN
    RAISE EXCEPTION 'Group name must be between 2 and 80 characters';
  END IF;
  INSERT INTO public.conversations(kind,name,created_by)
  VALUES('group',trim(p_name),v_user) RETURNING id INTO v_conversation;
  INSERT INTO public.conversation_members(conversation_id,user_id)
  VALUES(v_conversation,v_user);
  RETURN v_conversation;
END;
$function$;
REVOKE ALL ON FUNCTION public.create_group_conversation(text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.create_group_conversation(text) TO authenticated;


CREATE OR REPLACE FUNCTION public.ensure_training_group_conversation()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $function$
DECLARE v_conversation uuid;
BEGIN
  IF NOT public.is_age_approved(NEW.coach_user_id) THEN
    RAISE EXCEPTION 'Coach account approval is required before creating a training-group chat';
  END IF;
  IF NEW.conversation_id IS NULL THEN
    INSERT INTO public.conversations(kind,name,created_by)
    VALUES('group',NEW.name,NEW.coach_user_id) RETURNING id INTO v_conversation;
    INSERT INTO public.conversation_members(conversation_id,user_id)
    VALUES(v_conversation,NEW.coach_user_id) ON CONFLICT DO NOTHING;
    INSERT INTO public.conversation_members(conversation_id,user_id)
    SELECT v_conversation,m.athlete_user_id
    FROM public.training_group_members m
    WHERE m.group_id=NEW.id AND m.status='active'
      AND public.is_age_approved(m.athlete_user_id)
    ON CONFLICT DO NOTHING;
    NEW.conversation_id:=v_conversation;
  END IF;
  RETURN NEW;
END;
$function$;
REVOKE ALL ON FUNCTION public.ensure_training_group_conversation() FROM PUBLIC,anon,authenticated;


CREATE OR REPLACE FUNCTION public.sync_training_group_chat_member()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $function$
DECLARE v_conversation uuid; v_coach uuid;
BEGIN
  SELECT g.conversation_id,g.coach_user_id INTO v_conversation,v_coach
  FROM public.training_groups g WHERE g.id=coalesce(NEW.group_id,OLD.group_id);

  IF v_conversation IS NOT NULL AND TG_OP IN ('INSERT','UPDATE') AND NEW.status='active' THEN
    IF NOT public.is_age_approved(v_coach)
       OR NOT public.is_age_approved(NEW.athlete_user_id) THEN
      RAISE EXCEPTION 'Coach and athlete account approval is required before joining a training-group chat';
    END IF;
    INSERT INTO public.conversation_members(conversation_id,user_id)
    VALUES(v_conversation,NEW.athlete_user_id) ON CONFLICT DO NOTHING;
  ELSIF v_conversation IS NOT NULL AND TG_OP='UPDATE' AND NEW.status<>'active' THEN
    DELETE FROM public.conversation_members
    WHERE conversation_id=v_conversation AND user_id=NEW.athlete_user_id AND user_id<>v_coach;
  ELSIF v_conversation IS NOT NULL AND TG_OP='DELETE' THEN
    DELETE FROM public.conversation_members
    WHERE conversation_id=v_conversation AND user_id=OLD.athlete_user_id AND user_id<>v_coach;
  END IF;
  RETURN coalesce(NEW,OLD);
END;
$function$;
REVOKE ALL ON FUNCTION public.sync_training_group_chat_member() FROM PUBLIC,anon,authenticated;
