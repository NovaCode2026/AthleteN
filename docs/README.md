<div align="center">

# 📚 AthleteN Documentation Hub

<img src="https://img.shields.io/badge/DOCS-PRODUCT%20%2B%20ENGINEERING-0B1F3A?style=for-the-badge" alt="Product and engineering docs">
<img src="https://img.shields.io/badge/STATUS-LIVING%20HANDBOOK-6C5CE7?style=for-the-badge" alt="Living handbook">
<img src="https://img.shields.io/badge/FOCUS-WEB%20%2B%20ANDROID-00B894?style=for-the-badge" alt="Web and Android">

**A clear route through the AthleteN product, codebase, operations and release process.**

</div>

---

## 🧭 Find what you need

<table>
<tr><th>👤 If you are…</th><th>Start here</th><th>Then read</th></tr>
<tr><td>🥋 Athlete / Coach / Academy user</td><td><a href="./ATHLETEN_PLATFORM_GUIDE.md">Platform Guide</a></td><td><a href="./PLAN_VERIFICATION_AND_BILLING.md">Plans & Verification</a>, <a href="./MEDICAL_AND_AI_DISCLAIMER.md">AI & Safety</a></td></tr>
<tr><td>🧑‍💻 Developer</td><td><a href="./Development.md">Development</a></td><td><a href="./Architecture.md">Architecture</a>, <a href="./API.md">API</a>, <a href="./UI.md">UI</a></td></tr>
<tr><td>🚀 Release owner / Codex QA</td><td><a href="./PRODUCTION_READINESS_GATE_2026-11-11.md">Current Production Readiness Gate</a></td><td><a href="./RELEASE_HANDOFF_CODEX_QA_2026-11-11.md">Codex QA Handoff</a>, <a href="./Deployment.md">Deployment</a>, <a href="./SECURITY.md">Security</a></td></tr>
<tr><td>🛡️ Privacy / policy reviewer</td><td><a href="./LEGAL_INDEX.md">Legal Index</a></td><td><a href="./PRIVACY_POLICY.md">Privacy</a>, <a href="./TERMS_OF_SERVICE.md">Terms</a></td></tr>
</table>

## 🌟 Product handbook

| Guide | What is inside |
|---|---|
| 🥋 [AthleteN Platform Guide](./ATHLETEN_PLATFORM_GUIDE.md) | Product vision, role workspaces, feature catalogue, AI reports, plans and architecture |
| 🖥️📱 [Web + Mobile Experience Model](./WEB_MOBILE_EXPERIENCE_MODEL.md) | Web as the full master information workspace, Mobile as the compact companion, shared data contracts, charts and parity checks |
| 🥋 [Taekwondo Disciplines](./TAEKWONDO_DISCIPLINES.md) | Sport-first selection, Kyorugi vs Poomsae, tools, data model and acceptance checks |
| 💳 [Plans, Verification & Billing](./PLAN_VERIFICATION_AND_BILLING.md) | Six plans, prices, eligibility, Student proof, Coach checks, Academy setup, checkout and payment lifecycle |
| ⚕️ [Medical & AI Disclaimer](./MEDICAL_AND_AI_DISCLAIMER.md) | Safe boundaries for injury, nutrition, recovery and AI assistance |
| 🧪 [Tournament Scanner Test Plan](./CODEX_TOURNAMENT_SCANNER_TEST_PLAN.md) | Scanner-specific regression and acceptance coverage |

## 🧑‍💻 Engineering handbook

| Guide | What is inside |
|---|---|
| 🏗️ [Architecture](./Architecture.md) | Web, Android, Supabase, Netlify and service boundaries |
| 🔌 [API Guide](./API.md) | Server endpoints, inputs, outputs and authorization expectations |
| 🎨 [UI Guide](./UI.md) | Interface conventions and responsive behavior |
| 🛠️ [Development](./Development.md) | Local setup, scripts, environment and validation |
| 📱 [Mobile README](../AthleteN-Mobile/README.md) | Expo, Android development and device checks |
| 🧯 [Local Build Recovery](./local-build-recovery.md) | Troubleshooting local Android build problems |
| 🧩 [Error Codes](./error-codes.md) | Known application and API error meanings |

## 🚀 Operations and release

| Guide | What is inside |
|---|---|
| 🚦 [Current Production Readiness Gate](./PRODUCTION_READINESS_GATE_2026-11-11.md) | Verified release evidence, current blockers, database security findings and the safe next sequence |\n| 🚦 [Codex QA Release Handoff](./RELEASE_HANDOFF_CODEX_QA_2026-11-11.md) | Detailed QA handoff, migration drift, device test plan and sign-off criteria |
| 🚦 [APS 1.0 Implementation Status](./APS_1.0_IMPLEMENTATION_STATUS_2026-11-03.md) | Evidence-based status, passed checks, known blockers and release gates |
| 🚀 [Deployment](./Deployment.md) | Netlify and environment configuration |
| 🔐 [Security](./SECURITY.md) | Secrets, authentication, RLS and security practices |
| ✉️ [Parental Consent Email Setup](./parental-consent-email-setup.md) | Consent-related email configuration |
| 📜 [Legal Index](./LEGAL_INDEX.md) | Policy document directory |
| 🔒 [Privacy Policy](./PRIVACY_POLICY.md) | Personal data and privacy |
| ⚖️ [Terms of Service](./TERMS_OF_SERVICE.md) | User and platform terms |

## 🗺️ Where to start in the repository

```text
README.md                         Product overview + first setup
docs/
  README.md                       This documentation hub
  RELEASE_HANDOFF_CODEX_QA_2026-11-11.md
                                  Current preflight evidence and Codex QA gates
  ATHLETEN_PLATFORM_GUIDE.md      Product and feature handbook
  PLAN_VERIFICATION_AND_BILLING.md
                                  Plan selection, verification and payment
  Architecture.md                 System architecture
  Development.md                  Local developer workflow
  API.md                          Server API reference
  Deployment.md                   Deployment instructions
  SECURITY.md                     Security controls and expectations
AthleteN-Mobile/README.md         Android / Expo development guide
```

## 🧩 Documentation principles

- **Truth over hype:** a feature is not called production-ready just because it appears in a screen.
- **One source of truth:** update product and mobile docs whenever role, plan, API or migration behavior changes.
- **Security by design:** explain both UI behavior and server/database enforcement.
- **Readable first:** use short sections, tables, diagrams and clear labels so a new contributor can navigate quickly.
- **Release evidence:** distinguish implemented, CI-tested, deployed and physically verified states.

---

<div align="center">

**AthleteN documentation — understand the product, build it responsibly, release it confidently.**

</div>
