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
  const token = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  if (!token) return null;
  const url = env("SUPABASE_URL") || env("VITE_SUPABASE_URL");
  const key = env("SUPABASE_ANON_KEY") || env("VITE_SUPABASE_ANON_KEY");
  if (!url || !key) throw new Error("SUPABASE_PUBLIC_CONFIG_MISSING");
  const client = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data, error } = await client.auth.getUser(token);
  return error || !data?.user ? null : data.user;
}

export const planPricesMinor = {
  student: 7900,
  pro: 14900,
  champion: 29900
};

export function providerPlanKey(provider, planId) {
  return `${provider.toUpperCase()}_PLAN_${planId.toUpperCase()}`;
}

export function siteUrl() {
  return env("ATHLETEOS_SITE_URL") || env("URL") || "https://athleteostkd.netlify.app";
}

export async function requireApprovedStudent(supabase, userId) {
  const { data, error } = await supabase
    .from("student_verifications")
    .select("id,status,reviewed_at")
    .eq("user_id", userId)
    .eq("status", "approved")
    .order("reviewed_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  return data;
}

export async function logPaymentEvent(supabase, event) {
  await supabase.from("payment_events").insert(event).then(({ error }) => {
    if (error) console.error("payment_events", error);
  });
}
