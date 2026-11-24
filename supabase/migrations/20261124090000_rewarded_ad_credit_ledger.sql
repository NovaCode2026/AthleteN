-- Rewarded-ad credits are separate from subscription_usage and the platform AI budget.
-- This migration is a candidate only; do not apply it to production until the migration
-- history is reconciled and a reviewed staging replay has passed.

CREATE TABLE IF NOT EXISTS public.reward_ad_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  provider text NOT NULL CHECK (provider = 'admob'),
  custom_data_hash text NOT NULL UNIQUE CHECK (length(custom_data_hash) = 64),
  expires_at timestamptz NOT NULL,
  consumed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS reward_ad_sessions_user_created_idx
  ON public.reward_ad_sessions(user_id, created_at DESC);

CREATE TABLE IF NOT EXISTS public.reward_ledger (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  provider text NOT NULL CHECK (provider IN ('admob', 'achievement', 'admin_adjustment')),
  provider_transaction_id text,
  reward_key text NOT NULL CHECK (reward_key IN ('ai_message')),
  amount integer NOT NULL CHECK (amount <> 0),
  event_type text NOT NULL CHECK (event_type IN ('earned', 'redeemed', 'expired', 'reversed')),
  source_session_id uuid REFERENCES public.reward_ad_sessions(id) ON DELETE RESTRICT,
  expires_at timestamptz,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT reward_ledger_provider_tx_unique UNIQUE(provider, provider_transaction_id),
  CONSTRAINT reward_ledger_metadata_object CHECK (jsonb_typeof(metadata) = 'object')
);

CREATE INDEX IF NOT EXISTS reward_ledger_user_created_idx
  ON public.reward_ledger(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS reward_ledger_user_reward_expiry_idx
  ON public.reward_ledger(user_id, reward_key, expires_at);

ALTER TABLE public.reward_ad_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.reward_ledger ENABLE ROW LEVEL SECURITY;

-- No client policies: all writes and wallet reads are performed by authenticated
-- Netlify functions using the service role after resolving the caller's Auth identity.
REVOKE ALL ON TABLE public.reward_ad_sessions FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON TABLE public.reward_ledger FROM PUBLIC, anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION public.grant_rewarded_ad_credit(
  p_custom_data_hash text,
  p_provider_transaction_id text,
  p_ad_unit text,
  p_reward_item text,
  p_reward_amount integer,
  p_ad_timestamp_ms bigint,
  p_expected_ad_unit text
)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_session public.reward_ad_sessions%ROWTYPE;
  v_now timestamptz := now();
  v_day_start timestamptz := date_trunc('day', now() AT TIME ZONE 'UTC') AT TIME ZONE 'UTC';
  v_month_start timestamptz := date_trunc('month', now() AT TIME ZONE 'UTC') AT TIME ZONE 'UTC';
  v_month_end timestamptz := (date_trunc('month', now() AT TIME ZONE 'UTC') + interval '1 month') AT TIME ZONE 'UTC';
  v_daily_count integer;
  v_monthly_credits integer;
  v_event_id uuid;
BEGIN
  IF coalesce(auth.role(), '') <> 'service_role' THEN
    RAISE EXCEPTION 'Service role required';
  END IF;

  IF p_custom_data_hash IS NULL OR length(p_custom_data_hash) <> 64
     OR p_provider_transaction_id IS NULL OR length(p_provider_transaction_id) NOT BETWEEN 8 AND 200
     OR p_expected_ad_unit IS NULL OR p_ad_unit IS DISTINCT FROM p_expected_ad_unit
     OR p_reward_item IS DISTINCT FROM 'athleten_ai_message'
     OR p_reward_amount IS DISTINCT FROM 2
     OR p_ad_timestamp_ms IS NULL
     OR p_ad_timestamp_ms < (extract(epoch FROM (v_now - interval '24 hours')) * 1000)::bigint
     OR p_ad_timestamp_ms > (extract(epoch FROM (v_now + interval '5 minutes')) * 1000)::bigint THEN
    RETURN 'rejected';
  END IF;

  -- A callback replay is acknowledged but never grants a second credit.
  IF EXISTS (
    SELECT 1 FROM public.reward_ledger
    WHERE provider = 'admob'
      AND provider_transaction_id = p_provider_transaction_id
  ) THEN
    RETURN 'duplicate';
  END IF;

  SELECT * INTO v_session
  FROM public.reward_ad_sessions
  WHERE custom_data_hash = p_custom_data_hash
    AND provider = 'admob'
  FOR UPDATE;

  IF NOT FOUND OR v_session.consumed_at IS NOT NULL OR v_session.expires_at <= v_now THEN
    RETURN 'rejected';
  END IF;

  -- Serialize grants for one user so simultaneous valid callbacks cannot exceed caps.
  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(v_session.user_id::text, 0));

  SELECT count(*)::integer INTO v_daily_count
  FROM public.reward_ledger
  WHERE user_id = v_session.user_id
    AND provider = 'admob'
    AND event_type = 'earned'
    AND created_at >= v_day_start;

  IF v_daily_count >= 3 THEN
    RETURN 'rejected';
  END IF;

  SELECT coalesce(sum(amount), 0)::integer INTO v_monthly_credits
  FROM public.reward_ledger
  WHERE user_id = v_session.user_id
    AND provider = 'admob'
    AND event_type = 'earned'
    AND created_at >= v_month_start
    AND created_at < v_month_end;

  IF v_monthly_credits + 2 > 30 THEN
    RETURN 'rejected';
  END IF;

  INSERT INTO public.reward_ledger(
    user_id, provider, provider_transaction_id, reward_key,
    amount, event_type, source_session_id, expires_at, metadata
  )
  VALUES (
    v_session.user_id, 'admob', p_provider_transaction_id, 'ai_message',
    2, 'earned', v_session.id, v_month_end,
    jsonb_build_object('ad_unit', p_ad_unit, 'reward_item', p_reward_item)
  )
  RETURNING id INTO v_event_id;

  UPDATE public.reward_ad_sessions
  SET consumed_at = v_now
  WHERE id = v_session.id;

  RETURN 'granted';
END;
$function$;

REVOKE ALL ON FUNCTION public.grant_rewarded_ad_credit(text,text,text,text,integer,bigint,text)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.grant_rewarded_ad_credit(text,text,text,text,integer,bigint,text)
  TO service_role;
