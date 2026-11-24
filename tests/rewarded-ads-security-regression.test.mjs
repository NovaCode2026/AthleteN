import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const ledger = readFileSync(new URL("../supabase/migrations/20261124090000_rewarded_ad_credit_ledger.sql", import.meta.url), "utf8");
const walletSummaryMigration = readFileSync(new URL("../supabase/migrations/20261124200000_reward_wallet_summary_rpc.sql", import.meta.url), "utf8");
const consumption = readFileSync(new URL("../supabase/migrations/20261124090100_rewarded_ai_credit_consumption.sql", import.meta.url), "utf8");
const ssv = readFileSync(new URL("../netlify/functions/admob-reward-ssv.mjs", import.meta.url), "utf8");
const session = readFileSync(new URL("../netlify/functions/create-reward-ad-session.mjs", import.meta.url), "utf8");
const wallet = readFileSync(new URL("../netlify/functions/reward-wallet.mjs", import.meta.url), "utf8");
const aiCoach = readFileSync(new URL("../netlify/functions/ai-coach.mjs", import.meta.url), "utf8");
const mobileRewards = readFileSync(new URL("../AthleteN-Mobile/src/app/rewards.tsx", import.meta.url), "utf8");
const mobileExplore = readFileSync(new URL("../AthleteN-Mobile/src/app/explore.tsx", import.meta.url), "utf8");

test("reward ledger is private and only the server role receives minimum endpoint access", () => {
  assert.match(ledger, /ALTER TABLE public\.reward_ad_sessions ENABLE ROW LEVEL SECURITY/i);
  assert.match(ledger, /ALTER TABLE public\.reward_ledger ENABLE ROW LEVEL SECURITY/i);
  assert.match(ledger, /REVOKE ALL ON TABLE public\.reward_ad_sessions FROM PUBLIC, anon, authenticated, service_role/i);
  assert.match(ledger, /GRANT SELECT, INSERT ON TABLE public\.reward_ad_sessions TO service_role/i);
  assert.match(ledger, /GRANT SELECT ON TABLE public\.reward_ledger TO service_role/i);
  assert.match(ledger, /UNIQUE\(provider, provider_transaction_id\)/i);
});

test("AdMob reward grants require a consumed-once server session, verified reward shape and enforced caps", () => {
  assert.match(ledger, /SECURITY DEFINER\s+SET search_path = ''/i);
  assert.match(ledger, /auth\.role\(\).*service_role/s);
  assert.match(ledger, /p_reward_item IS DISTINCT FROM 'athleten_ai_message'/i);
  assert.match(ledger, /p_reward_amount IS DISTINCT FROM 2/i);
  assert.match(ledger, /pg_advisory_xact_lock/);
  assert.match(ledger, /v_daily_count >= 3/);
  assert.match(ledger, /v_monthly_credits \+ 2 > 30/);
  assert.match(ledger, /SET consumed_at = v_now/);
  assert.match(ledger, /expires_at, metadata/);
});

