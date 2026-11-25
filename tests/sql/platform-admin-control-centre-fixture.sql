\set ON_ERROR_STOP on
\i tests/sql/security-fixture.sql

-- Supabase Auth users and profile fields required by the candidate migration.
CREATE TABLE auth.users (
  id uuid PRIMARY KEY,
  email text,
  email_confirmed_at timestamptz
);
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS username text,
  ADD COLUMN IF NOT EXISTS founder_badge boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS verified_athlete boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS account_code text;

ALTER TABLE public.student_verifications
  ADD COLUMN IF NOT EXISTS document_type text DEFAULT 'school_id',
  ADD COLUMN IF NOT EXISTS file_path text,
  ADD COLUMN IF NOT EXISTS reviewer_notes text,
  ADD COLUMN IF NOT EXISTS reviewed_by uuid,
  ADD COLUMN IF NOT EXISTS reviewed_at timestamptz,
  ADD COLUMN IF NOT EXISTS updated_at timestamptz DEFAULT now();

CREATE TABLE public.subscriptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  status text NOT NULL DEFAULT 'active',
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE public.support_tickets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  status text NOT NULL DEFAULT 'open',
  subject text NOT NULL DEFAULT 'Test support case',
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE public.notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  title text NOT NULL,
  body text NOT NULL,
  notification_type text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE public.audit_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_user_id uuid,
  action text NOT NULL,
  entity_table text NOT NULL,
  entity_id uuid,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE public.athlete_badges (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  badge_key text NOT NULL,
  badge_label text NOT NULL,
  awarded_by uuid,
  permanent boolean NOT NULL DEFAULT false,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  UNIQUE(user_id,badge_key)
);
CREATE SCHEMA IF NOT EXISTS storage;
CREATE TABLE IF NOT EXISTS storage.objects (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  bucket_id text NOT NULL,
  name text NOT NULL
);
ALTER TABLE storage.objects ENABLE ROW LEVEL SECURITY;

-- Create the remaining resource tables named by the scoped-admin policy map.
DO $tables$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'training_sessions','training_plans','attendance_records','tournaments','matches','medals',
    'certificates','documents','weight_logs','calendar_events','competition_checklists','injuries',
    'goals','tournament_scans','referrals','athlete_badges','ai_usage_events','subscription_usage',
    'account_entitlements','payment_orders','payment_events','conversations','conversation_members',
    'messages','message_reports','user_blocks','announcements','feature_flags','reserved_usernames',
    'academy_fee_invoices','academy_fee_payments','academy_coach_attendance','academy_coach_availability',
    'academy_athlete_transfer_requests','academy_announcements','academy_guardian_links',
    'academy_report_exports','academy_seat_requests','academy_staff_assignments',
    'academy_notification_preferences','academy_coach_seats','coach_approval_requests'
  ] LOOP
    IF pg_catalog.to_regclass('public.'||t) IS NULL THEN
      EXECUTE pg_catalog.format(
        'CREATE TABLE public.%I (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), user_id uuid, status text, payload jsonb)',
        t
      );
    END IF;
  END LOOP;
END;
$tables$;

-- Simulate the existing production admin helpers and owner/admin permissive RLS.
CREATE OR REPLACE FUNCTION public.is_platform_admin()
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=''
AS $function$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles p
    WHERE p.user_id=(SELECT auth.uid())
      AND p.role IN ('support_admin','admin','super_admin')
  )
$function$;

CREATE OR REPLACE FUNCTION private.is_platform_admin()
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=''
AS $function$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles p
    WHERE p.user_id=(SELECT auth.uid())
      AND p.role IN ('support_admin','admin','super_admin')
  )
$function$;

CREATE OR REPLACE FUNCTION private.is_super_admin()
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=''
AS $function$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles p
    WHERE p.user_id=(SELECT auth.uid()) AND p.role='super_admin'
  )
$function$;
GRANT EXECUTE ON FUNCTION private.is_platform_admin() TO authenticated;
GRANT EXECUTE ON FUNCTION private.is_super_admin() TO authenticated;

CREATE OR REPLACE FUNCTION private.guard_profile_role_change()
RETURNS trigger
LANGUAGE plpgsql
SET search_path=''
AS $function$
BEGIN
  IF OLD.role IS DISTINCT FROM NEW.role
     AND coalesce(current_setting('athleten.privileged_profile_mutation',true),'') <> '1' THEN
    RAISE EXCEPTION 'Profile role changes must use the protected role-management RPC';
  END IF;
  RETURN NEW;
