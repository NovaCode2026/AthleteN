-- Product-role switching was previously callable by every authenticated account.
-- It allowed an ordinary athlete to promote its own profile to coach or academy_admin
-- without the corresponding approval/setup workflow. No current Web/Mobile caller
-- depends on this RPC; keep it unavailable to client roles until a verified enrollment
-- flow is implemented.
REVOKE ALL ON FUNCTION public.switch_my_product_role(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.switch_my_product_role(text) FROM anon;
REVOKE ALL ON FUNCTION public.switch_my_product_role(text) FROM authenticated;
