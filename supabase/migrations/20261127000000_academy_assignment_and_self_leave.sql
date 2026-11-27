-- PR #76: Academy-controlled athlete Coach assignment and athlete self-exit.
-- Candidate migration only. Reconcile production migration history and replay in staging.

CREATE OR REPLACE FUNCTION public.academy_assign_athlete_coach(
  p_academy_id uuid,
  p_athlete_user_id uuid,
  p_coach_user_id uuid
) RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path=''
AS $function$
DECLARE
  v_link_id uuid;
BEGIN
  IF auth.uid() IS NULL OR NOT private.user_is_approved_academy_admin(p_academy_id) THEN
    RAISE EXCEPTION 'Only this Academy Admin may assign an athlete Coach';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.academy_memberships m
    WHERE m.academy_id=p_academy_id
      AND m.user_id=p_athlete_user_id
      AND m.role='athlete' AND m.status='active'
  ) THEN
    RAISE EXCEPTION 'Athlete must be an active member of this Academy';
  END IF;

  -- A Coach membership or the Academy Admin/owner may coach within their own Academy.
  IF NOT (
    EXISTS (
      SELECT 1 FROM public.academy_memberships m
      WHERE m.academy_id=p_academy_id
        AND m.user_id=p_coach_user_id
        AND m.role='coach' AND m.status='active'
    )
    OR private.user_is_approved_academy_admin(p_academy_id)
       AND p_coach_user_id = (
         SELECT a.owner_user_id FROM public.academies a WHERE a.id=p_academy_id
       )
  ) THEN
    RAISE EXCEPTION 'Target must be an active Academy Coach or the Academy Admin acting as Coach';
  END IF;

  -- End the previous active assignment first; the Academy is the sole authority.
  UPDATE public.coach_athlete_links
  SET status='ended',updated_at=now()
  WHERE academy_id=p_academy_id
    AND athlete_user_id=p_athlete_user_id
    AND status='active'
    AND coach_user_id<>p_coach_user_id;

  INSERT INTO public.coach_athlete_links(coach_user_id,athlete_user_id,academy_id,status)
  VALUES(p_coach_user_id,p_athlete_user_id,p_academy_id,'active')
  ON CONFLICT (coach_user_id,athlete_user_id,academy_id)
  DO UPDATE SET status='active',updated_at=now()
  RETURNING id INTO v_link_id;

  UPDATE public.profiles
  SET coach_user_id=p_coach_user_id,updated_at=now()
  WHERE user_id=p_athlete_user_id
    AND academy_id=p_academy_id;

  RETURN v_link_id;
END;
$function$;
REVOKE ALL ON FUNCTION public.academy_assign_athlete_coach(uuid,uuid,uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.academy_assign_athlete_coach(uuid,uuid,uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.academy_leave_self(p_academy_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path=''
AS $function$
DECLARE
  v_user uuid := (SELECT auth.uid());
BEGIN
  IF v_user IS NULL OR NOT EXISTS (
    SELECT 1 FROM public.academy_memberships m
    WHERE m.academy_id=p_academy_id
      AND m.user_id=v_user
      AND m.role='athlete'
      AND m.status='active'
  ) THEN
    RAISE EXCEPTION 'Only an active athlete may leave their linked Academy';
  END IF;

  -- Preserve history: suspend membership, end Coach link and cancel open transfers.
  UPDATE public.academy_memberships
  SET status='suspended',updated_at=now()
  WHERE academy_id=p_academy_id AND user_id=v_user AND role='athlete' AND status='active';

  UPDATE public.coach_athlete_links
  SET status='ended',updated_at=now()
  WHERE academy_id=p_academy_id AND athlete_user_id=v_user AND status='active';

  UPDATE public.academy_athlete_transfer_requests
  SET status='withdrawn',updated_at=now()
  WHERE academy_id=p_academy_id AND athlete_user_id=v_user
    AND status IN ('pending_current_coach','pending_target_coach','pending_academy_review');

  UPDATE public.profiles
  SET academy_id=NULL,coach_user_id=NULL,updated_at=now()
  WHERE user_id=v_user AND academy_id=p_academy_id;

  RETURN true;
END;
$function$;
REVOKE ALL ON FUNCTION public.academy_leave_self(uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.academy_leave_self(uuid) TO authenticated;
