-- Private schema access is required for authenticated RLS policies to
-- resolve their helper functions. Keep anonymous access disabled; function
-- EXECUTE grants remain individually controlled.
REVOKE USAGE ON SCHEMA private FROM PUBLIC, anon;
GRANT USAGE ON SCHEMA private TO authenticated;
