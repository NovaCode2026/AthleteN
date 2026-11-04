# AthleteN Reliability Release Gate — 4 November 2026

**Release decision: NOT APPROVED FOR A LIVE PILOT YET**

This is a dated evidence snapshot of the connected GitHub, Supabase and Netlify state. It is deliberately separate from the 3 November implementation-status report. A green CI run, a deploy marked ready, or a feature visible in the interface does not by itself satisfy the acceptance gates below.

## 1. Current verified baseline

| Area | Observed state | What this proves |
|---|---|---|
| Repository | `NovaCode2026/AthleteN`, default branch `main` | The source repository is accessible |
| Main protection | Disabled when inspected | Direct pushes to `main` are not blocked by required checks |
| Root package manager | pnpm lockfile and workspace exist; CI uses pnpm 10.30.3 | Root setup and CI should use the same pinned toolchain |
| Android package manager | Separate `AthleteN-Mobile/package-lock.json` | Android should continue using `npm ci` in its own directory |
| Supabase project | `ACTIVE_HEALTHY`, PostgreSQL 17 | The database service is responding |
| Public tables | 89 of 89 have Row Level Security enabled | RLS is enabled on every public table; policy correctness still needs authorization tests |
| Security-definer functions | 86 in `public`; 61 executable by `authenticated`; 0 executable by `anon`; 0 missing a pinned search path in the read-only catalog check | Anonymous execution and missing search paths were not found in this screen; each callable function still needs manual authorization review |
| Push registrations | 0 rows in `device_push_tokens` and 0 in `push_tokens` at inspection | No real device push delivery has been proven from production registrations |
| Message receipts | 0 rows in `message_receipts` at inspection | No real-device delivery/read-receipt acceptance is evidenced by the current table snapshot |
| Netlify production | Published deploy is marked ready, but the latest observed production deploy is from 29 October 2026 | A ready old deploy is not proof that current `main` is deployed |
| Paid billing | Free Launch gate remains enabled | Paid checkout must stay disabled during the pilot |

## 2. Security and database findings

The live Supabase Security Advisor reported:

- Leaked-password protection is disabled. Enable it in Supabase Auth security settings before inviting pilot users.
- 61 authenticated-callable `SECURITY DEFINER` functions are flagged. The catalog screen confirmed none are callable by `anon`, and all have pinned search paths. This is not a substitute for reviewing every function's purpose, ownership checks, relationship checks, argument bounds, returned columns and grants.
- `pg_net` is installed in the `public` schema. Do not try to move a non-relocatable extension without a supported migration plan.
- Performance Advisor reported 121 multiple-permissive-policy warnings and 82 unused-index information notices. Do not merge policies or drop indexes solely to reduce warning counts; first prove the authorization semantics and workload impact.

### Mandatory negative authorization tests

Use two ordinary test accounts and separate coach/academy test accounts. Do not use real athletes' records for destructive testing.

- Athlete A cannot read, change or delete Athlete B's training, weight, documents, messages, competitions or reports.
- A coach cannot read or modify athletes outside their active coach-athlete relationship.
- An academy admin cannot read or modify another academy's members or records.
- Removing a coach or membership removes access on the next request, not only after a UI refresh.
- An athlete cannot assign their own role, subscription, plan, verification, admin flag or privileged profile fields.
- A Free account cannot create or read paid AI reports by calling the API directly.
- Messaging group membership, block rules, age approval and receipt acknowledgements reject the wrong actor.
- Announcement reads are recorded only for an eligible intended audience.

Record the exact SQL/RPC/function, account role, expected result and observed result for each case. Keep test data synthetic.

## 3. Source-control and migration integrity

At inspection, Supabase migration history contained three 4 November migrations that were not present in the GitHub `main` migration directory:

- `20261104101337_competition_checklists_tournament_scope`
- `20261104103042_secure_messaging_and_coach_rpcs`
- `20261104103647_enforce_announcement_audience_reads`

**Stop condition:** recover the original SQL for these migrations and commit the exact reviewed migration files (or produce a verified schema/function/policy reconciliation record) before treating GitHub migrations as a complete rebuild source. Do not create guessed replacement migrations from their names.

