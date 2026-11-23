import { createHash, createHmac, timingSafeEqual } from "node:crypto";
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
  const fields = signature.split(",").map((part) => {
    const separator = part.indexOf("=");
    return separator < 0 ? null : [part.slice(0, separator).trim(), part.slice(separator + 1).trim()];
  }).filter(Boolean);
  const timestamp = fields.find(([key]) => key === "t")?.[1];
  const signatures = fields.filter(([key]) => key === "v1").map(([, value]) => value);
  if (!timestamp || !/^\d+$/.test(timestamp) || signatures.length === 0) return false;
  const age = Math.abs(Date.now() / 1000 - Number(timestamp));
  if (!Number.isFinite(age) || age > 300) return false;
  const expected = createHmac("sha256", secret).update(`${timestamp}.${raw}`).digest("hex");
  return signatures.some((candidate) => safeEqual(expected, candidate));
}

function cashfreeWebhookValid(raw, request) {
  const secret = env("CASHFREE_CLIENT_SECRET");
  const signature = request.headers.get("x-webhook-signature");
  const timestamp = request.headers.get("x-webhook-timestamp");
  if (!secret || !signature || !timestamp) return false;
  return safeEqual(createHmac("sha256", secret).update(`${timestamp}${raw}`).digest("base64"), signature);
}

function providerEventIdentity(provider, payload, request, raw) {
  const eventType = String(payload?.type || payload?.event || "unknown").slice(0, 120);
  let id = "";
  if (provider === "razorpay") {
    id = request.headers.get("x-razorpay-event-id") || payload?.id || "";
  } else if (provider === "stripe") {
    id = payload?.id || "";
  } else {
    const paymentId = payload?.data?.payment?.cf_payment_id || payload?.data?.cf_payment_id;
    const refundId = payload?.data?.refund?.cf_refund_id || payload?.data?.cf_refund_id;
    const orderId = payload?.data?.order?.order_id || payload?.data?.order_id || payload?.order_id;
    id = payload?.id || payload?.event_id
      || (paymentId ? `payment:${paymentId}` : "")
      || (refundId ? `refund:${refundId}` : "")
      || (orderId ? `${eventType}:${orderId}` : "");
  }
  if (!id && provider === "cashfree") {
    id = `body-sha256:${createHash("sha256").update(raw).digest("hex")}`;
  }
  return { eventId: String(id).trim().slice(0, 255), eventType };
}

async function claimWebhookEvent(supabase, provider, eventId, eventType) {
  const { data, error } = await supabase.rpc("claim_payment_webhook_event", {
    p_provider: provider,
    p_provider_event_id: eventId,
    p_event_type: eventType
  });
  if (error) throw new Error("WEBHOOK_DEDUPE_UNAVAILABLE");
  const result = Array.isArray(data) ? data[0] : data;
  if (result?.already_processed === true) return { duplicate: true, inProgress: false };
  if (result?.claimed === true) return { duplicate: false, inProgress: false };
  return { duplicate: false, inProgress: true };
}

async function completeWebhookEvent(supabase, provider, eventId) {
  const { error } = await supabase.rpc("complete_payment_webhook_event", {
    p_provider: provider,
    p_provider_event_id: eventId
  });
  if (error) throw new Error("WEBHOOK_RECEIPT_COMPLETION_FAILED");
}

async function failWebhookEvent(supabase, provider, eventId, error) {
  const message = error instanceof Error ? error.message : "WEBHOOK_PROCESSING_FAILED";
  const code = /^[A-Z0-9_:-]{1,120}$/.test(message) ? message : "WEBHOOK_PROCESSING_FAILED";
  const result = await supabase.rpc("fail_payment_webhook_event", {
    p_provider: provider,
    p_provider_event_id: eventId,
    p_error_code: code
  });
  if (result.error) console.error("payment webhook receipt could not be released");
}

