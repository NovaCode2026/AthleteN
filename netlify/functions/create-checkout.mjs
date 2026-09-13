import { createClient } from "@supabase/supabase-js";
import { authenticate, env, json, logPaymentEvent, planPricesMinor, providerPlanKey, requireApprovedStudent, serverSupabase, siteUrl } from "../payment-common.mjs";

const paidPlans = new Set(["student", "pro", "champion"]);
const providers = new Set(["razorpay", "stripe", "cashfree"]);

async function razorpayCheckout(supabase, user, planId, amountMinor, verificationId) {
  const keyId = env("RAZORPAY_KEY_ID");
  const secret = env("RAZORPAY_KEY_SECRET");
  const planKey = env(providerPlanKey("RAZORPAY", planId));
  if (!keyId || !secret || !planKey) throw new Error("RAZORPAY_NOT_CONFIGURED");

  const auth = Buffer.from(`${keyId}:${secret}`).toString("base64");
  const response = await fetch("https://api.razorpay.com/v1/subscriptions", {
    method: "POST",
    headers: { Authorization: `Basic ${auth}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      plan_id: planKey,
      total_count: 120,
      customer_notify: 1,
      notes: { athleteos_user_id: user.id, athleteos_plan_id: planId, verification_id: verificationId }
    })
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok || !data.id) throw new Error("RAZORPAY_CHECKOUT_CREATE_FAILED");

  const { data: order, error } = await supabase.from("payment_orders").insert({
    user_id: user.id, plan_id: planId, provider: "razorpay", amount_minor: amountMinor,
    currency: "INR", status: "pending", verification_id: verificationId,
    provider_subscription_id: data.id, checkout_url: data.short_url || null,
    metadata: { provider_plan_id: planKey }
  }).select().single();
  if (error) throw error;
  return { orderId: order.id, provider: "razorpay", checkoutUrl: data.short_url, providerSubscriptionId: data.id };
}

async function stripeCheckout(supabase, user, planId, amountMinor, verificationId) {
  const secret = env("STRIPE_SECRET_KEY");
  const priceId = env(providerPlanKey("STRIPE", planId));
  if (!secret || !priceId) throw new Error("STRIPE_NOT_CONFIGURED");

  const params = new URLSearchParams();
  params.set("mode", "subscription");
  params.set("line_items[0][price]", priceId);
  params.set("line_items[0][quantity]", "1");
  params.set("success_url", `${siteUrl()}/checkout/success?session_id={CHECKOUT_SESSION_ID}`);
  params.set("cancel_url", `${siteUrl()}/checkout/cancel`);
  params.set("client_reference_id", user.id);
  params.set("metadata[user_id]", user.id);
  params.set("metadata[plan_id]", planId);
  params.set("metadata[verification_id]", verificationId);
  params.set("subscription_data[metadata][user_id]", user.id);
  params.set("subscription_data[metadata][plan_id]", planId);
  params.set("subscription_data[metadata][verification_id]", verificationId);

  const response = await fetch("https://api.stripe.com/v1/checkout/sessions", {
    method: "POST",
    headers: { Authorization: `Bearer ${secret}`, "Content-Type": "application/x-www-form-urlencoded" },
    body: params
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok || !data.id || !data.url) throw new Error("STRIPE_CHECKOUT_CREATE_FAILED");

  const { data: order, error } = await supabase.from("payment_orders").insert({
    user_id: user.id, plan_id: planId, provider: "stripe", amount_minor: amountMinor,
    currency: "INR", status: "pending", verification_id: verificationId,
    provider_order_id: data.id, checkout_url: data.url,
    metadata: { provider_price_id: priceId }
  }).select().single();
  if (error) throw error;
  return { orderId: order.id, provider: "stripe", checkoutUrl: data.url, providerSessionId: data.id };
}

async function cashfreeCheckout(supabase, user, planId, amountMinor, verificationId) {
  const clientId = env("CASHFREE_CLIENT_ID");
  const clientSecret = env("CASHFREE_CLIENT_SECRET");
  if (!clientId || !clientSecret) throw new Error("CASHFREE_NOT_CONFIGURED");

  const amount = amountMinor / 100;
  const response = await fetch("https://api.cashfree.com/pg/orders", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-client-id": clientId,
      "x-client-secret": clientSecret,
      "x-api-version": "2023-08-01"
    },
    body: JSON.stringify({
      order_id: `athleteos_${crypto.randomUUID().replaceAll("-", "")}`,
      order_amount: amount,
      order_currency: "INR",
      customer_details: { customer_id: user.id, customer_email: user.email || "athlete@athleteos.local" },
      order_meta: {
        return_url: `${siteUrl()}/checkout/success?order_id={order_id}`,
        notify_url: `${siteUrl()}/.netlify/functions/payment-webhook`
      },
      order_note: JSON.stringify({ user_id: user.id, plan_id: planId, verification_id: verificationId })
    })
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok || !data.order_id || !data.payment_session_id) throw new Error("CASHFREE_CHECKOUT_CREATE_FAILED");

  const { data: order, error } = await supabase.from("payment_orders").insert({
    user_id: user.id, plan_id: planId, provider: "cashfree", amount_minor: amountMinor,
    currency: "INR", status: "pending", verification_id: verificationId,
    provider_order_id: data.order_id,
    metadata: { payment_session_id: data.payment_session_id }
  }).select().single();
  if (error) throw error;
  return { orderId: order.id, provider: "cashfree", paymentSessionId: data.payment_session_id, providerOrderId: data.order_id };
}

export default async function handler(request) {
  if (request.method !== "POST") return json({ error: "Method not allowed." }, 405);
  try {
    const user = await authenticate(request);
    if (!user) return json({ error: "Please sign in before checkout." }, 401);
    const body = await request.json().catch(() => ({}));
    const planId = String(body.planId || "").toLowerCase();
    const provider = String(body.provider || env("PAYMENT_PROVIDER") || "razorpay").toLowerCase();
    if (!paidPlans.has(planId)) return json({ error: "This plan is not available for automated checkout." }, 400);
    if (!providers.has(provider)) return json({ error: "Unsupported payment provider." }, 400);

    const supabase = serverSupabase();
    const verification = await requireApprovedStudent(supabase, user.id);
    if (!verification) return json({ error: "Student ID approval is required before payment." }, 403);

    const amountMinor = planPricesMinor[planId];
    const result = provider === "razorpay"
      ? await razorpayCheckout(supabase, user, planId, amountMinor, verification.id)
      : provider === "stripe"
        ? await stripeCheckout(supabase, user, planId, amountMinor, verification.id)
        : await cashfreeCheckout(supabase, user, planId, amountMinor, verification.id);

    await logPaymentEvent(supabase, {
      user_id: user.id, provider, event_type: "checkout.created", amount_minor: amountMinor,
      currency: "INR", status: "pending", metadata: { plan_id: planId, payment_order_id: result.orderId, verification_id: verification.id }
    });
    return json({ ...result, planId, amountMinor, currency: "INR", verification: "approved" });
  } catch (error) {
    console.error("create-checkout", error);
    const code = error instanceof Error ? error.message : "CHECKOUT_FAILED";
    if (code === "RAZORPAY_NOT_CONFIGURED" || code === "STRIPE_NOT_CONFIGURED" || code === "CASHFREE_NOT_CONFIGURED") {
      return json({ error: "The selected payment provider is not configured on the server yet." }, 503);
    }
    return json({ error: "Unable to start checkout." }, 503);
  }
}
