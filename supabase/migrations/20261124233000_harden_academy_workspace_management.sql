-- Harden Coach and Academy management.
-- Candidate migration only: reconcile migration history and replay in staging before production.

CREATE OR REPLACE FUNCTION private.user_is_approved_academy_admin(p_academy_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $function$
  SELECT EXISTS (
    SELECT 1
    FROM public.profiles p
    WHERE p.user_id = (SELECT auth.uid())
      AND p.role IN ('academy_admin', 'academy')
      AND (
        EXISTS (
          SELECT 1 FROM public.academies a
          WHERE a.id = p_academy_id AND a.owner_user_id = (SELECT auth.uid())
        )
        OR EXISTS (
          SELECT 1 FROM public.academy_memberships m
          WHERE m.academy_id = p_academy_id
            AND m.user_id = (SELECT auth.uid())
            AND m.role = 'academy_admin'
            AND m.status = 'active'
        )
      )
  );
$function$;

REVOKE ALL ON FUNCTION private.user_is_approved_academy_admin(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION private.user_is_approved_academy_admin(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION private.user_is_academy_admin(p_academy_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $function$
  SELECT private.user_is_approved_academy_admin(p_academy_id);
$function$;

REVOKE ALL ON FUNCTION private.user_is_academy_admin(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION private.user_is_academy_admin(uuid) TO authenticated;

-- Setup is an atomic server operation for an already-approved Academy Admin.
-- Contact verification and subscription checks remain separate release gates.
CREATE OR REPLACE FUNCTION public.create_academy_workspace(
  p_name text,
  p_city text DEFAULT NULL,
  p_state text DEFAULT NULL,
  p_country text DEFAULT 'India'
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_user_id uuid := (SELECT auth.uid());
  v_role text;
  v_academy_id uuid;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;

  SELECT p.role INTO v_role
  FROM public.profiles p
  WHERE p.user_id = v_user_id
  FOR UPDATE;

  IF v_role IS DISTINCT FROM 'academy_admin' AND v_role IS DISTINCT FROM 'academy' THEN
    RAISE EXCEPTION 'Approved Academy Admin role required';
  END IF;

  IF p_name IS NULL OR length(btrim(p_name)) NOT BETWEEN 2 AND 100 THEN
    RAISE EXCEPTION 'Academy name must contain between 2 and 100 characters';
  END IF;
  IF length(coalesce(p_city, '')) > 120
     OR length(coalesce(p_state, '')) > 120
     OR length(coalesce(p_country, '')) > 120 THEN
    RAISE EXCEPTION 'Academy location fields are too long';
  END IF;

  INSERT INTO public.academies (
    owner_user_id, name, city, state, country, status, setup_completed
  )
  VALUES (
    v_user_id,
    btrim(p_name),
    nullif(btrim(coalesce(p_city, '')), ''),
    nullif(btrim(coalesce(p_state, '')), ''),
    nullif(btrim(coalesce(p_country, '')), ''),
    'active',
    false
  )
  RETURNING id INTO v_academy_id;

  INSERT INTO public.academy_memberships (academy_id, user_id, role, status)
  VALUES (v_academy_id, v_user_id, 'academy_admin', 'active')
  ON CONFLICT (academy_id, user_id) DO NOTHING;

  INSERT INTO public.academy_coach_seats (
    academy_id, coach_user_id, seat_type, activation_fee, monthly_fee, status
  )
  VALUES (v_academy_id, v_user_id, 'included', 0, 0, 'active')
  ON CONFLICT (academy_id, coach_user_id) DO NOTHING;

  UPDATE public.profiles
  SET academy_id = v_academy_id, updated_at = now()
  WHERE user_id = v_user_id;

  RETURN v_academy_id;
END;
$function$;

REVOKE ALL ON FUNCTION public.create_academy_workspace(text, text, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_academy_workspace(text, text, text, text) TO authenticated;


-- Bind Academy verification to Supabase Auth's actual confirmation timestamp.
-- No client-supplied email or timestamp is accepted by this RPC.
CREATE OR REPLACE FUNCTION public.sync_verified_academy_contact_email(
  p_academy_id uuid
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_user_id uuid := (SELECT auth.uid());
  v_email text;
  v_confirmed_at timestamptz;
  v_updated integer;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;
  IF NOT private.user_is_approved_academy_admin(p_academy_id) THEN
    RAISE EXCEPTION 'Approved Academy Admin access required';
  END IF;

  SELECT lower(btrim(u.email)), u.email_confirmed_at
    INTO v_email, v_confirmed_at
  FROM auth.users u
  WHERE u.id = v_user_id;

  IF v_email IS NULL OR position('@' IN v_email) < 2 OR v_confirmed_at IS NULL THEN
    RAISE EXCEPTION 'Academy contact email must be verified in Auth';
  END IF;

  UPDATE public.academies
     SET contact_email = v_email,
         contact_email_verified_at = v_confirmed_at,
         updated_at = now()
   WHERE id = p_academy_id;
  GET DIAGNOSTICS v_updated = ROW_COUNT;
  IF v_updated <> 1 THEN
    RAISE EXCEPTION 'Academy workspace was not found';
  END IF;
  RETURN true;
END;
$function$;

REVOKE ALL ON FUNCTION public.sync_verified_academy_contact_email(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.sync_verified_academy_contact_email(uuid) TO authenticated;

-- Complete setup only from a confirmed Auth email. Verification and completion
-- timestamps are produced by the database; clients cannot assert either state.
CREATE OR REPLACE FUNCTION public.complete_academy_setup(
  p_academy_id uuid,
  p_name text,
  p_city text,
  p_state text,
  p_country text,
  p_contact_phone text
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_user_id uuid := (SELECT auth.uid());
  v_email text;
  v_confirmed_at timestamptz;
  v_updated integer;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;
  IF NOT private.user_is_approved_academy_admin(p_academy_id) THEN
    RAISE EXCEPTION 'Approved Academy Admin access required';
  END IF;

  SELECT lower(btrim(u.email)), u.email_confirmed_at
    INTO v_email, v_confirmed_at
  FROM auth.users u
  WHERE u.id = v_user_id;

  IF v_email IS NULL OR position('@' IN v_email) < 2 OR v_confirmed_at IS NULL THEN
    RAISE EXCEPTION 'Academy contact email must be verified in Auth';
  END IF;
  IF p_name IS NULL OR length(btrim(p_name)) NOT BETWEEN 2 AND 100 THEN
    RAISE EXCEPTION 'Academy name must contain between 2 and 100 characters';
  END IF;
  IF p_city IS NULL OR length(btrim(p_city)) NOT BETWEEN 1 AND 120
     OR p_state IS NULL OR length(btrim(p_state)) NOT BETWEEN 1 AND 120
     OR p_country IS NULL OR length(btrim(p_country)) NOT BETWEEN 1 AND 120 THEN
    RAISE EXCEPTION 'Academy city, state and country are required';
  END IF;
  IF length(regexp_replace(coalesce(p_contact_phone, ''), '[^0-9]', '', 'g')) < 10
     OR length(p_contact_phone) > 40 THEN
    RAISE EXCEPTION 'A valid Academy contact phone is required';
  END IF;

  UPDATE public.academies
     SET name = btrim(p_name),
         city = btrim(p_city),
         state = btrim(p_state),
         country = btrim(p_country),
         contact_email = v_email,
         contact_phone = btrim(p_contact_phone),
         contact_email_verified_at = v_confirmed_at,
         setup_completed = true,
         setup_completed_at = now(),
         updated_at = now()
   WHERE id = p_academy_id;
  GET DIAGNOSTICS v_updated = ROW_COUNT;
  IF v_updated <> 1 THEN
    RAISE EXCEPTION 'Academy workspace was not found';
  END IF;
  RETURN true;
END;
$function$;

REVOKE ALL ON FUNCTION public.complete_academy_setup(uuid, text, text, text, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.complete_academy_setup(uuid, text, text, text, text, text) TO authenticated;

-- Keep the legacy RPC for older clients, with its original subscription gate.
CREATE OR REPLACE FUNCTION public.create_academy(
  p_name text,
  p_city text DEFAULT NULL,
  p_state text DEFAULT NULL,
  p_country text DEFAULT 'India'
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.subscriptions s
    WHERE s.user_id = (SELECT auth.uid())
      AND s.plan_id = 'academy'
      AND s.status IN ('active', 'trialing')
  ) THEN
    RAISE EXCEPTION 'An active Academy plan is required';
  END IF;

  RETURN public.create_academy_workspace(p_name, p_city, p_state, p_country);
END;
$function$;

REVOKE ALL ON FUNCTION public.create_academy(text, text, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_academy(text, text, text, text) TO authenticated;

-- Prevent direct Academy creation and ownership transfer from client sessions.
DROP POLICY IF EXISTS "academies owner read" ON public.academies;
DROP POLICY IF EXISTS "academies owner insert" ON public.academies;
DROP POLICY IF EXISTS "academies owner update" ON public.academies;

CREATE POLICY "academies owner read"
  ON public.academies FOR SELECT TO authenticated
  USING (private.user_is_approved_academy_admin(id) OR public.is_platform_admin());

CREATE POLICY "academies owner update"
  ON public.academies FOR UPDATE TO authenticated
  USING (private.user_is_approved_academy_admin(id) OR public.is_platform_admin())
  WITH CHECK (private.user_is_approved_academy_admin(id) OR public.is_platform_admin());

REVOKE INSERT ON public.academies FROM PUBLIC, anon, authenticated;
REVOKE UPDATE ON public.academies FROM PUBLIC, anon, authenticated;
REVOKE DELETE ON public.academies FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.academies TO authenticated;
-- Clients may edit descriptive workspace fields only. Verified contact and
-- setup-completion state are written exclusively by the Auth-backed RPCs below.
GRANT UPDATE (
  name, city, state, country, contact_phone
) ON public.academies TO authenticated;

-- Memberships are created only by SECURITY DEFINER code-redemption/bootstrap
-- RPCs. Admin clients may suspend/activate members but cannot add or promote them.
DROP POLICY IF EXISTS "academy memberships participant read" ON public.academy_memberships;
DROP POLICY IF EXISTS "academy memberships admin write" ON public.academy_memberships;
DROP POLICY IF EXISTS "Academy admins can create memberships" ON public.academy_memberships;
DROP POLICY IF EXISTS "Academy owners can bootstrap admin membership" ON public.academy_memberships;
DROP POLICY IF EXISTS "Academy owners can bootstrap own admin membership" ON public.academy_memberships;
DROP POLICY IF EXISTS "academy memberships admin update" ON public.academy_memberships;
DROP POLICY IF EXISTS "academy memberships admin delete" ON public.academy_memberships;

CREATE POLICY "academy memberships participant read"
  ON public.academy_memberships FOR SELECT TO authenticated
  USING (
    user_id = (SELECT auth.uid())
    OR private.user_is_approved_academy_admin(academy_id)
    OR public.is_platform_admin()
  );

CREATE POLICY "academy memberships admin update"
  ON public.academy_memberships FOR UPDATE TO authenticated
  USING (private.user_is_approved_academy_admin(academy_id) OR public.is_platform_admin())
  WITH CHECK (private.user_is_approved_academy_admin(academy_id) OR public.is_platform_admin());

CREATE POLICY "academy memberships admin delete"
  ON public.academy_memberships FOR DELETE TO authenticated
  USING (private.user_is_approved_academy_admin(academy_id) OR public.is_platform_admin());

REVOKE INSERT ON public.academy_memberships FROM PUBLIC, anon, authenticated;
REVOKE UPDATE ON public.academy_memberships FROM PUBLIC, anon, authenticated;
REVOKE DELETE ON public.academy_memberships FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.academy_memberships TO authenticated;
GRANT UPDATE (status, updated_at) ON public.academy_memberships TO authenticated;
