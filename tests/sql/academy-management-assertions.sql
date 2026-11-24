\set ON_ERROR_STOP on

DO $privileges$
BEGIN
  IF has_table_privilege('authenticated', 'public.academies', 'INSERT') THEN
    RAISE EXCEPTION 'Authenticated role can directly insert an Academy';
  END IF;
  IF has_table_privilege('authenticated', 'public.academy_memberships', 'INSERT') THEN
    RAISE EXCEPTION 'Authenticated role can directly insert an Academy membership';
  END IF;
  IF has_table_privilege('authenticated', 'public.academies', 'DELETE') THEN
    RAISE EXCEPTION 'Authenticated role can directly delete an Academy workspace';
  END IF;
  IF has_table_privilege('authenticated', 'public.academy_memberships', 'DELETE') THEN
    RAISE EXCEPTION 'Authenticated role can erase Academy membership history';
  END IF;
  IF has_column_privilege('authenticated', 'public.academies', 'owner_user_id', 'UPDATE') THEN
    RAISE EXCEPTION 'Authenticated role can transfer Academy ownership';
  END IF;
  IF has_column_privilege('authenticated', 'public.academy_memberships', 'role', 'UPDATE') THEN
    RAISE EXCEPTION 'Authenticated role can promote Academy membership roles';
  END IF;
  IF has_column_privilege('authenticated', 'public.academies', 'contact_email', 'UPDATE')
     OR has_column_privilege('authenticated', 'public.academies', 'contact_email_verified_at', 'UPDATE')
     OR has_column_privilege('authenticated', 'public.academies', 'setup_completed', 'UPDATE')
     OR has_column_privilege('authenticated', 'public.academies', 'setup_completed_at', 'UPDATE') THEN
    RAISE EXCEPTION 'Authenticated role can forge Academy verification or setup completion';
  END IF;
END
$privileges$;

SET ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000011', false);
DO $denied$
DECLARE blocked boolean := false;
BEGIN
  BEGIN
    PERFORM public.create_academy_workspace('Not allowed');
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM = 'Approved Academy Admin role required' THEN blocked := true; ELSE RAISE; END IF;
  END;
  IF NOT blocked THEN RAISE EXCEPTION 'Athlete created an Academy workspace'; END IF;
END
$denied$;

SELECT set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000012', false);
DO $denied$
DECLARE blocked boolean := false;
BEGIN
  BEGIN
    PERFORM public.create_academy_workspace('Not allowed');
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM = 'Approved Academy Admin role required' THEN blocked := true; ELSE RAISE; END IF;
  END;
  IF NOT blocked THEN RAISE EXCEPTION 'Coach created an Academy workspace without approval'; END IF;
END
$denied$;

SELECT set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000013', false);
DO $create$
DECLARE
  v_academy_id uuid;
  v_member_count integer;
  v_seat_count integer;
  v_linked_academy uuid;
