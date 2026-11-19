-- Mirrors production Supabase migration 20261119014221.
-- An unverified product-role switch SECURITY DEFINER RPC was callable by
-- authenticated users, allowing self-promotion to coach or academy_admin.
-- Keep client execution revoked until a verified enrollment workflow exists.
REVOKE ALL ON FUNCTION public.switch_my_product_role(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.switch_my_product_role(text) FROM anon;
REVOKE ALL ON FUNCTION public.switch_my_product_role(text) FROM authenticated;
