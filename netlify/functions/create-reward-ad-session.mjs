import { randomBytes, createHash } from "node:crypto";
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
  if (request.method !== "POST") return json("Method not allowed.", 405);

  // Fail closed until the publisher account, age-appropriate ad treatment,
  // consent flow, and policy review have been approved by the responsible adult.
  if (env("ATHLETEN_REWARDED_ADS_ENABLED") !== "true" ||
      env("ATHLETEN_REWARDED_ADS_LIVE_APPROVED") !== "true" ||
      env("ATHLETEN_REWARDED_ADS_MINOR_SAFETY_APPROVED") !== "true" ||
      !env("ADMOB_REWARDED_AD_UNIT_ID")) {
    return json("Rewarded ads are not enabled for this AthleteN environment.", 503);
  }

  const accessToken = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  if (!accessToken) return json("Please sign in again.", 401);

  let client;
  let admin;
  try {
    client = userClient(accessToken);
    admin = serverSupabase();
  } catch {
    return json("AthleteN services are not configured.", 503);
  }

  const { data, error } = await client.auth.getUser(accessToken);
  if (error || !data?.user) return json("Please sign in again.", 401);

  const customData = randomBytes(32).toString("base64url");
  const customDataHash = createHash("sha256").update(customData).digest("hex");
  const expiresAt = new Date(Date.now() + 15 * 60 * 1000).toISOString();

  const { error: insertError } = await admin.from("reward_ad_sessions").insert({
    user_id: data.user.id,
    provider: "admob",
    custom_data_hash: customDataHash,
    expires_at: expiresAt
  });
  if (insertError) {
    console.error("Reward ad session creation failed:", insertError);
    return json("Unable to prepare a rewarded ad. Please try again later.", 503);
  }

  return Response.json({
    provider: "admob",
    customData,
    reward: { key: "ai_message", amount: 2 },
    expiresAt
  });
}