BEGIN
  v_academy_id := public.create_academy_workspace('Approved Academy', 'Noida', 'Uttar Pradesh', 'India');

  IF NOT EXISTS (
    SELECT 1 FROM public.academies
    WHERE id = v_academy_id
      AND owner_user_id = auth.uid()
      AND name = 'Approved Academy'
      AND setup_completed = false
  ) THEN
    RAISE EXCEPTION 'Academy row missing owner or expected setup state';
  END IF;

  SELECT count(*) INTO v_member_count
  FROM public.academy_memberships
  WHERE academy_id = v_academy_id
    AND user_id = auth.uid()
    AND role = 'academy_admin'
    AND status = 'active';
  IF v_member_count <> 1 THEN RAISE EXCEPTION 'Owner admin membership was not created atomically'; END IF;

  SELECT count(*) INTO v_seat_count
  FROM public.academy_coach_seats
  WHERE academy_id = v_academy_id
    AND coach_user_id = auth.uid()
    AND seat_type = 'included'
    AND status = 'active';
  IF v_seat_count <> 1 THEN RAISE EXCEPTION 'Included owner Coach seat was not created atomically'; END IF;

  SELECT p.academy_id INTO v_linked_academy
  FROM public.profiles p WHERE p.user_id = auth.uid();
  IF v_linked_academy IS DISTINCT FROM v_academy_id THEN
    RAISE EXCEPTION 'Owner profile was not linked to the new Academy';
  END IF;

  IF NOT public.sync_verified_academy_contact_email(v_academy_id) THEN
    RAISE EXCEPTION 'Verified contact email synchronization did not return success';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.academies a
    JOIN auth.users u ON u.id = auth.uid()
    WHERE a.id = v_academy_id
      AND a.contact_email = lower(u.email)
      AND a.contact_email_verified_at = u.email_confirmed_at
      AND a.contact_email_verified_at = '2026-11-01T00:00:00Z'::timestamptz
  ) THEN
    RAISE EXCEPTION 'Contact verification did not use the exact Auth confirmation timestamp';
  END IF;

  IF NOT public.complete_academy_setup(
    v_academy_id, 'Verified Academy', 'Noida', 'Uttar Pradesh', 'India', '+91 9876543210'
  ) THEN
    RAISE EXCEPTION 'Server-verified Academy setup did not return success';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.academies
    WHERE id = v_academy_id
      AND setup_completed = true
      AND setup_completed_at IS NOT NULL
      AND contact_email_verified_at = '2026-11-01T00:00:00Z'::timestamptz
      AND name = 'Verified Academy'
      AND contact_phone = '+91 9876543210'
  ) THEN
    RAISE EXCEPTION 'Academy setup was not completed with server-owned verification state';
  END IF;
END
$create$;


-- An Academy Admin without a confirmed Auth email may create a workspace,
-- but cannot mark the contact verified or complete setup.
SELECT set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000014', false);
DO $unverified$
DECLARE
  v_academy_id uuid;
  v_sync_blocked boolean := false;
  v_setup_blocked boolean := false;
BEGIN
  v_academy_id := public.create_academy_workspace('Pending Verification Academy', 'Noida', 'Uttar Pradesh', 'India');
  BEGIN
    PERFORM public.sync_verified_academy_contact_email(v_academy_id);
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM = 'Academy contact email must be verified in Auth' THEN v_sync_blocked := true; ELSE RAISE; END IF;
  END;
  IF NOT v_sync_blocked THEN RAISE EXCEPTION 'Unverified Auth email was synchronized as verified'; END IF;

  BEGIN
    PERFORM public.complete_academy_setup(
      v_academy_id, 'Pending Verification Academy', 'Noida', 'Uttar Pradesh', 'India', '+91 9876543210'
    );
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM = 'Academy contact email must be verified in Auth' THEN v_setup_blocked := true; ELSE RAISE; END IF;
  END;
  IF NOT v_setup_blocked THEN RAISE EXCEPTION 'Unverified Auth email completed Academy setup'; END IF;
  IF EXISTS (SELECT 1 FROM public.academies WHERE id = v_academy_id AND setup_completed) THEN
    RAISE EXCEPTION 'Unverified Academy workspace was marked complete';
  END IF;
END
$unverified$;

DO $legacy$
DECLARE blocked boolean := false;
BEGIN
  BEGIN
    PERFORM public.create_academy('Legacy Academy', NULL, NULL, 'India');
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM = 'An active Academy plan is required' THEN blocked := true; ELSE RAISE; END IF;
  END;
  IF NOT blocked THEN RAISE EXCEPTION 'Legacy Academy RPC bypassed its subscription gate'; END IF;
END
$legacy$;

