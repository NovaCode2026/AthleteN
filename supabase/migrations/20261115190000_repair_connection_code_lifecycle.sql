-- Repair code ownership after role changes and make switching connections deterministic.
-- Age-approval checks remain enforced; no approval state is bypassed.

UPDATE public.connection_codes cc
SET active = false, updated_at = now()
WHERE cc.active = true
  AND (
    (cc.owner_type = 'coach' AND NOT EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.user_id = cc.owner_user_id AND p.role = 'coach'
    ))
    OR
    (cc.owner_type = 'academy' AND (
      cc.academy_id IS NULL OR NOT EXISTS (
        SELECT 1
        FROM public.profiles p
        JOIN public.academies a ON a.id = cc.academy_id
        WHERE p.user_id = cc.owner_user_id
          AND p.role = 'academy_admin'
          AND p.academy_id = cc.academy_id
          AND (
            a.owner_user_id = cc.owner_user_id
            OR EXISTS (
              SELECT 1 FROM public.academy_memberships am
              WHERE am.academy_id = cc.academy_id
                AND am.user_id = cc.owner_user_id
                AND am.role = 'academy_admin'
                AND am.status = 'active'
            )
          )
      )
    ))
  );

CREATE OR REPLACE FUNCTION public.set_connection_code(p_code text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $function$
DECLARE
  v_uid uuid := auth.uid();
  v_role text;
  v_academy uuid;
  v_normalized text := upper(btrim(coalesce(p_code, '')));
  v_existing_id uuid;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Authentication required'; END IF;
  IF NOT public.is_age_approved(v_uid) THEN
    RAISE EXCEPTION 'Account approval is required before creating connection codes';
  END IF;
  IF length(v_normalized) NOT BETWEEN 4 AND 30 OR v_normalized !~ '^[A-Z0-9][A-Z0-9._-]*$' THEN
    RAISE EXCEPTION 'Connection codes must be 4-30 characters and use letters, numbers, dot, dash or underscore';
  END IF;
  SELECT p.role,p.academy_id INTO v_role,v_academy FROM public.profiles p WHERE p.user_id=v_uid;

  IF v_role='coach' THEN
    UPDATE public.connection_codes cc SET active=false,updated_at=now()
    WHERE cc.owner_user_id=v_uid AND cc.owner_type='academy' AND cc.active=true;

    SELECT cc.id INTO v_existing_id FROM public.connection_codes cc
    WHERE cc.owner_user_id=v_uid AND cc.owner_type='coach' AND cc.active=true
    ORDER BY cc.created_at DESC LIMIT 1;
    IF v_existing_id IS NULL THEN
      SELECT cc.id INTO v_existing_id FROM public.connection_codes cc
      WHERE cc.owner_user_id=v_uid AND cc.owner_type='coach'
        AND lower(btrim(cc.code))=lower(v_normalized)
      ORDER BY cc.created_at DESC LIMIT 1;
    END IF;
    IF EXISTS(SELECT 1 FROM public.connection_codes cc
      WHERE lower(btrim(cc.code))=lower(v_normalized) AND cc.id IS DISTINCT FROM v_existing_id) THEN
      RAISE EXCEPTION 'That code is already reserved. Choose a different Coach code';
    END IF;
    IF v_existing_id IS NULL THEN
      INSERT INTO public.connection_codes(code,owner_user_id,owner_type,academy_id,active)
      VALUES(v_normalized,v_uid,'coach',v_academy,true);
    ELSE
      UPDATE public.connection_codes SET code=v_normalized,academy_id=v_academy,active=true,updated_at=now()
      WHERE id=v_existing_id;
    END IF;
    RETURN jsonb_build_object('code',v_normalized,'type','coach');
  END IF;

  IF v_role='academy_admin' THEN
    IF v_academy IS NULL OR NOT EXISTS(SELECT 1 FROM public.academies a WHERE a.id=v_academy
      AND (a.owner_user_id=v_uid OR EXISTS(SELECT 1 FROM public.academy_memberships am
        WHERE am.academy_id=a.id AND am.user_id=v_uid AND am.role='academy_admin' AND am.status='active'))) THEN
      RAISE EXCEPTION 'An active academy administrator role is required';
    END IF;
    UPDATE public.connection_codes cc SET active=false,updated_at=now()
    WHERE cc.owner_user_id=v_uid AND cc.owner_type='coach' AND cc.active=true;

    SELECT cc.id INTO v_existing_id FROM public.connection_codes cc
    WHERE cc.academy_id=v_academy AND cc.owner_type='academy'
    ORDER BY cc.active DESC,cc.created_at DESC LIMIT 1;
    IF EXISTS(SELECT 1 FROM public.connection_codes cc
      WHERE lower(btrim(cc.code))=lower(v_normalized) AND cc.id IS DISTINCT FROM v_existing_id) THEN
      RAISE EXCEPTION 'That code is already reserved. Choose a different Academy code';
    END IF;
    IF v_existing_id IS NULL THEN
      INSERT INTO public.connection_codes(code,owner_user_id,owner_type,academy_id,active)
      VALUES(v_normalized,v_uid,'academy',v_academy,true);
    ELSE
      UPDATE public.connection_codes SET code=v_normalized,owner_user_id=v_uid,academy_id=v_academy,active=true,updated_at=now()
      WHERE id=v_existing_id;
    END IF;
    RETURN jsonb_build_object('code',v_normalized,'type','academy');
  END IF;
  RAISE EXCEPTION 'Only Coach and Academy Admin accounts can create connection codes';
END;
$function$;

CREATE OR REPLACE FUNCTION public.get_my_connection_code()
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = '' AS $function$
DECLARE
  v_uid uuid := auth.uid(); v_role text; v_academy uuid; v_code text; v_type text;
BEGIN
  IF v_uid IS NULL THEN RETURN '{}'::jsonb; END IF;
  SELECT p.role,p.academy_id INTO v_role,v_academy FROM public.profiles p WHERE p.user_id=v_uid;
  IF v_role='coach' THEN
    SELECT cc.code,cc.owner_type INTO v_code,v_type FROM public.connection_codes cc
    WHERE cc.active=true AND cc.owner_user_id=v_uid AND cc.owner_type='coach'
      AND EXISTS(SELECT 1 FROM public.profiles p WHERE p.user_id=v_uid AND p.role='coach')
    ORDER BY cc.created_at DESC LIMIT 1;
  ELSIF v_role='academy_admin' AND v_academy IS NOT NULL THEN
    SELECT cc.code,cc.owner_type INTO v_code,v_type
    FROM public.connection_codes cc JOIN public.profiles issuer ON issuer.user_id=cc.owner_user_id
    WHERE cc.active=true AND cc.academy_id=v_academy AND cc.owner_type='academy'
      AND issuer.role='academy_admin' AND issuer.academy_id=v_academy
      AND public.is_age_approved(cc.owner_user_id)
      AND (EXISTS(SELECT 1 FROM public.academies a WHERE a.id=v_academy AND a.owner_user_id=cc.owner_user_id)
        OR EXISTS(SELECT 1 FROM public.academy_memberships am WHERE am.academy_id=v_academy
          AND am.user_id=cc.owner_user_id AND am.role='academy_admin' AND am.status='active'))
    ORDER BY cc.created_at DESC LIMIT 1;
  END IF;
  IF v_code IS NULL THEN RETURN '{}'::jsonb; END IF;
  RETURN jsonb_build_object('code',v_code,'type',v_type);
END;
$function$;

CREATE OR REPLACE FUNCTION public.connect_athlete_by_code(p_code text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $function$
DECLARE
  v_uid uuid := auth.uid(); v_role text; v_code public.connection_codes%ROWTYPE; v_academy_name text;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Authentication required'; END IF;
  SELECT p.role INTO v_role FROM public.profiles p WHERE p.user_id=v_uid;
  IF v_role IS DISTINCT FROM 'athlete' THEN RAISE EXCEPTION 'Only athlete accounts can use team connection codes'; END IF;
  IF NOT public.is_age_approved(v_uid) THEN
    RAISE EXCEPTION 'Account approval is required before joining a Coach or Academy';
  END IF;
  IF p_code IS NULL OR length(btrim(p_code)) NOT BETWEEN 4 AND 30 THEN RAISE EXCEPTION 'A valid team connection code is required'; END IF;
  SELECT cc.* INTO v_code FROM public.connection_codes cc
  WHERE cc.active=true AND lower(btrim(cc.code))=lower(btrim(p_code)) LIMIT 1;
  IF NOT FOUND THEN RAISE EXCEPTION 'Connection code not found'; END IF;
  IF NOT public.is_age_approved(v_code.owner_user_id) THEN
    RAISE EXCEPTION 'The account that issued this connection code is not approved';
  END IF;

  IF v_code.owner_type='coach' THEN
    IF NOT EXISTS(SELECT 1 FROM public.profiles p WHERE p.user_id=v_code.owner_user_id AND p.role='coach') THEN
      RAISE EXCEPTION 'This Coach connection code is no longer valid. Ask the Coach for their current code';
    END IF;
    UPDATE public.coach_athlete_links SET status='ended',updated_at=now()
    WHERE athlete_user_id=v_uid AND status='active' AND coach_user_id<>v_code.owner_user_id;
    INSERT INTO public.coach_athlete_links(coach_user_id,athlete_user_id,academy_id,status)
    VALUES(v_code.owner_user_id,v_uid,v_code.academy_id,'active')
    ON CONFLICT(coach_user_id,athlete_user_id) DO UPDATE SET
      academy_id=coalesce(EXCLUDED.academy_id,public.coach_athlete_links.academy_id),status='active',updated_at=now();
    UPDATE public.profiles SET coach_user_id=v_code.owner_user_id,
      coach=(SELECT p.full_name FROM public.profiles p WHERE p.user_id=v_code.owner_user_id),
      academy_id=coalesce(v_code.academy_id,academy_id),
      academy=coalesce((SELECT a.name FROM public.academies a WHERE a.id=v_code.academy_id),academy),
      updated_at=now() WHERE user_id=v_uid;
    RETURN jsonb_build_object('type','coach','owner_user_id',v_code.owner_user_id,'academy_id',v_code.academy_id);
  END IF;

  IF v_code.owner_type='academy' THEN
    IF v_code.academy_id IS NULL OR NOT EXISTS(
      SELECT 1 FROM public.profiles owner_profile JOIN public.academies a ON a.id=v_code.academy_id
      WHERE owner_profile.user_id=v_code.owner_user_id AND owner_profile.role='academy_admin'
        AND owner_profile.academy_id=v_code.academy_id
        AND (a.owner_user_id=v_code.owner_user_id OR EXISTS(
          SELECT 1 FROM public.academy_memberships am WHERE am.academy_id=v_code.academy_id
            AND am.user_id=v_code.owner_user_id AND am.role='academy_admin' AND am.status='active'))) THEN
      RAISE EXCEPTION 'This Academy connection code is no longer valid. Ask the Academy Admin for its current code';
    END IF;
    SELECT a.name INTO v_academy_name FROM public.academies a WHERE a.id=v_code.academy_id;
    UPDATE public.academy_memberships SET status='left',updated_at=now()
    WHERE user_id=v_uid AND role='athlete' AND status='active' AND academy_id<>v_code.academy_id;
    INSERT INTO public.academy_memberships(academy_id,user_id,role,status,joined_at)
    VALUES(v_code.academy_id,v_uid,'athlete','active',now())
    ON CONFLICT(academy_id,user_id) DO UPDATE SET role='athlete',status='active',
      joined_at=coalesce(public.academy_memberships.joined_at,now()),updated_at=now();
    UPDATE public.profiles SET academy_id=v_code.academy_id,academy=coalesce(v_academy_name,academy),updated_at=now()
    WHERE user_id=v_uid;
    RETURN jsonb_build_object('type','academy','owner_user_id',v_code.owner_user_id,'academy_id',v_code.academy_id);
  END IF;
  RAISE EXCEPTION 'Unsupported connection code type';
END;
$function$;

CREATE OR REPLACE FUNCTION public.connect_coach_to_academy_by_code(p_code text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $function$
DECLARE
  v_uid uuid := auth.uid(); v_role text; v_code public.connection_codes%ROWTYPE; v_academy_name text;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Authentication required'; END IF;
  SELECT p.role INTO v_role FROM public.profiles p WHERE p.user_id=v_uid;
  IF v_role IS DISTINCT FROM 'coach' THEN RAISE EXCEPTION 'Only Coach accounts can join an Academy'; END IF;
  IF NOT public.is_age_approved(v_uid) THEN RAISE EXCEPTION 'Account approval is required before joining an Academy'; END IF;
  IF p_code IS NULL OR length(btrim(p_code)) NOT BETWEEN 4 AND 30 THEN RAISE EXCEPTION 'A valid Academy connection code is required'; END IF;
  SELECT cc.* INTO v_code FROM public.connection_codes cc
  WHERE cc.active=true AND lower(btrim(cc.code))=lower(btrim(p_code))
    AND cc.owner_type='academy' AND cc.academy_id IS NOT NULL LIMIT 1;
  IF NOT FOUND THEN RAISE EXCEPTION 'Academy connection code not found'; END IF;
  IF NOT public.is_age_approved(v_code.owner_user_id) THEN
    RAISE EXCEPTION 'The account that issued this Academy code is not approved';
  END IF;
  IF NOT EXISTS(
    SELECT 1 FROM public.profiles owner_profile JOIN public.academies a ON a.id=v_code.academy_id
    WHERE owner_profile.user_id=v_code.owner_user_id AND owner_profile.role='academy_admin'
      AND owner_profile.academy_id=v_code.academy_id
      AND (a.owner_user_id=v_code.owner_user_id OR EXISTS(
        SELECT 1 FROM public.academy_memberships am WHERE am.academy_id=v_code.academy_id
          AND am.user_id=v_code.owner_user_id AND am.role='academy_admin' AND am.status='active'))) THEN
    RAISE EXCEPTION 'This Academy connection code is no longer valid';
  END IF;
  SELECT a.name INTO v_academy_name FROM public.academies a WHERE a.id=v_code.academy_id;
  UPDATE public.academy_memberships SET status='left',updated_at=now()
  WHERE user_id=v_uid AND role='coach' AND status='active' AND academy_id<>v_code.academy_id;
  INSERT INTO public.academy_memberships(academy_id,user_id,role,status,joined_at)
  VALUES(v_code.academy_id,v_uid,'coach','active',now())
  ON CONFLICT(academy_id,user_id) DO UPDATE SET role='coach',status='active',
    joined_at=coalesce(public.academy_memberships.joined_at,now()),updated_at=now();
  UPDATE public.profiles SET academy_id=v_code.academy_id,
    academy=coalesce(v_academy_name,academy),updated_at=now() WHERE user_id=v_uid;
  RETURN jsonb_build_object('academy_id',v_code.academy_id,'academy_name',coalesce(v_academy_name,'Academy'));
END;
$function$;

REVOKE ALL ON FUNCTION public.set_connection_code(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.set_connection_code(text) TO authenticated;
REVOKE ALL ON FUNCTION public.get_my_connection_code() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_my_connection_code() TO authenticated;
REVOKE ALL ON FUNCTION public.connect_athlete_by_code(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.connect_athlete_by_code(text) TO authenticated;
REVOKE ALL ON FUNCTION public.connect_coach_to_academy_by_code(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.connect_coach_to_academy_by_code(text) TO authenticated;