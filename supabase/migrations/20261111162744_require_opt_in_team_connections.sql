-- Require athlete/coach-initiated team connections.
-- Memberships are created by the code-redemption RPCs after the joining account
-- submits the code from its own authenticated session. Keep only the academy
-- owner self-bootstrap insert path for initial workspace creation.

DROP POLICY IF EXISTS "coach links coaches can create"
  ON public.coach_athlete_links;

DROP POLICY IF EXISTS "Academy admins can create memberships"
  ON public.academy_memberships;
DROP POLICY IF EXISTS "Academy owners can bootstrap admin membership"
  ON public.academy_memberships;

CREATE POLICY "Academy owners can bootstrap own admin membership"
  ON public.academy_memberships
  FOR INSERT
  TO authenticated
  WITH CHECK (
    (
      user_id = (SELECT auth.uid())
      AND role = 'academy_admin'
      AND status = 'active'
      AND EXISTS (
        SELECT 1
        FROM public.academies a
        WHERE a.id = academy_memberships.academy_id
          AND a.owner_user_id = (SELECT auth.uid())
      )
    )
    OR private.is_platform_admin()
  );

REVOKE ALL ON FUNCTION public.academy_add_coach(text)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.find_athlete_by_username(text)
  FROM PUBLIC, anon, authenticated;