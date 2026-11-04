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
  assert.match(source, /const \[selectedAthletes, setSelectedAthletes\]/);
  assert.match(source, /const \[sessionAthleteIds, setSessionAthleteIds\]/);
  assert.match(source, /athletes\.filter\(a => sessionAthleteIds\.includes\(a\.user_id\)\)/);
  assert.match(source, /const selectedMemberCount = selectedSession \? sessionAthleteIds\.length : 0/);
});

test('coach attendance validates server reads and restores the previous value on save failure', () => {
  const source = read('AthleteN-Mobile/src/app/coach-training.tsx');
  assert.match(source, /if \(m\.error\) throw m\.error;/);
  assert.match(source, /if \(attendanceResult\.error\) throw attendanceResult\.error;/);
  assert.match(source, /if \(membersResult\.error\) throw membersResult\.error;/);
  assert.match(source, /setAttendance\(current => \(\{\.\.\.current, \[id\]: previous\}\)\)/);
  assert.match(source, /finally\s*\{setAttendanceBusy\(false\);\}/);
  assert.match(source, /Attendance saved/);
});
