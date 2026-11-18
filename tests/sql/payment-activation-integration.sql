\set ON_ERROR_STOP on
CREATE EXTENSION IF NOT EXISTS pgcrypto;

DO $$ BEGIN CREATE ROLE anon NOLOGIN; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE ROLE authenticated NOLOGIN; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE ROLE service_role NOLOGIN BYPASSRLS; EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE SCHEMA IF NOT EXISTS auth;

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
  updated_at timestamptz NOT NULL DEFAULT now()
);

\ir ../../supabase/migrations/20261118000300_harden_paid_subscription_activation.sql

INSERT INTO public.profiles(user_id, role) VALUES
 ('10000000-0000-0000-0000-000000000001','athlete'),
 ('10000000-0000-0000-0000-000000000002','athlete'),
 ('10000000-0000-0000-0000-000000000003','coach'),
 ('10000000-0000-0000-0000-000000000004','academy_admin');

INSERT INTO public.age_approval_state(user_id, approved) VALUES
 ('10000000-0000-0000-0000-000000000001',true),
 ('10000000-0000-0000-0000-000000000002',false),
 ('10000000-0000-0000-0000-000000000003',true),
 ('10000000-0000-0000-0000-000000000004',true);

INSERT INTO public.academies(id, owner_user_id, status, setup_completed, contact_email_verified_at)
VALUES (
 '20000000-0000-0000-0000-000000000004',
 '10000000-0000-0000-0000-000000000004',
 'active', true, now()
);
UPDATE public.profiles
   SET academy_id = '20000000-0000-0000-0000-000000000004'
 WHERE user_id = '10000000-0000-0000-0000-000000000004';

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

DO $acl$
BEGIN
  IF has_function_privilege('anon', 'public.activate_paid_subscription(uuid,text,text,text,text,timestamptz)', 'EXECUTE')
     OR has_function_privilege('authenticated', 'public.activate_paid_subscription(uuid,text,text,text,text,timestamptz)', 'EXECUTE') THEN
    RAISE EXCEPTION 'Public or authenticated role can execute subscription activation';
  END IF;
  IF NOT has_function_privilege('service_role', 'public.activate_paid_subscription(uuid,text,text,text,text,timestamptz)', 'EXECUTE') THEN
    RAISE EXCEPTION 'Service role cannot execute subscription activation';
  END IF;
END
$acl$;
