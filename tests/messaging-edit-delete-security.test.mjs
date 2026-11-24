import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const migration = readFileSync(new URL("../supabase/migrations/20261124130000_secure_message_edit_delete_actions.sql", import.meta.url), "utf8");
const web = readFileSync(new URL("../src/components/messaging/MessagingPage.tsx", import.meta.url), "utf8");
const mobile = readFileSync(new URL("../AthleteN-Mobile/src/app/(tabs)/messages.tsx", import.meta.url), "utf8");

test("message hide-for-me data is private to the owning account", () => {
  assert.match(migration, /create table if not exists public\.messaging_hidden_messages/i);
  assert.match(migration, /enable row level security/i);
  assert.match(migration, /user_id = \(select auth\.uid\(\)\)/i);
  assert.match(migration, /grant select on public\.messaging_hidden_messages to authenticated/i);
  assert.match(migration, /hide_message_for_me\(p_message_id uuid\)/i);
  assert.match(migration, /public\.is_conversation_member\(v_conversation_id\)/i);
  assert.match(migration, /on conflict \(user_id, message_id\) do nothing/i);
});

test("edit and delete-for-everyone are server-enforced sender-only 15-minute text actions", () => {
  assert.match(migration, /create or replace function public\.edit_message/i);
  assert.match(migration, /create or replace function public\.delete_message_for_everyone/i);
  assert.match(migration, /v_message\.sender_id <> v_user/i);
  assert.match(migration, /interval '15 minutes'/i);
  assert.match(migration, /attachment_path is not null/i);
  assert.match(migration, /deleted_for_everyone_at = now\(\)/i);
  assert.match(migration, /This message was deleted/);
  assert.match(migration, /grant execute on function public\.edit_message\(uuid, text\) to authenticated/i);
  assert.match(migration, /grant execute on function public\.delete_message_for_everyone\(uuid\) to authenticated/i);
});

test("web and mobile use protected RPCs and locally hide per-user deleted messages", () => {
  for (const source of [web, mobile]) {
    assert.match(source, /messaging_hidden_messages/);
    assert.match(source, /edit_message/);
    assert.match(source, /delete_message_for_everyone/);
    assert.match(source, /hide_message_for_me/);
    assert.match(source, /15 min/i);
  }
});
