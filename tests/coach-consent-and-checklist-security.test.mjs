import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const migration = fs.readFileSync('supabase/migrations/20261104130000_coach_consent_and_checklist_permissions.sql', 'utf8');
const inboxMigration = fs.readFileSync('supabase/migrations/20261104130500_list_my_coach_invitations.sql', 'utf8');
const announcementMigration = fs.readFileSync('supabase/migrations/20261104131000_academy_announcements_and_receipts.sql', 'utf8');
const lookupMigration = fs.readFileSync('supabase/migrations/20261104131500_restrict_coach_athlete_lookup.sql', 'utf8');
const connectionsMigration = fs.readFileSync('supabase/migrations/20261104132000_list_my_coach_connections.sql', 'utf8');
const mobileAnnouncements = fs.readFileSync('AthleteN-Mobile/src/components/announcement-overlay.tsx', 'utf8');
const roles = fs.readFileSync('src/components/roles/RoleDashboards.tsx', 'utf8');
const app = fs.readFileSync('src/App.tsx', 'utf8');

test('coach relationship invitations are pending until the athlete accepts', () => {
  assert.match(migration, /request_coach_athlete_link/);
  assert.match(migration, /status\s*=\s*'pending'/);
  assert.match(migration, /respond_to_coach_invitation/);
  assert.match(inboxMigration, /list_my_coach_invitations/);
  assert.match(inboxMigration, /l.athlete_user_id = v_athlete_id/);
  assert.match(inboxMigration, /l.status = 'pending'/);
  assert.match(migration, /athlete_user_id\s*=\s*v_athlete_id/);
  assert.match(migration, /case when p_accept then 'active' else 'declined' end/);
  assert.match(migration, /revoke_coach_athlete_link/);
  assert.match(migration, /drop policy if exists "coach links coaches can create"/);
  assert.match(migration, /drop policy if exists "coach links coaches can update"/);
  assert.match(migration, /drop policy if exists "coach links coaches can delete"/);
});

test('coach invitations require age approval and the correct Taekwondo roles', () => {
  assert.match(migration, /v_coach_role is distinct from 'coach'/);
  assert.match(migration, /v_athlete_role is distinct from 'athlete'/);
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
  assert.match(roles, /revoke_coach_athlete_link/);
  assert.match(connectionsMigration, /l\.athlete_user_id = v_athlete_id/);
  assert.match(connectionsMigration, /l\.status = 'active'/);
  assert.match(connectionsMigration, /list_my_coach_connections/);
});

test('academy announcement publishing and reads are scoped to active academy relationships', () => {
  assert.match(announcementMigration, /publish_academy_announcement/);
  assert.match(announcementMigration, /m\.status = 'active'/);
  assert.match(announcementMigration, /m\.role in \('coach', 'academy_admin'\)/);
  assert.match(announcementMigration, /created_by = \(select auth\.uid\(\)\)/);
  assert.match(announcementMigration, /count_my_announcement_reads/);
  assert.match(announcementMigration, /drop policy if exists "announcement_reads_select_sender"/);
  assert.doesNotMatch(announcementMigration, /create policy "announcement_reads_select_sender"/);
  assert.match(announcementMigration, /l\.status = 'active'/);
  assert.match(roles, /publish_academy_announcement/);
  assert.match(roles, /count_my_announcement_reads/);
  assert.doesNotMatch(roles, /from\("announcement_reads"\)/);
  assert.match(mobileAnnouncements, /eq\('audience','all'\)/);
  assert.match(mobileAnnouncements, /announcement_reads/);
});

test('coach lookup uses a role-checked, minimal-field Taekwondo RPC', () => {
  assert.match(lookupMigration, /lookup_taekwondo_athlete_for_coach/);
  assert.match(lookupMigration, /v_coach_role is distinct from 'coach'/);
  assert.match(lookupMigration, /public\.is_age_approved\(p\.user_id\)/);
  assert.match(lookupMigration, /lower\(coalesce\(p\.sport, ''\)\) = 'taekwondo'/);
  assert.match(lookupMigration, /revoke all on function public\.lookup_taekwondo_athlete_for_coach\(text\) from public, anon/);
  assert.match(roles, /lookup_taekwondo_athlete_for_coach/);
  assert.doesNotMatch(roles, /find_athlete_by_username/);
});


test('legacy coach account-code lookup can only send a pending invitation', () => {
  const legacyMigration = fs.readFileSync('supabase/migrations/20261107100000_harden_legacy_coach_connection_consent.sql', 'utf8');
  const body = legacyMigration.match(/create or replace function public\.coach_add_athlete_by_account_code\([\s\S]*?\$function\$;/i)?.[0] || '';
  assert.ok(body, 'hardened coach account-code function must exist');
  assert.match(body, /public\.request_coach_athlete_link\(v_athlete_id\)/);
  assert.doesNotMatch(body, /insert into public\.coach_athlete_links/i);
  assert.match(body, /'status', 'pending'/);
  assert.match(body, /public\.is_age_approved\(v_coach_id\)/);
  assert.match(body, /public\.is_age_approved\(p\.user_id\)/);
});

test('athlete code redemption requires age approval and explicit athlete action', () => {
  const legacyMigration = fs.readFileSync('supabase/migrations/20261107100000_harden_legacy_coach_connection_consent.sql', 'utf8');
  const body = legacyMigration.match(/create or replace function public\.connect_athlete_by_code\([\s\S]*?\$function\$;/i)?.[0] || '';
  assert.ok(body, 'hardened athlete code connection function must exist');
  assert.match(body, /v_athlete_id uuid := auth\.uid\(\)/);
  assert.match(body, /v_athlete_role is distinct from 'athlete'/);
  assert.match(body, /public\.is_age_approved\(v_athlete_id\)/);
  assert.match(body, /c\.owner_type = 'coach'/);
  assert.match(body, /public\.is_age_approved\(c\.owner_user_id\)/);
  assert.match(body, /on conflict \(coach_user_id, athlete_user_id\)[\s\S]*?status = 'active'/);
  assert.match(body, /on conflict \(academy_id, user_id\)[\s\S]*?status = 'active'/);
  assert.match(legacyMigration, /revoke all on function public\.connect_athlete_by_code\(text\) from public, anon/);
});

test('mobile coach screens describe new account-code connections as pending invitations', () => {
  const roster = fs.readFileSync('AthleteN-Mobile/src/app/coach-athletes.tsx', 'utf8');
  const tournaments = fs.readFileSync('AthleteN-Mobile/src/app/coach-tournaments.tsx', 'utf8');
  assert.match(roster, /Invitation sent to .*They must accept before appearing in your roster/);
  assert.match(tournaments, /Invitation sent to .*They must accept before appearing in your roster/);
  assert.doesNotMatch(roster, /connected successfully/);
  assert.doesNotMatch(tournaments, /connected\./);
});
