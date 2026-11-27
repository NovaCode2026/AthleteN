# AthleteN Release Status — 27 November 2026

## Decision

**Not approved for public production release or paid subscriptions.**

This is a current documentation snapshot based on repository candidate PR #76, the documentation/source audit performed on 27 November 2026, and the user's recent report of Android diagnostic-build behaviour. It does not replace live CI or production checks.

## Repository candidate

- Repository: [NovaCode2026/AthleteN](https://github.com/NovaCode2026/AthleteN)
- Candidate workstream: [PR #76](https://github.com/NovaCode2026/AthleteN/pull/76)
- PR state at audit: open, draft, unmerged
- Candidate head observed during audit: `91e3b37089284e4fc09f89b48dced476aeabab8d`
- The candidate contains extensive feature, messaging, Academy, Admin, UI and notification work. Exact-head CI must be rechecked because the branch may move after this snapshot.

## Known blockers / gates

1. **Android startup:** recent diagnostic APKs have reportedly shown logo/splash followed by a black screen. Root cause is not established. A fix is not claimed.
2. **Production migrations:** migration-history drift exists. Candidate SQL is not production-applied; no blind push, reset or ledger edit is permitted.
3. **Physical-device acceptance:** login/session, startup, messaging, attachments, notification, account switching and role workflows remain to be verified.
4. **AI:** production model access, budget-ledger migration and cost verification remain gated.
5. **Subscriptions:** paid checkout and recurring billing are disabled. Provider/webhook/tax/invoice/cancellation/refund acceptance remains incomplete.
6. **Rewarded ads:** not live. Native SDK lifecycle, consent/age-appropriate configuration, provider approval and device tests remain required.
7. **Push:** configuration and real-device delivery acceptance remain required.
8. **Youth/guardian safety:** adult-authorized consent, privacy and policy/legal review must precede production activation of applicable features.
9. **Release signing/distribution:** signed production build and install/upgrade acceptance must be confirmed.

## Pricing decision discussed with product owner

| Plan | Monthly | Annual | Base AI allowance |
|---|---:|---:|---:|
| Free | ₹0 | ₹0 | 0 |
| Student | ₹49 | ₹499 | 40 |
| Pro | ₹199 | ₹1,999 | 200 |
| Elite | ₹399 | ₹3,999 | 500 |
| Coach | ₹499 | ₹4,999 | 750 |
| Academy | ₹799 | ₹7,999 | 1,000 shared |

**Important implementation discrepancy:** the candidate source code still defines a different catalogue: Pro ₹99/₹999 with 50, Elite ₹199/₹1,999 with 200, Student as legacy-only with 50, plus Coach and Academy at the same price points. This documentation update does not change checkout, entitlements or source pricing. The product-owner catalogue must be reconciled in code, server-side pricing and tests before it can be presented as live or sold.

Prices are planning/customer-facing amounts intended to include applicable GST. Tax and invoicing treatment require qualified review before checkout.

## Rewarded-ad policy discussed

- 2 bonus AI messages per successfully verified ad.
- Maximum 3 successful ads/day.
- Maximum 30 bonus messages/month.
- Separate from subscription allowance; month-end expiry.
- Optional, never required to access existing app features.
- Not live; youth privacy, age-appropriate ad configuration, consent, provider approval and device acceptance are release gates.

## Evidence boundaries

- CI results apply only to the exact commit/run and do not equal production deployment.
- Candidate SQL tests run in isolated PostgreSQL do not prove the live database has those migrations.
- A successful Android bundle export does not prove that an APK installs, starts, signs correctly or works on a physical device.
- No production migration, paid billing activation, ad activation or deployment is claimed by this documentation update.

See [Known Issues](./KNOWN_ISSUES.md), [Release Checklist](./RELEASE_CHECKLIST.md) and [Release QA handoff](./RELEASE_HANDOFF_CODEX_QA_2026-11-11.md) where present.
