# AthleteN Launch Audit — 29 October 2026

## Scope

Reviewed repository structure, web and mobile package/workflow configuration, auth bootstrap paths, messaging clients, messaging database policies and constraints, Realtime publication, Supabase migration history, and Supabase security/performance advisors.

This is a code/database configuration audit, not a substitute for real-device and two-account end-to-end acceptance testing.

## Changes made during audit

- Added explicit database-confirmed insert handling to web and mobile messaging clients. The composer clears only after the database returns the saved message row.
- Applied the messaging delivery/persistence migration to the live AthleteN Supabase project. It makes the message body nullable only to support attachment-only messages, replaces the attachment/body constraint safely, and requires the authenticated sender to be a member of the conversation.
- Preserved the existing restrictive age-approval policies.
- Added messaging persistence and authorization regression tests.
- Aligned the repository migration filename with the migration version recorded by the live database.

## Verified checks

- Live Supabase project status: active/healthy.
- Public schema tables: 87 checked; 87 have row-level security enabled; 0 public tables were found with RLS disabled.
- Messaging constraints: non-empty text up to 4,000 characters, or a private attachment path.
- Messaging write policy: sender must match `auth.uid()`, must be a member of the conversation, and must provide text or an attachment.
- Messaging Realtime publication includes `messages`, `conversation_members`, and `messaging_hidden_conversations`.
- The existing mobile-check workflow passed on the reviewed mobile messaging commit: Expo Doctor, TypeScript, ESLint, and Android bundle export.
- Web CI passed on the messaging implementation commit. New regression checks were then added and a fresh CI run started; use the Actions page for its final result.
- The Android APK workflow has started; a successful APK artifact has not yet been confirmed by this audit.

## Findings requiring follow-up

### High priority — production authentication setting

Supabase Security Advisor reports **Leaked Password Protection Disabled**. Enable leaked-password protection in Supabase Auth settings before public launch.

### High priority — review SECURITY DEFINER RPC authorization

Security Advisor reports 62 SECURITY DEFINER functions executable by authenticated users. This is a warning class, not proof that all 62 are exploitable: many are intended RPCs. Each function must be reviewed for strict ownership/role checks and least-privilege grants. Do not blanket-revoke intended app RPCs without checking call sites.

### Medium priority — policy and performance cleanup

Security/performance advisors report multiple permissive policies, auth RLS initialization-plan warnings, unindexed foreign keys, and unused indexes. These need a table/function-by-table/function review. Avoid dropping indexes or merging policies blindly because both can change behavior.

### Messaging — real-user acceptance test still required

Database configuration and client-side confirmation handling are now hardened, but this audit has not logged in as two separate real users and confirmed send/receive/refresh/logout behavior end to end. That is required before calling messaging fully working. Also verify attachment upload/download, block/unblock, group membership, and age-approval gating.

A recent database log contained an invalid UUID argument (`{"pressed":false}`) sent to `unblock_messaging_user`. The current web and mobile settings call sites use explicit user IDs; re-test this path on the latest deployed app and investigate if it recurs.

## Release gate

Do not label the release fully production-ready until:
1. Latest web CI and CodeQL checks finish successfully.
2. Mobile checks and Android release APK build finish successfully.
3. Two-account messaging acceptance tests pass on deployed web and a real Android device.
4. Leaked-password protection is enabled.
5. SECURITY DEFINER RPCs and outstanding advisor findings receive an explicit risk review.


## Follow-up hardening — 29 October 2026

- Added the missing public-schema foreign-key indexes through the live database migration `index_uncovered_foreign_keys_20261029`; the matching migration is committed as `supabase/migrations/20261029170000_index_uncovered_foreign_keys.sql`.
- Restricted direct execution of two internal PostgreSQL trigger functions (`announce_training_cancellation()` and `ensure_training_group_conversation()`) from `PUBLIC`, `anon`, and `authenticated`. PostgreSQL triggers continue to invoke them; the change only removes unnecessary direct RPC execution. Applied live and committed as `supabase/migrations/20261029171000_restrict_trigger_function_rpc_execution.sql`.
- Current main CI and CodeQL passed on commit `2c68285597391095564794f7526787a3203a225f` before this follow-up security commit. New CI/CodeQL checks must pass for the latest commit before release.
- The Android build checked in this audit was still in progress, with no artifact available at the last check.

