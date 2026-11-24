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

  // Rewarded ads are adult-only in this release. Parent-approved minor accounts
  // can use AthleteN normally but cannot request advertising inventory.
  // The DOB remains inside AthleteN and is never sent to the ad provider.
  const { data: ageRows, error: ageError } = await client.rpc("get_age_verification_status");
  if (ageError) {
    console.error("Rewarded ad age eligibility check failed:", ageError);
    return json("Age eligibility could not be verified. Rewarded ads are unavailable.", 503);
  }
  const ageRecord = Array.isArray(ageRows) ? ageRows[0] : ageRows;
  const dob = typeof ageRecord?.date_of_birth === "string" ? ageRecord.date_of_birth : "";
  const match = dob.match(/^(\\d{4})-(\\d{2})-(\\d{2})$/);
  if (ageRecord?.status !== "not_required" || !match) {
    return json("Rewarded ads are unavailable for this account. Your existing AthleteN access is not affected.", 403);
  }
  const birthDate = new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])));
  if (!Number.isFinite(birthDate.getTime()) || birthDate.toISOString().slice(0, 10) !== dob) {
    return json("Age eligibility could not be verified. Rewarded ads are unavailable.", 403);
  }
  const now = new Date();
  let ageYears = now.getUTCFullYear() - birthDate.getUTCFullYear();
  if (now.getUTCMonth() < birthDate.getUTCMonth() ||
      (now.getUTCMonth() === birthDate.getUTCMonth() && now.getUTCDate() < birthDate.getUTCDate())) {
    ageYears -= 1;
  }
  if (ageYears < 18) {
    return json("Rewarded ads are not available for accounts under 18. Your existing AthleteN access is not affected.", 403);
  }

  const windowStart = new Date(Date.now() - 60 * 60 * 1000).toISOString();
  const { count, error: rateLimitError } = await admin.from("reward_ad_sessions")
    .select("id", { count: "exact", head: true })
    .eq("user_id", data.user.id)
    .gte("created_at", windowStart);
  if (rateLimitError) {
    console.error("Reward ad session rate check failed:", rateLimitError);
    return json("Unable to prepare a rewarded ad. Please try again later.", 503);
  }
  if ((count || 0) >= 5) return json("Too many ad sessions were requested. Try again later.", 429);

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
