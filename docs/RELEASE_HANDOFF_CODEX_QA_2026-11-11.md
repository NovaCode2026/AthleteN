# AthleteN Release Handoff — Codex QA

**Prepared:** 2026-11-11  
**Repository:** NovaCode2026/AthleteN  
**Current main SHA at handoff:** `f86672f454b3d121707ff76826577df089b02bff`  
**Status:** Engineering preflight partly green; **NOT APPROVED FOR PRODUCTION RELEASE**. Codex must perform independent QA and close the gates below before sign-off.

## Verified in this preflight

- Navigation PR #32 was merged to `main`.
- Production Supabase project `wjegokgtrewtoopbsiol` contains `public.user_navigation_preferences` and `public.set_my_navigation_preferences(text[])`.
- The navigation RPC privilege check confirmed `anon` cannot execute it and `authenticated` can.
- The matching navigation migration is `supabase/migrations/20261111072407_require_more_in_navigation.sql`.
- The regression test path was updated to that migration filename.
- GitHub CI on `f86672f`: web tests passed, production build passed; scanner regression passed; CodeQL passed.
- Mobile CI on the merged navigation commit `6aaba987`: TypeScript, ESLint, Android bundle export and Expo Doctor passed.
- Production Supabase tables inspected in the public schema had RLS enabled for the listed application tables. This is not a full policy correctness audit.

## Hard blockers / unresolved evidence

### 1. Supabase migration history drift — release blocker

- Production migration history reports **163** applied versions.
- The repository contains **98** migration files.
- The repository filenames do not reproduce most of the remote 14-digit migration version identifiers; the Supabase Preview check fails with: `Remote migration versions not found in local migrations directory.`
- Do not create empty migration stubs, blindly mark versions repaired, reset production, or replay old migrations. Those actions can conceal schema drift or damage data.
- Codex must reconcile the complete production history with the repository. Recover the original SQL for missing versions where possible, map legacy date-prefixed files to their real remote versions, inspect schema diffs, and produce a documented, reviewed baseline/reconciliation plan. Only then should Preview CI be made green.

### 2. Production web deployment is stale

- Netlify site: `athleten` / `16df2d3e-fb40-4400-bc39-b2adc6cfb7dd`.
- Latest published production deploy inspected: `6aecb1129bc1e59b10830bd8`, created 2026-11-05.
- Its source commit is `947d2ce4d8310a1eba0291b8dfa6eddcae11cd8d`, not current `main`.
- The Netlify connector available in this session is read-only for deployments; no deploy was triggered here.
- Codex must deploy current `main` through the authorized Netlify/Git workflow, verify the deployed commit SHA, smoke-test the production URL, auth redirect/callbacks, functions and SPA routing, and confirm rollback target.

### 3. Android artifact and device validation

- Latest Android workflow inspected: `42979410933`; APK build step was still running at last check.
- Do not report an APK as available until the workflow succeeds, artifact exists, and the artifact can be downloaded and inspected.
- Install on physical Android device(s); verify fresh install, upgrade path, login/logout, Google callback, reset password, email verification, navigation persistence, push permissions/token registration, background notification receipt, deep links and offline/reconnect behavior.
- Record device model, OS version, app version/build, test account role and results. Never use real user private data in QA.

### 4. Supabase Auth security setting

- Supabase Security Advisor reports `auth_leaked_password_protection`: leaked-password protection disabled.
- Enable this in Supabase Auth password/security settings after checking compatibility and expected user-facing password-change/reset behavior. Verify setting state afterward. The available Supabase connector here does not expose an Auth settings mutation action, so this has not been changed.

### 5. Security Advisor findings requiring triage

Latest inspected security notices:
- 61 authenticated-callable `SECURITY DEFINER` functions.
- `pg_net` extension installed in `public`.
- Leaked password protection disabled.

Performance notices:
- 121 multiple-permissive-policy notices.
- 81 unused-index notices.

Do not blanket-revoke functions, move extensions, drop indexes, or rewrite RLS policies without checking application call sites, trigger dependencies, policy semantics, query plans and rollback safety. Produce a function-by-function authorization matrix, prioritize admin/finance/role assignment/messaging/age-verification RPCs, and test as anon, authenticated user, coach, academy owner and admin.

## Codex QA execution plan

1. Fetch current `main`; confirm SHA and clean worktree.
2. Resolve Supabase migration history drift safely; run schema diff and Supabase Preview against a non-production branch if available without creating paid resources.
3. Run all repository tests, web production build, mobile typecheck/lint/Expo Doctor/Android export, scanner regression and CodeQL. Preserve logs and exact commit SHA.
4. Deploy the exact tested SHA to Netlify. Verify the production deploy source SHA equals the tested SHA.
5. Execute role-based end-to-end tests: athlete, coach, academy owner, admin; test access isolation with at least two independent user accounts.
6. Messaging: send/receive, refresh persistence, duplicate prevention, receipts, attachments, reconnect/retry, blocked users, group membership, realtime and push acknowledgement.
7. Authentication: email signup/verification, Google OAuth redirect and callback, password reset, expired session, logout, account switching, and deep links.
8. Notifications: foreground, background, killed app, token rotation, denied permission and retry behavior.
9. Confirm age/guardian consent and privacy flows for under-18 accounts; do not expose user discovery before required approval.
10. Review payment/checkout gates; keep live payments disabled until provider credentials, webhook signatures, idempotency, refund/cancellation and legal disclosures are verified.
11. Generate release evidence: CI links, artifact SHA/checksum, deploy SHA, migration reconciliation, security review, device matrix, known limitations and rollback plan.

## Sign-off criteria

Release sign-off is allowed only when:
- All required CI/security checks pass on the exact release SHA.
- Supabase migration history is reconciled and Preview passes without fake stubs or unsafe repair.
- Netlify production serves that exact SHA and smoke tests pass.
- Android artifact is generated, downloadable, installable and device-tested.
- Auth, role isolation, messaging and notifications pass real multi-account/device E2E.
- Critical/high security findings are resolved or explicitly risk-accepted by the responsible project owner with mitigation.
- Backup and rollback procedures are verified.

**Current verdict:** PREPARED FOR CODEX QA — NOT PRODUCTION SIGN-OFF.
