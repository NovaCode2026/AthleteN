import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const endpoint = readFileSync(new URL("../netlify/functions/cancel-subscription.mjs", import.meta.url), "utf8");
const webhook = readFileSync(new URL("../netlify/functions/payment-webhook.mjs", import.meta.url), "utf8");
const migration = readFileSync(new URL("../supabase/migrations/20261118000500_subscription_cancel_at_period_end.sql", import.meta.url), "utf8");
const webPlans = readFileSync(new URL("../src/App.tsx", import.meta.url), "utf8");
const mobilePlans = readFileSync(new URL("../AthleteN-Mobile/src/app/plans.tsx", import.meta.url), "utf8");

test("cancellation endpoint authenticates the caller and scopes subscription lookup to that user", () => {
  assert.ok(endpoint.includes("const user = await authenticate(request)"));
  assert.ok(endpoint.includes('.eq("id", subscriptionId)'));
  assert.ok(endpoint.includes('.eq("user_id", user.id)'));
  assert.ok(endpoint.includes("subscription.provider_subscription_id"));
});

test("cancellation is scheduled at period end for supported recurring providers only", () => {
  assert.ok(endpoint.includes("cancel_at_period_end: true"));
  assert.ok(endpoint.includes("cancel_at_cycle_end: true"));
  assert.ok(endpoint.includes('["stripe", "razorpay"].includes(subscription.provider)'));
  assert.ok(endpoint.includes("storedPeriodEnd.getTime() <= Date.now()"));
  assert.ok(endpoint.includes("currentPeriodEnd"));
});

test("cancellation state is persisted as a non-null false-by-default field", () => {
  assert.ok(migration.includes("ADD COLUMN IF NOT EXISTS cancel_at_period_end boolean NOT NULL DEFAULT false"));
});

test("Stripe subscription.updated webhooks synchronize scheduled cancellation", () => {
  assert.ok(webhook.includes('event === "customer.subscription.updated"'));
  assert.ok(webhook.includes("object.cancel_at_period_end === true"));
  assert.ok(webhook.includes("update.cancel_at_period_end = cancelAtPeriodEnd"));
});

test("web and mobile Plans pages expose period-end cancellation with confirmation", () => {
  assert.ok(webPlans.includes("/.netlify/functions/cancel-subscription"));
  assert.ok(webPlans.includes("Cancel at period end"));
  assert.ok(webPlans.includes("window.confirm("));
  assert.ok(mobilePlans.includes("/.netlify/functions/cancel-subscription"));
  assert.ok(mobilePlans.includes("Alert.alert("));
  assert.ok(mobilePlans.includes("CANCEL AT PERIOD END"));
});


test("provider cancellation requests use fixed validated API origins", () => {
  assert.ok(endpoint.includes('const stripeApiOrigin = "https://api.stripe.com"'));
  assert.ok(endpoint.includes("subscriptionUrl.origin !== stripeApiOrigin"));
  assert.ok(endpoint.includes('const razorpayApiOrigin = "https://api.razorpay.com"'));
  assert.ok(endpoint.includes("subscriptionUrl.origin !== razorpayApiOrigin"));
  assert.ok(endpoint.includes('subscriptionUrl.pathname.endsWith("/cancel")'));
});
