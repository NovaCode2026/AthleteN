# 🥋 AthleteN Platform Guide

<div align="center">

<img src="https://img.shields.io/badge/ATHLETEN-ATHLETE%20OPERATING%20SYSTEM-0B1F3A?style=for-the-badge" alt="AthleteN">
<img src="https://img.shields.io/badge/FOCUS-TAEKWONDO-00AEEF?style=for-the-badge" alt="Taekwondo">
<img src="https://img.shields.io/badge/EXPERIENCE-WEB%20%2B%20ANDROID-6C5CE7?style=for-the-badge" alt="Web and Android">
<img src="https://img.shields.io/badge/INTELLIGENCE-AI%20ASSISTED-00B894?style=for-the-badge" alt="AI assisted">

**Train Smarter. Compete Stronger.**

</div>

---

## 1. Product overview

AthleteN is an athlete-first sports operating system built to connect athletes, coaches and academies. It combines sports records, training, competition preparation, communication, role dashboards, reports and controlled AI features.

The first product vertical is Taekwondo, including Kyorugi and Poomsae. The platform is designed so future sports can use the same account, reporting and role infrastructure.

## 2. Roles and account boundaries

| Role | Main workspace | Primary responsibility |
|---|---|---|
| 🥋 Athlete | Athlete Command Centre | Own profile, training, competitions, goals and journey |
| 🧑‍🏫 Coach | Coach workspace | Manage linked athletes, training and coaching activity |
| 🏟️ Academy Admin | Academy workspace | Manage academy, coaches, athletes and operations |
| 🛡️ Admin | Admin Control Centre | Platform operations, review and support |
| 🔐 Super Admin | Elevated Admin controls | Protected platform-wide controls |

Each role receives access to its permitted workspace. A paid plan does not grant access to data outside the account's role and relationship permissions.

## 3. Athlete feature catalogue

### Identity and journey
- Athlete profile, sport and discipline
- Belt and achievement history
- Athlete journey, milestones and badges
- Coach and Academy connections
- Personal documents and certificates

### Training and progress
- Training sessions and history
- Kyorugi and Poomsae-specific records
- Goals, progress and checklists
- Weight records and competition category history
- Calendar and notifications
- Attendance records where the athlete is connected to a participating Coach/Academy workflow

### Competition
- Tournament entries and competition history
- Match records and opponent notes
- Medal and achievement records
- Competition preparation checklist
- Tournament scanner and saved tournament information

## 4. Coach feature catalogue

- Coach profile and connection code
- Athlete roster and active relationship management
- Training sessions and training plans
- Attendance and participation views
- Athlete progress and competition overview
- Medal and competition analytics
- Coach monthly intelligence report
- Messaging, alerts and operational notifications

Coach analytics and reporting must use athletes the coach is permitted to manage. Coach plan access is intended for a Coach account, not an Athlete account that simply selects a Coach subscription.

## 5. Academy feature catalogue

- Academy profile and workspace setup
- Verified academy contact email
- Academy owner and membership relationships
- Athlete and coach roster
- Coach seats and academy staff access
- Training and attendance operations
- Competition and medal overview
- Academy analytics and Academy monthly report
- Announcements, calendar and operational tools

Academy-wide reports must be limited to the athletes and records inside the authorized academy scope.

## 6. AI intelligence features

### 6.1 AI Match Report

The current report workflow asks the user to supply:
- Event or tournament name
- Opponent or style, when known
- Match result or round reached
- Score, when recorded
- Match observations

AI returns:
1. Match summary
2. Observed strengths based on supplied details
3. Areas to review
4. Tactical lessons
5. Next-practice priorities

The report is not a claim of automated video analysis. It must not invent scoring events, technique names, statistics or observations that were not supplied or otherwise recorded.

### 6.2 AI Monthly Report

The current report generator works on the previous completed calendar month. Its snapshot uses available saved AthleteN records, such as:
- Training sessions and recorded training minutes
- Attendance records and status breakdown
- Medals and medal types
- Competition entries
- Active goals

Report type follows the account role:

