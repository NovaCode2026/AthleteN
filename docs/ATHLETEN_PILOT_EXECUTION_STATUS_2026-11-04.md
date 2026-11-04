# AthleteN pilot-readiness execution tracker

**Snapshot:** 4 November 2026  
**Basis:** *AthleteN: Audit, Action Plan and Pilot Kit*, prepared 4 November 2026  
**Working branch:** `hardening/pilot-readiness-2026-11-04`  
**Production branch:** `main`  
**Release decision:** **NOT SIGNED OFF**

This tracker distinguishes (1) changes committed to the hardening branch, (2) facts observed in the connected production systems, and (3) work that still requires code, adult/legal review, or physical-device acceptance. A code change in this branch is not a production deployment or a completed acceptance test.

## Changes committed to the hardening branch

- Removed `test-temp.txt`, `netlify-trigger.txt` and `netlify-trigger-2.txt`.
- Consolidated the root smoke test under `tests/` and added pilot regression checks.
- Declared `pnpm@10.30.3` for the root Web workspace and aligned root README, validation script, Netlify build/dev commands, and deployment guide with `pnpm-lock.yaml`.
- Kept `AthleteN-Mobile/` as a separate npm project with its own `package-lock.json`.
- Added the Android package directory to weekly Dependabot updates.
- Fixed the Android competition cockpit so its open checklist is scoped to the selected tournament. It no longer mixes incomplete checklist rows from unrelated events.
- Added a Web Coach class-attendance panel with one-tap marking of *unmarked* athletes, individual Present/Late/Absent/Excused correction, and a lock action. Bulk marking preserves existing statuses.
- Added a database migration to mirror coach training-group attendance into `attendance_records`, so athlete history and Web analytics can use the same event. The migration also moves the session lock/cancel guard into database RLS policies.

**Important:** the attendance migration is committed to this branch only. It has not been applied to production. The matching CI and database verification must pass before applying it.

## Production facts checked on 4 November

### Netlify

The existing `athleten` site is still published from the 29 October 2026 deployment:

- Published deploy: `6ae372d8d6582ed467b6b3cc`
- Commit: `6137212178dfa49a0cc19711e681d692b120b551`
- Branch: `main`
- State: `ready`
- URL: `https://athleten.netlify.app`

The current GitHub `main` revision inspected for this work is `21f19ae5c8277b0646c7831bc44a28c406c4d05a`. The production deploy therefore predates that revision. The hardening branch must pass CI and be merged before a new production deploy is considered.

### Supabase

The connected project `wjegokgtrewtoopbsiol` reports `ACTIVE_HEALTHY` (Mumbai region).

The live Security Advisor still reports:
- Leaked-password protection disabled.
- Authenticated-callable `SECURITY DEFINER` functions that require manual authorization review.
- A `pg_net` extension/schema advisory.

The function ACL inventory observed for the reviewed public functions grants execution to `authenticated` and `service_role` where applicable, not `anon` or `PUBLIC`. This is a useful boundary, but it does **not** prove that each function enforces the correct athlete/coach/academy relationship or avoids exposing private columns. The manual 61-function review is still open.

The live migration history includes these 4 November entries:

- `20261104101337_competition_checklists_tournament_scope`
- `20261104103042_secure_messaging_and_coach_rpcs`
- `20261104103647_enforce_announcement_audience_reads`

Their matching SQL source files were not present in the inspected GitHub `main` tree. This is a migration-source drift issue: do not claim a fresh database can be rebuilt reproducibly until the exact SQL files are reconciled from the live migration history/authoritative source.

The `device_push_tokens` table currently has zero rows. The mobile AuthContext does call Expo push registration at sign-in, but this does not replace the required physical-device permission, token, delivery, tap-through, and logout tests.

## Pilot feature status

