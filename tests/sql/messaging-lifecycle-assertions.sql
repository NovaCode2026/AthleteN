\set ON_ERROR_STOP on

-- Direct conversation TTL applies to new messages only, and the database owns expires_at.
SET ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','10000000-0000-4000-8000-000000000001',false);
SELECT public.set_conversation_disappearing_messages(
  '20000000-0000-4000-8000-000000000001', 86400
);
INSERT INTO public.messages(id,conversation_id,sender_id,body,created_at)
VALUES (
  '30000000-0000-4000-8000-000000000001',
  '20000000-0000-4000-8000-000000000001',
  auth.uid(), 'expires tomorrow', now()
);
INSERT INTO public.messaging_saved_messages(owner_user_id,message_id,label,note)
VALUES (auth.uid(),'30000000-0000-4000-8000-000000000001','Tournament','Review before the next competition');

DO $$
DECLARE v_expiry timestamptz;
BEGIN
  SELECT expires_at INTO v_expiry
  FROM public.messages WHERE id='30000000-0000-4000-8000-000000000001';
  IF v_expiry IS NULL OR v_expiry < now() + interval '23 hours' OR v_expiry > now() + interval '25 hours' THEN
    RAISE EXCEPTION 'New message did not receive the server-assigned 24-hour expiry';
  END IF;
END
$$;

-- Saved-message rows are private to their owner, even when another account
-- belongs to the same direct conversation.
SELECT set_config('request.jwt.claim.sub','10000000-0000-4000-8000-000000000002',false);
DO $$
DECLARE v_count integer;
BEGIN
  SELECT count(*) INTO v_count FROM public.messaging_saved_messages;
  IF v_count <> 0 THEN RAISE EXCEPTION 'Another participant can read a private saved-message row'; END IF;
END
$$;
SELECT set_config('request.jwt.claim.sub','10000000-0000-4000-8000-000000000001',false);
DO $$
DECLARE v_label text; v_note text;
BEGIN
  SELECT label,note INTO v_label,v_note FROM public.messaging_saved_messages
  WHERE message_id='30000000-0000-4000-8000-000000000001';
  IF v_label <> 'Tournament' OR v_note <> 'Review before the next competition' THEN
    RAISE EXCEPTION 'Owner cannot read saved-message organization metadata';
  END IF;
END
$$;

-- Sender can delete attachment messages for everyone within the sender window.
INSERT INTO public.messages(
  id,conversation_id,sender_id,body,attachment_path,attachment_name,attachment_type,attachment_size,created_at
) VALUES (
  '30000000-0000-4000-8000-000000000002',
  '20000000-0000-4000-8000-000000000001',
  auth.uid(), '', '20000000-0000-4000-8000-000000000001/file.mp4',
  'file.mp4', 'video/mp4', 1234, now()
);
INSERT INTO public.messaging_saved_messages(owner_user_id,message_id,label)
VALUES (auth.uid(),'30000000-0000-4000-8000-000000000002','Video reference');
DO $$
DECLARE v_deleted integer;
BEGIN
  DELETE FROM storage.objects
  WHERE bucket_id='message-attachments'
    AND name='20000000-0000-4000-8000-000000000001/file.mp4';
  GET DIAGNOSTICS v_deleted = ROW_COUNT;
  IF v_deleted <> 0 THEN
    RAISE EXCEPTION 'Uploader directly deleted an attachment still referenced by a live message';
  END IF;
END
$$;
SELECT public.delete_message_for_everyone('30000000-0000-4000-8000-000000000002');

-- Inspect service-role-only cleanup queue as the database owner, not the client role.
RESET ROLE;
DO $$
DECLARE v_path text; v_deleted timestamptz; v_queued integer;
BEGIN
  SELECT attachment_path, deleted_for_everyone_at INTO v_path, v_deleted
  FROM public.messages WHERE id='30000000-0000-4000-8000-000000000002';
  IF EXISTS (SELECT 1 FROM public.messaging_saved_messages
    WHERE message_id='30000000-0000-4000-8000-000000000002') THEN
    RAISE EXCEPTION 'Global deletion did not remove private bookmarks for the message';
  END IF;
  SELECT count(*) INTO v_queued
  FROM public.messaging_attachment_cleanup_queue
  WHERE object_path='20000000-0000-4000-8000-000000000001/file.mp4'
    AND reason='deleted_for_everyone';
  IF v_path IS NOT NULL OR v_deleted IS NULL OR v_queued <> 1 THEN
    RAISE EXCEPTION 'Attachment deletion did not tombstone and enqueue the object';
  END IF;
END
$$;
SET ROLE authenticated;

-- A regular group member cannot change the group TTL; an appointed admin can.
SELECT set_config('request.jwt.claim.sub','10000000-0000-4000-8000-000000000003',false);
DO $$
BEGIN
  BEGIN
    PERFORM public.set_conversation_disappearing_messages('20000000-0000-4000-8000-000000000002', 604800);
    RAISE EXCEPTION 'Non-admin changed group disappearing-message settings';
  EXCEPTION WHEN raise_exception THEN
    IF SQLERRM = 'Non-admin changed group disappearing-message settings' THEN RAISE; END IF;
  END;
