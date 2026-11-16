import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const migration = readFileSync(
  new URL("../supabase/migrations/20261116062941_restrict_age_approval_status_to_self_and_admin.sql", import.meta.url),
  "utf8"
);

test("the private approval lookup cannot be called by client roles", () => {
  assert.match(migration, /CREATE OR REPLACE FUNCTION private\\.user_age_is_approved/i);
  assert.match(
    migration,
    /REVOKE ALL ON FUNCTION private\\.user_age_is_approved\\(uuid\\)\\s+FROM PUBLIC, anon, authenticated, service_role/i
  );
});

test("the public approval status RPC is scoped to self, platform admins, or service role", () => {
  assert.match(migration, /p_user_id = \\(SELECT auth\\.uid\\(\\)\\)/i);
  assert.match(migration, /private\\.is_platform_admin\\(\\)/i);
  assert.match(migration, /coalesce\\(auth\\.role\\(\\), ''\\) = 'service_role'/i);
  assert.match(migration, /ELSE false/i);
});

test("every internal cross-user approval check is redirected to the private helper", () => {
  const targetChecks = [
    ["academy_add_coach", "v_coach"],
    ["academy_create_tournament", "p_athlete_user_id"],
    ["academy_create_tournament", "p_coach_user_id"],
    ["academy_create_training_group", "p_coach_user_id"],
    ["academy_create_training_group", "v_athlete"],
    ["add_group_member_by_user", "p_user_id"],
    ["coach_add_athlete_by_account_code", "v_athlete"],
    ["connect_athlete_by_code", "v_code.owner_user_id"],
    ["connect_coach_to_academy_by_code", "v_code.owner_user_id"],
    ["create_coach_training_group", "v_athlete"],
    ["create_direct_conversation_by_user", "p_recipient_id"],
    ["ensure_training_group_conversation", "NEW.coach_user_id"],
    ["ensure_training_group_conversation", "m.athlete_user_id"],
    ["get_my_connection_code", "cc.owner_user_id"],
    ["publish_announcement", "p.user_id"],
    ["search_messaging_users", "p.user_id"],
    ["sync_training_group_chat_member", "NEW.athlete_user_id"],
    ["sync_training_group_chat_member", "v_coach"]
  ];

  for (const [functionName, argument] of targetChecks) {
    const mapping = `('${functionName}', 'public.is_age_approved(${argument})')`;
    assert.ok(migration.includes(mapping), `Missing private mapping for ${functionName}(${argument})`);
  }

  assert.match(
    migration,
    /replace\\(item\\.old_expression, 'public\\.is_age_approved', 'private\\.user_age_is_approved'\\)/i
  );
});
