# AthleteN production audit: non-billable review and staging gate

**Audit date:** 2026-11-07  
**Scope:** Read-only inspection of the live Supabase project and the current audit/pilot pull request.  
**Environment policy:** No paid Supabase staging branch was created. No production DDL, migration, policy, function, Auth setting, merge, or deployment was changed during this review.

## Current production findings

Latest Supabase Security Advisor observation reviewed on 2026-11-07:

- `authenticated_security_definer_function_executable`: 61 findings.
- `extension_in_public`: `pg_net` is installed in the `public` schema.
- Auth leaked-password protection remains disabled.

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

### Review priorities

1. Review the 61 authenticated-callable SECURITY DEFINER functions individually. Confirm that each is intentionally exposed as an RPC and has explicit role/ownership/relationship checks for every sensitive action.
2. Give priority to functions that accept caller-supplied user IDs, role names, academy IDs, plan IDs, payment references, conversation IDs, or athlete IDs.
3. Preserve the current observed fact that no SECURITY DEFINER function in `public` is executable by `anon`; do not broaden grants.
4. Review whether `pg_net` needs to remain in `public`. Do not move or uninstall it until extension dependencies and notification dispatch are understood.
5. Enable leaked-password protection through the Supabase Auth dashboard and verify the setting afterward. This setting was not changed by this audit.

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

Do not apply these directly to production as a substitute for staging. The existing production coach-link INSERT policy was previously observed allowing a coach to create an active link directly; the consent migration is intended to change this workflow. That behavior must be verified with authenticated test identities before production rollout.

## Explicit staging gate (deferred; no paid branch)

A Supabase staging branch is a required gate before applying the five pending migrations or signing off coach-consent, academy-announcement, and checklist authorization changes.

When staging is eventually approved and available:

1. Create an isolated staging branch only after explicit cost approval. No production data should be copied unless separately approved and privacy-reviewed.
2. Apply the five pending migrations to staging in order.
3. Run schema and Security Advisor checks; review every new warning.
4. Use separate athlete, coach, academy-admin, and unrelated-user test identities.
5. Test positive and negative cases:
   - Coach cannot create an active athlete link without athlete acceptance.
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
- Review migration SQL for authorization gaps and unsafe defaults.
- Improve automated SQL/static checks and document expected positive/negative authorization tests.
- Review CI results, lockfile consistency, and repository test coverage.
- Keep all pending database changes isolated on the existing Git branch/PR.

## Release status

**Not production signed off.** Passing web/mobile CI is useful evidence, but it does not replace staging RLS tests, real-device notification/logout tests, Auth configuration verification, backup/restore validation, or a controlled release and rollback exercise.
