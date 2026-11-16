-- Make future public-schema objects private by default for client roles.
-- Existing application grants are intentionally unchanged; migrations that
-- expose a new table, sequence, or RPC must grant only the roles they require.
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
  REVOKE ALL ON TABLES FROM anon, authenticated;

ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
  REVOKE ALL ON SEQUENCES FROM anon, authenticated;

ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
  REVOKE EXECUTE ON FUNCTIONS FROM anon, authenticated;

-- PostgreSQL grants EXECUTE on new functions to PUBLIC unless revoked globally.
ALTER DEFAULT PRIVILEGES FOR ROLE postgres
  REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC;

-- This table stores QA-only age approval overrides. It has no client grants
-- or policies and remains accessible only through trusted backend operations.
ALTER TABLE private.qa_age_verification_overrides
  ENABLE ROW LEVEL SECURITY;