async function activateFromOrder(supabase, order, providerPaymentId, providerCustomerId, providerSubscriptionId, periodEnd, eventType, metadata = {}) {
  if (!order) return;
  const periodEndDate = periodEnd ? new Date(periodEnd) : null;
  if (!periodEndDate || !Number.isFinite(periodEndDate.getTime()) || periodEndDate.getTime() <= Date.now()) {
    throw new Error("VALID_SUBSCRIPTION_PERIOD_REQUIRED");
  }
  if (["failed", "refunded", "cancelled", "canceled"].includes(String(order.status || "").toLowerCase())) {
    throw new Error("PAYMENT_ORDER_NOT_ACTIVATABLE");
  }

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
  const stripeApiOrigin = "https://api.stripe.com";
  const subscriptionUrl = new URL(
    `/v1/subscriptions/${encodeURIComponent(subscriptionId)}`,
    stripeApiOrigin
  );
  if (
    subscriptionUrl.origin !== stripeApiOrigin ||
    !subscriptionUrl.pathname.startsWith("/v1/subscriptions/")
  ) {
    throw new Error("STRIPE_SUBSCRIPTION_LOOKUP_URL_INVALID");
  }
  const response = await fetch(subscriptionUrl, {
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
    periodEnd,
    metadata: subscription.metadata || {},
    priceIds: (subscription.items?.data || []).map((item) => item?.price?.id).filter(Boolean)
  };
}

function assertStripeSubscriptionMatchesOrder(subscription, order) {
  const metadata = subscription.metadata || {};
  const expectedPriceId = order.metadata?.provider_price_id;
  const valid =
    metadata.user_id === order.user_id &&
    metadata.plan_id === order.plan_id &&
    metadata.billing_period === order.metadata?.billing_period &&
    expectedPriceId &&
    subscription.priceIds.includes(expectedPriceId);
  if (!valid) throw new Error("STRIPE_SUBSCRIPTION_ORDER_MISMATCH");
}

async function setExistingSubscriptionStatus(supabase, provider, providerSubscriptionId, status, periodEnd = null, cancelAtPeriodEnd = null) {
  if (!providerSubscriptionId || !["active", "trialing", "past_due", "canceled"].includes(status)) return;
  const update = { status, updated_at: new Date().toISOString() };
  if (periodEnd) update.current_period_end = periodEnd;
  if (typeof cancelAtPeriodEnd === "boolean") update.cancel_at_period_end = cancelAtPeriodEnd;
  const { error } = await supabase.from("subscriptions").update(update)
    .eq("provider", provider)
    .eq("provider_subscription_id", providerSubscriptionId);
  if (error) throw error;
}

async function activateTrialFromOrder(supabase, order, providerPaymentId, eventType, metadata = {}, paymentDetails = {}) {
  if (!order) return;
  if (order.status === "paid") return;
  if (!["pending", "awaiting_payment"].includes(String(order.status || "").toLowerCase())) {
    throw new Error("TRIAL_ORDER_NOT_ACTIVATABLE");
  }
  if (Number(order.amount_minor) !== 900 || String(order.currency || "").toUpperCase() !== "INR") {
    throw new Error("INVALID_TRIAL_AMOUNT");
  }
  if (Number(paymentDetails.amountMinor) !== Number(order.amount_minor) ||
      String(paymentDetails.currency || "").toUpperCase() !== String(order.currency || "").toUpperCase()) {
    throw new Error("TRIAL_PAYMENT_AMOUNT_MISMATCH");
  }
  if (order.metadata?.purpose !== "trial") throw new Error("TRIAL_ORDER_PURPOSE_MISMATCH");

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

  let supabase = null;
  let claimedEvent = null;
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
    } else {
      return json({ error: "Unsupported payment provider." }, 400);
    }

    supabase = serverSupabase();
    const identity = providerEventIdentity(provider, payload, request, raw);
    if (!identity.eventId) return json({ error: "Signed webhook did not include a stable event identifier." }, 400);

    const claim = await claimWebhookEvent(supabase, provider, identity.eventId, identity.eventType);
    if (claim.duplicate) return json({ received: true, duplicate: true });
    if (claim.inProgress) {
      return json({ error: "This webhook event is already being processed. Retry shortly." }, 503);
    }
    claimedEvent = { provider, eventId: identity.eventId };

    if (provider === "razorpay") {
      const event = payload.event;
      const subscription = payload.payload?.subscription?.entity;
      const payment = payload.payload?.payment?.entity;

      if (event === "payment.captured" && payment?.order_id) {
        const { data: trialOrder, error: trialOrderError } = await supabase.from("payment_orders").select("*")
          .eq("provider", "razorpay").eq("provider_order_id", payment.order_id).maybeSingle();
        if (trialOrderError) throw trialOrderError;
        if (trialOrder?.metadata?.purpose === "trial") {
          await activateTrialFromOrder(supabase, trialOrder, String(payment.id || ""), event, {
            provider_event_id: identity.eventId, razorpay_payment_id: String(payment.id || "")
          }, {
            amountMinor: payment.amount,
            currency: payment.currency
          });
        }
      }

      if (event === "subscription.pending" || event === "subscription.halted" || event === "subscription.cancelled" || event === "subscription.completed") {
        if (!subscription?.id) throw new Error("SUBSCRIPTION_REFERENCE_MISSING");
        await setExistingSubscriptionStatus(
          supabase, "razorpay", subscription.id,
          event === "subscription.cancelled" || event === "subscription.completed" ? "canceled" : "past_due"
        );
      }

      if (event === "subscription.charged") {
        if (!subscription?.id) throw new Error("SUBSCRIPTION_REFERENCE_MISSING");
        const periodEnd = unixSecondsToIso(subscription.current_end);
        const { data: order, error: orderError } = await supabase.from("payment_orders").select("*")
          .eq("provider", "razorpay").eq("provider_subscription_id", subscription.id).maybeSingle();
        if (orderError) throw orderError;
        if (order) {
          if (subscription.plan_id !== order.metadata?.provider_plan_id ||
              subscription.notes?.athleten_user_id !== order.user_id ||
              subscription.notes?.athleten_plan_id !== order.plan_id ||
              subscription.notes?.billing_period !== order.metadata?.billing_period ||
              String(payment?.currency || "").toUpperCase() !== "INR" ||
              Number(payment?.amount) !== Number(order.amount_minor)) {
            throw new Error("RAZORPAY_SUBSCRIPTION_ORDER_MISMATCH");
          }
          await activateFromOrder(
            supabase, order, payment?.id || null, subscription.customer_id || null,
            subscription.id, periodEnd, event,
            { provider_event_id: identity.eventId, razorpay_payment_id: payment?.id || null }
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
      }

      if (event === "customer.subscription.updated") {
        if (object?.id) {
          const providerStatus = String(object.status || "").toLowerCase();
          const mappedStatus = ["active", "trialing"].includes(providerStatus)
            ? providerStatus
            : providerStatus === "canceled" ? "canceled" : "past_due";
          await setExistingSubscriptionStatus(
            supabase, "stripe", object.id, mappedStatus,
            stripeSubscriptionPeriodEnd(object),
            object.cancel_at_period_end === true
          );
        }
      }

      if (event === "customer.subscription.deleted") {
        if (object?.id) await setExistingSubscriptionStatus(supabase, "stripe", object.id, "canceled");
      }

      if (event === "customer.subscription.paused") {
        if (object?.id) await setExistingSubscriptionStatus(supabase, "stripe", object.id, "past_due");
      }

      if (event === "checkout.session.completed") {
        const session = object;
        if (session?.payment_status === "paid") {
          const { data: order, error: orderError } = await supabase.from("payment_orders").select("*")
            .eq("provider", "stripe").eq("provider_order_id", session.id).maybeSingle();
          if (orderError) throw orderError;
          if (order) {
            if (order.metadata?.purpose === "trial" || session.metadata?.purpose === "trial") {
              if (
                session.client_reference_id !== order.user_id ||
                session.metadata?.user_id !== order.user_id ||
                session.metadata?.plan_id !== order.plan_id ||
                session.metadata?.purpose !== "trial"
              ) {
                throw new Error("STRIPE_TRIAL_ORDER_MISMATCH");
              }
              await activateTrialFromOrder(supabase, order, session.payment_intent || session.id, event, {
                provider_event_id: identity.eventId, stripe_session_id: session.id
              }, {
                amountMinor: session.amount_total,
                currency: session.currency
              });
            } else {
              if (
                session.client_reference_id !== order.user_id ||
                session.metadata?.user_id !== order.user_id ||
                session.metadata?.plan_id !== order.plan_id ||
                session.metadata?.billing_period !== order.metadata?.billing_period ||
                String(session.currency || "").toUpperCase() !== "INR" ||
                Number(session.amount_total) !== Number(order.amount_minor)
              ) {
                throw new Error("STRIPE_CHECKOUT_ORDER_MISMATCH");
              }
              const stripeSubscription = await retrieveStripeSubscription(
                typeof session.subscription === "string" ? session.subscription : session.subscription?.id
              );
              assertStripeSubscriptionMatchesOrder(stripeSubscription, order);
              await activateFromOrder(
                supabase, order, session.payment_intent, stripeSubscription.customerId,
                stripeSubscription.id, stripeSubscription.periodEnd, event,
                { provider_event_id: identity.eventId, stripe_session_id: session.id }
              );
            }
          }
        }
      }

      if (event === "invoice.paid") {
        const invoice = object;
        const subscriptionId = invoice?.subscription
          || invoice?.parent?.subscription_details?.subscription
          || null;
        if (subscriptionId) {
          const { data: order, error: orderError } = await supabase.from("payment_orders").select("*")
            .eq("provider", "stripe").eq("provider_subscription_id", subscriptionId).maybeSingle();
          if (orderError) throw orderError;
          if (order) {
            const stripeSubscription = await retrieveStripeSubscription(subscriptionId);
            assertStripeSubscriptionMatchesOrder(stripeSubscription, order);
            await activateFromOrder(
              supabase, order, invoice.payment_intent || null, stripeSubscription.customerId,
              stripeSubscription.id, stripeSubscription.periodEnd, event,
              { provider_event_id: identity.eventId, stripe_invoice_id: invoice.id }
            );
          }
        }
      }
    } else {
      const event = payload.type || payload.event;
      const isSuccess = String(event || "").toLowerCase().includes("success")
        || String(event || "").toLowerCase().includes("paid")
        || event === "PAYMENT_SUCCESS_WEBHOOK";
      if (isSuccess) {
        const providerOrderId = payload.data?.order?.order_id || payload.data?.order_id || payload.order_id;
        const providerPaymentId = payload.data?.payment?.cf_payment_id || payload.data?.cf_payment_id || payload.cf_payment_id;
        const { data: order, error: orderError } = await supabase.from("payment_orders").select("*")
          .eq("provider", "cashfree").eq("provider_order_id", providerOrderId).maybeSingle();
        if (orderError) throw orderError;
        if (order?.metadata?.purpose === "trial") {
          await activateTrialFromOrder(
            supabase, order, String(providerPaymentId || providerOrderId || ""),
            String(event || "payment.success"),
            { provider_event_id: identity.eventId, cashfree_order_id: providerOrderId },
            {
              amountMinor: Math.round(Number(payload.data?.payment?.payment_amount) * 100),
              currency: payload.data?.payment?.payment_currency
            }
          );
        } else if (order) {
          await logPaymentEvent(supabase, {
            user_id: order.user_id, provider: "cashfree", event_type: "one_time_payment_received_not_subscription",
            provider_event_id: identity.eventId, amount_minor: order.amount_minor,
            currency: order.currency, status: "paid",
            metadata: { payment_order_id: order.id, provider_order_id: providerOrderId, subscription_activation: "not_supported" }
          });
        }
      }
    }

    await completeWebhookEvent(supabase, provider, identity.eventId);
    claimedEvent = null;
    return json({ received: true });
  } catch (error) {
    if (supabase && claimedEvent) {
      await failWebhookEvent(supabase, claimedEvent.provider, claimedEvent.eventId, error);
    }
    console.error("payment-webhook", error);
    return json({ error: "Webhook processing failed." }, 500);
  }
}
