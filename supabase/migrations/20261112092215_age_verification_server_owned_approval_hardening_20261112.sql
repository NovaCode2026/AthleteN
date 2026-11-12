DROP POLICY IF EXISTS "users can create own age verification" ON public.age_verifications;
DROP POLICY IF EXISTS "users can update own age verification" ON public.age_verifications;

REVOKE ALL PRIVILEGES ON TABLE public.age_verifications FROM PUBLIC, anon, authenticated;
GRANT SELECT ON TABLE public.age_verifications TO authenticated;

REVOKE ALL PRIVILEGES ON FUNCTION public.prepare_parent_approval(text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.prepare_parent_approval(text) TO service_role;

CREATE OR REPLACE FUNCTION public.record_age_profile(
  p_date_of_birth date,
  p_parent_email text
)
RETURNS TABLE(status text, age_years integer)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  v_user_id uuid := auth.uid();
  v_age integer;
  v_status text;
  v_existing_dob date;
  v_parent text := lower(btrim(coalesce(p_parent_email, '')));
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;

  IF p_date_of_birth IS NULL OR p_date_of_birth > current_date THEN
    RAISE EXCEPTION 'A valid date of birth is required.';
  END IF;

  v_age := extract(year FROM age(current_date, p_date_of_birth));
  IF v_age < 0 OR v_age > 120 THEN
    RAISE EXCEPTION 'Date of birth is outside the supported range.';
  END IF;

  IF v_age < 18 THEN
    IF v_parent !~* '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$' THEN
      RAISE EXCEPTION 'A valid parent or guardian email is required for users under 18.';
    END IF;
  END IF;

  INSERT INTO public.age_verifications (
    user_id, date_of_birth, parent_email, status, token_hash,
    token_expires_at, approved_at, rejected_at, updated_at
  )
  VALUES (
    v_user_id, p_date_of_birth, nullif(v_parent, ''),
    CASE WHEN v_age < 18 THEN 'pending' ELSE 'not_required' END,
    NULL, NULL, CASE WHEN v_age >= 18 THEN now() ELSE NULL END, NULL, now()
  )
  ON CONFLICT (user_id) DO NOTHING;

  SELECT a.date_of_birth, a.status
    INTO v_existing_dob, v_status
    FROM public.age_verifications a
   WHERE a.user_id = v_user_id
   FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Age verification record could not be created.';
  END IF;

  IF v_existing_dob IS DISTINCT FROM p_date_of_birth THEN
    RAISE EXCEPTION 'Date of birth is already recorded and cannot be changed through this flow. Contact AthleteN support for a correction.';
  END IF;

  IF v_age < 18 AND v_status = 'not_required' THEN
    UPDATE public.age_verifications
       SET parent_email = v_parent,
           status = 'pending',
           token_hash = NULL,
           token_expires_at = NULL,
           approved_at = NULL,
           rejected_at = NULL,
           updated_at = now()
     WHERE user_id = v_user_id;
    v_status := 'pending';
  ELSIF v_age >= 18 AND v_status = 'pending' THEN
    UPDATE public.age_verifications
       SET status = 'not_required',
           token_hash = NULL,
           token_expires_at = NULL,
           approved_at = now(),
           rejected_at = NULL,
           updated_at = now()
     WHERE user_id = v_user_id;
    v_status := 'not_required';
  END IF;

  RETURN QUERY SELECT v_status, v_age;
END;
$function$;

REVOKE ALL ON FUNCTION public.record_age_profile(date, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.record_age_profile(date, text) TO authenticated;
