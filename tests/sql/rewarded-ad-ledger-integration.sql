\set ON_ERROR_STOP on
CREATE EXTENSION IF NOT EXISTS pgcrypto;

DO $$ BEGIN CREATE ROLE anon NOLOGIN; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE ROLE authenticated NOLOGIN; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE ROLE service_role NOLOGIN BYPASSRLS; EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE SCHEMA IF NOT EXISTS auth;
CREATE TABLE IF NOT EXISTS auth.users (
  id uuid PRIMARY KEY,
  email text
);
CREATE OR REPLACE FUNCTION auth.role()
RETURNS text
LANGUAGE sql STABLE
AS $function$
  SELECT COALESCE(NULLIF(current_setting('request.jwt.claims', true), '')::jsonb ->> 'role', '')
$function$;
GRANT USAGE ON SCHEMA auth TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION auth.role() TO authenticated, service_role;

CREATE TABLE public.profiles (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  role text NOT NULL DEFAULT 'athlete',
  plan_id text NOT NULL DEFAULT 'free'
);
CREATE TABLE public.student_verifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  status text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE public.ai_usage_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  plan_id text NOT NULL,
  topic text NOT NULL,
  tokens_used integer NOT NULL DEFAULT 0,
  input_tokens integer NOT NULL DEFAULT 0,
  output_tokens integer NOT NULL DEFAULT 0,
  total_tokens integer NOT NULL DEFAULT 0,
  api_cost_minor integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

\ir ../../supabase/migrations/20261124090000_rewarded_ad_credit_ledger.sql
\ir ../../supabase/migrations/20261124090100_rewarded_ai_credit_consumption.sql

INSERT INTO auth.users(id, email) VALUES
 ('30000000-0000-0000-0000-000000000001','athlete-one@athleten.test'),
 ('30000000-0000-0000-0000-000000000002','athlete-two@athleten.test'),
 ('30000000-0000-0000-0000-000000000003','student@athleten.test');
INSERT INTO public.profiles(user_id, role, plan_id) VALUES
 ('30000000-0000-0000-0000-000000000001','athlete','pro'),
 ('30000000-0000-0000-0000-000000000002','athlete','free'),
 ('30000000-0000-0000-0000-000000000003','athlete','student');
INSERT INTO public.student_verifications(user_id,status)
VALUES ('30000000-0000-0000-0000-000000000003','pending');

SET ROLE service_role;
SELECT set_config('request.jwt.claims', '{"role":"service_role"}', false);

-- Three rewards on the same UTC day are accepted; a fourth is rejected.
INSERT INTO public.reward_ad_sessions(user_id,provider,custom_data_hash,expires_at)
SELECT '30000000-0000-0000-0000-000000000001'::uuid,'admob',repeat('a',63)||'1',now()+interval '10 minutes'
UNION ALL SELECT '30000000-0000-0000-0000-000000000001'::uuid,'admob',repeat('a',63)||'2',now()+interval '10 minutes'
UNION ALL SELECT '30000000-0000-0000-0000-000000000001'::uuid,'admob',repeat('a',63)||'3',now()+interval '10 minutes'
UNION ALL SELECT '30000000-0000-0000-0000-000000000001'::uuid,'admob',repeat('a',63)||'4',now()+interval '10 minutes';

DO $daily$
DECLARE
  v_timestamp bigint := (extract(epoch FROM now()) * 1000)::bigint;
  v_result text;
BEGIN
  v_result := public.grant_rewarded_ad_credit(repeat('a',63)||'1','tx-athlete-one-1','test-unit','athleten_ai_message',2,v_timestamp,'test-unit');
  IF v_result <> 'granted' THEN RAISE EXCEPTION 'First verified reward was not granted: %', v_result; END IF;
  v_result := public.grant_rewarded_ad_credit(repeat('a',63)||'2','tx-athlete-one-2','test-unit','athleten_ai_message',2,v_timestamp,'test-unit');
  IF v_result <> 'granted' THEN RAISE EXCEPTION 'Second verified reward was not granted: %', v_result; END IF;
  v_result := public.grant_rewarded_ad_credit(repeat('a',63)||'3','tx-athlete-one-3','test-unit','athleten_ai_message',2,v_timestamp,'test-unit');
  IF v_result <> 'granted' THEN RAISE EXCEPTION 'Third verified reward was not granted: %', v_result; END IF;
  v_result := public.grant_rewarded_ad_credit(repeat('a',63)||'4','tx-athlete-one-4','test-unit','athleten_ai_message',2,v_timestamp,'test-unit');
  IF v_result <> 'rejected' THEN RAISE EXCEPTION 'Daily ad cap was not enforced: %', v_result; END IF;
  v_result := public.grant_rewarded_ad_credit(repeat('a',63)||'1','tx-athlete-one-1','test-unit','athleten_ai_message',2,v_timestamp,'test-unit');
  IF v_result <> 'duplicate' THEN RAISE EXCEPTION 'Duplicate provider transaction was not idempotent: %', v_result; END IF;
END
$daily$;

DO $balance$
DECLARE v_balance integer;
BEGIN
  SELECT sum(amount)::integer INTO v_balance FROM public.reward_ledger
  WHERE user_id='30000000-0000-0000-0000-000000000001'
    AND expires_at > now();
  IF v_balance <> 6 THEN RAISE EXCEPTION 'Expected six bonus AI credits, got %', v_balance; END IF;
