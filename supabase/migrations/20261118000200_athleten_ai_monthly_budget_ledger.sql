-- Atomic platform-wide monthly AI budget reservations.
-- Apply only after the local/remote migration history is reconciled and the full
-- application migration chain has been replayed on an isolated PostgreSQL 17 database.

CREATE TABLE IF NOT EXISTS public.athleten_ai_budget_monthly (
  usage_month date PRIMARY KEY,
  budget_paise integer NOT NULL CHECK (budget_paise > 0),
  reserved_paise bigint NOT NULL DEFAULT 0 CHECK (reserved_paise >= 0),
  spent_paise bigint NOT NULL DEFAULT 0 CHECK (spent_paise >= 0),
  updated_at timestamptz NOT NULL DEFAULT pg_catalog.now(),
  CONSTRAINT athleten_ai_budget_month_start CHECK (EXTRACT(DAY FROM usage_month) = 1)
);

CREATE TABLE IF NOT EXISTS public.athleten_ai_budget_reservations (
  id uuid PRIMARY KEY DEFAULT pg_catalog.gen_random_uuid(),
  usage_month date NOT NULL
    REFERENCES public.athleten_ai_budget_monthly(usage_month) ON DELETE RESTRICT,
  reserved_paise integer NOT NULL CHECK (reserved_paise > 0),
  actual_cost_paise integer,
  status text NOT NULL DEFAULT 'reserved'
    CHECK (status IN ('reserved', 'settled', 'released')),
  created_at timestamptz NOT NULL DEFAULT pg_catalog.now(),
  settled_at timestamptz,
  CONSTRAINT athleten_ai_budget_actual_nonnegative
    CHECK (actual_cost_paise IS NULL OR actual_cost_paise >= 0)
);

CREATE INDEX IF NOT EXISTS athleten_ai_budget_reservations_month_status_idx
  ON public.athleten_ai_budget_reservations(usage_month, status);

