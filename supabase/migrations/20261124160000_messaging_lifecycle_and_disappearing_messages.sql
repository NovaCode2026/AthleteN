-- Messaging lifecycle hardening: expiring messages, attachment cleanup queue,
-- sender-authorized deletion of all attachment types, and group member removal.
-- Candidate migration only. Reconcile the live migration ledger and replay this
-- migration in an isolated staging database before any production application.

ALTER TABLE public.conversations
  ADD COLUMN IF NOT EXISTS disappearing_messages_after_seconds integer NOT NULL DEFAULT 0;

DO $constraint$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'conversations_disappearing_ttl_allowed'
      AND conrelid = 'public.conversations'::regclass
  ) THEN
    ALTER TABLE public.conversations
      ADD CONSTRAINT conversations_disappearing_ttl_allowed
      CHECK (disappearing_messages_after_seconds IN (0, 86400, 604800, 2592000, 7776000));
  END IF;
END
$constraint$;

ALTER TABLE public.messages
  ADD COLUMN IF NOT EXISTS expires_at timestamptz;

CREATE INDEX IF NOT EXISTS messages_expiry_due_idx
  ON public.messages (expires_at)
  WHERE expires_at IS NOT NULL;

-- A private, service-role-only queue lets message deletion and TTL expiry remove
-- actual Storage objects without exposing the queue or service credentials to clients.
CREATE TABLE IF NOT EXISTS public.messaging_attachment_cleanup_queue (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  bucket_id text NOT NULL DEFAULT 'message-attachments'
    CHECK (bucket_id = 'message-attachments'),
  object_path text NOT NULL UNIQUE,
  message_id uuid REFERENCES public.messages(id) ON DELETE SET NULL,
  requested_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  reason text NOT NULL CHECK (reason IN ('deleted_for_everyone', 'expired')),
  requested_at timestamptz NOT NULL DEFAULT now(),
  attempts integer NOT NULL DEFAULT 0 CHECK (attempts >= 0),
  last_attempt_at timestamptz,
  completed_at timestamptz,
  last_error text
);

ALTER TABLE public.messaging_attachment_cleanup_queue ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.messaging_attachment_cleanup_queue FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.messaging_attachment_cleanup_queue TO service_role;

CREATE OR REPLACE FUNCTION public.set_message_expiry_from_conversation()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_ttl integer;
BEGIN
  SELECT c.disappearing_messages_after_seconds
    INTO v_ttl
  FROM public.conversations c
  WHERE c.id = NEW.conversation_id;

  IF coalesce(v_ttl, 0) > 0 THEN
    NEW.expires_at := coalesce(NEW.created_at, now()) + make_interval(secs => v_ttl);
  ELSE
    NEW.expires_at := NULL;
  END IF;

  RETURN NEW;
END;
$function$;

REVOKE ALL ON FUNCTION public.set_message_expiry_from_conversation() FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS messages_set_expiry_before_insert ON public.messages;
CREATE TRIGGER messages_set_expiry_before_insert
  BEFORE INSERT ON public.messages
  FOR EACH ROW
  EXECUTE FUNCTION public.set_message_expiry_from_conversation();

CREATE OR REPLACE FUNCTION public.queue_message_attachment_cleanup_before_delete()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
BEGIN
  IF OLD.attachment_path IS NOT NULL AND btrim(OLD.attachment_path) <> '' THEN
    INSERT INTO public.messaging_attachment_cleanup_queue (
      bucket_id, object_path, message_id, requested_by, reason
    )
    VALUES (
      'message-attachments', OLD.attachment_path, OLD.id, auth.uid(), 'expired'
    )
    ON CONFLICT (object_path) DO NOTHING;
  END IF;
  RETURN OLD;
END;
$function$;

REVOKE ALL ON FUNCTION public.queue_message_attachment_cleanup_before_delete() FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS messages_queue_attachment_cleanup_before_delete ON public.messages;
CREATE TRIGGER messages_queue_attachment_cleanup_before_delete
  BEFORE DELETE ON public.messages
  FOR EACH ROW
  EXECUTE FUNCTION public.queue_message_attachment_cleanup_before_delete();

