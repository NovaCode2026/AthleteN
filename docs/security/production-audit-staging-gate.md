# AthleteN production audit: non-billable review and staging gate

**Audit date:** 2026-11-07  
**Scope:** Read-only inspection of the live Supabase project and the current audit/pilot pull request.  
**Environment policy:** No paid Supabase staging branch was created. No production DDL, migration, policy, function, Auth setting, merge, or deployment was changed during this review.

## Current production findings

Latest Supabase Security Advisor observation reviewed on 2026-11-07:

- `authenticated_security_definer_function_executable`: 61 findings.
- `extension_in_public`: `pg_net` is installed in the `public` schema.
- Auth leaked-password protection remains disabled.
- Performance Advisor reports 121 multiple-permissive-policy findings and 81 unused-index candidates (informational); these need a separate careful review rather than a blanket policy/index rewrite.

A read-only catalog inventory of `public` functions returned:

| Check | Result |
|---|---:|
| SECURITY DEFINER functions | 86 |
| Executable by `authenticated` | 61 |
| Executable by `anon` | 0 |
| Not executable by either client role | 25 |
| With a pinned `search_path` setting | 86 |
| Without a pinned `search_path` setting | 0 |
| Function definitions containing an `auth.uid()` reference | 66 |
| Function definitions without an `auth.uid()` reference | 20 |

These are inventory counts, not exploitability conclusions. In particular, a function that does not directly reference `auth.uid()` may be a trigger, internal callback, or service-role-only routine. Each exposed callable function still needs review of its complete body, grants, callers, authorization predicates, and negative tests. Conversely, merely containing `auth.uid()` does not prove that authorization is correct.

### Confirmed consent-bypass path requiring remediation

Static review of the live function definition found that `public.coach_add_athlete_by_account_code(p_code text)` is a SECURITY DEFINER RPC executable by authenticated users. It checks that the caller has the coach role, but then inserts a `coach_athlete_links` row with `status = 'active'` directly. This bypasses the athlete-acceptance workflow introduced in the audit branch. The current consent migration drops direct table-write policies and adds request/accept/revoke RPCs, but the reviewed migration set does not replace or revoke this legacy RPC.

**Treat this as a release blocker.** Before any production rollout of the consent workflow, a follow-up migration must either remove authenticated EXECUTE from this legacy RPC or replace it with a safe pending-invitation implementation. Also search for every other legacy RPC or trigger path that can create or reactivate an active coach-athlete link. Add a negative test proving that a coach cannot establish an active relationship without athlete acceptance. Do not apply a speculative hotfix directly to production as part of this read-only audit.

### Review priorities

1. Remediate the confirmed legacy consent bypass before release.
2. Review the 61 authenticated-callable SECURITY DEFINER functions individually. Confirm that each is intentionally exposed as an RPC and has explicit role/ownership/relationship checks for every sensitive action.
3. Give priority to functions that accept caller-supplied user IDs, role names, academy IDs, plan IDs, payment references, conversation IDs, or athlete IDs.
4. Preserve the current observed fact that no SECURITY DEFINER function in `public` is executable by `anon`; do not broaden grants.
5. Review whether `pg_net` needs to remain in `public`. Do not move or uninstall it until extension dependencies and notification dispatch are understood.
6. Enable leaked-password protection through the Supabase Auth dashboard and verify the setting afterward. This setting was not changed by this audit.

## Migration and PR boundary

The live project migration history currently ends with these three November 4 migrations:

- `20261104101337_competition_checklists_tournament_scope`
- `20261104103042_secure_messaging_and_coach_rpcs`
- `20261104103647_enforce_announcement_audience_reads`

The following migrations are committed on the audit/pilot PR branch but are **not recorded as applied in production**:

