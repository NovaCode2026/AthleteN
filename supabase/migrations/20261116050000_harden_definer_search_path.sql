-- Explicitly place pg_temp last for SECURITY DEFINER functions.
-- A user's temporary objects must never shadow relations in trusted schemas.
-- Empty search paths already fully qualify their dependencies and stay unchanged.

DO $migration$
DECLARE
  function_row record;
  configured_path text;
BEGIN
  FOR function_row IN
    SELECT
      p.oid::regprocedure AS function_signature,
      setting.setting_value
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    CROSS JOIN LATERAL unnest(coalesce(p.proconfig, ARRAY[]::text[])) AS setting(setting_value)
    WHERE p.prosecdef
      AND n.nspname = 'public'
      AND setting.setting_value LIKE 'search_path=%'
      AND setting.setting_value <> 'search_path=""'
      AND setting.setting_value <> 'search_path=pg_catalog'
      AND setting.setting_value NOT ILIKE '%pg_temp%'
  LOOP
    configured_path := substring(function_row.setting_value FROM length('search_path=') + 1);
    EXECUTE format(
      'ALTER FUNCTION %s SET search_path TO %s, pg_temp',
      function_row.function_signature,
      configured_path
    );
  END LOOP;

  -- Even pg_catalog-only privileged functions explicitly keep temp last.
  FOR function_row IN
    SELECT p.oid::regprocedure AS function_signature
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    CROSS JOIN LATERAL unnest(coalesce(p.proconfig, ARRAY[]::text[])) AS setting(setting_value)
    WHERE p.prosecdef
      AND n.nspname = 'public'
      AND setting.setting_value = 'search_path=pg_catalog'
  LOOP
    EXECUTE format(
      'ALTER FUNCTION %s SET search_path TO pg_catalog, pg_temp',
      function_row.function_signature
    );
  END LOOP;
END;
$migration$;
