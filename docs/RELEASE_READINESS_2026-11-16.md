# AthleteN Release Readiness — 2026-11-16

## Decision

**Not approved for public production launch or paid subscriptions.** The latest web CI and CodeQL checks pass, and the database privacy issue found in this audit is fixed in the live Supabase project. The production website still serves an older commit. Migration-history reconciliation, AI budget enforcement, remaining security review, Android production signing, payments, and real-device acceptance remain incomplete.

PR #59 was merged on November 13, 2026. This report supersedes the previous November 13 readiness snapshot for the checks recorded here.

## Audit baseline

- Repository: `NovaCode2026/AthleteN`, branch `main`
- Source commit at audit: `a76f53f124b42e4a0c7dd800d46d5202ec55a8a1`
- Supabase project: `wjegokgtrewtoopbsiol`
- Audit date: November 16, 2026

## Completed and verified

### Source and automated checks

- Web CI passed on the audit commit: `pnpm test` and the Vite production build passed.
- CodeQL passed on the audit commit.
- Android scanner regression tests passed.
- Android TypeScript validation, ESLint validation, and Expo Android prebuild passed on the current Android workflow attempt. APK assembly was still running at the latest check, with no artifact uploaded yet.
- A successful debug-signed APK is not a production Play Store AAB.
- Root web CI currently runs dependency installation, `pnpm test`, and `pnpm run build`; it does not run a separate TypeScript compiler check. Vite build success alone is not proof of full TypeScript type safety.

### Database access controls

- All 89 tables in the `public` schema have Row Level Security enabled.
- The 37 public-table age-approval policies inspected are restrictive; none of those age gates are permissive.
- Fixed a live privacy issue in `public.is_age_approved(uuid)`: a normal authenticated user could previously query another user's age-approval state when they knew that user's UUID. The public function is now scoped to the caller's own status, platform-admin review, or a trusted service-role call.
- Cross-user internal approval checks in academy, coach, connection, messaging, training-group and announcement workflows now use `private.user_age_is_approved(uuid)`. Execution on that helper is revoked from `PUBLIC`, `anon`, `authenticated`, and `service_role`; SECURITY DEFINER owners retain the ability to invoke it internally.
- Migration `20261116062941_restrict_age_approval_status_to_self_and_admin` is applied to production Supabase and recorded in its migration ledger.
- Runtime SQL checks confirmed a normal authenticated user can read their own status but not another user's status. A platform admin can review another user's status. The private helper is not executable by `anon` or `authenticated`.
- The permanent, case-insensitive connection-code reservation migration is applied. Inactive codes remain reserved; codes are normalized by trimming surrounding whitespace and comparing case-insensitively.
- The academy-owner visibility helper is present in production and is referenced by six live RLS policies. Its migration is recorded as `20261116062024_include_academy_owner_in_membership_admin_check`.
- Default privileges for future public objects and SECURITY DEFINER search paths have dedicated hardening migrations recorded in the database.
- Supabase's database health advisor returned no health lints during this audit.

### Edge-function review

- The tournament scanner validates authentication and account approval, confirms scan ownership, restricts source URLs to public HTTP(S) destinations, limits redirects, response size, and fetch duration. Scanner regression tests passed.
- Parent approval uses a random one-time token, stores only its hash, enforces a 72-hour expiry, and consumes the token with a conditional update. The parent-facing endpoint intentionally does not require an AthleteN login because a parent/guardian may not have an AthleteN account; the one-time token is the authorization credential.

## Findings still requiring action

### Security

- Supabase Security Advisor reports 61 authenticated-callable SECURITY DEFINER functions. Many are intended application RPCs with explicit user, role, or relationship checks. A complete function-by-function review is still outstanding. Do not blanket-revoke execution; that would break intended workflows.
- Supabase Auth's leaked/compromised-password protection is disabled. Enable it in the Supabase Dashboard under **Authentication → Password Security** before public launch. This setting was not changed during this audit.
- The `pg_net` extension is installed in `public`. It is reported as non-relocatable. Do not attempt to move or reinstall it without a supported, tested Supabase-specific migration because database HTTP and notification jobs may depend on it.
- The Security Advisor reports the private QA override table has RLS enabled without client policies. This is expected for a private server-managed table.