CREATE OR REPLACE FUNCTION public.set_conversation_disappearing_messages(
  p_conversation_id uuid,
  p_after_seconds integer
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_user uuid := auth.uid();
  v_kind text;
  v_created_by uuid;
  v_is_admin boolean;
BEGIN
  IF v_user IS NULL THEN RAISE EXCEPTION 'Authentication required'; END IF;
  IF NOT public.is_age_approved(v_user) THEN
    RAISE EXCEPTION 'Age approval is required before changing message expiry settings';
  END IF;
  IF p_conversation_id IS NULL THEN RAISE EXCEPTION 'Conversation is required'; END IF;
  IF p_after_seconds IS NULL OR p_after_seconds NOT IN (0, 86400, 604800, 2592000, 7776000) THEN
    RAISE EXCEPTION 'Choose Never, 24 hours, 7 days, 30 days, or 90 days';
  END IF;

  SELECT c.kind, c.created_by, cm.is_admin
    INTO v_kind, v_created_by, v_is_admin
  FROM public.conversations c
  JOIN public.conversation_members cm
    ON cm.conversation_id = c.id AND cm.user_id = v_user
  WHERE c.id = p_conversation_id
  FOR UPDATE OF c;

  IF v_kind IS NULL THEN RAISE EXCEPTION 'Conversation not found or access denied'; END IF;
  IF v_kind = 'group' AND v_created_by <> v_user AND NOT coalesce(v_is_admin, false) THEN
    RAISE EXCEPTION 'Only group admins can change disappearing-message settings';
  END IF;

  UPDATE public.conversations
  SET disappearing_messages_after_seconds = p_after_seconds
  WHERE id = p_conversation_id;
END;
$function$;

REVOKE ALL ON FUNCTION public.set_conversation_disappearing_messages(uuid, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.set_conversation_disappearing_messages(uuid, integer) TO authenticated;

-- Delete text and attachment messages for everyone. The object is queued for
-- private Storage removal before the database reference is cleared.
CREATE OR REPLACE FUNCTION public.delete_message_for_everyone(p_message_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_user uuid := auth.uid();
  v_message public.messages%ROWTYPE;
BEGIN
  IF v_user IS NULL THEN RAISE EXCEPTION 'Authentication required'; END IF;
  IF NOT public.is_age_approved(v_user) THEN
    RAISE EXCEPTION 'Age approval required before deleting messages';
  END IF;
  IF p_message_id IS NULL THEN RAISE EXCEPTION 'Message is required'; END IF;

  SELECT * INTO v_message
  FROM public.messages m
  WHERE m.id = p_message_id
  FOR UPDATE;

  IF v_message.id IS NULL THEN RAISE EXCEPTION 'Message not found'; END IF;
  IF v_message.sender_id <> v_user THEN
    RAISE EXCEPTION 'Only the sender can delete this message for everyone';
  END IF;
  IF NOT public.is_conversation_member(v_message.conversation_id) THEN
    RAISE EXCEPTION 'Conversation access denied';
  END IF;
  IF v_message.deleted_for_everyone_at IS NOT NULL THEN RETURN; END IF;
  IF v_message.expires_at IS NOT NULL AND v_message.expires_at <= now() THEN
    RAISE EXCEPTION 'This message has already expired';
  END IF;
  IF v_message.created_at < now() - interval '15 minutes' THEN
    RAISE EXCEPTION 'Messages can only be deleted for everyone for 15 minutes after sending';
  END IF;

  IF v_message.attachment_path IS NOT NULL AND btrim(v_message.attachment_path) <> '' THEN
    INSERT INTO public.messaging_attachment_cleanup_queue (
      bucket_id, object_path, message_id, requested_by, reason
    )
    VALUES (
      'message-attachments', v_message.attachment_path, v_message.id, v_user, 'deleted_for_everyone'
    )
    ON CONFLICT (object_path) DO NOTHING;
  END IF;

  UPDATE public.messages
  SET body = 'This message was deleted',
      message_type = 'normal',
      edited_at = NULL,
      deleted_for_everyone_at = now(),
      attachment_path = NULL,
      attachment_name = NULL,
      attachment_type = NULL,
      attachment_size = NULL
  WHERE id = p_message_id;
END;
$function$;

REVOKE ALL ON FUNCTION public.delete_message_for_everyone(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.delete_message_for_everyone(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.record_messaging_attachment_cleanup_failure(
  p_queue_id uuid,
  p_error text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
BEGIN
  UPDATE public.messaging_attachment_cleanup_queue
  SET attempts = attempts + 1,
      last_attempt_at = now(),
      last_error = left(coalesce(nullif(btrim(p_error), ''), 'Storage removal failed'), 500)
  WHERE id = p_queue_id
    AND completed_at IS NULL;
END;
$function$;

REVOKE ALL ON FUNCTION public.record_messaging_attachment_cleanup_failure(uuid, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.record_messaging_attachment_cleanup_failure(uuid, text) TO service_role;

-- Expired rows are hidden immediately by RLS and physically purged in bounded
-- batches by the service-role cleanup worker. The DELETE trigger queues media.
CREATE OR REPLACE FUNCTION public.cleanup_expired_messages(p_batch_size integer DEFAULT 500)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_deleted integer;
  v_limit integer := least(greatest(coalesce(p_batch_size, 500), 1), 1000);
BEGIN
  WITH due AS (
    SELECT m.id
    FROM public.messages m
    WHERE m.expires_at IS NOT NULL
      AND m.expires_at <= now()
    ORDER BY m.expires_at ASC
    LIMIT v_limit
    FOR UPDATE SKIP LOCKED
  )
  DELETE FROM public.messages m
  USING due
  WHERE m.id = due.id;

  GET DIAGNOSTICS v_deleted = ROW_COUNT;
  RETURN v_deleted;
END;
$function$;

REVOKE ALL ON FUNCTION public.cleanup_expired_messages(integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.cleanup_expired_messages(integer) TO service_role;

-- A group creator or group admin may remove ordinary members. Only the creator
-- may remove another admin; nobody can remove the creator through this RPC.
CREATE OR REPLACE FUNCTION public.remove_group_member(
  p_conversation_id uuid,
  p_user_id uuid
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_user uuid := auth.uid();
  v_creator uuid;
  v_actor_is_admin boolean;
  v_target_is_admin boolean;
BEGIN
  IF v_user IS NULL THEN RAISE EXCEPTION 'Authentication required'; END IF;
  IF NOT public.is_age_approved(v_user) THEN
    RAISE EXCEPTION 'Age approval is required before managing group members';
  END IF;
  IF p_conversation_id IS NULL OR p_user_id IS NULL THEN
    RAISE EXCEPTION 'Group and member are required';
  END IF;
  IF p_user_id = v_user THEN
    RAISE EXCEPTION 'Use Leave Group to remove your own account';
  END IF;

  SELECT c.created_by, actor.is_admin, target.is_admin
    INTO v_creator, v_actor_is_admin, v_target_is_admin
  FROM public.conversations c
  JOIN public.conversation_members actor
    ON actor.conversation_id = c.id AND actor.user_id = v_user
  JOIN public.conversation_members target
    ON target.conversation_id = c.id AND target.user_id = p_user_id
  WHERE c.id = p_conversation_id AND c.kind = 'group'
  FOR UPDATE OF c;

  IF v_creator IS NULL THEN RAISE EXCEPTION 'Group or member not found'; END IF;
  IF v_creator <> v_user AND NOT coalesce(v_actor_is_admin, false) THEN
    RAISE EXCEPTION 'Group admin access required';
  END IF;
  IF p_user_id = v_creator THEN RAISE EXCEPTION 'The group creator cannot be removed'; END IF;
  IF coalesce(v_target_is_admin, false) AND v_creator <> v_user THEN
    RAISE EXCEPTION 'Only the group creator can remove another group admin';
  END IF;

  DELETE FROM public.conversation_members
  WHERE conversation_id = p_conversation_id AND user_id = p_user_id;
END;
$function$;

REVOKE ALL ON FUNCTION public.remove_group_member(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.remove_group_member(uuid, uuid) TO authenticated;

-- Expired messages are not readable even if an ordinary conversation-member
-- or support-linked administrator SELECT policy would otherwise allow access.
DROP POLICY IF EXISTS "members can read messages" ON public.messages;
CREATE POLICY "members can read messages"
ON public.messages
AS PERMISSIVE
FOR SELECT TO authenticated
USING (
  (expires_at IS NULL OR expires_at > now())
  AND EXISTS (
    SELECT 1
    FROM public.conversation_members cm
    WHERE cm.conversation_id = messages.conversation_id
      AND cm.user_id = (SELECT auth.uid())
  )
);

DROP POLICY IF EXISTS "support-linked admin message read" ON public.messages;
CREATE POLICY "support-linked admin message read"
ON public.messages
FOR SELECT TO authenticated
USING (
  (expires_at IS NULL OR expires_at > now())
  AND public.is_platform_admin()
  AND EXISTS (
    SELECT 1
    FROM public.support_tickets st
    WHERE st.conversation_id = messages.conversation_id
      AND st.status <> 'closed'
  )
);

-- A Storage object is readable only while a live message references it and the
-- caller remains a member of that conversation. Signed URLs cannot outlive the
-- short signed-URL TTL already used by both clients, but already-issued URLs may
-- remain valid until their own expiry.
DROP POLICY IF EXISTS "message attachment read by conversation member" ON storage.objects;
CREATE POLICY "message attachment read by conversation member"
ON storage.objects
FOR SELECT TO authenticated
USING (
  bucket_id = 'message-attachments'
  AND EXISTS (
    SELECT 1
    FROM public.messages m
    JOIN public.conversation_members cm
      ON cm.conversation_id = m.conversation_id
     AND cm.user_id = (SELECT auth.uid())
    WHERE m.attachment_path = objects.name
      AND m.deleted_for_everyone_at IS NULL
      AND (m.expires_at IS NULL OR m.expires_at > now())
  )
);

COMMENT ON COLUMN public.conversations.disappearing_messages_after_seconds IS
  'Expiry policy for newly inserted messages: 0, 86400, 604800, 2592000, or 7776000 seconds.';
COMMENT ON COLUMN public.messages.expires_at IS
  'Server-assigned expiry timestamp derived from the conversation TTL at message insertion.';
COMMENT ON TABLE public.messaging_attachment_cleanup_queue IS
  'Private service-role work queue for removing attachment objects after global deletion or TTL expiry.';
