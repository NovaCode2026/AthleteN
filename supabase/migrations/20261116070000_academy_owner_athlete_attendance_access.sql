-- Extend academy-owner visibility to scheduled group sessions, group rosters,
-- and attendance history. These rows are related through each group's coach
-- profile, which carries the academy_id.

CREATE OR REPLACE FUNCTION private.is_academy_admin_for_training_group(p_group_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $function$
  SELECT (SELECT auth.uid()) IS NOT NULL
    AND EXISTS (
      SELECT 1
      FROM public.training_groups g
      JOIN public.profiles coach_profile
        ON coach_profile.user_id = g.coach_user_id
      WHERE g.id = p_group_id
        AND private.user_is_academy_admin(coach_profile.academy_id)
    );
$function$;

CREATE OR REPLACE FUNCTION private.is_academy_admin_for_training_session(p_session_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $function$
  SELECT (SELECT auth.uid()) IS NOT NULL
    AND EXISTS (
      SELECT 1
      FROM public.training_group_sessions s
      JOIN public.training_groups g ON g.id = s.group_id
      JOIN public.profiles coach_profile
        ON coach_profile.user_id = g.coach_user_id
      WHERE s.id = p_session_id
        AND private.user_is_academy_admin(coach_profile.academy_id)
    );
$function$;
