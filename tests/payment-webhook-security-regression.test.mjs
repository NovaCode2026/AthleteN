import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const webhook = readFileSync(new URL("../netlify/functions/payment-webhook.mjs", import.meta.url), "utf8");
const activationMigration = readFileSync(new URL("../supabase/migrations/20261118000300_harden_paid_subscription_activation.sql", import.meta.url), "utf8");

test("payment activation refuses an absent or expired billing period", () => {
  assert.ok(webhook.includes("VALID_SUBSCRIPTION_PERIOD_REQUIRED"));
  assert.ok(webhook.includes("periodEndDate.getTime() <= Date.now()"));
  assert.ok(activationMigration.includes("p_current_period_end IS NULL OR p_current_period_end <= pg_catalog.now()"));
});

test("payment order is only marked paid after the activation RPC succeeds", () => {
  const rpcAt = webhook.indexOf('supabase.rpc("activate_paid_subscription"');
  const orderPaidAt = webhook.indexOf('status: "paid"', rpcAt);
  assert.ok(rpcAt >= 0);
  assert.ok(orderPaidAt > rpcAt);
  assert.ok(webhook.indexOf("if (error) throw error;", rpcAt) < orderPaidAt);
});

test("Stripe period end supports current subscription-item API fields", () => {
  assert.ok(webhook.includes("subscription?.current_period_end"));
  assert.ok(webhook.includes("item?.current_period_end"));
  assert.ok(webhook.includes('const stripeApiOrigin = "https://api.stripe.com";'));
  assert.ok(webhook.includes('subscriptionUrl.origin !== stripeApiOrigin'));
  assert.ok(webhook.includes('subscriptionUrl.pathname.startsWith("/v1/subscriptions/")'));
  assert.ok(webhook.includes('fetch(subscriptionUrl,'));
  assert.ok(webhook.includes('["active", "trialing"].includes(String(subscription.status))'));
});

test("Razorpay renewals use the subscription billing-period end and event ID", () => {
  assert.ok(webhook.includes('request.headers.get("x-razorpay-event-id")'));
  assert.ok(webhook.includes("unixSecondsToIso(subscription.current_end)"));
  assert.ok(webhook.includes('"subscription.charged"'));
});

test("Cashfree one-time PG orders cannot activate recurring subscriptions", () => {
  const cashfreeStart = webhook.indexOf('} else {\n      const event = payload.type || payload.event;');
  const cashfreeBody = webhook.slice(cashfreeStart);
  assert.ok(cashfreeBody.includes("one_time_payment_received_not_subscription"));
  assert.ok(!cashfreeBody.includes("await activateFromOrder("));
});

test("subscription cancellation and failed collection revoke active entitlement status", () => {
  assert.ok(webhook.includes('"invoice.payment_failed"'));
  assert.ok(webhook.includes('"customer.subscription.deleted"'));
  assert.ok(webhook.includes('"subscription.halted"'));
  assert.ok(webhook.includes('"subscription.cancelled"'));
});

test("activation checks approval and keeps service-role-only execution", () => {
  assert.ok(activationMigration.includes("public.is_age_approved(p_user_id)"));
  assert.ok(activationMigration.includes("AGE_OR_GUARDIAN_APPROVAL_REQUIRED"));
  assert.ok(activationMigration.includes("FROM PUBLIC, anon, authenticated"));
  assert.ok(activationMigration.includes("TO service_role"));
});

test("payment event IDs have a database uniqueness constraint", () => {
  assert.ok(activationMigration.includes("payment_events_provider_event_id_uidx"));
  assert.ok(activationMigration.includes("ON public.payment_events(provider, provider_event_id)"));
});
