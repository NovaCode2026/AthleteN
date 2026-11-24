-- This RPC currently permits an authenticated user to self-assign Coach or Academy Admin.
-- It is not a verified enrollment flow. Keep client roles from invoking it until a
-- server-owned, approval-checked enrollment design replaces it.
-- Preserve any explicit service_role grant for trusted server-side maintenance.
REVOKE ALL ON FUNCTION public.switch_my_product_role(text) FROM PUBLIC, anon, authenticated;
