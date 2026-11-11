-- Route the legacy email-based direct-message RPC through the canonical,
-- concurrency-safe user-id RPC so every entry point resolves the same thread.

CREATE OR REPLACE FUNCTION public.create_direct_conversation(p_recipient_email text)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_user uuid := auth.uid();
  v_recipient uuid;
BEGIN
  IF v_user IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;

  IF NOT public.is_age_approved(v_user) THEN
    RAISE EXCEPTION 'Age approval required before starting conversations';
  END IF;

  IF p_recipient_email IS NULL
     OR length(btrim(p_recipient_email)) NOT BETWEEN 3 AND 320 THEN
    RAISE EXCEPTION 'A valid recipient email is required';
  END IF;

  SELECT u.id
    INTO v_recipient
  FROM auth.users u
  WHERE lower(u.email) = lower(btrim(p_recipient_email))
  LIMIT 1;

  IF v_recipient IS NULL THEN
    RAISE EXCEPTION 'Recipient account not found';
  END IF;

  IF v_recipient = v_user THEN
    RAISE EXCEPTION 'You cannot message yourself';
  END IF;

  RETURN public.create_direct_conversation_by_user(v_recipient);
END;
$function$;

REVOKE ALL ON FUNCTION public.create_direct_conversation(text)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_direct_conversation(text)
  TO authenticated;