| PDF pilot item | Current status |
|---|---|
| One-tap coach attendance | Android implementation exists; Web panel added in this branch; shared analytics mirror and database lock enforcement are in a new, unapplied migration |
| Announcements with coach-visible seen ticks | Incomplete. Global announcement overlay and per-user `announcement_reads` exist, but coach-published group announcements and coach-visible aggregate receipts are not implemented |
| Tournament page with athlete-specific checklist | Athlete competition cockpit exists; event checklist query is now scoped by tournament in this branch; coach/academy event checklist workflow still needs acceptance |
| Coach “needs attention” view | Not implemented. Planned signals: 2+ recorded absences in a recent period, competition in the next 14 days, and a non-closed injury record visible to that coach |
| Parent read-only view | Not implemented. No explicit guardian-to-athlete relationship table was found in the live public schema. Do not expose athlete data to a parent account until guardian identity/linkage and consent are verified |

### Youth-safety adjustment

The PDF includes an “over target weight” signal. This project serves young athletes, so this tracker does not implement a weight-pressure or weight-target alert. If a genuine competition eligibility issue needs follow-up, it must be framed neutrally, be visible only to the authorised athlete/guardian/coach roles, and never recommend rapid weight loss or restriction.

Coach-to-minor messaging remains gated by the existing age-approval checks. Before a pilot, finalise a safeguarding rule, reporting/blocking process, and whether/when academy administrators can review reported conversations.

## Gate 1 — before any academy pilot

- [ ] Enable Supabase Auth leaked-password protection in the project's Auth settings.
- [ ] Review the 36 mobile dependency advisories (including 1 critical and 7 high reported by the audit); upgrade only compatible packages and regenerate the lockfile. Do not use blind force-upgrades.
- [ ] Review all 61 public `SECURITY DEFINER` functions, prioritising messaging, athlete records/documents, and attendance; add wrong-user and right-user tests.
- [ ] Reconcile the three 4 November live migrations into version-controlled SQL source.
- [ ] Merge the hardening branch only after CI passes; deploy the resulting `main` commit to the existing `athleten` Netlify site.
- [ ] Build/install the Android release artifact on a physical phone and record device model, Android version, app commit and test evidence.
- [ ] Test push on a physical device: token row appears, notification arrives with app closed, preview is generic, route opens correctly, logout removes only that device token, and another device remains registered.
- [ ] Test direct and group messaging with separate coach/athlete accounts in foreground, background, closed-app and offline/reconnect states; verify no duplicates and Sent/Delivered/Read transitions.
- [ ] Finalise the guardian consent text, retention period, data-request contact, minor-messaging rule and privacy-policy wording with a parent/guardian and qualified adult/legal reviewer.
- [ ] Add privacy-friendly event counters and fill in actual infrastructure/AI/payment cost values.

## Gate 2 — after the four-week pilot

Use 10–15 athletes and 1–2 coaches, with current paper/WhatsApp records retained in parallel during the first weeks. Collect coach feedback and actual usage. Do not add features during the final review week.

## Gate 3 — before charging

Keep `FREE_LAUNCH` enabled. Do not enable paid checkout until payment provider onboarding, terms/refunds, sandbox success/failure/refund/expiry/repeated-webhook cases, and monthly/yearly plan mapping all pass.

## Gate 4 — before expansion

A second academy must use AthleteN successfully before adding more plans or a second sport. Football remains deferred.

## Timeline adopted from page 11 of the audit

- **Days 1–3:** security toggles, dependency review, repository cleanup, deploy current `main`.
- **Days 4–7:** physical-device tests, bug fixes, priority `SECURITY DEFINER` review.
- **Week 2:** pilot features, coach meeting, consent finalisation, event tracking.
- **Weeks 3–6:** four-week academy pilot.
- **Week 7:** review and Gate 2 decision.
- **After:** fee tracking, WhatsApp sharing, payment readiness and second academy.

Page 6 of the PDF describes the pilot as weeks 1–4 while page 11 places it in weeks 3–6. This tracker adopts the page 11 overall timeline so the pre-pilot engineering work has its own window.

## Manual action that cannot be completed by a source-code commit

Leaked-password protection is a Supabase Auth project setting, not a SQL migration. Enable it in the project's Auth settings under password security, then rerun the Security Advisor. Supabase's current guide documents the setting at [Password security](https://supabase.com/docs/guides/auth/password-security).

---

**Release rule:** Do not label AthleteN production-ready until the database migration reconciliation, security review, clean deployment, physical Android tests, messaging/push acceptance, and youth consent/safeguarding gates have evidence attached.