ALTER TABLE public.athleten_ai_budget_monthly ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.athleten_ai_budget_reservations ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.athleten_ai_budget_monthly
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON TABLE public.athleten_ai_budget_reservations
  FROM PUBLIC, anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION public.reserve_athleten_ai_budget(
  p_usage_month date,
  p_monthly_budget_paise integer,
  p_reserve_paise integer
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_month public.athleten_ai_budget_monthly%ROWTYPE;
  v_reservation_id uuid;
  v_current_month date :=
    pg_catalog.date_trunc('month', pg_catalog.now() AT TIME ZONE 'UTC')::date;
BEGIN
  IF COALESCE(auth.jwt() ->> 'role', '') IS DISTINCT FROM 'service_role' THEN
    RAISE EXCEPTION 'Service role required' USING ERRCODE = '42501';
  END IF;

  IF p_usage_month IS DISTINCT FROM v_current_month THEN
    RAISE EXCEPTION 'Only the current UTC month can be reserved' USING ERRCODE = '22023';
  END IF;

  IF p_monthly_budget_paise IS NULL OR p_monthly_budget_paise <= 0
     OR p_reserve_paise IS NULL OR p_reserve_paise <= 0 THEN
    RAISE EXCEPTION 'Positive budget and reservation required' USING ERRCODE = '22023';
  END IF;

  INSERT INTO public.athleten_ai_budget_monthly (usage_month, budget_paise)
  VALUES (p_usage_month, p_monthly_budget_paise)
  ON CONFLICT (usage_month) DO UPDATE
    SET budget_paise = EXCLUDED.budget_paise,
        updated_at = pg_catalog.now();

  SELECT *
    INTO v_month
    FROM public.athleten_ai_budget_monthly
   WHERE usage_month = p_usage_month
   FOR UPDATE;

  IF v_month.spent_paise + v_month.reserved_paise + p_reserve_paise
     > v_month.budget_paise THEN
    RETURN NULL;
  END IF;

  INSERT INTO public.athleten_ai_budget_reservations (usage_month, reserved_paise)
  VALUES (p_usage_month, p_reserve_paise)
  RETURNING id INTO v_reservation_id;

  UPDATE public.athleten_ai_budget_monthly
     SET reserved_paise = reserved_paise + p_reserve_paise,
         updated_at = pg_catalog.now()
   WHERE usage_month = p_usage_month;

  RETURN v_reservation_id;
END;
$function$;

CREATE OR REPLACE FUNCTION public.settle_athleten_ai_budget(
  p_reservation_id uuid,
  p_actual_cost_paise integer
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_reservation public.athleten_ai_budget_reservations%ROWTYPE;
BEGIN
  IF COALESCE(auth.jwt() ->> 'role', '') IS DISTINCT FROM 'service_role' THEN
    RAISE EXCEPTION 'Service role required' USING ERRCODE = '42501';
  END IF;

  IF p_reservation_id IS NULL OR p_actual_cost_paise IS NULL OR p_actual_cost_paise < 0 THEN
    RAISE EXCEPTION 'Valid reservation and non-negative cost required' USING ERRCODE = '22023';
  END IF;

  SELECT *
    INTO v_reservation
    FROM public.athleten_ai_budget_reservations
   WHERE id = p_reservation_id
   FOR UPDATE;

  IF NOT FOUND THEN
    RETURN false;
  END IF;

  IF v_reservation.status = 'settled' THEN
    RETURN v_reservation.actual_cost_paise = p_actual_cost_paise;
  END IF;

  IF v_reservation.status <> 'reserved' THEN
    RETURN false;
  END IF;

  UPDATE public.athleten_ai_budget_monthly
     SET reserved_paise = GREATEST(0, reserved_paise - v_reservation.reserved_paise),
         spent_paise = spent_paise + p_actual_cost_paise,
         updated_at = pg_catalog.now()
   WHERE usage_month = v_reservation.usage_month;

  UPDATE public.athleten_ai_budget_reservations
     SET status = 'settled',
         actual_cost_paise = p_actual_cost_paise,
         settled_at = pg_catalog.now()
   WHERE id = p_reservation_id;

  RETURN true;
END;
$function$;

CREATE OR REPLACE FUNCTION public.release_athleten_ai_budget(p_reservation_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_reservation public.athleten_ai_budget_reservations%ROWTYPE;
BEGIN
  IF COALESCE(auth.jwt() ->> 'role', '') IS DISTINCT FROM 'service_role' THEN
    RAISE EXCEPTION 'Service role required' USING ERRCODE = '42501';
  END IF;

  IF p_reservation_id IS NULL THEN
    RETURN false;
  END IF;

  SELECT *
    INTO v_reservation
    FROM public.athleten_ai_budget_reservations
   WHERE id = p_reservation_id
   FOR UPDATE;

  IF NOT FOUND THEN
    RETURN false;
  END IF;

  IF v_reservation.status = 'released' THEN
    RETURN true;
  END IF;

  IF v_reservation.status <> 'reserved' THEN
    RETURN false;
  END IF;

  UPDATE public.athleten_ai_budget_monthly
     SET reserved_paise = GREATEST(0, reserved_paise - v_reservation.reserved_paise),
         updated_at = pg_catalog.now()
   WHERE usage_month = v_reservation.usage_month;

  UPDATE public.athleten_ai_budget_reservations
     SET status = 'released',
         settled_at = pg_catalog.now()
   WHERE id = p_reservation_id;

  RETURN true;
END;
$function$;

REVOKE ALL ON FUNCTION public.reserve_athleten_ai_budget(date, integer, integer)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.settle_athleten_ai_budget(uuid, integer)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.release_athleten_ai_budget(uuid)
  FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.reserve_athleten_ai_budget(date, integer, integer) TO service_role;
GRANT EXECUTE ON FUNCTION public.settle_athleten_ai_budget(uuid, integer) TO service_role;
GRANT EXECUTE ON FUNCTION public.release_athleten_ai_budget(uuid) TO service_role;
