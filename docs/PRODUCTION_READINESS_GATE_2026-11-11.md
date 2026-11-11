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
