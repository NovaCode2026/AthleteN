# AthleteN audit execution status — 4 November 2026

**Branch:** `audit/nov-2026-pilot-hardening`  
**Base commit inspected:** `21f19ae5c8277b0646c7831bc44a28c406c4d05a`  
**Production Supabase project:** `wjegokgtrewtoopbsiol` (Mumbai, PostgreSQL 17.6)  
**Release decision:** NOT SIGNED OFF

This document tracks work performed against *AthleteN: Audit, Action Plan and Pilot Kit*. A code commit, applied migration, or green CI run is not by itself production acceptance.

## Completed on this branch

- [x] Removed repository-only temporary files: `test-temp.txt`, `netlify-trigger.txt`, and `netlify-trigger-2.txt`.
- [x] Pinned the repository-root Web workspace to `pnpm@10.30.3`.
- [x] Updated the root README and deployment instructions to use pnpm for Web. The isolated `AthleteN-Mobile` package retains its own `package-lock.json` and npm workflow.
- [x] Updated `netlify.toml` to use `pnpm run build` for the Web build.
- [x] Added a Web Coach class-attendance panel using the existing `training_groups`, `training_group_sessions`, `training_group_members`, and `training_group_attendance` model. It supports one-tap mark-all-present and individual Present/Late/Absent/Excused correction, with an unmark action.
- [x] Restored three migrations already present in the live Supabase migration ledger but absent from the repository migration directory:
  - `20261104101337_competition_checklists_tournament_scope.sql`
  - `20261104103042_secure_messaging_and_coach_rpcs.sql`
  - `20261104103647_enforce_announcement_audience_reads.sql`
- [x] Restored migration SQL from `supabase_migrations.schema_migrations.statements`; the files were not re-applied to production.

## Live checks and findings

- Supabase reports project status `ACTIVE_HEALTHY` and PostgreSQL 17.6.
- Public-schema inventory in the release-status document reports 88 tables with RLS enabled and zero exposed public tables missing RLS.
- Current Security Advisor still reports leaked-password protection disabled and 61 authenticated-callable `SECURITY DEFINER` functions. Do not blindly switch or revoke them: review each function's purpose, caller identity, relationship authorization, grants, search path, outputs and negative tests.
- Performance Advisor findings include unused-index notices and multiple-permissive-policy warnings. Do not drop indexes or combine policies without query workload and access-model review.
- The existing mobile implementation has push registration and durable message receipt logic, but production acceptance still requires a physical device. Prior release evidence reports zero registered production push tokens; recheck after device registration.
- The repository includes distinct Kyorugi and Poomsae workflows and the Web experience model states that Web is the full master information workspace while Mobile is the compact operational companion. Supabase remains the shared source of truth.

## Still open — do not mark production ready

### Gate 1 — security and release integrity

- [ ] Enable Supabase Auth leaked-password protection in the Auth security settings.
- [ ] Complete manual review and wrong-user/right-user tests for all 61 authenticated-callable `SECURITY DEFINER` functions. Prioritize messaging, athlete records/documents, attendance, memberships and roles.
- [ ] Re-run current Web and Mobile dependency audits; the previous release snapshot reported 36 Mobile advisories (including 1 critical and 7 high). Upgrade by dependency path, not with a blind force-upgrade.
- [ ] Verify the current `main` commit and this branch's CI, CodeQL, Mobile Check and APK workflow results.
- [ ] Verify Netlify Production deploy points to the intended release commit. Previous snapshot reported the live site was behind `main`.
- [ ] Install the signed Android release artifact on a physical device and complete role, login, logout, deep-link, camera/file permission and crash checks.
- [ ] Register a real device push token; verify Expo tickets/receipts, app-closed delivery, tap routing, invalid-token handling and single-device logout behavior.
- [ ] Complete two-account direct/group messaging tests across foreground, background, terminated and offline/reconnect states; verify no duplicates and accurate Sent/Delivered/Read states.
- [ ] Treat Web background push as unsupported until browser Push API and service-worker subscriptions are separately configured and tested.

### Gate 2 — pilot operations

- [ ] Verify the new Coach attendance panel against Coach-owned groups using a Coach test account; test batch marking, one-person correction, unmark, refresh and an unrelated Coach account's denial.
- [ ] Add/verify the coach-facing needs-attention queue. Use safe follow-up signals such as repeated missed sessions and upcoming events; do not create weight-pressure alerts for minors.
- [ ] Add/verify a coach/academy announcement workflow with recipient-scoped seen counts. The live database has `announcements` and `announcement_reads`; the current Mobile overlay only handles global announcements and does not establish Coach announcement analytics.
- [ ] Verify each tournament checklist is attached to the correct athlete and tournament on both Web and Mobile. The live database migration adds `tournament_id`, but cross-client acceptance is still required.
- [ ] Design and implement a genuinely read-only parent view only after guardian identity, verifiable consent, authorized athlete linkage and field-level disclosure rules are defined. Do not expose a child record by email matching alone.
- [ ] Finalize retention period, parent/guardian request contact, deletion/withdrawal handling and the coach-to-minor messaging supervision policy before inviting under-18 pilot users.
- [ ] Keep the pilot small (10–15 athletes, 1–2 coaches) and maintain existing academy records in parallel during the four-week test.

### Gate 3 — payments and expansion

- [ ] Keep `FREE_LAUNCH = true`. Do not turn on paid checkout until provider onboarding, monthly/yearly price mapping, sandbox success/failure/refund/expiry tests and repeated-webhook handling all pass.
- [ ] Measure real hosting, AI, storage and payment costs before confirming the ₹499–₹799 Coach/Academy pricing hypothesis.
- [ ] Defer Football and other second-sport work until one Taekwondo academy completes the pilot and provides evidence of sustained use.

## Pilot timeline correction

Use one consistent schedule: **Week 1 onboarding and attendance; Week 2 announcements and tournament page; Week 3 parent view and attention queue only after safeguards are ready; Week 4 review and feedback.** The end-of-pilot decision is in Week 5. Do not simultaneously describe the four-week pilot as Weeks 1–4 and Weeks 3–6.

## Acceptance evidence required

For every item checked above, record the source commit, test account role, device/model and Android version where relevant, exact test steps, expected result, observed result and supporting logs/screenshots. A checklist without test evidence is not a pass.

**Current state:** source cleanup and the first Coach attendance implementation are committed to this branch; CI and end-to-end acceptance are pending; production remains **NOT SIGNED OFF**.
