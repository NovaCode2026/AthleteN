# Age Verification Security Findings — updated 2026-11-13

## Current production status

**Partial mitigation is live; the remaining profile-DOB consistency issue is a release blocker.** This document separates changes already observed in the connected production project from the additional repository candidate. It is not approval to apply new SQL.

A follow-up repository audit on 2026-11-13 confirmed that the current `start-parent-approval` candidate also supports legacy profiles that have no DOB yet: it reads the existing verification status first, saves the initial profile DOB only through a conditional `date_of_birth IS NULL` update, then calls the server-owned `record_age_profile` RPC. The regression suite asserts that order. This is a first-write compatibility path, not permission to change a non-null DOB, and the production database trigger remains the authoritative missing control.

A read-only production snapshot on 2026-11-12 confirmed:

- Production migration `20261112092215_age_verification_server_owned_approval_hardening_20261112` is present in the Supabase migration ledger.
- `public.age_verifications` has RLS enabled. The authenticated role has SELECT but no direct INSERT or UPDATE table/column privileges. Direct client attempts to forge `status`, `approved_at`, or guardian token fields are therefore blocked by the database grants.
- `public.prepare_parent_approval(text)` is no longer executable by ordinary authenticated users; its live ACL is restricted to `postgres` and `service_role`. The raw guardian token is handled by the server-side email workflow rather than returned by an authenticated RPC.
- The live `public.record_age_profile(date,text)` function rejects a conflicting DOB already stored in `age_verifications`, preserves completed approval state on same-DOB resubmission, and transitions a legacy `not_required` minor record to `pending`.
- A 2026-11-13 read-only review found that the live `public.is_age_approved(uuid)` helper still treats every `status IN ('approved','not_required')` record as approved without checking the DOB when the status is `not_required`. It also retains an own-account QA override. A live row-count check found **0** `not_required` rows, **2** guardian-approved rows, and **0** pending/rejected/missing-DOB rows at the time of the query, so no currently stored `not_required` minor row was identified. The helper logic nevertheless leaves a future/legacy-state bypass if such a row is introduced. The candidate now requires a `not_required` row's immutable DOB to prove age 18+, preserves explicit `approved` guardian decisions, and retains the QA override only for the matching signed-in account. A separate read-only inspection found exactly one private QA override row labelled `qa test account`; its profile has no DOB and it has no age-verification row. The account is not currently marked with an admin role. Authenticated and anonymous roles have no direct SELECT/INSERT/UPDATE privileges on the private override table, and only the matching signed-in user benefits from the function override. This is an intentional QA exception, but that account still bypasses age approval; explicitly retire the override after QA and before public release. It was not deleted in this pass because the test account may still be required.
- The authenticated role can still update `profiles.date_of_birth`, and the production `profiles` table does not yet have the DOB immutability trigger proposed below. This leaves a profile/verification consistency gap.
- A 2026-11-13 read-only join of `profiles` to `age_verifications` found zero DOB mismatches, zero profile DOBs without a verification row, zero verification rows without a profile, and zero verification rows whose profile DOB is missing. This is the current data snapshot only; the missing database trigger still allows future inconsistency.
- Authenticated SELECT currently includes the `token_hash` column. It is only a hash, not the raw approval token, but clients do not need to read it. The candidate draft narrows SELECT to an explicit column list that excludes it.
- The live guardian Edge Functions were observed active (start-parent-approval version 13; approve-parent version 6). The deployed approval function conditionally consumes a matching, unexpired pending token and cannot successfully approve the same token twice.

The read-only Security Advisor snapshot on 2026-11-13 reported 57 authenticated-callable SECURITY DEFINER functions, `pg_net` installed in the exposed `public` schema, and Leaked Password Protection still disabled. The Performance Advisor reported 73 unused-index informational findings and 97 multiple-permissive-policy warnings. These are separate review/configuration gates; do not blanket-revoke SECURITY DEFINER functions or drop unused indexes without reviewing each function's purpose, callers, and workload.

## Remaining database boundary

The unresolved primary issue is DOB mutability in `public.profiles`. The authenticated role has UPDATE permission on `profiles.date_of_birth` under the own-profile policy, and there is no database trigger preventing a non-null DOB from being changed or cleared.

The existing age-verification record and `record_age_profile` function protect the DOB stored in `age_verifications`, but they do not by themselves make the separate profile column immutable. A changed profile DOB can leave the profile and verification records inconsistent. UI read-only controls are useful but are not a security boundary.

## Candidate remediation in this branch

The repository candidate contains:

