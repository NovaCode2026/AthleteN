-- Connection codes are globally reserved forever, case-insensitively.
-- Trimming is part of the canonical comparison so whitespace cannot create aliases.
DROP INDEX IF EXISTS public.connection_codes_code_lower_unique;

CREATE UNIQUE INDEX connection_codes_code_lower_unique
  ON public.connection_codes (lower(btrim(code)));
