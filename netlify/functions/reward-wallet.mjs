import { createClient } from "@supabase/supabase-js";
import { env, serverSupabase } from "../payment-common.mjs";

function json(error, status) {
  return Response.json({ error }, { status });
}

function userClient(accessToken) {
  const url = env("VITE_SUPABASE_URL") || env("SUPABASE_URL");
  const key = env("VITE_SUPABASE_ANON_KEY") || env("SUPABASE_ANON_KEY");
  if (!url || !key) throw new Error("SUPABASE_PUBLIC_CONFIG_MISSING");
  return createClient(url, key, {
    global: { headers: { Authorization: `Bearer ${accessToken}` } },
    auth: { persistSession: false, autoRefreshToken: false }
  });
}

export default async function handler(request) {
  if (request.method !== "GET") return json("Method not allowed.", 405);
  const accessToken = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  if (!accessToken) return json("Please sign in again.", 401);

  try {
    const client = userClient(accessToken);
    const { data: authData, error: authError } = await client.auth.getUser(accessToken);
    if (authError || !authData?.user) return json("Please sign in again.", 401);

    const admin = serverSupabase();
    const { data: rows, error } = await admin.from("reward_ledger")
      .select("id,reward_key,amount,event_type,expires_at,created_at,provider")
      .eq("user_id", authData.user.id)
      .order("created_at", { ascending: false })
      .limit(500);
    if (error) {
      console.error("Reward wallet read failed:", error);
      return json("Reward wallet is temporarily unavailable.", 503);
    }

    const now = Date.now();
    const current = (rows || []).filter((row) => !row.expires_at || new Date(row.expires_at).getTime() > now);
    const balance = current.reduce((sum, row) => sum + Number(row.amount || 0), 0);
    const dayStart = new Date();
    dayStart.setUTCHours(0, 0, 0, 0);
    const monthStart = new Date(Date.UTC(new Date().getUTCFullYear(), new Date().getUTCMonth(), 1));
    const todayEarned = (rows || []).filter((row) => row.provider === "admob" && row.event_type === "earned" && new Date(row.created_at) >= dayStart).length;
    const monthEarned = (rows || []).filter((row) => row.provider === "admob" && row.event_type === "earned" && new Date(row.created_at) >= monthStart).reduce((sum, row) => sum + Number(row.amount || 0), 0);

    return Response.json({
      balance: Math.max(0, balance),
      dailyAdsUsed: todayEarned,
      dailyAdsLimit: 3,
      monthlyAdCreditsEarned: monthEarned,
      monthlyAdCreditsLimit: 30,
      history: (rows || []).slice(0, 20).map(({ id, reward_key, amount, event_type, expires_at, created_at, provider }) => ({
        id, rewardKey: reward_key, amount, eventType: event_type, expiresAt: expires_at, createdAt: created_at, provider
      }))
    });
  } catch {
    return json("AthleteN services are not configured for rewards.", 503);
  }
}
