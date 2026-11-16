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
  assert.doesNotMatch(backend, /importantFacts\.[A-Za-z_]+\s*\|\|\s*["']—["']/);
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

test("Instagram publication timestamps are never treated as tournament dates", () => {
  assert.doesNotMatch(backend, /taken_at_timestamp/);
  assert.doesNotMatch(backend, /"timestamp"\\s\*:\\s\*"\(\[\^"\]\+\)"/);
});

test("Date comparison allows a source date without a year to match poster evidence with a year", () => {
  assert.match(backend, /dateKeysCompatible/);
  assert.match(backend, /withoutYear/);
  assert.match(backend, /!aYear \|\| !bYear \|\| aYear === bYear/);
});

test("poster URLs are not accepted as registration links without registration context", () => {
  assert.match(backend, /Do not accept arbitrary URLs from poster OCR/);
  assert.match(backend, /registrationUrlLines = lines\.filter/);
});

test("generic source URLs are not promoted to registration links", () => {
  assert.match(backend, /registrationContext = text\.match/);
  assert.doesNotMatch(backend, /text\.match\(\/https\?:\\\/\\\/\[\^\\s\)\]\+\/i\)/);
});

test("reporting/check-in dates cannot silently become tournament dates", () => {
  assert.match(backend, /poster\.date_text = poster\.event_date_text \|\| ""/);
  assert.doesNotMatch(backend, /poster\.date_text = poster\.event_date_text \|\| firstMatch\(compactText/);
});

test("administrative dates are excluded from generic tournament-date extraction", () => {
  assert.match(backend, /const administrative = \/\(\?:reporting\|check\[- \]\?in\|checkin\|weigh\[- \]\?in\|registration\|deadline\|last\\s\+date\|arrival\)/);
  assert.match(backend, /if \(administrative\.test\(prefix\) && !eventContext\.test\(prefix\)\) continue/);
});

test("Instagram scanner outbound requests use exact approved hosts, HTTPS, DNS checks and manual redirects", () => {
  assert.match(backend, /assertPublicHttpUrl/);
  assert.match(backend, /redirect:\s*"manual"/);
  assert.match(backend, /isAllowedInstagramHost/);
  assert.match(backend, /isAllowedInstagramMediaHost/);
  assert.doesNotMatch(backend, /redirect:\s*"follow"/);
  assert.match(backend, /OUTBOUND_HOST_BLOCKED/);
});

test("Instagram scanner bounds HTML, JSON and poster image bodies before buffering", () => {
  assert.match(backend, /readBoundedResponseBuffer/);
  assert.match(backend, /MAX_INSTAGRAM_HTML_BYTES/);
  assert.match(backend, /MAX_INSTAGRAM_JSON_BYTES/);
  assert.match(backend, /MAX_INSTAGRAM_IMAGE_BYTES/);
  assert.doesNotMatch(backend, /response\.arrayBuffer\(\)|response\.text\(\)|response\.json\(\)/);
  assert.match(backend, /POSTER_IMAGE_CONTENT_TYPE_UNSUPPORTED/);
});

test("Instagram scanner requires the caller's own approved age-verification status before service-role operations", () => {
  assert.match(backend, /get_age_verification_status/);
  assert.match(backend, /\["approved",\s*"not_required",\s*"qa_verified"\]/);
  assert.match(backend, /Account approval is required before using the Instagram Tournament Scanner/);
});

test("Instagram source URLs are restricted to HTTPS Instagram domains", () => {
  assert.match(backend, /Only public HTTPS Instagram post, reel, or profile URLs are supported/);
  assert.match(backend, /parsed\.protocol !== "https:"/);
});
