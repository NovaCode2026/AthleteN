import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const web = readFileSync(new URL("../src/components/messaging/MessagingPage.tsx", import.meta.url), "utf8");
const mobile = readFileSync(new URL("../AthleteN-Mobile/src/app/(tabs)/messages.tsx", import.meta.url), "utf8");
const migration = readFileSync(new URL("../supabase/migrations/20261124150000_rich_media_attachment_limits.sql", import.meta.url), "utf8");

const supportedExtensions = ["pdf", "png", "jpg", "jpeg", "webp", "txt", "doc", "docx", "csv", "xlsx", "zip", "mp4", "mp3", "m4a", "aac", "wav"];

test("web and mobile messaging validate the same rich-media extensions", () => {
  for (const extension of supportedExtensions) {
    assert.match(web, new RegExp(`\\b${extension}:\"[^\"]+\"`), `web MIME map is missing .${extension}`);
    assert.match(mobile, new RegExp(`\\b${extension}:'[^']+'`), `mobile MIME map is missing .${extension}`);
  }
});

test("mobile picker exposes supported audio and video MIME types", () => {
  for (const mime of ["video/mp4", "audio/mpeg", "audio/mp4", "audio/aac", "audio/wav"]) {
    assert.ok(mobile.includes(mime), `mobile picker is missing ${mime}`);
  }
});

test("private Storage bucket enforces the 10 MB limit and MIME allowlist", () => {
  assert.match(migration, /file_size_limit\\s*=\\s*10485760/);
  assert.match(migration, /allowed_mime_types\\s*=\\s*array\\[/);
  for (const mime of ["video/mp4", "audio/mpeg", "audio/mp4", "audio/aac", "audio/wav"]) {
    assert.ok(migration.includes(`'${mime}'`), `Storage allowlist is missing ${mime}`);
  }
});
