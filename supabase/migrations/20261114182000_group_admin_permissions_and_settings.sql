-- Group ownership, admin delegation and WhatsApp-style group permissions.
-- New migration timestamp follows the repository's documented live ledger head.
ALTER TABLE public.conversation_members
  ADD COLUMN IF NOT EXISTS is_admin boolean NOT NULL DEFAULT false;

ALTER TABLE public.conversations
  ADD COLUMN IF NOT EXISTS group_description text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS only_admins_can_add_members boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS only_admins_can_edit_group_info boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS only_admins_can_send_messages boolean NOT NULL DEFAULT false;

ALTER TABLE public.conversations
  ADD CONSTRAINT conversations_group_description_length_check
  CHECK (char_length(group_description) <= 500);

-- Preserve the creator as owner and make them an admin in all existing groups.
UPDATE public.conversation_members cm
SET is_admin = true
FROM public.conversations c
WHERE c.id = cm.conversation_id
  AND c.kind = 'group'
  AND c.created_by = cm.user_id
  AND cm.is_admin = false;

-- Future group creators are always admins, including auto-created training-group chats.
CREATE OR REPLACE FUNCTION public.set_group_creator_admin()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM public.conversations c
    WHERE c.id = NEW.conversation_id
      AND c.kind = 'group'
      AND c.created_by = NEW.user_id
  ) THEN
    NEW.is_admin := true;
  END IF;
  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS conversation_creator_admin_on_insert ON public.conversation_members;
CREATE TRIGGER conversation_creator_admin_on_insert
BEFORE INSERT ON public.conversation_members
FOR EACH ROW EXECUTE FUNCTION public.set_group_creator_admin();

REVOKE ALL ON FUNCTION public.set_group_creator_admin() FROM PUBLIC, anon, authenticated;

