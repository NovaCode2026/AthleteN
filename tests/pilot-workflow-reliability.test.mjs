import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');

test('announcement feed delegates audience filtering to RLS', () => {
  const source = read('AthleteN-Mobile/src/components/announcement-overlay.tsx');
  assert.match(source, /\.from\('announcements'\)[\s\S]*?\.not\('published_at', 'is', null\)/);
  assert.match(source, /select\('id,title,body,published_at,audience'\)/);
  assert.doesNotMatch(source, /\.eq\('audience',\s*'all'\)/);
  assert.match(source, /Reload through RLS/);
});

test('announcement read receipt failures do not silently dismiss the announcement', () => {
  const source = read('AthleteN-Mobile/src/components/announcement-overlay.tsx');
  assert.match(source, /const \{ error \} = await supabase[\s\S]*?\.from\('announcement_reads'\)[\s\S]*?\.upsert\(/);
  assert.match(source, /if \(error\) throw error;/);
  assert.match(source, /Keep the announcement visible until its read receipt is actually saved/);
  assert.match(source, /setLoadError\(/);
});

test('coach session membership is separate from new-group athlete selection', () => {
  const source = read('AthleteN-Mobile/src/app/coach-training.tsx');
  assert.match(source, /const \[selectedAthletes\s*,\s*setSelectedAthletes\]/);
  assert.match(source, /const \[sessionAthleteIds\s*,\s*setSessionAthleteIds\]/);
  assert.match(source, /athletes\.filter\(a\s*=>\s*sessionAthleteIds\.includes\(a\.user_id\)\)/);
  assert.match(source, /selectedMemberCount\s*=\s*selectedSession\s*\?\s*sessionAthleteIds\.length\s*:\s*0/);
});

test('coach attendance validates server reads and restores the previous value on save failure', () => {
  const source = read('AthleteN-Mobile/src/app/coach-training.tsx');
  assert.match(source, /if\s*\(m\.error\)\s*throw\s+m\.error;/);
  assert.match(source, /if\s*\(attendanceResult\.error\)\s*throw\s+attendanceResult\.error;/);
  assert.match(source, /if\s*\(membersResult\.error\)\s*throw\s+membersResult\.error;/);
  assert.match(source, /setAttendance\(current\s*=>\s*\(\{\.\.\.current,\s*\[id\]:\s*previous\}\)\)/);
  assert.match(source, /finally\s*\{\s*setAttendanceBusy\(false\);\s*\}/);
  assert.match(source, /Attendance saved/);
  assert.doesNotMatch(source, /^\\/\\/\\s*@ts-nocheck/m);
  assert.match(source, /minutes<15\\|\\|minutes>360/);
  assert.match(source, /Confirm session cancellation/);
});
