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
  plan_id text NOT NULL DEFAULT 'free',
  provider text,
  provider_customer_id text,
  provider_subscription_id text,
  status text NOT NULL DEFAULT 'active',
  current_period_end timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE public.payment_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid,
  provider text NOT NULL,
  event_type text NOT NULL,
  provider_event_id text,
  amount_minor integer,
  currency text DEFAULT 'INR',
  status text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE public.feedback_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  title text NOT NULL,
  details text,
  status text NOT NULL DEFAULT 'new',
  priority text NOT NULL DEFAULT 'normal',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE public.support_tickets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  status text NOT NULL DEFAULT 'open',
  subject text NOT NULL DEFAULT 'Test support case',
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE public.announcements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL,
  body text NOT NULL,
  audience text NOT NULL DEFAULT 'all',
  published_at timestamptz,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE public.feature_flags (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  flag_key text NOT NULL UNIQUE,
  description text,
  enabled boolean NOT NULL DEFAULT false,
  audience text NOT NULL DEFAULT 'all',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
INSERT INTO public.feature_flags(flag_key,description,enabled,audience)
VALUES ('coach_tools','Coach tooling entry point',false,'coaches');

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
  awarded_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
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

ALTER TABLE public.account_entitlements
  ADD COLUMN IF NOT EXISTS selected_plan_id text;

CREATE OR REPLACE FUNCTION public.enforce_profile_entitlement_projection()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path=public
AS $function$
DECLARE v_plan text; v_role text;
BEGIN
  SELECT selected_plan_id INTO v_plan
  FROM public.account_entitlements
  WHERE user_id=NEW.user_id;
  IF v_plan IS NOT NULL THEN
    NEW.plan_id:=v_plan;
    IF COALESCE(OLD.role::text,'athlete') NOT IN ('support_admin','admin','super_admin') THEN
      v_role:=CASE v_plan WHEN 'champion' THEN 'coach' WHEN 'academy' THEN 'academy_admin' ELSE 'athlete' END;
      NEW.role:=v_role;
    END IF;
  END IF;
  RETURN NEW;
END;
$function$;
DROP TRIGGER IF EXISTS trg_enforce_profile_entitlement_projection ON public.profiles;
CREATE TRIGGER trg_enforce_profile_entitlement_projection
BEFORE UPDATE OF plan_id,role ON public.profiles
FOR EACH ROW EXECUTE FUNCTION public.enforce_profile_entitlement_projection();

ALTER TABLE public.support_tickets
  ADD COLUMN IF NOT EXISTS body text,
  ADD COLUMN IF NOT EXISTS priority text NOT NULL DEFAULT 'normal',
  ADD COLUMN IF NOT EXISTS assigned_to uuid,
  ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();
ALTER TABLE public.feedback_items
  ADD COLUMN IF NOT EXISTS title text NOT NULL DEFAULT 'Test feedback',
  ADD COLUMN IF NOT EXISTS details text,
  ADD COLUMN IF NOT EXISTS priority text NOT NULL DEFAULT 'normal',
  ADD COLUMN IF NOT EXISTS created_at timestamptz NOT NULL DEFAULT now(),
  ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();

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

-- Existing production profile protection, replaced by the candidate migration
-- with the additional narrowly scoped verification RPC exception.
CREATE OR REPLACE FUNCTION public.enforce_profile_entitlement_security()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path=public
AS $function$
BEGIN
  IF auth.uid() IS NULL THEN RETURN NEW; END IF;
  IF TG_OP='INSERT' AND NOT private.is_super_admin() THEN
    NEW.role:='athlete'; NEW.plan_id:='free';
    NEW.verified_athlete:=false; NEW.founder_badge:=false;
  END IF;
  IF TG_OP='UPDATE' AND NOT private.is_super_admin() THEN
    NEW.role:=OLD.role; NEW.plan_id:=OLD.plan_id;
    NEW.verified_athlete:=OLD.verified_athlete;
    NEW.founder_badge:=OLD.founder_badge;
  END IF;
  RETURN NEW;
END;
$function$;
CREATE TRIGGER enforce_profile_entitlement_security
BEFORE INSERT OR UPDATE ON public.profiles
FOR EACH ROW EXECUTE FUNCTION public.enforce_profile_entitlement_security();

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS fixture_admin_and_owner_profiles ON public.profiles;
DROP POLICY IF EXISTS fixture_admin_and_owner_student_verifications ON public.student_verifications;
DROP POLICY IF EXISTS fixture_admin_subscriptions ON public.subscriptions;
DROP POLICY IF EXISTS fixture_admin_support_tickets ON public.support_tickets;
DROP POLICY IF EXISTS fixture_admin_feedback_items ON public.feedback_items;
DROP POLICY IF EXISTS fixture_admin_training_sessions ON public.training_sessions;
DROP POLICY IF EXISTS fixture_admin_feature_flags ON public.feature_flags;
DROP POLICY IF EXISTS fixture_admin_audit_logs ON public.audit_logs;
DROP POLICY IF EXISTS fixture_admin_notifications ON public.notifications;

CREATE POLICY fixture_admin_and_owner_profiles ON public.profiles
  FOR ALL TO authenticated
  USING (user_id=(SELECT auth.uid()) OR private.is_platform_admin())
  WITH CHECK (user_id=(SELECT auth.uid()) OR private.is_platform_admin());

CREATE POLICY fixture_admin_and_owner_student_verifications ON public.student_verifications
  FOR ALL TO authenticated
  USING (user_id=(SELECT auth.uid()) OR private.is_platform_admin())
  WITH CHECK (user_id=(SELECT auth.uid()) OR private.is_platform_admin());

CREATE POLICY fixture_admin_feedback_items ON public.feedback_items
  FOR ALL TO authenticated
  USING (private.is_platform_admin() OR user_id=(SELECT auth.uid()))
  WITH CHECK (private.is_platform_admin() OR user_id=(SELECT auth.uid()));

CREATE POLICY fixture_admin_payment_events ON public.payment_events
  FOR ALL TO authenticated
  USING (private.is_platform_admin())
  WITH CHECK (private.is_platform_admin());

CREATE POLICY fixture_admin_subscriptions ON public.subscriptions
  FOR ALL TO authenticated
  USING (private.is_platform_admin())
  WITH CHECK (private.is_platform_admin());

CREATE POLICY fixture_admin_support_tickets ON public.support_tickets
  FOR ALL TO authenticated
  USING (private.is_platform_admin() OR user_id=(SELECT auth.uid()))
  WITH CHECK (private.is_platform_admin() OR user_id=(SELECT auth.uid()));
CREATE POLICY fixture_admin_feedback_items ON public.feedback_items
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

CREATE POLICY fixture_admin_announcements ON public.announcements
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

INSERT INTO public.account_entitlements(user_id,selected_plan_id)
SELECT user_id,plan_id FROM public.profiles;

INSERT INTO public.training_sessions(user_id,payload)
VALUES ('00000000-0000-0000-0000-000000000006','{"note":"owned training record"}'::jsonb);
INSERT INTO public.ai_usage_events(user_id,status,payload)
VALUES ('00000000-0000-0000-0000-000000000006','recorded','{"tokens":1}'::jsonb);
INSERT INTO public.support_tickets(user_id,status,subject)
VALUES ('00000000-0000-0000-0000-000000000006','open','Athlete help request');
INSERT INTO public.feedback_items(user_id,title,details,status,priority)
VALUES ('00000000-0000-0000-0000-000000000006','Training feedback','Test feedback details','new','normal');
INSERT INTO public.subscriptions(user_id,plan_id,provider,status,current_period_end)
VALUES ('00000000-0000-0000-0000-000000000006','pro','razorpay','active',now()+interval '30 days');
INSERT INTO public.payment_events(user_id,provider,event_type,amount_minor,currency,status)
VALUES ('00000000-0000-0000-0000-000000000006','razorpay','subscription.charged',19900,'INR','captured');
INSERT INTO public.feedback_items(user_id,title,details,status,priority)
VALUES ('00000000-0000-0000-0000-000000000006','Test feedback','Mobile navigation needs improvement.','new','normal');

INSERT INTO public.student_verifications(user_id,status,document_type,file_path)
VALUES ('00000000-0000-0000-0000-000000000006','pending','school_id',
        '00000000-0000-0000-0000-000000000006/school-id.pdf');
INSERT INTO storage.objects(bucket_id,name)
VALUES ('verification-proofs','00000000-0000-0000-0000-000000000006/school-id.pdf');
