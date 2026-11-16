-- Keep AI request quotas and token/cost metering server-authoritative.
-- The Netlify AI endpoint uses the service-role client for reserve/cancel/write.
-- Authenticated clients retain SELECT access through existing owner/admin RLS.

CREATE OR REPLACE FUNCTION public.reserve_ai_usage(
  p_user_id uuid,
  p_plan_id text,
  p_topic text,
  p_monthly_limit integer
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_month_start date := date_trunc('month', now() AT TIME ZONE 'UTC')::date;
  v_plan text;
  v_role text;
  v_status text;
  v_period_end timestamptz;
  v_subscription_id uuid;
  v_limit integer;
  v_used integer;
  v_id uuid;
BEGIN
  IF coalesce(auth.role(), '') <> 'service_role' THEN
    RAISE EXCEPTION 'Service role required';
  END IF;

  IF p_user_id IS NULL
     OR p_topic IS NULL
     OR length(btrim(p_topic)) = 0
     OR length(p_topic) > 64 THEN
    RETURN NULL;
  END IF;

  SELECT
    coalesce(e.selected_plan_id, p.plan_id, 'free'),
    p.role,
    s.status,
    s.current_period_end,
    s.id
  INTO
    v_plan,
    v_role,
    v_status,
    v_period_end,
    v_subscription_id
  FROM public.profiles p
  LEFT JOIN public.account_entitlements e
    ON e.user_id = p.user_id
  LEFT JOIN LATERAL (
    SELECT sub.id, sub.status, sub.current_period_end
    FROM public.subscriptions sub
    WHERE sub.user_id = p.user_id
      AND sub.plan_id = coalesce(e.selected_plan_id, p.plan_id, 'free')
    ORDER BY sub.created_at DESC
    LIMIT 1
  ) s ON true
  WHERE p.user_id = p_user_id;

  IF NOT FOUND THEN
    RETURN NULL;
  END IF;

  v_limit := public.athleten_plan_ai_limit(v_plan);

  IF (v_plan IN ('student', 'pro', 'elite') AND v_role IS DISTINCT FROM 'athlete')
     OR (v_plan = 'coach' AND v_role IS DISTINCT FROM 'coach')
     OR (v_plan = 'academy' AND v_role IS DISTINCT FROM 'academy_admin') THEN
    v_limit := 0;
  END IF;

  IF v_plan <> 'free'
     AND (
       coalesce(v_status, '') NOT IN ('active', 'trialing')
       OR (v_period_end IS NOT NULL AND v_period_end <= now())
     ) THEN
    v_limit := 0;
  END IF;

  IF v_plan = 'student'
     AND NOT EXISTS (
       SELECT 1
       FROM public.student_verifications sv
       WHERE sv.user_id = p_user_id
         AND sv.status = 'approved'
     ) THEN
    v_limit := 0;
  END IF;

  IF v_limit <= 0 THEN
    RETURN NULL;
  END IF;

  INSERT INTO public.subscription_usage(
    user_id, subscription_id, usage_month,
    ai_requests_used, ai_requests_limit
  )
  VALUES (
    p_user_id, v_subscription_id, v_month_start, 0, v_limit
  )
  ON CONFLICT (user_id, usage_month)
  DO UPDATE SET
    subscription_id = excluded.subscription_id,
    ai_requests_limit = excluded.ai_requests_limit,
    updated_at = now();

  SELECT su.ai_requests_used
    INTO v_used
  FROM public.subscription_usage su
  WHERE su.user_id = p_user_id
    AND su.usage_month = v_month_start
  FOR UPDATE;

  IF v_used >= v_limit THEN
    RETURN NULL;
  END IF;

  UPDATE public.subscription_usage
  SET ai_requests_used = ai_requests_used + 1,
      updated_at = now()
  WHERE user_id = p_user_id
    AND usage_month = v_month_start;

  INSERT INTO public.ai_usage_events(
    user_id, plan_id, topic, tokens_used,
    input_tokens, output_tokens, total_tokens, api_cost_minor
  )
  VALUES (
    p_user_id, v_plan, btrim(p_topic), 0, 0, 0, 0, 0
  )
  RETURNING id INTO v_id;

  RETURN v_id;
END;
$function$;

CREATE OR REPLACE FUNCTION public.cancel_ai_usage(
  p_usage_id uuid,
  p_user_id uuid
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_created_at timestamptz;
  v_deleted_count integer;
BEGIN
  IF coalesce(auth.role(), '') <> 'service_role' THEN
    RAISE EXCEPTION 'Service role required';
  END IF;

  IF p_usage_id IS NULL OR p_user_id IS NULL THEN
    RETURN false;
  END IF;

  SELECT a.created_at
    INTO v_created_at
  FROM public.ai_usage_events a
  WHERE a.id = p_usage_id
    AND a.user_id = p_user_id
    AND a.tokens_used = 0
    AND a.created_at >= now() - interval '2 minutes'
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN false;
  END IF;

  DELETE FROM public.ai_usage_events
  WHERE id = p_usage_id
    AND user_id = p_user_id
    AND tokens_used = 0
    AND created_at >= now() - interval '2 minutes';

  GET DIAGNOSTICS v_deleted_count = ROW_COUNT;

  IF v_deleted_count <> 1 THEN
    RETURN false;
  END IF;

  UPDATE public.subscription_usage
  SET ai_requests_used = greatest(ai_requests_used - 1, 0),
      updated_at = now()
  WHERE user_id = p_user_id
    AND usage_month = date_trunc('month', v_created_at AT TIME ZONE 'UTC')::date;

  RETURN true;
END;
$function$;

REVOKE ALL ON FUNCTION public.reserve_ai_usage(uuid, text, text, integer)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.reserve_ai_usage(uuid, text, text, integer)
  TO service_role;

REVOKE ALL ON FUNCTION public.cancel_ai_usage(uuid, uuid)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.cancel_ai_usage(uuid, uuid)
  TO service_role;

REVOKE ALL ON FUNCTION public.record_ai_usage(uuid, integer, integer, integer)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.record_ai_usage(uuid, integer, integer, integer)
  TO service_role;

REVOKE INSERT, UPDATE, DELETE ON TABLE public.ai_usage_events
  FROM anon, authenticated;
GRANT SELECT ON TABLE public.ai_usage_events TO authenticated;

DROP POLICY IF EXISTS ai_usage_insert_reservation ON public.ai_usage_events;
DROP POLICY IF EXISTS ai_usage_update_reservation ON public.ai_usage_events;
