import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const migration = readFileSync(
  new URL("../supabase/migrations/20261116114200_include_academy_owner_in_membership_admin_check.sql", import.meta.url),
  "utf8"
);

test("academy owners can read and manage their own academy memberships", () => {
  assert.match(migration, /FROM public\.academies a[\s\S]*?a\.id = p_academy_id[\s\S]*?a\.owner_user_id = \(SELECT auth\.uid\(\)\)/i);
});

test("separate academy admins still require an active admin membership", () => {
  assert.match(migration, /FROM public\.academy_memberships m[\s\S]*?m\.academy_id = p_academy_id[\s\S]*?m\.user_id = \(SELECT auth\.uid\(\)\)[\s\S]*?m\.status = 'active'[\s\S]*?m\.role = 'academy_admin'/i);
});
