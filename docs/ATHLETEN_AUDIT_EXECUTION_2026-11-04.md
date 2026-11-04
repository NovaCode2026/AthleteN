# AthleteN — Audit Execution Board

**Date:** 4 November 2026  
**Source of truth:** `AthleteN Audit, Action Plan and Pilot Kit.pdf` plus the 3 November implementation-status snapshot and live repository / Supabase checks.  
**Working branch:** `codex/audit-pilot-execution-2026-11-04`  
**Decision:** Pilot work is in progress. This document is not a production sign-off.

## 1. Product operating model

- **Web is the master information and management workspace:** complete athlete, coach, academy and admin records; graphs; analytics; history; reports; detailed configuration.
- **Android is the compact operational companion:** daily checks, training capture, attendance, event preparation, messaging, notifications and essential role-authorized work.
- Both clients use the same Supabase records, identities, permissions and entitlements. Screen density and navigation may differ; saved facts and authorization must not.
- The current sport is Taekwondo. Kyorugi and Poomsae remain separate discipline workflows. Do not activate Football or another sport in this pilot.

## 2. Changes implemented on this branch

| Area | Change | Verification state |
|---|---|---|
| Coach attention | Added a Web Coach 'Needs attention' view using linked-athlete records: 2+ absences in the previous 30 days, a tournament in the next 14 days, or an injury record not marked resolved. | Code added; CI and account-level testing pending |
| Youth safety | The attention view does not generate body-weight alerts or weight-cut pressure. Injury items are reminders for an appropriate private follow-up, not medical conclusions. | Code added; safeguarding review still required |
| Coach attendance | Android group attendance now checks membership and attendance reads, confirms bulk mark-present, waits for a successful database write before changing local status, and reports errors. | Code added; physical-device acceptance pending |
| Tournament preparation | Added nullable `competition_checklists.tournament_id` with an index and cascade relationship to the athlete's tournament. Existing unassigned checklist items remain valid. | Supabase migration applied and column/index verified |
| Web event checklist | Web Competition Mode scopes each athlete's checklist to the selected tournament and supports entry, weigh-in, documents, travel, equipment and other categories. | Code added; CI pending |
| Android event checklist | Android Compete scopes an athlete's checklist to the selected tournament and exposes the same preparation categories. | Code added; CI pending |
| Repository cleanup | Removed `test-temp.txt`, `netlify-trigger.txt` and `netlify-trigger-2.txt`. | Confirmed removed from branch |
| Package management | Root Web and Netlify now use pnpm 10.30.3 and the root `pnpm-lock.yaml`; the separate Expo project continues using `npm ci` and its own `package-lock.json`. | Files updated; CI pending |
| Mobile dependency visibility | Mobile CI prints both full-tree and production-only npm audit detail. The branch tests two patch-level overrides (`shell-quote@1.11.0`, `source-map-js@1.2.2`) without changing Expo SDK 57. | Audit runs completed; regenerated lockfile and latest CI still pending |
| Messaging RPCs | Added database-side age-approval, bounded profile-search, blocked-pair, authentication and coach-ownership checks for sensitive messaging/coach RPCs. | Migration applied; regression tests added; full 61-function review remains open |
| Announcement audience | Replaced the broad age-approval read bypass with role/audience-aware RLS for published announcements (`all`, `athletes`, `coaches`, `academies`, `admins`). | Migration applied; live policy verified |
| Documentation | Root README, development, deployment, documentation hub and changelog updated to describe the Web-master / Android-companion model and correct package-manager commands. | Files updated |

## 3. Mobile dependency review (4 November CI)

The first full-tree npm audit reported **36 findings**: 1 critical, 7 high, 26 moderate and 2 low. The production-only `npm audit --omit=dev` run reported **23 findings**: 1 critical, 7 high, 13 moderate and 2 low. The production-only tree still contains Expo CLI/configuration and build tooling through the Expo dependency graph; it is not a direct inventory of code shipped inside the APK.

The branch adds patch-level overrides for `shell-quote@1.11.0` (the published fix for the critical GHSA-pqg4-j6r4-53mv) and `source-map-js@1.2.2` (the published fix for GHSA-68fv-2mgg-jv7q). A CI step regenerates a candidate lockfile to test those overrides. Do not treat these as resolved until the candidate lockfile is committed, the app checks pass, and a fresh audit confirms the resulting counts. Node-forge, decode-uri-component, Zod, minimatch and Expo SDK 57 transitive findings remain under review. Do not downgrade Expo 57 to Expo 51 or force major package changes as an automated npm fix.