1. A draft trigger that makes a non-null `profiles.date_of_birth` immutable for ordinary client roles, checks that profile DOB matches any existing age-verification row, and also protects profile INSERT from creating a mismatch. The only correction path is a separately authorized service-side process.
2. A revised `record_age_profile` draft that locks and reads the profile row, requires profile DOB to exist and match the submitted DOB, preserves approved decisions, transitions legacy `not_required` minor records back to `pending`, and maintains the age-of-majority transition.
3. Redefine `public.is_age_approved(uuid)` so `not_required` is accepted only when the stored DOB establishes age 18+, while explicit `approved` guardian state remains valid and the existing own-account QA override is preserved.
4. Column-level SELECT grants that omit `token_hash`, while the owner-scoped status RPC remains the application status interface.
5. A parent-approval Edge Function update that validates strict ISO dates, compares profile and verification DOB, calls the server-owned record RPC before deciding whether the account is complete, and only reissues guardian links for eligible pending/rejected requests.
6. A single-use guardian approval update conditioned on row ID, pending status, exact token hash, and unexpired token.
7. Read-only age-verification handling in the generic admin data editor, locked DOB fields and submit-handler guards in web/mobile, and regression tests for the database draft and approval flow.

**The SQL in `supabase/security/age_verification_hardening.sql` is a review draft, not a migration.** It must not be applied directly to production or copied into the migration ledger by hand.

## Migration and deployment controls

A strict timestamp-prefix comparison from the 2026-11-13 read-only audit found 177 remote versions, 116 local migration files, 27 exact timestamp matches, 150 remote-only timestamps, 72 local-only timestamps, and five duplicate local timestamp groups. These counts differ from normalised-stem comparisons; neither comparison provides the original missing SQL or is sufficient evidence for a ledger repair.

The production ledger contains 177 migration records in the current snapshot. The candidate tree contains 116 SQL files under `supabase/migrations/` with 99 unique timestamp prefixes. The exact timestamp inventory is in `docs/MIGRATION_HISTORY_DRIFT_2026-11-13.md`. A prior Supabase Preview run reported remote migration versions missing from the local migrations directory. Treat migration reconciliation as unresolved; 19 local files also use non-14-digit timestamp prefixes. Re-run the Supabase Preview/history check on the current candidate before any additional DDL is applied.

- Do not fabricate placeholder migration files or versions.
- Do not mark migrations applied/reverted by hand.
- Do not reset or rewrite the production migration ledger.
- Do not create paid Supabase staging.
- Generate any new migration through the Supabase CLI workflow, review its exact SQL, and test it against a non-billable local PostgreSQL/Supabase stack with positive and negative authorization cases.
- Apply the profile DOB/column-grant migration only after the migration history has been reconciled and its tests pass.
- Deploy the matching Edge Functions only after the database contract is in place.

## Acceptance tests still required

- Authenticated users cannot change or clear a previously recorded profile DOB through PostgREST, web, mobile, or RPC.
- New profile DOB must match any existing age-verification DOB.
- An existing age-verification DOB cannot be overwritten through `record_age_profile`.
- An under-18 record cannot remain `not_required`; it must return to the guardian approval flow.
- Same-DOB resubmission does not erase an approved guardian decision.
- Guardian approval succeeds only with the current, unexpired token and cannot be replayed or raced.
- A different authenticated user cannot read or mutate another user's records.
- Authenticated clients cannot read guardian token hashes.
- Admin visibility is read-only and role-gated.

Cross-account tests, guardian email delivery tests, expiry/replay tests, and physical-device acceptance have not been completed in this environment.

## Other release gates

- Review all 57 authenticated-callable SECURITY DEFINER functions individually and remove only unnecessary privileges.
- Move `pg_net` out of `public` after checking dependencies.
- Enable leaked-password protection through the Supabase Auth configuration and verify password reset/email verification settings.
- Verify Android package ID `com.novacode.athleten` against the intended Play Console application before store publication. The candidate includes a manual EAS AAB workflow, but no signed production AAB has been built or verified. It requires the repository Actions secret `EXPO_TOKEN` and EAS production signing credentials.
- Netlify production was rechecked on 2026-11-12: deploy `6af42f978110916eb4db495a` is READY but serves commit `0c2af19c46d4995dd4ee1b77969fc9055ca9996f`, while repository main is `b29051dcde5d411aa3d0d80b589e633754c0e6d2`. That deploy reports Lighthouse root-route scores of Performance 96, Accessibility 100, Best Practices 100, SEO 97, PWA 70, and secret scanning found no matches across 406 files. These are deploy-specific root-route checks, not proof that current main is deployed or all authenticated routes work. Publish only a reviewed, passing main SHA after the backend gates pass.
- Complete two-account physical-device tests: Google OAuth, email verification and reset, guardian approval, messages after refresh, notifications, uploads/downloads, account deletion, and role boundaries.

## Evidence and change scope

The production status above comes from read-only catalog, grants, function, migration-ledger, advisor, and Netlify deploy inspections on 2026-11-12 and 2026-11-13. The additional trigger, DOB-aware `is_age_approved` helper, column-grant narrowing, connected-team access gates, app UI guards, and Edge Function changes in this branch are repository-side candidate changes only. No production schema, grants, Auth settings, migration ledger, user rows, or deployed Edge Functions were changed as part of this candidate work.
