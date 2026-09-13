import { authenticate, json, serverSupabase } from "../payment-common.mjs";

export default async function handler(request) {
  if (request.method !== "GET") return json({ error: "Method not allowed." }, 405);
  try {
    const user = await authenticate(request);
    if (!user) return json({ error: "Please sign in." }, 401);
    const supabase = serverSupabase();
    const [{ data: verification }, { data: subscription }, { data: orders }] = await Promise.all([
      supabase.from("student_verifications").select("id,status,reviewed_at,reviewer_notes").eq("user_id", user.id).order("created_at", { ascending: false }).limit(1).maybeSingle(),
      supabase.from("subscriptions").select("plan_id,provider,status,current_period_end,updated_at").eq("user_id", user.id).maybeSingle(),
      supabase.from("payment_orders").select("id,plan_id,provider,amount_minor,currency,status,checkout_url,created_at,paid_at").eq("user_id", user.id).order("created_at", { ascending: false }).limit(10)
    ]);
    return json({ verification: verification || null, subscription: subscription || null, orders: orders || [] });
  } catch (error) {
    console.error("payment-status", error);
    return json({ error: "Unable to load billing status." }, 503);
  }
}
