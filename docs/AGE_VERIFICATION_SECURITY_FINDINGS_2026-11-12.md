# Age Verification Security Findings — 2026-11-12

## Current production status

**Partial mitigation is live; the remaining profile-DOB consistency issue is a release blocker.** This document separates changes already observed in the connected production project from the additional repository candidate. It is not approval to apply new SQL.

A read-only production snapshot on 2026-11-12 confirmed:

- Production migration `20261112092215_age_verification_server_owned_approval_hardening_20261112` is present in the Supabase migration ledger.
- `public.age_verifications` has RLS enabled. The authenticated role has SELECT but no direct INSERT or UPDATE table/column privileges. Direct client attempts to forge `status`, `approved_at`, or guardian token fields are therefore blocked by the database grants.
- `public.prepare_parent_approval(text)` is no longer executable by ordinary authenticated users; its live ACL is restricted to `postgres` and `service_role`. The raw guardian token is handled by the server-side email workflow rather than returned by an authenticated RPC.
- The live `public.record_age_profile(date,text)` function rejects a conflicting DOB already stored in `age_verifications`, preserves completed approval state on same-DOB resubmission, and transitions a legacy `not_required` minor record to `pending`.
- The authenticated role can still update `profiles.date_of_birth`, and the production `profiles` table does not yet have the DOB immutability trigger proposed below. This leaves a profile/verification consistency gap.
- Authenticated SELECT currently includes the `token_hash` column. It is only a hash, not the raw approval token, but clients do not need to read it. The candidate draft narrows SELECT to an explicit column list that excludes it.
- The live guardian Edge Functions were observed active (start-parent-approval version 13; approve-parent version 6). The deployed approval function conditionally consumes a matching, unexpired pending token and cannot successfully approve the same token twice.

The production Security Advisor snapshot on 2026-11-12 reported 57 authenticated-callable SECURITY DEFINER functions and the `pg_net` extension installed in the exposed `public` schema. The leaked-password protection setting was observed disabled. These are separate security/configuration gates; do not blanket-revoke SECURITY DEFINER functions without reviewing each function's purpose and callers.

## Remaining database boundary

The unresolved primary issue is DOB mutability in `public.profiles`. The authenticated role has UPDATE permission on `profiles.date_of_birth` under the own-profile policy, and there is no database trigger preventing a non-null DOB from being changed or cleared.

The existing age-verification record and `record_age_profile` function protect the DOB stored in `age_verifications`, but they do not by themselves make the separate profile column immutable. A changed profile DOB can leave the profile and verification records inconsistent. UI read-only controls are useful but are not a security boundary.

## Candidate remediation in this branch

The repository candidate contains:

1. A draft trigger that makes a non-null `profiles.date_of_birth` immutable for ordinary client roles, checks that profile DOB matches any existing age-verification row, and also protects profile INSERT from creating a mismatch. The only correction path is a separately authorized service-side process.
2. A revised `record_age_profile` draft that locks and reads the profile row, requires profile DOB to exist and match the submitted DOB, preserves approved decisions, transitions legacy `not_required` minor records back to `pending`, and maintains the age-of-majority transition.
3. Column-level SELECT grants that omit `token_hash`, while the owner-scoped status RPC remains the application status interface.
4. A parent-approval Edge Function update that validates strict ISO dates, compares profile and verification DOB, calls the server-owned record RPC before deciding whether the account is complete, and only reissues guardian links for eligible pending/rejected requests.
5. A single-use guardian approval update conditioned on row ID, pending status, exact token hash, and unexpired token.
6. Read-only age-verification handling in the generic admin data editor, locked DOB fields and submit-handler guards in web/mobile, and regression tests for the database draft and approval flow.

**The SQL in `supabase/security/age_verification_hardening.sql` is a review draft, not a migration.** It must not be applied directly to production or copied into the migration ledger by hand.

## Migration and deployment controls

The production ledger contains 177 migration records in the current snapshot. The current mainline tree contains 113 SQL files under `supabase/migrations/`; a conservative filename comparison found only 81 remote entries with a normalised stem match, and that is not a one-to-one reconciliation because some local names/versions collide or differ. A prior Supabase Preview run reported remote migration versions missing from the local migrations directory. Treat migration reconciliation as unresolved; do not infer that the count comparison identifies the original source files. Re-run the Supabase Preview/history check on the current mainline before any additional DDL is applied.

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

The production status above comes from read-only catalog, grants, function, migration-ledger, advisor, and Netlify deploy inspections on 2026-11-12. The additional trigger, column-grant narrowing, app UI guards, and Edge Function changes in this branch are repository-side candidate changes only. No production schema, grants, Auth settings, migration ledger, user rows, or deployed Edge Functions were changed as part of this candidate work.
