import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const webhook = readFileSync(new URL("../netlify/functions/payment-webhook.mjs", import.meta.url), "utf8");
const migration = readFileSync(new URL("../supabase/migrations/20261118000600_payment_webhook_event_receipts.sql", import.meta.url), "utf8");

test("signed webhook events are claimed durably before provider-specific effects", () => {
  const signatureValidation = webhook.indexOf("stripeWebhookValid(raw");
  const claim = webhook.indexOf("claimWebhookEvent(supabase");
  const providerEffects = webhook.indexOf('if (provider === "razorpay") {', claim);
  assert.ok(signatureValidation >= 0 && claim > signatureValidation);
  assert.ok(providerEffects > claim);
  assert.ok(webhook.includes('supabase.rpc("claim_payment_webhook_event"'));
  assert.ok(webhook.includes('supabase.rpc("complete_payment_webhook_event"'));
  assert.ok(webhook.includes('supabase.rpc("fail_payment_webhook_event"'));
});

test("duplicate webhook processing is acknowledged only after it was completed", () => {
  assert.match(webhook, /if \(claim\.duplicate\) return json\(\{ received: true, duplicate: true \}\)/);
  assert.match(webhook, /if \(claim\.inProgress\)[\s\S]*?return json\([\s\S]*?, 503\)/);
  assert.match(migration, /PRIMARY KEY \(provider, provider_event_id\)/);
  assert.match(migration, /status = 'processed'/);
  assert.match(migration, /status = 'failed'/);
  assert.match(migration, /locked_until > v_now/);
});

test("Stripe signature validation supports multiple v1 signatures and enforces freshness", () => {
  assert.ok(webhook.includes('fields.filter(([key]) => key === "v1")'));
  assert.ok(webhook.includes("signatures.some((candidate) => safeEqual(expected, candidate))"));
  assert.ok(webhook.includes("age > 300"));
});

test("provider subscription data must match the stored order before subscription activation", () => {
  assert.ok(webhook.includes("assertStripeSubscriptionMatchesOrder(stripeSubscription, order)"));
  assert.ok(webhook.includes("subscription.notes?.athleten_user_id !== order.user_id"));
  assert.ok(webhook.includes("Number(payment?.amount) !== Number(order.amount_minor)"));
  assert.ok(webhook.includes("STRIPE_CHECKOUT_ORDER_MISMATCH"));
});

test("failed and cancelled payment orders cannot reactivate a paid subscription", () => {
  assert.ok(webhook.includes('["failed", "refunded", "cancelled", "canceled"]'));
  assert.ok(webhook.includes("PAYMENT_ORDER_NOT_ACTIVATABLE"));
});

test("failed one-time trial payment events release the pending trial status", () => {
  assert.ok(webhook.includes('event === "payment.failed"'));
  assert.ok(webhook.includes('event === "checkout.session.expired"'));
  assert.ok(webhook.includes('event === "checkout.session.async_payment_failed"'));
  assert.ok(webhook.includes('normalizedEvent.includes("user_dropped")'));
  assert.ok(webhook.includes("markTrialOrderFailed(supabase"));
  assert.ok(webhook.includes('trial_payment_status: "failed"'));
  assert.ok(webhook.includes('status: "failed"'));
});
