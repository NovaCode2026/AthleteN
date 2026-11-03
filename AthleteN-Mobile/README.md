# 📱 AthleteN Mobile

<div align="center">

<img src="https://img.shields.io/badge/ATHLETEN-MOBILE-0B1F3A?style=for-the-badge" alt="AthleteN Mobile">
<img src="https://img.shields.io/badge/EXPO-SDK%2057-6C5CE7?style=for-the-badge" alt="Expo SDK 57">
<img src="https://img.shields.io/badge/PLATFORM-ANDROID-00B894?style=for-the-badge" alt="Android">

**The AthleteN athlete, Coach and Academy experience — in your pocket.**

</div>

AthleteN Mobile is built with React Native, Expo SDK 57 and Expo Router. It connects to the same Supabase identity, account roles, subscription entitlements and data model as the web application.

> Start with the [AthleteN Platform Guide](../docs/ATHLETEN_PLATFORM_GUIDE.md), then review [Taekwondo Disciplines](../docs/TAEKWONDO_DISCIPLINES.md) for the sport-first selector and the distinct Kyorugi/Poomsae tools. Then read [Plans, Verification & Billing](../docs/PLAN_VERIFICATION_AND_BILLING.md) for the exact Student, Coach and Academy click → verify → checkout journeys. The [Documentation Hub](../docs/README.md) links every project guide.

## 🌟 Main experience

### 🥋 Athlete
- Athlete home, profile and journey
- Training and competition records
- Sport-first Taekwondo profile selection, followed by Kyorugi or Poomsae
- Separate Kyorugi Hub and Poomsae Studio labels, practice logging and official performance results
- Medals, goals, documents and weight records
- Calendar, attendance and notifications
- Coach and Academy connections

### 🧑‍🏫 Coach
- Coach dashboard and athlete roster
- Coach profile and connection code
- Training and competition management
- Attendance and athlete progress
- AI Match Reports and AI Monthly Coach Report
- Messages and notifications

### 🏟️ Academy
- Academy dashboard and member operations
- Academy workspace settings
- Coach and athlete memberships
- Attendance and competition overview
- AI Monthly Academy Report
- Announcements and operational tools

### 🤖 AI Intelligence
- AI Match Report based on supplied match details and observations
- AI Monthly Report based on the previous completed month
- Saved report history and sharing/export actions
- Server-side plan, role, subscription and usage enforcement

AI reports must use only permitted saved records and user-supplied details. They must not invent match events or claim to analyse video unless a separate video-analysis feature is actually implemented.

## 💳 Plans

| Plan | Monthly | Yearly | AI requests / month |
|---|---:|---:|---:|
| Free | ₹0 | ₹0 | 0 |
| Student | ₹99 | ₹999 | 50 |
| Pro | ₹199 | ₹1,999 | 200 |
| Elite | ₹399 | ₹3,999 | 500 |
| Coach | ₹499 | ₹4,999 | 750 |
| Academy | ₹799 | ₹7,999 | 1,000 |

- Student is for Athlete accounts only and requires Admin approval of student proof before checkout.
- Coach requires the existing verified Coach role and confirmed account email.
- Academy requires the existing Academy Admin role, active Academy workspace, completed setup and verified Academy contact email.
- Verification approval and paid subscription activation are separate steps.
- AI Match Reports and role-specific AI Monthly Reports are paid-plan features.
- Paid checkout remains closed while the server Free Launch gate is enabled.

## 🔐 Purchase journey

The Plans screen uses a verification-first flow: tapping Coach or Academy runs account checks before checkout. Coach requires the existing `coach` role and a confirmed account email. Academy requires the existing `academy_admin` role plus an owned, active, fully set-up workspace with verified contact email. If the account role is missing, the screen explains that an authorized AthleteN Admin must review/assign the role; selecting a plan never changes a user's role. If Academy setup is incomplete, the user is directed to the existing Academy setup flow.


**Student:** Select Student → submit proof → Admin review → approved → checkout → payment confirmed.

**Coach:** Select Coach → existing Coach role and account-email verification → checkout → payment confirmed.

**Academy:** Select Academy → Academy Admin role → active workspace + completed setup + verified contact email → checkout → payment confirmed.

Both client UI and the server repeat eligibility checks. Hiding a button is not an authorization boundary.

## 🛠️ Development

From the repository root:

```powershell
cd ".\AthleteN-Mobile"
npm ci
npx expo start --clear
```

Android emulator/device:

```bash
npx expo start --android
```

Native build:

```bash
npx expo run:android
```

## 🧪 Validation

```bash
npm ci
npx tsc --noEmit
npx eslint .
npx expo-doctor
```

Also verify on a real Android device:
- App launch, login, logout and session restoration
- Athlete, Coach and Academy routing
- Private file upload and signed-file access
- Camera/scanner and permission flows
- Report creation, history and role-specific data scope
- Student verification updates and admin review
- Coach and Academy verification before checkout
- Push-token registration and real push delivery
- Messaging delivery, receipts and background behavior

## ⚙️ Configuration and safety

Use `.env.example` for supported mobile public variables. Keep mobile variables public-only. Never put Supabase service-role keys, OpenAI keys, payment credentials or webhook secrets in the mobile app.

Do not change the Supabase Site URL to a mobile deep link. OAuth and password-reset redirects use their own configured URLs.

## 📚 Related documentation

- [Main README](../README.md)
- [Complete Platform Guide](../docs/ATHLETEN_PLATFORM_GUIDE.md)
- [API Guide](../docs/API.md)
- [Deployment Guide](../docs/Deployment.md)
- [Release Status](../docs/APS_1.0_IMPLEMENTATION_STATUS_2026-11-03.md)
