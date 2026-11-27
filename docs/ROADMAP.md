# AthleteN Roadmap

**Updated:** 27 November 2026  
This roadmap is a planning document. It does not promise dates or mark work complete without repository and acceptance evidence.

## Priority 0 — Stabilize startup and release foundation

- [ ] Isolate the Android native startup/black-screen failure with reproducible diagnostics.
- [ ] Confirm cold start, warm start, auth restoration, navigation and error-state behaviour on a physical device.
- [ ] Keep Web production build and exact-head CI green.
- [ ] Reconcile production migration history with trusted migration sources.
- [ ] Replay the ordered candidate migrations in isolated staging.
- [ ] Review production security findings and Auth configuration.
- [ ] Confirm package identity, signing, release build and distribution route.

## Priority 1 — Athlete core

- [ ] Cross-client save/read/refresh acceptance for training, competition, Kyorugi, Poomsae, goals, medals, documents and journey.
- [ ] Scanner accuracy, permissions and failure-state acceptance.
- [ ] Two-account role and relationship isolation testing.

## Priority 2 — Coach and Academy operations

- [ ] Validate Coach roster, attendance, progress and reports.
- [ ] Validate Academy tenant boundaries, operations, announcements, fees and seat workflow.
- [ ] Review guardian access, adult-authorized consent and youth privacy before enabling.

## Priority 3 — Communication and notifications

- [ ] Physical-device message persistence, delivery/read receipts, attachments and cleanup.
- [ ] Foreground/background/killed-app push acceptance.
- [ ] Account switching, logout and token cleanup.
- [ ] Browser background Push support if included in launch scope.

## Priority 4 — Intelligence and engagement

- [ ] Safely reconcile and install the AI budget ledger only after migration review.
- [ ] Verify model access, token pricing, budget limits and provider invoices.
- [ ] Validate leaderboard privacy, opt-in, aliases and scoring in staging.
- [ ] Complete rewarded-ad SDK, consent and age-appropriate configuration, provider review and device tests before activation.

## Priority 5 — Commercial launch

- [ ] Reconcile the product-owner pricing decision with source catalogues and server checkout amounts.
- [ ] Complete recurring billing, provider plan IDs, webhooks, cancellation, refunds and idempotency.
- [ ] Complete tax and invoice review.
- [ ] Implement and verify the intended trial only if still approved.
- [ ] Keep paid checkout disabled until every gate is signed off.

## Launch gate

A release is ready only when the exact release commit passes required CI, staging migration/security acceptance, signed Android installation and physical-device tests, backend/role acceptance, configuration verification and post-deployment smoke tests. See [Release Checklist](./RELEASE_CHECKLIST.md).
