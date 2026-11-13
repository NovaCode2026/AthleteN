import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = (path) => readFileSync(new URL(path, import.meta.url), "utf8");

test("restored Nov 4 checklist migration matches live tournament scope schema", () => {
  const sql = read("../supabase/migrations/20261104101337_competition_checklists_tournament_scope.sql");
  assert.match(sql, /add column if not exists tournament_id uuid/i);
  assert.match(sql, /references public\.tournaments\(id\) on delete cascade/i);
  assert.match(sql, /idx_competition_checklists_tournament_user/i);
});

test("restored Nov 4 messaging and coach RPC migration retains server-side authorization", () => {
  const sql = read("../supabase/migrations/20261104103042_secure_messaging_and_coach_rpcs.sql");
  const expectedFunctions = [
    "search_messaging_users",
    "create_direct_conversation_by_user",
    "create_direct_conversation",
    "add_group_member_by_user",
    "add_group_member_by_email",
    "hide_my_conversation",
    "unblock_messaging_user",
    "cancel_coach_training_session",
    "cancel_coach_training_date",
    "create_coach_extra_training",
    "publish_announcement",
  ];
  for (const name of expectedFunctions) assert.match(sql, new RegExp(`create or replace function public\\.${name}\\(`, "i"), `missing RPC: ${name}`);
  assert.match(sql, /auth\.uid\(\)/i);
  assert.match(sql, /is_age_approved/i);
  assert.match(sql, /user_blocks/i);
  assert.match(sql, /only the group creator can add members/i);
  assert.match(sql, /coach access required/i);
});

test("restored Nov 4 announcement migration removes permissive reads and enforces audience", () => {
  const sql = read("../supabase/migrations/20261104103647_enforce_announcement_audience_reads.sql");
  assert.match(sql, /drop policy if exists "announcements public published read"/i);
  assert.match(sql, /drop policy if exists "age approval required"/i);
  assert.match(sql, /create policy "announcements_select_published_audience"/i);
  assert.match(sql, /published_at <= now\(\)/i);
  assert.match(sql, /audience = 'athletes'/i);
  assert.match(sql, /audience = 'coaches'/i);
  assert.match(sql, /audience = 'academies'/i);
  assert.match(sql, /audience = 'admins'/i);
});
