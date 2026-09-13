import { createClient } from "@supabase/supabase-js";

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
  pro: 100,
  champion: 500,
  academy: 2000
};

const MAX_PROMPT_LENGTH = 4000;
const MAX_EMOTIONAL_PROMPT_LENGTH = 12000;
const MAX_TOPIC_LENGTH = 64;
const OPENAI_TIMEOUT_MS = 20000;

// AthleteOS is intentionally athlete-first, not a general coding/productivity assistant.
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
  await supabase.rpc("cancel_ai_usage", {
    p_usage_id: reservationId,
    p_user_id: userId
  }).catch(() => undefined);
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
    return json("Choose an AthleteOS topic and enter a prompt.", 400);
  }
  if (topic.length > MAX_TOPIC_LENGTH) {
    return json(`Topic is too long. Maximum length is ${MAX_TOPIC_LENGTH} characters.`, 400);
  }

  // Block coding/productivity requests at the server boundary. Do this before
  // authentication, quota reservation, or the OpenAI call so blocked requests
  // cannot consume AI quota or reach the model.
  if (isCodingRequest(`${topic}\n${prompt}`)) {
    return json("AthleteOS AI focuses on athlete development, training, competition, wellbeing, and sports support. Coding and software-development requests are not available here.", 403);
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
    return json("AthleteOS services are not configured for AI access.", 503);
  }

  const { data: userData, error: userError } = await supabase.auth.getUser(accessToken);
  if (userError || !userData?.user) return json("Please sign in again before using AI Coach.", 401);

  const userId = userData.user.id;
  const { data: profile, error: profileError } = await supabase
    .from("profiles")
    .select("user_id, plan_id")
    .eq("user_id", userId)
    .maybeSingle();
  if (profileError) return json("Unable to verify your AI entitlement.", 503);
  if (!profile) return json("Complete onboarding before using AI Coach.", 403);

  const { data: subscription, error: subscriptionError } = await supabase
    .from("subscriptions")
    .select("plan_id, status")
    .eq("user_id", userId)
    .in("status", ["active", "trialing"])
    .maybeSingle();
  if (subscriptionError) return json("Unable to verify your subscription.", 503);

  const planId = subscription?.plan_id || profile.plan_id || "free";
  const monthlyLimit = planLimits[planId] ?? 0;
  if (monthlyLimit <= 0) return json("AI Coach is not available on the Free plan.", 403);

  const { data: reservationId, error: reservationError } = await supabase.rpc("reserve_ai_usage", {
    p_user_id: userId,
    p_plan_id: planId,
    p_topic: topic,
    p_monthly_limit: monthlyLimit
  });
  if (reservationError) return json("Unable to reserve your monthly AI usage. Please try again.", 503);
  if (!reservationId) return json("Monthly AI limit reached for your current plan.", 429);

  if (!process.env.OPENAI_API_KEY) {
    await cancelReservation(supabase, reservationId, userId);
    return json("AI Coach is temporarily unavailable.", 503);
  }

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), OPENAI_TIMEOUT_MS);

  let response;
  try {
    response = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
        "Content-Type": "application/json"
      },
      signal: controller.signal,
      body: JSON.stringify({
        model: process.env.OPENAI_MODEL || "gpt-4.1-mini",
        input: [
          { role: "system", content: "You are AthleteOS, a careful Taekwondo performance assistant. Focus on athlete development, training, competition, wellbeing, and sports-related support. Do not provide coding or software-development assistance. For emotional support, respond thoughtfully and at whatever length is useful rather than applying an arbitrary short reply limit. Give practical, age-safe, non-medical guidance. Encourage professional medical help for injuries or health concerns." },
          { role: "user", content: `Topic: ${topic}\nAthlete request: ${prompt}` }
        ]
      })
    });
  } catch (error) {
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
    await cancelReservation(supabase, reservationId, userId);
    return json("AI Coach request failed. Please try again later.", 502);
  }

  const answer = extractResponseText(payload);
  if (!answer) {
    await cancelReservation(supabase, reservationId, userId);
    return json("AI Coach returned an unreadable response. Please try again.", 502);
  }

  const { error: meterError } = await supabase
    .from("ai_usage_events")
    .update({ tokens_used: Number(payload?.usage?.total_tokens) || 0 })
    .eq("id", reservationId)
    .eq("user_id", userId);

  return Response.json({
    answer,
    usageRecorded: !meterError
  });
}
