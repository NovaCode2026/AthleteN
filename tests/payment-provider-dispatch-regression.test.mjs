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
