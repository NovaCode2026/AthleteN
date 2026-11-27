-- Aggregate the complete wallet in PostgreSQL and provide stable keyset history pages.
-- Candidate migration only: reconcile migration history and replay in isolated staging first.

CREATE OR REPLACE FUNCTION public.get_reward_wallet_summary(
  p_user_id uuid
)
RETURNS TABLE (
  balance integer,
  daily_ads_used integer,
  daily_ads_limit integer,
  monthly_ad_credits_earned integer,
  monthly_ad_credits_limit integer
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_balance integer := 0;
  v_daily_ads_used integer := 0;
  v_monthly_ad_credits integer := 0;
  v_day_start timestamptz := date_trunc('day', now() AT TIME ZONE 'UTC') AT TIME ZONE 'UTC';
  v_month_start timestamptz := date_trunc('month', now() AT TIME ZONE 'UTC') AT TIME ZONE 'UTC';
  v_month_end timestamptz := (date_trunc('month', now() AT TIME ZONE 'UTC') + interval '1 month') AT TIME ZONE 'UTC';
BEGIN
  IF coalesce(auth.role(), '') <> 'service_role' THEN
    RAISE EXCEPTION 'Service role required';
  END IF;
  IF p_user_id IS NULL THEN
    RETURN;
  END IF;

  SELECT
    coalesce(sum(l.amount) FILTER (
      WHERE l.expires_at IS NULL OR l.expires_at > now()
    ), 0)::integer,
    count(*) FILTER (
      WHERE l.provider = 'admob'
        AND l.event_type = 'earned'
        AND l.created_at >= v_day_start
    )::integer,
    coalesce(sum(l.amount) FILTER (
      WHERE l.provider = 'admob'
        AND l.event_type = 'earned'
        AND l.created_at >= v_month_start
        AND l.created_at < v_month_end
    ), 0)::integer
  INTO v_balance, v_daily_ads_used, v_monthly_ad_credits
  FROM public.reward_ledger l
  WHERE l.user_id = p_user_id;

  RETURN QUERY
  SELECT greatest(v_balance, 0), v_daily_ads_used, 3, v_monthly_ad_credits, 30;
END;
$function$;

REVOKE ALL ON FUNCTION public.get_reward_wallet_summary(uuid)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_reward_wallet_summary(uuid)
  TO service_role;

COMMENT ON FUNCTION public.get_reward_wallet_summary(uuid) IS
  'Returns an aggregate across the complete server-owned reward ledger; callable only by service_role.';
