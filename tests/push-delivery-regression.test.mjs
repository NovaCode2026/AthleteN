import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = (path) => readFileSync(new URL(path, import.meta.url), "utf8");
const migration = read("../supabase/migrations/20261124170000_expo_push_ticket_and_receipt_tracking.sql");
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
