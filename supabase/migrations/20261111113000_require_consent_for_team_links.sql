-- Team membership must be initiated by the member joining the team.
-- Coaches share a coach code; athletes enter it in Team & Academy.
-- Academies share an academy code; coaches enter it from Coach Profile.
-- Preserve legacy RPC signatures so older clients receive an actionable error
-- instead of silently creating a relationship without the other member's action.

CREATE OR REPLACE FUNCTION public.coach_connect_athlete(
  p_username text,
  p_academy_id uuid DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $function$
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;
  RAISE EXCEPTION 'Athlete-initiated connection required. Share your coach code and ask the athlete to enter it in Team & Academy.';
END;
$function$;

REVOKE ALL ON FUNCTION public.coach_connect_athlete(text,uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.coach_connect_athlete(text,uuid) TO authenticated;


CREATE OR REPLACE FUNCTION public.coach_add_athlete_by_account_code(p_code text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $function$
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;
  RAISE EXCEPTION 'Athlete-initiated connection required. Share your coach code and ask the athlete to enter it in Team & Academy.';
END;
$function$;

REVOKE ALL ON FUNCTION public.coach_add_athlete_by_account_code(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.coach_add_athlete_by_account_code(text) TO authenticated;


CREATE OR REPLACE FUNCTION public.academy_add_coach(p_username text)
RETURNS uuid
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $function$
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;
  RAISE EXCEPTION 'Coach-initiated academy joining required. Share the academy code and ask the coach to enter it in Coach Profile.';
END;
$function$;

REVOKE ALL ON FUNCTION public.academy_add_coach(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.academy_add_coach(text) TO authenticated;
