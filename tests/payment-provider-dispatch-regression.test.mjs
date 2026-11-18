import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const checkout = readFileSync(new URL("../netlify/functions/create-checkout.mjs", import.meta.url), "utf8");

test("paid checkout routes each enabled provider to its matching adapter", () => {
  assert.ok(checkout.includes('const providers = new Set(["razorpay", "stripe", "cashfree"]);'));
  assert.ok(checkout.includes("const checkoutByProvider = {"));
  assert.ok(checkout.includes("razorpay: razorpayCheckout,"));
  assert.ok(checkout.includes("stripe: stripeCheckout,"));
  assert.ok(checkout.includes("cashfree: cashfreeCheckout"));
  assert.ok(checkout.includes("checkoutByProvider[provider](supabase, user, planId, amountMinor, null);"));
  assert.ok(checkout.includes("const FREE_LAUNCH = true"));
});

test("paid checkout requires confirmed email and server-verified age or guardian approval", () => {
  assert.ok(checkout.includes("if (!user.email_confirmed_at)"));
  assert.ok(checkout.includes('supabase.rpc("is_age_approved"'));
  assert.ok(checkout.includes("if (ageApproved !== true)"));
});

test("Cashfree never substitutes a fake customer email", () => {
  assert.ok(checkout.includes("CASHFREE_CUSTOMER_EMAIL_REQUIRED"));
  assert.ok(checkout.includes("customer_email: user.email.trim().toLowerCase()"));
  assert.ok(!checkout.includes("athlete@athleten.local"));
});
