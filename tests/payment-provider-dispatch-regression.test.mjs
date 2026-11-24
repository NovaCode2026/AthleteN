import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { planPricesMinor, providerPlanKey } from "../netlify/payment-common.mjs";

const checkout = readFileSync(new URL("../netlify/functions/create-checkout.mjs", import.meta.url), "utf8");

test("recurring checkout only exposes providers with recurring subscription adapters", () => {
  assert.ok(checkout.includes('const providers = new Set(["razorpay", "stripe"]);'));
  assert.ok(checkout.includes("const checkoutByProvider = {"));
  assert.ok(checkout.includes("razorpay: razorpayCheckout,"));
  assert.ok(checkout.includes("stripe: stripeCheckout"));
  assert.ok(!checkout.includes("cashfree: cashfreeCheckout"));
  assert.ok(checkout.includes("const FREE_LAUNCH = true"));
});

test("paid checkout requires confirmed email and server-verified age or guardian approval", () => {
  assert.ok(checkout.includes("if (!user.email_confirmed_at)"));
  assert.ok(checkout.includes('supabase.rpc("is_age_approved"'));
  assert.ok(checkout.includes("if (ageApproved !== true)"));
});

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

test("checkout amount and subscription provider plan use the same selected billing period", () => {
  assert.ok(checkout.includes('String(body.billingPeriod || "monthly").toLowerCase()'));
  assert.ok(checkout.includes("planPricesMinor[billingPeriod]?.[planId]"));
  assert.ok(checkout.includes('providerPlanKey("RAZORPAY", planId, billingPeriod)'));
  assert.ok(checkout.includes('providerPlanKey("STRIPE", planId, billingPeriod)'));
  assert.ok(checkout.includes('total_count: billingPeriod === "yearly" ? 10 : 120'));
});
