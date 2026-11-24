import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const endpoint = readFileSync(new URL("../netlify/functions/cancel-subscription.mjs", import.meta.url), "utf8");
const webhook = readFileSync(new URL("../netlify/functions/payment-webhook.mjs", import.meta.url), "utf8");
const webPlans = readFileSync(new URL("../src/App.tsx", import.meta.url), "utf8");
const mobilePlans = readFileSync(new URL("../AthleteN-Mobile/src/app/plans.tsx", import.meta.url), "utf8");

test("cancellation endpoint fails closed until production schema is verified", () => {
  assert.ok(endpoint.includes("billing schema verification is pending"));
  assert.ok(endpoint.includes("}, 503)"));
});

test("payment webhooks do not write the unverified cancellation column", () => {
  assert.ok(webhook.includes("Do not write the candidate-only cancellation column"));
  assert.ok(!webhook.includes("update.cancel_at_period_end"));
});

test("web and mobile plans do not select the unverified cancellation column", () => {
  assert.ok(!webPlans.includes("current_period_end,cancel_at_period_end"));
  assert.ok(!mobilePlans.includes("current_period_end,provider,cancel_at_period_end"));
});

test("web and mobile cancellation controls remain disabled pending migration verification", () => {
  assert.ok(webPlans.includes("const SUBSCRIPTION_CANCELLATION_ENABLED = false"));
  assert.ok(mobilePlans.includes("const SUBSCRIPTION_CANCELLATION_ENABLED = false"));
});