## 3. Features already present before this branch

- `announcement_reads` exists and the Android announcement overlay records the signed-in user's read receipt. Announcement RLS now checks the announcement audience against the authenticated profile role. This branch does not claim that a coach/admin-wide 'who has seen it' dashboard is complete.
- Parent email approval exists through the age-verification flow. The live schema has a parent email field but no verified guardian-account relationship. A read-only guardian dashboard is therefore **not** enabled by this change.
- Coach group training, recurring sessions, attendance statuses (present, late, absent, excused), session locking and cancellation notices already exist.
- Messaging persistence, sent/delivered/read receipt handling and generic notification previews were implemented in the 3 November release work. Real-device acceptance is still open.
- Payments remain gated by `FREE_LAUNCH`. Do not enable paid checkout as part of the pilot.

## 4. Live production checks on 4 November

| Check | Observed state | Action |
|---|---|---|
| Supabase project | `ACTIVE_HEALTHY`, PostgreSQL 17.6 | Continue monitoring |
| Public database RLS | 88 public tables; no public table found without RLS | Preserve; verify policies for each new data path |
| Auth leaked-password protection | Disabled; Security Advisor warning remains | Supabase project owner must enable it in Auth security settings |
| Authenticated `SECURITY DEFINER` functions | 61 warnings remain. A static inventory confirmed pinned search paths, `auth.uid()` references and no execute grants to anon/PUBLIC; it is not a substitute for per-function ownership/relationship review. | Sensitive messaging and coach RPCs were hardened with explicit caller/approval/ownership checks. All 61 still require manual wrong-user/right-user tests. Do not mass-revoke. |
| Extension placement | `pg_net` remains installed in `public` and is reported by the Security Advisor | Review with the Supabase project owner before any move; it is not changed here |
| Performance Advisor | 81 unused-index notices and 121 multiple-permissive-policy notices | Review against workload and access model; no blind index/policy deletion |
| Device push tokens | No registered production device was observed in the release snapshot | Register a real device, send a test, inspect Expo receipts and confirm token lifecycle |
| Netlify production | Current published deploy is ready but points to the 29 October commit, behind current `main` | Deploy current reviewed `main` and verify the deployed commit |
| Android APK | A successful GitHub APK artifact exists from workflow run `41684263568`; artifact is not expired | Download/install on a physical Android device and complete the test plan |

## 5. Remaining release blockers — do not call production-ready yet

### Gate 1 — before the academy pilot

- [ ] Supabase owner enables leaked-password protection and confirms the Security Advisor warning is gone.
- [ ] Commit and validate the regenerated mobile lockfile for the patch-level overrides; review the remaining production-only and full-tree critical/high advisories. Make a justified dependency audit a blocking CI gate only after SDK-compatible fixes are proven. No blind `--force` upgrades.
- [ ] Complete a manual review of all 61 authenticated-callable `SECURITY DEFINER` functions, with wrong-user and correct-user tests for the sensitive functions.
- [ ] Deploy the reviewed `main` commit to Netlify and verify the deployment SHA, login, password-reset route and main role workspaces.
- [ ] Install the APK on a physical Android device; verify startup, signup/login, email confirmation, password reset, logout and role navigation.
- [ ] Run two-account messaging tests in foreground, background, terminated and offline/online states; verify no duplicates, attachments, retry behavior and sent/delivered/read receipts.
- [ ] Verify real push registration, delivery with app closed, generic preview, correct tap route, logout removing only the current device token, and Expo receipt/invalid-token handling.
- [ ] Finalize parent/guardian consent, retention duration, contact for data requests and the minor-messaging supervision rule. Obtain appropriate adult/legal review before collecting pilot children's data.
- [ ] Back up the database and demonstrate a restore; document rollback for Web and Android releases.

### Gate 1 — additional safety and privacy work

- A parent email address is not the same as a verified parent account. Do not expose a child's records to a guessed or email-only guardian link.
- A parent read-only dashboard requires a verified guardian identity/link, consent and withdrawal lifecycle, child/guardian relationship RLS, and tests proving one guardian cannot see another child's data.
- Coach-visible announcement read counts require an explicit author/audience model and row-level policy. Existing per-user receipts must not be made broadly readable.
- Keep injury and health information restricted to people with a legitimate relationship. AthleteN is not a medical service.
- The pilot 'Needs attention' list deliberately avoids automatic target-weight and weight-cut warnings for youth athletes.

