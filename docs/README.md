<div align="center">

# AthleteN Documentation

**Product handbook, engineering guide and release evidence**

<img src="https://img.shields.io/badge-HANDBOOK-PRODUCT%20%2B%20ENGINEERING-0B1F3A?style=for-the-badge" alt="Product and engineering handbook">
<img src="https://img.shields.io/badge-CLIENTS-WEB%20%2B%20ANDROID-6C5CE7?style=for-the-badge" alt="Web and Android">
<img src="https://img.shields.io/badge-UPDATED-27%20NOV%202026-E09B32?style=for-the-badge" alt="Updated 27 November 2026">

</div>

---

> **Current release decision: not approved for public production.** Candidate implementation, CI and isolated SQL tests do not substitute for production migration reconciliation, physical-device acceptance, security/policy review, billing and release signing. See [Release Status — 27 Nov 2026](./RELEASE_STATUS_2026-11-27.md).

## Start here

| Reader | Start |
|---|---|
| Athlete, Coach or Academy user | [Platform Guide](./ATHLETEN_PLATFORM_GUIDE.md) |
| Developer | [Development](./Development.md), [Architecture](./Architecture.md) |
| QA / tester | [Feature Inventory](./FEATURES.md), [Release Checklist](./RELEASE_CHECKLIST.md), [Web/Mobile Model](./WEB_MOBILE_EXPERIENCE_MODEL.md) |
| Release owner | [Current Status](./RELEASE_STATUS_2026-11-27.md), [Known Issues](./KNOWN_ISSUES.md), [Deployment](./Deployment.md) |
| Product planning | [Roadmap](./ROADMAP.md), [Pricing](./PRICING_AND_FINANCIAL_CONTROL_V1.md) |
| Security / privacy reviewer | [Security](./SECURITY.md), [Legal Index](./LEGAL_INDEX.md), [Privacy Policy](./PRIVACY_POLICY.md) |

## Product

- [Platform Guide](./ATHLETEN_PLATFORM_GUIDE.md) — roles, athlete/coach/academy workspaces
- [Feature Inventory](./FEATURES.md) — source status and acceptance notes
- [Roadmap](./ROADMAP.md) — prioritized work
- [Taekwondo Disciplines](./TAEKWONDO_DISCIPLINES.md) — Kyorugi and Poomsae
- [Web + Mobile Experience Model](./WEB_MOBILE_EXPERIENCE_MODEL.md) — shared records and client responsibilities
- [Plans, Verification & Billing](./PLAN_VERIFICATION_AND_BILLING.md)
- [Pricing & Financial Controls](./PRICING_AND_FINANCIAL_CONTROL_V1.md)
- [Medical & AI Disclaimer](./MEDICAL_AND_AI_DISCLAIMER.md)

## Engineering

- [Architecture](./Architecture.md)
- [API](./API.md)
- [Development](./Development.md)
- [UI](./UI.md)
- [Mobile Guide](../AthleteN-Mobile/README.md)
- [Local Build Recovery](./local-build-recovery.md)
- [Error Codes](./error-codes.md)

## Operations and release

- [Release Status — 27 Nov 2026](./RELEASE_STATUS_2026-11-27.md) — current candidate and gates
- [Known Issues](./KNOWN_ISSUES.md) — active investigations
- [Release Checklist](./RELEASE_CHECKLIST.md) — required acceptance
- [Changelog](./CHANGELOG.md) — repository change summary
- [Contributing](./CONTRIBUTING.md) — pull-request workflow
- [Deployment](./Deployment.md) — controlled release procedure
- [Security](./SECURITY.md) — reporting and security principles
- [Migration History Drift](./MIGRATION_HISTORY_DRIFT_2026-11-13.md) — reconciliation constraints
- [Release QA Handoff](./RELEASE_HANDOFF_CODEX_QA_2026-11-11.md) — historical QA handoff

## Legal and privacy

- [Legal Index](./LEGAL_INDEX.md)
- [Privacy Policy](./PRIVACY_POLICY.md)
- [Terms of Service](./TERMS_OF_SERVICE.md)
- [Parental Consent Email Setup](./parental-consent-email-setup.md)

## Repository map

```text
README.md                         Main product overview
src/                              Web client
AthleteN-Mobile/                  Expo/React Native client
netlify/functions/                 Server-side APIs
supabase/migrations/               Candidate SQL migrations
tests/                              Regression tests
docs/                               Product, engineering and release documentation
.github/workflows/                  CI and release automation
```

## Documentation rules

- Keep prices and allowances consistent, and disclose source-code mismatches.
- Distinguish coded, automated-tested, staging-verified, production-deployed and physical-device-tested.
- Date operational snapshots; older reports remain historical.
- Link validation to exact commits and workflows.
- Never mark a gated feature live because a UI exists.
