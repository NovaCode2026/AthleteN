import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = (path) => readFileSync(new URL(path, import.meta.url), "utf8");
const migration = read("../supabase/migrations/20261124160000_messaging_lifecycle_and_disappearing_messages.sql");
const worker = read("../supabase/functions/cleanup-message-attachments/index.ts");
const web = read("../src/components/messaging/MessagingPage.tsx");
const mobile = read("../AthleteN-Mobile/src/app/(tabs)/messages.tsx");
const cryptoDesign = read("../docs/MESSAGING_E2EE_AND_ENCRYPTED_BACKUP_DESIGN.md");

test("message expiry is database-assigned and unreadable after the timestamp", () => {
  assert.match(migration, /disappearing_messages_after_seconds/);
  assert.match(migration, /messages_set_expiry_before_insert/);
  assert.match(migration, /NEW\.expires_at/);
  assert.match(migration, /expires_at IS NULL OR expires_at > now\(\)/);
  assert.match(migration, /cleanup_expired_messages/);
  assert.match(migration, /FOR UPDATE SKIP LOCKED/);
});

test("delete-for-everyone queues attachment objects and clears message references", () => {
  assert.match(migration, /messaging_attachment_cleanup_queue/);
  assert.ok(migration.includes("'deleted_for_everyone'"));
  assert.match(migration, /attachment_path = NULL/);
  assert.match(migration, /queue_message_attachment_cleanup_before_delete/);
  assert.match(migration, /GRANT EXECUTE ON FUNCTION public\.cleanup_expired_messages\(integer\) TO service_role/);
});

test("message lifecycle RPCs remain authorization-scoped", () => {
  assert.match(migration, /public\.is_age_approved\(v_user\)/);
  assert.match(migration, /public\.is_conversation_member\(v_message\.conversation_id\)/);
  assert.match(migration, /Only the sender can delete this message for everyone/);
  assert.match(migration, /Only group admins can change disappearing-message settings/);
  assert.match(migration, /Only the group creator can remove another group admin/);
  assert.match(migration, /GRANT EXECUTE ON FUNCTION public\.remove_group_member\(uuid, uuid\) TO authenticated/);
});

test("cleanup worker is secret-gated and uses service-role Storage API", () => {
  assert.match(worker, /MESSAGE_ATTACHMENT_CLEANUP_SECRET/);
  assert.match(worker, /x-cleanup-secret/);
  assert.match(worker, /cleanup_expired_messages/);
  assert.match(worker, /storage[\s\S]*remove\(\[item\.object_path\]\)/);
  assert.match(worker, /record_messaging_attachment_cleanup_failure/);
});

test("web and mobile expose the same disappearing-message choices and attachment deletion action", () => {
  for (const source of [web, mobile]) {
    assert.match(source, /set_conversation_disappearing_messages/);
    assert.match(source, /DELETE FOR EVERYONE/i);
    assert.match(source, /24 hours/);
    assert.match(source, /7 days/);
    assert.match(source, /30 days/);
    assert.match(source, /90 days/);
  }
});

test("E2E design requires vetted protocol implementations and encrypted client-side backups", () => {
  assert.match(cryptoDesign, /RFC 9420/);
  assert.match(cryptoDesign, /Double Ratchet/);
  assert.match(cryptoDesign, /client-side encryption/i);
  assert.match(cryptoDesign, /No custom cryptography/i);
  assert.match(cryptoDesign, /Rollout gates/i);
});
