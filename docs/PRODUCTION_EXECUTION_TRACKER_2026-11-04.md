# AthleteN Production Execution Tracker — 4 November 2026

This tracker translates **AthleteN: Audit, Action Plan and Pilot Kit** into executable release gates. It is intentionally evidence-based: a task is not complete because a feature exists in the UI or a migration was applied; it is complete only when its implementation, authorization and acceptance evidence are recorded.

## Current verified baseline

- Repository: `NovaCode2026/AthleteN`; production branch: `main`.
- Supabase project: `wjegokgtrewtoopbsiol`; status observed 4 November 2026: `ACTIVE_HEALTHY`, PostgreSQL 17.
- The repository already documents the intended split: Web is the full master information workspace; Android is the compact operational companion; Supabase/Postgres is the shared source of truth.
- Root CI uses pnpm and the root repository has `pnpm-lock.yaml`; Android has its own `package-lock.json` and mobile CI uses npm. Keep these package-manager boundaries explicit.
- Supabase migration history includes three 4 November migrations: `competition_checklists_tournament_scope`, `secure_messaging_and_coach_rpcs`, and `enforce_announcement_audience_reads`. The corresponding 4 November SQL files were not present in the GitHub `main` recursive tree when checked. Reconcile and commit the exact applied migration source before further schema changes.
- The live Supabase Security Advisor still reports authenticated-callable `SECURITY DEFINER` functions and leaked-password protection disabled. A function-name/definition screen is not a substitute for wrong-user authorization tests.
- The audit snapshot reports no real-device push or two-account messaging acceptance, and a stale Netlify deployment. Recheck the latest deployment and workflow artifacts before release.

## Pilot feature inventory observed in the repository

This is a code-presence screen only; each item still needs end-to-end and authorization acceptance:

- **Tournament checklist:** `competition_checklists` is present in the schema and used by the Mobile Compete/checklist screens. The live database also records the 4 November tournament-scope migration.
- **Coach attendance:** the Mobile Coach Training screen contains a bulk “mark all present” action and individual present/absent toggles using `training_group_attendance`. Verify correction states, audit history and session locking on real accounts.
- **Announcements:** `announcement_reads` is used by the Mobile announcement overlay. Verify audience enforcement and seen-state reporting for coach/academy users.
- **Parent view:** no parent/guardian relationship table was found in the current public schema inventory; the current parent-approval email setup is not itself a read-only parent dashboard. This remains unimplemented/unverified and requires a properly scoped relationship model.
- **Needs-attention dashboard:** no implementation was found by repository search for the missed-session/tournament/injury triage view. Treat as outstanding until a source-code and role-boundary review confirms otherwise.

## Gate 0 — repository and migration integrity

- [x] Create an isolated execution branch from the observed `main` commit.
- [x] Align root README install/test commands with pnpm workspace CI; keep Android npm commands scoped to `AthleteN-Mobile`.
- [x] Remove `test-temp.txt`, `netlify-trigger.txt`, and `netlify-trigger-2.txt` (confirmed they were only temporary trigger/test text files; no workflow references were found in the repository tree).
- [ ] Consolidate `test/` and `tests/` without losing tests or changing test discovery.
- [ ] Reconcile the three 4 November applied Supabase migrations with exact, reviewed SQL source files in Git.
- [ ] Confirm branch protection and required CI checks on `main`.
- [ ] Correct the GitHub repository description to “Web and Android platform” (requires repository metadata write capability).

## Gate 1 — security and privacy (must pass before pilot)

- [ ] Enable Supabase Auth leaked-password protection in project Auth security settings; verify the setting after saving.
- [ ] Review every authenticated-callable `SECURITY DEFINER` function, starting with messaging, athlete records/documents, attendance, then memberships/roles. Record purpose, caller identity, relationship ownership, input validation, search path, grants, returned columns and wrong-user tests.
- [ ] Add automated negative and positive authorization tests for each reviewed function. Verify cross-athlete, cross-coach, cross-academy, removed-membership and self-role/plan escalation cases.
- [ ] Verify all exposed tables have RLS and review policy overlaps using the actual intended access model. Do not bulk-delete indexes or combine policies from advisor notices alone.
- [ ] Verify private Storage access and object ownership for athlete documents and message attachments.
- [ ] Finalize youth privacy/safeguarding policy, guardian-consent workflow, data retention/deletion procedure, administrator visibility rules, and report/block process for coach-to-minor messaging. Obtain qualified adult/legal review before pilot data collection.
- [ ] Keep injury/weight features non-medical. Do not use “over target weight” alerts or weight-cut pressure as youth-athlete attention triggers.

