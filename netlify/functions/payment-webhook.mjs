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
  if (!order) return;
  const periodEndDate = periodEnd ? new Date(periodEnd) : null;
  if (!periodEndDate || !Number.isFinite(periodEndDate.getTime()) || periodEndDate.getTime() <= Date.now()) {
    throw new Error("VALID_SUBSCRIPTION_PERIOD_REQUIRED");
  }

  // Activate first. If the database rejects role, age/guardian or billing-period
  // checks, the order remains pending so a legitimate provider retry can recover.
  const { error } = await supabase.rpc("activate_paid_subscription", {
    p_user_id: order.user_id,
    p_plan_id: order.plan_id,
    p_provider: order.provider,
    p_provider_customer_id: providerCustomerId || order.provider_customer_id || null,
    p_provider_subscription_id: providerSubscriptionId || order.provider_subscription_id || null,
    p_current_period_end: periodEndDate.toISOString()
  });
  if (error) throw error;

  const now = new Date().toISOString();
  const { error: updateError } = await supabase.from("payment_orders").update({
    status: "paid", provider_payment_id: providerPaymentId || order.provider_payment_id,
    provider_customer_id: providerCustomerId || order.provider_customer_id,
    provider_subscription_id: providerSubscriptionId || order.provider_subscription_id,
    paid_at: order.paid_at || now, updated_at: now,
    metadata: { ...order.metadata, ...metadata, current_period_end: periodEndDate.toISOString() }
  }).eq("id", order.id);
  if (updateError) throw updateError;

  await logPaymentEvent(supabase, {
    user_id: order.user_id, provider: order.provider, event_type: eventType,
    provider_event_id: metadata.provider_event_id || null, amount_minor: order.amount_minor,
    currency: order.currency, status: "paid", metadata: { payment_order_id: order.id, plan_id: order.plan_id, ...metadata }
  });
}

function unixSecondsToIso(value) {
  const seconds = Number(value);
  if (!Number.isFinite(seconds) || seconds <= 0) return null;
  const date = new Date(seconds * 1000);
  return Number.isFinite(date.getTime()) ? date.toISOString() : null;
}

function stripeSubscriptionPeriodEnd(subscription) {
  const items = Array.isArray(subscription?.items?.data) ? subscription.items.data : [];
  const seconds = subscription?.current_period_end ?? items
    .map((item) => item?.current_period_end)
    .filter((value) => Number.isFinite(Number(value)))
    .reduce((minimum, value) => minimum === null ? Number(value) : Math.min(minimum, Number(value)), null);
  return unixSecondsToIso(seconds);
}

async function retrieveStripeSubscription(subscriptionId) {
  const secret = env("STRIPE_SECRET_KEY");
  if (!secret || !subscriptionId) throw new Error("STRIPE_SUBSCRIPTION_LOOKUP_UNAVAILABLE");
  const response = await fetch("https://api.stripe.com/v1/subscriptions/" + encodeURIComponent(subscriptionId), {
    method: "GET",
    headers: { Authorization: `Bearer ${secret}` }
  });
  const subscription = await response.json().catch(() => ({}));
  if (!response.ok || !subscription?.id) throw new Error("STRIPE_SUBSCRIPTION_LOOKUP_FAILED");
  if (!["active", "trialing"].includes(String(subscription.status))) {
    throw new Error("STRIPE_SUBSCRIPTION_NOT_ACTIVE");
  }
  const periodEnd = stripeSubscriptionPeriodEnd(subscription);
  if (!periodEnd || new Date(periodEnd).getTime() <= Date.now()) {
    throw new Error("VALID_SUBSCRIPTION_PERIOD_REQUIRED");
  }
  return {
    id: subscription.id,
    customerId: typeof subscription.customer === "string" ? subscription.customer : subscription.customer?.id || null,
    periodEnd
  };
}

