-- Enforce verified account, age/guardian approval and one-time trial
-- rules at the database boundary. Do not apply to production until migration
-- history reconciliation and isolated replay approval are complete.

CREATE OR REPLACE FUNCTION public.activate_trial_after_payment(
  p_user_id uuid,
  p_plan_id text,
  p_provider text,
  p_payment_reference text,
  p_amount_paise integer DEFAULT 900
)
RETURNS public.account_entitlements
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_row public.account_entitlements;
  v_now timestamptz := pg_catalog.now();
  v_end timestamptz;
  v_role text;
  v_academy_id uuid;
  v_email_confirmed_at timestamptz;
  v_latest_student_status text;
BEGIN
  IF p_user_id IS NULL THEN
    RAISE EXCEPTION 'USER_REQUIRED';
  END IF;
  IF auth.uid() IS NOT NULL AND auth.uid() IS DISTINCT FROM p_user_id THEN
    RAISE EXCEPTION 'TRIAL_USER_MISMATCH';
  END IF;
  IF p_plan_id IS NULL OR p_plan_id NOT IN ('student', 'pro', 'elite', 'coach', 'academy') THEN
    RAISE EXCEPTION 'INVALID_TRIAL_PLAN';
  END IF;
  IF p_provider IS NULL OR p_provider NOT IN ('razorpay', 'stripe', 'cashfree') THEN
    RAISE EXCEPTION 'INVALID_TRIAL_PROVIDER';
  END IF;
  IF p_amount_paise IS DISTINCT FROM 900 THEN
    RAISE EXCEPTION 'INVALID_TRIAL_AMOUNT';
  END IF;
  IF p_payment_reference IS NULL OR pg_catalog.btrim(p_payment_reference) = '' THEN
    RAISE EXCEPTION 'TRIAL_PAYMENT_REFERENCE_REQUIRED';
  END IF;

  IF NOT public.is_age_approved(p_user_id) THEN
    RAISE EXCEPTION 'AGE_OR_GUARDIAN_APPROVAL_REQUIRED';
  END IF;

  SELECT u.email_confirmed_at
    INTO v_email_confirmed_at
    FROM auth.users u
   WHERE u.id = p_user_id;
  IF v_email_confirmed_at IS NULL THEN
    RAISE EXCEPTION 'EMAIL_VERIFICATION_REQUIRED';
  END IF;

  SELECT p.role, p.academy_id
    INTO v_role, v_academy_id
    FROM public.profiles p
   WHERE p.user_id = p_user_id;
  IF v_role IS NULL THEN
    RAISE EXCEPTION 'PROFILE_NOT_FOUND';
  END IF;

  IF p_plan_id IN ('student', 'pro', 'elite') AND v_role <> 'athlete' THEN
    RAISE EXCEPTION 'ATHLETE_TRIAL_REQUIRES_ATHLETE_ROLE';
  ELSIF p_plan_id = 'coach' AND v_role <> 'coach' THEN
    RAISE EXCEPTION 'COACH_TRIAL_REQUIRES_COACH_ROLE';
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
      RAISE EXCEPTION 'ACADEMY_TRIAL_NOT_VERIFIED';
    END IF;
  END IF;

  IF p_plan_id = 'student' THEN
    SELECT sv.status
      INTO v_latest_student_status
      FROM public.student_verifications sv
     WHERE sv.user_id = p_user_id
     ORDER BY sv.created_at DESC, sv.id DESC
     LIMIT 1;
    IF v_latest_student_status IS DISTINCT FROM 'approved' THEN
      RAISE EXCEPTION 'STUDENT_NOT_VERIFIED';
    END IF;
  END IF;

  SELECT *
    INTO v_row
    FROM public.account_entitlements
   WHERE user_id = p_user_id
   FOR UPDATE;

  IF NOT FOUND THEN
    INSERT INTO public.account_entitlements (
      user_id, selected_plan_id, trial_fee_paise, trial_payment_status, updated_at
    )
    VALUES (p_user_id, 'free', 900, 'not_required', v_now)
    RETURNING * INTO v_row;
  END IF;

  IF v_row.trial_claimed_at IS NOT NULL THEN
    RETURN v_row;
  END IF;

  v_end := v_now + interval '7 days';

  UPDATE public.account_entitlements
     SET trial_fee_paise = 900,
         trial_payment_status = 'paid',
         trial_payment_provider = p_provider,
         trial_payment_reference = p_payment_reference,
         selected_plan_id = p_plan_id,
         trial_claimed_at = v_now,
         trial_plan_id = p_plan_id,
         trial_started_at = v_now,
         trial_ends_at = v_end,
         updated_at = v_now
   WHERE user_id = p_user_id
   RETURNING * INTO v_row;

  INSERT INTO public.subscriptions (
    user_id, plan_id, provider, provider_subscription_id, status,
    current_period_end, cancel_at_period_end, updated_at
  )
  VALUES (
    p_user_id, p_plan_id, p_provider, p_payment_reference, 'trialing',
    v_end, false, v_now
  )
  ON CONFLICT (user_id, plan_id) DO UPDATE
    SET provider = EXCLUDED.provider,
        provider_subscription_id = EXCLUDED.provider_subscription_id,
        status = 'trialing',
        current_period_end = EXCLUDED.current_period_end,
        cancel_at_period_end = false,
        updated_at = EXCLUDED.updated_at;

  RETURN v_row;
END;
$function$;

REVOKE ALL ON FUNCTION public.activate_trial_after_payment(uuid, text, text, text, integer)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.activate_trial_after_payment(uuid, text, text, text, integer)
  TO service_role;
