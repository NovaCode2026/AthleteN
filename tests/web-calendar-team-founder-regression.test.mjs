import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = (path) => readFileSync(new URL(path, import.meta.url), "utf8");

test("web Calendar renders a proper month grid with per-day markers and selected-day details", () => {
  const app = read("../src/App.tsx");
  const calendar = read("../src/components/parity/CalendarPage.tsx");
  const css = read("../src/styles/main.css");

  assert.match(app, /import CalendarPage from "\.\/components\/parity\/CalendarPage"/);
  assert.match(app, /page==="calendar"\)content=<CalendarPage\/>/);
  for (const table of ["calendar_events", "training_sessions", "tournaments", "medals"]) {
    assert.ok(calendar.includes('from("' + table + '")'), "calendar source missing: " + table);
  }
  assert.ok(calendar.includes("athleten-calendar-grid"));
  assert.ok(calendar.includes("athleten-calendar-dots"));
  assert.ok(calendar.includes("eventsByDay.get(selectedDay)"));
  assert.ok(calendar.includes("SELECTED DAY"));
  assert.ok(calendar.includes('from("calendar_events").insert'));
  assert.ok(css.includes(".athleten-calendar-grid"));
});

test("Team & Academy asks for a typed Coach or Academy code, not names", () => {
  const team = read("../src/components/parity/MobileParityPages.tsx");
  const app = read("../src/App.tsx");
  const migration = read("../supabase/migrations/20261115120600_typed_athlete_team_connection_codes.sql");

  assert.ok(team.includes("Coach code"));
  assert.ok(team.includes("Academy code"));
  assert.ok(team.includes("connect_athlete_by_code_typed"));
  assert.ok(team.includes("p_expected_type:connectionType"));
  assert.ok(migration.includes("v_owner_type is distinct from p_expected_type"));
  assert.ok(migration.includes("public.connect_athlete_by_code(p_code)"));
  assert.ok(migration.includes("from public, anon"));
  assert.ok(migration.includes("to authenticated"));

  const onboarding = app.split("\n").find((line) => line.startsWith("function OnboardingPage")) || "";
  const profileModal = app.split("\n").find((line) => line.startsWith("function RecordModal")) || "";
  assert.doesNotMatch(onboarding, /label="Club"|label="Coach"/);
  assert.doesNotMatch(profileModal, /\["academy","Academy"\]|\["coach","Coach"\]/);
});

test("Founder dashboard counts real academy workspaces and labels feature flags honestly", () => {
  const founder = read("../AthleteN-Mobile/src/app/founder.tsx");

  assert.ok(founder.includes("from('academies').select('id,status')"));
  assert.ok(founder.includes("academies.filter((row) => row.status === 'active').length"));
  assert.ok(founder.includes("paidSubscriptions"));
  assert.ok(founder.includes("openTickets"));
  assert.ok(founder.includes("pendingPayments"));
  assert.ok(founder.includes("announcements"));
  assert.ok(founder.includes("Owner Command Center"));
  assert.ok(founder.includes("Android Release Control"));
  assert.ok(founder.includes("not the number of product modules"));
  assert.ok(founder.includes("const PRODUCT_MODULES = ["));
  assert.ok(founder.includes("IMPLEMENTED MODULES"));
  assert.ok(founder.includes("VIEW ALL " + "'));
  assert.ok(founder.includes("empty table does not mean AthleteN has zero product features"));
  assert.doesNotMatch(founder, /LIVE FEATURES/);
});

test("web form controls use consistent dark-theme text, textarea and focus styling", () => {
  const css = read("../src/styles/main.css");
  assert.ok(css.includes("ATHLETEN_FORM_CONTROLS_CONTRAST_FIX"));
  assert.ok(css.includes("textarea::placeholder"));
  assert.ok(css.includes("input:focus-visible"));
  assert.ok(css.includes("select option"));
  assert.ok(css.includes("box-shadow: 0 0 0 1000px #10243b inset"));
});

test("Team & Academy selector has responsive visible styles", () => {
  const css = read("../src/styles/main.css");
  assert.match(css, /\.segmented-control\{display:flex/);
  assert.match(css, /\.segmented-control button\.active/);
  assert.match(css, /@media\(max-width:440px\)/);
});
