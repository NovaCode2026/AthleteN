-- Prevent ambiguous connection-code resolution and concurrent duplicate issuance.
-- A read-only preflight confirmed there were no duplicate active codes.
CREATE UNIQUE INDEX IF NOT EXISTS connection_codes_active_normalized_code_uidx
ON public.connection_codes (lower(btrim(code)))
WHERE active = true;
