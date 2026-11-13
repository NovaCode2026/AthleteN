# AthleteN Production Readiness Gate — 2026-11-12

## Decision

**NOT APPROVED for public production release yet.** The current branch has passing web, static-analysis, and mobile CI, and the public Netlify deployment is reachable. The release is still blocked by database migration-history reconciliation, the profile-DOB database guard, pending security review/configuration, signed Android distribution, and real-device/two-account acceptance.

This report separates observed production state from candidate branch changes. It does not authorize production deployment or additional production DDL.

## Current code and CI

- Production main: `b29051dcde5d411aa3d0d80b589e633754c0e6d2`.
- Current candidate: [PR #57](https://github.com/NovaCode2026/AthleteN/pull/57), branch `fix/age-verification-release-hardening-20261112`.
- Candidate source revision `ea6a9bd4252a2fa484ed0fb3108a7b56c76d889b` passed:
  - CI run [43209772145](https://github.com/NovaCode2026/AthleteN/actions/runs/43209772145): tests and web production build.
  - CodeQL run [43209772141](https://github.com/NovaCode2026/AthleteN/actions/runs/43209772141): JavaScript/TypeScript analysis.
  - Mobile Check run [43209772179](https://github.com/NovaCode2026/AthleteN/actions/runs/43209772179): contract tests, TypeScript, ESLint, Android bundle export, and Expo Doctor.
- Current PR revision `731ece8f7f8edd41506e8c95c860407303d18c0c` passed all three workflows:
  - CI run [43271801354](https://github.com/NovaCode2026/AthleteN/actions/runs/43271801354): tests and web production build, including the new Node regression tests.
  - CodeQL run [43271801288](https://github.com/NovaCode2026/AthleteN/actions/runs/43271801288): JavaScript/TypeScript analysis.
  - Mobile Check run [43271801200](https://github.com/NovaCode2026/AthleteN/actions/runs/43271801200): mobile contract tests, TypeScript, ESLint, Android bundle export and Expo Doctor.
- These are source/CI checks only. They do not replace local PostgreSQL migration testing, a fresh Supabase Preview/history check, provider configuration verification or physical-device acceptance.
- PR #57 remains a draft. Its SQL file is a review draft, not a migration. It has not been applied to production.

## Production website

- Netlify project `athleten` is reachable and the currently published deploy is READY: `6af42f978110916eb4db495a`.
- Published source SHA: `0c2af19c46d4995dd4ee1b77969fc9055ca9996f`.
- This is behind current main `b29051dcde5d411aa3d0d80b589e633754c0e6d2`; it does not contain all current mainline changes.
- Latest deploy's root-route Lighthouse report: Performance 96, Accessibility 100, Best Practices 100, SEO 97, PWA 70. These scores apply only to the audited root route and that deployed revision.
- Netlify secret scan reported no matches across 406 scanned files.
- The deploy reports 19 deployed serverless functions and the scheduled tournament scan function.
- Do not promote a new deploy until the backend and release gates below are cleared and the exact source SHA is selected.

## Supabase — verified live state

Project: `wjegokgtrewtoopbsiol`.

### Age verification

- The live migration ledger contains 177 records; latest observed version is `20261112092215`, `age_verification_server_owned_approval_hardening_20261112`.
- `public.age_verifications` has RLS enabled. Live ACL checks show `anon` has no SELECT/INSERT/UPDATE access. `authenticated` has SELECT only and no INSERT/UPDATE; `service_role` retains server-side write privileges.
- Authenticated SELECT currently includes `token_hash`. This is a hash, not the raw approval token, but the client does not need to read it. PR #57 proposes column-scoped SELECT that omits this field.
- Ordinary authenticated users cannot execute `public.prepare_parent_approval(text)`; its raw-token RPC privilege is restricted to trusted server roles.
- Live `record_age_profile(date,text)` prevents changing the DOB already stored in `age_verifications` and preserves the approval decision on same-DOB submission.
- **Remaining release blocker:** the live `profiles` table has no DOB immutability trigger. An authenticated user can still update or clear `profiles.date_of_birth` under the ordinary own-profile update path, potentially making it inconsistent with the immutable age-verification DOB.
- PR #57 contains a candidate database trigger, revised consistency checks, explicit column grants, Edge Function updates, and web/mobile UI locks. It now also contains `supabase/security/role_and_finance_authorization_hardening.sql`, a separate review-only draft, plus `tests/role-finance-authorization-regression.test.mjs`. The latter covers intended SQL guard text but is not a live Postgres/RLS runtime test. All of these are repository-side changes only, not deployed.

### Messaging persistence and duplicate direct threads

- Web and Mobile both insert messages into `public.messages` with a stable client message ID, recover from duplicate-send responses by querying the existing row, and reload the saved message from Supabase. The clients preserve the draft when the database does not confirm persistence.
- Live RLS checks show RLS enabled on `messages`, `conversations`, `conversation_members`, and `message_receipts`. A restrictive age-approval policy applies to messages, conversations, and memberships. Message SELECT is conversation-member scoped; INSERT requires sender ID to match `auth.uid()` and membership in the conversation. Receipt rows are visible to conversation participants. No anonymous message/receipt policy was found.
- Live Realtime publication includes `messages`, `message_receipts`, and `conversation_members`. The local migration history provides a sender/client-message unique index, receipt uniqueness, trigger-created delivery rows, and a 200-message delivery acknowledgement limit.
- A read-only production data check found **2 participant pairs with duplicate direct threads**: 3 extra conversation rows containing 12 messages. The duplicate threads have 0 attachment-bearing messages and 0 objects in the `message-attachments` bucket under their conversation folders. This can split one person's history across multiple threads; it does not establish that messages have been deleted.
- Repository file `supabase/migrations/20261111160000_consolidate_duplicate_direct_message_threads.sql` contains deterministic duplicate consolidation, preserves messages/reports/support-ticket/training-group references, takes an advisory lock, and refuses to merge if attachment objects remain under duplicate thread IDs. It is **not present in the live migration ledger**; its file timestamp also precedes the current latest live version `20261112092215`. Do not apply this file as-is. After migration-history reconciliation, generate the next valid migration with Supabase CLI, test it locally, validate counts/foreign keys and backup/rollback, then consider running it.
- PR #57 includes a static regression test for the Web/Mobile persistence contract and the consolidation migration's safety guard. CI coverage is not a live two-account messaging test; device/browser acceptance remains required.

### Migration history

- The production ledger has 177 versions. The candidate repository tree has 113 SQL migration files with 96 unique timestamp prefixes.
- Supabase's CLI migration-list logic compares timestamps only, not migration names or SQL equivalence. The exact timestamp comparison found 24 versions present on both sides, **153 remote versions with no matching local timestamp**, and **72 local timestamps absent from the remote ledger**.
- The local tree also has 5 duplicate timestamp groups containing 22 files, plus 19 files whose timestamp prefix is not the standard 14-digit form. This is a substantive history reconstruction problem, not merely a naming mismatch.
- Full timestamp inventory and duplicate groups: [docs/MIGRATION_HISTORY_DRIFT_2026-11-13.md](MIGRATION_HISTORY_DRIFT_2026-11-13.md). A prior Supabase Preview check also reported remote migration versions missing locally.
- Do not use `migration repair`, fabricate placeholder migrations, reset production, or push local-only SQL until each individual timestamp's schema effect is proven. The migration ledger is not a substitute for schema evidence.
- An ephemeral PostgreSQL 17 CI harness applies both review-only SQL drafts and passes positive/negative integration assertions on the latest candidate. Coverage: DOB update/clear and mismatched insert denial; same-DOB approval preservation; legacy minor `not_required` reset to pending with token/timestamps cleared; direct age-row insert/update denial; token-hash read denial even when a legacy column-only grant is present; self-service role elevation and raw-token RPC denial; athlete Coach-finance self-enrollment denial; approved Coach own-account success; pending-age finance denial; cross-account finance read/write isolation; and Coach finance RPC owner scoping. The latest successful run is [43400189595](https://github.com/NovaCode2026/AthleteN/actions/runs/43400189595). This validates the two drafts against a purpose-built Postgres fixture, not the full Supabase schema or the entire migration chain.
- The current environment still has no linked local Supabase CLI/Docker stack for the full application migration chain, and no paid Supabase staging was created. The isolated PostgreSQL fixture validates the two SQL drafts only; it does not prove the entire 177-version migration history is reproducible.
- Do not apply the candidate DOB/finance SQL or deploy matching Edge Functions until the exact history is reconciled, the full chain is tested on a non-billable local stack, and a valid timestamped migration is generated through Supabase CLI.


### Security and performance advisories

Latest observed Security Advisor snapshot (2026-11-12):
- 57 authenticated-callable `SECURITY DEFINER` functions.
- `pg_net` extension installed in the exposed `public` schema.
- These are review warnings, not proof that all 57 functions are exploitable. Review each function's caller, owner, `search_path`, object authorization, caller-controlled identifiers, and least-privilege grants. Do not blanket-revoke EXECUTE.
- The leaked-password protection setting was observed disabled. Verify/enable it in Supabase Auth configuration; it cannot be fixed by a SQL migration.
- Targeted live RPC review found `public.switch_my_product_role(text)` executable by `authenticated`. Its body accepts `athlete`, `coach` or `academy_admin`, inserts the requested role into `account_product_roles`, and then updates the caller's `profiles.role`/`plan_id`; it does not require prior Coach verification or Academy setup approval. The README says Coach/Academy paid products rely on an existing verified Coach role or an active, completed Academy setup. This is a **role-enrollment authorization blocker**: the callable RPC currently bypasses the stated prerequisite at the database boundary. Repository search found no current Web/Mobile caller, but an authenticated user can still call the RPC directly. Disable/harden this RPC through a reviewed migration, and test attempts by an ordinary athlete to switch to coach/academy_admin before enabling those workspaces publicly.
- Targeted finance review found `get_or_create_my_coach_finance_account()` and `can_manage_finance_account(uuid)` are authenticated-callable SECURITY DEFINER functions without an explicit `is_age_approved()` check. More importantly, the live `finance_accounts` RLS policy only checks `owner_type='coach'` and `owner_user_id=auth.uid()` for Coach rows; it does not verify the caller's `profiles.role` or age-approval state. Since authenticated users have INSERT privileges, an ordinary signed-in user can create a coach-labelled finance account for their own user ID; the transaction helper then recognizes that same owner row. The `finance_transactions` policy also lacks an age gate. Both tables have RLS enabled, their policies target `authenticated`, and the audit found no anonymous policy; no cross-account finance read/write path was established. This is a **role/age gating bypass**, not a confirmed cross-account leak. PR #57's review draft adds profile-role and age-approval checks to the account policy, transaction helper and Coach account RPC. Test pending/approved role and unrelated-user isolation before release.
- `create-checkout.mjs` and `create-trial-checkout.mjs` are presently blocked at the top by `FREE_LAUNCH = true`, before provider operations. Their dormant paid flows do not currently enforce age/guardian approval for every role. Keep the launch gate closed until checkout preflight and webhook entitlement activation both reject accounts lacking the required age approval. `activate_trial_after_payment` is currently EXECUTE-restricted to `service_role`; do not grant it to clients.

Latest Performance Advisor snapshot:
- 73 unused-index informational findings.
- Multiple-permissive-policy warnings across several authenticated tables, including profiles, tournaments, training groups/sessions, messaging/support, and Taekwondo records. PostgreSQL combines permissive policies with OR semantics; review each table's intended access matrix and run cross-account tests before changing policies.
- Health Advisor returned no lints in the latest snapshot.
- Do not drop unused indexes solely because they are currently unused; assess query workload and FK/constraint requirements first.
  
## Android release

- PR #57 sets the candidate package and iOS bundle identifier to `com.novacode.athleten`. Verify the Android package ID against the intended Play Console application before first store publication.
- The existing CI APK is a debug/CI artifact, not a production Play Store release.
- A manual EAS production AAB workflow is included in PR #57. It requires a protected GitHub Actions `EXPO_TOKEN` secret and valid EAS production signing credentials.
- No signed production AAB has been built or certificate-verified.
- Keep signing secrets out of source code, chat, and CI logs.

## Runtime log sample

A read-only 24-hour Supabase log slice returned one Auth `400` on 2026-11-12 at 07:58:15 UTC: `refresh_token_not_found` for a refresh-token request to the production website. This is consistent with an expired/unknown session and is not, by itself, evidence of an outage. No other non-2xx API requests appeared in the returned slice. The sample was low volume and cannot establish full production reliability.

## Required release acceptance

1. Reconcile Supabase migration history and rerun Supabase Preview on the exact release SHA.
2. Generate and test the profile-DOB/column-access migration on a local non-billable PostgreSQL/Supabase stack. Include direct PostgREST update/clear attempts, matching/mismatching DOB inserts, and role isolation.
3. Merge and deploy the matching Edge Functions only after the database contract is verified.
4. Harden or disable `switch_my_product_role(text)` so an athlete cannot self-enroll as a Coach/Academy Admin without the verified role/setup; add negative RPC tests. Add age/guardian checks to finance access paths before public finance access.
5. Complete prioritized function-by-function review of all 57 authenticated-callable SECURITY DEFINER functions and resolve or explicitly accept the `pg_net` schema warning.
6. Verify Supabase Auth settings: leaked-password protection, email verification, password reset, site URL and redirect allowlist.
7. Verify Google OAuth origins and callback URIs, SMTP sender/domain, privacy policy, guardian-contact process, and account deletion.
8. Confirm Android application identity; build a signed AAB with protected EAS credentials; verify signing certificate fingerprints and install/upgrade on a physical device.
9. Run two-account web/mobile acceptance: OAuth, email verification/reset, guardian approval and token expiry/replay, messaging persistence after refresh/restart, notifications, attachments, uploads/downloads, account deletion, and athlete/coach/academy/admin role boundaries.
10. Verify payments in provider test mode, including webhook signatures, idempotency, refunds/cancellations, entitlement projection and reconciliation. Keep live collection disabled until tested.
11. Have the owner publish the reviewed main SHA to Netlify, then verify the production deploy's commit SHA and smoke-test public, authenticated, and callback routes.

## Scope and safety

- The age-verification server-owned-write baseline migration is already live; this report does not claim it as new work.
- PR #57 is still a draft; its profile DOB trigger and token-hash read restriction are not live.
- No production DDL, grants, Auth settings, user data, live Edge Function deployment, Netlify deployment, or paid staging project was changed by this audit.
- Production release remains **NOT APPROVED** until the listed gates are closed and acceptance evidence is recorded.
