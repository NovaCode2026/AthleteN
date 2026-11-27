-- PR #76: explicit Athlete -> Academy application and Academy approval workflow.
-- Candidate migration only. Replay in isolated staging after migration-history reconciliation.
CREATE TABLE IF NOT EXISTS public.academy_application_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  academy_id uuid NOT NULL REFERENCES public.academies(id) ON DELETE CASCADE,
  athlete_user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  message text CHECK (message IS NULL OR length(message) <= 2000),
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','accepted','rejected','withdrawn')),
  reviewed_by uuid REFERENCES auth.users(id),
  reviewed_at timestamptz,
  review_note text CHECK (review_note IS NULL OR length(review_note) <= 1000),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (academy_id, athlete_user_id, id)
);
CREATE UNIQUE INDEX IF NOT EXISTS academy_application_one_pending_per_athlete
  ON public.academy_application_requests(academy_id,athlete_user_id)
  WHERE status='pending';
CREATE INDEX IF NOT EXISTS academy_application_academy_status_created
  ON public.academy_application_requests(academy_id,status,created_at DESC);
CREATE INDEX IF NOT EXISTS academy_application_athlete_created
  ON public.academy_application_requests(athlete_user_id,created_at DESC);
ALTER TABLE public.academy_application_requests ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.academy_application_requests FROM PUBLIC,anon,authenticated;
GRANT SELECT ON public.academy_application_requests TO authenticated;

CREATE OR REPLACE FUNCTION public.academy_apply_to_join(
  p_academy_id uuid,
  p_message text DEFAULT NULL
) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path=''
AS $function$
DECLARE v_user uuid := (SELECT auth.uid()); v_id uuid;
BEGIN
  IF v_user IS NULL THEN RAISE EXCEPTION 'Authentication required'; END IF;
  IF p_message IS NOT NULL AND length(p_message)>2000 THEN RAISE EXCEPTION 'Application message too long'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.academies a WHERE a.id=p_academy_id AND a.status='active') THEN
    RAISE EXCEPTION 'Academy is not accepting applications';
  END IF;
  IF EXISTS (SELECT 1 FROM public.academy_memberships m WHERE m.academy_id=p_academy_id AND m.user_id=v_user AND m.role='athlete' AND m.status='active') THEN
    RAISE EXCEPTION 'Already an active Academy member';
  END IF;
  INSERT INTO public.academy_application_requests(academy_id,athlete_user_id,message)
  VALUES(p_academy_id,v_user,nullif(btrim(p_message),''))
  RETURNING id INTO v_id;
  RETURN v_id;
END;
$function$;
REVOKE ALL ON FUNCTION public.academy_apply_to_join(uuid,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.academy_apply_to_join(uuid,text) TO authenticated;

CREATE OR REPLACE FUNCTION public.academy_review_application(
  p_request_id uuid,
  p_decision text,
  p_review_note text DEFAULT NULL
) RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path=''
AS $function$
DECLARE v_req public.academy_application_requests%ROWTYPE; v_user uuid := (SELECT auth.uid());
BEGIN
  IF v_user IS NULL THEN RAISE EXCEPTION 'Authentication required'; END IF;
  IF p_decision NOT IN ('accepted','rejected') THEN RAISE EXCEPTION 'Decision must be accepted or rejected'; END IF;
  IF p_review_note IS NOT NULL AND length(p_review_note)>1000 THEN RAISE EXCEPTION 'Review note too long'; END IF;
  SELECT * INTO v_req FROM public.academy_application_requests WHERE id=p_request_id FOR UPDATE;
  IF NOT FOUND OR NOT private.user_is_approved_academy_admin(v_req.academy_id) THEN
    RAISE EXCEPTION 'Only this Academy Admin can review applications';
  END IF;
  IF v_req.status<>'pending' THEN RAISE EXCEPTION 'Application is no longer pending'; END IF;
  IF p_decision='accepted' THEN
    INSERT INTO public.academy_memberships(academy_id,user_id,role,status)
    VALUES(v_req.academy_id,v_req.athlete_user_id,'athlete','active')
    ON CONFLICT (academy_id,user_id) DO UPDATE SET role='athlete',status='active',updated_at=now();
    UPDATE public.profiles SET academy_id=v_req.academy_id,updated_at=now()
    WHERE user_id=v_req.athlete_user_id;
  END IF;
  UPDATE public.academy_application_requests
  SET status=p_decision,reviewed_by=v_user,reviewed_at=now(),review_note=nullif(btrim(p_review_note),''),updated_at=now()
  WHERE id=p_request_id;
  RETURN true;
END;
$function$;
REVOKE ALL ON FUNCTION public.academy_review_application(uuid,text,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.academy_review_application(uuid,text,text) TO authenticated;

CREATE OR REPLACE FUNCTION public.academy_withdraw_application(p_request_id uuid)
RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path=''
AS $function$
DECLARE v_user uuid := (SELECT auth.uid());
BEGIN
  IF v_user IS NULL THEN RAISE EXCEPTION 'Authentication required'; END IF;
  UPDATE public.academy_application_requests SET status='withdrawn',updated_at=now()
  WHERE id=p_request_id AND athlete_user_id=v_user AND status='pending';
  IF NOT FOUND THEN RAISE EXCEPTION 'Pending application not found'; END IF;
  RETURN true;
END;
$function$;
REVOKE ALL ON FUNCTION public.academy_withdraw_application(uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.academy_withdraw_application(uuid) TO authenticated;

CREATE POLICY academy_application_select_own_or_admin
ON public.academy_application_requests FOR SELECT TO authenticated
USING (athlete_user_id=auth.uid() OR private.user_is_approved_academy_admin(academy_id));
