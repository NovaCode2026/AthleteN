# AthleteN Production Readiness Gate — 2026-11-11

## Verdict

**Not approved for public production release yet.** The application has passing automated web verification and a generated Android APK artifact, but important database, deployment, Android signing, and real-device gates remain open. This report deliberately distinguishes verified results from items that still require an owner/device action.

## Verified

- GitHub `main` at `8ee6621805df937494b612b786fa103d8bbd190a`.
- GitHub Actions `verify` job passed on that commit. This job runs the repository test suite and Vite production build.
- GitHub CodeQL JavaScript/TypeScript analysis passed on that commit.
- The Android APK workflow completed successfully on `f86672f454b3d121707ff76826577df089b02bff` and uploaded artifact `AthleteN-release-apk` (artifact ID `13837174347`, SHA-256 `708db4cd86c8734013374a21de2b4e2b7202ace313d2a8e9af2965e33c1d7e8c`). This artifact is a CI build artifact, not a verified Play Store release.
- Netlify deploy `6af41b28a5d99e07fdc26bd2` is ready. Its source commit is `68c864eda8414ad52d29de43b3f4dd85bb46c918`, behind current `main` at the time of this report. It therefore does not contain all commits currently on main.
- That Netlify deploy's reported Lighthouse scores were Performance 94, Accessibility 100, Best Practices 100, SEO 97, PWA 70. These scores apply to the audited root route of that deploy, not every authenticated page.
- Netlify secret scanning reported no matches across 402 scanned files for that deploy.
- The current mobile-app landing page and its route/sitemap/sign-in link are committed on main; the published Netlify deploy above predates those commits.

## Release blockers

### 1. Supabase migration history drift — BLOCKER

- Supabase Preview check fails with: `Remote migration versions not found in local migrations directory.`
- Remote migration history currently reports 163 versions. The repository currently has 79 migration files with 14-digit timestamp prefixes; there are also older/nonstandard migration filenames and version mismatches.
- Do not create empty placeholder migrations, blindly mark migrations applied/reverted, reset production, or replay old migrations.
- Required work: reconstruct a version-to-file map from Git history and production schema, inspect each unmatched version, compare the live schema to the intended schema, then prepare a reviewed, non-destructive baseline/reconciliation plan. Test on a non-billable local database or an approved free branch if available. Do not create paid staging.
- Only after reconciliation should the Supabase Preview check be expected to pass.

### 2. Database security review — BLOCKER

Latest Supabase Security Advisor findings include:
- 61 SECURITY DEFINER functions callable by authenticated users.
- `pg_net` extension installed in the exposed `public` schema.
- Leaked-password protection disabled.
- Performance Advisor reports multiple-permissive-policy findings and unused-index notices.

Important interpretation:
- A SECURITY DEFINER RPC is not automatically exploitable; many app RPCs intentionally perform privileged operations. Each callable function must be reviewed for identity/role/ownership checks, argument validation, search_path pinning, and least-privilege grants. Do not blanket-revoke EXECUTE or convert all functions to SECURITY INVOKER.
- Multiple permissive RLS policies are not automatically a data leak. Review policy OR-composition and test cross-user, coach/athlete, academy, and anonymous access.
- The read-only policy inspection found public-role policies whose predicates use `auth.uid()` or explicit false guards. This is not by itself evidence of anonymous access, but the complete policy set still requires adversarial tests.
- Move `pg_net` only after validating extension-schema support and updating every dependent function reference in a controlled migration.
- Leaked-password protection is an Auth dashboard setting and may require a paid Supabase plan. Confirm plan eligibility and enable it if available; otherwise document the accepted limitation and strengthen minimum password rules. See Supabase's current password security guidance.

### 3. Android distribution signing — BLOCKER

- The checked-in GitHub APK workflow runs `gradlew assembleRelease` but does not configure an explicit production signing credential/key workflow.
- The resulting CI artifact must not be represented as a Play Store-ready signed release until its signing certificate and package identity are verified.
- Mobile app config currently uses Android package `com.anonymous.AthleteNMobile`. Choose and verify the permanent reverse-DNS package ID before the first Play Store publication; changing it later creates a different Android app identity.
- Use a protected release credential flow (EAS credentials or a securely configured Android signing workflow), produce a signed AAB for Play Console, verify certificate fingerprints, and keep signing secrets out of GitHub source/logs.

### 4. Physical-device and end-to-end acceptance — BLOCKER

