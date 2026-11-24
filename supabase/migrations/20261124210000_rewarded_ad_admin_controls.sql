-- Admin visibility and an irreversible emergency pause for new rewarded-ad sessions.
-- This is a candidate migration: replay only in isolated staging after migration-history review.

CREATE TABLE IF NOT EXISTS public.reward_ad_controls (
  singleton boolean PRIMARY KEY DEFAULT true CHECK (singleton = true),
  paused_at timestamptz,
  paused_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  pause_reason text,
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT reward_ad_controls_pause_reason_length CHECK (
    pause_reason IS NULL OR char_length(pause_reason) <= 300
  )
);

INSERT INTO public.reward_ad_controls(singleton)
VALUES (true)
ON CONFLICT (singleton) DO NOTHING;

CREATE TABLE IF NOT EXISTS public.reward_ad_admin_audit (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  action text NOT NULL CHECK (action IN ('paused')),
  reason text NOT NULL CHECK (char_length(reason) BETWEEN 1 AND 300),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS reward_ad_admin_audit_created_idx
  ON public.reward_ad_admin_audit(created_at DESC);

ALTER TABLE public.reward_ad_controls ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.reward_ad_admin_audit ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.reward_ad_controls FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON TABLE public.reward_ad_admin_audit FROM PUBLIC, anon, authenticated, service_role;

-- Netlify server functions can only read the pause state; they cannot clear it.
CREATE OR REPLACE FUNCTION public.is_rewarded_ads_paused()
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_paused boolean;
BEGIN
  IF coalesce(auth.role(), '') <> 'service_role' THEN
    RAISE EXCEPTION 'Service role required';
  END IF;
  SELECT c.paused_at IS NOT NULL INTO v_paused
  FROM public.reward_ad_controls c
  WHERE c.singleton = true;
  RETURN coalesce(v_paused, false);
END;
$function$;

REVOKE ALL ON FUNCTION public.is_rewarded_ads_paused() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.is_rewarded_ads_paused() TO service_role;

-- Admins can pause new sessions. There is deliberately no client-facing unpause
-- operation: resuming ads requires a separate adult-owned release review.
CREATE OR REPLACE FUNCTION public.pause_rewarded_ads(p_reason text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_actor uuid := auth.uid();
  v_reason text := left(trim(coalesce(p_reason, '')), 300);
  v_paused_at timestamptz;
  v_was_paused boolean;
BEGIN
  IF v_actor IS NULL OR coalesce(auth.role(), '') <> 'authenticated' THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.profiles p
    WHERE p.user_id = v_actor AND p.role IN ('admin', 'super_admin')
  ) THEN
    RAISE EXCEPTION 'Administrator access required';
  END IF;
  IF char_length(v_reason) < 5 THEN
    RAISE EXCEPTION 'Provide a pause reason of at least five characters';
  END IF;

  SELECT paused_at IS NOT NULL INTO v_was_paused
  FROM public.reward_ad_controls
  WHERE singleton = true
  FOR UPDATE;

  UPDATE public.reward_ad_controls
  SET paused_at = coalesce(paused_at, now()),
      paused_by = coalesce(paused_by, v_actor),
      pause_reason = coalesce(pause_reason, v_reason),
      updated_at = now()
  WHERE singleton = true
  RETURNING paused_at INTO v_paused_at;

  IF NOT coalesce(v_was_paused, false) THEN
    INSERT INTO public.reward_ad_admin_audit(actor_user_id, action, reason)
    VALUES (v_actor, 'paused', v_reason);
  END IF;

  RETURN jsonb_build_object('paused', true, 'pausedAt', v_paused_at);
END;
$function$;

REVOKE ALL ON FUNCTION public.pause_rewarded_ads(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.pause_rewarded_ads(text) TO authenticated;

-- One authenticated, admin-checked read model for the console. Raw ledger tables
-- remain inaccessible to browser roles.
CREATE OR REPLACE FUNCTION public.get_reward_admin_overview()
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_actor uuid := auth.uid();
  v_control public.reward_ad_controls%ROWTYPE;
  v_today_start timestamptz := date_trunc('day', now() AT TIME ZONE 'UTC') AT TIME ZONE 'UTC';
  v_month_start timestamptz := date_trunc('month', now() AT TIME ZONE 'UTC') AT TIME ZONE 'UTC';
  v_month_end timestamptz := (date_trunc('month', now() AT TIME ZONE 'UTC') + interval '1 month') AT TIME ZONE 'UTC';
  v_earned_today integer := 0;
  v_credits_earned_month integer := 0;
  v_credits_redeemed_month integer := 0;
  v_recent_events jsonb := '[]'::jsonb;
  v_recent_actions jsonb := '[]'::jsonb;
BEGIN
  IF v_actor IS NULL OR coalesce(auth.role(), '') <> 'authenticated' THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.profiles p
    WHERE p.user_id = v_actor AND p.role IN ('admin', 'super_admin')
  ) THEN
    RAISE EXCEPTION 'Administrator access required';
  END IF;

  SELECT * INTO v_control FROM public.reward_ad_controls WHERE singleton = true;
  SELECT
    count(*) FILTER (WHERE provider = 'admob' AND event_type = 'earned' AND created_at >= v_today_start)::integer,
    coalesce(sum(amount) FILTER (WHERE provider = 'admob' AND event_type = 'earned' AND created_at >= v_month_start AND created_at < v_month_end), 0)::integer,
    coalesce(sum(-amount) FILTER (WHERE event_type = 'redeemed' AND created_at >= v_month_start AND created_at < v_month_end), 0)::integer
  INTO v_earned_today, v_credits_earned_month, v_credits_redeemed_month
  FROM public.reward_ledger;

  SELECT coalesce(jsonb_agg(item ORDER BY created_at DESC), '[]'::jsonb)
  INTO v_recent_events
  FROM (
    SELECT jsonb_build_object(
      'id', l.id, 'userId', l.user_id, 'provider', l.provider,
      'transactionId', l.provider_transaction_id, 'amount', l.amount,
      'eventType', l.event_type, 'createdAt', l.created_at, 'expiresAt', l.expires_at
    ) AS item, l.created_at
    FROM public.reward_ledger l
    ORDER BY l.created_at DESC
    LIMIT 50
  ) recent;

  SELECT coalesce(jsonb_agg(item ORDER BY created_at DESC), '[]'::jsonb)
  INTO v_recent_actions
  FROM (
    SELECT jsonb_build_object(
      'id', a.id, 'actorUserId', a.actor_user_id, 'action', a.action,
      'reason', a.reason, 'createdAt', a.created_at
    ) AS item, a.created_at
    FROM public.reward_ad_admin_audit a
    ORDER BY a.created_at DESC
    LIMIT 20
  ) recent;

  RETURN jsonb_build_object(
    'paused', coalesce(v_control.paused_at IS NOT NULL, false),
    'pausedAt', v_control.paused_at,
    'pausedBy', v_control.paused_by,
    'pauseReason', v_control.pause_reason,
    'earnedToday', v_earned_today,
    'creditsEarnedThisMonth', v_credits_earned_month,
    'creditsRedeemedThisMonth', v_credits_redeemed_month,
    'recentEvents', v_recent_events,
    'recentAdminActions', v_recent_actions
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.get_reward_admin_overview() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_reward_admin_overview() TO authenticated;

COMMENT ON FUNCTION public.get_reward_admin_overview() IS
  'Admin-only aggregate and recent reward audit view; raw reward tables remain private.';
COMMENT ON FUNCTION public.pause_rewarded_ads(text) IS
  'One-way emergency pause for new rewarded-ad sessions. Resume requires separate adult-owned release review.';
