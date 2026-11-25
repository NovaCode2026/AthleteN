\set ON_ERROR_STOP on
BEGIN;

-- Configure a deterministic Student proof request and test private asset before
-- switching to the authenticated role.
INSERT INTO public.student_verifications(user_id,status,document_type,file_path)
VALUES ('00000000-0000-0000-0000-000000000006','pending','bonafide',
        '00000000-0000-0000-0000-000000000006/bonafide.pdf');
INSERT INTO storage.objects(bucket_id,name)
VALUES ('verification-proofs','00000000-0000-0000-0000-000000000006/bonafide.pdf');

-- Super Admin assigns scoped roles to existing administrator accounts.
SELECT set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000001',true);
SET LOCAL ROLE authenticated;
SELECT public.admin_assign_platform_role('00000000-0000-0000-0000-000000000002','verification');
SELECT public.admin_assign_platform_role('00000000-0000-0000-0000-000000000003','finance');
SELECT public.admin_assign_platform_role('00000000-0000-0000-0000-000000000004','operations');

DO $test$
DECLARE
  v_overview jsonb;
  v_audit_count integer;
BEGIN
  IF NOT private.platform_admin_has_permission('platform.roles.manage') THEN
    RAISE EXCEPTION 'Super Admin should have all platform permissions';
  END IF;
  v_overview := public.get_platform_admin_overview();
  IF (v_overview->>'users')::integer <> 6 THEN
    RAISE EXCEPTION 'Platform overview must count seeded users';
  END IF;
  SELECT count(*) INTO v_audit_count
  FROM public.get_platform_admin_audit(100);
  IF v_audit_count < 3 THEN RAISE EXCEPTION 'Permission-scope actions must be audited'; END IF;
END;
$test$;
RESET ROLE;

-- Verification Admin sees only the Student proof queue, can read its short-lived
-- proof object, but cannot browse unrelated profile rows or alter platform roles.
SELECT set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000002',true);
SET LOCAL ROLE authenticated;
DO $test$
DECLARE
  v_permissions jsonb;
  v_profiles integer;
  v_queue integer;
  v_assets integer;
  v_overview jsonb;
BEGIN
  v_permissions := public.get_my_platform_admin_permissions();
  IF NOT (v_permissions->'permissions' ? 'verification.review') THEN
    RAISE EXCEPTION 'Verification Admin is missing verification.review permission';
  END IF;

  SELECT count(*) INTO v_profiles FROM public.profiles;
  IF v_profiles <> 1 THEN RAISE EXCEPTION 'Scoped Verification Admin must not browse the full profile directory'; END IF;
  v_overview := public.get_platform_admin_overview();
  IF v_overview->'active_subscriptions' <> 'null'::jsonb
     OR v_overview->'users' <> 'null'::jsonb
     OR v_overview->'pending_student_verifications' = 'null'::jsonb THEN
    RAISE EXCEPTION 'Verification Admin overview leaked metrics outside its permission scope';
  END IF;

  SELECT count(*) INTO v_queue FROM public.search_athlete_verification_reviews('Test Athlete',20);
  IF v_queue <> 1 THEN RAISE EXCEPTION 'Verification Admin should find one matching Athlete account'; END IF;

  IF NOT private.platform_admin_has_permission('verification.athlete.manage') THEN
    RAISE EXCEPTION 'Verification Admin is missing Athlete verification management permission';
  END IF;

  SELECT count(*) INTO v_queue FROM public.get_student_verification_queue();
  IF v_queue <> 2 THEN RAISE EXCEPTION 'Verification Admin should see the two pending Student proofs'; END IF;

  SELECT count(*) INTO v_assets FROM storage.objects
  WHERE bucket_id='verification-proofs';
  IF v_assets <> 2 THEN RAISE EXCEPTION 'Verification Admin should read only proof bucket assets allowed by the review policy'; END IF;

  BEGIN
    PERFORM public.admin_set_user_role('00000000-0000-0000-0000-000000000006','super_admin');
    RAISE EXCEPTION 'Scoped Verification Admin unexpectedly changed a platform role';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM = 'Scoped Verification Admin unexpectedly changed a platform role' THEN RAISE; END IF;
  END;
END;
$test$;

SELECT public.admin_set_athlete_verified(
  '00000000-0000-0000-0000-000000000006',
  true,
  'Reviewed federation competition certificate and matching AthleteN profile details.'
);
DO $test$
DECLARE v_verified boolean; v_audit integer;
BEGIN
  SELECT verified_athlete INTO v_verified
  FROM public.search_athlete_verification_reviews('Test Athlete',20)
  WHERE user_id='00000000-0000-0000-0000-000000000006';
  IF v_verified IS DISTINCT FROM true THEN RAISE EXCEPTION 'Athlete verification was not granted'; END IF;
  SELECT count(*) INTO v_audit FROM public.get_platform_admin_audit(100)
  WHERE action='verification.athlete.verified';
  IF v_audit < 1 THEN RAISE EXCEPTION 'Athlete verification must be audited'; END IF;
