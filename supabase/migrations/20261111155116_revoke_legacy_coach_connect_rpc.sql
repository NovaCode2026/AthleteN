-- The current product uses athlete-shared account codes for coach linking.
-- The legacy username-based RPC creates active links without athlete-initiated
-- code redemption, so keep it unavailable to client roles.
REVOKE ALL ON FUNCTION public.coach_connect_athlete(text, uuid)
  FROM PUBLIC, anon, authenticated;
