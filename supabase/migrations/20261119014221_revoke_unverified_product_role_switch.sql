-- Earlier production application of the same narrowly scoped role-switch revocation.
REVOKE ALL ON FUNCTION public.switch_my_product_role(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.switch_my_product_role(text) FROM anon;
REVOKE ALL ON FUNCTION public.switch_my_product_role(text) FROM authenticated;
