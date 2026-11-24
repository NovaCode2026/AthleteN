-- Prevent self-enrollment into Coach or Academy Admin through a client-callable RPC.
-- No verified Web/Mobile enrollment caller exists; approved role provisioning remains authoritative.
REVOKE ALL ON FUNCTION public.switch_my_product_role(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.switch_my_product_role(text) FROM anon;
REVOKE ALL ON FUNCTION public.switch_my_product_role(text) FROM authenticated;