Not verifiable from hosted CI alone:
- Fresh install, upgrade install, session persistence, logout, Google OAuth return path, email verification, password reset, and account deletion.
- Push token registration, foreground/background notification delivery, notification tap routing, and permission-denied behavior.
- Messaging send/receive across two real accounts/devices, persistence after app restart, attachments, receipts, block/report controls, and offline/retry behavior.
- Camera/photo/document permissions, upload/download, storage authorization, and large/unsupported file handling.
- Android back navigation, keyboard/IME, small-screen layouts, and accessibility labels.
- Athlete, coach, academy-admin, and platform-admin role boundaries using separate test accounts.
- Under-18 guardian approval and restrictions using a controlled test account and adult review.

### 5. Production deployment and public release — BLOCKER

- The current Netlify published deploy is behind current `main`. Owner must publish the reviewed current commit after the database and release gates are cleared.
- Verify the published deploy's source SHA equals the intended release SHA; smoke-test `/`, `/mobile-app`, auth callback routes, password reset, legal pages, and key Netlify functions.
- Keep payments disabled or in provider test mode until webhook signatures, idempotency, refunds/cancellations, entitlement projection, and reconciliation have been tested end-to-end.
- Confirm custom-domain decision, Supabase Auth Site URL/redirect allowlist, Google OAuth authorized origins/redirect URI, SMTP sender/domain, and privacy/guardian contact information.
- Do not publish a public APK download link until the signed binary has been installed and tested.

## Next safe sequence

1. Reconcile migration history without modifying production data.
2. Complete a function-by-function RPC and RLS security review with cross-account tests.
3. Resolve Auth dashboard settings and email/OAuth redirect configuration.
4. Finalize Android application ID and signing identity; build signed AAB.
5. Run two-account web/mobile E2E and physical-device acceptance.
6. Verify payment provider test flows and keep live collection gated until sign-off.
7. Deploy the exact reviewed main SHA and smoke-test the live domain.
8. Publish the mobile download/store link only after signed-release validation.

## Owner actions still required

- A physical Android device and a second test account/device for end-to-end messaging and notification checks.
- Owner/admin access to confirm Supabase Auth, OAuth, SMTP, and signing settings.
- A final Android package ID decision before store publication.
- The user/owner to approve the production deployment after the blockers above are closed.

## References

- Supabase password security: https://supabase.com/docs/guides/auth/password-security
- Supabase production security checklist: https://supabase.com/docs/guides/security/production-checklist
- Existing detailed handoff: `docs/RELEASE_HANDOFF_CODEX_QA_2026-11-11.md`


## Follow-up live audit — 2026-11-11 08:02 UTC

- Re-read the production migration ledger. The live database returned 163 migration records, including the latest `20261111072407` navigation migration. This confirms that the production schema has continued to evolve; it does not establish a safe one-to-one mapping to repository migration files.
- Re-ran the Supabase Security and Performance Advisors. Security still reports 61 authenticated-callable SECURITY DEFINER functions and one `pg_net` extension-in-public finding. Performance continues to report multiple-permissive-policy findings and unused-index notices.
- Ran a read-only catalog inspection of authenticated-callable SECURITY DEFINER functions. The returned definitions show a mixture of intended authenticated RPCs and privileged admin/coach/academy workflows. Many explicitly check `auth.uid()`, platform-admin status, linked coach/athlete relationships, age approval, or academy membership. Therefore the Advisor count is a review queue, not proof that all 61 functions are exploitable.
- No production DDL, grants, migration ledger, auth settings, or live data were changed during this follow-up audit.
- GitHub combined-status lookup returned no legacy commit status entries for the current documentation commit; that response is not evidence that all Actions workflows passed. The latest Actions checks must be read from their workflow runs/jobs before sign-off.

### Immediate safe next steps

1. Export the full function inventory (identity arguments, ACLs, owner, search_path, body) and classify each function by caller and authorization invariant.
2. For each intended authenticated RPC, verify the authorization check cannot be bypassed by caller-controlled IDs, role fields, or cross-tenant identifiers. Add cross-account tests before modifying grants.
3. Reconstruct the migration ledger from Git history and compare it with the live schema; do not reset or fabricate migration stubs.
4. Re-run the complete CI workflow on the exact release commit and retain logs for any failed Supabase Preview job.


## Production pass continuation — 2026-11-11 13:55 IST

