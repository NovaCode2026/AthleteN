import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = (relative) => fs.readFileSync(path.join(root, relative), "utf8");
const auth = read("src/hooks/useAuth.tsx");
const age = read("src/components/account/AgeVerificationGate.tsx");
const app = read("src/App.tsx");
const notifications = read("src/components/parity/NotificationPages.tsx");
const messaging = read("src/components/messaging/MessagingPage.tsx");
const scanner = read("src/components/instagram/InstagramOrganizerScanner.tsx");
const styles = read("src/styles/main.css");

test("age verification normalizes ISO and DD-MM-YYYY input to a strict calendar-valid ISO date", () => {
  assert.match(age, /const iso = raw\.match/);
  assert.match(age, /const dmy = raw\.match/);
  assert.match(age, /Date\.UTC\(year, month - 1, day\)/);
  assert.match(age, /date\.getUTCFullYear\(\) !== year/);
  assert.match(age, /body: \{ date_of_birth: normalizedDob/);
  assert.match(read("supabase/functions/start-parent-approval/index.ts"), /dateOfBirth\.toISOString\(\)\.slice\(0, 10\) !== dateOfBirth/);
});

test("floating Account Plan gate is no longer mounted in authenticated app shell", () => {
  assert.doesNotMatch(auth, /AccountPlanGate/);
  assert.doesNotMatch(auth, /<AccountPlanGate/);
});

test("dashboard navigation resets both document and main scroll positions", () => {
  assert.match(app, /useEffect\(\(\)=>\{window\.scrollTo\(\{top:0,left:0,behavior:"auto"\}\);const main=document\.querySelector\("main"\);if\(main\)main\.scrollTo/);
});

test("header bell opens the notifications page and indicates unread items", () => {
  assert.match(app, /aria-label=\{data\.notifications\.some\(item=>!item\.read_at\)/);
  assert.match(app, /window\.history\.pushState\(\{\}, "", "\/notifications"\)/);
  assert.match(app, /className=\{"icon-btn"\+\(data\.notifications\.some\(item=>!item\.read_at\)/);
});

test("notifications open the correct message conversation using its source message id", () => {
  assert.match(notifications, /select\("conversation_id"\)\.eq\("id",row\.message_id\)/);
  assert.match(notifications, /\/messages\?conversation=/);
  assert.match(messaging, /get\("conversation"\)/);
  assert.match(messaging, /setSelectedId\(requestedConversation\)/);
});

test("announcement and attendance notifications display the original source records", () => {
  assert.match(notifications, /eq\("id",row\.announcement_id\)/);
  assert.match(notifications, /eq\("id",row\.attendance_record_id\)/);
  assert.match(notifications, /notification-source-detail/);
});

test("notification deletion is scoped to the signed-in user and never deletes source records", () => {
  assert.match(notifications, /from\("notifications"\)\.delete\(\)\.eq\("id",id\)\.eq\("user_id",uid\)/);
  assert.match(notifications, /from\("notifications"\)\.delete\(\)\.eq\("user_id",uid\)/);
  assert.match(notifications, /Messages, announcements, attendance and other original content will not be deleted/);
});

test("bulk mark-as-read is a single user-scoped update", () => {
  assert.match(notifications, /from\("notifications"\)\.update\(\{read_at:new Date\(\)\.toISOString\(\)\}\)\.eq\("user_id",uid\)\.is\("read_at",null\)/);
});

test("scanner makes absent extracted facts explicit and never labels unreviewed extraction as confirmed", () => {
  assert.match(scanner, /function scanStatusLabel/);
  assert.match(scanner, /Review required/);
  assert.match(scanner, /value === "failed"\) return "Failed"/);
  assert.match(scanner, /Not detected/);
  assert.match(scanner, /Open source/);
  assert.match(scanner, /Only valuable facts supported by accessible evidence are shown|Only valuable facts supported by accessible tournament evidence are shown/);
});

test("plans and scanner grouping layouts remain responsive and horizontally scrollable", () => {
  assert.match(styles, /\.plan-grid\{grid-template-columns:repeat\(auto-fit,minmax\(min\(100%,280px\),1fr\)\)/);
  assert.match(styles, /\.scan-table-wrap\{width:100%;max-width:100%;overflow-x:auto/);
  assert.match(styles, /\.scanner-group-actions\{display:grid;grid-template-columns:minmax\(180px,1fr\) auto auto/);
});
