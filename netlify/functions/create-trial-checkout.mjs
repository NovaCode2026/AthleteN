import { authenticate, env, json, logPaymentEvent, requireApprovedStudent, serverSupabase, siteUrl } from "../payment-common.mjs";

const trialPlans = new Set(["student", "pro", "champion"]);
const providers = new Set(["razorpay", "stripe", "cashfree"]);
const TRIAL_FEE_PAISE = 900;

async function createRazorpayTrial(supabase, user, planId, verificationId) {
  const keyId = env("RAZORPAY_KEY_ID");
  const secret = env("RAZORPAY_KEY_SECRET");
  if (!keyId || !secret) throw new Error("RAZORPAY_NOT_CONFIGURED");

  const response = await fetch("https://api.razorpay.com/v1/orders", {
    method: "POST",
    headers: {
      Authorization: `Basic ${Buffer.from(`${keyId}:${secret}`).toString("base64")}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      amount: TRIAL_FEE_PAISE,
      currency: "INR",
      receipt: `athleten_trial_${crypto.randomUUID().replaceAll("-", "").slice(0, 24)}`,
      notes: { athleten_user_id: user.id, athleten_plan_id: planId, purpose: "trial", verification_id: verificationId }
    })
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok || !data.id) throw new Error("RAZORPAY_TRIAL_ORDER_FAILED");

  const { data: order, error } = await supabase.from("payment_orders").insert({
    user_id: user.id,
    plan_id: planId,
    provider: "razorpay",
    amount_minor: TRIAL_FEE_PAISE,
    currency: "INR",
    status: "pending",
    verification_id: verificationId,
    provider_order_id: data.id,
    metadata: { purpose: "trial", key_id: keyId }
  }).select("id").single();
  if (error) throw error;

  return { orderId: order.id, provider: "razorpay", providerOrderId: data.id, keyId, amountMinor: TRIAL_FEE_PAISE, currency: "INR" };
}

async function createStripeTrial(supabase, user, planId, verificationId) {
  const secret = env("STRIPE_SECRET_KEY");
  if (!secret) throw new Error("STRIPE_NOT_CONFIGURED");

  const params = new URLSearchParams();
  params.set("mode", "payment");
  params.set("line_items[0][price_data][currency]", "inr");
  params.set("line_items[0][price_data][product_data][name]", `AthleteN ${planId} 7-day trial`);
  params.set("line_items[0][price_data][product_data][description]", "One-time seven-day trial activation");
  params.set("line_items[0][price_data][unit_amount]", String(TRIAL_FEE_PAISE));
  params.set("line_items[0][quantity]", "1");
  params.set("success_url", `${siteUrl()}/checkout/success?session_id={CHECKOUT_SESSION_ID}&purpose=trial`);
  params.set("cancel_url", `${siteUrl()}/checkout/cancel?purpose=trial`);
  params.set("client_reference_id", user.id);
  params.set("metadata[user_id]", user.id);
  params.set("metadata[plan_id]", planId);
  params.set("metadata[purpose]", "trial");
  params.set("metadata[verification_id]", verificationId);

  const response = await fetch("https://api.stripe.com/v1/checkout/sessions", {
    method: "POST",
    headers: { Authorization: `Bearer ${secret}`, "Content-Type": "application/x-www-form-urlencoded" },
    body: params
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok || !data.id || !data.url) throw new Error("STRIPE_TRIAL_CHECKOUT_FAILED");

  const { data: order, error } = await supabase.from("payment_orders").insert({
    user_id: user.id,
    plan_id: planId,
    provider: "stripe",
    amount_minor: TRIAL_FEE_PAISE,
    currency: "INR",
    status: "pending",
    verification_id: verificationId,
    provider_order_id: data.id,
    checkout_url: data.url,
    metadata: { purpose: "trial" }
  }).select("id").single();
  if (error) throw error;

  return { orderId: order.id, provider: "stripe", checkoutUrl: data.url, providerSessionId: data.id, amountMinor: TRIAL_FEE_PAISE, currency: "INR" };
}

async function createCashfreeTrial(supabase, user, planId, verificationId) {
  const clientId = env("CASHFREE_CLIENT_ID");
  const clientSecret = env("CASHFREE_CLIENT_SECRET");
  if (!clientId || !clientSecret) throw new Error("CASHFREE_NOT_CONFIGURED");

  const providerOrderId = `athleten_trial_${crypto.randomUUID().replaceAll("-", "")}`;
  const response = await fetch("https://api.cashfree.com/pg/orders", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-client-id": clientId,
      "x-client-secret": clientSecret,
      "x-api-version": "2023-08-01"
    },
    body: JSON.stringify({
      order_id: providerOrderId,
      order_amount: TRIAL_FEE_PAISE / 100,
      order_currency: "INR",
      customer_details: { customer_id: user.id, customer_email: user.email || "athlete@athleten.local" },
      order_meta: {
        return_url: `${siteUrl()}/checkout/success?order_id={order_id}&purpose=trial`,
        notify_url: `${siteUrl()}/.netlify/functions/payment-webhook`
      },
      order_note: JSON.stringify({ user_id: user.id, plan_id: planId, purpose: "trial", verification_id: verificationId })
    })
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok || !data.order_id || !data.payment_session_id) throw new Error("CASHFREE_TRIAL_CHECKOUT_FAILED");

  const { data: order, error } = await supabase.from("payment_orders").insert({
    user_id: user.id,
    plan_id: planId,
    provider: "cashfree",
    amount_minor: TRIAL_FEE_PAISE,
    currency: "INR",
    status: "pending",
    verification_id: verificationId,
    provider_order_id: data.order_id,
    metadata: { purpose: "trial", payment_session_id: data.payment_session_id }
  }).select("id").single();
  if (error) throw error;

  return { orderId: order.id, provider: "cashfree", providerOrderId: data.order_id, paymentSessionId: data.payment_session_id, amountMinor: TRIAL_FEE_PAISE, currency: "INR" };
}

export default async function handler(request) {
  if (request.method !== "POST") return json({ error: "Method not allowed." }, 405);
  try {
    const user = await authenticate(request);
    if (!user) return json({ error: "Please sign in before starting the trial." }, 401);

    const body = await request.json().catch(() => ({}));
    const planId = String(body.planId || "").toLowerCase();
    const provider = String(body.provider || env("PAYMENT_PROVIDER") || "razorpay").toLowerCase();
    if (!trialPlans.has(planId)) return json({ error: "Choose a paid plan for the trial." }, 400);
    if (!providers.has(provider)) return json({ error: "Unsupported payment provider." }, 400);

    const supabase = serverSupabase();
    const verification = await requireApprovedStudent(supabase, user.id);
    if (!verification) return json({ error: "Student ID approval is required before trial payment." }, 403);

    const { data: entitlement, error: entitlementError } = await supabase
      .from("account_entitlements")
      .select("trial_claimed_at,trial_payment_status,trial_ends_at")
      .eq("user_id", user.id)
      .maybeSingle();
    if (entitlementError) throw entitlementError;
    if (entitlement?.trial_claimed_at) return json({ error: "Your one-time trial has already been used." }, 409);
    if (entitlement?.trial_ends_at && new Date(entitlement.trial_ends_at).getTime() > Date.now()) return json({ error: "Your trial is already active." }, 409);
    if (entitlement?.trial_payment_status === "paid") return json({ error: "Your trial payment is already confirmed. Refresh the account plan to continue." }, 409);

    const result = provider === "razorpay"
      ? await createRazorpayTrial(supabase, user, planId, verification.id)
      : provider === "stripe"
        ? await createStripeTrial(supabase, user, planId, verification.id)
        : await createCashfreeTrial(supabase, user, planId, verification.id);

    await supabase.from("account_entitlements").upsert({
      user_id: user.id,
      trial_fee_paise: TRIAL_FEE_PAISE,
      trial_payment_status: "pending",
      trial_payment_provider: provider,
      updated_at: new Date().toISOString()
    }, { onConflict: "user_id" });

    await logPaymentEvent(supabase, {
      user_id: user.id,
      provider,
      event_type: "trial.checkout.created",
      amount_minor: TRIAL_FEE_PAISE,
      currency: "INR",
      status: "pending",
      metadata: { plan_id: planId, payment_order_id: result.orderId, purpose: "trial", verification_id: verification.id }
    });

    return json({ ...result, planId, purpose: "trial" });
  } catch (error) {
    console.error("create-trial-checkout", error);
    const code = error instanceof Error ? error.message : "TRIAL_CHECKOUT_FAILED";
    if (code.endsWith("_NOT_CONFIGURED")) return json({ error: "The selected payment provider is not configured on the server yet." }, 503);
    return json({ error: "Unable to start the trial checkout." }, 503);
  }
}