test("AdMob SSV callback verifies Google's ECDSA signature before calling the grant RPC", () => {
  assert.match(ssv, /https:\/\/www\.gstatic\.com\/admob\/reward\/verifier-keys\.json/);
  assert.match(ssv, /verifySignature\(/);
  assert.match(ssv, /Buffer\.from\(signedContent, "utf8"\)/);
  assert.match(ssv, /dsaEncoding: "der"/);
  assert.ok(ssv.indexOf("if (!valid)") < ssv.indexOf('admin.rpc("grant_rewarded_ad_credit"'));
  assert.match(ssv, /KEY_CACHE_MAX_AGE_MS = 23 \* 60 \* 60 \* 1000/);
  assert.match(ssv, /p_custom_data_hash/);
});

test("reward ad session creation fails closed pending adult and youth-safety approval", () => {
  assert.match(session, /ATHLETEN_REWARDED_ADS_ENABLED/);
  assert.match(session, /ATHLETEN_REWARDED_ADS_LIVE_APPROVED/);
  assert.match(session, /ATHLETEN_REWARDED_ADS_MINOR_SAFETY_APPROVED/);
  assert.match(session, /randomBytes\(32\)/);
  assert.match(session, /createHash\("sha256"\)/);
  assert.match(session, /custom_data_hash: customDataHash/);
  assert.doesNotMatch(session, /request\.json\(\).*user_id/s);
  assert.match(session, /get_age_verification_status/);
  assert.match(session, /ageRecord\\?\\.status !== "not_required"/);
  assert.match(session, /ageYears < 18/);
  assert.match(session, /Rewarded ads are not available for accounts under 18/);
});

test("wallet API derives its owner from the authenticated Supabase user", () => {
  assert.match(wallet, /client\.auth\.getUser\(accessToken\)/);
  assert.match(wallet, /\.eq\("user_id", authData\.user\.id\)/);
  assert.doesNotMatch(wallet, /body\.user_id|query\.user_id|searchParams\.get\("user_id"\)/);
});

test("AI Coach uses subscription quota first, then a separately metered reward credit", () => {
  assert.match(aiCoach, /budgetAdmin\.rpc\("reserve_ai_usage"/);
  assert.match(aiCoach, /budgetAdmin\.rpc\("reserve_reward_ai_usage"/);
  assert.match(aiCoach, /cancelSelectedReservation\(budgetAdmin, reservationId, userId, reservationKind\)/);
  assert.match(aiCoach, /cancel_reward_ai_usage/);
  assert.match(aiCoach, /planId !== "free" && !activeSubscription/);
  assert.match(aiCoach, /reserve_athleten_ai_budget/);
});

test("bonus AI reservations are server-only, expire with their source credits, and can be safely refunded", () => {
  assert.match(consumption, /reserve_reward_ai_usage/);
  assert.match(consumption, /cancel_reward_ai_usage/);
  assert.match(consumption, /pg_advisory_xact_lock/);
  assert.match(consumption, /event_type, expires_at, metadata/);
  assert.match(consumption, /'redeemed'/);
  assert.match(consumption, /'reversed'/);
  assert.match(consumption, /GRANT EXECUTE ON FUNCTION public\.reserve_reward_ai_usage\(uuid,text\)\s+TO service_role/i);
  assert.match(consumption, /GRANT EXECUTE ON FUNCTION public\.cancel_reward_ai_usage\(uuid,uuid\)\s+TO service_role/i);
});


test("wallet endpoint uses a server aggregate and stable, bounded history pagination", () => {
  assert.match(wallet, /rpc\("get_reward_wallet_summary"/);
  assert.match(wallet, /PAGE_SIZE \+ 1/);
  assert.match(wallet, /parseCursor/);
  assert.match(wallet, /\.order\("id", \{ ascending: false \}\)/);
  assert.match(wallet, /historyQuery\.or/);
});

test("wallet summary aggregates the full ledger and is service-role only", () => {
  assert.match(walletSummaryMigration, /sum\(l\.amount\) FILTER/i);
  assert.match(walletSummaryMigration, /GRANT EXECUTE ON FUNCTION public\.get_reward_wallet_summary\(uuid\)\s+TO service_role/i);
  assert.match(walletSummaryMigration, /REVOKE ALL ON FUNCTION public\.get_reward_wallet_summary\(uuid\)\s+FROM PUBLIC, anon, authenticated/i);
});

test("mobile Rewards Centre supports loading older history pages", () => {
  assert.match(mobileRewards, /LOAD OLDER/);
  assert.match(mobileRewards, /reward-wallet\?cursor=/);
});

test("mobile Rewards Centre shows wallet history and clearly discloses that ads are not live", () => {
  assert.match(mobileRewards, /reward-wallet/);
  assert.match(mobileRewards, /REWARD HISTORY/);
  assert.match(mobileRewards, /Rewarded ads are not live yet/);
  assert.match(mobileRewards, /Your existing AthleteN access is not affected/);
  assert.match(mobileExplore, /router\.push\('\/rewards'\)/);
});
