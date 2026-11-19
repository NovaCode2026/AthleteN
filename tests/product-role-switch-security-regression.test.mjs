import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const migration = readFileSync(new URL("../supabase/migrations/20261118000100_revoke_unverified_product_role_switch.sql", import.meta.url), "utf8");

test("unverified product-role self-enrollment is revoked from client roles", () => {
  assert.ok(migration.includes("REVOKE ALL ON FUNCTION public.switch_my_product_role(text) FROM PUBLIC, anon, authenticated;"));
});