### RLS and query performance

- Supabase Performance Advisor reports 97 multiple-permissive-policy warnings. The overlaps include intentional combinations such as owner plus admin access, linked coach plus athlete access, and support-linked administrator access. PostgreSQL combines permissive policies using OR semantics. Removing or merging them without positive and negative access tests could expose athlete data or block legitimate users. These require a table-by-table review, not blanket cleanup.
- The advisor reports 72 unused indexes. Do not drop them solely because they have not yet been used; low-traffic features and foreign-key workloads may still need them.

### Database migration reconciliation

- The live Supabase migration ledger contains 190 recorded versions.
- The repository currently contains 131 SQL migration files. These counts are not a verified one-to-one replayable chain. The local source history and live migration ledger still need reconciliation.
- Do not run a blind production `supabase db push`, reset, replay, or migration-ledger edit. First recover trusted missing history or establish a tested baseline/squash strategy on a separate database; then compare schema, policy, and function effects before any production migration.
- The AI monthly budget ledger is absent from the live database: `public.athleten_ai_budget_monthly`, `public.athleten_ai_budget_reservations`, and the associated budget RPCs were not present at audit time. AI generation must remain fail-closed until the complete migration is reconciled, applied, and tested, and provider access and cost limits are verified.

## Production, Android, and billing gates

- Netlify production still serves deploy `6af42f978110916eb4db495a`, published November 11, 2026 from commit `0c2af19c46d4995dd4ee1b77969fc9055ca9996f`. It does not include the audit fixes on current `main`. There were no active Netlify deployments during this audit; no production deploy was started.
- The current Android CI workflow is producing a debug-signed APK, not a Play Store production package. Configure and verify release signing, confirm package ID `com.novacode.athleten` against the intended Play Console listing, build a signed production AAB, and verify its provenance.
- Physical-device and two-account acceptance remains outstanding for Google/OAuth login, email verification and password reset, guardian approval, logout/session transitions, message persistence and realtime delivery, attachments, notifications, scanner flows, role boundaries, and update delivery.
- Web/mobile parity still needs a feature-by-feature acceptance matrix and real-device testing. A navigation item is not proof that its underlying workflow is complete.
- Paid checkout and recurring billing remain disabled. Provider configuration and end-to-end monthly/annual billing, signed webhook idempotency, renewals, cancellation/refunds, and any free-trial workflow are not approved or validated.
- Displayed prices are intended as customer totals inclusive of applicable GST. Obtain qualified Indian tax review for registration, classification, rate, place-of-supply and invoice treatment before collecting payments.
- Accounts requiring parent/guardian approval must remain gated until the legitimate approval process is completed. Do not create QA approval overrides or promote roles to bypass this gate.

## Open repository review queue

- PR #64 — Cashfree checkout and unverified role-promotion safeguards — open, draft.
- PR #63 — Super Admin Founder Menu and Android release publishing — open, draft.
- PR #62 — Founder Menu and mobile release manager — open.
- Other older feature, documentation, and QA pull requests remain open. Review their current diff, duplicate scope, and CI status before merging or closing. They were not changed as part of this audit.

## Required release sequence

1. Enable leaked/compromised-password protection in Supabase Auth and verify sign-in and recovery flows.
2. Reconcile the full local/remote migration history using trusted history and a disposable test database. Never reset or rewrite production migration history to hide drift.
3. Complete the SECURITY DEFINER function and RLS-policy reviews using positive and negative tests for athletes, coaches, academy admins, support admins, and super admins.
4. Reconcile and install the AI monthly budget ledger, then verify model access and provider spend caps. Keep AI fail-closed until then.
5. Add web TypeScript type-checking to CI and complete the web/mobile feature-parity matrix.
6. Finish the Android debug APK build, then produce and verify a separately signed production AAB.
7. Complete two-account physical-device acceptance, including parent/guardian approval flows.
8. Complete legally reviewed payment, recurring-billing, cancellation, refund, and webhook flows before enabling checkout.
9. Deploy only the exact reviewed commit after the preceding gates pass, then verify its deployed SHA and run post-deployment smoke tests.

**Release decision: remain in candidate/QA status.** No production deployment, paid-checkout activation, role promotion, user-data cleanup, or Auth setting change was made during this audit.
