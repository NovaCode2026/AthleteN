import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const web = readFileSync(new URL("../src/components/messaging/MessagingPage.tsx", import.meta.url), "utf8");
const mobile = readFileSync(new URL("../AthleteN-Mobile/src/app/(tabs)/messages.tsx", import.meta.url), "utf8");

test("web and mobile message search is scoped to the currently loaded conversation", () => {
  for (const source of [web, mobile]) {
    assert.match(source, /messageSearch/);
    assert.match(source, /filteredMessages/);
    assert.match(source, /No matching messages/);
    assert.match(source, /Search this conversation/);
    assert.match(source, /messages\.filter\(/);
  }
});

test("message search covers text, attachment names and message types without indexing deleted content", () => {
  for (const source of [web, mobile]) {
    assert.match(source, /!\w+\.deleted_for_everyone_at/);
    assert.match(source, /\.body[\s\S]*?\.attachment_name[\s\S]*?\.message_type/);
    assert.match(source, /toLocaleLowerCase\(\)/);
  }
});
