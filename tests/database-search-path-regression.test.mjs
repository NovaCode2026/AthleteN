import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const migration = readFileSync(new URL("../supabase/migrations/20261116050000_harden_definer_search_path.sql", import.meta.url), "utf8");

test("existing SECURITY DEFINER paths explicitly keep pg_temp last", () => {
  assert.match(migration, /WHERE p\.prosecdef/i);
  assert.match(migration, /setting\.setting_value NOT ILIKE '%pg_temp%'/i);
  assert.match(migration, /ALTER FUNCTION %s SET search_path TO %s, pg_temp/i);
  assert.match(migration, /ALTER FUNCTION %s SET search_path TO pg_catalog, pg_temp/i);
});

test("function search-path hardening changes configuration only", () => {
  assert.doesNotMatch(migration, /CREATE OR REPLACE FUNCTION/i);
  assert.doesNotMatch(migration, /REVOKE\s+EXECUTE/i);
  assert.doesNotMatch(migration, /GRANT\s+EXECUTE/i);
});

test("empty search paths remain unchanged because their dependencies are explicitly qualified", () => {
  assert.match(migration, /setting\.setting_value <> 'search_path=""'/i);
  assert.match(migration, /setting\.setting_value = 'search_path=pg_catalog'/i);
});