| Role | Report |
|---|---|
| Athlete | Personal Athlete Monthly Report |
| Coach | Coach Monthly Report for the coach's authorized athlete relationships |
| Academy Admin | Academy Monthly Report for the permitted academy athletes |

The report must distinguish record totals from AI interpretation. If data is missing, the report should say it is unavailable. It must not invent heart-rate information, technique statistics, match details or attendance.

**Generation cadence:** the current screen lets the user generate the completed-month report on demand. An automatic end-of-month scheduler or email delivery is not considered enabled until separately implemented and verified.

### 6.3 Privacy and ownership

- Reports are saved in `ai_intelligence_reports`.
- Users can read their own saved report history while their paid entitlement remains eligible.
- Insert access requires the signed-in user, matching account role, permitted paid plan and active subscription.
- Student report access also requires an approved Student verification.
- Coach and Academy report queries must stay inside authorized coach/academy relationships.

## 7. Subscription catalogue

Prices are the configured AthleteN catalogue in Indian rupees.

| Plan | Monthly | Yearly | AI requests per month | Eligibility |
|---|---:|---:|---:|---|
| Free | ₹0 | ₹0 | 0 | Baseline account |
| Student | ₹99 | ₹999 | 50 | Athlete only; Admin approval |
| Pro | ₹199 | ₹1,999 | 200 | Athlete |
| Elite | ₹399 | ₹3,999 | 500 | Athlete |
| Coach | ₹499 | ₹4,999 | 750 | Verified Coach account |
| Academy | ₹799 | ₹7,999 | 1,000 | Verified Academy Admin account |

The plan catalogue is represented in the web plan configuration and mobile entitlements configuration. Keep those two catalogues aligned when changing plan IDs, pricing, descriptions or allowances.

### Plan feature highlights

| Feature | Free | Student | Pro | Elite | Coach | Academy |
|---|:---:|:---:|:---:|:---:|:---:|:---:|
| Basic athlete records | ✓ | ✓ | ✓ | ✓ | — | — |
| AI Match Report | — | ✓ | ✓ | ✓ | ✓ | ✓ |
| AI Monthly Report | — | Athlete | Athlete | Athlete | Coach | Academy |
| AI Coach allowance | 0 | 50 | 200 | 500 | 750 | 1,000 |
| Coach workspace | — | — | — | — | ✓ | ✓ |
| Academy workspace | — | — | — | — | — | ✓ |

This is a product-level summary, not a substitute for actual RLS and backend entitlement checks.

## 8. Verification and purchasing journeys

For the detailed step-by-step diagrams, engineering file map and pre-launch test checklist, see [Plans, Verification & Billing](./PLAN_VERIFICATION_AND_BILLING.md).

Verification, payment and subscription activation are three separate states.

### 8.1 Student plan (Athlete only)

```text
Athlete opens Plans
   ↓
Selects Student
   ↓
Submits school ID / fee receipt / bonafide proof
   ↓
Request is visible in Admin Control Centre
   ↓
Admin approves or rejects
   ├── Pending: checkout is blocked
   ├── Rejected: athlete can resubmit updated proof
   └── Approved: Student checkout can proceed
                     ↓
               Payment provider confirms payment
                     ↓
               Student subscription becomes active
```

Rules:
- Only an Athlete role can submit Student proof.
- Student is not available to Coach or Academy accounts.
- Admin approval does not charge the user or activate a subscription.
- Checkout and server/database entitlement checks must use the latest verification request, not an old historical approval.

### 8.2 Coach plan

```text
User selects Coach plan
   ↓
AthleteN checks the existing Coach account role
   ↓
AthleteN checks the account email is confirmed
   ↓
Server rechecks the account role and email state
   ↓
Payment checkout
   ↓
Verified payment webhook
   ↓
Coach subscription becomes active
```

Coach verification uses the existing verified Coach account/role and account-email verification. Do not create a second Coach-verification workflow or treat an Athlete account as a Coach just because it selected the plan.

### 8.3 Academy plan

```text
User selects Academy plan
   ↓
AthleteN checks Academy Admin role
   ↓
Checks active Academy workspace owned by the account
   ↓
Checks setup_completed = true
   ↓
Checks Academy contact email is verified
   ↓
Server repeats the verification checks
   ↓
Payment checkout
   ↓
Verified payment webhook
   ↓
Academy subscription becomes active
```