END;
$function$;
CREATE TRIGGER guard_profile_role_change
BEFORE UPDATE OF role ON public.profiles
FOR EACH ROW EXECUTE FUNCTION private.guard_profile_role_change();

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
CREATE POLICY fixture_admin_and_owner_profiles ON public.profiles
  FOR ALL TO authenticated
  USING (user_id=(SELECT auth.uid()) OR private.is_platform_admin())
  WITH CHECK (user_id=(SELECT auth.uid()) OR private.is_platform_admin());

CREATE POLICY fixture_admin_and_owner_student_verifications ON public.student_verifications
  FOR ALL TO authenticated
  USING (user_id=(SELECT auth.uid()) OR private.is_platform_admin())
  WITH CHECK (user_id=(SELECT auth.uid()) OR private.is_platform_admin());

CREATE POLICY fixture_admin_subscriptions ON public.subscriptions
  FOR ALL TO authenticated
  USING (private.is_platform_admin())
  WITH CHECK (private.is_platform_admin());

CREATE POLICY fixture_admin_support_tickets ON public.support_tickets
  FOR ALL TO authenticated
  USING (private.is_platform_admin() OR user_id=(SELECT auth.uid()))
  WITH CHECK (private.is_platform_admin() OR user_id=(SELECT auth.uid()));

CREATE POLICY fixture_admin_training_sessions ON public.training_sessions
  FOR ALL TO authenticated
  USING (private.is_platform_admin() OR user_id=(SELECT auth.uid()))
  WITH CHECK (private.is_platform_admin() OR user_id=(SELECT auth.uid()));

CREATE POLICY fixture_admin_feature_flags ON public.feature_flags
  FOR ALL TO authenticated
  USING (private.is_platform_admin())
  WITH CHECK (private.is_platform_admin());

CREATE POLICY fixture_admin_audit_logs ON public.audit_logs
  FOR ALL TO authenticated
  USING (private.is_platform_admin())
  WITH CHECK (private.is_platform_admin());

CREATE POLICY fixture_admin_notifications ON public.notifications
  FOR ALL TO authenticated
  USING (private.is_platform_admin() OR user_id=(SELECT auth.uid()))
  WITH CHECK (private.is_platform_admin() OR user_id=(SELECT auth.uid()));

GRANT USAGE ON SCHEMA public, private, storage TO authenticated, service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO authenticated, service_role;
GRANT SELECT ON storage.objects TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_platform_admin() TO authenticated;
-- Deterministic platform test identities; UUID suffixes are asserted in the
-- paired SQL integration file and never reference live production accounts.
INSERT INTO auth.users(id,email,email_confirmed_at) VALUES
 ('00000000-0000-0000-0000-000000000001','root-admin@test.invalid',now()),
 ('00000000-0000-0000-0000-000000000002','verify-admin@test.invalid',now()),
 ('00000000-0000-0000-0000-000000000003','finance-admin@test.invalid',now()),
 ('00000000-0000-0000-0000-000000000004','ops-admin@test.invalid',now()),
 ('00000000-0000-0000-0000-000000000005','support-admin@test.invalid',now()),
 ('00000000-0000-0000-0000-000000000006','athlete@test.invalid',now());

INSERT INTO public.profiles(user_id,full_name,username,role,plan_id,verified_athlete)
VALUES
 ('00000000-0000-0000-0000-000000000001','Root Admin','root_admin','super_admin','free',false),
 ('00000000-0000-0000-0000-000000000002','Verification Admin','verification_admin','admin','free',false),
 ('00000000-0000-0000-0000-000000000003','Finance Admin','finance_admin','admin','free',false),
 ('00000000-0000-0000-0000-000000000004','Operations Admin','operations_admin','admin','free',false),
 ('00000000-0000-0000-0000-000000000005','Support Admin','support_admin','support_admin','free',false),
 ('00000000-0000-0000-0000-000000000006','Test Athlete','test_athlete','athlete','free',false);

INSERT INTO public.training_sessions(user_id,payload)
VALUES ('00000000-0000-0000-0000-000000000006','{"note":"owned training record"}'::jsonb);
INSERT INTO public.support_tickets(user_id,status,subject)
VALUES ('00000000-0000-0000-0000-000000000006','open','Athlete help request');
INSERT INTO public.subscriptions(user_id,status)
VALUES ('00000000-0000-0000-0000-000000000006','active');

INSERT INTO public.student_verifications(user_id,status,document_type,file_path)
VALUES ('00000000-0000-0000-0000-000000000006','pending','school_id',
        '00000000-0000-0000-0000-000000000006/school-id.pdf');
INSERT INTO storage.objects(bucket_id,name)
VALUES ('verification-proofs','00000000-0000-0000-0000-000000000006/school-id.pdf');