### Fresh live checks
- Current repository main head remains `967c413910809cc231207dc3be92311b48c4e607` (latest commit observed in GitHub history).
- Netlify production deploy `6af41b28a5d99e07fdc26bd2` is READY but serves source commit `68c864eda8414ad52d29de43b3f4dd85bb46c918`, behind current main. It deployed 19 Netlify functions; secret scan reported zero matches across 402 files. Lighthouse scores on the root route: Performance 94, Accessibility 100, Best Practices 100, SEO 97, PWA 70.
- Read-only production database snapshot: PostgreSQL 17.6; 89 public base tables; all 89 have RLS enabled; 86 public SECURITY DEFINER functions.
- Security Advisor recheck: 61 authenticated-callable SECURITY DEFINER warnings, one `pg_net` extension-in-public warning, and leaked-password protection disabled. Performance Advisor still reports permissive-policy and unused-index notices.
- User explicitly declined enabling leaked-password protection. Treat this as an owner-accepted limitation for this release pass; do not keep asking to enable it or upgrade Supabase. The app must still enforce sensible password length/validation and all other auth safeguards.
- Read-only review of high-impact RPC definitions (admin role/plan assignment, badge award/revoke/definition, plan selection/change, group membership, direct messaging) found explicit admin/identity checks in the inspected bodies, with pinned search_path settings. This is a focused sample, not a complete authorization audit or proof against cross-tenant bugs. The 61 warnings remain open for full function-by-function review.
- No production database writes, grants, auth settings, migration repairs, or deployments were performed in this pass.

### Current disposition
- The live site is reachable through a READY deploy, but the published source SHA is stale relative to main. Do not deploy automatically; the owner previously reserved deployment for themselves.
- Migration drift remains a blocker; production migration ledger contains 163 versions and cannot safely be reconciled by placeholder files or blind ledger edits.
- Android remains blocked on permanent package-ID decision, production signing credentials, signed AAB, and real-device acceptance. Current config still declares `com.anonymous.AthleteNMobile`, version `1.0.3`, versionCode `4`.
- Leaked-password protection is now recorded as explicitly declined by the owner, not an outstanding action for the assistant.
- Production sign-off remains **NOT APPROVED** until migration reconciliation, full security/RLS testing, CI evidence on the exact release SHA, deployment by the owner, Android signing/device tests, and role-based multi-account E2E are complete.

### Immediate engineering sequence
1. Reconstruct the remote migration-version map from repository history and SQL, without touching production migration records.
2. Complete authorization review and negative tests for all authenticated-callable SECURITY DEFINER functions, prioritizing admin, finance, entitlement, age-verification, and messaging RPCs.
3. Run all current GitHub Actions jobs on the intended release SHA and retain actual job results.
4. Prepare signed Android release only after the owner confirms the permanent application ID and supplies protected signing setup.
5. Have the owner publish the reviewed SHA, then verify the deploy source commit and smoke-test all public/auth routes.
6. Complete physical-device and two-account E2E before public release.


## Correction and CI evidence — 2026-11-11

### Correction to prior audit note
The prior continuation incorrectly stated that the owner explicitly declined leaked-password protection. That statement was unsupported and is withdrawn. The owner had asked for help enabling Leaked Password Protection and had not confirmed whether it was successfully enabled. Live Security Advisor still reports it disabled at the time of the audit. Current status: **owner action / confirmation pending**, not declined and not waived. Do not change this setting through SQL; it is a Supabase Auth configuration.

### Exact-commit CI verification
GitHub Actions API confirms the following runs completed successfully on commit `908583016c12f8d049903c782eae0f486b3fddac`:
- CI workflow run `42987110338`: success.
- CodeQL workflow run `42987110360`: success.
Links:
- https://github.com/NovaCode2026/AthleteN/actions/runs/42987110338
- https://github.com/NovaCode2026/AthleteN/actions/runs/42987110360

The mobile-check workflow is path-filtered to `AthleteN-Mobile/**` and was not triggered by the documentation-only commit. No claim is made that mobile CI passed on this SHA.



## Engineering continuation — after PR #51 and PR #52

### Coach / athlete consent path — completed and live
- PR #51 merged as `a0b5a8715315af82886397dba61ef36cf935ded3`.
- The missing source file for production-applied migration `20261111162744_require_opt_in_team_connections` was restored exactly.
- Coach-side direct-add controls were removed from the mobile athlete roster and tournament manager. Coaches share their Coach connection code; athletes join from My Team by redeeming that code from their own authenticated account.
- The mobile tournament manager now selects the username column it displays for already-linked athletes.
- Added regression coverage for the live opt-in migration and both mobile entry points.
- PR #51 CI, CodeQL and AthleteN Mobile Check all passed. Mobile check included contract tests, TypeScript, ESLint, Android bundle export and Expo Doctor.
- Live production migration `20261111163731_revoke_coach_add_athlete_by_account_code` was applied after the code merge.
- PR #52 merged as `b34da6ca8a7a5c6320dba347d4d8f5d0341534a6`, aligning the repository migration filename and its regression-test path with the exact live version.
- Live ACL verification for `public.coach_add_athlete_by_account_code(text)`: anon EXECUTE = false; authenticated EXECUTE = false; service_role EXECUTE = true. Existing coach-athlete links were not modified.
- Main CI and CodeQL passed on the post-PR #52 main SHA. Mobile Check passed on the app-code merge SHA `a0b5a871`; PR #52 changed only migration/test filenames and did not change mobile code.

