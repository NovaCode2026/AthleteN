-- Per-user private message bookmarks with personal organization metadata.
-- Saved messages are visible only to the saving account and never expose message
-- content through this table. The referenced message is read through normal RLS.
CREATE TABLE IF NOT EXISTS public.messaging_saved_messages (
  owner_user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  message_id uuid NOT NULL REFERENCES public.messages(id) ON DELETE CASCADE,
  label text NOT NULL DEFAULT 'Saved',
  note text,
  saved_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (owner_user_id, message_id),
  CONSTRAINT messaging_saved_messages_label_length
    CHECK (char_length(btrim(label)) BETWEEN 1 AND 40),
  CONSTRAINT messaging_saved_messages_note_length
    CHECK (note IS NULL OR char_length(note) <= 500)
);

CREATE INDEX IF NOT EXISTS messaging_saved_messages_owner_recent_idx
  ON public.messaging_saved_messages(owner_user_id, saved_at DESC);

ALTER TABLE public.messaging_saved_messages ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.messaging_saved_messages FROM PUBLIC, anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.messaging_saved_messages TO authenticated;

DROP POLICY IF EXISTS "Users read their own saved messages" ON public.messaging_saved_messages;
CREATE POLICY "Users read their own saved messages"
ON public.messaging_saved_messages
FOR SELECT TO authenticated
USING (
  owner_user_id = (SELECT auth.uid())
  AND EXISTS (
    SELECT 1
    FROM public.messages m
    JOIN public.conversation_members cm
      ON cm.conversation_id = m.conversation_id
     AND cm.user_id = (SELECT auth.uid())
    WHERE m.id = messaging_saved_messages.message_id
      AND m.deleted_for_everyone_at IS NULL
      AND (m.expires_at IS NULL OR m.expires_at > now())
  )
);

DROP POLICY IF EXISTS "Users save messages in their conversations" ON public.messaging_saved_messages;
CREATE POLICY "Users save messages in their conversations"
ON public.messaging_saved_messages
FOR INSERT TO authenticated
WITH CHECK (
  owner_user_id = (SELECT auth.uid())
  AND public.is_age_approved((SELECT auth.uid()))
  AND EXISTS (
    SELECT 1
    FROM public.messages m
    JOIN public.conversation_members cm
      ON cm.conversation_id = m.conversation_id
     AND cm.user_id = (SELECT auth.uid())
    WHERE m.id = messaging_saved_messages.message_id
      AND m.deleted_for_everyone_at IS NULL
      AND (m.expires_at IS NULL OR m.expires_at > now())
  )
);

DROP POLICY IF EXISTS "Users update their saved message labels" ON public.messaging_saved_messages;
CREATE POLICY "Users update their saved message labels"
ON public.messaging_saved_messages
FOR UPDATE TO authenticated
USING (
  owner_user_id = (SELECT auth.uid())
  AND public.is_age_approved((SELECT auth.uid()))
  AND EXISTS (
    SELECT 1
    FROM public.messages m
    JOIN public.conversation_members cm
      ON cm.conversation_id = m.conversation_id
     AND cm.user_id = (SELECT auth.uid())
    WHERE m.id = messaging_saved_messages.message_id
      AND m.deleted_for_everyone_at IS NULL
      AND (m.expires_at IS NULL OR m.expires_at > now())
  )
)
WITH CHECK (
  owner_user_id = (SELECT auth.uid())
  AND public.is_age_approved((SELECT auth.uid()))
  AND EXISTS (
    SELECT 1
    FROM public.messages m
    JOIN public.conversation_members cm
      ON cm.conversation_id = m.conversation_id
     AND cm.user_id = (SELECT auth.uid())
    WHERE m.id = messaging_saved_messages.message_id
      AND m.deleted_for_everyone_at IS NULL
      AND (m.expires_at IS NULL OR m.expires_at > now())
  )
);

DROP POLICY IF EXISTS "Users unsave their own messages" ON public.messaging_saved_messages;
CREATE POLICY "Users unsave their own messages"
ON public.messaging_saved_messages
FOR DELETE TO authenticated
USING (owner_user_id = (SELECT auth.uid()));

-- A global tombstone must also retire private bookmarks so they cannot
-- remain as inaccessible orphan rows after a user cannot view the source.
CREATE OR REPLACE FUNCTION public.remove_saved_message_bookmarks_on_global_delete()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
BEGIN
  IF OLD.deleted_for_everyone_at IS NULL
     AND NEW.deleted_for_everyone_at IS NOT NULL THEN
    DELETE FROM public.messaging_saved_messages
    WHERE message_id = NEW.id;
  END IF;
  RETURN NEW;
END;
$function$;

REVOKE ALL ON FUNCTION public.remove_saved_message_bookmarks_on_global_delete() FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS messages_remove_saved_bookmarks_after_global_delete ON public.messages;
CREATE TRIGGER messages_remove_saved_bookmarks_after_global_delete
AFTER UPDATE OF deleted_for_everyone_at ON public.messages
FOR EACH ROW
WHEN (OLD.deleted_for_everyone_at IS NULL AND NEW.deleted_for_everyone_at IS NOT NULL)
EXECUTE FUNCTION public.remove_saved_message_bookmarks_on_global_delete();

COMMENT ON TABLE public.messaging_saved_messages IS
  'Private per-user bookmarks and labels. It contains no message plaintext and is cascaded when its source message is deleted.';
