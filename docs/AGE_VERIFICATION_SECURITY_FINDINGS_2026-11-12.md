# Age Verification Security Findings — 2026-11-12

## Status

**Release blocker. No production database changes were made during this audit.** The following findings were observed directly in the connected production database on 2026-11-12. Treat this document as a remediation specification, not approval to deploy a migration.

## Confirmed findings

### 1. Client-controlled age-verification fields

The live `public.age_verifications` table has these authenticated policies:

- `users can create own age verification`: INSERT when `auth.uid() = user_id`.
- `users can update own age verification`: UPDATE when and after `auth.uid() = user_id`.
- `users can read own age verification`: SELECT own row.
- `super admin full access`: ALL for `private.is_super_admin()`.

The authenticated role has INSERT and UPDATE privileges on all age-verification columns, including `status`, `approved_at`, `rejected_at`, `token_hash`, `token_expires_at`, `date_of_birth`, and `parent_email`.

The row-ownership predicates do not protect the approval fields. A user can write their own approval state directly unless another database control prevents it. The direct INSERT policy similarly allows caller-supplied initial approval fields.

### 2. DOB can be overwritten through the privileged RPC

Live `public.record_age_profile(date, text)` is SECURITY DEFINER and executable by `authenticated`. Its current implementation uses `INSERT ... ON CONFLICT (user_id) DO UPDATE` and overwrites `date_of_birth`, `parent_email`, and `status`; it also clears the token and resets approval/rejection timestamps.

This means a user can resubmit a different DOB and reset their approval state. The RPC pins `search_path` to `public`, but that does not solve the authorization/business-rule flaw.

### 3. Parent approval token return path needs client-call-chain review

Live `public.prepare_parent_approval(text)` is SECURITY DEFINER and returns the raw token to its authenticated caller while persisting only a SHA-256 hash. This may be necessary for a trusted server-side email dispatch flow, but returning the token to a browser/mobile client would expose the guardian approval secret to the child account. Before changing it, trace every caller and move token handling to a trusted server-side dispatch path if any client currently receives it.

### 4. Current Security Advisor snapshot

- 58 authenticated-callable SECURITY DEFINER function findings.
- 1 `pg_net` extension-in-public finding.
- The inspected age-verification functions have pinned `search_path` settings.
- No blanket EXECUTE revocation was performed.

## Required remediation

1. Remove direct authenticated INSERT/UPDATE access to `age_verifications` and drop the self-service INSERT/UPDATE policies. Keep only owner-scoped SELECT and a narrowly scoped administrative/guardian decision path.
2. Replace client-writable approval state with a server-controlled transition model. Only a verified guardian approval/rejection handler and explicitly authorized administrative override may change `status`, `approved_at`, or `rejected_at`.
3. Make DOB immutable after initial recording for ordinary users. If correction is required, use a separate audited support/admin process with identity verification and an audit record; do not allow a normal profile save to overwrite it.
4. Change `record_age_profile` to reject a conflicting existing DOB and avoid resetting a completed approval state. Preserve a safe idempotent response when the same DOB is resubmitted.
5. Trace `prepare_parent_approval` callers. Ensure the raw token is never returned to untrusted client code; send it only through a trusted server-side email flow. Keep hashed-token comparison, expiry, single-use semantics, and rate limiting.
6. Review anon table grants and ensure anonymous users cannot read or mutate age-verification data. RLS must remain enabled.
7. Add regression tests for direct INSERT/UPDATE denial, DOB overwrite denial, approval-state forgery denial, guardian approval success, token expiry/replay rejection, and owner/admin isolation.

## Acceptance tests

- An authenticated user cannot insert a row with `status='approved'` or a non-null `approved_at`.
- An authenticated user cannot update their own `status`, `approved_at`, `rejected_at`, `token_hash`, or `token_expires_at`.
- An authenticated user cannot change a previously recorded DOB through the normal RPC or table API.
- Re-submitting the same DOB does not clear a pending or approved guardian state.
- A valid guardian approval changes only the intended user's record and cannot be replayed.
- A different authenticated user cannot read, change, or approve another user's record.
- Anonymous requests cannot read or mutate age-verification records.
- Existing approved users and their records remain intact throughout the migration.

## Deployment constraints

- Do not apply a guessed or ad-hoc production SQL change.
- Reconcile the repository migration history first; the Supabase Preview check currently reports remote versions missing from the local migrations directory.
- Generate the migration through the Supabase CLI workflow, review the exact SQL, test against a non-billable local database, and run negative/positive authorization tests before any production application.
- Do not create paid Supabase staging. Do not reset production, fabricate placeholder migration versions, or rewrite the migration ledger.
- Keep the public release blocked until this remediation and the remaining device/deployment/signing gates are verified.

## Evidence scope

