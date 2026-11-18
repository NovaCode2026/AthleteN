import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { planPricesMinor, providerPlanKey } from "../netlify/payment-common.mjs";

const checkout = readFileSync(new URL("../netlify/functions/create-checkout.mjs", import.meta.url), "utf8");
const webPlans = readFileSync(new URL("../src/App.tsx", import.meta.url), "utf8");
const mobilePlans = readFileSync(new URL("../AthleteN-Mobile/src/app/plans.tsx", import.meta.url), "utf8");

test("monthly and yearly server prices match the published plan prices", () => {
  assert.deepEqual(planPricesMinor.monthly, {
    pro: 9900, elite: 19900, coach: 49900, academy: 79900
  });
  assert.deepEqual(planPricesMinor.yearly, {
    pro: 99900, elite: 199900, coach: 499900, academy: 799900
  });
});

test("provider plan configuration keys are period-specific", () => {
  assert.equal(providerPlanKey("razorpay", "pro", "monthly"), "RAZORPAY_PLAN_V2_PRO_MONTHLY");
  assert.equal(providerPlanKey("stripe", "academy", "yearly"), "STRIPE_PLAN_V2_ACADEMY_YEARLY");
  assert.throws(() => providerPlanKey("stripe", "pro", "weekly"), /INVALID_BILLING_PERIOD/);
});

test("checkout selects server price and recurring provider plan using the same period", () => {
  assert.ok(checkout.includes('String(body.billingPeriod || "monthly").toLowerCase()'));
  assert.ok(checkout.includes("planPricesMinor[billingPeriod]?.[planId]"));
  assert.ok(checkout.includes('providerPlanKey("RAZORPAY", planId, billingPeriod)'));
  assert.ok(checkout.includes('providerPlanKey("STRIPE", planId, billingPeriod)'));
  assert.ok(checkout.includes('total_count: billingPeriod === "yearly" ? 10 : 120'));
});

test("web and mobile clients send the selected billing period to the server", () => {
  assert.ok(webPlans.includes("JSON.stringify({ planId, billingPeriod })"));
  assert.ok(mobilePlans.includes("JSON.stringify({ planId, billingPeriod: billing })"));
});
