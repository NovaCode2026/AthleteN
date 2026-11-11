-- Reapply the canonical direct-conversation pair lock after the route and
-- duplicate-thread fixes. The pair key is sorted so both participants contend
-- on the same transaction-scoped advisory lock.
CREATE OR REPLACE FUNCTION public.create_direct_conversation_by_user(p_recipient_id uuid)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_user uuid := auth.uid();
  v_conversation uuid;
  v_pair_key text;
BEGIN
  IF v_user IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;

  IF NOT public.is_age_approved(v_user) THEN
    RAISE EXCEPTION 'Age approval required before starting conversations';
  END IF;

  IF p_recipient_id IS NULL OR p_recipient_id = v_user THEN
    RAISE EXCEPTION 'Invalid recipient';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.profiles WHERE user_id = p_recipient_id
  ) THEN
    RAISE EXCEPTION 'Recipient not found';
  END IF;

  IF NOT public.is_age_approved(p_recipient_id) THEN
    RAISE EXCEPTION 'Recipient is not available for messaging';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.user_blocks b
    WHERE (b.blocker_user_id = v_user AND b.blocked_user_id = p_recipient_id)
       OR (b.blocker_user_id = p_recipient_id AND b.blocked_user_id = v_user)
  ) THEN
    RAISE EXCEPTION 'Messaging is unavailable between these accounts.';
  END IF;

  v_pair_key := LEAST(v_user::text, p_recipient_id::text)
                || ':' ||
                GREATEST(v_user::text, p_recipient_id::text);

  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(v_pair_key, 0)
  );

  SELECT c.id
    INTO v_conversation
  FROM public.conversations c
  JOIN public.conversation_members m1
    ON m1.conversation_id = c.id AND m1.user_id = v_user
  JOIN public.conversation_members m2
    ON m2.conversation_id = c.id AND m2.user_id = p_recipient_id
  WHERE c.kind = 'direct'
    AND (
      SELECT count(DISTINCT cm.user_id)
      FROM public.conversation_members cm
      WHERE cm.conversation_id = c.id
    ) = 2
  ORDER BY
    (SELECT max(msg.created_at)
     FROM public.messages msg
     WHERE msg.conversation_id = c.id) DESC NULLS LAST,
    c.created_at DESC,
    c.id
  LIMIT 1;

  IF v_conversation IS NOT NULL THEN
    RETURN v_conversation;
  END IF;

  INSERT INTO public.conversations(kind, created_by)
  VALUES ('direct', v_user)
  RETURNING id INTO v_conversation;

  INSERT INTO public.conversation_members(conversation_id, user_id)
  VALUES (v_conversation, v_user), (v_conversation, p_recipient_id);

  RETURN v_conversation;
END;
$function$;

REVOKE ALL ON FUNCTION public.create_direct_conversation_by_user(uuid)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_direct_conversation_by_user(uuid)
  TO authenticated;