- `20261104130000_coach_consent_and_checklist_permissions`
- `20261104130500_list_my_coach_invitations`
- `20261104131000_academy_announcements_and_receipts`
- `20261104131500_restrict_coach_athlete_lookup`
- `20261104132000_list_my_coach_connections`
- `20261107100000_harden_legacy_coach_connection_consent`
- `20261107110000_tighten_relationship_revocation_and_approval_rls`

Do not apply these directly to production as a substitute for staging. The new `20261107100000_harden_legacy_coach_connection_consent` migration replaces the legacy coach account-code RPC with a pending invitation and adds age-approval checks to athlete code redemption. It remains unverified in a database runtime and must pass staging positive/negative tests before production application. The coach-link table's observed unique index includes `(coach_user_id, athlete_user_id, academy_id)`; the migration handles this exact tuple explicitly. The `20261107110000_tighten_relationship_revocation_and_approval_rls` migration removes legacy profile/plan fallbacks from the coach-management helper, makes web coach linking invitation-based, updates legacy profile display fields on acceptance, and revokes dependent coach access: pending approvals are withdrawn, training-group membership is removed when the last active coach link is revoked, and training-plan/group-member and coach-approval RLS require a current relationship. This migration is also unverified in a database runtime. It also makes Super Admin visibility on coach-athlete links read-only and routes coach approval updates through a role-checked server RPC rather than direct table updates.

## Explicit staging gate (deferred; no paid branch)

A Supabase staging branch is a required gate before applying the five pending migrations or signing off coach-consent, academy-announcement, and checklist authorization changes.

When staging is eventually approved and available:

1. Create an isolated staging branch only after explicit cost approval. No production data should be copied unless separately approved and privacy-reviewed.
2. Apply all seven pending migrations to staging in order, including both the legacy consent-bypass and relationship-revocation remediations.
3. Run schema and Security Advisor checks; review every new warning.
4. Use separate athlete, coach, academy-admin, and unrelated-user test identities.
5. Test positive and negative cases:
   - Coach cannot create an active athlete link through any table policy or RPC without athlete acceptance, including the legacy account-code RPC; Super Admin can inspect but cannot directly mutate link rows.
   - Athlete code redemption requires the athlete's own age/guardian approval and a valid active code owned by an approved coach or academy administrator.
   - After either party revokes a coach link, the former coach cannot continue editing training plans, managing group members, reading approval requests, reviewing approvals, or receiving group-message access through stale profile fields.
   - Pending coach approval requests are withdrawn on revocation; a new approval request requires the same active coach-athlete relationship and exact academy scope. Coach review writes must go through the role-checked RPC; direct table updates are denied.
   - Athlete can accept or decline a pending coach invitation.
   - Either party can revoke an established link.
   - A coach cannot list, read, or mutate another coach's athlete connections.
   - Checklist access is limited to the athlete and the currently accepted/authorized coach, with tournament scoping enforced.
   - Announcement visibility is limited to the intended academy/audience; read receipts cannot be forged for another user.
   - Unauthenticated and unrelated authenticated users cannot invoke privileged actions or infer private athlete information.
6. Verify mobile and web behavior against the same staging data and confirm realtime/push delivery without treating a database insert as proof of device delivery.
7. Record the exact tested migration head, test identities/roles (not personal details), test results, and rollback plan.
8. Only after passing review should a separate production migration/release decision be made.

## Remaining non-billable work

Until staging is approved, continue only with work that does not mutate production:

- Static review of SECURITY DEFINER function definitions and grants.
- Search all migrations and RPCs for alternate coach-link activation paths.
- Review migration SQL for authorization gaps and unsafe defaults.
- Improve automated SQL/static checks and document expected positive/negative authorization tests.
- Review CI results, lockfile consistency, and repository test coverage.
- Keep all pending database changes isolated on the existing Git branch/PR.

## Release status

**Not production signed off.** Passing web/mobile CI is useful evidence, but it does not replace staging RLS tests, real-device notification/logout tests, Auth configuration verification, backup/restore validation, or a controlled release and rollback exercise.
