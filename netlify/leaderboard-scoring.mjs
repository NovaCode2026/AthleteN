export const LEADERBOARD_TIME_ZONE = "Asia/Kolkata";

export const LEADERBOARD_CATEGORIES = Object.freeze([
  { key: "training_consistency", label: "Training & Consistency", status: "active", description: "One daily credit for logging a training day. Extra sessions do not add more points." },
  { key: "performance_progress", label: "Performance & Progress", status: "active", description: "Coach-verified milestones achieved today." },
  { key: "competition", label: "Competition", status: "active", description: "Coach-verified tournament results and verified medals recorded today." },
  { key: "fitness_conditioning", label: "Fitness & Conditioning", status: "coming_soon", description: "Will score coach-verified fitness benchmarks only. Training volume, body metrics and health data are not leaderboard points." },
  { key: "learning_development", label: "Learning & Development", status: "active", description: "Newly verified certificates." },
  { key: "goals_achievements", label: "Goals & Achievements", status: "active", description: "System-awarded AthleteN badges and completed goals." },
  { key: "community_teamwork", label: "Community & Teamwork", status: "coming_soon", description: "Waiting for a verified contribution source." },
  { key: "coach_academy", label: "Coach & Academy", status: "active", description: "Attendance marked present or late by a coach." },
  { key: "athleten_engagement", label: "AthleteN Engagement", status: "coming_soon", description: "App opens, screen time and notification taps never earn points." }
]);

const DAY_MS = 24 * 60 * 60 * 1000;
const IST_OFFSET_MS = 330 * 60 * 1000;

export function getIstDayWindow(now = new Date()) {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: LEADERBOARD_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).formatToParts(now);
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  const dayKey = `${values.year}-${values.month}-${values.day}`;
  const start = new Date(Date.UTC(Number(values.year), Number(values.month) - 1, Number(values.day)) - IST_OFFSET_MS);
  const end = new Date(start.getTime() + DAY_MS);
  return {
    dayKey,
    startIso: start.toISOString(),
    endIso: end.toISOString(),
    resetsAt: end.toISOString()
  };
}

function addCapped(score, key, count, pointsPerEvent, dailyCap) {
  if (!Number.isFinite(count) || count <= 0) return;
  score[key] = Math.min(dailyCap, score[key] + Math.floor(count) * pointsPerEvent);
}

function blankScore() {
  return Object.fromEntries(LEADERBOARD_CATEGORIES.map((category) => [category.key, 0]));
}

function countByUser(rows, predicate = () => true) {
  const counts = new Map();
  for (const row of rows || []) {
    if (!row?.user_id || !predicate(row)) continue;
    counts.set(row.user_id, (counts.get(row.user_id) || 0) + 1);
  }
  return counts;
}

export function buildDailyLeaderboard(profiles, events, currentUserId = null) {
  const eligibleProfiles = (profiles || []).filter((profile) =>
    profile?.role === "athlete" && profile?.leaderboard_opt_in === true && typeof profile.user_id === "string"
  );
  const rowsByUser = new Map(eligibleProfiles.map((profile) => [profile.user_id, {
    displayName: safeAlias(profile.leaderboard_display_name, profile.user_id),
    categories: blankScore(),
    totalPoints: 0,
    isYou: profile.user_id === currentUserId
  }]));

  const applyCount = (rows, category, points, cap, predicate) => {
    for (const [userId, count] of countByUser(rows, predicate)) {
      const score = rowsByUser.get(userId);
      if (score) addCapped(score.categories, category, count, points, cap);
    }
  };

  // One training-day credit only: logging more sessions or longer sessions never
  // increases this category, which avoids rewarding overtraining.
  const trainingUsers = new Set([
    ...(events.trainingSessions || []).map((row) => row.user_id),
    ...(events.taekwondoTrainingLogs || []).map((row) => row.user_id)
  ].filter(Boolean));
  for (const userId of trainingUsers) {
    const score = rowsByUser.get(userId);
    if (score) score.categories.training_consistency = 10;
  }

  applyCount(events.verifiedMilestones, "performance_progress", 10, 20,
    (row) => row.verification_status === "verified");
  applyCount(events.kyorugiBouts, "competition", 5, 10,
    (row) => row.is_official === true);
  applyCount(events.poomsaePerformances, "competition", 5, 10,
    (row) => row.is_official === true);

  const conditioningPattern = /\b(conditioning|strength|stamina|endurance|mobility)\b/i;
  applyCount(events.conditioningLogs, "fitness_conditioning", 5, 5,
    (row) => row.is_official === true && conditioningPattern.test(String(row.focus || "")));

  applyCount(events.verifiedCertificates, "learning_development", 10, 20,
    (row) => row.verification_status === "verified");

  applyCount(events.completedGoals, "goals_achievements", 10, 20,
    (row) => String(row.status || "").toLowerCase() === "completed");
  applyCount(events.badges, "goals_achievements", 10, 20,
    (row) => true);

  applyCount(events.coachAttendance, "coach_academy", 5, 10,
    (row) => ["present", "late"].includes(String(row.status || "").toLowerCase()));

  const leaderboard = [...rowsByUser.values()].map((row) => ({
    ...row,
    totalPoints: Object.values(row.categories).reduce((sum, points) => sum + points, 0)
  })).sort((a, b) => b.totalPoints - a.totalPoints || a.displayName.localeCompare(b.displayName));

  let previousPoints = null;
  let currentRank = 0;
  leaderboard.forEach((row, index) => {
    if (row.totalPoints !== previousPoints) currentRank = index + 1;
    row.rank = currentRank;
    previousPoints = row.totalPoints;
  });

  return leaderboard;
}

function safeAlias(alias, userId) {
  const candidate = typeof alias === "string" ? alias.trim() : "";
  if (/^[A-Za-z0-9][A-Za-z0-9 ._-]{1,23}$/.test(candidate)) return candidate;
  return `Athlete-${String(userId).replace(/[^a-z0-9]/gi, "").slice(-4).toUpperCase() || "USER"}`;
}
