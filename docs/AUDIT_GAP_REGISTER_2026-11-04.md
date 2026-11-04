# AthleteN audit gap register — 4 November 2026

**Repository:** `NovaCode2026/AthleteN`  
**Working branch:** `audit/pilot-readiness-execution`  
**Pull request:** https://github.com/NovaCode2026/AthleteN/pull/28  
**Supabase project:** `wjegokgtrewtoopbsiol` (AthleteN, ap-south-1)  
**Status:** Conditional pilot preparation only. This is not a production release approval.

This register supplements the PDF audit and records the code, live database, workflow and policy facts checked on 4 November 2026. It separates implementation from acceptance evidence.

## Work added on the execution branch

- Coach Command Center **Needs attention** panel:
  - two or more explicitly recorded absences in the preceding 30 days;
  - upcoming athlete competitions within 14 days;
  - open injury follow-up flags without exposing injury titles, notes or severity;
  - no weight-target alerts for youth athletes.
- Regression tests for the coach-attention thresholds, attendance foundations, announcement read tracking and no-weight-alert rule.
- Root/web package manager standardised to pnpm 10.30.3; the isolated Android app continues to use npm.
- Dependency coverage for both package ecosystems through Dependabot and a scheduled/PR-triggered audit artifact workflow.
- Android mobile configuration regression tests covering app identity/deep-link configuration, auth callback/reset routes, sign-out token cleanup, physical-device push permission handling and competition checklist scoping.
- The existing mobile quality workflow now also runs the new mobile tests and retains the Android JavaScript export as a short-lived artifact. Its existing checks include Expo Doctor, TypeScript, ESLint and Android bundle export.
- Obsolete root Netlify trigger files removed.

## What automated CI proves

The web CI run observed green on commit `e83577b76d904621ff03894750289043d05ea171`: the repository test command and production web build both completed successfully. That result is for that exact commit, not for later branch changes.

The Mobile Check and CodeQL workflows were observed running for a previous branch head while this register was prepared. The new mobile config test and workflow update must complete on the final PR head before merge. CI does not test real-world auth delivery, notification delivery, user permissions against two separate accounts, or a signed APK installation.

## Live Supabase observations

Read-only inspection of the production project found:

- Project status: `ACTIVE_HEALTHY`.
- Public schema contains 86 SECURITY DEFINER routines; 61 are executable by the `authenticated` role according to PostgreSQL privilege inspection.
- All 61 authenticated-callable routines returned a configured `search_path` in the static inventory query and their definitions referenced `auth.uid()`. These two properties alone do not prove that every function checks the correct target user, role, academy, tenant or record.
- Supabase Security Advisor still reports 61 authenticated-executable SECURITY DEFINER functions. This is a review warning, not proof that all 61 functions are exploitable. Each function needs a business-purpose review and negative/positive authorization tests.
- Security Advisor reports `pg_net` installed in the `public` schema. Do not move the extension without checking dependencies and validating notification dispatch.
- The live `coach_athlete_links` INSERT policy permits an authenticated caller to insert a row where `coach_user_id = auth.uid()` and `status = 'active'`. The coach dashboard currently performs a direct insert. This does not, by itself, demonstrate athlete acceptance. Replace it with a secure invite/accept lifecycle before broad pilot use, including coach, academy-admin and athlete ownership checks.
- `competition_checklists` has owner-managed writes; connected team members have read access through `can_view_athlete(user_id)`. Do not give coaches blanket write access without an explicit relationship/role check and corresponding RLS tests.
- Published announcements can be read according to audience rules; current INSERT/UPDATE/DELETE policies are platform-admin-only. `announcement_reads` policies expose each user's own read rows. This is not yet an academy-scoped coach publisher plus sender-side, academy-scoped read-summary workflow.
- No dedicated parent/guardian account relationship or guardian-link table was found in the public schema. The current `age_verifications` and active `start-parent-approval` / `approve-parent` Edge Functions implement an email-token age-approval step. They do not create a parent account relationship or a parent read-only dashboard.
- The production migration history already contains the 4 November tournament checklist scope, messaging/coach RPC hardening and announcement audience-read migrations. Do not re-run historical schema or policy SQL.

## Remaining release blockers

### P0 — before any minors' pilot

1. **Auth leaked-password protection:** It was reported OFF in the PDF audit. This setting was not changed or verifiably read by the available project tooling. An authorised project operator must enable it in Supabase Dashboard → Authentication → Security, then verify the resulting setting.
2. **Coach/athlete relationship lifecycle:** replace direct active-link insertion with a verified invitation/acceptance/revocation lifecycle; enforce it in database policies/RPCs, not only in UI. Test unrelated coach, unrelated athlete, academy staff, revoked links and pending invitations.
3. **SECURITY DEFINER review:** manually review all 61 authenticated-callable functions, prioritising role/plan changes, academy membership, athlete lookup, training attendance, coach/athlete linking, messaging, documents, age verification and AI entitlements. Test wrong-user and wrong-academy cases using separate accounts. Do not blindly revoke all execution grants.
4. **Children's privacy and consent:** a responsible adult/operator and qualified Indian privacy/legal reviewer must verify the current approval procedure, Privacy Policy, retention/deletion/access process, grievance/contact details, guardian relationship design and safeguarding policy. Email-token approval alone is not a legal-compliance certificate.
5. **Android release acceptance:** build a signed APK/AAB using the correct release credentials; install on a physical device; verify login, reset, sign-out/account switching, notifications and offline recovery. An Expo JavaScript export is not an APK.

### P1 — before pilot sign-off

6. **Mobile CI final head:** wait for Mobile Check, web CI, CodeQL and dependency-audit workflows to finish on the exact final PR head. Fix any failures and review the actual dependency JSON artifacts; do not use blind force upgrades.
7. **Messaging and push:** use two test accounts and physical devices. Test foreground, background, terminated app, denied permission, token refresh, offline send/retry, delivery/read receipts, report/block and account switching. Verify Expo ticket/receipt outcomes and Supabase logs; token registration alone is not delivery proof.
8. **Announcements:** implement and verify academy-scoped coach publishing, recipient audience checks and sender read summaries without broadening users' read access to other recipients' rows.
9. **Tournament workflow:** the athlete's mobile competition screens and checklist table exist. Verify the event-page/checklist end-to-end on web and mobile; implement coach-assigned checklist items only with tightly scoped RLS and acceptance tests.
10. **Netlify:** verify the live `athleten` deployment points to the intended merged `main` commit; test auth redirects, reset, refresh/deep links and environment configuration. No production deployment was made by this branch work.
11. **Operations:** run a database backup/restore rehearsal, write rollback steps, verify monitoring/alerts and confirm the owner for incident and privacy requests.

### P2 — after a successful pilot

12. Validate the PDF's 10–15 athlete / 1–2 coach pilot with one academy for the full planned period, record coach retention and willingness to pay, and calculate actual operating costs.
13. Keep paid checkout disabled (`FREE_LAUNCH`) until monthly/yearly plan IDs, sandbox success/failure/refund/expiry/webhook cases and required operator/legal disclosures are verified.
14. Defer second-sport expansion, advanced scoring and unrelated feature growth until the first academy pilot demonstrates reliable use.

## Required final merge gate

Merge PR #28 only after the final PR head has passing web and mobile quality workflows, cleanly reviewed dependency reports, an explicit reviewer-approved SECURITY DEFINER remediation plan, the Auth setting is verified, and the coach/athlete access-control issue is fixed and tested. Production pilot remains blocked until the adult/legal, signed-device, real-account and operational checks above are complete.
