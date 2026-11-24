import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const migration = readFileSync(new URL("../supabase/migrations/20261116043000_server_only_ai_usage_metering.sql", import.meta.url), "utf8");
const endpoint = readFileSync(new URL("../netlify/functions/ai-coach.mjs", import.meta.url), "utf8");

test("AI quota reservation and cancellation are server-role-only", () => {
  assert.match(migration, /SECURITY DEFINER[\s\S]*IF coalesce\(auth\.role\(\), ''\) <> 'service_role'/i);
  assert.match(migration, /REVOKE ALL ON FUNCTION public\.reserve_ai_usage\(uuid, text, text, integer\)\s+FROM PUBLIC, anon, authenticated/i);
  assert.match(migration, /GRANT EXECUTE ON FUNCTION public\.reserve_ai_usage\(uuid, text, text, integer\)\s+TO service_role/i);
  assert.match(migration, /REVOKE ALL ON FUNCTION public\.cancel_ai_usage\(uuid, uuid\)\s+FROM PUBLIC, anon, authenticated/i);
  assert.match(migration, /GRANT EXECUTE ON FUNCTION public\.cancel_ai_usage\(uuid, uuid\)\s+TO service_role/i);
});

test("authenticated clients cannot insert or modify AI usage ledger rows", () => {
  assert.match(migration, /REVOKE INSERT, UPDATE, DELETE ON TABLE public\.ai_usage_events\s+FROM anon, authenticated/i);
  assert.match(migration, /DROP POLICY IF EXISTS ai_usage_insert_reservation ON public\.ai_usage_events/i);
  assert.match(migration, /DROP POLICY IF EXISTS ai_usage_update_reservation ON public\.ai_usage_events/i);
});

test("AI Coach reserves, cancels and meters usage through the server client", () => {
  assert.match(endpoint, /budgetAdmin\.rpc\("reserve_ai_usage"/);
  assert.match(endpoint, /cancelSelectedReservation\\(budgetAdmin, reservationId, userId, reservationKind\\)/);
  assert.match(endpoint, /cancelRewardReservation/);
  assert.match(endpoint, /budgetAdmin\.from\("ai_usage_events"\)\.update/);
  assert.doesNotMatch(endpoint, /supabase\.rpc\("reserve_ai_usage"/);
  assert.doesNotMatch(endpoint, /supabase\.from\("ai_usage_events"\)\.update/);
});

test("cancelling an unused AI reservation refunds one monthly request", () => {
  assert.match(migration, /tokens_used = 0[\s\S]*created_at >= now\(\) - interval '2 minutes'/i);
  assert.match(migration, /ai_requests_used = greatest\(ai_requests_used - 1, 0\)/i);
  assert.match(migration, /usage_month = date_trunc\('month', v_created_at AT TIME ZONE 'UTC'\)::date/i);
});
