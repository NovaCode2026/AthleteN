import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { assertPublicHttpUrl, isBlockedIp } from "../supabase/functions/scan-tournament-source/url-safety.mjs";

const edgeFunction = readFileSync(
  new URL("../supabase/functions/scan-tournament-source/index.ts", import.meta.url),
  "utf8"
);

test("edge scanner rejects private and special-use IP address ranges", () => {
  for (const address of [
    "0.0.0.0", "10.0.0.1", "100.64.0.1", "127.0.0.1",
    "169.254.169.254", "172.16.0.1", "192.168.1.1",
    "192.0.2.10", "198.18.0.1", "203.0.113.10", "224.0.0.1",
    "::", "::1", "::ffff:127.0.0.1", "fd00::1", "fe80::1",
    "2001:db8::1", "64:ff9b::7f00:1", "2002:7f00:1::"
  ]) assert.equal(isBlockedIp(address), true, address);
  assert.equal(isBlockedIp("8.8.8.8"), false);
  assert.equal(isBlockedIp("2606:4700:4700::1111"), false);
});

test("edge scanner URL validation rejects local targets, credentials, ports and unsupported schemes", async () => {
  const resolver = async () => ["93.184.216.34"];
  await assert.rejects(assertPublicHttpUrl("http://127.0.0.1/", resolver), /PRIVATE_SOURCE_BLOCKED/);
  await assert.rejects(assertPublicHttpUrl("http://169.254.169.254/latest/meta-data", resolver), /PRIVATE_SOURCE_BLOCKED/);
  await assert.rejects(assertPublicHttpUrl("http://host.local/", resolver), /PRIVATE_SOURCE_BLOCKED/);
  await assert.rejects(assertPublicHttpUrl("https://user:pass@example.com/", resolver), /UNSUPPORTED_SOURCE_URL/);
  await assert.rejects(assertPublicHttpUrl("https://example.com:8443/", resolver), /UNSUPPORTED_SOURCE_URL/);
  await assert.rejects(assertPublicHttpUrl("file:///etc/passwd", resolver), /UNSUPPORTED_SOURCE_URL/);
  await assert.rejects(assertPublicHttpUrl("https://intranet/", resolver), /PRIVATE_SOURCE_BLOCKED/);
});

test("edge scanner rejects mixed public/private DNS answers and accepts public DNS answers", async () => {
  const mixed = async () => ["93.184.216.34", "10.2.3.4"];
  const publicOnly = async () => ["93.184.216.34", "2606:4700:4700::1111"];
  await assert.rejects(assertPublicHttpUrl("https://example.com/", mixed), /PRIVATE_SOURCE_BLOCKED/);
  const result = await assertPublicHttpUrl("https://example.com/", publicOnly);
  assert.equal(result.hostname, "example.com");
});

test("edge scanner revalidates each redirect and bounds page fetching", () => {
  assert.match(edgeFunction, /redirect:\s*"manual"/);
  assert.match(edgeFunction, /assertPublicHttpUrl\(currentUrl,\s*resolvePublicHost\)/);
  assert.match(edgeFunction, /MAX_SOURCE_PAGE_BYTES/);
  assert.match(edgeFunction, /AbortController/);
  assert.match(edgeFunction, /get_age_verification_status/);
  assert.doesNotMatch(edgeFunction, /redirect:\s*"follow"/);
  assert.doesNotMatch(edgeFunction, /response\.text\(\)/);
});
