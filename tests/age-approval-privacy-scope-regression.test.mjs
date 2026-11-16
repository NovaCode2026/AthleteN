import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const migration = readFileSync(
  new URL("../supabase/migrations/20261116062941_restrict_age_approval_status_to_self_and_admin.sql", import.meta.url),
  "utf8"
);

test("the private approval lookup cannot be called by client roles", () => {
  assert.match(migration, /CREATE OR REPLACE FUNCTION private\.user_age_is_approved/i);
  assert.match(
    migration,
    /REVOKE ALL ON FUNCTION private\.user_age_is_approved\(uuid\)\s+FROM PUBLIC, anon, authenticated, service_role/i
  );
});

test("the public approval status RPC is scoped to self, platform admins, or service role", () => {
  assert.match(migration, /p_user_id = \(SELECT auth\.uid\(\)\)/i);
  assert.match(migration, /private\.is_platform_admin\(\)/i);
  assert.match(migration, /coalesce\(auth\.role\(\), ''\) = 'service_role'/i);
  assert.match(migration, /ELSE false/i);
});

test("internal workflows use the private lookup for other participants", () => {
  for (const expression of [
    "private.user_age_is_approved(v_coach)",
    "private.user_age_is_approved(p_athlete_user_id)",
    "private.user_age_is_approved(p_coach_user_id)",
    "private.user_age_is_approved(v_athlete)",
    "private.user_age_is_approved(p_user_id)",
    "private.user_age_is_approved(v_code.owner_user_id)",
    "private.user_age_is_approved(p_recipient_id)",
    "private.user_age_is_approved(NEW.coach_user_id)",
    "private.user_age_is_approved(m.athlete_user_id)",
    "private.user_age_is_approved(cc.owner_user_id)",
    "private.user_age_is_approved(p.user_id)",
    "private.user_age_is_approved(NEW.athlete_user_id)"
  ]) {
    assert.ok(migration.includes(expression), `Missing private target lookup: ${expression}`);
  }
});
