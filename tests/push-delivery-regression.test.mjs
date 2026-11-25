import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = (path) => readFileSync(new URL(path, import.meta.url), "utf8");
const migration = read("../supabase/migrations/20261124170000_expo_push_ticket_and_receipt_tracking.sql");
const reliability = read("../supabase/migrations/20261125100000_notification_system_reliability.sql");
const worker = read("../supabase/functions/process-push-delivery-receipts/index.ts");
const runbook = read("../docs/MESSAGING_LIFECYCLE_RUNBOOK.md");

test("push dispatch records the pg_net request ID without exposing the delivery ledger to clients", () => {
  assert.match(migration, /pg_net_request_id bigint/);
  assert.match(migration, /v_request_id := net\.http_post/);
  assert.match(migration, /REVOKE ALL ON TABLE public\.push_delivery_attempts FROM PUBLIC, anon, authenticated/);
  assert.match(migration, /GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public\.push_delivery_attempts TO service_role/);
});

test("Expo ticket responses are persisted and DeviceNotRegistered tokens are retired", () => {
  assert.match(migration, /process_expo_push_ticket_responses/);
  assert.match(migration, /DeviceNotRegistered/);
  assert.match(migration, /DELETE FROM public\.device_push_tokens/);
  assert.match(migration, /expo_ticket_id text UNIQUE/);
});

test("receipt worker checks the Expo receipt endpoint and records provider results", () => {
  assert.match(worker, /get_expo_push_receipt_batch/);
  assert.match(worker, /https:\/\/exp\.host\/--\/api\/v2\/push\/getReceipts/);
  assert.match(worker, /record_expo_push_receipt_results/);
  assert.match(worker, /x-worker-secret/);
  assert.match(worker, /PUSH_DELIVERY_WORKER_SECRET/);
});

test("receipt state distinguishes Expo ticket acceptance from FCM/APNs handoff", () => {
  assert.match(migration, /'ticketed'/);
  assert.match(migration, /'handed_off'/);
  assert.match(migration, /15 minutes/);
  assert.match(migration, /23 hours/);
  assert.match(runbook, /does not prove that a person saw the notification/i);
});

test("cleanup and push worker secrets are server-side deployment gates", () => {
  assert.match(runbook, /MESSAGE_ATTACHMENT_CLEANUP_SECRET/);
  assert.match(runbook, /PUSH_DELIVERY_WORKER_SECRET/);
  assert.match(runbook, /never be included in web\/mobile config/i);
});


test("notification event producers cover athlete, coach, academy, verification and subscription events", () => {
  for (const token of [
    "notify_athlete_badge_awarded",
    "notify_student_verification_decision",
    "notify_coach_athlete_link_change",
    "notify_academy_membership_change",
    "notify_subscription_change",
    "coach_athlete_link_notification",
    "academy_membership_notification",
    "student_verification_notification",
    "subscription_notification",
  ]) {
    assert.ok(reliability.includes(token), "missing notification producer: " + token);
  }
  assert.match(reliability, /'achievement'/);
  assert.match(reliability, /'coach_academy'/);
  assert.match(reliability, /'academy'/);
  assert.match(reliability, /'system'/);
});

test("attendance alerts link the exact attendance record and group training chat alerts do not duplicate", () => {
  assert.match(reliability, /ADD COLUMN IF NOT EXISTS attendance_record_id uuid/i);
  assert.match(reliability, /attendance_record_id,[\s\S]*?NEW\.id/);
  assert.match(reliability, /NEW\.message_type[\s\S]*?<> 'training_schedule'/);
  assert.match(reliability, /CREATE TRIGGER athlete_badge_notification/);
});

test("push delivery has bounded exponential retry and scheduled ticket/receipt processing", () => {
  assert.match(reliability, /send_attempt_count BETWEEN 1 AND 5/i);
  assert.match(reliability, /retry_expo_push_delivery_attempts/);
  assert.match(reliability, /power\(2, v_attempt\.send_attempt_count - 1\)/i);
  assert.match(reliability, /enqueue_expo_push_receipt_poll/);
  assert.match(reliability, /process_expo_push_receipt_poll_responses/);
  assert.match(reliability, /run_push_delivery_cycle/);
  assert.match(reliability, /cron\.schedule/);
});

test("Expo ticket response parsing supports both object and array response shapes", () => {
  assert.match(reliability, /jsonb_typeof\(v_data\) = 'array'/);
  assert.match(reliability, /jsonb_typeof\(v_data\) = 'object'/);
  assert.match(reliability, /v_data->0/);
});

test("push retry workers and receipt ledgers are restricted to service role", () => {
  assert.match(reliability, /ALTER TABLE public\.push_receipt_poll_requests ENABLE ROW LEVEL SECURITY/i);
  assert.match(reliability, /REVOKE ALL ON TABLE public\.push_receipt_poll_requests FROM PUBLIC, anon, authenticated/i);
  assert.match(reliability, /GRANT EXECUTE ON FUNCTION public\.run_push_delivery_cycle\(\) TO service_role/i);
  assert.match(reliability, /REVOKE ALL ON FUNCTION public\.run_push_delivery_cycle\(\) FROM PUBLIC, anon, authenticated/i);
});
