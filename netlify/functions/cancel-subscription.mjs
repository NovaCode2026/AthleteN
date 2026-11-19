import { authenticate, env, json, serverSupabase } from "../payment-common.mjs";

function unixSecondsToIso(value) {
  const seconds = Number(value);
  if (!Number.isFinite(seconds) || seconds <= 0) return null;
  const date = new Date(seconds * 1000);
  return Number.isFinite(date.getTime()) ? date.toISOString() : null;
}

async function scheduleStripeCancellation(subscriptionId) {
  const secret = env("STRIPE_SECRET_KEY");
  if (!secret) throw new Error("STRIPE_NOT_CONFIGURED");
  const response = await fetch("https://api.stripe.com/v1/subscriptions/" + encodeURIComponent(subscriptionId), {
    method: "POST",
    headers: {
      Authorization: "Bearer " + secret,
      "Content-Type": "application/x-www-form-urlencoded"
    },
    body: new URLSearchParams({ cancel_at_period_end: "true" })
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok || data.id !== subscriptionId || data.cancel_at_period_end !== true) {
    throw new Error("STRIPE_CANCELLATION_FAILED");
  }
  return unixSecondsToIso(data.current_period_end);
}

async function scheduleRazorpayCancellation(subscriptionId) {
  const keyId = env("RAZORPAY_KEY_ID");
  const secret = env("RAZORPAY_KEY_SECRET");
  if (!keyId || !secret) throw new Error("RAZORPAY_NOT_CONFIGURED");
  const response = await fetch("https://api.razorpay.com/v1/subscriptions/" + encodeURIComponent(subscriptionId) + "/cancel", {
    method: "POST",
    headers: {
      Authorization: "Basic " + Buffer.from(keyId + ":" + secret).toString("base64"),
      "Content-Type": "application/json"
    },
    body: JSON.stringify({ cancel_at_cycle_end: true })
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok || data.id !== subscriptionId || String(data.status || "").toLowerCase() === "cancelled") {
    throw new Error("RAZORPAY_CANCELLATION_FAILED");
  }
  return unixSecondsToIso(data.current_end);
}

export default async function handler(request) {
  if (request.method !== "POST") return json({ error: "Method not allowed." }, 405);

  try {
    const user = await authenticate(request);
    if (!user) return json({ error: "Please sign in before managing a subscription." }, 401);

    const body = await request.json().catch(() => ({}));
    const subscriptionId = typeof body.subscriptionId === "string" ? body.subscriptionId.trim() : "";
    if (!subscriptionId || subscriptionId.length > 100) {
      return json({ error: "A valid subscription reference is required." }, 400);
    }

    const supabase = serverSupabase();
    const { data: subscription, error: lookupError } = await supabase
      .from("subscriptions")
      .select("id,user_id,plan_id,provider,provider_subscription_id,status,current_period_end,cancel_at_period_end")
      .eq("id", subscriptionId)
      .eq("user_id", user.id)
      .maybeSingle();

    if (lookupError) {
      console.error("cancel-subscription lookup failed:", lookupError);
      return json({ error: "Subscription details could not be loaded." }, 503);
    }
    if (!subscription) return json({ error: "Subscription not found for this account." }, 404);
    if (subscription.cancel_at_period_end === true) {
      return json({
        success: true,
        alreadyScheduled: true,
        currentPeriodEnd: subscription.current_period_end
      });
    }
    if (!["active", "trialing", "past_due"].includes(subscription.status)) {
      return json({ error: "Only an active or past-due subscription can be scheduled for cancellation." }, 409);
    }
    if (!subscription.provider_subscription_id || !["stripe", "razorpay"].includes(subscription.provider)) {
      return json({ error: "This subscription cannot be canceled automatically. Contact AthleteN support for assistance." }, 409);
    }
    const storedPeriodEnd = subscription.current_period_end ? new Date(subscription.current_period_end) : null;
    if (!storedPeriodEnd || !Number.isFinite(storedPeriodEnd.getTime()) || storedPeriodEnd.getTime() <= Date.now()) {
      return json({ error: "The current billing period could not be verified. Contact AthleteN support." }, 409);
    }

    let providerPeriodEnd;
    try {
      providerPeriodEnd = subscription.provider === "stripe"
        ? await scheduleStripeCancellation(subscription.provider_subscription_id)
        : await scheduleRazorpayCancellation(subscription.provider_subscription_id);
    } catch (providerError) {
      console.error("cancel-subscription provider request failed:", providerError);
      return json({ error: "The provider did not confirm a period-end cancellation. No local cancellation was recorded." }, 502);
    }

    const currentPeriodEnd = providerPeriodEnd || subscription.current_period_end;
    const { error: updateError } = await supabase
      .from("subscriptions")
      .update({
        cancel_at_period_end: true,
        current_period_end: currentPeriodEnd,
        updated_at: new Date().toISOString()
      })
      .eq("id", subscription.id)
      .eq("user_id", user.id)
      .eq("provider_subscription_id", subscription.provider_subscription_id);

    if (updateError) {
      // The provider is authoritative. A webhook can still reconcile this row.
      console.error("cancel-subscription local sync failed:", updateError);
      return json({
        success: true,
        syncPending: true,
        currentPeriodEnd,
        message: "The provider scheduled cancellation. AthleteN is waiting for the provider webhook to synchronize the account."
      }, 202);
    }

    return json({
      success: true,
      cancelAtPeriodEnd: true,
      currentPeriodEnd,
      message: "Cancellation is scheduled for the end of your current billing period. Your access remains active until then."
    });
  } catch (error) {
    console.error("cancel-subscription", error);
    return json({ error: "Unable to schedule subscription cancellation." }, 503);
  }
}
