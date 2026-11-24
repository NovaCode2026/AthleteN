import { createHash, createPublicKey, verify as verifySignature } from "node:crypto";
import { serverSupabase, env } from "../payment-common.mjs";

const KEY_URL = "https://www.gstatic.com/admob/reward/verifier-keys.json";
const KEY_CACHE_MAX_AGE_MS = 23 * 60 * 60 * 1000;
let cachedKeys = null;
let cachedAt = 0;

function textResponse(message, status = 200) {
  return new Response(message, { status, headers: { "Content-Type": "text/plain; charset=utf-8" } });
}

async function getPublicKey(keyId) {
  if (!cachedKeys || Date.now() - cachedAt > KEY_CACHE_MAX_AGE_MS) {
    const response = await fetch(KEY_URL, { signal: AbortSignal.timeout(5000) });
    if (!response.ok) throw new Error("AD_NETWORK_KEY_FETCH_FAILED");
    const payload = await response.json();
    if (!Array.isArray(payload?.keys) || payload.keys.length === 0) throw new Error("AD_NETWORK_KEYS_INVALID");
    cachedKeys = new Map(payload.keys.map((key) => [String(key.keyId), key.pem]).filter((entry) => entry[0] && entry[1]));
    cachedAt = Date.now();
  }
  const pem = cachedKeys.get(String(keyId));
  if (!pem) throw new Error("AD_NETWORK_KEY_NOT_FOUND");
  return createPublicKey(pem);
}

function verifyAdMobCallback(requestUrl) {
  const url = new URL(requestUrl);
  const rawQuery = url.search.startsWith("?") ? url.search.slice(1) : "";
  const signatureMarker = rawQuery.lastIndexOf("&signature=");
  const keyMarker = rawQuery.lastIndexOf("&key_id=");
  if (signatureMarker <= 0 || keyMarker <= signatureMarker) throw new Error("SSV_SIGNATURE_FIELDS_MISSING");

  const signedContent = rawQuery.slice(0, signatureMarker);
  const params = new URLSearchParams(rawQuery);
  const signature = params.get("signature");
  const keyId = params.get("key_id");
  if (!signature || !keyId || params.getAll("signature").length !== 1 || params.getAll("key_id").length !== 1) {
    throw new Error("SSV_SIGNATURE_FIELDS_INVALID");
  }
  if (rawQuery.slice(keyMarker + 1, keyMarker + 8) !== "key_id=" ||
      rawQuery.indexOf("&", keyMarker + 1) !== -1) {
    throw new Error("SSV_PARAMETER_ORDER_INVALID");
  }
  return { signedContent, signature, keyId, params };
}

export default async function handler(request) {
  if (request.method !== "GET") return textResponse("Method not allowed.", 405);

  try {
    const { signedContent, signature, keyId, params } = verifyAdMobCallback(request.url);
    const publicKey = await getPublicKey(keyId);
    const signatureBytes = Buffer.from(signature, "base64url");
    const valid = verifySignature(
      "sha256",
      Buffer.from(signedContent, "utf8"),
      { key: publicKey, dsaEncoding: "der" },
      signatureBytes
    );
    if (!valid) return textResponse("Invalid signature.", 400);

    const adUnit = params.get("ad_unit");
    const expectedAdUnit = env("ADMOB_REWARDED_AD_UNIT_ID");
    const customData = params.get("custom_data");
    const transactionId = params.get("transaction_id");
    const rewardItem = params.get("reward_item");
    const rewardAmount = Number(params.get("reward_amount"));
    const rawTimestamp = Number(params.get("timestamp"));
    // Google documents this field as epoch milliseconds, but its published
    // example is microsecond-scaled. Normalize either representation safely.
    const timestamp = Number.isSafeInteger(rawTimestamp) && rawTimestamp > 100000000000000
      ? Math.floor(rawTimestamp / 1000)
      : rawTimestamp;

    if (!expectedAdUnit || adUnit !== expectedAdUnit ||
        !customData || customData.length < 32 || customData.length > 256 ||
        !transactionId || !/^[a-fA-F0-9-]{8,200}$/.test(transactionId) ||
        rewardItem !== "athleten_ai_message" || rewardAmount !== 2 ||
        !Number.isSafeInteger(timestamp)) {
      return textResponse("Reward callback rejected.", 400);
    }

    const customDataHash = createHash("sha256").update(customData).digest("hex");
    const admin = serverSupabase();
    const { data, error } = await admin.rpc("grant_rewarded_ad_credit", {
      p_custom_data_hash: customDataHash,
      p_provider_transaction_id: transactionId,
      p_ad_unit: adUnit,
      p_reward_item: rewardItem,
      p_reward_amount: rewardAmount,
      p_ad_timestamp_ms: timestamp,
      p_expected_ad_unit: expectedAdUnit
    });
    if (error) {
      console.error("Reward callback ledger operation failed:", error);
      return textResponse("Reward processing temporarily unavailable.", 503);
    }
    if (data === "granted" || data === "duplicate") return textResponse("OK", 200);
    return textResponse("Reward callback rejected.", 400);
  } catch (error) {
    console.error("Reward callback verification failed:", error?.message || error);
    return textResponse("Reward callback verification failed.", 400);
  }
}
