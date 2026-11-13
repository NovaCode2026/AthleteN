import { createClient } from "@supabase/supabase-js";
import { env, serverSupabase } from "../payment-common.mjs";
import { calculateAiCostPaise, estimateInputTokens, readAiBudgetConfig } from "../ai-budget.mjs";

const allowedTopics = new Set([
  "Training Coach",
  "Tournament Preparation",
  "Match Analysis",
  "Nutrition Advice",
  "Recovery Advice",
  "Goal Suggestions",
  "Performance Reports",
  "Motivational Feedback",
  "Emotional Support"
]);

const planLimits = {
  free: 0,
  student: 50,
  pro: 50,
  elite: 200,
  coach: 750,
  academy: 1000
};

const MAX_PROMPT_LENGTH = 4000;
const MAX_EMOTIONAL_PROMPT_LENGTH = 12000;
const MAX_TOPIC_LENGTH = 64;
const OPENAI_TIMEOUT_MS = 20000;

// AthleteN is intentionally athlete-first, not a general coding/productivity assistant.
// This gate runs on the server so clients cannot bypass a frontend-only restriction.
const codingPatterns = [
  /\b(write|generate|create|build|make|code|program|script|implement|debug|fix)\b.{0,80}\b(code|coding|program|script|software|app|website|api|database|sql|javascript|typescript|python|java|c\+\+|html|css|react|next\.js|node|github)\b/i,
  /\b(code|coding|programming|software development|web development|app development|debugging)\b/i,
  /\b(leetcode|stack overflow|pull request|repository|git commit|npm|pnpm|docker)\b/i
];

function isCodingRequest(text) {
  return codingPatterns.some((pattern) => pattern.test(text));
}

function isEmotionalSupportRequest(topic, text) {
  if (topic === "Emotional Support") return true;
  return /\b(feel|feeling|sad|stress|stressed|anxious|anxiety|lonely|upset|angry|overwhelmed|worried|worry|confidence|motivation|pressure|burnout|frustrated|frustration|heartbroken|emotional|emotion|talk to me|listen)\b/i.test(text);
}

function json(error, status) {
  return Response.json({ error }, { status });
}

function createUserSupabaseClient(accessToken) {
  const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
  const supabaseAnonKey = process.env.VITE_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseAnonKey) {
    throw new Error("SUPABASE_PUBLIC_CONFIG_MISSING");
  }

  return createClient(supabaseUrl, supabaseAnonKey, {
    global: { headers: { Authorization: `Bearer ${accessToken}` } },
    auth: { persistSession: false, autoRefreshToken: false }
  });
}

async function cancelReservation(supabase, reservationId, userId) {
  if (!reservationId) return;
  await supabase.rpc("cancel_ai_usage", { p_usage_id: reservationId, p_user_id: userId }).catch(() => undefined);
}
async function settlePlatformBudget(admin, id, actualCostPaise) {
  if (!id) return { error: new Error("AI budget reservation is missing.") };
  const result = await admin.rpc("settle_athleten_ai_budget", { p_reservation_id:id, p_actual_cost_paise:actualCostPaise });
  if (result.error) return result;
  if (result.data !== true) return { error:new Error("AI budget reservation was not settled.") };
  return result;
}
async function releasePlatformBudget(admin, id) {
  if (!id) return { error:new Error("AI budget reservation is missing.") };
  const result = await admin.rpc("release_athleten_ai_budget", { p_reservation_id:id });
  if (result.error) console.error("AI budget reservation release failed:", result.error);
  else if (result.data !== true) console.error("AI budget reservation was not released.");
  return result;
}

function extractResponseText(payload) {
  if (typeof payload?.output_text === "string" && payload.output_text.trim()) {
    return payload.output_text.trim();
  }

  const output = Array.isArray(payload?.output) ? payload.output : [];
  const parts = [];
  for (const item of output) {
    const content = Array.isArray(item?.content) ? item.content : [];
    for (const block of content) {
      if (typeof block?.text === "string") parts.push(block.text);
      else if (typeof block?.text?.value === "string") parts.push(block.text.value);
    }
  }

  const answer = parts.join("").trim();
  return answer || null;
}

