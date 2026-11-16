-- Preserve every issued Coach and Academy connection code permanently.
-- A code may be rotated, but its previous row is retired, never overwritten.
-- The global unique index on lower(btrim(code)) remains the final race-safe
-- guard against reusing a value that has ever been issued.

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
  v_normalized text := upper(btrim(coalesce(p_code, '')));
  v_existing_id uuid;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;

  IF NOT public.is_age_approved(v_uid) THEN
    RAISE EXCEPTION 'Account approval is required before creating connection codes';
  END IF;

  IF length(v_normalized) NOT BETWEEN 4 AND 30
     OR v_normalized !~ '^[A-Z0-9][A-Z0-9._-]*$' THEN
    RAISE EXCEPTION 'Connection codes must be 4-30 characters and use letters, numbers, dot, dash or underscore';
  END IF;

  -- Serialize code changes for this account.
  SELECT p.role, p.academy_id
    INTO v_role, v_academy
  FROM public.profiles p
  WHERE p.user_id = v_uid
  FOR UPDATE;

  IF v_role = 'coach' THEN
    -- If this exact code was previously issued by this Coach, it may be
    -- reactivated only for the same issuer. Never rewrite its code value.
    SELECT cc.id
      INTO v_existing_id
    FROM public.connection_codes cc
    WHERE cc.owner_user_id = v_uid
      AND cc.owner_type = 'coach'
      AND lower(btrim(cc.code)) = lower(v_normalized)
    ORDER BY cc.created_at DESC
    LIMIT 1
    FOR UPDATE;

    IF v_existing_id IS NULL AND EXISTS (
      SELECT 1
      FROM public.connection_codes cc
      WHERE lower(btrim(cc.code)) = lower(v_normalized)
    ) THEN
      RAISE EXCEPTION 'That code is already permanently reserved. Choose a different Coach code';
    END IF;

    -- A Coach can have one active Coach code; previous values stay stored.
    UPDATE public.connection_codes cc
    SET active = false, updated_at = now()
    WHERE cc.owner_user_id = v_uid
      AND cc.owner_type = 'academy'
      AND cc.active = true;

    UPDATE public.connection_codes cc
    SET active = false, updated_at = now()
    WHERE cc.owner_user_id = v_uid
      AND cc.owner_type = 'coach'
      AND cc.active = true
      AND cc.id IS DISTINCT FROM v_existing_id;

    IF v_existing_id IS NULL THEN
      INSERT INTO public.connection_codes(
        code, owner_user_id, owner_type, academy_id, active
      )
      VALUES (v_normalized, v_uid, 'coach', v_academy, true);
    ELSE
      UPDATE public.connection_codes
      SET academy_id = v_academy, active = true, updated_at = now()
      WHERE id = v_existing_id;
    END IF;

    RETURN jsonb_build_object('code', v_normalized, 'type', 'coach');
  END IF;

  IF v_role = 'academy_admin' THEN
    IF v_academy IS NULL THEN
      RAISE EXCEPTION 'An active academy administrator role is required';
    END IF;

    -- Serialize Academy code changes across all its administrators.
    PERFORM 1
    FROM public.academies a
    WHERE a.id = v_academy
      AND (
        a.owner_user_id = v_uid
        OR EXISTS (
          SELECT 1
          FROM public.academy_memberships am
          WHERE am.academy_id = a.id
            AND am.user_id = v_uid
            AND am.role = 'academy_admin'
            AND am.status = 'active'
        )
      )
    FOR UPDATE;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'An active academy administrator role is required';
    END IF;

    -- A previously issued value can only be reactivated by its original
    -- issuer for the same Academy. It is never transferred to another user.
    SELECT cc.id
      INTO v_existing_id
    FROM public.connection_codes cc
    WHERE cc.owner_user_id = v_uid
      AND cc.owner_type = 'academy'
      AND cc.academy_id = v_academy
      AND lower(btrim(cc.code)) = lower(v_normalized)
    ORDER BY cc.created_at DESC
    LIMIT 1
    FOR UPDATE;

    IF v_existing_id IS NULL AND EXISTS (
      SELECT 1
      FROM public.connection_codes cc
      WHERE lower(btrim(cc.code)) = lower(v_normalized)
    ) THEN
      RAISE EXCEPTION 'That code is already permanently reserved. Choose a different Academy code';
    END IF;

    UPDATE public.connection_codes cc
    SET active = false, updated_at = now()
    WHERE cc.owner_user_id = v_uid
      AND cc.owner_type = 'coach'
      AND cc.active = true;

    -- Keep only the newly selected Academy code active. Prior rows and code
    -- values remain in place and reserved forever.
    UPDATE public.connection_codes cc
    SET active = false, updated_at = now()
    WHERE cc.academy_id = v_academy
      AND cc.owner_type = 'academy'
      AND cc.active = true
      AND cc.id IS DISTINCT FROM v_existing_id;

    IF v_existing_id IS NULL THEN
      INSERT INTO public.connection_codes(
        code, owner_user_id, owner_type, academy_id, active
      )
      VALUES (v_normalized, v_uid, 'academy', v_academy, true);
    ELSE
      UPDATE public.connection_codes
      SET active = true, updated_at = now()
      WHERE id = v_existing_id;
    END IF;

    RETURN jsonb_build_object('code', v_normalized, 'type', 'academy');
  END IF;

  RAISE EXCEPTION 'Only Coach and Academy Admin accounts can create connection codes';
END;
$function$;

REVOKE ALL ON FUNCTION public.set_connection_code(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.set_connection_code(text) TO authenticated;
