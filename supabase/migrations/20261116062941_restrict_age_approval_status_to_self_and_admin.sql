-- Restrict public age-approval status lookups to the current user, platform admins,
-- or trusted service-role callers. Internal workflows use a private helper for
-- checking another participant so that approval gating remains intact.

CREATE OR REPLACE FUNCTION private.user_age_is_approved(p_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO ''
AS $function$
  SELECT EXISTS (
    SELECT 1
    FROM public.age_verifications a
    WHERE a.user_id = p_user_id
      AND a.status IN ('approved', 'not_required')
  )
  OR (
    p_user_id = (SELECT auth.uid())
    AND EXISTS (
      SELECT 1
      FROM private.qa_age_verification_overrides q
      WHERE q.user_id = p_user_id
    )
  );
$function$;

REVOKE ALL ON FUNCTION private.user_age_is_approved(uuid)
  FROM PUBLIC, anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION public.is_age_approved(p_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO ''
AS $function$
  SELECT CASE
    WHEN p_user_id IS NULL THEN false
    WHEN p_user_id = (SELECT auth.uid())
      OR private.is_platform_admin()
      OR coalesce(auth.role(), '') = 'service_role'
      THEN private.user_age_is_approved(p_user_id)
    ELSE false
  END;
$function$;

-- Replace checks on another user's approval with the private lookup. Keep
-- self-checks on the public wrapper so callers and RLS retain scoped behaviour.
DO $migration$
DECLARE
  item record;
  target_oid oid;
  function_definition text;
BEGIN
  FOR item IN
    SELECT *
    FROM (VALUES
      ('academy_add_coach', 'public.is_age_approved(v_coach)'),
      ('academy_create_tournament', 'public.is_age_approved(p_athlete_user_id)'),
      ('academy_create_tournament', 'public.is_age_approved(p_coach_user_id)'),
      ('academy_create_training_group', 'public.is_age_approved(p_coach_user_id)'),
      ('academy_create_training_group', 'public.is_age_approved(v_athlete)'),
      ('add_group_member_by_user', 'public.is_age_approved(p_user_id)'),
      ('coach_add_athlete_by_account_code', 'public.is_age_approved(v_athlete)'),
      ('connect_athlete_by_code', 'public.is_age_approved(v_code.owner_user_id)'),
      ('connect_coach_to_academy_by_code', 'public.is_age_approved(v_code.owner_user_id)'),
      ('create_coach_training_group', 'public.is_age_approved(v_athlete)'),
      ('create_direct_conversation_by_user', 'public.is_age_approved(p_recipient_id)'),
      ('ensure_training_group_conversation', 'public.is_age_approved(NEW.coach_user_id)'),
      ('ensure_training_group_conversation', 'public.is_age_approved(m.athlete_user_id)'),
      ('get_my_connection_code', 'public.is_age_approved(cc.owner_user_id)'),
      ('publish_announcement', 'public.is_age_approved(p.user_id)'),
      ('search_messaging_users', 'public.is_age_approved(p.user_id)'),
      ('sync_training_group_chat_member', 'public.is_age_approved(NEW.athlete_user_id)'),
      ('sync_training_group_chat_member', 'public.is_age_approved(v_coach)')
    ) AS mappings(proname, old_expression)
  LOOP
    SELECT p.oid
      INTO target_oid
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.proname = item.proname;

    IF target_oid IS NULL THEN
      RAISE EXCEPTION 'Expected age-approval caller % was not found', item.proname;
    END IF;

    function_definition := pg_get_functiondef(target_oid);

    IF position(item.old_expression IN function_definition) = 0 THEN
      RAISE EXCEPTION 'Expected expression % was not found in %',
        item.old_expression, item.proname;
    END IF;

    function_definition := replace(
      function_definition,
      item.old_expression,
      replace(item.old_expression, 'public.is_age_approved', 'private.user_age_is_approved')
    );

    EXECUTE function_definition;
  END LOOP;
END;
$migration$;