export default async function handler(request) {
  if (request.method !== "POST") return json("Method not allowed.", 405);

  const body = await request.json().catch(() => ({}));
  const topic = typeof body.topic === "string" ? body.topic.trim() : "";
  const prompt = typeof body.prompt === "string" ? body.prompt.trim() : "";

  if (!allowedTopics.has(topic) || !prompt) {
    return json("Choose an AthleteN topic and enter a prompt.", 400);
  }
  if (topic.length > MAX_TOPIC_LENGTH) {
    return json(`Topic is too long. Maximum length is ${MAX_TOPIC_LENGTH} characters.`, 400);
  }

  // Block coding/productivity requests at the server boundary. Do this before
  // authentication, quota reservation, or the OpenAI call so blocked requests
  // cannot consume AI quota or reach the model.
  if (isCodingRequest(`${topic}\n${prompt}`)) {
    return json("AthleteN AI focuses on athlete development, training, competition, wellbeing, and sports support. Coding and software-development requests are not available here.", 403);
  }

  const emotionalSupport = isEmotionalSupportRequest(topic, prompt);
  if (!emotionalSupport && prompt.length > MAX_PROMPT_LENGTH) {
    return json(`Prompt is too long. Maximum length is ${MAX_PROMPT_LENGTH} characters.`, 413);
  }
  if (emotionalSupport && prompt.length > MAX_EMOTIONAL_PROMPT_LENGTH) {
    return json(`This message is too large to process safely. Maximum length is ${MAX_EMOTIONAL_PROMPT_LENGTH} characters.`, 413);
  }

  const accessToken = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  if (!accessToken) return json("Please sign in again before using AI Coach.", 401);

  let supabase;
  try {
    supabase = createUserSupabaseClient(accessToken);
  } catch {
    return json("AthleteN services are not configured for AI access.", 503);
  }

  const { data: userData, error: userError } = await supabase.auth.getUser(accessToken);
  if (userError || !userData?.user) return json("Please sign in again before using AI Coach.", 401);

  const userId = userData.user.id;
  const { data: profile, error: profileError } = await supabase
    .from("profiles")
    .select("user_id, plan_id, role, academy_id")
    .eq("user_id", userId)
    .maybeSingle();
  if (profileError) return json("Unable to verify your AI entitlement.", 503);
  if (!profile) return json("Complete onboarding before using AI Coach.", 403);

  const role = String(profile.role || "athlete");
  const planId = String(profile.plan_id || "free");
  const roleAllowed =
    (["student", "pro", "elite"].includes(planId) && role === "athlete") ||
    (planId === "coach" && role === "coach") ||
    (planId === "academy" && role === "academy_admin");
  if (planId !== "free" && !roleAllowed) {
    return json("Your account type does not match this paid plan. Contact AthleteN support.", 403);
  }
  if (["coach", "academy"].includes(planId) && !userData.user.email_confirmed_at) {
    return json("Verify your AthleteN account email before using Coach or Academy AI features.", 403);
  }

  if (planId === "student") {
    const { data: verification, error: verificationError } = await supabase
      .from("student_verifications")
      .select("id,status")
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (verificationError) return json("Unable to verify Student plan approval.", 503);
    if (verification?.status !== "approved") {
      return json("Admin approval for Student verification is required for AI reports.", 403);
    }
  }

  // Coach accounts rely on the existing verified Coach role workflow.
  // Academy accounts must also complete the existing Academy setup and email verification.
  if (planId === "academy") {
    let academyQuery = supabase
      .from("academies")
      .select("id")
      .eq("owner_user_id", userId)
      .eq("status", "active")
      .eq("setup_completed", true)
      .not("contact_email_verified_at", "is", null);
    if (profile.academy_id) academyQuery = academyQuery.eq("id", profile.academy_id);
    const { data: academy, error: academyError } = await academyQuery.limit(1).maybeSingle();
    if (academyError) return json("Unable to verify Academy setup.", 503);
    if (!academy) return json("Complete the existing Academy verification and setup before using Academy AI reports.", 403);
  }

  // Multiple product subscriptions can coexist. Require a live subscription
  // for the exact product currently assigned to this profile.
  const { data: activeSubscription, error: subscriptionError } = await supabase
    .from("subscriptions")
    .select("id,current_period_end")
    .eq("user_id", userId)
    .eq("plan_id", planId)
    .in("status", ["active", "trialing"])
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (subscriptionError) return json("Unable to verify your subscription.", 503);
  if (!activeSubscription) return json("An active subscription for this plan is required to use AthleteN AI.", 403);
  if (activeSubscription.current_period_end && new Date(activeSubscription.current_period_end).getTime() <= Date.now()) {
    return json("Your subscription has expired. Renew your plan to use AthleteN AI.", 403);
  }

  const monthlyLimit = planLimits[planId] ?? 0;
  if (monthlyLimit <= 0) return json("AI Coach is not available on the Free plan.", 403);

  const pricingModel = env("OPENAI_MODEL") || "gpt-4.1-mini";
  const costConfig = readAiBudgetConfig({
    OPENAI_MODEL:pricingModel, ATHLETEN_AI_PRICING_MODEL:env("ATHLETEN_AI_PRICING_MODEL"),
    ATHLETEN_AI_INPUT_PRICE_PER_1M_TOKENS_PAISE:env("ATHLETEN_AI_INPUT_PRICE_PER_1M_TOKENS_PAISE"),
    ATHLETEN_AI_OUTPUT_PRICE_PER_1M_TOKENS_PAISE:env("ATHLETEN_AI_OUTPUT_PRICE_PER_1M_TOKENS_PAISE"),
    ATHLETEN_AI_MONTHLY_BUDGET_PAISE:env("ATHLETEN_AI_MONTHLY_BUDGET_PAISE"),
    ATHLETEN_AI_MAX_OUTPUT_TOKENS:env("ATHLETEN_AI_MAX_OUTPUT_TOKENS")
  });
  if (!costConfig) return json("AI Coach is paused until verified input/output prices for the selected model are configured.", 503);
  const openAiApiKey = env("OPENAI_API_KEY");
  if (!openAiApiKey) return json("AI Coach is not configured on the server.", 503);
  let budgetAdmin;
  try { budgetAdmin = serverSupabase(); } catch { return json("AI Coach is paused until its protected monthly budget ledger is available.", 503); }

  const systemPrompt = "You are AthleteN, a careful Taekwondo performance assistant. Focus on athlete development, training, competition, wellbeing, and sports-related support. Do not provide coding or software-development assistance. For emotional support, respond thoughtfully and at whatever length is useful rather than applying an arbitrary short reply limit. Give practical, age-safe, non-medical guidance. Encourage professional medical help for injuries or health concerns.";
  const modelInput = "Topic: " + topic + "\nAthlete request: " + prompt;
  const reservedCostPaise = calculateAiCostPaise(estimateInputTokens(systemPrompt + "\n" + modelInput), costConfig.maxOutputTokens, costConfig.inputPricePerMillionPaise, costConfig.outputPricePerMillionPaise);
  const clock = new Date();
  const usageMonth = new Date(Date.UTC(clock.getUTCFullYear(), clock.getUTCMonth(), 1)).toISOString().slice(0, 10);
  const { data: budgetReservationId, error: budgetReservationError } = await budgetAdmin.rpc("reserve_athleten_ai_budget", {
    p_usage_month:usageMonth, p_monthly_budget_paise:costConfig.monthlyBudgetPaise, p_reserve_paise:reservedCostPaise
  });
  if (budgetReservationError) { console.error("AI budget reservation failed:", budgetReservationError); return json("AI Coach is paused because the protected monthly budget ledger is not ready.", 503); }
  if (!budgetReservationId) return json("The monthly AthleteN AI operating budget has been reached.", 429);

  const { data: reservationId, error: reservationError } = await supabase.rpc("reserve_ai_usage", {
    p_user_id: userId,
    p_plan_id: planId,
    p_topic: topic,
    p_monthly_limit: monthlyLimit
  });
  if (reservationError) { await releasePlatformBudget(budgetAdmin, budgetReservationId); return json("Unable to reserve your monthly AI usage. Please try again.", 503); }
  if (!reservationId) { await releasePlatformBudget(budgetAdmin, budgetReservationId); return json("Monthly AI limit reached for your current plan.", 429); }

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), OPENAI_TIMEOUT_MS);

  let response;
  try {
    response = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${openAiApiKey}`,
        "Content-Type": "application/json"
      },
      signal: controller.signal,
      body: JSON.stringify({
        model: pricingModel,
        max_output_tokens: costConfig.maxOutputTokens,
        input: [ { role:"system", content:systemPrompt }, { role:"user", content:modelInput } ]
      })
    });
  } catch (error) {
    const settled = await settlePlatformBudget(budgetAdmin, budgetReservationId, reservedCostPaise);
    if (settled.error) console.error("AI timeout budget settlement failed:", settled.error);
    await cancelReservation(supabase, reservationId, userId);
    if (error?.name === "AbortError") {
      return json("AI Coach timed out. Please try again.", 504);
    }
    return json("AI Coach request failed. Please try again later.", 502);
  } finally {
    clearTimeout(timeoutId);
  }

  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    const settled = await settlePlatformBudget(budgetAdmin, budgetReservationId, reservedCostPaise);
    if (settled.error) console.error("AI error-response budget settlement failed:", settled.error);
    await cancelReservation(supabase, reservationId, userId);
    return json("AI Coach request failed. Please try again later.", 502);
  }
  const answer = extractResponseText(payload);
  if (!answer) {
    const settled = await settlePlatformBudget(budgetAdmin, budgetReservationId, reservedCostPaise);
    if (settled.error) console.error("AI unreadable-response budget settlement failed:", settled.error);
    await cancelReservation(supabase, reservationId, userId);
    return json("AI Coach returned an unreadable response. Please try again.", 502);
  }
  const usage = payload?.usage || {};
  const inputTokens = Number.isFinite(Number(usage.input_tokens)) ? Math.max(0, Number(usage.input_tokens)) : null;
  const outputTokens = Number.isFinite(Number(usage.output_tokens)) ? Math.max(0, Number(usage.output_tokens)) : null;
  const totalTokens = Number.isFinite(Number(usage.total_tokens)) ? Math.max(0, Number(usage.total_tokens)) : (inputTokens ?? 0) + (outputTokens ?? 0);
  const actualCostPaise = inputTokens !== null && outputTokens !== null
    ? calculateAiCostPaise(inputTokens, outputTokens, costConfig.inputPricePerMillionPaise, costConfig.outputPricePerMillionPaise)
    : reservedCostPaise;
  const { error: budgetSettlementError } = await settlePlatformBudget(budgetAdmin, budgetReservationId, actualCostPaise);
  if (budgetSettlementError) console.error("AI budget settlement failed; reservation remains held:", budgetSettlementError);
  const { error: meterError } = await supabase.from("ai_usage_events").update({
    tokens_used:totalTokens, input_tokens:inputTokens ?? 0, output_tokens:outputTokens ?? 0,
    total_tokens:totalTokens, api_cost_minor:actualCostPaise
  }).eq("id", reservationId).eq("user_id", userId);
  return Response.json({ answer, usageRecorded:!meterError && !budgetSettlementError, costMetered:!budgetSettlementError });
}