END
$$;

SELECT set_config('request.jwt.claim.sub','10000000-0000-4000-8000-000000000002',false);
SELECT public.set_conversation_disappearing_messages('20000000-0000-4000-8000-000000000002', 604800);
SELECT public.remove_group_member('20000000-0000-4000-8000-000000000002','10000000-0000-4000-8000-000000000003');

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM public.conversation_members
    WHERE conversation_id='20000000-0000-4000-8000-000000000002'
      AND user_id='10000000-0000-4000-8000-000000000003'
  ) THEN RAISE EXCEPTION 'Group admin could not remove ordinary member'; END IF;
END
$$;

-- Creator leaves by transferring ownership to a current group admin.
SELECT set_config('request.jwt.claim.sub','10000000-0000-4000-8000-000000000001',false);
SELECT public.leave_group_conversation(
  '20000000-0000-4000-8000-000000000002',
  '10000000-0000-4000-8000-000000000002'
);
RESET ROLE;
DO $$
DECLARE v_creator uuid; v_creator_membership integer; v_new_owner_admin boolean;
BEGIN
  SELECT created_by INTO v_creator FROM public.conversations
  WHERE id='20000000-0000-4000-8000-000000000002';
  SELECT count(*) INTO v_creator_membership FROM public.conversation_members
  WHERE conversation_id='20000000-0000-4000-8000-000000000002'
    AND user_id='10000000-0000-4000-8000-000000000001';
  SELECT is_admin INTO v_new_owner_admin FROM public.conversation_members
  WHERE conversation_id='20000000-0000-4000-8000-000000000002'
    AND user_id='10000000-0000-4000-8000-000000000002';
  IF v_creator <> '10000000-0000-4000-8000-000000000002'
     OR v_creator_membership <> 0
     OR NOT coalesce(v_new_owner_admin,false) THEN
    RAISE EXCEPTION 'Group creator could not transfer ownership safely';
  END IF;
END
$$;

-- A final owner may leave and delete a group once it has no remaining members.
SET ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','10000000-0000-4000-8000-000000000002',false);
SELECT public.leave_group_conversation('20000000-0000-4000-8000-000000000002',NULL);
RESET ROLE;
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM public.conversations
    WHERE id='20000000-0000-4000-8000-000000000002') THEN
    RAISE EXCEPTION 'An empty group was not deleted when its final member left';
  END IF;
END
$$;

RESET ROLE;

-- Expired messages are not visible to ordinary conversation members and are
-- physically removed by the service-role worker, with attachments queued.
UPDATE public.messages
SET expires_at = now() - interval '1 second',
    attachment_path = '20000000-0000-4000-8000-000000000001/expired.pdf',
    attachment_name = 'expired.pdf',
    attachment_type = 'application/pdf'
WHERE id='30000000-0000-4000-8000-000000000001';

SET ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','10000000-0000-4000-8000-000000000002',false);
DO $$
DECLARE v_count integer;
BEGIN
  SELECT count(*) INTO v_count FROM public.messages
  WHERE id='30000000-0000-4000-8000-000000000001';
  IF v_count <> 0 THEN RAISE EXCEPTION 'Expired message remained readable through RLS'; END IF;
END
$$;
RESET ROLE;

-- Even the legacy super-admin permissive policy cannot reveal expired messages.
SET ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','10000000-0000-4000-8000-000000000003',false);
DO $$
DECLARE v_count integer;
BEGIN
  SELECT count(*) INTO v_count FROM public.messages
  WHERE id='30000000-0000-4000-8000-000000000001';
  IF v_count <> 0 THEN RAISE EXCEPTION 'Restrictive expiry guard was bypassed by a permissive admin policy'; END IF;
END
$$;
RESET ROLE;

SET ROLE service_role;
SELECT public.cleanup_expired_messages(100);
DO $$
DECLARE v_count integer;
BEGIN
  SELECT count(*) INTO v_count FROM public.messages
  WHERE id='30000000-0000-4000-8000-000000000001';
  IF v_count <> 0 THEN RAISE EXCEPTION 'Expiry cleanup did not delete expired message'; END IF;
  SELECT count(*) INTO v_count FROM public.messaging_attachment_cleanup_queue
  WHERE object_path='20000000-0000-4000-8000-000000000001/expired.pdf';
  IF v_count <> 1 THEN RAISE EXCEPTION 'Expiry cleanup did not queue attachment deletion'; END IF;
END
$$;
RESET ROLE;
DO $$
DECLARE v_saved_count integer;
BEGIN
  SELECT count(*) INTO v_saved_count FROM public.messaging_saved_messages
  WHERE message_id='30000000-0000-4000-8000-000000000001';
  IF v_saved_count <> 0 THEN RAISE EXCEPTION 'Saved-message metadata was not removed with its expired source message'; END IF;
END
$$;
