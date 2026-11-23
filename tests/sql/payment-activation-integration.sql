\set ON_ERROR_STOP on
CREATE EXTENSION IF NOT EXISTS pgcrypto;

DO $$ BEGIN CREATE ROLE anon NOLOGIN; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE ROLE authenticated NOLOGIN; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE ROLE service_role NOLOGIN BYPASSRLS; EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE SCHEMA IF NOT EXISTS auth;
CREATE TABLE IF NOT EXISTS auth.users (
  id uuid PRIMARY KEY,
  email text,
  email_confirmed_at timestamptz
);
CREATE SCHEMA IF NOT EXISTS private;

CREATE TABLE public.age_approval_state (
  user_id uuid PRIMARY KEY,
  approved boolean NOT NULL
);
CREATE OR REPLACE FUNCTION public.is_age_approved(p_user_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = ''
AS $function$
  SELECT COALESCE((SELECT a.approved FROM public.age_approval_state a WHERE a.user_id = p_user_id), false)
$function$;

CREATE TABLE public.profiles (
  user_id uuid PRIMARY KEY,
  role text NOT NULL,
  plan_id text NOT NULL DEFAULT 'free',
  academy_id uuid,
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE public.student_verifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  status text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE public.academies (
  id uuid PRIMARY KEY,
  owner_user_id uuid NOT NULL,
  status text NOT NULL,
  setup_completed boolean NOT NULL,
  contact_email_verified_at timestamptz
);
CREATE TABLE public.subscriptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  plan_id text NOT NULL,
  provider text NOT NULL CHECK (provider IN ('manual','razorpay','stripe','cashfree')),
  provider_customer_id text,
  provider_subscription_id text,
  status text NOT NULL DEFAULT 'active',
  current_period_end timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(user_id, plan_id)
);
CREATE TABLE public.account_entitlements (
  user_id uuid PRIMARY KEY,
  selected_plan_id text NOT NULL,
  trial_fee_paise integer,
  trial_payment_status text,
  trial_payment_provider text,
  trial_payment_reference text,
  trial_claimed_at timestamptz,
  trial_plan_id text,
  trial_started_at timestamptz,
  trial_ends_at timestamptz,
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE public.payment_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  provider text NOT NULL,
  provider_event_id text,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, UPDATE ON public.subscriptions TO service_role;

\ir ../../supabase/migrations/20261118000300_harden_paid_subscription_activation.sql
\ir ../../supabase/migrations/20261118000500_subscription_cancel_at_period_end.sql
\ir ../../supabase/migrations/20261118000600_payment_webhook_event_receipts.sql
\ir ../../supabase/migrations/20261118000700_harden_trial_activation.sql

-- The same provider event cannot be recorded twice; event IDs are provider-scoped.
INSERT INTO public.payment_events(provider, provider_event_id) VALUES ('stripe', 'evt_unique_1');
DO $dedupe$
DECLARE
  v_blocked boolean := false;
BEGIN
  BEGIN
    INSERT INTO public.payment_events(provider, provider_event_id) VALUES ('stripe', 'evt_unique_1');
  EXCEPTION WHEN unique_violation THEN
    v_blocked := true;
  END;
  IF NOT v_blocked THEN RAISE EXCEPTION 'Duplicate provider event ID was accepted'; END IF;
  INSERT INTO public.payment_events(provider, provider_event_id) VALUES ('razorpay', 'evt_unique_1');
END
$dedupe$;


INSERT INTO auth.users(id,email,email_confirmed_at) VALUES
 ('10000000-0000-0000-0000-000000000001','one@athleten.test',now()),
 ('10000000-0000-0000-0000-000000000002','two@athleten.test',now()),
 ('10000000-0000-0000-0000-000000000003','three@athleten.test',now()),
 ('10000000-0000-0000-0000-000000000004','four@athleten.test',now()),
 ('10000000-0000-0000-0000-000000000005','five@athleten.test',now()),
 ('10000000-0000-0000-0000-000000000006','six@athleten.test',NULL);

INSERT INTO public.profiles(user_id, role) VALUES
 ('10000000-0000-0000-0000-000000000001','athlete'),
 ('10000000-0000-0000-0000-000000000002','athlete'),
 ('10000000-0000-0000-0000-000000000003','coach'),
 ('10000000-0000-0000-0000-000000000004','academy_admin'),
 ('10000000-0000-0000-0000-000000000005','athlete'),
 ('10000000-0000-0000-0000-000000000006','athlete');

INSERT INTO public.age_approval_state(user_id, approved) VALUES
 ('10000000-0000-0000-0000-000000000001',true),
 ('10000000-0000-0000-0000-000000000002',false),
 ('10000000-0000-0000-0000-000000000003',true),
 ('10000000-0000-0000-0000-000000000004',true),
 ('10000000-0000-0000-0000-000000000005',true),
 ('10000000-0000-0000-0000-000000000006',true);

INSERT INTO public.academies(id, owner_user_id, status, setup_completed, contact_email_verified_at)
VALUES (
 '20000000-0000-0000-0000-000000000004',
 '10000000-0000-0000-0000-000000000004',
 'active', true, now()
);
UPDATE public.profiles
   SET academy_id = '20000000-0000-0000-0000-000000000004'
 WHERE user_id = '10000000-0000-0000-0000-000000000004';

INSERT INTO public.student_verifications(user_id,status,created_at) VALUES
 ('10000000-0000-0000-0000-000000000005','approved',now() - interval '2 days'),
 ('10000000-0000-0000-0000-000000000005','pending',now() - interval '1 day');

SET ROLE service_role;

DO $test$
DECLARE
  v_sub public.subscriptions;
  v_blocked boolean;
BEGIN
  -- Verified athlete with a future monthly period can activate.
  v_sub := public.activate_paid_subscription(
    '10000000-0000-0000-0000-000000000001',
    'pro', 'stripe', 'cus_test', 'sub_monthly',
    now() + interval '1 month'
  );
  IF v_sub.status <> 'active' OR v_sub.current_period_end <= now() THEN
    RAISE EXCEPTION 'Verified monthly subscription did not activate with a future period';
  END IF;
  IF v_sub.cancel_at_period_end IS DISTINCT FROM false THEN
    RAISE EXCEPTION 'New subscriptions must default to no scheduled cancellation';
  END IF;
  UPDATE public.subscriptions SET cancel_at_period_end = true WHERE id = v_sub.id;
  IF NOT EXISTS (SELECT 1 FROM public.subscriptions WHERE id = v_sub.id AND cancel_at_period_end = true) THEN
    RAISE EXCEPTION 'Period-end cancellation flag was not persisted';
  END IF;
  -- A renewal for the same provider subscription preserves a user-requested cancellation.
  v_sub := public.activate_paid_subscription(
    '10000000-0000-0000-0000-000000000001',
    'pro', 'stripe', 'cus_test', 'sub_monthly',
    now() + interval '2 months'
  );
  IF v_sub.cancel_at_period_end IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'Renewal cleared scheduled cancellation for the same provider subscription';
  END IF;

  -- A genuinely new provider subscription starts with no cancellation request.
  v_sub := public.activate_paid_subscription(
    '10000000-0000-0000-0000-000000000001',
    'pro', 'stripe', 'cus_test', 'sub_replacement',
    now() + interval '3 months'
  );
  IF v_sub.cancel_at_period_end IS DISTINCT FROM false THEN
    RAISE EXCEPTION 'A replacement provider subscription retained stale cancellation state';
  END IF;

  -- Idempotent provider retry updates the same user/plan row rather than duplicating it.
  v_sub := public.activate_paid_subscription(
    '10000000-0000-0000-0000-000000000001',
    'pro', 'stripe', 'cus_test', 'sub_monthly',
    now() + interval '2 months'
  );
  IF (SELECT count(*) FROM public.subscriptions WHERE user_id='10000000-0000-0000-0000-000000000001' AND plan_id='pro') <> 1 THEN
    RAISE EXCEPTION 'Subscription retry created duplicate subscription rows';
  END IF;

  -- Pending guardian approval blocks activation.
  v_blocked := false;
  BEGIN
    PERFORM public.activate_paid_subscription(
      '10000000-0000-0000-0000-000000000002',
      'pro', 'stripe', NULL, 'sub_pending',
      now() + interval '1 month'
    );
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM LIKE '%AGE_OR_GUARDIAN_APPROVAL_REQUIRED%' THEN v_blocked := true; ELSE RAISE; END IF;
  END;
  IF NOT v_blocked THEN RAISE EXCEPTION 'Age-pending account was allowed to activate paid plan'; END IF;

  -- Missing or expired billing periods are rejected.
  v_blocked := false;
  BEGIN
    PERFORM public.activate_paid_subscription(
      '10000000-0000-0000-0000-000000000001',
      'pro', 'stripe', NULL, 'sub_no_end', NULL
    );
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM LIKE '%VALID_SUBSCRIPTION_PERIOD_REQUIRED%' THEN v_blocked := true; ELSE RAISE; END IF;
  END;
  IF NOT v_blocked THEN RAISE EXCEPTION 'Null billing-period end was allowed'; END IF;

  v_blocked := false;
  BEGIN
    PERFORM public.activate_paid_subscription(
      '10000000-0000-0000-0000-000000000001',
      'pro', 'stripe', NULL, 'sub_expired', now() - interval '1 day'
    );
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM LIKE '%VALID_SUBSCRIPTION_PERIOD_REQUIRED%' THEN v_blocked := true; ELSE RAISE; END IF;
  END;
  IF NOT v_blocked THEN RAISE EXCEPTION 'Expired billing-period end was allowed'; END IF;

  -- A Coach role cannot purchase an Athlete Pro product.
  v_blocked := false;
  BEGIN
    PERFORM public.activate_paid_subscription(
      '10000000-0000-0000-0000-000000000003',
      'pro', 'stripe', NULL, 'sub_wrong_role',
      now() + interval '1 month'
    );
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM LIKE '%ATHLETE_PLAN_REQUIRES_ATHLETE_ROLE%' THEN v_blocked := true; ELSE RAISE; END IF;
  END;
  IF NOT v_blocked THEN RAISE EXCEPTION 'Wrong product role was allowed to activate Athlete plan'; END IF;

  -- Verified Academy Admin with a completed, active and contact-verified academy can activate.
  v_sub := public.activate_paid_subscription(
    '10000000-0000-0000-0000-000000000004',
    'academy', 'stripe', 'cus_academy', 'sub_academy',
    now() + interval '1 year'
  );
  IF v_sub.plan_id <> 'academy' OR v_sub.status <> 'active' THEN
    RAISE EXCEPTION 'Verified Academy subscription did not activate';
  END IF;
END
$test$;

RESET ROLE;

SET ROLE service_role;
DO $trial$
DECLARE
  v_blocked boolean;
  v_ent public.account_entitlements;
BEGIN
  -- The latest Student verification controls eligibility; an old approval is insufficient.
  v_blocked := false;
  BEGIN
    PERFORM public.activate_trial_after_payment(
      '10000000-0000-0000-0000-000000000005',
      'student', 'stripe', 'cs_student_trial_pending', 900
    );
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM LIKE '%STUDENT_NOT_VERIFIED%' THEN v_blocked := true; ELSE RAISE; END IF;
  END;
  IF NOT v_blocked THEN RAISE EXCEPTION 'A Student with a newer pending verification was allowed to activate a trial'; END IF;

  UPDATE public.student_verifications
     SET status = 'approved'
   WHERE user_id = '10000000-0000-0000-0000-000000000005'
     AND created_at = (SELECT max(created_at) FROM public.student_verifications
                       WHERE user_id = '10000000-0000-0000-0000-000000000005');

  v_ent := public.activate_trial_after_payment(
    '10000000-0000-0000-0000-000000000005',
    'student', 'stripe', 'cs_student_trial_approved', 900
  );
  IF v_ent.trial_payment_status <> 'paid'
     OR v_ent.trial_plan_id <> 'student'
     OR v_ent.trial_ends_at <= now() THEN
    RAISE EXCEPTION 'Approved Student trial did not activate correctly';
  END IF;

  -- Account email must be confirmed before the service-only trial activation RPC grants a trial.
  v_blocked := false;
  BEGIN
    PERFORM public.activate_trial_after_payment(
      '10000000-0000-0000-0000-000000000006',
      'pro', 'stripe', 'cs_unconfirmed_trial', 900
    );
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM LIKE '%EMAIL_VERIFICATION_REQUIRED%' THEN v_blocked := true; ELSE RAISE; END IF;
  END;
  IF NOT v_blocked THEN RAISE EXCEPTION 'Unconfirmed account email was allowed to activate a trial'; END IF;

  -- A non-approved account cannot activate a trial even if its email is confirmed.
  v_blocked := false;
  BEGIN
    PERFORM public.activate_trial_after_payment(
      '10000000-0000-0000-0000-000000000002',
      'pro', 'stripe', 'cs_unapproved_trial', 900
    );
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM LIKE '%AGE_OR_GUARDIAN_APPROVAL_REQUIRED%' THEN v_blocked := true; ELSE RAISE; END IF;
  END;
  IF NOT v_blocked THEN RAISE EXCEPTION 'Unapproved account was allowed to activate a trial'; END IF;
END
$trial$;

RESET ROLE;

DO $acl$
DECLARE
  v_claim record;
BEGIN
  IF has_function_privilege('anon', 'public.activate_paid_subscription(uuid,text,text,text,text,timestamptz)', 'EXECUTE')
     OR has_function_privilege('authenticated', 'public.activate_paid_subscription(uuid,text,text,text,text,timestamptz)', 'EXECUTE') THEN
    RAISE EXCEPTION 'Public or authenticated role can execute subscription activation';
  END IF;
  IF NOT has_function_privilege('service_role', 'public.activate_paid_subscription(uuid,text,text,text,text,timestamptz)', 'EXECUTE') THEN
    RAISE EXCEPTION 'Service role cannot execute subscription activation';
  END IF;
  IF has_function_privilege('anon', 'public.activate_trial_after_payment(uuid,text,text,text,integer)', 'EXECUTE')
     OR has_function_privilege('authenticated', 'public.activate_trial_after_payment(uuid,text,text,text,integer)', 'EXECUTE')
     OR NOT has_function_privilege('service_role', 'public.activate_trial_after_payment(uuid,text,text,text,integer)', 'EXECUTE') THEN
    RAISE EXCEPTION 'Trial activation RPC has incorrect permissions';
  END IF;
  IF has_function_privilege('anon', 'public.claim_payment_webhook_event(text,text,text)', 'EXECUTE')
     OR has_function_privilege('authenticated', 'public.claim_payment_webhook_event(text,text,text)', 'EXECUTE')
     OR NOT has_function_privilege('service_role', 'public.claim_payment_webhook_event(text,text,text)', 'EXECUTE') THEN
    RAISE EXCEPTION 'Webhook event claim RPC has incorrect permissions';
  END IF;
  IF has_function_privilege('anon', 'public.complete_payment_webhook_event(text,text)', 'EXECUTE')
     OR has_function_privilege('authenticated', 'public.complete_payment_webhook_event(text,text)', 'EXECUTE')
     OR NOT has_function_privilege('service_role', 'public.complete_payment_webhook_event(text,text)', 'EXECUTE') THEN
    RAISE EXCEPTION 'Webhook event completion RPC has incorrect permissions';
  END IF;
  IF has_function_privilege('anon', 'public.fail_payment_webhook_event(text,text,text)', 'EXECUTE')
     OR has_function_privilege('authenticated', 'public.fail_payment_webhook_event(text,text,text)', 'EXECUTE')
     OR NOT has_function_privilege('service_role', 'public.fail_payment_webhook_event(text,text,text)', 'EXECUTE') THEN
    RAISE EXCEPTION 'Webhook event failure RPC has incorrect permissions';
  END IF;
END
$acl$;

SET ROLE service_role;
DO $receipt$
DECLARE
  v_claim record;
BEGIN
  SELECT * INTO v_claim
    FROM public.claim_payment_webhook_event('stripe', 'evt_receipt_1', 'invoice.paid');
  IF v_claim.claimed IS DISTINCT FROM true OR v_claim.already_processed IS DISTINCT FROM false THEN
    RAISE EXCEPTION 'New webhook event was not claimed';
  END IF;

  SELECT * INTO v_claim
    FROM public.claim_payment_webhook_event('stripe', 'evt_receipt_1', 'invoice.paid');
  IF v_claim.claimed IS DISTINCT FROM false OR v_claim.already_processed IS DISTINCT FROM false
     OR v_claim.retry_after IS NULL THEN
    RAISE EXCEPTION 'Concurrent duplicate webhook event was not held';
  END IF;

  PERFORM public.fail_payment_webhook_event('stripe', 'evt_receipt_1', 'TEST_RETRY');
  SELECT * INTO v_claim
    FROM public.claim_payment_webhook_event('stripe', 'evt_receipt_1', 'invoice.paid');
  IF v_claim.claimed IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'Failed webhook event could not be reclaimed for retry';
  END IF;

  PERFORM public.complete_payment_webhook_event('stripe', 'evt_receipt_1');
  SELECT * INTO v_claim
    FROM public.claim_payment_webhook_event('stripe', 'evt_receipt_1', 'invoice.paid');
  IF v_claim.claimed IS DISTINCT FROM false OR v_claim.already_processed IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'Processed webhook duplicate was not acknowledged';
  END IF;
END
$receipt$;
RESET ROLE;
