# AthleteN Audit Execution — 4 November 2026

**Repository:** `NovaCode2026/AthleteN`  
**Execution branch:** `audit/pilot-readiness-execution`  
**Pull request:** [#28](https://github.com/NovaCode2026/AthleteN/pull/28)  
**Production status:** Not signed off. This document records branch work and independently observed blockers; it is not a release certificate.

## Completed in this branch

- Added the web Coach Command Center **Needs attention** panel.
  - Counts only explicitly recorded `absent` attendance states in the preceding 30 days; two or more creates a follow-up.
  - Lists linked-athlete tournaments in the next 14 days.
  - Shows open injury-status follow-ups without displaying injury titles, notes or severity.
  - Does not create weight-target alerts for youth athletes.
  - An unmarked session is not treated as an absence.
- Added regression tests for the coach attention thresholds and for existing attendance/announcement foundations.
- Consolidated the smoke test under `tests/`.
- Standardised root/web package management on pnpm 10.30.3 and aligned Netlify root commands and documentation. The separate Android project continues to use its own npm lockfile.
- Removed obsolete root `netlify-trigger.txt` and `netlify-trigger-2.txt`.
- Added Dependabot updates for the Android npm project.
- Added a scheduled/lockfile-triggered workflow that captures web and Android dependency audit JSON reports as artifacts. The audit report is informational and does not silently auto-upgrade dependencies.

## Existing foundations confirmed

Source and live schema review confirmed these foundations already exist:

- One-tap **Mark all present** in the Android coach training flow, backed by `training_group_attendance`.
- `announcement_reads` supports per-user read tracking; the Android announcement overlay upserts a read record.
- `competition_checklists` already has a nullable `tournament_id` foreign key.
- Android registers Expo push tokens from a physical device and removes only the signed-out device token.

These foundations do not establish full pilot acceptance. Coach/academy announcement publishing with scoped read summaries, coach-managed tournament checklist permissions, guardian-linked read-only access, and real-device push are still incomplete or unverified.

## Current blockers and required owner actions

1. **Supabase Auth:** Leaked Password Protection was observed disabled. Enable it in Supabase Dashboard → Authentication → Security and verify the setting. This cannot be changed by a repository commit.
2. **SECURITY DEFINER review:** Supabase Security Advisor reports 61 authenticated-executable functions. A live inventory found 86 public SECURITY DEFINER routines overall. Static inspection is not authorization proof; manually test wrong-user and right-user cases, prioritising messaging, athlete records/documents, attendance, memberships and role functions. No bulk function rewrite has been performed.
3. **Dependency remediation:** The prior mobile install reported 36 advisories (including 1 critical and 7 high). New scheduled audit reports and Dependabot coverage are in place; exact package paths still need review and safe upgrades.
4. **Messaging and push:** Two-account, background, terminated-app and offline/retry tests have not been completed on physical devices. The production token table was reported empty in the 3 November release snapshot; register a real device and inspect Expo ticket/receipt outcomes.
5. **Parent/guardian access:** Existing age-verification email/token flow is not a substitute for an explicit guardian-to-athlete account relationship and a least-privilege parent view. Do not enable a parent dashboard until relationship verification, consent, revocation, data scope and safeguarding rules are complete.
6. **Announcements:** Existing platform announcements and individual read records exist. Academy-scoped coach publishing and a sender-side read summary still need implementation and authorization tests.
7. **Tournament event checklist:** Athlete checklist rows can already be linked to tournaments. Coach writes are not yet implemented as a dedicated verified workflow.
8. **Deployment/device acceptance:** Netlify's published site was reported behind the release candidate in the 3 November status. Verify the current production commit, then install the signed APK on a physical Android device and complete the acceptance checklist.
9. **Privacy and legal review:** Complete the guardian consent copy, retention period, messaging policy, privacy contact and deletion/access process with the responsible adult/operator and qualified Indian privacy/legal reviewer before collecting pilot minors' data.
10. **Pilot validation:** Start only after Gate 1. Use 10–15 athletes and 1–2 coaches, keep the current record system in parallel initially, and collect feedback throughout the four-week pilot.

## Explicitly deferred

- Paid checkout and disabling `FREE_LAUNCH`.
- Additional paid plans beyond the initial pilot set.
- Automated WhatsApp Business messaging.
- Advanced per-round scoring / advanced Poomsae evaluation.
- Additional AI features.
- Football or another second sport.

## CI status

The first PR CI run found one stale repository-health assertion that still expected the old npm check command; 55 of 56 tests passed, including the new pilot regression tests. The assertion was corrected on the branch. CodeQL passed. A fresh CI result for the corrected head must be observed before merging.

## Release rule

Do not merge to `main`, deploy, or describe AthleteN as production-ready solely because these branch changes exist. Require passing web CI and mobile checks, review the dependency reports, complete the security review and Auth setting, verify minors' consent and access scope, then pass the real-device and real-account acceptance tests.