### Gate 2 — after week 4

- [ ] Coach uses AthleteN without repeated reminders.
- [ ] Coach identifies the workflows they would miss if the pilot ended.
- [ ] Review athlete/parent adoption, attendance completion, announcement visibility and event checklist completion.
- [ ] Ask whether the academy would pay and which existing admin task provides the most value.
- [ ] Do not add new features during the review week; decide from observed usage.

### Gate 3 — before charging

- [ ] Keep `FREE_LAUNCH` enabled until payment-provider credentials and recurring plan IDs are configured.
- [ ] Test sandbox success, failure, refund, expiry, duplicate webhook and monthly/yearly mappings.
- [ ] Verify webhook signatures and subscription activation only after confirmed provider payment.
- [ ] Calculate actual monthly infra, database, storage, messaging, AI and payment costs.

### Gate 4 — before expanding

- [ ] A second academy completes a successful pilot.
- [ ] Only then evaluate extra subscription tiers or another sport.

## 6. Four-week pilot schedule (corrected)

The source PDF described both weeks 1–4 and weeks 3–6 as the pilot. Use one consistent schedule:

| Timing | Activity |
|---|---|
| Before Week 1 | Complete Gate 1, agree pilot scope and safeguarding, obtain consent, choose 10–15 athletes and 1–2 coaches, retain existing records in parallel |
| Week 1 | Onboard in person; coach uses group attendance at each class; log failures and fix blockers |
| Week 2 | Use announcements and one tournament page with its per-athlete checklist; send WhatsApp messages that point to AthleteN |
| Week 3 | Review coach follow-up list and parent/guardian process only if the verified guardian portal and consent gates are complete; otherwise keep parent access out of the pilot |
| Week 4 | Freeze features, review counts and interview coach/athletes/guardians; decide whether to continue |

Do not use real minors' data until the consent, privacy and safeguarding gates are approved. Keep the academy's existing record system in parallel during the test.

## 7. Costs and measurement

Before the pilot, fill actual amounts for Supabase, Netlify, domain, storage, push/messaging, AI report runs, payment gateway (for later), tax and one-time Play Store fees. Separate monthly recurring costs from one-time setup costs. Calculate break-even using net contribution per paying academy, not gross subscription price.

Track aggregate counts only where possible: coach weekly active use, sessions with attendance marked, athletes active per week, announcements sent/read, event checklist completion, crashes and push delivery outcomes. Do not log private message content as product analytics.

## 8. Repository and owner actions still required

- Set the GitHub repository description to `Web and Android platform`.
- Enable branch protection for `main` and require CI before merge.
- Review the Mobile Dependency Audit result after this branch's first CI run.
- Merge this branch only after Web and Mobile CI pass and reviewed fixes are complete.
- Netlify production deployment is an owner action; the connected Netlify tools can inspect deploys but do not provide a deploy trigger.
- Physical-device testing and parent/guardian/legal sign-off require real people and cannot be certified by CI.

## 9. Release language

Use these states precisely:

- **Implemented:** code or schema exists.
- **CI passed:** the branch's automated checks passed.
- **Deployed:** production host reports the matching commit.
- **Device verified:** the installed build passed the recorded physical-device test.
- **Pilot accepted:** the academy completed the agreed pilot and gave feedback.
- **Production signed off:** all required security, privacy, reliability, deployment and device gates have evidence.

A successful build or APK artifact is not, by itself, production sign-off.

## 10. CI evidence and current branch status

- The 4 November workflow run on commit `e4747776461614d1060d52bd2b9c7175a8715179` completed successfully for Web CI, CodeQL and Mobile Check. Mobile Check reported Expo Doctor 21/21, TypeScript, lint and Android bundle export passing.
- Subsequent commits add the announcement-audience migration, dependency overrides and lockfile regeneration step. Treat those newest commits as pending fresh verification until their PR workflows complete.
- PR #22 remains a draft and is intentionally not merged while dependency, security, deployment and physical-device gates remain open.
- Supabase migrations applied on 4 November: `20261104101337_competition_checklists_tournament_scope`, `20261104103042_secure_messaging_and_coach_rpcs`, and `20261104103647_enforce_announcement_audience_reads`.
