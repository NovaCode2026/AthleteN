import test from "node:test";
import assert from "node:assert/strict";
import { buildDailyLeaderboard, getIstDayWindow, LEADERBOARD_CATEGORIES } from "../netlify/leaderboard-scoring.mjs";

test("IST leaderboard day is based on Asia/Kolkata midnight, not UTC midnight", () => {
  const beforeMidnight = getIstDayWindow(new Date("2026-11-24T18:29:59.000Z"));
  const atMidnight = getIstDayWindow(new Date("2026-11-24T18:30:00.000Z"));
  assert.equal(beforeMidnight.dayKey, "2026-11-24");
  assert.equal(beforeMidnight.startIso, "2026-11-23T18:30:00.000Z");
  assert.equal(beforeMidnight.endIso, "2026-11-24T18:30:00.000Z");
  assert.equal(atMidnight.dayKey, "2026-11-25");
  assert.equal(atMidnight.startIso, "2026-11-24T18:30:00.000Z");
  assert.equal(beforeMidnight.nextDayKey, "2026-11-25");
  assert.equal(atMidnight.nextDayKey, "2026-11-26");
});

test("all nine approved categories are present and engagement does not reward app opens", () => {
  assert.equal(LEADERBOARD_CATEGORIES.length, 9);
  assert.ok(LEADERBOARD_CATEGORIES.some((item) => item.key === "community_teamwork" && item.status === "coming_soon"));
  assert.ok(LEADERBOARD_CATEGORIES.some((item) => item.key === "fitness_conditioning" && item.status === "coming_soon"));
  assert.ok(LEADERBOARD_CATEGORIES.some((item) => item.key === "athleten_engagement" && item.status === "coming_soon"));
  assert.match(LEADERBOARD_CATEGORIES.find((item) => item.key === "athleten_engagement").description, /never earn points/i);
});

test("daily scores are opt-in, bounded and do not reward extra training volume", () => {
  const profiles = [
    { user_id: "a", role: "athlete", leaderboard_opt_in: true, leaderboard_display_name: "Asha" },
    { user_id: "b", role: "athlete", leaderboard_opt_in: false, leaderboard_display_name: "Hidden" },
    { user_id: "c", role: "coach", leaderboard_opt_in: true, leaderboard_display_name: "Coach" }
  ];
  const events = {
    trainingSessions: [{ user_id: "a" }, { user_id: "a" }, { user_id: "a" }],
    taekwondoTrainingLogs: [{ user_id: "a" }],
    verifiedMilestones: [{ user_id: "a", verification_status: "verified" }, { user_id: "a", verification_status: "verified" }, { user_id: "a", verification_status: "verified" }],
    verifiedCompetitionResults: [{ user_id: "a", verification_status: "verified" }, { user_id: "a", verification_status: "verified" }, { user_id: "a", verification_status: "verified" }],
    verifiedMedals: [{ user_id: "a", verification_status: "verified" }],
    fitnessConditioning: [],
    verifiedCertificates: [{ user_id: "a", verification_status: "verified" }, { user_id: "a", verification_status: "verified" }, { user_id: "a", verification_status: "verified" }],
    badges: [{ user_id: "a", metadata: { system_assigned: true } }, { user_id: "a", metadata: { system_assigned: true } }],
    coachAttendance: [{ user_id: "a", status: "present" }, { user_id: "a", status: "late" }, { user_id: "a", status: "present" }]
  };
  const rows = buildDailyLeaderboard(profiles, events, "a");
  assert.equal(rows.length, 1);
  assert.equal(rows[0].displayName, "Asha");
  assert.equal(rows[0].categories.training_consistency, 10);
  assert.equal(rows[0].categories.performance_progress, 20);
  assert.equal(rows[0].categories.competition, 10);
  assert.equal(rows[0].categories.fitness_conditioning, 0);
  assert.equal(rows[0].categories.learning_development, 20);
  assert.equal(rows[0].categories.goals_achievements, 20);
  assert.equal(rows[0].categories.coach_academy, 10);
  assert.equal(rows[0].categories.community_teamwork, 0);
  assert.equal(rows[0].categories.athleten_engagement, 0);
  assert.equal(rows[0].totalPoints, 95);
  assert.equal(rows[0].isYou, true);
});

test("unverified achievements and non-official competition results do not add points", () => {
  const profiles = [{ user_id: "x", role: "athlete", leaderboard_opt_in: true }];
  const rows = buildDailyLeaderboard(profiles, {
    trainingSessions: [],
    taekwondoTrainingLogs: [],
    verifiedMilestones: [{ user_id: "x", verification_status: "pending" }],
    verifiedCompetitionResults: [{ user_id: "x", verification_status: "pending" }],
    verifiedMedals: [{ user_id: "x", verification_status: "pending" }],
    fitnessConditioning: [],
    verifiedCertificates: [{ user_id: "x", verification_status: "pending" }],
    completedGoals: [],
    badges: [{ user_id: "x", metadata: { system_assigned: false } }],
    coachAttendance: []
  });
  assert.equal(rows[0].totalPoints, 0);
  assert.match(rows[0].displayName, /^Athlete-/);
});
