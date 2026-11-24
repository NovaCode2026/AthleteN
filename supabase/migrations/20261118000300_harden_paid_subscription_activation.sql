-- Payment activation must be re-authorized at the database boundary.
ALTER TABLE public.subscriptions
  ADD COLUMN IF NOT EXISTS cancel_at_period_end boolean NOT NULL DEFAULT false;

-- Apply only after local/remote Supabase migration history is reconciled and
-- the complete schema has been validated on an isolated Supabase/PostgreSQL stack.

CREATE UNIQUE INDEX IF NOT EXISTS payment_events_provider_event_id_uidx
  ON public.payment_events(provider, provider_event_id)
  WHERE provider_event_id IS NOT NULL AND btrim(provider_event_id) <> '';

CREATE OR REPLACE FUNCTION public.activate_paid_subscription(
  p_user_id uuid,
  p_plan_id text,
  p_provider text,
  p_provider_customer_id text DEFAULT NULL,
  p_provider_subscription_id text DEFAULT NULL,
  p_current_period_end timestamptz DEFAULT NULL
)
RETURNS public.subscriptions
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_result public.subscriptions;
  v_role text;
  v_academy_id uuid;
BEGIN
  IF p_user_id IS NULL OR p_plan_id IS NULL THEN
    RAISE EXCEPTION 'USER_AND_PLAN_REQUIRED';
  END IF;

  IF p_provider IS NULL OR p_provider NOT IN ('razorpay', 'stripe', 'cashfree', 'manual') THEN
    RAISE EXCEPTION 'INVALID_PAYMENT_PROVIDER';
  END IF;

  IF p_current_period_end IS NULL OR p_current_period_end <= pg_catalog.now() THEN
    RAISE EXCEPTION 'VALID_SUBSCRIPTION_PERIOD_REQUIRED';
  END IF;

  IF NOT public.is_age_approved(p_user_id) THEN
    RAISE EXCEPTION 'AGE_OR_GUARDIAN_APPROVAL_REQUIRED';
  END IF;

  SELECT p.role, p.academy_id
    INTO v_role, v_academy_id
    FROM public.profiles p
   WHERE p.user_id = p_user_id;

  IF v_role IS NULL THEN
    RAISE EXCEPTION 'PROFILE_NOT_FOUND';
  END IF;

  IF p_plan_id = 'student' THEN
    IF v_role <> 'athlete' OR (
      SELECT sv.status
        FROM public.student_verifications sv
       WHERE sv.user_id = p_user_id
       ORDER BY sv.created_at DESC
       LIMIT 1
    ) IS DISTINCT FROM 'approved' THEN
      RAISE EXCEPTION 'STUDENT_NOT_VERIFIED';
    END IF;
  ELSIF p_plan_id IN ('pro', 'elite') AND v_role <> 'athlete' THEN
    RAISE EXCEPTION 'ATHLETE_PLAN_REQUIRES_ATHLETE_ROLE';
  ELSIF p_plan_id = 'coach' AND v_role <> 'coach' THEN
    RAISE EXCEPTION 'COACH_PLAN_REQUIRES_COACH_ROLE';
  ELSIF p_plan_id = 'academy' THEN
    IF v_role <> 'academy_admin'
       OR v_academy_id IS NULL
       OR NOT EXISTS (
         SELECT 1
           FROM public.academies a
          WHERE a.id = v_academy_id
            AND a.owner_user_id = p_user_id
            AND a.status = 'active'
            AND a.setup_completed = true
            AND a.contact_email_verified_at IS NOT NULL
       ) THEN
      RAISE EXCEPTION 'ACADEMY_NOT_VERIFIED';
    END IF;
  ELSIF p_plan_id NOT IN ('student', 'pro', 'elite', 'coach', 'academy') THEN
    RAISE EXCEPTION 'INVALID_PAID_PLAN';
  END IF;

  INSERT INTO public.subscriptions AS current_subscription (
    user_id, plan_id, provider, provider_customer_id,
    provider_subscription_id, status, current_period_end
  )
  VALUES (
    p_user_id, p_plan_id, p_provider, p_provider_customer_id,
    p_provider_subscription_id, 'active', p_current_period_end
  )
  ON CONFLICT (user_id, plan_id) DO UPDATE
    SET provider = EXCLUDED.provider,
        provider_customer_id = EXCLUDED.provider_customer_id,
        provider_subscription_id = EXCLUDED.provider_subscription_id,
        status = 'active',
        current_period_end = EXCLUDED.current_period_end,
        cancel_at_period_end = CASE
          WHEN current_subscription.provider_subscription_id IS NOT NULL
           AND current_subscription.provider_subscription_id IS NOT DISTINCT FROM EXCLUDED.provider_subscription_id
            THEN current_subscription.cancel_at_period_end
          ELSE false
        END,
        updated_at = pg_catalog.now()
  RETURNING * INTO v_result;

  UPDATE public.profiles
     SET plan_id = p_plan_id, updated_at = pg_catalog.now()
   WHERE user_id = p_user_id;

  INSERT INTO public.account_entitlements (user_id, selected_plan_id, updated_at)
  VALUES (p_user_id, p_plan_id, pg_catalog.now())
  ON CONFLICT (user_id) DO UPDATE
    SET selected_plan_id = EXCLUDED.selected_plan_id,
        updated_at = EXCLUDED.updated_at;

  RETURN v_result;
END;
$function$;

REVOKE ALL ON FUNCTION public.activate_paid_subscription(uuid, text, text, text, text, timestamptz)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.activate_paid_subscription(uuid, text, text, text, text, timestamptz)
  TO service_role;
