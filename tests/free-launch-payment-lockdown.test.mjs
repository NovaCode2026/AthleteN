import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const webPlans = readFileSync(new URL("../src/config/plans.ts", import.meta.url), "utf8");
const webCheckout = readFileSync(new URL("../netlify/functions/create-checkout.mjs", import.meta.url), "utf8");
const webTrialCheckout = readFileSync(new URL("../netlify/functions/create-trial-checkout.mjs", import.meta.url), "utf8");
const mobilePlans = readFileSync(new URL("../AthleteN-Mobile/src/app/plans.tsx", import.meta.url), "utf8");

test("web plan UI keeps paid checkout disabled during Free launch", () => {
  assert.match(webPlans, /export const paidCheckoutEnabled = false/);
});

test("web subscription and trial API endpoints fail closed during Free launch", () => {
  assert.match(webCheckout, /const FREE_LAUNCH = true/);
  assert.match(webCheckout, /if \(FREE_LAUNCH\)[\s\S]*?return json\([\s\S]*?, 503\)/);
  assert.match(webTrialCheckout, /const FREE_LAUNCH = true/);
  assert.match(webTrialCheckout, /if \(FREE_LAUNCH\)[\s\S]*?return json\([\s\S]*?, 503\)/);
});

test("mobile plan UI keeps paid checkout disabled during Free launch", () => {
  assert.match(mobilePlans, /const PAID_CHECKOUT_ENABLED = false/);
  assert.match(mobilePlans, /if \(!PAID_CHECKOUT_ENABLED\)[\s\S]*?Paid checkout/);
});