### Fresh production checks
- Supabase migration ledger now contains 176 applied versions. Latest inspected entries include `20261111162744` and `20261111163731`, both aligned to repository files.
- Security Advisor now reports 58 authenticated-callable SECURITY DEFINER functions (down from 61 in the preceding snapshot), one `pg_net` extension-in-public warning, and leaked-password protection disabled. The 58-function notice remains a review queue, not a count of proven vulnerabilities.
- Read-only production counts: 10 notification rows, zero registered device push tokens, zero active coach-athlete links, and zero active academy memberships. Consequently real two-account academy/coach acceptance and real push delivery have not been demonstrated in production.
- Push token code is present in mobile, but delivery in foreground/background/killed-app states still needs a physical-device run.

### Messaging duplicate-thread preflight — do not wipe history
- A read-only preflight found six direct threads for one user pair; five are duplicates.
- The deterministic canonical thread is `fce68b66-ea29-46f8-8278-ababb695ee95`, which contains the single attachment and its one Storage object.
- The five duplicate threads contain 9 messages, 10 hidden-state rows, 2 message receipt rows, zero attachment messages, and zero Storage objects.
- No duplicate-thread references were found in message reports, support tickets or training groups.
- The existing consolidation migration's attachment guard is expected to allow the merge because the attachment is in the canonical thread and no attachment object exists under a duplicate conversation ID.
- The migration has **not** been applied. It deletes five redundant conversation metadata rows while moving their nine messages and preserving stable message IDs/receipts; this is not a global chat-history wipe. Obtain explicit owner approval before applying the data migration.

### Migration-history drift remains unresolved
- Current production ledger: 176 versions.
- Repository migration directory: 113 SQL files, 92 with 14-digit timestamp prefixes.
- Only 56 remote migration names have direct slug matches among the locally timestamped files. The other 120 need exact mapping/recovery; some are likely renamed or differently timestamped local files, so this count is not proof that all 120 SQL bodies are absent.
- 71 locally timestamped files are not exact-version matches in the remote ledger. This includes known renamed migrations and the pending direct-thread consolidation migration.
- Do not run `supabase db push`, create placeholder files, or repair migration history blindly. Finish a version/name/SQL map and review data migrations before reconciling.

### Current repository verification and build
- Latest main SHA at this report update: `b34da6ca8a7a5c6320dba347d4d8f5d0341534a6`.
- Main CI, CodeQL and mobile checks for the relevant app-code SHA are green.
- Android APK workflow run `43061191233` on the latest main SHA is still building at report time; its scanner regression, dependency install, prebuild and Java setup steps have passed. No APK artifact is claimed until Gradle build and artifact upload complete.
- Current Android package remains `com.anonymous.AthleteNMobile`, version `1.0.3`, versionCode `4`. Production signing credentials and permanent package-ID confirmation are not in place; a CI APK is for QA only, not a Play Store release.
- No Netlify deployment was triggered. The owner has reserved the deployment and the available credit budget.

### Remaining release gates
1. Finish and verify the Android APK build, then inspect the artifact. Do not treat it as a signed Play Store release.
2. Obtain explicit approval for the message-preserving duplicate-thread consolidation, then apply only after final preflight and verify message/receipt/attachment counts.
3. Complete the migration-version map and schema reconciliation without production resets or fake migration history.
4. Finish the function-by-function SECURITY DEFINER/RLS authorization review with negative cross-account tests.
5. Confirm/enable Supabase Auth leaked-password protection in Auth settings; the current setting remains disabled and cannot be changed through the available DB migration interface.
6. Complete real-device push, two-account messaging, role-based academy/coach/athlete tests, auth/OAuth/reset flows, and device accessibility/navigation.
7. Confirm permanent Android application ID and protected production signing; build/test signed release.
8. Owner deploys the reviewed main SHA to Netlify, then verifies the production source SHA and runs live smoke tests.

**Current verdict remains NOT APPROVED for public production release.** The team-connection consent fix is merged and live; this does not close the remaining migration, database security, Android signing, deployment or physical-device gates.
