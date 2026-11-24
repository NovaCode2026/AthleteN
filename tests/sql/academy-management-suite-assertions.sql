\set ON_ERROR_STOP on

DO $privileges$
BEGIN
  IF has_table_privilege('authenticated','public.academy_fee_invoices','INSERT')
     OR has_table_privilege('authenticated','public.academy_fee_payments','INSERT') THEN
    RAISE EXCEPTION 'Authenticated clients can directly write Academy fee data';
  END IF;
  IF has_table_privilege('authenticated','public.academy_athlete_transfer_requests','INSERT')
     OR has_table_privilege('authenticated','public.academy_guardian_links','UPDATE')
     OR has_table_privilege('authenticated','public.academy_staff_assignments','INSERT')
     OR has_table_privilege('authenticated','public.academy_audit_log','INSERT')
     OR has_table_privilege('authenticated','public.academy_audit_log','UPDATE')
     OR has_table_privilege('authenticated','public.academy_audit_log','DELETE') THEN
    RAISE EXCEPTION 'A protected Academy workflow table has an unsafe direct client grant';
  END IF;
  IF NOT has_table_privilege('authenticated','public.academy_coach_attendance','INSERT')
     OR NOT has_table_privilege('authenticated','public.academy_coach_availability','INSERT') THEN
    RAISE EXCEPTION 'Coach self-service writes were not granted';
  END IF;
END
$privileges$;

-- Academy Admin can issue an invoice, record a partial payment and cannot
-- over-record the remaining balance. The trigger also writes a notification and audit row.
SET ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000013',false);
DO $fees$
DECLARE v_invoice uuid; v_status text; blocked boolean:=false;
BEGIN
  v_invoice:=public.academy_create_fee_invoice(
    '10000000-0000-0000-0000-000000000001',
    '00000000-0000-0000-0000-000000000011',
    'Monthly training fee',500,current_date+7,'November training'
  );
  PERFORM public.academy_record_fee_payment(v_invoice,200,'upi_manual','TEST-UPI-001');
  SELECT status INTO v_status FROM public.academy_fee_invoices WHERE id=v_invoice;
  IF v_status<>'part_paid' THEN RAISE EXCEPTION 'Partial payment did not update invoice status'; END IF;
  BEGIN
    PERFORM public.academy_record_fee_payment(v_invoice,301,'cash',NULL);
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM='Payment exceeds invoice balance' THEN blocked:=true; ELSE RAISE; END IF;
  END;
  IF NOT blocked THEN RAISE EXCEPTION 'Fee payment overcollection was not blocked'; END IF;
END
$fees$;

-- Assign a limited finance capability to an active Coach; it must not turn the
-- Coach into an Academy Admin.
DO $staff$
BEGIN
  PERFORM public.academy_set_staff_assignment(
    '10000000-0000-0000-0000-000000000001',
    '00000000-0000-0000-0000-000000000012',
    'finance',ARRAY['fees.manage']::text[]
  );
  IF NOT private.user_has_academy_permission(
    '10000000-0000-0000-0000-000000000001','fees.manage'
  ) THEN RAISE EXCEPTION 'Assigned finance permission is not effective'; END IF;
  IF (SELECT role FROM public.profiles WHERE user_id='00000000-0000-0000-0000-000000000012')<>'coach' THEN
    RAISE EXCEPTION 'Staff capability assignment promoted the Coach account role';
  END IF;
END
$staff$;

-- Coach self-service operations are constrained to the Coach's own active Academy membership.
SELECT set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000012',false);
DO $coach_ops$
BEGIN
  INSERT INTO public.academy_coach_attendance(academy_id,coach_user_id,attendance_date,status,recorded_by)
  VALUES('10000000-0000-0000-0000-000000000001',auth.uid(),current_date,'present',auth.uid());
  INSERT INTO public.academy_coach_availability(academy_id,coach_user_id,weekday,starts_at,ends_at,availability_type)
  VALUES('10000000-0000-0000-0000-000000000001',auth.uid(),1,'16:00','19:00','available');
END
$coach_ops$;

-- A transfer cannot skip either Coach review or Academy approval.
SELECT set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000011',false);
DO $transfer_start$
DECLARE v_request uuid;
BEGIN
  v_request:=public.academy_request_athlete_transfer(
    '10000000-0000-0000-0000-000000000001',
    '00000000-0000-0000-0000-000000000015',
    'Schedule change'
  );
  PERFORM set_config('test.transfer_request',v_request::text,false);
END
$transfer_start$;

SELECT set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000012',false);
DO $transfer_release$
BEGIN
  PERFORM public.academy_review_athlete_transfer(
    current_setting('test.transfer_request')::uuid,'release'
  );
END
$transfer_release$;

SELECT set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000015',false);
DO $transfer_accept$
BEGIN
  PERFORM public.academy_review_athlete_transfer(
    current_setting('test.transfer_request')::uuid,'accept'
  );
END
$transfer_accept$;

SELECT set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000013',false);
DO $transfer_approve$
BEGIN
  PERFORM public.academy_review_athlete_transfer(
    current_setting('test.transfer_request')::uuid,'approve'
  );
  IF NOT EXISTS(SELECT 1 FROM public.coach_athlete_links
    WHERE coach_user_id='00000000-0000-0000-0000-000000000012'
      AND athlete_user_id='00000000-0000-0000-0000-000000000011' AND status='ended') THEN
    RAISE EXCEPTION 'Old Coach relationship was not ended';
  END IF;
  IF NOT EXISTS(SELECT 1 FROM public.coach_athlete_links
    WHERE coach_user_id='00000000-0000-0000-0000-000000000015'
      AND athlete_user_id='00000000-0000-0000-0000-000000000011' AND status='active') THEN
    RAISE EXCEPTION 'Target Coach relationship was not activated';
  END IF;
