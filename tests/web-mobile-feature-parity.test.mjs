import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";

const read = (path) => readFileSync(new URL(path, import.meta.url), "utf8");
const app = read("../src/App.tsx");
const tabs = read("../AthleteN-Mobile/src/app/(tabs)/_layout.tsx");

const webPageType = app.match(/type PageId = ([^;]+);/)?.[1] || "";
const webPageIds = [...webPageType.matchAll(/"([^"]+)"/g)].map((match) => match[1]);

const mobileRouteByWebPage = {
  dashboard: "../AthleteN-Mobile/src/app/(tabs)/index.tsx",
  profile: "../AthleteN-Mobile/src/app/(tabs)/profile.tsx",
  plans: "../AthleteN-Mobile/src/app/plans.tsx",
  verification: "../AthleteN-Mobile/src/app/verification.tsx",
  tournaments: "../AthleteN-Mobile/src/app/compete.tsx",
  training: "../AthleteN-Mobile/src/app/(tabs)/training.tsx",
  medals: "../AthleteN-Mobile/src/app/(tabs)/medals.tsx",
  documents: "../AthleteN-Mobile/src/app/(tabs)/documents.tsx",
  weight: "../AthleteN-Mobile/src/app/(tabs)/weight.tsx",
  calendar: "../AthleteN-Mobile/src/app/(tabs)/calendar.tsx",
  checklist: "../AthleteN-Mobile/src/app/checklist.tsx",
  scanner: "../AthleteN-Mobile/src/app/scanner.tsx",
  ai: "../AthleteN-Mobile/src/app/(tabs)/ai.tsx",
  feedback: "../AthleteN-Mobile/src/app/feedback.tsx",
  roadmap: "../AthleteN-Mobile/src/app/roadmap.tsx",
  messages: "../AthleteN-Mobile/src/app/(tabs)/messages.tsx",
  taekwondo: "../AthleteN-Mobile/src/app/taekwondo.tsx",
  admin: "../AthleteN-Mobile/src/app/admin.tsx",
  attendance: "../AthleteN-Mobile/src/app/(tabs)/attendance.tsx",
  analytics: "../AthleteN-Mobile/src/app/(tabs)/analytics.tsx",
  reports: "../AthleteN-Mobile/src/app/(tabs)/reports.tsx",
  badges: "../AthleteN-Mobile/src/app/(tabs)/badges.tsx",
  journey: "../AthleteN-Mobile/src/app/(tabs)/journey.tsx",
  notifications: "../AthleteN-Mobile/src/app/(tabs)/notifications.tsx",
  "notification-settings": "../AthleteN-Mobile/src/app/notification-settings.tsx",
  settings: "../AthleteN-Mobile/src/app/settings.tsx",
  "navigation-settings": "../AthleteN-Mobile/src/app/navigation-settings.tsx",
  nutrition: "../AthleteN-Mobile/src/app/nutrition.tsx",
  missions: "../AthleteN-Mobile/src/app/missions.tsx",
  "athlete-passport": "../AthleteN-Mobile/src/app/athlete-passport.tsx",
  support: "../AthleteN-Mobile/src/app/support.tsx",
  team: "../AthleteN-Mobile/src/app/team.tsx",
  "training-session": "../AthleteN-Mobile/src/app/training-session.tsx",
  "competition-mode": "../AthleteN-Mobile/src/app/competition-mode.tsx",
  leaderboard: "../AthleteN-Mobile/src/app/leaderboard.tsx",
  rewards: "../AthleteN-Mobile/src/app/rewards.tsx",
  "away-mode": "../AthleteN-Mobile/src/app/away-mode.tsx",
};