END
$balance$;

-- Simulate 30 credits earned earlier in this UTC month; the next callback must be rejected.
INSERT INTO public.reward_ledger(
  user_id,provider,provider_transaction_id,reward_key,amount,event_type,expires_at,created_at
)
SELECT
  '30000000-0000-0000-0000-000000000002',
  'admob',
  'tx-prior-month-' || g,
  'ai_message',
  2,
  'earned',
  (date_trunc('month',now() AT TIME ZONE 'UTC') + interval '1 month') AT TIME ZONE 'UTC',
  now() - interval '1 day'
FROM generate_series(1,15) AS g;

INSERT INTO public.reward_ad_sessions(user_id,provider,custom_data_hash,expires_at)
VALUES ('30000000-0000-0000-0000-000000000002','admob',repeat('b',63)||'1',now()+interval '10 minutes');

DO $monthly$
DECLARE
  v_result text;
BEGIN
  v_result := public.grant_rewarded_ad_credit(
    repeat('b',63)||'1','tx-athlete-two-new','test-unit','athleten_ai_message',2,
    (extract(epoch FROM now())*1000)::bigint,'test-unit'
  );
  IF v_result <> 'rejected' THEN RAISE EXCEPTION 'Monthly 30-credit cap was not enforced: %', v_result; END IF;
END
$monthly$;

-- Invalid reward shapes and expired sessions cannot issue credits.
INSERT INTO public.reward_ad_sessions(user_id,provider,custom_data_hash,expires_at)
VALUES ('30000000-0000-0000-0000-000000000001','admob',repeat('c',63)||'1',now()-interval '1 minute');
DO $invalid$
DECLARE v_result text;
BEGIN
  v_result := public.grant_rewarded_ad_credit(
    repeat('c',63)||'1','tx-expired-session','test-unit','athleten_ai_message',2,
    (extract(epoch FROM now())*1000)::bigint,'test-unit'
  );
  IF v_result <> 'rejected' THEN RAISE EXCEPTION 'Expired session was accepted'; END IF;
  v_result := public.grant_rewarded_ad_credit(
    repeat('a',63)||'4','tx-invalid-reward','test-unit','athleten_ai_message',9,
    (extract(epoch FROM now())*1000)::bigint,'test-unit'
  );
  IF v_result <> 'rejected' THEN RAISE EXCEPTION 'Invalid reward amount was accepted'; END IF;
END
$invalid$;

-- Bonus AI usage is reserved atomically and refunded only when the request never ran.
DO $consume$
DECLARE
  v_usage_id uuid;
  v_balance integer;
BEGIN
  v_usage_id := public.reserve_reward_ai_usage('30000000-0000-0000-0000-000000000001','Training Coach');
  IF v_usage_id IS NULL THEN RAISE EXCEPTION 'Valid bonus AI credit could not be reserved'; END IF;
  IF NOT public.cancel_reward_ai_usage(v_usage_id,'30000000-0000-0000-0000-000000000001') THEN
    RAISE EXCEPTION 'Unused bonus AI reservation was not refunded';
  END IF;
  SELECT sum(amount)::integer INTO v_balance FROM public.reward_ledger
  WHERE user_id='30000000-0000-0000-0000-000000000001' AND expires_at > now();
  IF v_balance <> 6 THEN RAISE EXCEPTION 'Bonus credit refund did not restore balance: %', v_balance; END IF;

  v_usage_id := public.reserve_reward_ai_usage('30000000-0000-0000-0000-000000000001','Training Coach');
  IF v_usage_id IS NULL THEN RAISE EXCEPTION 'Bonus AI credit could not be consumed after refund'; END IF;
  IF public.cancel_reward_ai_usage(v_usage_id,'30000000-0000-0000-0000-000000000002') THEN
    RAISE EXCEPTION 'Cross-user cancellation was accepted';
  END IF;
END
$consume$;

-- Student reward usage still requires an approved Student verification.
DO $student$
DECLARE v_usage_id uuid;
BEGIN
  v_usage_id := public.reserve_reward_ai_usage('30000000-0000-0000-0000-000000000003','Training Coach');
  IF v_usage_id IS NOT NULL THEN RAISE EXCEPTION 'Unverified Student received bonus AI usage'; END IF;
END
$student$;

RESET ROLE;

-- Client roles have no table access and cannot call privileged reward RPCs.
SELECT set_config('request.jwt.claims', '{"role":"authenticated"}', false);
SET ROLE authenticated;
DO $acl$
DECLARE v_blocked boolean := false;
BEGIN
  BEGIN
    PERFORM 1 FROM public.reward_ledger;
  EXCEPTION WHEN insufficient_privilege THEN v_blocked := true;
  END;
  IF NOT v_blocked THEN RAISE EXCEPTION 'Authenticated role can read reward ledger directly'; END IF;

  v_blocked := false;
  BEGIN
    PERFORM public.grant_rewarded_ad_credit(repeat('a',64),'tx-client-forged','test-unit','athleten_ai_message',2,
      (extract(epoch FROM now())*1000)::bigint,'test-unit');
  EXCEPTION WHEN insufficient_privilege THEN v_blocked := true;
  END;
  IF NOT v_blocked THEN RAISE EXCEPTION 'Authenticated role can execute privileged reward grant RPC'; END IF;
END
$acl$;
RESET ROLE;
