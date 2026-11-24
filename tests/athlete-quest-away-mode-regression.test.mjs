import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const migration = await readFile(new URL("../supabase/migrations/20261124220000_athlete_quest_away_mode.sql", import.meta.url), "utf8");
const mobileHome = await readFile(new URL("../AthleteN-Mobile/src/app/home.tsx", import.meta.url), "utf8");
const mobileMissions = await readFile(new URL("../AthleteN-Mobile/src/app/missions.tsx", import.meta.url), "utf8");
const mobileAway = await readFile(new URL("../AthleteN-Mobile/src/app/away-mode.tsx", import.meta.url), "utf8");
const webQuests = await readFile(new URL("../src/components/quests/AthleteQuestPanel.tsx", import.meta.url), "utf8");
const webAway = await readFile(new URL("../src/components/away/AwayModePage.tsx", import.meta.url), "utf8");
const webApp = await readFile(new URL("../src/App.tsx", import.meta.url), "utf8");

test("quest completion records are private, unique, and non-monetary", () => {
  assert.match(migration, /CREATE TABLE IF NOT EXISTS public\.athlete_quest_completions/i);
  assert.match(migration, /UNIQUE \(user_id, quest_key, period_key\)/i);
  assert.match(migration, /ENABLE ROW LEVEL SECURITY/i);
  assert.match(migration, /user_id = \(SELECT auth\.uid\(\)\)/i);
  assert.match(migration, /Missed quests do not modify training streaks or leaderboard scores/i);
  assert.doesNotMatch(migration, /xp_balance|reward_wallet|points_awarded/i);
});

test("away plans are owner-private and bounded", () => {
  assert.match(migration, /CREATE TABLE IF NOT EXISTS public\.athlete_away_plans/i);
  assert.match(migration, /athlete_away_plans_packing_array/i);
  assert.match(migration, /athlete_away_plans_itinerary_array/i);
  assert.match(migration, /athlete_away_plans_date_order/i);
  assert.match(migration, /FOR SELECT TO authenticated[\s\S]*?user_id = \(SELECT auth\.uid\(\)\)/i);
  assert.match(migration, /FOR UPDATE TO authenticated[\s\S]*?WITH CHECK \(user_id = \(SELECT auth\.uid\(\)\)\)/i);
});

test("Quest is integrated with the existing streak surface on mobile", () => {
  assert.match(mobileHome, /ATHLETEN QUEST/);
  assert.match(mobileHome, /router\.push\('\/missions'\)/);
  assert.match(mobileMissions, /ATHLETE_QUESTS/);
  assert.match(mobileMissions, /Missed quests never break or reset your training streak/i);
  assert.match(webQuests, /athlete_quest_completions/);
});

test("Away Mode is available as a separate feature on web and mobile", () => {
  assert.match(mobileAway, /athlete_away_plans/);
  assert.match(mobileAway, /PACKING CHECKLIST/);
  assert.match(mobileAway, /PERSONAL ITINERARY/);
  assert.match(webAway, /athlete_away_plans/);
  assert.match(webApp, /"\/away-mode": "away-mode"/);
  assert.match(webApp, /<AwayModePage setToast=\{setToast\} \/>/);
});
