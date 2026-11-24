-- Consume ad-earned AI messages through the same protected AI request and
-- platform-budget path as subscription AI. Bonus credits never change a plan quota.

CREATE OR REPLACE FUNCTION public.reserve_reward_ai_usage(
  p_user_id uuid,
  p_topic text
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_role text;
  v_plan text;
  v_balance integer;
  v_expiry timestamptz;
  v_usage_id uuid;
BEGIN
  IF coalesce(auth.role(), '') <> 'service_role' THEN
    RAISE EXCEPTION 'Service role required';
  END IF;
  IF p_user_id IS NULL OR p_topic IS NULL OR length(btrim(p_topic)) = 0 OR length(p_topic) > 64 THEN
    RETURN NULL;
  END IF;

  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_user_id::text, 0));

  SELECT coalesce(p.role, 'athlete'), coalesce(p.plan_id, 'free')
    INTO v_role, v_plan
  FROM public.profiles p
  WHERE p.user_id = p_user_id
  FOR UPDATE;

  IF NOT FOUND THEN RETURN NULL; END IF;

  IF (v_plan IN ('free', 'student', 'pro', 'elite') AND v_role <> 'athlete')
     OR (v_plan = 'coach' AND v_role <> 'coach')
     OR (v_plan = 'academy' AND v_role <> 'academy_admin') THEN
    RETURN NULL;
  END IF;

  IF v_plan = 'student' AND NOT EXISTS (
    SELECT 1 FROM public.student_verifications sv
    WHERE sv.user_id = p_user_id AND sv.status = 'approved'
  ) THEN
    RETURN NULL;
  END IF;

  SELECT coalesce(sum(l.amount), 0)::integer, min(l.expires_at)
    INTO v_balance, v_expiry
  FROM public.reward_ledger l
  WHERE l.user_id = p_user_id
    AND l.reward_key = 'ai_message'
    AND l.expires_at > now();

  IF v_balance <= 0 THEN RETURN NULL; END IF;

  INSERT INTO public.ai_usage_events(
    user_id, plan_id, topic, tokens_used,
    input_tokens, output_tokens, total_tokens, api_cost_minor
  )
  VALUES (
    p_user_id, v_plan, btrim(p_topic), 0, 0, 0, 0, 0
  )
  RETURNING id INTO v_usage_id;

  INSERT INTO public.reward_ledger(
    user_id, provider, reward_key, amount, event_type, expires_at, metadata
  )
  VALUES (
    p_user_id, 'admob', 'ai_message', -1, 'redeemed', v_expiry,
    jsonb_build_object('usage_event_id', v_usage_id)
  );

  RETURN v_usage_id;
END;
$function$;

CREATE OR REPLACE FUNCTION public.cancel_reward_ai_usage(
  p_usage_id uuid,
  p_user_id uuid
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_redemption public.reward_ledger%ROWTYPE;
  v_created_at timestamptz;
BEGIN
  IF coalesce(auth.role(), '') <> 'service_role' THEN
    RAISE EXCEPTION 'Service role required';
  END IF;
  IF p_usage_id IS NULL OR p_user_id IS NULL THEN RETURN false; END IF;

  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_user_id::text, 0));

  SELECT a.created_at INTO v_created_at
  FROM public.ai_usage_events a
  WHERE a.id = p_usage_id AND a.user_id = p_user_id
    AND a.tokens_used = 0 AND a.created_at >= now() - interval '2 minutes'
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN EXISTS (
      SELECT 1 FROM public.reward_ledger l
      WHERE l.user_id = p_user_id AND l.event_type = 'reversed'
        AND l.metadata ->> 'usage_event_id' = p_usage_id::text
    );
  END IF;

  SELECT l.* INTO v_redemption
  FROM public.reward_ledger l
  WHERE l.user_id = p_user_id AND l.event_type = 'redeemed'
    AND l.metadata ->> 'usage_event_id' = p_usage_id::text
  FOR UPDATE;

  IF NOT FOUND THEN RETURN false; END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.reward_ledger l
    WHERE l.user_id = p_user_id AND l.event_type = 'reversed'
      AND l.metadata ->> 'usage_event_id' = p_usage_id::text
  ) THEN
    INSERT INTO public.reward_ledger(
      user_id, provider, reward_key, amount, event_type, expires_at, metadata
    )
    VALUES (
      p_user_id, v_redemption.provider, v_redemption.reward_key, 1,
      'reversed', v_redemption.expires_at,
      jsonb_build_object('usage_event_id', p_usage_id, 'reverses_ledger_id', v_redemption.id)
    );
  END IF;

  DELETE FROM public.ai_usage_events
  WHERE id = p_usage_id AND user_id = p_user_id AND tokens_used = 0
    AND created_at >= now() - interval '2 minutes';

  RETURN true;
END;
$function$;

REVOKE ALL ON FUNCTION public.reserve_reward_ai_usage(uuid,text)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.reserve_reward_ai_usage(uuid,text)
  TO service_role;

REVOKE ALL ON FUNCTION public.cancel_reward_ai_usage(uuid,uuid)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.cancel_reward_ai_usage(uuid,uuid)
  TO service_role;