DO $direct$
DECLARE blocked boolean := false;
BEGIN
  BEGIN
    INSERT INTO public.academy_memberships(academy_id, user_id, role, status)
    SELECT id, '00000000-0000-0000-0000-000000000011', 'athlete', 'active'
    FROM public.academies WHERE name = 'Approved Academy';
  EXCEPTION WHEN insufficient_privilege THEN blocked := true;
  END;
  IF NOT blocked THEN RAISE EXCEPTION 'Academy Admin directly inserted a membership'; END IF;

  blocked := false;
  BEGIN
    UPDATE public.academies
       SET contact_email_verified_at = now(), setup_completed = true
     WHERE name = 'Verified Academy';
  EXCEPTION WHEN insufficient_privilege THEN blocked := true;
  END;
  IF NOT blocked THEN RAISE EXCEPTION 'Academy Admin directly forged verified or completed state'; END IF;
END
$direct$;
RESET ROLE;

-- Simulate athlete/coach code-redemption RPCs inserting the selected memberships.
INSERT INTO public.academy_memberships(academy_id, user_id, role, status)
SELECT id, '00000000-0000-0000-0000-000000000011', 'athlete', 'active'
FROM public.academies WHERE name = 'Verified Academy';
INSERT INTO public.academy_memberships(academy_id, user_id, role, status)
SELECT id, '00000000-0000-0000-0000-000000000015', 'coach', 'active'
FROM public.academies WHERE name = 'Verified Academy';

SET ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000013', false);
DO $admin$
DECLARE changed integer;
BEGIN
  UPDATE public.academy_memberships
     SET status = 'suspended', updated_at = now()
   WHERE academy_id = (SELECT id FROM public.academies WHERE name = 'Approved Academy')
     AND user_id = '00000000-0000-0000-0000-000000000011';
  GET DIAGNOSTICS changed = ROW_COUNT;
  IF changed <> 1 THEN RAISE EXCEPTION 'Approved Academy Admin could not update member status'; END IF;

  UPDATE public.academies
     SET name = 'Approved Academy Updated'
   WHERE id = (SELECT id FROM public.academies WHERE name = 'Verified Academy');
  GET DIAGNOSTICS changed = ROW_COUNT;
  IF changed <> 1 THEN RAISE EXCEPTION 'Approved Academy Admin could not update Academy profile'; END IF;
END
$admin$;

SELECT set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000015', false);
DO $coach$
DECLARE changed integer;
        visible_count integer;
        v_academy_id uuid;
BEGIN
  SELECT academy_id INTO v_academy_id
  FROM public.academy_memberships
  WHERE user_id = auth.uid() AND role = 'coach';

  UPDATE public.academy_memberships
     SET status = 'active', updated_at = now()
   WHERE academy_id = v_academy_id
     AND user_id = '00000000-0000-0000-0000-000000000011';
  GET DIAGNOSTICS changed = ROW_COUNT;
  IF changed <> 0 THEN RAISE EXCEPTION 'Ordinary Coach changed an Academy membership'; END IF;

  SELECT count(*) INTO visible_count FROM public.academies
   WHERE name = 'Approved Academy Updated';
  IF visible_count <> 0 THEN RAISE EXCEPTION 'Ordinary Coach can read Academy admin workspace details'; END IF;
END
$coach$;
RESET ROLE;

UPDATE public.profiles SET role = 'coach'
WHERE user_id = '00000000-0000-0000-0000-000000000013';

SET ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000013', false);
DO $downgraded$
DECLARE changed integer;
        v_academy_id uuid;
BEGIN
  -- The user's own membership remains readable, but it cannot preserve admin rights
  -- after the platform role is changed to Coach.
  SELECT academy_id INTO v_academy_id
  FROM public.academy_memberships
  WHERE user_id = auth.uid() AND role = 'academy_admin';

  UPDATE public.academy_memberships
     SET status = 'active', updated_at = now()
   WHERE academy_id = v_academy_id
     AND user_id = '00000000-0000-0000-0000-000000000011';
  GET DIAGNOSTICS changed = ROW_COUNT;
  IF changed <> 0 THEN RAISE EXCEPTION 'Downgraded Academy owner retained admin permissions'; END IF;
END
$downgraded$;
RESET ROLE;
