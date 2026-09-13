import { createHmac, timingSafeEqual } from "node:crypto";
import { env, json, logPaymentEvent, serverSupabase } from "../payment-common.mjs";

function safeEqual(a, b) {
  const aa = Buffer.from(a || "");
  const bb = Buffer.from(b || "");
  return aa.length === bb.length && timingSafeEqual(aa, bb);
}

function razorpayWebhookValid(raw, signature) {
  const secret = env("RAZORPAY_WEBHOOK_SECRET");
  if (!secret || !signature) return false;
  return safeEqual(createHmac("sha256", secret).update(raw).digest("hex"), signature);
}

function stripeWebhookValid(raw, signature) {
  const secret = env("STRIPE_WEBHOOK_SECRET");
  if (!secret || !signature) return false;
  const parts = Object.fromEntries(signature.split(",").map((part) => part.split("=", 2)));
  if (!parts.t || !parts.v1) return false;
  const age = Math.abs(Date.now() / 1000 - Number(parts.t));
  if (!Number.isFinite(age) || age > 300) return false;
  return safeEqual(createHmac("sha256", secret).update(`${parts.t}.${raw}`).digest("hex"), parts.v1);
}

function cashfreeWebhookValid(raw, request) {
  const secret = env("CASHFREE_CLIENT_SECRET");
  const signature = request.headers.get("x-webhook-signature");
  const timestamp = request.headers.get("x-webhook-timestamp");
  if (!secret || !signature || !timestamp) return false;
  return safeEqual(createHmac("sha256", secret).update(`${timestamp}${raw}`).digest("base64"), signature);
}

async function activateFromOrder(supabase, order, providerPaymentId, providerCustomerId, providerSubscriptionId, periodEnd, eventType, metadata = {}) {
  if (!order || order.status === "paid") return;
  const { error: updateError } = await supabase.from("payment_orders").update({
    status: "paid", provider_payment_id: providerPaymentId || order.provider_payment_id,
    provider_customer_id: providerCustomerId || order.provider_customer_id,
    provider_subscription_id: providerSubscriptionId || order.provider_subscription_id,
    paid_at: new Date().toISOString(), updated_at: new Date().toISOString(), metadata: { ...order.metadata, ...metadata }
  }).eq("id", order.id);
  if (updateError) throw updateError;

  const { error } = await supabase.rpc("activate_paid_subscription", {
    p_user_id: order.user_id,
    p_plan_id: order.plan_id,
    p_provider: order.provider,
    p_provider_customer_id: providerCustomerId || order.provider_customer_id || null,
    p_provider_subscription_id: providerSubscriptionId || order.provider_subscription_id || null,
    p_current_period_end: periodEnd || null
  });
  if (error) throw error;

  await logPaymentEvent(supabase, {
    user_id: order.user_id, provider: order.provider, event_type: eventType,
    provider_event_id: metadata.provider_event_id || null, amount_minor: order.amount_minor,
    currency: order.currency, status: "paid", metadata: { payment_order_id: order.id, plan_id: order.plan_id, ...metadata }
  });
}

export default async function handler(request) {
  if (request.method !== "POST") return json({ error: "Method not allowed." }, 405);
  const provider = String(request.headers.get("x-athleteos-provider") || env("PAYMENT_PROVIDER") || "").toLowerCase();
  const raw = await request.text();
  if (!provider) return json({ error: "Payment provider is not configured." }, 503);

  try {
    let payload;
    if (provider === "razorpay") {
      if (!razorpayWebhookValid(raw, request.headers.get("x-razorpay-signature"))) return json({ error: "Invalid webhook signature." }, 401);
      payload = JSON.parse(raw);
    } else if (provider === "stripe") {
      if (!stripeWebhookValid(raw, request.headers.get("stripe-signature"))) return json({ error: "Invalid webhook signature." }, 401);
      payload = JSON.parse(raw);
    } else if (provider === "cashfree") {
      if (!cashfreeWebhookValid(raw, request)) return json({ error: "Invalid webhook signature." }, 401);
      payload = JSON.parse(raw);
    } else return json({ error: "Unsupported payment provider." }, 400);

    const supabase = serverSupabase();
    if (provider === "razorpay") {
      const event = payload.event;
      if (!new Set(["subscription.charged", "payment.captured"]).has(event)) return json({ received: true });
      const entity = payload.payload?.subscription?.entity || payload.payload?.payment?.entity;
      const providerOrderId = entity?.id || entity?.order_id;
      if (!providerOrderId) return json({ received: true });
      const { data: order } = await supabase.from("payment_orders").select("*").eq("provider", "razorpay").eq("provider_subscription_id", providerOrderId).maybeSingle();
      if (!order && entity?.order_id) {
        const { data: byOrder } = await supabase.from("payment_orders").select("*").eq("provider_order_id", entity.order_id).maybeSingle();
        if (byOrder) await activateFromOrder(supabase, byOrder, entity.id, null, byOrder.provider_subscription_id, null, event, { provider_event_id: entity.id });
      } else if (order) {
        await activateFromOrder(supabase, order, entity.id, null, order.provider_subscription_id, null, event, { provider_event_id: entity.id });
      }
    } else if (provider === "stripe") {
      const event = payload.type;
      if (event !== "checkout.session.completed") return json({ received: true });
      const session = payload.data?.object;
      if (session?.payment_status !== "paid") return json({ received: true });
      const { data: order } = await supabase.from("payment_orders").select("*").eq("provider", "stripe").eq("provider_order_id", session.id).maybeSingle();
      if (order) await activateFromOrder(supabase, order, session.payment_intent, session.customer, session.subscription, null, event, { provider_event_id: payload.id });
    } else {
      const event = payload.type || payload.event;
      if (!String(event).toLowerCase().includes("success") && !String(event).toLowerCase().includes("paid") && event !== "PAYMENT_SUCCESS_WEBHOOK") return json({ received: true });
      const providerOrderId = payload.data?.order?.order_id || payload.data?.order_id || payload.order_id;
      const providerPaymentId = payload.data?.payment?.cf_payment_id || payload.data?.cf_payment_id || payload.cf_payment_id;
      const { data: order } = await supabase.from("payment_orders").select("*").eq("provider", "cashfree").eq("provider_order_id", providerOrderId).maybeSingle();
      if (order) await activateFromOrder(supabase, order, String(providerPaymentId || ""), null, null, null, String(event || "payment.success"), {});
    }
    return json({ received: true });
  } catch (error) {
    console.error("payment-webhook", error);
    return json({ error: "Webhook processing failed." }, 500);
  }
}
