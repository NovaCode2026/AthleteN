\set ON_ERROR_STOP on
CREATE EXTENSION IF NOT EXISTS pgcrypto;
DO $$ BEGIN CREATE ROLE anon NOLOGIN; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE ROLE authenticated NOLOGIN; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE ROLE service_role NOLOGIN BYPASSRLS; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
CREATE SCHEMA IF NOT EXISTS auth;
CREATE OR REPLACE FUNCTION auth.role()
RETURNS text LANGUAGE sql STABLE
AS $$ SELECT coalesce(current_setting('request.jwt.claim.role',true),'') $$;
GRANT USAGE ON SCHEMA auth TO authenticated,service_role;
GRANT EXECUTE ON FUNCTION auth.role() TO authenticated,service_role;

\ir ../../supabase/migrations/20261112180000_athleten_ai_monthly_budget_ledger.sql

SET ROLE service_role;
SELECT set_config('request.jwt.claim.role','service_role',false);
SELECT public.reserve_athleten_ai_budget(date_trunc('month',now() at time zone 'UTC')::date,1000,700) AS first_reservation \gset
DO $$
DECLARE v uuid;
BEGIN
  v:=public.reserve_athleten_ai_budget(date_trunc('month',now() at time zone 'UTC')::date,1000,400);
  IF v IS NOT NULL THEN RAISE EXCEPTION 'Concurrent reservation exceeded monthly budget'; END IF;
  IF NOT public.settle_athleten_ai_budget(:'first_reservation'::uuid,600) THEN
    RAISE EXCEPTION 'Reservation did not settle';
  END IF;
  IF NOT public.settle_athleten_ai_budget(:'first_reservation'::uuid,600) THEN
    RAISE EXCEPTION 'Idempotent settlement failed';
  END IF;
  IF public.release_athleten_ai_budget(:'first_reservation'::uuid) THEN
    RAISE EXCEPTION 'Settled reservation was incorrectly released';
  END IF;
  IF NOT EXISTS(
    SELECT 1 FROM public.athleten_ai_budget_monthly
    WHERE usage_month=date_trunc('month',now() at time zone 'UTC')::date
      AND budget_paise=1000 AND reserved_paise=0 AND spent_paise=600
  ) THEN RAISE EXCEPTION 'Monthly totals do not reconcile after settlement'; END IF;
END $$;
SELECT public.reserve_athleten_ai_budget(date_trunc('month',now() at time zone 'UTC')::date,1000,400) AS second_reservation \gset
DO $$
BEGIN
  IF NOT public.release_athleten_ai_budget(:'second_reservation'::uuid) THEN
    RAISE EXCEPTION 'Reserved budget could not be released';
  END IF;
  IF NOT public.release_athleten_ai_budget(:'second_reservation'::uuid) THEN
    RAISE EXCEPTION 'Idempotent release failed';
  END IF;
  IF EXISTS(
    SELECT 1 FROM public.athleten_ai_budget_monthly
    WHERE usage_month=date_trunc('month',now() at time zone 'UTC')::date
      AND (reserved_paise<>0 OR spent_paise<>600)
  ) THEN RAISE EXCEPTION 'Monthly totals do not reconcile after release'; END IF;
END $$;
RESET ROLE;
SELECT set_config('request.jwt.claim.role','authenticated',false);
SET ROLE authenticated;
DO $$
DECLARE blocked boolean:=false;
BEGIN
  BEGIN
    PERFORM public.reserve_athleten_ai_budget(date_trunc('month',now() at time zone 'UTC')::date,1000,100);
  EXCEPTION WHEN OTHERS THEN blocked:=true;
  END;
  IF NOT blocked THEN RAISE EXCEPTION 'Authenticated role was allowed to reserve platform budget'; END IF;
END $$;
RESET ROLE;
