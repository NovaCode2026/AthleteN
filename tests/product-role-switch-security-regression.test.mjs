import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const migration = readFileSync(new URL("../supabase/migrations/20261116040000_revoke_unverified_product_role_switch.sql", import.meta.url), "utf8");

test("unverified product-role switching is not executable by client roles", () => {
  assert.match(migration, /REVOKE ALL ON FUNCTION public\.switch_my_product_role\(text\) FROM PUBLIC/i);
  assert.match(migration, /REVOKE ALL ON FUNCTION public\.switch_my_product_role\(text\) FROM anon/i);
  assert.match(migration, /REVOKE ALL ON FUNCTION public\.switch_my_product_role\(text\) FROM authenticated/i);
});
