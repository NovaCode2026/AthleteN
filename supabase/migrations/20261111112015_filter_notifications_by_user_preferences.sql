-- Enforce notification preferences centrally so every producer (messages,
-- training events, attendance, announcements, and server-created alerts) follows
-- the same category choices before rows reach realtime or push dispatch.

CREATE OR REPLACE FUNCTION private.notification_preference_allows(
  p_notification_type text,
  p_training boolean,
  p_competitions boolean,
  p_messages boolean,
  p_coach_academy boolean,
  p_achievements boolean,
  p_system boolean
)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
SET search_path = ''
AS $function$
  SELECT CASE lower(btrim(coalesce(p_notification_type, '')))
    WHEN 'training' THEN coalesce(p_training, true)
    WHEN 'competition' THEN coalesce(p_competitions, true)
    WHEN 'competitions' THEN coalesce(p_competitions, true)
    WHEN 'tournament' THEN coalesce(p_competitions, true)
    WHEN 'tournament_update' THEN coalesce(p_competitions, true)
    WHEN 'message' THEN coalesce(p_messages, true)
    WHEN 'coach' THEN coalesce(p_coach_academy, true)
    WHEN 'academy' THEN coalesce(p_coach_academy, true)
    WHEN 'coach_academy' THEN coalesce(p_coach_academy, true)
    WHEN 'connection' THEN coalesce(p_coach_academy, true)
    WHEN 'connection_request' THEN coalesce(p_coach_academy, true)
    WHEN 'academy_invitation' THEN coalesce(p_coach_academy, true)
    WHEN 'coach_invitation' THEN coalesce(p_coach_academy, true)
    WHEN 'achievement' THEN coalesce(p_achievements, true)
    WHEN 'badge' THEN coalesce(p_achievements, true)
    WHEN 'milestone' THEN coalesce(p_achievements, true)
    ELSE coalesce(p_system, true)
  END;
$function$;

CREATE OR REPLACE FUNCTION private.guard_notification_preference()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_allowed boolean;
BEGIN
  SELECT private.notification_preference_allows(
    NEW.notification_type,
    np.training,
    np.competitions,
    np.messages,
    np.coach_academy,
    np.achievements,
    np.system
  )
  INTO v_allowed
  FROM (SELECT 1) AS seed
  LEFT JOIN public.notification_preferences np
    ON np.user_id = NEW.user_id;

  IF NOT coalesce(v_allowed, true) THEN
    RETURN NULL;
  END IF;

  RETURN NEW;
END;
$function$;

REVOKE ALL ON FUNCTION private.notification_preference_allows(text, boolean, boolean, boolean, boolean, boolean, boolean)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION private.guard_notification_preference()
  FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS enforce_notification_preferences_before_insert
  ON public.notifications;
CREATE TRIGGER enforce_notification_preferences_before_insert
  BEFORE INSERT ON public.notifications
  FOR EACH ROW
  EXECUTE FUNCTION private.guard_notification_preference();
