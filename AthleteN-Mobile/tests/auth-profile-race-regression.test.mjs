import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

test('mobile auth ignores stale profile responses after account changes or sign-out', () => {
  const source = fs.readFileSync(new URL('../src/context/AuthContext.tsx', import.meta.url), 'utf8');
  assert.match(source, /profileRequestVersion\s*=\s*useRef/);
  assert.match(source, /activeProfileUserId\s*=\s*useRef/);
  assert.match(source, /authEventVersion\s*=\s*useRef/);
  assert.match(source, /requestVersion !== profileRequestVersion\.current \|\| activeProfileUserId\.current !== userId/);
  assert.match(source, /authEventVersion\.current !== observedAuthEventVersion/);
  assert.match(source, /profileRequestVersion\.current \+= 1/);
  assert.match(source, /await supabase\.auth\.signOut\(\);\s*if \(error\) throw error;/);
});