The reliability changes prepared in [PR #29](https://github.com/NovaCode2026/AthleteN/pull/29) are on a separate branch and are not production until CI passes and the PR is merged. They standardize root pnpm usage with Netlify and CI, correct setup documentation, prevent accidental npm publishing, consolidate the smoke tests, fix the Dependabot ecosystem identifier, add Android dependency monitoring, and run scanner regression tests on pull requests.

## 4. Release gates

### A. Source and CI

- [ ] Root CI passes from the exact PR/head SHA: frozen pnpm install, all tests and production build.
- [ ] CodeQL passes from that same SHA.
- [ ] Android checks pass: `npm ci`, Expo Doctor, TypeScript, ESLint and Android export.
- [ ] Scanner regression passes on a pull request.
- [ ] Android release APK workflow succeeds after merge (or a signed release build is produced).
- [ ] Main branch protection is enabled with required CI/CodeQL status checks and no force-pushes.
- [ ] Dependency review is completed; no unresolved critical/high production dependency advisory is accepted for the pilot.

### B. Supabase and privacy

- [ ] Enable leaked-password protection in Supabase Auth.
- [ ] Recover and reconcile the three missing 4 November migration files.
- [ ] Complete the function-by-function `SECURITY DEFINER` review and correct-actor/wrong-actor tests.
- [ ] Complete the two-account RLS and relationship-boundary tests.
- [ ] Review overlapping policies for semantic correctness; leave harmless warnings documented rather than weakening access.
- [ ] Review data minimization, retention, deletion, access requests, parental/guardian consent and the privacy notice with a qualified adult/legal reviewer before collecting data from minors.

### C. Production deployment

- [ ] Deploy the exact approved `main` SHA to Netlify.
- [ ] Verify the published deploy commit equals the approved GitHub SHA.
- [ ] Smoke-test web registration, email verification, login, password reset, role routing, logout, deep links and refresh.
- [ ] Verify server functions have the required server-only environment variables and no secret is in a client bundle.
- [ ] Keep payment checkout disabled until the provider integration and webhook lifecycle are independently accepted.

### D. Physical Android and two-account acceptance

Use two test accounts, one coach and one athlete, on a physical Android phone (and a second phone or web recipient where possible).

- [ ] Install the APK, launch, register/login, verify email, reset password, log out and log back in.
- [ ] Verify role-aware routes, deep links, camera/file permission denial and recovery, and session restoration.
- [ ] Verify a message arrives once when the recipient is in-chat, elsewhere in app, backgrounded, terminated and temporarily offline.
- [ ] Verify Sent / Delivered / Read states and group counts, plus attachment retry without duplicate messages.
- [ ] Confirm a device token is registered after permission and login; verify push arrives with app closed, generic preview, correct tap destination, Expo receipt handling and invalid-token cleanup.
- [ ] Confirm logging out removes only that device's token; another device on the same account remains registered.
- [ ] Verify notification behavior on Web while the tab is active. Do not promise background Web Push until separately implemented and tested.

### E. Pilot scope

Keep the first pilot to 10–15 athletes and 1–2 coaches, with consent and clear notice before any minor's personal data is entered. Keep existing attendance/records in parallel during the first phase and agree a named adult point of contact for pilot issues.

Pilot features to validate with the coach:

1. One-tap attendance for a class.
2. Academy announcements with a per-member "seen" state.
3. A tournament event page with each athlete's checklist.
4. A coach attention list with transparent, explainable rules.
5. A parent/guardian read-only view only after consent, access rules and visibility boundaries have been reviewed.

Do not activate paid checkout, automated WhatsApp Business messaging or a second sport during this pilot. Add features only after observing real academy usage and feedback.

## 5. Operating rule

For each release, record the source SHA, test run links, database migration state, published Netlify deploy SHA, APK artifact, test device/Android version, and open failures. A check is **PASS** only when evidence exists for the exact build being considered. Use **BLOCKED** for account/device/legal tasks that cannot be validated in CI, and **NOT TESTED** rather than guessing.

**Current overall verdict: NOT SIGNED OFF.**