CREATE OR REPLACE FUNCTION public.create_direct_conversation_by_username(p_username text)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_recipient uuid;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;

  IF NOT public.is_age_approved(auth.uid()) THEN
    RAISE EXCEPTION 'Age approval required before starting conversations';
  END IF;

  IF nullif(btrim(p_username), '') IS NULL THEN
    RAISE EXCEPTION 'Username is required';
  END IF;

  SELECT p.user_id
    INTO v_recipient
  FROM public.profiles p
  WHERE lower(p.username) = lower(btrim(p_username))
  LIMIT 1;

  IF v_recipient IS NULL THEN
    RAISE EXCEPTION 'User not found';
  END IF;

  RETURN public.create_direct_conversation_by_user(v_recipient);
END;
$function$;

CREATE OR REPLACE FUNCTION public.find_athlete_by_username(p_username text)
RETURNS TABLE(user_id uuid, full_name text, username text, discipline text, belt text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'private'
AS $function$
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;

  IF NOT public.is_age_approved(auth.uid()) THEN
    RETURN;
  END IF;

  RETURN QUERY
    SELECT *
    FROM private.find_athlete_by_username(p_username);
END;
$function$;
