-- Require approved accounts for every team connection mutation.
-- Revalidate academy-code issuers and reactivate an existing membership only
-- when the athlete/coach deliberately submits a valid code.

CREATE OR REPLACE FUNCTION public.coach_add_athlete_by_account_code(p_code text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_uid uuid := auth.uid();
  v_athlete uuid;
  v_athlete_name text;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Authentication required'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.profiles WHERE user_id=v_uid AND role='coach') THEN
    RAISE EXCEPTION 'Coach access required';
  END IF;
  IF NOT public.is_age_approved(v_uid) THEN
    RAISE EXCEPTION 'Account approval is required before connecting athletes';
  END IF;
  IF p_code IS NULL OR length(btrim(p_code)) NOT BETWEEN 3 AND 30 THEN
    RAISE EXCEPTION 'A valid athlete account code is required';
  END IF;

  SELECT p.user_id,p.full_name INTO v_athlete,v_athlete_name
  FROM public.profiles p
  WHERE p.role='athlete' AND lower(p.account_code)=lower(btrim(p_code))
  LIMIT 1;
  IF v_athlete IS NULL THEN RAISE EXCEPTION 'Athlete account code not found'; END IF;
  IF v_athlete=v_uid THEN RAISE EXCEPTION 'You cannot add yourself'; END IF;
  IF NOT public.is_age_approved(v_athlete) THEN
    RAISE EXCEPTION 'Athlete account approval is required before a coach connection can be created';
  END IF;

  INSERT INTO public.coach_athlete_links(coach_user_id,athlete_user_id,status)
  VALUES(v_uid,v_athlete,'active')
  ON CONFLICT(coach_user_id,athlete_user_id)
  DO UPDATE SET status='active',updated_at=now();

  RETURN jsonb_build_object('user_id',v_athlete,'full_name',v_athlete_name,'account_code',btrim(p_code));
END;
$function$;
REVOKE ALL ON FUNCTION public.coach_add_athlete_by_account_code(text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.coach_add_athlete_by_account_code(text) TO authenticated;


CREATE OR REPLACE FUNCTION public.connect_athlete_by_code(p_code text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_uid uuid := auth.uid();
  v_role text;
  v_code public.connection_codes%ROWTYPE;
  v_academy_name text;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Authentication required'; END IF;
  SELECT p.role INTO v_role FROM public.profiles p WHERE p.user_id=v_uid;
  IF v_role IS DISTINCT FROM 'athlete' THEN
    RAISE EXCEPTION 'Only athlete accounts can use team connection codes';
  END IF;
  IF NOT public.is_age_approved(v_uid) THEN
    RAISE EXCEPTION 'Account approval is required before joining a coach or academy';
  END IF;
  IF p_code IS NULL OR length(btrim(p_code)) NOT BETWEEN 4 AND 30 THEN
    RAISE EXCEPTION 'A valid team connection code is required';
  END IF;

  SELECT cc.* INTO v_code
  FROM public.connection_codes cc
  WHERE cc.active=true AND lower(btrim(cc.code))=lower(btrim(p_code))
  LIMIT 1;
  IF NOT FOUND THEN RAISE EXCEPTION 'Connection code not found'; END IF;
  IF NOT public.is_age_approved(v_code.owner_user_id) THEN
    RAISE EXCEPTION 'The account that issued this connection code is not approved';
  END IF;

  IF v_code.owner_type='coach' THEN
    IF NOT EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.user_id=v_code.owner_user_id AND p.role='coach'
    ) THEN RAISE EXCEPTION 'This coach connection code is no longer valid'; END IF;

    INSERT INTO public.coach_athlete_links(coach_user_id,athlete_user_id,academy_id,status)
    VALUES(v_code.owner_user_id,v_uid,v_code.academy_id,'active')
    ON CONFLICT(coach_user_id,athlete_user_id)
    DO UPDATE SET
      academy_id=coalesce(EXCLUDED.academy_id,public.coach_athlete_links.academy_id),
      status='active',updated_at=now();

    UPDATE public.profiles
    SET coach_user_id=v_code.owner_user_id,
        coach=(SELECT p.full_name FROM public.profiles p WHERE p.user_id=v_code.owner_user_id),
        academy_id=coalesce(v_code.academy_id,academy_id),
        academy=coalesce((SELECT a.name FROM public.academies a WHERE a.id=v_code.academy_id),academy),
        updated_at=now()
    WHERE user_id=v_uid;

    RETURN jsonb_build_object('type','coach','owner_user_id',v_code.owner_user_id,'academy_id',v_code.academy_id);
  END IF;

  IF v_code.owner_type='academy' THEN
    IF v_code.academy_id IS NULL OR NOT EXISTS (
      SELECT 1 FROM public.profiles owner_profile
      JOIN public.academies a ON a.id=v_code.academy_id
      WHERE owner_profile.user_id=v_code.owner_user_id
        AND owner_profile.role='academy_admin'
        AND owner_profile.academy_id=v_code.academy_id
        AND (
          a.owner_user_id=v_code.owner_user_id
          OR EXISTS (
            SELECT 1 FROM public.academy_memberships am
            WHERE am.academy_id=v_code.academy_id
              AND am.user_id=v_code.owner_user_id
              AND am.role='academy_admin' AND am.status='active'
          )
        )
    ) THEN RAISE EXCEPTION 'This academy connection code is no longer valid'; END IF;

    SELECT a.name INTO v_academy_name FROM public.academies a WHERE a.id=v_code.academy_id;

    INSERT INTO public.academy_memberships(academy_id,user_id,role,status,joined_at)
    VALUES(v_code.academy_id,v_uid,'athlete','active',now())
    ON CONFLICT(academy_id,user_id)
    DO UPDATE SET
      role='athlete',status='active',
      joined_at=coalesce(public.academy_memberships.joined_at,now()),updated_at=now();

    UPDATE public.profiles
    SET academy_id=v_code.academy_id,
        academy=coalesce(v_academy_name,academy),
        updated_at=now()
    WHERE user_id=v_uid;

    RETURN jsonb_build_object('type','academy','owner_user_id',v_code.owner_user_id,'academy_id',v_code.academy_id);
  END IF;

  RAISE EXCEPTION 'Unsupported connection code type';
END;
$function$;
REVOKE ALL ON FUNCTION public.connect_athlete_by_code(text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.connect_athlete_by_code(text) TO authenticated;


CREATE OR REPLACE FUNCTION public.connect_coach_to_academy_by_code(p_code text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_uid uuid := auth.uid();
  v_role text;
  v_code public.connection_codes%ROWTYPE;
  v_academy_name text;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Authentication required'; END IF;
  SELECT p.role INTO v_role FROM public.profiles p WHERE p.user_id=v_uid;
  IF v_role IS DISTINCT FROM 'coach' THEN
    RAISE EXCEPTION 'Only coach accounts can join an academy';
  END IF;
  IF NOT public.is_age_approved(v_uid) THEN
    RAISE EXCEPTION 'Account approval is required before joining an academy';
  END IF;
  IF p_code IS NULL OR length(btrim(p_code)) NOT BETWEEN 4 AND 30 THEN
    RAISE EXCEPTION 'A valid academy connection code is required';
  END IF;

  SELECT cc.* INTO v_code
  FROM public.connection_codes cc
  WHERE cc.active=true AND lower(btrim(cc.code))=lower(btrim(p_code))
    AND cc.owner_type='academy' AND cc.academy_id IS NOT NULL
  LIMIT 1;
  IF NOT FOUND THEN RAISE EXCEPTION 'Academy connection code not found'; END IF;
  IF NOT public.is_age_approved(v_code.owner_user_id) THEN
    RAISE EXCEPTION 'The account that issued this connection code is not approved';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.profiles owner_profile
    JOIN public.academies a ON a.id=v_code.academy_id
    WHERE owner_profile.user_id=v_code.owner_user_id
      AND owner_profile.role='academy_admin'
      AND owner_profile.academy_id=v_code.academy_id
      AND (
        a.owner_user_id=v_code.owner_user_id
        OR EXISTS (
          SELECT 1 FROM public.academy_memberships am
          WHERE am.academy_id=v_code.academy_id
            AND am.user_id=v_code.owner_user_id
            AND am.role='academy_admin' AND am.status='active'
        )
      )
  ) THEN RAISE EXCEPTION 'This academy connection code is no longer valid'; END IF;

  SELECT a.name INTO v_academy_name FROM public.academies a WHERE a.id=v_code.academy_id;
  INSERT INTO public.academy_memberships(academy_id,user_id,role,status,joined_at)
  VALUES(v_code.academy_id,v_uid,'coach','active',now())
  ON CONFLICT(academy_id,user_id)
  DO UPDATE SET
    role='coach',status='active',
    joined_at=coalesce(public.academy_memberships.joined_at,now()),updated_at=now();

  UPDATE public.profiles
  SET academy_id=v_code.academy_id,updated_at=now()
  WHERE user_id=v_uid;

  RETURN jsonb_build_object('academy_id',v_code.academy_id,'academy_name',coalesce(v_academy_name,'Academy'));
END;
$function$;
REVOKE ALL ON FUNCTION public.connect_coach_to_academy_by_code(text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.connect_coach_to_academy_by_code(text) TO authenticated;


CREATE OR REPLACE FUNCTION public.set_connection_code(p_code text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_uid uuid := auth.uid();
  v_role text;
  v_academy uuid;
  v_normalized text := upper(btrim(coalesce(p_code,'')));
  v_existing_id uuid;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Authentication required'; END IF;
  IF NOT public.is_age_approved(v_uid) THEN
    RAISE EXCEPTION 'Account approval is required before creating connection codes';
  END IF;
  IF length(v_normalized) NOT BETWEEN 4 AND 30
     OR v_normalized !~ '^[A-Z0-9][A-Z0-9._-]*$' THEN
    RAISE EXCEPTION 'Connection codes must be 4-30 characters and use letters, numbers, dot, dash or underscore';
  END IF;

  SELECT p.role,p.academy_id INTO v_role,v_academy
  FROM public.profiles p WHERE p.user_id=v_uid;

  IF v_role='coach' THEN
    IF EXISTS (
      SELECT 1 FROM public.connection_codes cc
      WHERE cc.active=true AND lower(btrim(cc.code))=lower(v_normalized)
        AND cc.owner_user_id<>v_uid
    ) THEN RAISE EXCEPTION 'That coach code is already in use'; END IF;

    SELECT cc.id INTO v_existing_id FROM public.connection_codes cc
    WHERE cc.owner_user_id=v_uid AND cc.owner_type='coach' AND cc.active=true
    ORDER BY cc.created_at ASC LIMIT 1;

    IF v_existing_id IS NULL THEN
      INSERT INTO public.connection_codes(code,owner_user_id,owner_type,active)
      VALUES(v_normalized,v_uid,'coach',true);
    ELSE
      UPDATE public.connection_codes SET code=v_normalized,updated_at=now(),active=true
      WHERE id=v_existing_id;
    END IF;
    RETURN jsonb_build_object('code',v_normalized,'type','coach');
  END IF;

  IF v_role='academy_admin' THEN
    IF v_academy IS NULL OR NOT EXISTS (
      SELECT 1 FROM public.academies a
      WHERE a.id=v_academy
        AND (
          a.owner_user_id=v_uid
          OR EXISTS (
            SELECT 1 FROM public.academy_memberships am
            WHERE am.academy_id=a.id AND am.user_id=v_uid
              AND am.role='academy_admin' AND am.status='active'
          )
        )
    ) THEN RAISE EXCEPTION 'An active academy administrator role is required'; END IF;

    IF EXISTS (
      SELECT 1 FROM public.connection_codes cc
      WHERE cc.active=true AND lower(btrim(cc.code))=lower(v_normalized)
        AND cc.academy_id <> v_academy
    ) THEN RAISE EXCEPTION 'That academy code is already in use'; END IF;

    SELECT cc.id INTO v_existing_id FROM public.connection_codes cc
    WHERE cc.academy_id=v_academy AND cc.owner_type='academy' AND cc.active=true
    ORDER BY cc.created_at ASC LIMIT 1;

    IF v_existing_id IS NULL THEN
      INSERT INTO public.connection_codes(code,owner_user_id,owner_type,academy_id,active)
      VALUES(v_normalized,v_uid,'academy',v_academy,true);
    ELSE
      UPDATE public.connection_codes SET code=v_normalized,updated_at=now(),active=true
      WHERE id=v_existing_id;
    END IF;
    RETURN jsonb_build_object('code',v_normalized,'type','academy');
  END IF;

  RAISE EXCEPTION 'Only coaches and academy admins can create connection codes';
END;
$function$;
REVOKE ALL ON FUNCTION public.set_connection_code(text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.set_connection_code(text) TO authenticated;
