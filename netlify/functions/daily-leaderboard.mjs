import { authenticate, json, serverSupabase } from "../payment-common.mjs";
import { getIstDayWindow, LEADERBOARD_CATEGORIES, LEADERBOARD_TIME_ZONE, buildDailyLeaderboard } from "../leaderboard-scoring.mjs";

const PAGE_SIZE = 1000;
const MAX_PAGES = 50;

async function readAll(makeQuery) {
  const rows = [];
  for (let page = 0; page < MAX_PAGES; page += 1) {
    const from = page * PAGE_SIZE;
    const { data, error } = await makeQuery().range(from, from + PAGE_SIZE - 1);
    if (error) throw error;
    const batch = data || [];
    rows.push(...batch);
    if (batch.length < PAGE_SIZE) return rows;
  }
  throw new Error("LEADERBOARD_RESULT_LIMIT_EXCEEDED");
}

export default async function handler(request) {
  if (request.method !== "GET") return json({ error: "Method not allowed." }, 405);

  try {
    const user = await authenticate(request);
    if (!user) return json({ error: "Please sign in to view the AthleteN leaderboard." }, 401);

    const admin = serverSupabase();
    const period = getIstDayWindow(new Date());
    const { startIso, endIso, dayKey } = period;

    const [
      profileResult,
      optedInProfiles,
      trainingSessions,
      taekwondoTrainingLogs,
      verifiedMilestones,
      verifiedCompetitionResults,
      verifiedMedals,
      verifiedCertificates,
      systemBadges,
      coachAttendance
    ] = await Promise.all([
      admin.from("profiles")
        .select("leaderboard_opt_in,leaderboard_display_name")
        .eq("user_id", user.id)
        .maybeSingle(),
      readAll(() => admin.from("profiles")
        .select("user_id,role,leaderboard_opt_in,leaderboard_display_name")
        .eq("role", "athlete")
        .eq("leaderboard_opt_in", true)
        .order("user_id")),
      readAll(() => admin.from("training_sessions")
        .select("user_id,created_at")
        .gte("created_at", startIso).lt("created_at", endIso)),
      readAll(() => admin.from("taekwondo_training_logs")
        .select("user_id,created_at,session_date")
        .gte("created_at", startIso).lt("created_at", endIso)),
      readAll(() => admin.from("athlete_milestones")
        .select("user_id,achieved_at,verification_status")
        .eq("achieved_at", dayKey)
        .eq("verification_status", "verified")),
      readAll(() => admin.from("tournaments")
        .select("user_id,starts_at,result,verification_status")
        .not("result", "is", null)
        .eq("verification_status", "verified")
        .gte("starts_at", dayKey).lt("starts_at", period.nextDayKey)),
      readAll(() => admin.from("medals")
        .select("user_id,awarded_at,verification_status")
        .eq("verification_status", "verified")
        .gte("awarded_at", dayKey).lt("awarded_at", period.nextDayKey)),
      readAll(() => admin.from("certificates")
        .select("user_id,created_at,verification_status")
        .eq("verification_status", "verified")
        .gte("created_at", startIso).lt("created_at", endIso)),
      readAll(() => admin.from("athlete_badges")
        .select("user_id,awarded_at,metadata")
        .gte("awarded_at", startIso).lt("awarded_at", endIso)),
      readAll(() => admin.from("training_group_attendance")
        .select("athlete_user_id,status,marked_at")
        .in("status", ["present", "late"])
        .gte("marked_at", startIso).lt("marked_at", endIso))
    ]);

    if (profileResult.error) throw profileResult.error;

    const adaptedCoachAttendance = (coachAttendance || []).map((row) => ({
      user_id: row.athlete_user_id,
      status: row.status
    }));
    const rows = buildDailyLeaderboard(optedInProfiles, {
      trainingSessions,
      taekwondoTrainingLogs,
      verifiedMilestones,
      verifiedCompetitionResults,
      verifiedMedals,
      verifiedCertificates,
      badges: systemBadges,
      coachAttendance: adaptedCoachAttendance
    }, user.id);

    return json({
      period: dayKey,
      timeZone: LEADERBOARD_TIME_ZONE,
      resetsAt: period.resetsAt,
      categories: LEADERBOARD_CATEGORIES,
      optedIn: profileResult.data?.leaderboard_opt_in === true,
      displayName: profileResult.data?.leaderboard_display_name || "",
      yourRank: rows.find((row) => row.isYou)?.rank ?? null,
      yourPoints: rows.find((row) => row.isYou)?.totalPoints ?? null,
      leaderboard: rows.map(({ displayName, categories, totalPoints, rank, isYou }) => ({
        displayName,
        categories,
        totalPoints,
        rank,
        isYou
      }))
    });
  } catch (error) {
    console.error("Daily leaderboard request failed:", error);
    return json({
      error: "The daily leaderboard is temporarily unavailable. Check that the leaderboard migration is installed and try again."
    }, 503);
  }
}