## Gate 2 — core pilot workflows

Only ship the five pilot workflows from the audit, with the safety/operational details below:

1. **Coach one-tap attendance:** class-level attendance creation plus per-athlete present/absent/late correction, audit history and undo.
2. **Announcements:** audience-scoped delivery, per-athlete seen state, and coach/academy visibility limited to their authorized audience.
3. **Tournament event page:** athlete-specific entry, weigh-in time, document and travel checklist; keep checklist rows scoped to the correct athlete/event/academy.
4. **Coach “needs attention”:** missed two or more sessions, tournament within 14 days, and open injury record for authorized athletes. Do not generate weight-target alerts.
5. **Parent read-only view:** only explicitly linked child records; no editing, messaging impersonation, or access to other athletes.

Defer fee tracking, automated WhatsApp Business messaging, advanced Kyorugi/Poomsae scoring, more AI features and football until after pilot feedback.

## Gate 3 — runtime and device acceptance

- [ ] Web: signup, email confirmation, login/logout, password reset, role routing, CRUD, refresh persistence, uploads, charts/exports and permission-denied states.
- [ ] Android: install signed release APK, signup/login/logout, password reset, deep links, role routing, camera/file permissions, offline/slow-network behavior and crash-free navigation on a physical device.
- [ ] Messaging: two distinct accounts; direct and group chats with recipient in foreground, another screen, background, terminated and offline states; exactly-once display; sent/delivered/read receipts; attachment retry without duplicate.
- [ ] Push: register device token, verify Expo ticket and receipt, closed-app delivery, generic preview, correct deep-link route, invalid-token handling and per-device logout token removal. Confirm a second device remains registered.
- [ ] Web notification behavior: only promise active-session notifications unless browser Push API/service-worker behavior is separately implemented and verified.
- [ ] Record device model, OS, app commit, test account roles, steps, expected/actual result and screenshot for each failure.

## Gate 4 — deployment and operational recovery

- [ ] Review critical/high mobile dependency paths; upgrade deliberately and rerun lockfile, TypeScript, lint, Expo Doctor and Android export checks.
- [ ] Verify the Netlify production deploy commit exactly matches the approved release commit; test the deployed URL.
- [ ] Add/verify database backup and restore procedure, deployment rollback instructions, monitoring/error reporting, and secret/key rotation ownership.
- [ ] Record monthly costs for Supabase, Netlify, AI, domain and payment provider; separate fixed, variable and one-time costs.
- [ ] Keep `FREE_LAUNCH` enabled until payment provider onboarding, monthly/yearly plan mapping, sandbox success/failure/refund/expiry/repeated-webhook tests and subscription expiry handling pass.

## Pilot schedule (single consistent timeline)

- Days 1–3: security settings, dependency triage, repository cleanup and migration-source reconciliation.
- Days 4–7: priority function review, Web/Android acceptance and physical-device messaging/push tests.
- Week 2: close pilot workflow gaps, finalize guardian consent/safeguarding, event tracking and coach onboarding.
- Weeks 3–6: four-week pilot with 10–15 athletes and 1–2 coaches; maintain existing records in parallel.
- Week 7: review usage, defects, coach feedback and willingness to pay; decide whether to continue.
- After pilot: fee tracking and WhatsApp sharing; then payment activation and second-academy validation.

## Product contract

- Web remains the full master information experience; Android remains compact and task-focused.
- Both clients use the same records, identity, entitlements and backend authorization.
- Kyorugi and Poomsae remain distinct discipline workspaces with their own labels and records.
- Charts and reports use saved data only, show date windows/units and honest empty states.
- Do not expand to football or another sport until the Taekwondo pilot has validated the core operating workflows.

## Release decision

**NOT SIGNED OFF.** This tracker does not claim production readiness. Gate 1 and Gate 3 require verified settings, automated tests and real-device evidence that cannot be inferred from repository contents or a green CI run.