Academy verification reuses the existing Academy workspace and contact-email process. Missing setup or email verification must block checkout.

### 8.4 Subscription states

| State | Meaning | Paid feature access |
|---|---|---|
| Verification pending | Required identity/workspace check not complete | No |
| Verification approved | Eligibility confirmed | Not until paid |
| Checkout pending | User has started payment | No |
| Payment failed/cancelled | Provider did not confirm payment | No |
| Active | Verified payment created an active subscription | Yes, subject to role and plan |
| Past due / expired / cancelled | Subscription is not currently active | No paid report generation |

## 9. Admin capabilities

The Admin Control Centre is the platform operations surface. It includes:
- User/profile administration and role awareness
- Student verification queue and approve/reject actions
- Subscription and usage record inspection
- Payment orders and payment event review
- Academy, coach and athlete record management
- Support and operational data
- Announcements and feature controls
- Audit and platform resource inspection

Student approval should only be performed by platform-authorized Admin roles. Users must not be able to change their own verification outcome.

## 10. Technical architecture

### Web
React 18, TypeScript, Vite and Recharts.

### Mobile
React Native, Expo SDK 57 and Expo Router.

### Data and identity
Supabase Auth, PostgreSQL, Row Level Security and private Storage.

### Server
Netlify Functions handle AI provider calls, checkout initiation, payment webhooks and other operations requiring secrets.

### AI
The AI Coach endpoint uses an authenticated server-side flow and plan-aware monthly quota. Reports use the AI service but remain saved in an owner-scoped report table.

### Payments
Checkout scaffolding supports Razorpay, Stripe and Cashfree integrations. The webhook layer validates provider signatures before marking an order as paid and requesting subscription activation.

## 11. Security model

1. Never expose Supabase service-role, OpenAI or payment secrets to the browser or mobile bundle.
2. Use `auth.uid()` and relationship-aware RLS predicates for private data.
3. Do not authorize using user-editable metadata.
4. Enforce role and plan checks in Netlify functions and database policies/functions.
5. Treat report content and report snapshots as private athlete data.
6. Never activate subscription from a client-side success message.
7. Use signed webhook validation and idempotent payment processing.
8. Keep account verification distinct from payment state.
9. Avoid returning sensitive athlete details to unauthorized coach or academy users.
10. AI reports are advisory, must disclose missing data and must not imply clinical assessment.

## 12. Developer setup

Web:

```bash
npm ci
npm run dev
npm run build
```

Mobile:

```bash
cd AthleteN-Mobile
npm ci
npx expo start --clear
```

Validation:

```bash
npm test
npm run build
cd AthleteN-Mobile
npx tsc --noEmit
npx eslint .
npx expo-doctor
```

Use the repository environment examples and Deployment Guide for secrets and provider-specific configuration.

## 13. Commercial launch gate

The repository currently keeps paid checkout disabled through the explicit `FREE_LAUNCH` gate in `netlify/functions/create-checkout.mjs`. Do not remove this gate until all of the following are true:

- Payment provider account and recurring plans are configured
- Correct monthly/yearly provider price IDs are set
- Webhook secrets and callback URLs are configured
- Checkout and webhook signatures are tested in provider sandbox
- Duplicate and delayed webhook behavior is tested
- Student, Coach and Academy eligibility is tested with separate role accounts
- Failed, cancelled, refunded and expired payment paths are tested
- User-facing billing status is verified on Web and Android
- Security review is complete

## 14. Release acceptance

A green build is not production sign-off. Release acceptance also needs:
- Web deployment built from the intended commit
- Android APK installed and exercised on a physical device
- Athlete, Coach, Academy and Admin test accounts
- Student approval workflow end to end
- Coach and Academy verification workflow end to end
- AI report history and access control verified
- Messaging and push notification acceptance
- Supabase Auth and Security Advisor review
- Payment provider acceptance before paid launch

See [APS 1.0 Implementation Status](./APS_1.0_IMPLEMENTATION_STATUS_2026-11-03.md) for the current evidence and blockers.
