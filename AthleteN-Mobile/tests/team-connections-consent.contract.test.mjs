import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = (relativePath) =>
  readFileSync(new URL(relativePath, import.meta.url), 'utf8');

const coachRoster = read('../src/app/coach-athletes.tsx');
const coachTournaments = read('../src/app/coach-tournaments.tsx');
const academyWorkspace = read('../src/app/(tabs)/academy.tsx');
const webCoachDashboard = read('../../src/components/coach/CoachAcademyDashboard.tsx');
const migration = read('../../supabase/migrations/20261111113000_require_consent_for_team_links.sql');

test('coach roster shares a coach code instead of adding an athlete by username or account code', () => {
  assert.match(coachRoster, /OPEN COACH PROFILE/);
  assert.match(coachRoster, /Athletes join only when they enter it in Team/);
  assert.doesNotMatch(coachRoster, /coach_add_athlete_by_account_code/);
});

test('coach tournament manager only lists already-connected athletes', () => {
  assert.match(coachTournaments, /Athletes join your roster by entering your coach connection code/);
  assert.doesNotMatch(coachTournaments, /coach_add_athlete_by_account_code/);
});

test('academy People screen asks coaches to join using the academy code', () => {
  assert.match(academyWorkspace, /A coach joins by entering that code in Coach Profile/);
  assert.doesNotMatch(academyWorkspace, /academy_add_coach/);
});

test('web coach dashboard creates and shares its own connection code', () => {
  assert.match(webCoachDashboard, /get_my_connection_code/);
  assert.match(webCoachDashboard, /set_connection_code/);
  assert.match(webCoachDashboard, /Athletes join your roster by entering this code/);
  assert.doesNotMatch(webCoachDashboard, /coach_connect_athlete/);
});

test('legacy server RPCs reject coach-side linking and preserve athlete/coach-led alternatives', () => {
  assert.match(migration, /FUNCTION public\.coach_connect_athlete/);
  assert.match(migration, /FUNCTION public\.coach_add_athlete_by_account_code/);
  assert.match(migration, /FUNCTION public\.academy_add_coach/);
  assert.match(migration, /Athlete-initiated connection required/);
  assert.match(migration, /Coach-initiated academy joining required/);
  assert.match(migration, /GRANT EXECUTE ON FUNCTION public\.coach_connect_athlete\(text,uuid\) TO authenticated/);
});
