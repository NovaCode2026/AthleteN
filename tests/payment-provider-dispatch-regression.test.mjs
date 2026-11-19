import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const checkout = readFileSync(new URL("../netlify/functions/create-checkout.mjs", import.meta.url), "utf8");

test("paid checkout dispatches each configured provider to its matching adapter", () => {
  assert.match(checkout, /new Set\(\["razorpay",\s*"stripe",\s*"cashfree"\]\)/);
  assert.match(checkout, /const checkoutByProvider = \{[\s\S]*razorpay:\s*razorpayCheckout,[\s\S]*stripe:\s*stripeCheckout,[\s\S]*cashfree:\s*cashfreeCheckout[\s\S]*\}/);
  assert.match(checkout, /checkoutByProvider\[provider\]\(supabase, user, planId, amountMinor, null\)/);
  assert.match(checkout, /const FREE_LAUNCH = true/);
});
