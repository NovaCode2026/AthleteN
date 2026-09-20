import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const backend = fs.readFileSync(path.join(root, "netlify/functions/instagram-tournament-scan.mjs"), "utf8");
const frontend = fs.readFileSync(path.join(root, "src/components/instagram/InstagramOrganizerScanner.tsx"), "utf8");

test("Instagram scanner keeps irrelevant captions non-fatal", () => {
  assert.match(backend, /function valuableText\(/);
  assert.doesNotMatch(backend, /throw new Error\(["']NO_TOURNAMENT_CONTENT/);
  assert.doesNotMatch(backend, /No tournament-related content was accessible/);
});

test("clean tournament facts never use missing-value filler", () => {
  assert.doesNotMatch(backend, /Not found in accessible source/);
  assert.doesNotMatch(backend, /None detected/);
  assert.doesNotMatch(backend, /importantFacts[\\s\\S]{0,6000}\\|\\| ["']—["']/);
  assert.doesNotMatch(frontend, /Not found in accessible source/);
  assert.doesNotMatch(frontend, /None detected/);
});

test("registration URLs require registration-related evidence", () => {
  assert.match(backend, /registrationUrlLines = lines\.filter/);
  assert.match(backend, /register|registration|apply|application|entry|form/);
});

test("poster evidence remains conflict-aware", () => {
  assert.match(backend, /evidence_conflicts/);
  assert.match(backend, /Conflict detected/);
});
