import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const migration = fs.readFileSync('supabase/migrations/20261104130000_coach_consent_and_checklist_permissions.sql', 'utf8');
const roles = fs.readFileSync('src/components/roles/RoleDashboards.tsx', 'utf8');
const app = fs.readFileSync('src/App.tsx', 'utf8');

test('coach relationship invitations are pending until the athlete accepts', () => {
  assert.match(migration, /request_coach_athlete_link/);
  assert.match(migration, /status\s*=\s*'pending'/);
  assert.match(migration, /respond_to_coach_invitation/);
  assert.match(migration, /athlete_user_id\s*=\s*v_athlete_id/);
  assert.match(migration, /case when p_accept then 'active' else 'declined' end/);
  assert.match(migration, /revoke_coach_athlete_link/);
  assert.match(migration, /drop policy if exists "coach links coaches can create"/);
  assert.match(migration, /drop policy if exists "coach links coaches can update"/);
  assert.match(migration, /drop policy if exists "coach links coaches can delete"/);
});

test('coach invitations require age approval and the correct Taekwondo roles', () => {
  assert.match(migration, /v_coach_role <> 'coach'/);
  assert.match(migration, /v_athlete_role <> 'athlete'/);
  assert.match(migration, /lower\(coalesce\(v_athlete_sport, ''\)\) <> 'taekwondo'/);
  assert.match(migration, /is_age_approved\(p_athlete_user_id\)/);
  assert.match(migration, /is_age_approved\(v_coach_id\)/);
});

test('checklist access is row scoped and coach access requires an accepted relationship', () => {
  assert.match(migration, /drop policy if exists "age approval required" on public\.competition_checklists/);
  assert.match(migration, /user_id = \(select auth\.uid\(\)\)/);
  assert.match(migration, /connected_coach_manage_athlete_checklists/);
  assert.match(migration, /l\.athlete_user_id = competition_checklists\.user_id/);
  assert.match(migration, /l\.status = 'active'/);
  assert.match(migration, /t\.user_id = competition_checklists\.user_id/);
});

test('coach dashboard no longer activates a relationship by direct table insert', () => {
  assert.doesNotMatch(roles, /from\("coach_athlete_links"\)\.insert/);
  assert.match(roles, /request_coach_athlete_link/);
});

test('athlete dashboard exposes the coach invitation inbox', () => {
  assert.match(roles, /AthleteConnectionInbox/);
  assert.match(app, /AthleteConnectionInbox/);
});
