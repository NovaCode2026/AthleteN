-- Consolidate duplicate direct threads without losing messages or related records.
-- The canonical thread is selected deterministically: newest message, then newest thread.
-- This migration runs transactionally as part of the migration runner.

DO $migration$
DECLARE
  pair_row record;
  canonical_id uuid;
  duplicate_ids uuid[];
BEGIN
  FOR pair_row IN
    SELECT array_agg(cm.user_id ORDER BY cm.user_id::text) AS member_ids
    FROM public.conversations c
    JOIN public.conversation_members cm ON cm.conversation_id = c.id
    WHERE c.kind = 'direct'
    GROUP BY c.id
    HAVING count(DISTINCT cm.user_id) = 2
  LOOP
    -- Lock by unordered member pair so this reconciliation cannot race with
    -- create_direct_conversation_by_user for the same pair.
    PERFORM pg_catalog.pg_advisory_xact_lock(
      pg_catalog.hashtextextended(
        pair_row.member_ids[1]::text || ':' || pair_row.member_ids[2]::text,
        0
      )
    );

    SELECT
      (array_agg(c.id ORDER BY
        (SELECT max(m.created_at) FROM public.messages m WHERE m.conversation_id = c.id) DESC NULLS LAST,
        c.created_at DESC,
        c.id
      ))[1],
      (array_agg(c.id ORDER BY
        (SELECT max(m.created_at) FROM public.messages m WHERE m.conversation_id = c.id) DESC NULLS LAST,
        c.created_at DESC,
        c.id
      ))[2:]
    INTO canonical_id, duplicate_ids
    FROM public.conversations c
    WHERE c.kind = 'direct'
      AND (
        SELECT array_agg(cm.user_id ORDER BY cm.user_id::text)
        FROM public.conversation_members cm
        WHERE cm.conversation_id = c.id
      ) = pair_row.member_ids
    HAVING count(*) > 1;

    IF canonical_id IS NULL OR coalesce(cardinality(duplicate_ids), 0) = 0 THEN
      CONTINUE;
    END IF;

    -- Preserve a participant's hidden state if any duplicate thread was hidden.
    INSERT INTO public.messaging_hidden_conversations(user_id, conversation_id, hidden_at)
    SELECT h.user_id, canonical_id, min(h.hidden_at)
    FROM public.messaging_hidden_conversations h
    WHERE h.conversation_id = ANY(duplicate_ids)
    GROUP BY h.user_id
    ON CONFLICT (user_id, conversation_id) DO NOTHING;

    -- Preserve references used by support and training-group workflows.
    UPDATE public.message_reports
      SET conversation_id = canonical_id
      WHERE conversation_id = ANY(duplicate_ids);
    UPDATE public.support_tickets
      SET conversation_id = canonical_id
      WHERE conversation_id = ANY(duplicate_ids);
    UPDATE public.training_groups
      SET conversation_id = canonical_id
      WHERE conversation_id = ANY(duplicate_ids);

    -- Message IDs remain stable, so delivery/read receipts and notification
    -- message references remain valid. Attachment paths are not rewritten.
    UPDATE public.messages
      SET conversation_id = canonical_id
      WHERE conversation_id = ANY(duplicate_ids);

    DELETE FROM public.conversations
      WHERE id = ANY(duplicate_ids);
  END LOOP;
END;
$migration$;
