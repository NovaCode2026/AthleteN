import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = (path) => readFileSync(new URL(path, import.meta.url), "utf8");

test("production Android entry remains Expo Router and isolates optional widget registration", () => {
  const entry = read("../AthleteN-Mobile/index.ts");
  assert.match(entry, /import ['"]expo-router\/entry['"]/);
  assert.match(entry, /registerWidgetTaskHandler/);
  assert.match(entry, /\.catch\(\(error\) =>/);
  assert.doesNotMatch(entry, /NativeBootIsolation/);
});

test("root layout hides splash with route handoff and bounded failsafe", () => {
  const layout = read("../AthleteN-Mobile/src/app/_layout.tsx");
  assert.match(layout, /preventAutoHideAsync/);
  assert.match(layout, /hideAsync/);
  assert.match(layout, /3500/);
  assert.match(layout, /DeferredStartupFeatures/);
  assert.match(layout, /12000/);
  assert.match(layout, /AppErrorBoundary/);
});

test("age-verification and academy startup lookups fail into retry UI instead of hanging", () => {
  const route = read("../AthleteN-Mobile/src/app/index.tsx");
  assert.match(route, /get_age_verification_status/);
  assert.match(route, /catch \(error\)/);
  assert.match(route, /finally/);
  assert.match(route, /setAgeStatus\('error'\)/);
  assert.match(route, /setAcademySetup\('error'\)/);
  assert.match(route, /Could not verify account status/);
  assert.match(route, /Academy setup check unavailable/);
  assert.match(route, /setAgeRetry/);
  assert.match(route, /setAcademyRetry/);
});