END
$transfer_approve$;

-- Guardian invitations need guardian acceptance and athlete approval. Only
-- explicitly selected scopes are returned, and the athlete can revoke afterwards.
DO $guardian_create$
DECLARE v_link uuid;
BEGIN
  v_link:=public.academy_create_guardian_link(
    '10000000-0000-0000-0000-000000000001',
    '00000000-0000-0000-0000-000000000011',
    '00000000-0000-0000-0000-000000000016',
    'parent'
  );
  PERFORM set_config('test.guardian_link',v_link::text,false);
END
$guardian_create$;

SELECT set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000016',false);
DO $guardian_accept$
BEGIN
  PERFORM public.academy_accept_guardian_link(current_setting('test.guardian_link')::uuid);
END
$guardian_accept$;

SELECT set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000011',false);
DO $guardian_approve$
BEGIN
  PERFORM public.academy_approve_guardian_link(
    current_setting('test.guardian_link')::uuid,
    ARRAY['announcements','calendar','attendance_summary','fee_status']::text[]
  );
END
$guardian_approve$;

SELECT set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000016',false);
DO $guardian_summary$
DECLARE v_summary jsonb;
BEGIN
  v_summary:=public.academy_guardian_portal_summary(current_setting('test.guardian_link')::uuid);
  IF NOT (v_summary ? 'announcements' AND v_summary ? 'calendar'
      AND v_summary ? 'attendance' AND v_summary ? 'fees') THEN
    RAISE EXCEPTION 'Guardian summary omitted an approved data scope';
  END IF;
  IF v_summary::text LIKE '%Private health event%' OR v_summary::text LIKE '%Recovery day%' THEN
    RAISE EXCEPTION 'Guardian summary exposed medical or recovery calendar entries';
  END IF;
END
$guardian_summary$;

SELECT set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000011',false);
DO $guardian_revoke$
BEGIN
  PERFORM public.academy_revoke_guardian_link(current_setting('test.guardian_link')::uuid);
  IF EXISTS(SELECT 1 FROM public.academy_guardian_links
    WHERE id=current_setting('test.guardian_link')::uuid AND status<>'revoked') THEN
    RAISE EXCEPTION 'Athlete could not revoke guardian access';
  END IF;
END
$guardian_revoke$;

-- Broadcast notifications and per-Academy preferences.
SELECT set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000013',false);
DO $announcement$
DECLARE v_id uuid;
BEGIN
  v_id:=public.academy_publish_announcement(
    '10000000-0000-0000-0000-000000000001',
    'Athlete group notice','Upcoming training update','athletes',
    (SELECT id FROM public.training_groups WHERE name='Kyorugi Group')
  );
  IF NOT EXISTS(SELECT 1 FROM public.notifications
    WHERE user_id='00000000-0000-0000-0000-000000000011'
      AND title='Athlete group notice') THEN
    RAISE EXCEPTION 'Eligible athlete was not notified about Academy announcement';
  END IF;
END
$announcement$;

-- A Coach not in the target training group and not in the audience must not
-- see that group announcement through RLS.
SELECT set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000015',false);
DO $announcement_rls$
DECLARE visible_count integer;
BEGIN
  SELECT count(*) INTO visible_count FROM public.academy_announcements
  WHERE title='Athlete group notice';
  IF visible_count<>0 THEN RAISE EXCEPTION 'Audience/group-scoped announcement leaked to unrelated Coach'; END IF;
END
$announcement_rls$;

-- Paid seats remain unactivated until a payment provider confirms settlement.
SELECT set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000015',false);
DO $seat_request$
BEGIN
  PERFORM public.academy_request_coach_seat(
    '10000000-0000-0000-0000-000000000001','additional'
  );
END
$seat_request$;
SELECT set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000013',false);
DO $seat_review$
DECLARE v_id uuid; v_status text;
BEGIN
  SELECT id INTO v_id FROM public.academy_seat_requests
  WHERE academy_id='10000000-0000-0000-0000-000000000001'
    AND coach_user_id='00000000-0000-0000-0000-000000000015'
  ORDER BY created_at DESC LIMIT 1;
  v_status:=public.academy_review_coach_seat_request(v_id,true);
  IF v_status<>'payment_pending' THEN RAISE EXCEPTION 'Additional paid seat was activated before verified payment'; END IF;
END
$seat_review$;

DO $report$
DECLARE v_id uuid;
BEGIN
  v_id:=public.academy_record_report_export(
    '10000000-0000-0000-0000-000000000001','fees','csv','{"rows":1}'::jsonb
  );
  IF NOT EXISTS(SELECT 1 FROM public.academy_report_exports WHERE id=v_id) THEN
    RAISE EXCEPTION 'Report export was not audit-logged';
  END IF;
END
$report$;

DO $audit$
BEGIN
  IF (SELECT count(*) FROM public.academy_audit_log
      WHERE academy_id='10000000-0000-0000-0000-000000000001')<5 THEN
    RAISE EXCEPTION 'Sensitive Academy actions are missing from the audit log';
  END IF;
  IF NOT EXISTS(SELECT 1 FROM public.notifications
      WHERE user_id='00000000-0000-0000-0000-000000000013') THEN
    RAISE EXCEPTION 'Academy operation events did not produce an admin notification';
  END IF;
END
$audit$;

RESET ROLE;
