import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');

test('coach attention is based on linked attendance, events and injury follow-up', () => {
  const source = read('src/components/roles/RoleDashboards.tsx');
  assert.match(source, /Needs attention/);
  assert.match(source, /training_group_attendance/);
  assert.match(source, /missed sessions in the last 30 days/);
  assert.match(source, /Tournament within 14 days/);
  assert.match(source, /Injury record needs follow-up/);
  assert.match(source, /links\.filter\(x=>x\.status===\"active\"\)/);
});

test('youth athlete attention view does not add target-weight flags', () => {
  const source = read('src/components/roles/RoleDashboards.tsx');
  const start = source.indexOf('const attentionItems=useMemo');
  const end = source.indexOf('async function toggleNutrition', start);
  assert.ok(start >= 0 && end > start, 'attention calculation block must exist');
  assert.doesNotMatch(source.slice(start, end), /weight|weight_kg|targetWeight/i);
});

test('coach attendance confirms bulk action and only updates local state after successful writes', () => {
  const source = read('AthleteN-Mobile/src/app/coach-training.tsx');
  assert.match(source, /Mark all present\?/);
  assert.match(source, /Attendance not saved/);
  assert.match(source, /training_group_attendance/);
  assert.match(source, /setAttendance\(current=>\(\{\.\.\.current/);
  assert.match(source, /finally.*setBusy\(false\)/);
});

test('Web and Android competition checklists are scoped to a selected tournament', () => {
  const mobile = read('AthleteN-Mobile/src/app/compete.tsx');
  const web = read('src/components/parity/MobileParityPages.tsx');
  assert.match(mobile, /select\('id,tournament_id,item,category,completed'\)/);
  assert.match(mobile, /tournament_id:selected/);
  assert.match(mobile, /x\.tournament_id===selected/);
  assert.match(web, /select\("id,tournament_id,item,category,completed"\)/);
  assert.match(web, /tournament_id:selectedEvent/);
  assert.match(web, /x\.tournament_id===selectedEvent/);
});

test('competition checklist migration keeps tournament link optional and indexed', () => {
  const migration = read('supabase/migrations/20261104101337_competition_checklists_tournament_scope.sql');
  assert.match(migration, /add column if not exists tournament_id uuid/i);
  assert.match(migration, /references public\.tournaments\(id\) on delete cascade/i);
  assert.match(migration, /idx_competition_checklists_tournament_user/i);
});
