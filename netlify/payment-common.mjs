import { createClient } from "@supabase/supabase-js";

export function env(name) {
  return typeof Netlify !== "undefined" && Netlify.env?.get ? Netlify.env.get(name) : process.env[name];
}

export function json(payload, status = 200) {
  return Response.json(payload, { status, headers: { "cache-control": "no-store" } });
}

export function serverSupabase() {
  const url = env("SUPABASE_URL") || env("VITE_SUPABASE_URL");
  const key = env("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !key) throw new Error("SUPABASE_SERVER_CONFIG_MISSING");
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}

export async function authenticate(request) {
  const token = request.headers.get("authorization")?.replace(/^Bearer\\s+/i, "");
  if (!token) return null;
  const url = env("SUPABASE_URL") || env("VITE_SUPABASE_URL");
  const key = env("SUPABASE_ANON_KEY") || env("VITE_SUPABASE_ANON_KEY");
  if (!url || !key) throw new Error("SUPABASE_PUBLIC_CONFIG_MISSING");
  const client = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data, error } = await client.auth.getUser(token);
  return error || !data?.user ? null : data.user;
}

// New-sale price amounts in INR paise. The UI's yearly totals are mapped here
// so the server, not the browser, chooses the exact amount and recurring price.
export const planPricesMinor = Object.freeze({
  monthly: Object.freeze({ pro: 9900, elite: 19900, coach: 49900, academy: 79900 }),
  yearly: Object.freeze({ pro: 99900, elite: 199900, coach: 499900, academy: 799900 })
});

export function providerPlanKey(provider, planId, billingPeriod = "monthly") {
  if (!["monthly", "yearly"].includes(billingPeriod)) {
    throw new Error("INVALID_BILLING_PERIOD");
  }
  return `${provider.toUpperCase()}_PLAN_V2_${planId.toUpperCase()}_${billingPeriod.toUpperCase()}`;
}

export function siteUrl() {
  return env("ATHLETEN_SITE_URL") || env("URL") || "";
}

export async function requireApprovedStudent(supabase, userId) {
  const { data, error } = await supabase
    .from("student_verifications")
    .select("id,status,reviewed_at")
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  return data?.status === "approved" ? data : null;
}

export async function logPaymentEvent(supabase, event) {
  await supabase.from("payment_events").insert(event).then(({ error }) => {
    if (error) console.error("payment_events", error);
  });
}
