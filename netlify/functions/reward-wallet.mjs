import { createClient } from "@supabase/supabase-js";
import { env, serverSupabase } from "../payment-common.mjs";

const PAGE_SIZE = 20;
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function json(error, status) {
  return Response.json({ error }, { status });
}

function userClient(accessToken) {
  const url = env("VITE_SUPABASE_URL") || env("SUPABASE_URL");
  const key = env("VITE_SUPABASE_ANON_KEY") || env("SUPABASE_ANON_KEY");
  if (!url || !key) throw new Error("SUPABASE_PUBLIC_CONFIG_MISSING");
  return createClient(url, key, {
    global: { headers: { Authorization: "Bearer " + accessToken } },
    auth: { persistSession: false, autoRefreshToken: false }
  });
}

function parseCursor(value) {
  if (!value) return null;
  if (value.length > 512) throw new Error("INVALID_CURSOR");
  const decoded = Buffer.from(value, "base64url").toString("utf8");
  const separator = decoded.lastIndexOf("|");
  if (separator < 1) throw new Error("INVALID_CURSOR");
  const rawDate = decoded.slice(0, separator);
  const id = decoded.slice(separator + 1);
  const timestamp = new Date(rawDate);
  if (Number.isNaN(timestamp.getTime()) || !UUID_PATTERN.test(id)) throw new Error("INVALID_CURSOR");
  return { createdAt: timestamp.toISOString(), id };
}

export default async function handler(request) {
  if (request.method !== "GET") return json("Method not allowed.", 405);
  const accessToken = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  if (!accessToken) return json("Please sign in again.", 401);

  const url = new URL(request.url);
  let cursor;
  try {
    cursor = parseCursor(url.searchParams.get("cursor"));
  } catch {
    return json("The reward history cursor is invalid. Refresh the wallet and try again.", 400);
  }

  try {
    const client = userClient(accessToken);
    const { data: authData, error: authError } = await client.auth.getUser(accessToken);
    if (authError || !authData?.user) return json("Please sign in again.", 401);

    const admin = serverSupabase();
    const historyQuery = admin.from("reward_ledger")
      .select("id,reward_key,amount,event_type,expires_at,created_at,provider")
      .eq("user_id", authData.user.id)
      .order("created_at", { ascending: false })
      .order("id", { ascending: false })
      .limit(PAGE_SIZE + 1);
    if (cursor) {
      historyQuery.or("created_at.lt." + cursor.createdAt + ",and(created_at.eq." + cursor.createdAt + ",id.lt." + cursor.id + ")");
    }

    const [{ data: summaryRows, error: summaryError }, { data: rows, error: historyError }] = await Promise.all([
      admin.rpc("get_reward_wallet_summary", { p_user_id: authData.user.id }),
      historyQuery
    ]);
    if (summaryError) {
      console.error("Reward wallet summary failed:", summaryError);
      return json("Reward wallet is temporarily unavailable.", 503);
    }
    if (historyError) {
      console.error("Reward history read failed:", historyError);
      return json("Reward history is temporarily unavailable.", 503);
    }

    const summary = Array.isArray(summaryRows) ? summaryRows[0] : summaryRows;
    const pageRows = Array.isArray(rows) ? rows.slice(0, PAGE_SIZE) : [];
    const hasMore = Array.isArray(rows) && rows.length > PAGE_SIZE;
    const last = pageRows[pageRows.length - 1];
    const nextCursor = hasMore && last
      ? Buffer.from(last.created_at + "|" + last.id, "utf8").toString("base64url")
      : null;

    return Response.json({
      balance: Math.max(0, Number(summary?.balance) || 0),
      dailyAdsUsed: Math.max(0, Number(summary?.daily_ads_used) || 0),
      dailyAdsLimit: Number(summary?.daily_ads_limit) || 3,
      monthlyAdCreditsEarned: Math.max(0, Number(summary?.monthly_ad_credits_earned) || 0),
      monthlyAdCreditsLimit: Number(summary?.monthly_ad_credits_limit) || 30,
      history: pageRows.map(({ id, reward_key, amount, event_type, expires_at, created_at, provider }) => ({
        id, rewardKey: reward_key, amount, eventType: event_type, expiresAt: expires_at, createdAt: created_at, provider
      })),
      nextCursor
    });
  } catch (error) {
    console.error("Reward wallet request failed:", error?.message || error);
    return json("AthleteN services are not configured for rewards.", 503);
  }
}
