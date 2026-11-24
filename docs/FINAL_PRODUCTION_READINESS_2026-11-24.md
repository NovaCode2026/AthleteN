# AthleteN Final Production-Readiness Register — 24 November 2026

## Purpose

This register starts the final post-merge readiness pass after PR #68. It is an evidence ledger, not a declaration that AthleteN is production-ready. Every item must be closed with a commit, passing CI run, SQL verification, deployment record, provider sandbox result, or documented physical-device acceptance.

Canonical launch target: 30 November 2026. If a critical security, privacy, billing, signing, migration, or acceptance gate is not satisfied, defer the paid public launch rather than bypassing the gate.

## Baseline verified for this follow-up

- Repository: `NovaCode2026/AthleteN`
- Base branch: `main`
- PR #68: merged.
- Merge commit: `7ec236cc6c1dbfd70eeb104fdd8ba68da61beef6`
- GitHub comparison at kickoff: `main` identical to the merge commit.
- Free Launch restrictions remain: paid checkout disabled; subscription cancellation disabled.
- Production Supabase project: `wjegokgtrewtoopbsiol`.
- Production AI-budget tables and subscription activation RPCs were confirmed in the previous read-only schema review.
- Production webhook receipt table/RPCs and `subscriptions.cancel_at_period_end` were absent in that review.
- Supabase migration history remains materially divergent from the repository. No blanket `db push`, reset, manual ledger edit, or wholesale migration application is permitted.
- Netlify post-merge deployment SHA and post-deploy smoke tests are **not yet verified**.
- Supabase Auth leaked/compromised-password protection was reported disabled in the previous review.
- PR #70 is a separate open security-recording PR; review it independently and avoid duplicating its change.

## Work register

| Area | Required evidence | Status at kickoff |
|---|---|---|
| Main merge and source baseline | GitHub merge record and exact main SHA | Verified for PR #68 |
| Netlify deployment | Deployment published from intended main SHA; successful build and smoke tests | Not verified after merge |
| Supabase migration reconciliation | Trusted source recovery, version/body mapping, preview/restore replay, reviewed forward plan | Blocked / open |
| Database authorization | Function-by-function SECURITY DEFINER review; positive and negative role/isolation tests; RLS review | Open |
| Auth protection | Owner enables leaked/compromised-password protection and verifies settings | Open |
| AI budget controls | Confirm live schema, fail-closed behavior, spend caps and request-limit tests | Partial; schema objects confirmed, end-to-end acceptance open |
| Messaging | Two-account persistence, realtime, retry, attachments, delivery/read state, reconnect and refresh tests | Physical/two-account acceptance open |
| Notifications | In-app, Android push permission/token/delivery and background acceptance on physical device | Open |
| Web/mobile parity | Role-by-role feature and permission matrix; fix concrete gaps with regression tests | Open |
| Account access | Signup, email verification, Google OAuth, password reset/recovery and session/logout tests | Open |
| Coach/academy workflows | Separate athlete/coach/academy accounts; relationship, roster, attendance and data-isolation tests | Open |
| Admin boundaries | Admin/Super Admin authorization, audit trail, support and announcement scope tests | Open |
| Android release | Production-signed APK, package ID/signing provenance, versionCode and install/update test | Open |
| Paid subscriptions | Adult-authorized merchant/legal review, provider onboarding, plan mapping, sandbox webhooks/idempotency/renewal/cancel/refund tests | Disabled; not launch-ready |
| Final release verification | Exact deployed SHA, all required CI, security, database and device evidence | Open |

## Non-negotiable safety boundaries

1. Keep `FREE_LAUNCH` and client paid-checkout flags disabled until the entire subscription gate is satisfied.
2. Keep cancellation disabled until its schema, provider behavior and client flows are verified.
3. Do not apply production SQL based only on timestamp similarity. Recover and reconcile the actual migration sources first; use a reviewed restore/preview replay.
4. Do not bulk-revoke SECURITY DEFINER functions or add broad RLS policies. Review each function and table boundary individually.
5. Do not use real athlete data for acceptance. Use synthetic test accounts with distinct roles and relationships.
6. Do not expose service-role, AI-provider, payment-provider or webhook secrets in client configuration, commits, screenshots or logs.
7. Do not call a debug-signed APK a production release artifact. Verify the production application ID and signing certificate.
8. Do not claim deployment, push delivery, messaging reliability, billing, or physical-device acceptance without recorded evidence.

## Exit criteria

The follow-up is not eligible for production sign-off until every critical row above is either completed with evidence or explicitly accepted as a launch deferral. Paid subscriptions must remain off if any provider, legal/merchant, migration, webhook, refund, renewal or cancellation gate is open. A successful merge or green CI alone is insufficient.
