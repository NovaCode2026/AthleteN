\set ON_ERROR_STOP on
CREATE EXTENSION IF NOT EXISTS pgcrypto;

DO $$ BEGIN CREATE ROLE anon NOLOGIN; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE ROLE authenticated NOLOGIN; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE ROLE service_role NOLOGIN BYPASSRLS; EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE SCHEMA IF NOT EXISTS auth;
CREATE OR REPLACE FUNCTION auth.jwt()
RETURNS jsonb
LANGUAGE sql
STABLE
AS $function$
  SELECT COALESCE(NULLIF(current_setting('request.jwt.claims', true), '')::jsonb, '{}'::jsonb)
$function$;
GRANT USAGE ON SCHEMA auth TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION auth.jwt() TO authenticated, service_role;

\ir ../../supabase/migrations/20261118000200_athleten_ai_monthly_budget_ledger.sql

SET ROLE service_role;
SELECT set_config('request.jwt.claims', '{"role":"service_role"}', false);
CREATE TEMP TABLE budget_test_ids(label text PRIMARY KEY, id uuid);

INSERT INTO budget_test_ids
SELECT 'first',
  public.reserve_athleten_ai_budget(
    p_usage_month => date_trunc('month', now() AT TIME ZONE 'UTC')::date,
    p_monthly_budget_paise => 1000,
    p_reserve_paise => 700
  );

DO $test$
DECLARE
  v_first_id uuid;
  v_over_budget_id uuid;
BEGIN
  SELECT id INTO v_first_id FROM pg_temp.budget_test_ids WHERE label = 'first';
  IF v_first_id IS NULL THEN RAISE EXCEPTION 'Initial budget reservation failed'; END IF;

  v_over_budget_id := public.reserve_athleten_ai_budget(
    date_trunc('month', now() AT TIME ZONE 'UTC')::date, 1000, 400
  );
  IF v_over_budget_id IS NOT NULL THEN RAISE EXCEPTION 'Reservation exceeded monthly budget'; END IF;

  IF NOT public.settle_athleten_ai_budget(v_first_id, 600) THEN RAISE EXCEPTION 'Reservation did not settle'; END IF;
  IF NOT public.settle_athleten_ai_budget(v_first_id, 600) THEN RAISE EXCEPTION 'Idempotent settlement failed'; END IF;
  IF public.release_athleten_ai_budget(v_first_id) THEN RAISE EXCEPTION 'Settled reservation was incorrectly released'; END IF;
END
$test$;

RESET ROLE;
SET ROLE postgres;
DO $assert$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.athleten_ai_budget_monthly
    WHERE usage_month = date_trunc('month', now() AT TIME ZONE 'UTC')::date
      AND budget_paise = 1000 AND reserved_paise = 0 AND spent_paise = 600
  ) THEN RAISE EXCEPTION 'Monthly totals do not reconcile after settlement'; END IF;
END
$assert$;

SET ROLE service_role;
SELECT set_config('request.jwt.claims', '{"role":"service_role"}', false);
INSERT INTO budget_test_ids
SELECT 'second',
  public.reserve_athleten_ai_budget(
    date_trunc('month', now() AT TIME ZONE 'UTC')::date, 1000, 400
  );

DO $test$
DECLARE
  v_second_id uuid;
BEGIN
  SELECT id INTO v_second_id FROM pg_temp.budget_test_ids WHERE label = 'second';
  IF v_second_id IS NULL THEN RAISE EXCEPTION 'Expected remaining budget reservation failed'; END IF;
  IF NOT public.release_athleten_ai_budget(v_second_id) THEN RAISE EXCEPTION 'Reserved budget could not be released'; END IF;
  IF NOT public.release_athleten_ai_budget(v_second_id) THEN RAISE EXCEPTION 'Idempotent release failed'; END IF;
END
$test$;

RESET ROLE;
SET ROLE postgres;
DO $assert$
BEGIN
  IF EXISTS (
    SELECT 1 FROM public.athleten_ai_budget_monthly
    WHERE usage_month = date_trunc('month', now() AT TIME ZONE 'UTC')::date
      AND (reserved_paise <> 0 OR spent_paise <> 600)
  ) THEN RAISE EXCEPTION 'Monthly totals do not reconcile after release'; END IF;
END
$assert$;

SELECT set_config('request.jwt.claims', '{"role":"authenticated"}', false);
SET ROLE authenticated;
DO $test$
DECLARE
  v_blocked boolean := false;
BEGIN
  BEGIN
    PERFORM public.reserve_athleten_ai_budget(
      date_trunc('month', now() AT TIME ZONE 'UTC')::date, 1000, 100
    );
  EXCEPTION WHEN OTHERS THEN
    v_blocked := true;
  END;
  IF NOT v_blocked THEN RAISE EXCEPTION 'Authenticated role was allowed to reserve platform budget'; END IF;

  v_blocked := false;
  BEGIN
    PERFORM 1 FROM public.athleten_ai_budget_monthly;
  EXCEPTION WHEN OTHERS THEN
    v_blocked := true;
  END;
  IF NOT v_blocked THEN RAISE EXCEPTION 'Authenticated role was allowed to read platform budget totals'; END IF;
END
$test$;
RESET ROLE;
