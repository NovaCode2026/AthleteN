<div align="center">

<img src="./assets/images/logo-glow.png" alt="AthleteN" width="116">

# AthleteN Mobile

**The AthleteN Android experience**

<img src="https://img.shields.io/badge-MOBILE-ANDROID-0B1F3A?style=for-the-badge" alt="Android">
<img src="https://img.shields.io/badge-EXPO-SDK%2057-6C5CE7?style=for-the-badge" alt="Expo SDK 57">
<img src="https://img.shields.io/badge-STATUS-CANDIDATE-E09B32?style=for-the-badge" alt="Candidate">

[Main README](../README.md) · [Documentation Hub](../docs/README.md) · [Release Status](../docs/RELEASE_STATUS_2026-11-27.md)

</div>

---

> **Android release status:** candidate only. Recent diagnostic builds have reportedly shown a black screen after the splash/logo. Root cause is unknown and the startup issue remains open. Bundle export/CI is not proof of a signed APK or physical-device acceptance.

## Product

AthleteN Mobile is built with React Native, Expo SDK 57 and Expo Router. It shares account identity, role, entitlement and records with the Web client through the backend.

### Athlete
- Profile, goals, medals, Athlete Journey
- Training history
- Taekwondo → Kyorugi or Poomsae workflows
- Competition and calendar
- Documents and notifications

### Coach and Academy
- Coach roster, training and attendance
- Academy workspace and operational tools
- Competition and achievement views
- Messaging and notifications
- AI reports when role, plan, usage and data-scope checks permit

### Other feature areas
Messaging, Rewards Centre, leaderboard, AI Coach, Admin and account/verification workflows are present in the candidate source with varying implementation and acceptance status. Use the [Feature Inventory](../docs/FEATURES.md), not screen presence alone, as the status reference.

## Pricing discussion

| Plan | Monthly | Annual | Base AI messages/month |
|---|---:|---:|---:|
| Free | ₹0 | ₹0 | 0 |
| Student | ₹49 | ₹499 | 40 |
| Pro | ₹199 | ₹1,999 | 200 |
| Elite | ₹399 | ₹3,999 | 500 |
| Coach | ₹499 | ₹4,999 | 750 |
| Academy | ₹799 | ₹7,999 | 1,000 shared |

**Source mismatch:** current candidate code still uses the older catalogue (Pro ₹99/₹999, Elite ₹199/₹1,999, Student legacy 50 messages). These prices and allowances are documentation of the product-owner discussion, not active checkout. Billing is disabled.

## Rewarded ads

The discussed reward rule is 2 bonus messages per successfully verified ad, up to 3 ads/day and 30 bonus messages/month. Credits expire at month-end. Ads are optional.

Rewarded ads are **not live**. Native SDK lifecycle, consent and age-appropriate ad configuration, publisher approval, environment gates and physical-device tests are required first.

## Develop

From this directory:

```bash
npm ci
npx expo start --clear
```

Start Android:

```bash
npx expo start --android
```

Native local build:

```bash
npx expo run:android
```

## Checks

```bash
npm test
npx tsc --noEmit
npx eslint .
npx expo-doctor
```

## Physical-device acceptance

- [ ] Clean install and upgrade install
- [ ] Cold/warm startup and splash transition
- [ ] Authentication, session restore, logout and account switching
- [ ] Athlete/Coach/Academy/Admin role routes
- [ ] Save/read/refresh shared records
- [ ] Messaging persistence, attachments, receipts and group access
- [ ] Push permission, token registration and real delivery
- [ ] Notification tap and deep-link routing
- [ ] Camera/scanner permission and recovery
- [ ] Network interruption, loading/error/empty states
- [ ] Accessibility, touch targets and layout on supported screen sizes

## Configuration and secrets

Only public Supabase URL and anon/public key belong in the app. Server secrets—including service-role keys, OpenAI keys, payment secrets and webhook signing keys—must remain server-side.

For Firebase push, the required Android Firebase configuration and EAS FCM credentials must be configured by the project owner; they are not committed to the repository. See PR #80 and current release status.

Rewarded-ad identifiers are configuration, not permission to activate ads. Do not enable ads until consent, age-appropriate request settings, provider approval, server verification and testing are complete.
