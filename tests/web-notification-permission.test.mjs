import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = (path) => readFileSync(new URL(path, import.meta.url), "utf8");
const pages = read("../src/components/parity/NotificationPages.tsx");
const helper = read("../src/lib/desktopNotifications.ts");
const app = read("../src/App.tsx");

test("Web notification settings request browser permission only from an explicit user action", () => {
  assert.match(pages, /requestDesktopNotifications/);
  assert.match(pages, /onClick=\{\(\)=>void enableDesktop\(\)\}/);
  assert.match(pages, /Browser permission is blocked/);
  assert.match(pages, /while AthleteN is open/);
  assert.match(helper, /Notification\.requestPermission\(\)/);
});

test("Web foreground alerts use the registered service worker and a safe fallback", () => {
  assert.match(helper, /navigator\.serviceWorker\.register\("\/sw\.js"\)/);
  assert.match(helper, /registration\.showNotification/);
  assert.match(helper, /new Notification\(options\.title/);
  assert.match(app, /table:"notifications"/);
  assert.match(app, /showDesktopNotification\(/);
});

test("Web service worker opens the notification destination when tapped", () => {
  const worker = read("../public/sw.js");
  assert.match(worker, /notificationclick/);
  assert.match(worker, /event\.notification\?\.data\?\.url/);
  assert.match(worker, /self\.clients\.openWindow/);
});


test("desktop notification destinations cannot navigate to another origin", () => {
  assert.match(app, /row\.action_route\.startsWith\('\/\/'\)\?\/notifications/);
  const worker = read("../public/sw.js");
  assert.match(worker, /new URL\(candidate, self\.location\.origin\)/);
  assert.match(worker, /parsed\.origin === self\.location\.origin/);
});