END;
$test$;
SELECT public.admin_set_athlete_verified(
  '00000000-0000-0000-0000-000000000006',
  false,
  'Re-review found that the submitted federation document could not be independently confirmed.'
);

SELECT public.admin_review_student_verification(
  (SELECT id FROM public.student_verifications WHERE document_type='school_id'),
  'approved',
  'School document reviewed; name and current academic year are legible.'
);
DO $test$
DECLARE v_status text; v_notes text; v_audit integer; v_notifications integer;
BEGIN
  SELECT status,reviewer_notes INTO v_status,v_notes
  FROM public.student_verifications WHERE document_type='school_id';
  IF v_status <> 'approved' OR v_notes NOT LIKE 'School document reviewed%' THEN
    RAISE EXCEPTION 'Verification decision and reason were not persisted';
  END IF;
  SELECT count(*) INTO v_audit FROM public.get_platform_admin_audit(100)
  WHERE action='verification.student.approved';
  IF v_audit < 1 THEN RAISE EXCEPTION 'Student verification decision was not audited'; END IF;
  SELECT count(*) INTO v_notifications FROM public.notifications
  WHERE user_id='00000000-0000-0000-0000-000000000006'
    AND notification_type='verification';
  IF v_notifications < 1 THEN RAISE EXCEPTION 'Athlete was not notified of Student verification result'; END IF;
END;
$test$;
DO $test$
BEGIN
  BEGIN
    PERFORM public.admin_review_student_verification(
      (SELECT id FROM public.student_verifications WHERE document_type='bonafide'),
      'rejected',
      '  '
    );
    RAISE EXCEPTION 'Blank verification decision reason was accepted';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM = 'Blank verification decision reason was accepted' THEN RAISE; END IF;
  END;
END;
$test$;
RESET ROLE;

-- Finance Admin can view provider-controlled subscription state but cannot edit it.
SELECT set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000003',true);
SET LOCAL ROLE authenticated;
DO $test$
DECLARE v_rows integer; v_subscriptions integer; v_overview jsonb;
BEGIN
  v_overview := public.get_platform_admin_overview();
  IF v_overview->'active_subscriptions' = 'null'::jsonb
     OR v_overview->'pending_student_verifications' <> 'null'::jsonb
     OR v_overview->'users' <> 'null'::jsonb THEN
    RAISE EXCEPTION 'Finance Admin overview leaked metrics outside its permission scope';
  END IF;
  SELECT count(*) INTO v_subscriptions FROM public.subscriptions;
  IF v_subscriptions <> 1 THEN RAISE EXCEPTION 'Finance Admin should read the subscription ledger'; END IF;
  UPDATE public.subscriptions SET status='canceled'
  WHERE user_id='00000000-0000-0000-0000-000000000006';
  GET DIAGNOSTICS v_rows = ROW_COUNT;
  IF v_rows <> 0 THEN RAISE EXCEPTION 'Finance Admin must not mutate provider-settled subscription state'; END IF;
  BEGIN
    PERFORM public.search_platform_accounts('test',20);
    RAISE EXCEPTION 'Finance Admin unexpectedly gained account-management search';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM = 'Finance Admin unexpectedly gained account-management search' THEN RAISE; END IF;
  END;
END;
$test$;
RESET ROLE;

-- Operations Admin gets account controls, search and platform configuration,
-- but not unrestricted verification review or role assignment.
SELECT set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000004',true);
SET LOCAL ROLE authenticated;
DO $test$
DECLARE v_found integer;
BEGIN
  SELECT count(*) INTO v_found FROM public.search_platform_accounts('Test Athlete',20);
  IF v_found <> 1 THEN RAISE EXCEPTION 'Operations Admin account search should return the matched account only'; END IF;
  IF private.platform_admin_has_permission('verification.review') THEN
    RAISE EXCEPTION 'Operations Admin unexpectedly received verification permissions';
  END IF;
