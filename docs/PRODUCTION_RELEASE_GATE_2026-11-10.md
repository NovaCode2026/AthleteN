# AthleteN production release gate — 10 November 2026

## Release decision

**Not approved for production sign-off yet.** The connected GitHub checks are green for PR #30, but release-critical external acceptance and the remaining dependency/security findings are still open. This document distinguishes automated evidence from checks that require the production account owner or physical devices.

PR: https://github.com/NovaCode2026/AthleteN/pull/30
Reviewed head at this report: `dbe48ae7c8f9c83b1951e03c3a102c1c4b186c4d`

## Changes on PR #30

- Athlete onboarding completion now requires the fields requested by the onboarding form: full name, username, date of birth, gender, Taekwondo sport, Kyorugi/Poomsae discipline, academy and coach. A name-only OAuth-created profile no longer skips onboarding.
- Coach, Academy Admin and platform staff roles are exempt from athlete-only onboarding fields.
- The web auth callback now exits its indefinite loading state with a safe return-to-login action if auth initialization finishes without a session.
- Regression tests cover OAuth starter-profile onboarding and missing callback sessions.
- The mobile health workflow runs for shared web/backend changes as well as mobile changes.
- Expo SDK 57 splash-screen validator exception is documented in [MOBILE_DEPENDENCY_COMPATIBILITY.md](MOBILE_DEPENDENCY_COMPATIBILITY.md).

## Automated checks on the reviewed PR head

| Check | Result | Evidence |
|---|---|---|
| Root test suite | PASS | GitHub Actions CI run 1844 |
| Web production build | PASS | Same CI run |
| CodeQL | PASS | GitHub Actions CodeQL run 1883 |
| Mobile TypeScript | PASS | Mobile Check run 572 |
| Mobile lint | PASS, warnings remain | Same Mobile Check run |
| Android JavaScript bundle export | PASS | Same Mobile Check run |
| Expo Doctor | PASS with documented SDK-57 exclusion | Same Mobile Check run |

These are CI checks on the PR branch. They do **not** prove that Google OAuth works with the live provider configuration, that a signed APK installs, or that notifications and messaging work between physical devices.

## Dependency audit

The original mobile `npm ci` audit reported 26 findings: 1 critical, 7 high, 17 moderate and 1 low.

A non-forcing `npm audit fix --package-lock-only` was run in the CI workspace, followed by a clean `npm ci`, Expo Doctor, TypeScript, lint and Android bundle export. That generated a verified replacement lockfile and reduced the audit to **15 findings: 0 critical, 3 high and 12 moderate**.

The updated lockfile is available as the `mobile-dependency-audit` artifact from:
https://github.com/NovaCode2026/AthleteN/actions/runs/42680278019/artifacts/13702780713

The artifact's lockfile was generated in CI and is **not yet committed to this branch**. Adopt it as `AthleteN-Mobile/package-lock.json` and rerun the mobile checks before treating the reduced audit count as the repository's committed dependency state.

The remaining high findings are in the Expo Router / `query-string` / `decode-uri-component` chain. The audit suggests Expo Router 58 as the automatic fix, which would be a major SDK change. Do not use `npm audit fix --force` to make the report green; plan and test a deliberate Expo SDK migration instead.

## Live Supabase review

Read-only inspection of the production project found:

- RLS is enabled on the checked public tables. `account_entitlements` exposes an own-row SELECT policy and a super-admin full-access policy; there is no ordinary authenticated INSERT/UPDATE policy.
- `activate_trial_after_payment` is executable by `service_role`, not by `authenticated`.
- The reviewed authenticated-executable security-definer functions reference the auth context; high-privilege admin RPCs inspected also perform platform-admin checks.
- Advisor warnings remain: 61 authenticated-executable security-definer functions, 121 multiple-permissive-policy findings, one extension-in-public finding, and 81 unused-index informational findings.
- Auth leaked-password protection is still OFF.

No production SQL writes, permission changes, migrations or user-data changes were made during this review. Do not blanket-revoke security-definer function permissions or drop indexes to silence advisors. Review each function/policy and enable leaked-password protection in Supabase Auth settings before release.

## Deployment and billing

- The published Netlify deploy is READY but stale relative to the current repository `main` head. The connected Netlify capability available for this review is read-only, so no production deploy was triggered.
- The `FREE_LAUNCH = true` payment gate remains enabled. Do not enable billing until provider sandbox tests, webhook signature/replay handling, plan/role eligibility, recurring billing, refunds and legal disclosures are validated.
- Production website and Supabase were not changed.

## Required production acceptance before sign-off

1. Merge PR #30 only after reviewing its diff and applying the generated mobile lockfile update.
2. Publish the reviewed `main` commit to Netlify, then smoke-test signup, Google sign-in, email verification, password reset, logout and return-to-app routing using real accounts.
3. Install a signed Android release build on physical devices and test fresh install, upgrade, offline/online sign-in, logout and account switching.
4. Test messaging with two separate accounts: direct and group conversations, reconnect/offline retries, delivery/read receipts, attachment retry, blocked users and background/terminated app states.
5. Verify Android push delivery with real device tokens and provider tickets/receipts; verify web push separately. A successful JS bundle export is not a signed APK or push-delivery test.
6. Enable leaked-password protection, resolve/review Supabase advisor findings, confirm RLS/policy access using distinct athlete/coach/academy/admin accounts, and record the result.
7. Keep payment disabled until the billing acceptance checklist is complete.

**Sign-off remains blocked** until the above acceptance evidence is recorded. CI green is necessary, not sufficient.