async function setExistingSubscriptionStatus(supabase, provider, providerSubscriptionId, status, periodEnd = null) {
  if (!providerSubscriptionId || !["active", "past_due", "canceled"].includes(status)) return;
  const update = { status, updated_at: new Date().toISOString() };
  if (periodEnd) update.current_period_end = periodEnd;
  const { error } = await supabase.from("subscriptions").update(update)
    .eq("provider", provider)
    .eq("provider_subscription_id", providerSubscriptionId);
  if (error) throw error;
}

async function activateTrialFromOrder(supabase, order, providerPaymentId, eventType, metadata = {}) {
  if (!order) return;
  if (order.status === "paid") return;
  if (Number(order.amount_minor) !== 900) throw new Error("INVALID_TRIAL_AMOUNT");
  if (order.metadata?.purpose !== "trial") return;

  const paymentReference = String(providerPaymentId || order.provider_order_id || "");
  if (!paymentReference) throw new Error("TRIAL_PAYMENT_REFERENCE_MISSING");

  const { error: trialError } = await supabase.rpc("activate_trial_after_payment", {
    p_user_id: order.user_id,
    p_plan_id: order.plan_id,
    p_provider: order.provider,
    p_payment_reference: paymentReference,
    p_amount_paise: 900
  });
  if (trialError) throw trialError;

  const { error: updateError } = await supabase.from("payment_orders").update({
    status: "paid",
    provider_payment_id: providerPaymentId || order.provider_payment_id,
    paid_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    metadata: { ...order.metadata, ...metadata, purpose: "trial" }
  }).eq("id", order.id).eq("status", "pending");
  if (updateError) throw updateError;

  await logPaymentEvent(supabase, {
    user_id: order.user_id,
    provider: order.provider,
    event_type: eventType,
    provider_event_id: metadata.provider_event_id || null,
    amount_minor: order.amount_minor,
    currency: order.currency,
    status: "paid",
    metadata: { payment_order_id: order.id, plan_id: order.plan_id, purpose: "trial", ...metadata }
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
      const subscription = payload.payload?.subscription?.entity;
      const payment = payload.payload?.payment?.entity;
      const eventId = request.headers.get("x-razorpay-event-id") || payload.id || null;

      if (event === "payment.captured" && payment?.order_id) {
        const { data: trialOrder } = await supabase.from("payment_orders").select("*")
          .eq("provider", "razorpay").eq("provider_order_id", payment.order_id).maybeSingle();
        if (trialOrder?.metadata?.purpose === "trial") {
          await activateTrialFromOrder(supabase, trialOrder, String(payment.id || ""), event, {
            provider_event_id: eventId, razorpay_payment_id: String(payment.id || "")
          });
          return json({ received: true });
        }
      }

      if (event === "subscription.pending" || event === "subscription.halted" || event === "subscription.cancelled" || event === "subscription.completed") {
        const id = subscription?.id;
        if (id) await setExistingSubscriptionStatus(
          supabase, "razorpay", id,
          event === "subscription.cancelled" || event === "subscription.completed" ? "canceled" : "past_due"
        );
        return json({ received: true });
      }

      if (event === "subscription.charged") {
        if (!subscription?.id) return json({ error: "Subscription reference is missing." }, 400);
        const periodEnd = unixSecondsToIso(subscription.current_end);
        const { data: order, error: orderError } = await supabase.from("payment_orders").select("*")
          .eq("provider", "razorpay").eq("provider_subscription_id", subscription.id).maybeSingle();
        if (orderError) throw orderError;
        if (order) {
          await activateFromOrder(
            supabase, order, payment?.id || null, subscription.customer_id || null,
            subscription.id, periodEnd, event,
            { provider_event_id: eventId, razorpay_payment_id: payment?.id || null }
          );
        }
      }
    } else if (provider === "stripe") {
      const event = payload.type;
      const object = payload.data?.object;

      if (event === "invoice.payment_failed") {
        const subscriptionId = object?.subscription
          || object?.parent?.subscription_details?.subscription
          || null;
        if (subscriptionId) await setExistingSubscriptionStatus(supabase, "stripe", subscriptionId, "past_due");
        return json({ received: true });
      }

      if (event === "customer.subscription.deleted") {
        if (object?.id) await setExistingSubscriptionStatus(supabase, "stripe", object.id, "canceled");
        return json({ received: true });
      }

      if (event === "customer.subscription.paused") {
        if (object?.id) await setExistingSubscriptionStatus(supabase, "stripe", object.id, "past_due");
        return json({ received: true });
      }

      if (event === "checkout.session.completed") {
        const session = object;
        if (session?.payment_status !== "paid") return json({ received: true });
        const { data: order, error: orderError } = await supabase.from("payment_orders").select("*")
          .eq("provider", "stripe").eq("provider_order_id", session.id).maybeSingle();
        if (orderError) throw orderError;
        if (!order) return json({ received: true });
        if (order.metadata?.purpose === "trial" || session.metadata?.purpose === "trial") {
          await activateTrialFromOrder(supabase, order, session.payment_intent || session.id, event, {
            provider_event_id: payload.id, stripe_session_id: session.id
          });
          return json({ received: true });
        }
        const stripeSubscription = await retrieveStripeSubscription(
          typeof session.subscription === "string" ? session.subscription : session.subscription?.id
        );
        await activateFromOrder(
          supabase, order, session.payment_intent, stripeSubscription.customerId,
          stripeSubscription.id, stripeSubscription.periodEnd, event,
          { provider_event_id: payload.id, stripe_session_id: session.id }
        );
        return json({ received: true });
      }

      if (event === "invoice.paid") {
        const invoice = object;
        const subscriptionId = invoice?.subscription
          || invoice?.parent?.subscription_details?.subscription
          || null;
        if (!subscriptionId) return json({ received: true });
        const { data: order, error: orderError } = await supabase.from("payment_orders").select("*")
          .eq("provider", "stripe").eq("provider_subscription_id", subscriptionId).maybeSingle();
        if (orderError) throw orderError;
        if (!order) return json({ received: true });
        const stripeSubscription = await retrieveStripeSubscription(subscriptionId);
        await activateFromOrder(
          supabase, order, invoice.payment_intent || null, stripeSubscription.customerId,
          stripeSubscription.id, stripeSubscription.periodEnd, event,
          { provider_event_id: payload.id, stripe_invoice_id: invoice.id }
        );
      }
    } else {
      const event = payload.type || payload.event;
      if (!String(event).toLowerCase().includes("success") && !String(event).toLowerCase().includes("paid") && event !== "PAYMENT_SUCCESS_WEBHOOK") return json({ received: true });
      const providerOrderId = payload.data?.order?.order_id || payload.data?.order_id || payload.order_id;
      const providerPaymentId = payload.data?.payment?.cf_payment_id || payload.data?.cf_payment_id || payload.cf_payment_id;
      const { data: order } = await supabase.from("payment_orders").select("*").eq("provider", "cashfree").eq("provider_order_id", providerOrderId).maybeSingle();
      if (order?.metadata?.purpose === "trial") {
        await activateTrialFromOrder(
          supabase, order, String(providerPaymentId || providerOrderId || ""),
          String(event || "payment.success"),
          { provider_event_id: String(providerPaymentId || providerOrderId || ""), cashfree_order_id: providerOrderId }
        );
      } else if (order) {
        // Cashfree PG /pg/orders is a one-time payment API. A one-time payment
        // must never activate a recurring AthleteN subscription.
        await logPaymentEvent(supabase, {
          user_id: order.user_id, provider: "cashfree", event_type: "one_time_payment_received_not_subscription",
          provider_event_id: payload.data?.payment?.cf_payment_id || payload.cf_payment_id || null,
          amount_minor: order.amount_minor, currency: order.currency, status: "paid",
          metadata: { payment_order_id: order.id, provider_order_id: providerOrderId, subscription_activation: "not_supported" }
        });
      }
    }
    return json({ received: true });
  } catch (error) {
    console.error("payment-webhook", error);
    return json({ error: "Webhook processing failed." }, 500);
  }
}
