import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const migration = readFileSync(
  new URL("../supabase/migrations/20261116020713_security_default_privileges_and_qa_override_rls.sql", import.meta.url),
  "utf8"
);

test("future public tables and sequences are not granted to client roles by default", () => {
  assert.match(migration, /ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public\s+REVOKE ALL ON TABLES FROM anon, authenticated/i);
  assert.match(migration, /ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public\s+REVOKE ALL ON SEQUENCES FROM anon, authenticated/i);
});

test("future public RPCs do not inherit client or PUBLIC execute by default", () => {
  assert.match(migration, /REVOKE EXECUTE ON FUNCTIONS FROM anon, authenticated/i);
  assert.match(migration, /ALTER DEFAULT PRIVILEGES FOR ROLE postgres\s+REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC/i);
});

test("the private QA approval override table has row-level security enabled", () => {
  assert.match(migration, /ALTER TABLE private\.qa_age_verification_overrides\s+ENABLE ROW LEVEL SECURITY/i);
});
