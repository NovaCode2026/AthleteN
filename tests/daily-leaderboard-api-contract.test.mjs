import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const endpoint = readFileSync(new URL("../netlify/functions/daily-leaderboard.mjs", import.meta.url), "utf8");
const migration = readFileSync(new URL("../supabase/migrations/20261124120000_daily_athlete_leaderboard.sql", import.meta.url), "utf8");
const mobile = readFileSync(new URL("../AthleteN-Mobile/src/app/leaderboard.tsx", import.meta.url), "utf8");
const web = readFileSync(new URL("../src/components/leaderboard/DailyLeaderboardPage.tsx", import.meta.url), "utf8");
const explore = readFileSync(new URL("../AthleteN-Mobile/src/app/explore.tsx", import.meta.url), "utf8");
const app = readFileSync(new URL("../src/App.tsx", import.meta.url), "utf8");

test("daily leaderboard endpoint requires an authenticated user and returns alias-only rows", () => {
  assert.match(endpoint, /const user = await authenticate\(request\)/);
  assert.match(endpoint, /\.eq\("leaderboard_opt_in", true\)/);
  assert.match(endpoint, /leaderboard: rows\.map\(\(\{ displayName, categories, totalPoints, rank, isYou \}\)/);
  assert.doesNotMatch(endpoint, /leaderboard: rows\.map\([\s\S]{0,500}full_name|username|avatar_url/);
  assert.match(endpoint, /training_sessions[\s\S]*?\.eq\("session_date", dayKey\)/);
  assert.match(endpoint, /taekwondo_training_logs[\s\S]*?\.eq\("session_date", dayKey\)/);
  assert.match(endpoint, /timeZone: LEADERBOARD_TIME_ZONE/);
  assert.match(endpoint, /resetsAt: period\.resetsAt/);
});

test("leaderboard migration defaults to private opt-out and requires a unique safe alias", () => {
  assert.match(migration, /leaderboard_opt_in boolean not null default false/i);
  assert.match(migration, /leaderboard_display_name text/i);
  assert.match(migration, /profiles_leaderboard_opt_in_requires_alias/i);
  assert.match(migration, /create unique index if not exists profiles_daily_leaderboard_alias_unique_idx/i);
  assert.match(migration, /lower\(leaderboard_display_name\)/i);
  assert.match(migration, /char_length\(leaderboard_display_name\) between 2 and 24/i);
});

test("web and mobile expose opt-in, opt-out, and alias editing without public identity fields", () => {
  for (const source of [mobile, web]) {
    assert.match(source, /leaderboard_opt_in/);
    assert.match(source, /leaderboard_display_name/);
    assert.match(source, /save leaderboard settings|save settings/i);
    assert.match(source, /choose a public alias|choose an alias/i);
  }
  assert.match(explore, /Daily Leaderboard/);
  assert.match(app, /DailyLeaderboardPage/);
  assert.match(app, /"\/leaderboard": "leaderboard"/);
});

test("public leaderboard UI states the IST midnight reset and privacy model", () => {
  assert.match(mobile, /12:00 AM IST/);
  assert.match(mobile, /full name, username, photo and private athlete records are not displayed/i);
  assert.match(web, /12:00 AM IST/);
  assert.match(web, /full name, username, photo and private athlete records are not displayed/i);
});


test("leaderboard migration has complete, well-formed alias constraints and remains private by default", () => {
  assert.equal(migration.split("do $$").length - 1, 1);
  assert.equal(migration.split("$$;").length - 1, 1);
  assert.ok(migration.includes("leaderboard_opt_in boolean not null default false"));
  assert.ok(migration.includes("leaderboard_display_name = btrim(leaderboard_display_name)"));
  assert.ok(migration.includes("leaderboard_display_name ~ '^[A-Za-z0-9][A-Za-z0-9 ._-]{1,23}$'"));
  assert.ok(migration.includes("create unique index if not exists profiles_daily_leaderboard_alias_unique_idx"));
  assert.equal(migration.includes("do $\n"), false);
});
