# AthleteN Audit Implementation Update — 4 November 2026

**Branch:** `codex/audit-pilot-execution-2026-11-04`  
**Pull request:** [#22](https://github.com/NovaCode2026/AthleteN/pull/22)  
**State:** implementation work in progress; not a production release.

## New implementation on this branch

- Coach-to-athlete connections now use a pending invitation. A coach sends the request; the athlete's signed-in account can accept or decline. Either participant can revoke an active or pending connection. The UI uses scoped RPCs rather than inserting an active relationship directly.
- Coach athlete discovery is routed through a role-checked RPC that returns only a minimal athlete profile and requires the target to be an approved Taekwondo athlete.
- The athlete Web workspace now includes a coach invitation inbox.
- Coach Command Center now has a tournament-scoped checklist editor for an accepted linked athlete. Database policies restrict edits to the athlete, an accepted coach for that athlete, or a platform administrator. The selected tournament must belong to that athlete.
- Coaches with an academy assignment can publish academy announcements. The sender sees aggregate read counts only; the read-receipt policy does not expose member identities. The existing Android announcement overlay continues to consume published audience='all' items, with academy membership enforced by RLS.
- Regression tests cover invitation state transitions, age/role checks, lookup scoping, checklist RLS requirements, and announcement scope/receipt access.

## Pending database migrations (not applied to production)

1. `20261104130000_coach_consent_and_checklist_permissions.sql`
2. `20261104130500_list_my_coach_invitations.sql`
3. `20261104131000_academy_announcements_and_receipts.sql`
4. `20261104131500_restrict_coach_athlete_lookup.sql`

These migrations must be reviewed and tested against a staging project, with two distinct coach/athlete test accounts and role/RLS negative tests, before production application. No production migration was applied as part of this implementation update.

## Still open — required release gates

- Enable Supabase Auth leaked-password protection in the Dashboard and verify the warning clears. This is a project-owner setting, not a repository change.
- Complete the manual, per-function authorization review for all 61 authenticated-callable `SECURITY DEFINER` functions. Do not mass-revoke EXECUTE; verify intended callers and wrong-user/right-user behavior.
- Review remaining Web and Android dependency advisories and commit a tested compatible lockfile update. Do not use blind force upgrades.
- Finish the authenticated guardian-account relationship, consent/withdrawal lifecycle, least-privilege parent read-only scope, retention/deletion and safeguarding review. A parent email approval token is not sufficient to grant a parent dashboard.
- Test academy announcement delivery/receipts and coach invitation/checklist workflows with separate real accounts after staging migrations are applied.
- Verify the latest GitHub Actions runs for this exact branch head; the last successful CI evidence predates these newest changes.
- Deploy reviewed `main` to Netlify and confirm the production commit SHA, authentication, password reset and role workspaces.
- Build/sign/install the Android release and complete physical-device authentication, messaging, push, background/terminated, logout and notification acceptance.
- Rehearse database backup/restore and Web/Android rollback.
- Complete the four-week Taekwondo academy pilot and review actual usage before billing or second-sport expansion.

## Safeguarding and product constraints

- The coach attention panel continues to avoid body-weight and weight-target alerts for youth athletes.
- Do not expose parent access before a real guardian identity and relationship are verified and access controls are independently tested.
- Keep `FREE_LAUNCH` enabled. Paid checkout is not approved by this update.
- This branch does not deploy to Netlify or merge into `main`.
