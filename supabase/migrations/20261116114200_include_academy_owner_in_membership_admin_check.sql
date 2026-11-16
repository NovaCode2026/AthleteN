-- Academy owners are administrators of their own academy even when they do not
-- have a separate academy_memberships row for themselves. The existing People
-- page reads academy_memberships under RLS, so omitting owner_user_id hid every
-- connected athlete/coach from the owner even though their memberships existed.

CREATE OR REPLACE FUNCTION private.user_is_academy_admin(p_academy_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $function$
  SELECT
    EXISTS (
      SELECT 1
      FROM public.academies a
      WHERE a.id = p_academy_id
        AND a.owner_user_id = (SELECT auth.uid())
    )
    OR EXISTS (
      SELECT 1
      FROM public.academy_memberships m
      WHERE m.academy_id = p_academy_id
        AND m.user_id = (SELECT auth.uid())
        AND m.status = 'active'
        AND m.role = 'academy_admin'
    );
$function$;