END;
$test$;
DO $test$
DECLARE v_rows integer; v_flag_events integer; v_announcement_events integer;
BEGIN
  UPDATE public.feature_flags SET enabled=true,updated_at=now()
  WHERE flag_key='coach_tools';
  GET DIAGNOSTICS v_rows = ROW_COUNT;
  IF v_rows <> 1 THEN RAISE EXCEPTION 'Operations Admin should toggle existing feature flags'; END IF;

  INSERT INTO public.announcements(title,body,audience,published_at,created_by)
  VALUES ('Platform test notice','Test announcement for the athlete audience.','athletes',now(),
          '00000000-0000-0000-0000-000000000004');

  SELECT count(*) INTO v_flag_events FROM public.get_platform_admin_audit(100)
  WHERE action='platform.feature_flag.updated';
  SELECT count(*) INTO v_announcement_events FROM public.get_platform_admin_audit(100)
  WHERE action='platform.announcement.published';
  IF v_flag_events < 1 THEN RAISE EXCEPTION 'Feature flag mutation must be audited'; END IF;
  IF v_announcement_events < 1 THEN RAISE EXCEPTION 'Announcement publication must be audited'; END IF;

  DELETE FROM public.announcements
  WHERE title='Platform test notice';
  GET DIAGNOSTICS v_rows = ROW_COUNT;
  IF v_rows <> 0 THEN RAISE EXCEPTION 'Operations Admin must not delete announcements'; END IF;
END;
$test$;
SELECT public.admin_set_platform_account_access(
  '00000000-0000-0000-0000-000000000006',
  'restricted',
  'Temporary access restriction while the reported account activity is reviewed.',
  now() + interval '1 day'
);
DO $test$
DECLARE v_audit integer;
BEGIN
  SELECT count(*) INTO v_audit FROM public.get_platform_admin_audit(100)
  WHERE action='account.access.restricted';
  IF v_audit < 1 THEN RAISE EXCEPTION 'Account restriction must be audited'; END IF;
END;
$test$;
RESET ROLE;

-- Restricted Athlete retains profile and support access but loses core training
-- data. Restoring the account re-opens the normal owner RLS path.
SELECT set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000006',true);
SET LOCAL ROLE authenticated;
DO $test$
DECLARE v_profiles integer; v_training integer; v_support integer; v_access jsonb;
BEGIN
  v_access := public.get_my_platform_account_access();
  IF v_access->>'status' <> 'restricted' THEN RAISE EXCEPTION 'Athlete restriction status is not visible to the account owner'; END IF;
  SELECT count(*) INTO v_profiles FROM public.profiles;
  SELECT count(*) INTO v_training FROM public.training_sessions;
  SELECT count(*) INTO v_support FROM public.support_tickets;
  IF v_profiles <> 1 THEN RAISE EXCEPTION 'Restricted Athlete must retain access to own profile'; END IF;
  IF v_training <> 0 THEN RAISE EXCEPTION 'Restricted Athlete must not access core training data'; END IF;
  IF v_support <> 1 THEN RAISE EXCEPTION 'Restricted Athlete must retain own support-ticket access'; END IF;
END;
$test$;
RESET ROLE;

SELECT set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000004',true);
SET LOCAL ROLE authenticated;
SELECT public.admin_set_platform_account_access(
  '00000000-0000-0000-0000-000000000006',
  'active',
  'Account review completed; restore normal application access.',
  NULL
);
RESET ROLE;

SELECT set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000006',true);
SET LOCAL ROLE authenticated;
DO $test$
DECLARE v_training integer;
BEGIN
  SELECT count(*) INTO v_training FROM public.training_sessions;
  IF v_training <> 1 THEN RAISE EXCEPTION 'Restored Athlete should regain own training data'; END IF;
END;
$test$;
RESET ROLE;

-- Existing Support Admin is seeded into the Support scope by the migration.
SELECT set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000005',true);
SET LOCAL ROLE authenticated;
DO $test$
DECLARE v_tickets integer; v_subscriptions integer; v_permissions jsonb; v_overview jsonb;
BEGIN
  v_permissions := public.get_my_platform_admin_permissions();
  v_overview := public.get_platform_admin_overview();
  IF v_overview->'open_support_tickets' = 'null'::jsonb
     OR v_overview->'active_subscriptions' <> 'null'::jsonb THEN
    RAISE EXCEPTION 'Support Admin overview leaked metrics outside its permission scope';
  END IF;
  IF NOT (v_permissions->'permissions' ? 'support.manage') THEN
    RAISE EXCEPTION 'Existing Support Admin was not seeded into Support scope';
  END IF;
  SELECT count(*) INTO v_tickets FROM public.support_tickets;
  SELECT count(*) INTO v_subscriptions FROM public.subscriptions;
  IF v_tickets < 1 THEN RAISE EXCEPTION 'Support Admin should see support tickets'; END IF;
  IF v_subscriptions <> 0 THEN RAISE EXCEPTION 'Support Admin must not see billing data'; END IF;
END;
$test$;

ROLLBACK;
