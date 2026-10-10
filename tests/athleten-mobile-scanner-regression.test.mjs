import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { deflateSync } from "node:zlib";
import { extractPdfText } from "../netlify/functions/tournament-scan.mjs";

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

test("mobile scanner normalizes whitespace and recognizes Instagram hosts", () => {
  const screen = read("AthleteN-Mobile/src/app/scanner.tsx");
  assert.ok(screen.includes("replace(/\\\\s+/g,' ').trim()"));
  assert.ok(screen.includes("const isInstagram=(u:string)=>/instagram\\\\.com/i.test(u);"));
  assert.ok(screen.includes("!/(^|\\\\.)instagram\\\\.com$/i.test(x.hostname)"));
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
  assert.match(screen, /club:null,coach:null/);
});
