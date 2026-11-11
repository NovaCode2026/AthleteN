-- Remove circular RLS policy evaluation across training groups, members,
-- sessions, and attendance. All helper functions derive caller identity from
-- auth.uid() and are executable only by authenticated users.

CREATE OR REPLACE FUNCTION private.is_training_group_coach(p_group_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $function$
  SELECT auth.uid() IS NOT NULL
     AND EXISTS (
       SELECT 1
       FROM public.training_groups g
       WHERE g.id = p_group_id
         AND g.coach_user_id = auth.uid()
     );
$function$;

CREATE OR REPLACE FUNCTION private.is_active_training_group_member(p_group_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $function$
  SELECT auth.uid() IS NOT NULL
     AND EXISTS (
       SELECT 1
       FROM public.training_group_members m
       WHERE m.group_id = p_group_id
         AND m.athlete_user_id = auth.uid()
         AND m.status = 'active'
     );
$function$;

CREATE OR REPLACE FUNCTION private.is_academy_admin_for_training_group(p_group_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $function$
  SELECT auth.uid() IS NOT NULL
     AND EXISTS (
       SELECT 1
       FROM public.training_groups g
       JOIN public.profiles coach_profile
         ON coach_profile.user_id = g.coach_user_id
       JOIN public.academy_memberships am
         ON am.academy_id = coach_profile.academy_id
       WHERE g.id = p_group_id
         AND am.user_id = auth.uid()
         AND am.status = 'active'
         AND am.role = 'academy_admin'
     );
$function$;

CREATE OR REPLACE FUNCTION private.is_academy_admin_for_training_session(p_session_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $function$
  SELECT auth.uid() IS NOT NULL
     AND EXISTS (
       SELECT 1
       FROM public.training_group_sessions s
       JOIN public.training_groups g ON g.id = s.group_id
       JOIN public.profiles coach_profile
         ON coach_profile.user_id = g.coach_user_id
       JOIN public.academy_memberships am
         ON am.academy_id = coach_profile.academy_id
       WHERE s.id = p_session_id
         AND am.user_id = auth.uid()
         AND am.status = 'active'
         AND am.role = 'academy_admin'
     );
$function$;

CREATE OR REPLACE FUNCTION private.can_manage_training_group_attendance(
  p_session_id uuid,
  p_athlete_user_id uuid
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $function$
  SELECT auth.uid() IS NOT NULL
     AND p_athlete_user_id IS NOT NULL
     AND EXISTS (
       SELECT 1
       FROM public.training_group_sessions s
       JOIN public.training_groups g ON g.id = s.group_id
       JOIN public.training_group_members m
         ON m.group_id = g.id
        AND m.athlete_user_id = p_athlete_user_id
        AND m.status = 'active'
       WHERE s.id = p_session_id
         AND g.coach_user_id = auth.uid()
     );
$function$;

REVOKE ALL ON FUNCTION private.is_training_group_coach(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION private.is_active_training_group_member(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION private.is_academy_admin_for_training_group(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION private.is_academy_admin_for_training_session(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION private.can_manage_training_group_attendance(uuid, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION private.is_training_group_coach(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION private.is_active_training_group_member(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION private.is_academy_admin_for_training_group(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION private.is_academy_admin_for_training_session(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION private.can_manage_training_group_attendance(uuid, uuid) TO authenticated;

DROP POLICY IF EXISTS "Academy staff can view linked training groups" ON public.training_groups;
DROP POLICY IF EXISTS "coach manages own training groups" ON public.training_groups;
DROP POLICY IF EXISTS "members can view training groups" ON public.training_groups;
CREATE POLICY "Academy staff can view linked training groups"
  ON public.training_groups FOR SELECT TO authenticated
  USING (private.is_academy_admin_for_training_group(id));
CREATE POLICY "coach manages own training groups"
  ON public.training_groups FOR ALL TO authenticated
  USING (coach_user_id = (SELECT auth.uid()))
  WITH CHECK (coach_user_id = (SELECT auth.uid()));
CREATE POLICY "members can view training groups"
  ON public.training_groups FOR SELECT TO authenticated
  USING (private.is_active_training_group_member(id));

DROP POLICY IF EXISTS "Academy staff can view linked training group members" ON public.training_group_members;
DROP POLICY IF EXISTS "athlete views own membership" ON public.training_group_members;
DROP POLICY IF EXISTS "coach manages group members" ON public.training_group_members;
CREATE POLICY "Academy staff can view linked training group members"
  ON public.training_group_members FOR SELECT TO authenticated
  USING (private.is_academy_admin_for_training_group(group_id));
CREATE POLICY "athlete views own membership"
  ON public.training_group_members FOR SELECT TO authenticated
  USING (athlete_user_id = (SELECT auth.uid()));
CREATE POLICY "coach manages group members"
  ON public.training_group_members FOR ALL TO authenticated
  USING (private.is_training_group_coach(group_id))
  WITH CHECK (private.is_training_group_coach(group_id));

DROP POLICY IF EXISTS "Academy staff can view linked training sessions" ON public.training_group_sessions;
DROP POLICY IF EXISTS "athlete views group sessions" ON public.training_group_sessions;
DROP POLICY IF EXISTS "coach manages group sessions" ON public.training_group_sessions;
CREATE POLICY "Academy staff can view linked training sessions"
  ON public.training_group_sessions FOR SELECT TO authenticated
  USING (private.is_academy_admin_for_training_group(group_id));
CREATE POLICY "athlete views group sessions"
  ON public.training_group_sessions FOR SELECT TO authenticated
  USING (private.is_active_training_group_member(group_id));
CREATE POLICY "coach manages group sessions"
  ON public.training_group_sessions FOR ALL TO authenticated
  USING (private.is_training_group_coach(group_id))
  WITH CHECK (private.is_training_group_coach(group_id));

DROP POLICY IF EXISTS "Academy staff can view linked attendance" ON public.training_group_attendance;
DROP POLICY IF EXISTS "athlete views own attendance" ON public.training_group_attendance;
DROP POLICY IF EXISTS "coach manages attendance" ON public.training_group_attendance;
CREATE POLICY "Academy staff can view linked attendance"
  ON public.training_group_attendance FOR SELECT TO authenticated
  USING (private.is_academy_admin_for_training_session(session_id));
CREATE POLICY "athlete views own attendance"
  ON public.training_group_attendance FOR SELECT TO authenticated
  USING (athlete_user_id = (SELECT auth.uid()));
CREATE POLICY "coach manages attendance"
  ON public.training_group_attendance FOR ALL TO authenticated
  USING (private.can_manage_training_group_attendance(session_id, athlete_user_id))
  WITH CHECK (private.can_manage_training_group_attendance(session_id, athlete_user_id));
