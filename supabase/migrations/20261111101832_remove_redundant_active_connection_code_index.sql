-- The pre-existing connection_codes_case_insensitive_active_unique index
-- provides the same expression, uniqueness and active-row predicate.
-- Remove the duplicate introduced by the immediately preceding hardening migration.
DROP INDEX IF EXISTS public.connection_codes_active_normalized_code_uidx;
