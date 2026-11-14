-- Disambiguate the Storage object's name from conversations.name in avatar policies.
-- Without this qualification, the inner conversations alias captures the unqualified name.
DROP POLICY IF EXISTS "group admins can upload group avatars" ON storage.objects;
CREATE POLICY "group admins can upload group avatars"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (
  bucket_id = 'group-avatars'
  AND EXISTS (
    SELECT 1
    FROM public.conversations c
    JOIN public.conversation_members cm ON cm.conversation_id = c.id
    WHERE c.id::text = (storage.foldername(objects.name))[1]
      AND c.kind = 'group'
      AND cm.user_id = (SELECT auth.uid())
      AND (
        c.created_by = (SELECT auth.uid())
        OR cm.is_admin = true
        OR c.only_admins_can_edit_group_info = false
      )
  )
);

DROP POLICY IF EXISTS "group admins can replace group avatars" ON storage.objects;
CREATE POLICY "group admins can replace group avatars"
ON storage.objects FOR UPDATE TO authenticated
USING (
  bucket_id = 'group-avatars'
  AND EXISTS (
    SELECT 1
    FROM public.conversations c
    JOIN public.conversation_members cm ON cm.conversation_id = c.id
    WHERE c.id::text = (storage.foldername(objects.name))[1]
      AND c.kind = 'group'
      AND cm.user_id = (SELECT auth.uid())
      AND (
        c.created_by = (SELECT auth.uid())
        OR cm.is_admin = true
        OR c.only_admins_can_edit_group_info = false
      )
  )
)
WITH CHECK (
  bucket_id = 'group-avatars'
  AND EXISTS (
    SELECT 1
    FROM public.conversations c
    JOIN public.conversation_members cm ON cm.conversation_id = c.id
    WHERE c.id::text = (storage.foldername(objects.name))[1]
      AND c.kind = 'group'
      AND cm.user_id = (SELECT auth.uid())
      AND (
        c.created_by = (SELECT auth.uid())
        OR cm.is_admin = true
        OR c.only_admins_can_edit_group_info = false
      )
  )
);

DROP POLICY IF EXISTS "group admins can delete group avatars" ON storage.objects;
CREATE POLICY "group admins can delete group avatars"
ON storage.objects FOR DELETE TO authenticated
USING (
  bucket_id = 'group-avatars'
  AND EXISTS (
    SELECT 1
    FROM public.conversations c
    JOIN public.conversation_members cm ON cm.conversation_id = c.id
    WHERE c.id::text = (storage.foldername(objects.name))[1]
      AND c.kind = 'group'
      AND cm.user_id = (SELECT auth.uid())
      AND (
        c.created_by = (SELECT auth.uid())
        OR cm.is_admin = true
        OR c.only_admins_can_edit_group_info = false
      )
  )
);