## Remaining release gates

1. Enable leaked-password protection in Supabase Auth settings; this setting is not exposed by the available project-management actions.
2. Review all remaining callable SECURITY DEFINER RPCs against their actual authorization logic and app call sites. Do not remove grants in bulk.
3. Confirm latest CI and CodeQL pass after the follow-up commit.
4. Confirm the latest Android build completes and publishes an APK artifact.
5. Complete two-account messaging, login/recovery, age-approval, role-permission, and core workflow tests on deployed web and a real Android device.

This remains a technical audit, not a claim of completed end-to-end production acceptance.


- Additional hardening: restricted direct RPC execution of `sync_training_group_chat_member()`, another internal trigger function. Applied live and committed as `supabase/migrations/20261029171500_restrict_training_chat_trigger_rpc.sql`.
- After these targeted trigger-function permission changes, the Security Advisor count for authenticated-callable SECURITY DEFINER functions dropped from 62 to 59. Remaining functions still require per-function authorization review.
- The latest CI and CodeQL workflows are running against the latest report commit; the following migration commit will also trigger fresh checks.

## Verification update — 30 October 2026

Verification was repeated from `origin/main` commit `ad7a331` on branch `codex/latest-main-readiness` using Node 24 locally; repository CI is pinned to Node 22.

- Web tests: **PASS** — `pnpm test`, 42 passed / 0 failed.
- Web production build: **PASS** — `pnpm run build`.
- Mobile dependency install: **PASS** — clean `npm ci --ignore-scripts --no-audit --no-fund`; React Native and Expo dependencies resolve from the committed lockfile.
- Mobile test command: **PASS** — `npm test` runs successfully (the mobile package currently contains no discovered test files; mobile regression coverage remains in the root test suite).
- Mobile TypeScript: **PASS** — `npx tsc --noEmit`.
- Mobile lint: **PASS** — 0 errors, 87 warnings. Warnings remain for unused imports, hook dependency hygiene, duplicate imports, and array-type style.
- Expo Doctor: **PASS** — 21/21 checks.
- Android bundle/export: **PASS** — `npx expo export --platform android --output-dir .expo/ci-export-readiness`; Android bundle emitted successfully.
- Android release APK: **NOT RUN / BLOCKED** — no GitHub Actions run or downloadable artifact was returned for commit `ad7a331`; the configured workflow is present and uses Node 22, Java 17, `npm ci`, `expo prebuild`, and `assembleRelease`. The expected artifact is `AthleteN-release-apk` containing `AthleteN-Mobile/android/app/build/outputs/apk/release/app-release.apk`. Configured app version is `1.0.3`, Android version code `4`.
- CI and CodeQL: **NOT VERIFIED** — the repository connector returned no workflow runs for `ad7a331`; no run URL can be truthfully recorded.
- Supabase live migrations: **PASS (read-only verification)** — live history includes the messaging persistence, notification/privacy, age-approval, foreign-key-index, and three targeted trigger-execution hardening migrations through `20261029171121`.
- Supabase leaked-password protection: **BLOCKED / MANUAL** — Security Advisor still reports it disabled. Enable it in Dashboard → Authentication → Password Security → Leaked password protection, then rerun Security Advisor.
- Netlify production deployment: **BLOCKED / NOT VERIFIED** — no authorized deployment result or deployed commit was available in the configured connector during this run.
- Real-device and two-account acceptance: **NOT RUN** — this environment did not provide an authenticated Android device or two test accounts. This includes logout/expired-session/account-switching and push-notification delivery verification.

### Release decision

**NO-GO for an evidence-backed public production launch tomorrow.** Code-level web and mobile checks pass, but the APK artifact, CI/CodeQL result, Netlify deployed commit, leaked-password setting, and real-device/two-account acceptance remain unverified. A controlled internal beta is reasonable only after explicitly accepting those gates and completing the manual checks above.
