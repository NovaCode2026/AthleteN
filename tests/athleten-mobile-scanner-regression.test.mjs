import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { deflateSync } from "node:zlib";
import { assertPublicHttpUrl, extractDate, extractPdfText, extractStructuredEvent, isBlockedIp } from "../netlify/functions/tournament-scan.mjs";
import { eventDatePatterns } from "../netlify/functions/instagram-tournament-scan.mjs";

const root = process.cwd();
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");

test("scanner extracts selectable text from a basic PDF stream", () => {
  const pdf = Buffer.from("%PDF-1.4\n1 0 obj\n<< /Length 42 >>\nstream\nBT (National Taekwondo Open) Tj ET\nendstream\nendobj\n%%EOF", "latin1");
  assert.match(extractPdfText(pdf), /National Taekwondo Open/);
});

test("scanner extracts selectable text from a Flate-compressed PDF stream", () => {
  const stream = deflateSync(Buffer.from("BT (Taekwondo Championship) Tj ET\n", "latin1"));
  const prefix = Buffer.from("%PDF-1.4\n1 0 obj\n<< /Filter /FlateDecode >>\nstream\n", "latin1");
  const suffix = Buffer.from("\nendstream\nendobj\n%%EOF", "latin1");
  assert.match(extractPdfText(Buffer.concat([prefix, stream, suffix])), /Taekwondo Championship/);
});

test("Today's priorities initializes async collections before first render", () => {
  const screen = read("AthleteN-Mobile/src/app/athlete-command.tsx");
  assert.match(screen, /today:null,plan:null,unread:0,challenges:\[\],checklist:\[\]/);
  assert.match(screen, /data\.challenges\?\.length/);
  assert.match(screen, /data\.checklist\?\.length/);
});

test("home greeting is derived from local time and refreshes on app resume", () => {
  const screen = read("AthleteN-Mobile/src/app/home.tsx");
  assert.match(screen, /function getGreeting\(\)/);
  assert.match(screen, /getHours\(\)/);
  assert.match(screen, /AppState\.addEventListener/);
});

test("scanner reports blocked sources instead of claiming full success", () => {
  const screen = read("AthleteN-Mobile/src/app/scanner.tsx");
  assert.match(screen, /toLowerCase\(\)==='blocked'/);
  assert.doesNotMatch(screen, /Scan complete\. Full tournament intelligence was extracted\./);
});

test("mobile scanner has whitespace normalization and explicit Instagram URL validation", () => {
  const screen = read("AthleteN-Mobile/src/app/scanner.tsx");
  assert.match(screen, /const clean=/);
  assert.match(screen, /const isInstagram=/);
  assert.match(screen, /const validInstagram=/);
  assert.match(screen, /instagram\\.com/i);
  assert.match(screen, /x\.hostname/);
});

test("dashboard greeting follows the device timezone and supports pull-to-refresh", () => {
  const screen = read("AthleteN-Mobile/src/app/home.tsx");
  assert.match(screen, /function getGreeting\(\)\{const hour=new Date\(\)\.getHours\(\)/);
  assert.match(screen, /RefreshControl refreshing=\{refreshing\} onRefresh=\{\(\)=>void refresh\(\)\}/);
  assert.match(screen, /RefreshButton onPress=\{\(\)=>void refresh\(\)\}/);
  assert.doesNotMatch(screen, /timeZone:'Asia\/Kolkata'/);
});

test("profile uses coach or academy connection code instead of manual names", () => {
  const screen = read("AthleteN-Mobile/src/app/profile.tsx");
  const start = screen.indexOf('<Section title="ATHLETE IDENTITY">');
  const end = screen.indexOf('<Section title="WEIGHT">', start);
  assert.ok(start >= 0 && end > start);
  const identity = screen.slice(start, end);
  assert.match(identity, /Coach \/ Academy connection code \(optional\)/);
  assert.doesNotMatch(identity, /label="Club \/ Academy"|label="Coach"/);
  assert.match(screen, /supabase\.rpc\('connect_athlete_by_code',\{p_code:connectionCode\.trim\(\)\.toUpperCase\(\)\}\)/);
  assert.doesNotMatch(screen, /club:null,coach:null/);
});

test("scanner blocks private and special-use network addresses", async () => {
  for (const address of [
    "0.0.0.0", "10.0.0.1", "100.64.0.1", "127.0.0.1",
    "169.254.169.254", "172.16.0.1", "192.168.1.1",
    "198.18.0.1", "203.0.113.10", "224.0.0.1",
    "::", "::1", "::ffff:127.0.0.1", "fd00::1", "fe80::1"
  ]) assert.equal(isBlockedIp(address), true, address);
  assert.equal(isBlockedIp("8.8.8.8"), false);
  await assert.rejects(assertPublicHttpUrl("http://127.0.0.1/"), /PRIVATE_SOURCE_BLOCKED/);
  await assert.rejects(assertPublicHttpUrl("http://169.254.169.254/latest/meta-data"), /PRIVATE_SOURCE_BLOCKED/);
  await assert.rejects(assertPublicHttpUrl("file:///etc/passwd"), /UNSUPPORTED_SOURCE_URL/);
});

test("scanner parses ISO and Indian day-first numeric dates without US date ambiguity", () => {
  assert.equal(extractDate("2026-10-23"), "2026-10-23");
  assert.equal(extractDate("23/10/2026"), "2026-10-23");
  assert.equal(extractDate("10/11/2026"), "2026-11-10");
  assert.equal(extractDate("31/02/2026"), null);
});

test("scanner extracts structured event details from JSON-LD", () => {
  const html = `<html><head><script type="application/ld+json">{"@context":"https://schema.org","@type":"SportsEvent","name":"National Taekwondo Open","startDate":"2026-11-10T09:00:00+05:30","endDate":"2026-11-11","location":{"@type":"Place","name":"Indoor Stadium","address":{"addressLocality":"Noida","addressRegion":"Uttar Pradesh","addressCountry":"IN"}},"organizer":{"@type":"Organization","name":"Taekwondo Association"},"offers":{"priceCurrency":"INR","price":"1200","url":"https://example.org/register","validThrough":"2026-10-30"}}</script></head></html>`;
  const event = extractStructuredEvent(html);
  assert.equal(event.tournament_name, "National Taekwondo Open");
  assert.equal(event.tournament_date, "2026-11-10T09:00:00+05:30");
  assert.match(event.venue, /Indoor Stadium/);
  assert.match(event.venue, /Noida/);
  assert.equal(event.organizer, "Taekwondo Association");
  assert.equal(event.registration_fee, "INR 1200");
  assert.equal(event.registration_url, "https://example.org/register");
  assert.equal(event.registration_deadline, "2026-10-30");
});

test("Instagram scanner date patterns recognize common tournament date ranges", () => {
  assert.ok(eventDatePatterns.some((pattern) => pattern.test("10-11 November 2026")));
  assert.ok(eventDatePatterns.some((pattern) => pattern.test("November 10th & 11th 2026")));
  assert.ok(eventDatePatterns.some((pattern) => pattern.test("10 November 2026")));
});
