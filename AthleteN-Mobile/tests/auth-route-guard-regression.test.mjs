import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

test('signed-out route guard distinguishes the protected tab root from public auth routes', () => {
  const source = fs.readFileSync(new URL('../src/app/_layout.tsx', import.meta.url), 'utf8');

  assert.match(source, /useSegments/);
  assert.match(source, /const isProtectedTabRoute = segments\[0\] === '\(tabs\)'/);
  assert.match(
    source,
    /const isPublicEntryRoute = PUBLIC_AUTH_PATHS\.has\(pathname\) && !isProtectedTabRoute/
  );
  assert.match(source, /if \(!isPublicEntryRoute\) router\.replace\('\/'\)/);
});

test('mobile logout bounds push cleanup and clears local auth state after successful sign-out', () => {
  const source = fs.readFileSync(new URL('../src/context/AuthContext.tsx', import.meta.url), 'utf8');

  assert.match(source, /await withTimeout\([\s\S]*?unregisterPushNotifications\(userId\),\s*2500/);
  assert.match(source, /const \{ error \} = await supabase\.auth\.signOut\(\);\s*if \(error\) throw error;/);
  assert.match(source, /authEventVersion\.current \+= 1;[\s\S]*?setSession\(null\);[\s\S]*?setProfile\(null\);/);
});
