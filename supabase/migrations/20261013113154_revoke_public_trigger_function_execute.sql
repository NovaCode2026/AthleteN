-- These are trigger-only functions, not client-callable RPCs.
-- PostgreSQL does not require callers to hold EXECUTE on a trigger function
-- when the function is invoked by a table trigger. Remove API execution grants.
revoke execute on function public.audit_admin_mutation() from public, anon, authenticated;
revoke execute on function public.guard_privileged_profile_fields() from public, anon, authenticated;
