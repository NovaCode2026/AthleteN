import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const checkout = readFileSync(new URL("../netlify/functions/create-trial-checkout.mjs", import.meta.url), "utf8");
const paymentCommon = readFileSync(new URL("../netlify/payment-common.mjs", import.meta.url), "utf8");
const webhook = readFileSync(new URL("../netlify/functions/payment-webhook.mjs", import.meta.url), "utf8");
const migration = readFileSync(new URL("../supabase/migrations/20261118000700_harden_trial_activation.sql", import.meta.url), "utf8");

test("trial checkout remains closed during Free launch", () => {
  assert.match(checkout, /const FREE_LAUNCH = true/);
  assert.match(checkout, /if \(FREE_LAUNCH\)[\s\S]*?return json\([\s\S]*?, 503\)/);
});

test("trial checkout verifies email, age approval, role and Academy owner setup", () => {
  assert.ok(checkout.includes("user.email_confirmed_at"));
  assert.ok(checkout.includes('supabase.rpc("is_age_approved"'));
  assert.ok(checkout.includes('(["student", "pro", "elite"].includes(planId) && profile.role === "athlete")'));
  assert.ok(checkout.includes('(planId === "coach" && profile.role === "coach")'));
  assert.ok(checkout.includes('(planId === "academy" && profile.role === "academy_admin")'));
  assert.ok(checkout.includes('.eq("owner_user_id", user.id)'));
  assert.ok(checkout.includes('.eq("setup_completed", true)'));
  assert.ok(checkout.includes('.not("contact_email_verified_at", "is", null)'));
  assert.ok(checkout.includes("requireApprovedStudent"));
});

test("database trial activation independently enforces email, age and product role", () => {
  assert.ok(migration.includes("public.is_age_approved(p_user_id)"));
  assert.ok(migration.includes("auth.users u"));
  assert.ok(migration.includes("u.email_confirmed_at"));
  assert.ok(migration.includes("ATHLETE_TRIAL_REQUIRES_ATHLETE_ROLE"));
  assert.ok(migration.includes("COACH_TRIAL_REQUIRES_COACH_ROLE"));
  assert.ok(migration.includes("ACADEMY_TRIAL_NOT_VERIFIED"));
  assert.ok(migration.includes("STUDENT_NOT_VERIFIED"));
  assert.ok(!migration.includes("auth.uid()"));
});

test("trial activation RPC is service-role only", () => {
  assert.ok(migration.includes("FROM PUBLIC, anon, authenticated"));
  assert.ok(migration.includes("TO service_role"));
});

test("trial webhook rejects payment amount, currency, status or purpose mismatch", () => {
  assert.ok(webhook.includes('["pending", "awaiting_payment"].includes(String(order.status || "").toLowerCase())'));
  assert.ok(webhook.includes("Number(paymentDetails.amountMinor) !== Number(order.amount_minor)"));
  assert.ok(webhook.includes('String(paymentDetails.currency || "").toUpperCase()'));
  assert.ok(webhook.includes("TRIAL_ORDER_PURPOSE_MISMATCH"));
  assert.ok(webhook.includes("TRIAL_PAYMENT_AMOUNT_MISMATCH"));
});

test("trial order finalization accepts pending and awaiting-payment states and checks the updated row", () => {
  assert.ok(webhook.includes('.in("status", ["pending", "awaiting_payment"])'));
  assert.ok(webhook.includes('.select("id").maybeSingle()'));
  assert.ok(webhook.includes("if (!updatedOrder) throw new Error(\"TRIAL_ORDER_NOT_ACTIVATABLE\")"));
});

test("trial checkout blocks a second pending one-time payment", () => {
  assert.ok(checkout.includes('entitlement?.trial_payment_status === "pending"'));
  assert.ok(checkout.includes("Complete that checkout or wait for its failure/expiry confirmation"));
});

test("Student verification ordering has a stable tie-breaker", () => {
  assert.ok(checkout.includes("requireApprovedStudent"));
  assert.ok(paymentCommon.includes('.order("created_at", { ascending: false })'));
  assert.ok(paymentCommon.includes('.order("id", { ascending: false })'));
});