test("every web feature page has a concrete Expo Router mobile route", () => {
  assert.ok(webPageIds.length > 0, "web PageId list should be discoverable");
  assert.deepEqual(
    Object.keys(mobileRouteByWebPage).sort(),
    [...webPageIds].sort(),
    "the web PageId list and explicit mobile route map must stay in sync"
  );

  const missing = webPageIds.filter((pageId) => !existsSync(new URL(mobileRouteByWebPage[pageId], import.meta.url)));
  assert.deepEqual(missing, [], "every web page must resolve to a real mobile route");
});

test("every dynamically registered native tab screen resolves to a route file", () => {
  const idsSource = tabs.match(/const TAB_SCREEN_IDS = new Set\(\[([^\]]+)\]\)/)?.[1] || "";
  const ids = [...idsSource.matchAll(/'([^']+)'/g)].map((match) => match[1]);
  assert.ok(ids.length > 0, "native tab screen registry should be discoverable");
  for (const id of ids) {
    const routePath = new URL(`../AthleteN-Mobile/src/app/(tabs)/${id}.tsx`, import.meta.url);
    assert.ok(existsSync(routePath), `registered tab "${id}" is missing its route file`);
  }
});

test("Journey uses the same Expo Router route ID registered by the native tab bar", () => {
  assert.match(tabs, /\{id:'journey',label:'Journey'/);
  assert.match(tabs, /const TAB_SCREEN_IDS = new Set\(\[[^\]]*'journey'[^\]]*\]\)/);
  const alias = read("../AthleteN-Mobile/src/app/(tabs)/journey.tsx");
  assert.match(alias, /export \{ default \} from '\.\/athlete-journey'/);
});

test("web and mobile retain shared feature contracts for messaging, notifications, rewards and athlete journey", () => {
  const webMessages = read("../src/components/messaging/MessagingPage.tsx");
  const mobileMessages = read("../AthleteN-Mobile/src/app/(tabs)/messages.tsx");
  const webNotifications = read("../src/components/parity/NotificationPages.tsx");
  const mobileNotifications = read("../AthleteN-Mobile/src/app/(tabs)/notifications.tsx");
  const webRewards = read("../src/components/rewards/RewardsCentrePage.tsx");
  const mobileRewards = read("../AthleteN-Mobile/src/app/rewards.tsx");
  const mobileJourney = read("../AthleteN-Mobile/src/app/(tabs)/athlete-journey.tsx");

  assert.ok(webMessages.includes("conversations") && mobileMessages.includes("conversations"));
  assert.ok(webMessages.includes("messages") && mobileMessages.includes("messages"));
  assert.ok(webNotifications.includes("notifications") && mobileNotifications.includes("notifications"));
  assert.ok(webRewards.includes("/.netlify/functions/reward-wallet") && mobileRewards.includes("/.netlify/functions/reward-wallet"));
  for (const table of ["athlete_seasons","competition_journals","fight_iq_entries","technique_progress","athlete_challenges","personal_records","athlete_milestones","athlete_timeline_events"]) {
    assert.ok(mobileJourney.includes(table), `mobile Athlete Journey is missing ${table}`);
  }
});

test("mobile admin governance includes the web admin consent and trust-review workflows", () => {
  const mobileAdmin = read("../AthleteN-Mobile/src/app/admin-operations.tsx");
  const webAdmin = read("../src/components/admin/AdminControlCenter.tsx");
  assert.ok(mobileAdmin.includes("get_age_verification_admin_queue"));
  assert.ok(webAdmin.includes("get_age_verification_admin_queue"));
  assert.ok(mobileAdmin.includes("get_student_verification_queue"));
  assert.ok(mobileAdmin.includes("admin_review_student_verification"));
  assert.ok(mobileAdmin.includes("search_athlete_verification_reviews"));
  assert.ok(mobileAdmin.includes("admin_set_athlete_verified"));
  assert.ok(mobileAdmin.includes("admin_set_platform_account_access"));
  assert.ok(mobileAdmin.includes("admin_assign_platform_role"));
  assert.ok(webAdmin.includes("PlatformAdminExtensions"));
});