-- Only the group creator can appoint or remove group admins. The owner cannot be demoted.
CREATE OR REPLACE FUNCTION public.set_group_member_admin(
  p_conversation_id uuid,
  p_user_id uuid,
  p_is_admin boolean
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_user uuid := auth.uid();
  v_creator uuid;
BEGIN
  IF v_user IS NULL THEN RAISE EXCEPTION 'Authentication required'; END IF;
  IF NOT public.is_age_approved(v_user) THEN RAISE EXCEPTION 'Age approval required before managing group settings'; END IF;
  SELECT c.created_by INTO v_creator
  FROM public.conversations c
  WHERE c.id = p_conversation_id AND c.kind = 'group'
  FOR UPDATE;
  IF v_creator IS NULL THEN RAISE EXCEPTION 'Group not found'; END IF;
  IF v_creator <> v_user THEN RAISE EXCEPTION 'Only the group creator can appoint or remove group admins'; END IF;
  IF p_user_id IS NULL THEN RAISE EXCEPTION 'Group member is required'; END IF;
  IF p_user_id = v_creator THEN
    IF NOT p_is_admin THEN RAISE EXCEPTION 'The group creator must remain an admin'; END IF;
    RETURN;
  END IF;
  UPDATE public.conversation_members
  SET is_admin = p_is_admin
  WHERE conversation_id = p_conversation_id AND user_id = p_user_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'That user is not a member of this group'; END IF;
END;
$function$;

-- Group admins can update group permissions; the owner is always an admin.
CREATE OR REPLACE FUNCTION public.update_group_settings(
  p_conversation_id uuid,
  p_only_admins_can_add_members boolean DEFAULT NULL,
  p_only_admins_can_edit_group_info boolean DEFAULT NULL,
  p_only_admins_can_send_messages boolean DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_user uuid := auth.uid();
BEGIN
  IF v_user IS NULL THEN RAISE EXCEPTION 'Authentication required'; END IF;
  IF NOT public.is_age_approved(v_user) THEN RAISE EXCEPTION 'Age approval required before changing group settings'; END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.conversations c
    JOIN public.conversation_members cm ON cm.conversation_id = c.id AND cm.user_id = v_user
    WHERE c.id = p_conversation_id AND c.kind = 'group'
      AND (c.created_by = v_user OR cm.is_admin = true)
  ) THEN RAISE EXCEPTION 'Group admin access required'; END IF;

  UPDATE public.conversations
  SET only_admins_can_add_members = COALESCE(p_only_admins_can_add_members, only_admins_can_add_members),
      only_admins_can_edit_group_info = COALESCE(p_only_admins_can_edit_group_info, only_admins_can_edit_group_info),
      only_admins_can_send_messages = COALESCE(p_only_admins_can_send_messages, only_admins_can_send_messages)
  WHERE id = p_conversation_id AND kind = 'group';
END;
$function$;

-- Group name and description can be changed by admins, or by any member when the
-- group admin has explicitly allowed members to edit group information.
CREATE OR REPLACE FUNCTION public.update_group_info(
  p_conversation_id uuid,
  p_name text,
  p_description text DEFAULT ''
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_user uuid := auth.uid();
BEGIN
  IF v_user IS NULL THEN RAISE EXCEPTION 'Authentication required'; END IF;
  IF NOT public.is_age_approved(v_user) THEN RAISE EXCEPTION 'Age approval required before editing group information'; END IF;
  IF p_name IS NULL OR char_length(trim(p_name)) NOT BETWEEN 2 AND 80 THEN
    RAISE EXCEPTION 'Group name must be between 2 and 80 characters';
  END IF;
  IF char_length(coalesce(p_description, '')) > 500 THEN
    RAISE EXCEPTION 'Group description must be 500 characters or fewer';
  END IF;
  IF NOT EXISTS (
    SELECT 1
    FROM public.conversations c
    JOIN public.conversation_members cm ON cm.conversation_id = c.id AND cm.user_id = v_user
    WHERE c.id = p_conversation_id AND c.kind = 'group'
      AND (
        c.only_admins_can_edit_group_info = false
        OR c.created_by = v_user
        OR cm.is_admin = true
      )
  ) THEN RAISE EXCEPTION 'Only group admins can edit group information'; END IF;

  UPDATE public.conversations
  SET name = trim(p_name), group_description = coalesce(p_description, '')
  WHERE id = p_conversation_id AND kind = 'group';
END;
$function$;

-- Existing add-member RPC now respects the group creator's "who can add people" setting.
CREATE OR REPLACE FUNCTION public.add_group_member_by_user(
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
  v_group public.conversations%ROWTYPE;
  v_is_admin boolean;
BEGIN
  IF v_user IS NULL THEN RAISE EXCEPTION 'Authentication required'; END IF;
  IF p_conversation_id IS NULL OR p_user_id IS NULL THEN RAISE EXCEPTION 'Conversation and member are required'; END IF;
  IF NOT public.is_age_approved(v_user) THEN RAISE EXCEPTION 'Age approval required before using messaging'; END IF;

  SELECT * INTO v_group
  FROM public.conversations c
  WHERE c.id = p_conversation_id AND c.kind = 'group';
  IF v_group.id IS NULL THEN RAISE EXCEPTION 'Group not found'; END IF;

  SELECT cm.is_admin INTO v_is_admin
  FROM public.conversation_members cm
  WHERE cm.conversation_id = p_conversation_id AND cm.user_id = v_user;
  IF NOT FOUND THEN RAISE EXCEPTION 'You are not a member of this group'; END IF;

  IF v_group.only_admins_can_add_members AND NOT (v_group.created_by = v_user OR coalesce(v_is_admin, false)) THEN
    RAISE EXCEPTION 'Only group admins can add members';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.profiles p WHERE p.user_id = p_user_id) THEN
    RAISE EXCEPTION 'User not found';
  END IF;
  IF NOT public.is_age_approved(p_user_id) THEN RAISE EXCEPTION 'Member is not available for messaging'; END IF;
  IF EXISTS (
    SELECT 1 FROM public.user_blocks b
    WHERE (b.blocker_user_id = v_user AND b.blocked_user_id = p_user_id)
       OR (b.blocker_user_id = p_user_id AND b.blocked_user_id = v_user)
  ) THEN RAISE EXCEPTION 'Messaging is unavailable between these accounts.'; END IF;

  INSERT INTO public.conversation_members(conversation_id, user_id)
  VALUES (p_conversation_id, p_user_id)
  ON CONFLICT (conversation_id, user_id) DO NOTHING;
END;
$function$;

CREATE OR REPLACE FUNCTION public.add_group_member_by_email(
  p_conversation_id uuid,
  p_email text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_user uuid := auth.uid();
  v_member uuid;
BEGIN
  IF v_user IS NULL THEN RAISE EXCEPTION 'Authentication required'; END IF;
  IF p_email IS NULL OR length(trim(p_email)) NOT BETWEEN 3 AND 320 THEN
    RAISE EXCEPTION 'A valid member email is required';
  END IF;
  SELECT u.id INTO v_member
  FROM auth.users u
  WHERE lower(u.email) = lower(trim(p_email))
  LIMIT 1;
  IF v_member IS NULL THEN RAISE EXCEPTION 'Member account not found'; END IF;
  PERFORM public.add_group_member_by_user(p_conversation_id, v_member);
END;
$function$;

-- Enforce "Only admins can send messages" at the database boundary, not only in the UI.
DROP POLICY IF EXISTS "members can send their own messages" ON public.messages;
CREATE POLICY "members can send their own messages"
ON public.messages
FOR INSERT TO authenticated
WITH CHECK (
  sender_id = (SELECT auth.uid())
  AND (
    private.is_super_admin()
    OR EXISTS (
      SELECT 1
      FROM public.conversation_members cm
      JOIN public.conversations c ON c.id = cm.conversation_id
      WHERE cm.conversation_id = messages.conversation_id
        AND cm.user_id = (SELECT auth.uid())
        AND (
          c.kind = 'direct'
          OR c.only_admins_can_send_messages = false
          OR c.created_by = (SELECT auth.uid())
          OR cm.is_admin = true
        )
    )
  )
  AND (
    (char_length(btrim(coalesce(body, ''))) BETWEEN 1 AND 4000)
    OR attachment_path IS NOT NULL
  )
);

REVOKE ALL ON FUNCTION public.set_group_member_admin(uuid, uuid, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.set_group_member_admin(uuid, uuid, boolean) TO authenticated;
REVOKE ALL ON FUNCTION public.update_group_settings(uuid, boolean, boolean, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.update_group_settings(uuid, boolean, boolean, boolean) TO authenticated;
REVOKE ALL ON FUNCTION public.update_group_info(uuid, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.update_group_info(uuid, text, text) TO authenticated;
REVOKE ALL ON FUNCTION public.add_group_member_by_user(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.add_group_member_by_user(uuid, uuid) TO authenticated;
REVOKE ALL ON FUNCTION public.add_group_member_by_email(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.add_group_member_by_email(uuid, text) TO authenticated;