Read-only inspection of production catalogs and function definitions on 2026-11-12. No production DDL, grants, Auth settings, migration ledger, or user rows were changed.


## Implementation added in PR #55 — 2026-11-12

The current PR branch now includes the following repository changes:

- Hardened `start-parent-approval`: strict ISO date validation, immutable-DOB conflict handling, preservation of an already-approved state, support for a rejected request to be resent, and a conditional server-side state transition that only updates pending/rejected rows.
- Restricted the generic admin resource browser: the age-verification table is read-only, selects an explicit non-token projection, and cannot be created, edited, or deleted through the generic editor.
- Updated the mobile approval response handling so an already-approved/not-required result refreshes the auth profile.
- Tightened the manual `supabase/policies.sql` baseline to remove client insert/update policies, revoke client table writes, and give authenticated users SELECT only.
- Added `tests/age-verification-security-regression.test.mjs` for the SQL draft, Edge Function state handling, admin editor, policy baseline, and mobile response.
- Added `supabase/security/age_verification_hardening.sql` as a **reviewed SQL draft only**. It is deliberately not in `supabase/migrations/` and is not deployable until converted using `supabase migration new` and tested locally. The draft also supports the age-of-majority transition from `pending`/`rejected` to `not_required`, without allowing callers to set approval state.

### Not yet fixed / not yet verified

- The live production database remains vulnerable until the SQL hardening is applied through a reviewed, timestamped migration. The repository currently has remote migration-history drift; no SQL was applied to production in this pass.
- The Supabase CLI is not installed in the available execution environment, and the repository cannot be cloned locally here. Therefore a CLI-generated migration file and local Postgres test could not be produced. Do not treat the SQL draft as applied.
- The updated Edge Function has not been deployed. Deploy it only after the migration is tested/applied, so the RPC contract and service-role update path are in sync.
- Cross-account positive/negative tests, guardian email delivery, token expiry/replay tests, and physical-device acceptance remain required.

### Release gate

This patch is a security implementation candidate, not production sign-off. Keep the public release blocked until the actual migration is generated, tested, reconciled with production history, applied safely, the Edge Function is deployed, and the full acceptance matrix passes.


### Latest patch note

The SQL draft and regression test were updated to preserve the legitimate age-of-majority path: when the immutable stored DOB establishes that a previously pending/rejected user is now 18 or older, the database function transitions the record to `not_required`, clears the unused guardian token/email, and records the system transition. The caller cannot choose or forge this status.

The regression test has been added but has **not** yet been run in this environment. GitHub has not returned a workflow run or check status for the latest branch head. Do not infer a passing result from the presence of test code.


The guardian approval Edge Function was also tightened to condition its final update on the pending state and the exact token hash, require a returned updated row, and return a conflict response when another request has already consumed the token. This closes the concurrent double-submit success ambiguity. The accompanying regression test checks the single-use update predicate and no-row conflict behavior.


### Cross-surface DOB immutability hardening — latest pass

The implementation candidate now covers the second DOB write surface discovered during the audit:

- Added a database trigger draft that rejects changing a non-null `profiles.date_of_birth` for authenticated callers. Initial DOB entry remains allowed. A future correction path must be a separately authorized, audited service-side workflow.
- Updated the `record_age_profile` SQL draft to lock/read the profile row and reject a DOB that conflicts with the profile DOB before touching `age_verifications`.
- Added a second server-side preflight in `start-parent-approval` that checks the profile DOB as well as the age-verification DOB before calling the legacy RPC.
- Locked DOB fields in the web AgeVerificationGate, web onboarding and generic profile editor, and mobile profile editor. Save handlers reject a modified DOB even if a client bypasses the disabled/read-only control.
- Expanded the regression suite to cover the trigger, SQL DOB consistency check, Edge Function profile preflight, and both web/mobile editor guards.

All of these remain repository-side candidate changes. **No production trigger, DDL, grant, Edge Function, or user record was changed.** The actual production database remains unprotected against direct profile DOB updates until the reviewed migration is generated, tested, reconciled and deployed.


The latest mobile pass also locks the DOB on the standalone age-verification screen after either the profile or age-verification record has supplied a stored DOB. The SQL draft now guards both profile UPDATE and INSERT paths, and checks that any newly written profile DOB matches an existing age-verification row. Regression assertions cover both cases. These remain un-deployed candidate changes.


### Database trigger correction — 2026-11-12

A review caught that a custom PostgreSQL GUC is not a safe bypass because client roles can set custom GUC values. The draft trigger was corrected: ordinary client roles are always subject to DOB immutability; only the trusted database owner (`postgres`) and `service_role` can run the separate support correction path. The regression suite now asserts that the client-settable GUC bypass is absent. This remains a draft, not a live production change.
