<div align="center">

# 📚 AthleteN Documentation

**A practical guide to the product, codebase and release process.**

<img src="https://img.shields.io/badge-HANDBOOK-PRODUCT%20%2B%20ENGINEERING-0B1F3A?style=for-the-badge" alt="Product and engineering handbook">
<img src="https://img.shields.io/badge-CLIENTS-WEB%20%2B%20ANDROID-6C5CE7?style=for-the-badge" alt="Web and Android">
<img src="https://img.shields.io/badge-STATUS-ACTIVE%20DEVELOPMENT-E09B32?style=for-the-badge" alt="Active development">

</div>

---

## Start with the right guide

| You are… | Start here | Next |
|---|---|---|
| 🥋 Athlete, Coach or Academy user | [AthleteN Platform Guide](./ATHLETEN_PLATFORM_GUIDE.md) | [Plans & Verification](./PLAN_VERIFICATION_AND_BILLING.md), [AI & Safety](./MEDICAL_AND_AI_DISCLAIMER.md) |
| 🧑‍💻 Developer | [Development Guide](./Development.md) | [Architecture](./Architecture.md), [API](./API.md), [UI](./UI.md) |
| 🧪 Tester / QA | [Web + Mobile Experience Model](./WEB_MOBILE_EXPERIENCE_MODEL.md) | [Tournament Scanner Test Plan](./CODEX_TOURNAMENT_SCANNER_TEST_PLAN.md), [Mobile README](../AthleteN-Mobile/README.md) |
| 🚀 Release owner | [Current Release Readiness](./RELEASE_READINESS_2026-11-12.md) | [Migration Drift](./MIGRATION_HISTORY_DRIFT_2026-11-13.md), [Deployment](./Deployment.md), [Security](./SECURITY.md) |
| 🛡️ Privacy / policy reviewer | [Legal Index](./LEGAL_INDEX.md) | [Privacy Policy](./PRIVACY_POLICY.md), [Terms of Service](./TERMS_OF_SERVICE.md) |

> [!WARNING]
> **Current release decision: not approved for public production.** [PR #59](https://github.com/NovaCode2026/AthleteN/pull/59) is the combined release candidate and remains separate from the deployed production site. Paid checkout is disabled while release gates are open. Use the release-readiness report above for the verified blockers.

## Product handbook

| Guide | What it covers |
|---|---|
| [AthleteN Platform Guide](./ATHLETEN_PLATFORM_GUIDE.md) | Product scope, roles, athlete tools, AI reports and plan access |
| [Web + Mobile Experience Model](./WEB_MOBILE_EXPERIENCE_MODEL.md) | What belongs on Web vs Android, shared data contracts and parity tests |
| [Taekwondo Disciplines](./TAEKWONDO_DISCIPLINES.md) | Taekwondo-first setup, Kyorugi and Poomsae workflows |
| [Plans, Verification & Billing](./PLAN_VERIFICATION_AND_BILLING.md) | Five public plans, legacy Student handling, eligibility and payment lifecycle |
| [Pricing & Financial Controls](./PRICING_AND_FINANCIAL_CONTROL_V1.md) | Approved INR prices, GST display policy, AI budget and operating limits |
| [Medical & AI Disclaimer](./MEDICAL_AND_AI_DISCLAIMER.md) | Boundaries for injury, nutrition, recovery and AI assistance |

## Engineering handbook

| Guide | What it covers |
|---|---|
| [Architecture](./Architecture.md) | Web, Android, Supabase and Netlify service boundaries |
| [API Guide](./API.md) | Server endpoints, payloads and authorization expectations |
| [UI Guide](./UI.md) | Layout conventions, responsive behaviour and interface guidance |
| [Development](./Development.md) | Local setup, scripts, environment and validation |
| [Mobile README](../AthleteN-Mobile/README.md) | Expo setup, Android configuration and device checks |
| [Local Build Recovery](./local-build-recovery.md) | Troubleshooting local Android build issues |
| [Error Codes](./error-codes.md) | Known application and API error meanings |

## Operations, security and release

| Guide | What it covers |
|---|---|
| [Current Release Readiness](./RELEASE_READINESS_2026-11-12.md) | Current candidate, release decision, live observations and outstanding gates |
| [Migration History Drift](./MIGRATION_HISTORY_DRIFT_2026-11-13.md) | Timestamp inventory, duplicate groups and safe reconciliation constraints |
| [Release QA Handoff](./RELEASE_HANDOFF_CODEX_QA_2026-11-11.md) | Detailed acceptance sequence and test evidence |
| [APS 1.0 Implementation Status](./APS_1.0_IMPLEMENTATION_STATUS_2026-11-03.md) | Earlier implementation snapshot and historical evidence |
| [Deployment](./Deployment.md) | Netlify configuration and controlled deployment |
| [Security](./SECURITY.md) | Secrets, authentication, RLS and security review principles |
| [Parental Consent Email Setup](./parental-consent-email-setup.md) | Consent-related email configuration |

## Legal and privacy

| Guide | What it covers |
|---|---|
| [Legal Index](./LEGAL_INDEX.md) | Legal document directory |
| [Privacy Policy](./PRIVACY_POLICY.md) | Data and privacy information |
| [Terms of Service](./TERMS_OF_SERVICE.md) | Product usage terms |

## Repository map

```text
README.md                         Product overview and local setup
docs/
  README.md                       This documentation index
  ATHLETEN_PLATFORM_GUIDE.md      Product and role handbook
  PLAN_VERIFICATION_AND_BILLING.md
                                  Plans, eligibility and billing
  PRICING_AND_FINANCIAL_CONTROL_V1.md
                                  Approved prices and cost controls
  Architecture.md                 System architecture
  Development.md                  Local development
  API.md                          Server API reference
  Deployment.md                   Deployment guide
  SECURITY.md                     Security practices
  RELEASE_READINESS_2026-11-12.md Current release decision and gates
  MIGRATION_HISTORY_DRIFT_2026-11-13.md
                                  Database migration inventory
AthleteN-Mobile/README.md         Android / Expo development
```

## Documentation rules

- **Truth over hype:** distinguish implemented, CI-tested, deployed and physically verified.
- **One catalogue:** keep Web and Mobile plan names, prices and allowances aligned.
- **One permission model:** document backend and database enforcement, not just UI visibility.
- **Readable first:** use clear headings, short explanations, tables and diagrams.
- **Release evidence:** link to the exact commit and workflow run when recording a test result.

---

<div align="center">

**AthleteN documentation — find the guide, understand the system, verify the release.**

</div>
