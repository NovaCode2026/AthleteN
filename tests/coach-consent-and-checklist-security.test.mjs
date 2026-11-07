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
  assert.match(body, /pg_advisory_xact_lock/);
  assert.match(body, /academy_id is not distinct from c\.academy_id/);
  assert.match(body, /update public\.coach_athlete_links[\s\S]*?status = 'active'/);
  assert.match(body, /on conflict \(academy_id, user_id\)[\s\S]*?status = 'active'/);
  assert.match(body, /v_coach_role is distinct from 'academy_admin'/);
  assert.match(body, /v_owner_academy_id is distinct from c\.academy_id/);
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


test('coach management authorization is based on active relationship or academy membership, not stale profile fields', () => {
  const relationshipMigration = fs.readFileSync('supabase/migrations/20261107110000_tighten_relationship_revocation_and_approval_rls.sql', 'utf8');
  const body = relationshipMigration.match(/create or replace function public\.can_manage_athlete_feature\([\s\S]*?\$function\$;/i)?.[0] || '';
  assert.ok(body, 'current relationship helper must be replaced');
  assert.match(body, /private\.user_can_manage_athlete\(target_user_id\)/);
  assert.match(body, /private\.is_super_admin\(\)/);
  assert.doesNotMatch(body, /profiles p[\s\S]*?coach_user_id/);
  assert.doesNotMatch(body, /training_plans tp[\s\S]*?coach_user_id/);
});

test('coach revocation withdraws pending approvals, removes group membership and clears stale coach profile fields', () => {
  const relationshipMigration = fs.readFileSync('supabase/migrations/20261107110000_tighten_relationship_revocation_and_approval_rls.sql', 'utf8');
  const body = relationshipMigration.match(/create or replace function public\.revoke_coach_athlete_link\([\s\S]*?\$function\$;/i)?.[0] || '';
  assert.ok(body, 'revocation function must be replaced');
  assert.match(body, /status = 'revoked'/);
  assert.match(body, /update public\.coach_approval_requests[\s\S]*?status = 'withdrawn'/);
  assert.match(body, /delete from public\.training_group_members/);
  assert.match(body, /not exists \([\s\S]*?status = 'active'/);
  assert.match(body, /set coach_user_id = v_next_coach_id/);
  assert.match(body, /coach = v_next_coach_name/);
});

test('web coach roster sends an invitation and never claims immediate activation', () => {
  const dashboard = fs.readFileSync('src/components/coach/CoachAcademyDashboard.tsx', 'utf8');
  assert.match(dashboard, /Invitation sent\. The athlete must accept before appearing in your roster/);
  assert.match(dashboard, /Send invitation/);
  assert.match(dashboard, /profile\.role==="academy_admin"\?[\s\S]*?Share your Academy connection code/);
  assert.doesNotMatch(dashboard, /Athlete linked to your coaching roster/);
});

test('coach connection RPC always requests consent and rejects academy-admin username linking', () => {
  const relationshipMigration = fs.readFileSync('supabase/migrations/20261107110000_tighten_relationship_revocation_and_approval_rls.sql', 'utf8');
  const body = relationshipMigration.match(/create or replace function public\.coach_connect_athlete\([\s\S]*?\$function\$;/i)?.[0] || '';
  assert.ok(body, 'coach connection RPC must be replaced');
  assert.match(body, /v_role = 'academy_admin'/);
  assert.match(body, /public\.lookup_taekwondo_athlete_for_coach/);
  assert.match(body, /public\.request_coach_athlete_link\(v_athlete_id\)/);
  assert.doesNotMatch(body, /insert into public\.coach_athlete_links/i);
});

test('training group members and training plans require current athlete-management authorization', () => {
  const relationshipMigration = fs.readFileSync('supabase/migrations/20261107110000_tighten_relationship_revocation_and_approval_rls.sql', 'utf8');
  assert.match(relationshipMigration, /coach manages currently linked group members/);
  assert.match(relationshipMigration, /private\.user_can_manage_athlete\(training_group_members\.athlete_user_id\)/);
  assert.match(relationshipMigration, /Coaches can update currently managed training plans/);
  assert.match(relationshipMigration, /Coaches can delete currently managed training plans/);
  assert.match(relationshipMigration, /private\.user_can_manage_athlete\(user_id\)/);
  assert.doesNotMatch(relationshipMigration, /coach_user_id = \(select auth\.uid\(\)\)\s+or/i);
});

test('coach approval requests require a real active link and cannot be reviewed after revocation', () => {
  const relationshipMigration = fs.readFileSync('supabase/migrations/20261107110000_tighten_relationship_revocation_and_approval_rls.sql', 'utf8');
  assert.match(relationshipMigration, /athletes request approval from active coach/);
  assert.match(relationshipMigration, /drop policy if exists "coaches review approvals for active athletes" on public\.coach_approval_requests/);
  assert.match(relationshipMigration, /l\.status = 'active'/);
  assert.match(relationshipMigration, /private\.user_can_manage_athlete\(athlete_user_id\)/);
  assert.match(relationshipMigration, /relationship revoked, or already reviewed/);
  assert.doesNotMatch(relationshipMigration, /p\.coach_user_id = p\.coach_user_id/);
  assert.doesNotMatch(relationshipMigration, /p\.academy_id = p\.academy_id/);
});


test('revoking one academy-scoped coach link preserves separate active academy authority', () => {
  const relationshipMigration = fs.readFileSync('supabase/migrations/20261107110000_tighten_relationship_revocation_and_approval_rls.sql', 'utf8');
  const body = relationshipMigration.match(/create or replace function public\.revoke_coach_athlete_link\([\s\S]*?\$function\$;/i)?.[0] || '';
  assert.match(body, /v_link_academy_id uuid/);
  assert.match(body, /academy_id is not distinct from v_link_academy_id/);
  assert.match(body, /join public\.academy_memberships athlete_m[\s\S]*?coach_m\.status = 'active'[\s\S]*?athlete_m\.status = 'active'/);
  assert.match(body, /not exists \([\s\S]*?public\.academy_memberships coach_m/);
});

test('academy managers are told to use athlete-initiated academy code joining', () => {
  const dashboard = fs.readFileSync('src/components/coach/CoachAcademyDashboard.tsx', 'utf8');
  assert.match(dashboard, /profile\.role==="academy_admin"\?[\s\S]*?Share your Academy connection code/);
  assert.match(dashboard, /The athlete must accept before appearing in your roster/);
});


test('super administrators can inspect but cannot directly mutate coach-athlete relationships', () => {
  const relationshipMigration = fs.readFileSync('supabase/migrations/20261107110000_tighten_relationship_revocation_and_approval_rls.sql', 'utf8');
  assert.match(relationshipMigration, /drop policy if exists "super admin full access" on public\.coach_athlete_links/);
  assert.match(relationshipMigration, /create policy "super admins can view coach athlete links"[\s\S]*?for select to authenticated/);
  assert.doesNotMatch(relationshipMigration, /create policy "super admins can view coach athlete links"[\s\S]*?for all/i);
});


test('coach approval changes are made only through a role-checked server RPC', () => {
  const relationshipMigration = fs.readFileSync('supabase/migrations/20261107110000_tighten_relationship_revocation_and_approval_rls.sql', 'utf8');
  const body = relationshipMigration.match(/create or replace function public\.review_coach_approval\([\s\S]*?\$function\$;/i)?.[0] || '';
  assert.ok(body, 'review RPC must exist');
  assert.match(body, /security definer/i);
  assert.match(body, /actor\.role = 'coach'/);
  assert.match(body, /public\.is_age_approved\(auth\.uid\(\)\)/);
  assert.match(body, /private\.user_can_manage_athlete\(athlete_user_id\)/);
  assert.match(relationshipMigration, /drop policy if exists "coaches review approvals for active athletes" on public\.coach_approval_requests/);
});


test('coach invitation RPC distinguishes an active connection from a pending invitation', () => {
  const relationshipMigration = fs.readFileSync('supabase/migrations/20261107110000_tighten_relationship_revocation_and_approval_rls.sql', 'utf8');
  const body = relationshipMigration.match(/create or replace function public\.request_coach_athlete_link\([\s\S]*?\$function\$;/i)?.[0] || '';
  assert.ok(body, 'request RPC must be hardened in the final migration');
  assert.match(body, /pg_advisory_xact_lock/);
  assert.match(body, /status = 'active'[\s\S]*?Athlete is already connected to this coach/);
  assert.match(body, /status = 'pending'[\s\S]*?return v_link_id/);
  assert.match(relationshipMigration, /revoke all on function public\.request_coach_athlete_link\(uuid\) from public, anon/);
});


test('coach relationship decline and revocation statuses match the production link constraint', () => {
  const relationshipMigration = fs.readFileSync('supabase/migrations/20261107110000_tighten_relationship_revocation_and_approval_rls.sql', 'utf8');
  assert.match(relationshipMigration, /drop constraint if exists coach_athlete_links_status_check/);
  assert.match(relationshipMigration, /check \(status in \('pending', 'active', 'suspended', 'ended', 'declined', 'revoked'\)\)/);
  assert.match(relationshipMigration, /set status = 'declined'/);
  assert.match(relationshipMigration, /set status = 'revoked'/);
});

test('training plan RLS removes the broad age-approved ALL policy and keeps rows owner-scoped', () => {
  const relationshipMigration = fs.readFileSync('supabase/migrations/20261107110000_tighten_relationship_revocation_and_approval_rls.sql', 'utf8');
  assert.match(relationshipMigration, /drop policy if exists "age approval required" on public\.training_plans/);
  assert.match(relationshipMigration, /drop policy if exists "Users can manage own training plans" on public\.training_plans/);
  assert.match(relationshipMigration, /create policy "Users manage own approved training plans"[\s\S]*?user_id = \(select auth\.uid\(\)\)/);
  assert.match(relationshipMigration, /private\.user_can_manage_athlete\(user_id\)/);
});

test('coach approval insert RLS does not depend on reading another user profile under RLS', () => {
  const relationshipMigration = fs.readFileSync('supabase/migrations/20261107110000_tighten_relationship_revocation_and_approval_rls.sql', 'utf8');
  const body = relationshipMigration.match(/create policy "athletes request approval from active coach"[\s\S]*?\);/i)?.[0] || '';
  assert.ok(body, 'approval insert policy must exist');
  assert.match(body, /from public\.coach_athlete_links l/);
  assert.match(body, /l\.status = 'active'/);
  assert.match(body, /public\.is_age_approved\(l\.coach_user_id\)/);
  assert.doesNotMatch(body, /join public\.profiles/);
  assert.doesNotMatch(body, /cp\.role/);
});


test('age approval is a restrictive gate and cannot replace per-table row authorization', () => {
  const migration = fs.readFileSync('supabase/migrations/20261107120000_make_age_approval_policies_restrictive.sql', 'utf8');
  assert.match(migration, /from pg_policies[\s\S]*?schemaname = 'public'[\s\S]*?policyname = 'age approval required'/);
  assert.match(migration, /create policy %I on %I\.%I as restrictive for all to authenticated/i);
  assert.match(migration, /using \(\(select public\.is_age_approved\(\(select auth\.uid\(\)\)\)\)\) or \(select private\.is_platform_admin\(\)\)\)/);
  assert.match(migration, /with check \(\(select public\.is_age_approved\(\(select auth\.uid\(\)\)\)\) or \(select private\.is_platform_admin\(\)\)\)/i);
  assert.doesNotMatch(migration, /create policy %I on %I\.%I as permissive/i);
});


test('athlete connection codes cannot reactivate suspended direct or academy links', () => {
  const consentMigration = fs.readFileSync('supabase/migrations/20261107100000_harden_legacy_coach_connection_consent.sql', 'utf8');
  const body = consentMigration.match(/create or replace function public\.connect_athlete_by_code\([\s\S]*?\$function\$;/i)?.[0] || '';
  assert.ok(body, 'athlete code RPC must exist');
  assert.match(body, /select id, status into v_link_id, v_link_status/);
  assert.match(body, /v_link_status = 'suspended'/);
  assert.match(body, /This coach-athlete relationship is suspended/);
  assert.match(body, /select status into v_membership_status/);
  assert.match(body, /v_membership_status = 'suspended'/);
  assert.match(body, /This academy membership is suspended/);
});
