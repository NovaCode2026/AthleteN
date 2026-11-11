-- Account codes currently mirror public usernames, so a coach entering
-- an athlete account code is not an athlete-initiated consent action.
-- New coach links must be redeemed by the athlete with the coach's connection
-- code through connect_athlete_by_code(text). Preserve existing link records.
REVOKE ALL ON FUNCTION public.coach_add_athlete_by_account_code(text)
  FROM PUBLIC, anon, authenticated;