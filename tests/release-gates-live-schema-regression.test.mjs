import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const roleMigration = readFileSync(new URL("../supabase/migrations/20261119014928_revoke_unverified_product_role_switch.sql", import.meta.url), "utf8");
const budgetMigration = readFileSync(new URL("../supabase/migrations/20261119014946_athleten_ai_monthly_budget_ledger.sql", import.meta.url), "utf8");
const aiCoach = readFileSync(new URL("../netlify/functions/ai-coach.mjs", import.meta.url), "utf8");

test("unverified product-role switching is revoked from all client roles", () => {
  assert.match(roleMigration, /REVOKE ALL ON FUNCTION public\.switch_my_product_role\(text\) FROM PUBLIC/i);
  assert.match(roleMigration, /REVOKE ALL ON FUNCTION public\.switch_my_product_role\(text\) FROM anon/i);
  assert.match(roleMigration, /REVOKE ALL ON FUNCTION public\.switch_my_product_role\(text\) FROM authenticated/i);
});

test("AI budget ledger functions use a fixed empty search path and server-only grants", () => {
  assert.equal((budgetMigration.match(/SECURITY DEFINER SET search_path=''/gi) || []).length, 3);
  assert.match(budgetMigration, /REVOKE ALL ON FUNCTION public\.reserve_athleten_ai_budget\(date,integer,integer\) FROM public,anon,authenticated/i);
  assert.match(budgetMigration, /GRANT EXECUTE ON FUNCTION public\.reserve_athleten_ai_budget\(date,integer,integer\) TO service_role/i);
  assert.match(budgetMigration, /REVOKE ALL ON TABLE public\.athleten_ai_budget_monthly FROM public,anon,authenticated,service_role/i);
});

test("AI Coach fails closed if the platform budget ledger cannot reserve spend", () => {
  assert.match(aiCoach, /reserve_athleten_ai_budget/);
  assert.match(aiCoach, /if \(budgetReservationError\).*AI Coach is paused because the protected monthly budget ledger is not ready/s);
});

const financeMigration = readFileSync(new URL("../supabase/migrations/20261119015254_finance_role_and_age_authorization_hardening.sql", import.meta.url), "utf8");

test("Coach and Academy finance access requires an approved account and matching product role", () => {
  assert.match(financeMigration, /public\.is_age_approved\(auth\.uid\(\)\)/);
  assert.match(financeMigration, /p\.role='coach'/);
  assert.match(financeMigration, /p\.role='academy_admin'/);
  assert.match(financeMigration, /set search_path=''/);
  assert.match(financeMigration, /REVOKE ALL ON FUNCTION public\.can_manage_finance_account\(uuid\) FROM public,anon/i);
  assert.match(financeMigration, /REVOKE ALL ON FUNCTION public\.get_or_create_my_coach_finance_account\(\) FROM public,anon/i);
});
