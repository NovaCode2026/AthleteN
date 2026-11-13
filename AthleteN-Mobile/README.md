<div align="center">

<img src="./assets/images/logo-glow.png" alt="AthleteN" width="116">

# AthleteN Mobile

**The AthleteN experience for Android.**

<img src="https://img.shields.io/badge-MOBILE-ANDROID-0B1F3A?style=for-the-badge" alt="Android">
<img src="https://img.shields.io/badge-EXPO-SDK%2057-6C5CE7?style=for-the-badge" alt="Expo SDK 57">
<img src="https://img.shields.io/badge-STATUS-RELEASE%20CANDIDATE-E09B32?style=for-the-badge" alt="Release candidate">

[Main README](../README.md) · [Platform Guide](../docs/ATHLETEN_PLATFORM_GUIDE.md) · [Documentation Hub](../docs/README.md)

</div>

---

> [!WARNING]
> The Android client is part of the open release candidate, not a signed public release. A successful TypeScript check or CI APK does not replace signed AAB creation, installation testing and physical-device acceptance. See the [release-readiness report](../docs/RELEASE_READINESS_2026-11-12.md).

## What the mobile app does

AthleteN Mobile is built with **React Native, Expo SDK 57 and Expo Router**. It uses the AthleteN Supabase project and shared identity, role, subscription and record model.

Mobile is designed for quick daily actions: checking the athlete dashboard, recording training, preparing for competitions, reviewing messages and using supported Coach or Academy tools. The Web client remains the more detailed workspace for deep analytics, long histories and complex administration.

### Athlete workspace

- Athlete profile, journey, goals and medals
- Training sessions and training history
- Taekwondo selector followed by Kyorugi or Poomsae
- Kyorugi bout records and Poomsae practice/performance records
- Competitions, calendar and attendance
- Documents, notifications and coach/academy connections

### Coach and Academy workspaces

- Coach profile, linked roster, training and attendance tools
- Academy workspace, member relationships and operational views
- Competition and medal overviews
- Messages and notifications
- AI reports where plan, role, usage and data-scope checks allow access

A route or button is not proof that the underlying operation is complete. Validate saving, refreshing, permissions and error states against the acceptance checklist.

## Taekwondo discipline selection

Athletes select **Taekwondo** first and then explicitly choose **Kyorugi** or **Poomsae**. AthleteN must not silently assign a discipline when a profile is incomplete. Historical records must retain their original discipline when the profile selection changes.

See the [Taekwondo Disciplines Guide](../docs/TAEKWONDO_DISCIPLINES.md) for the full workflow and acceptance checklist.

## Plans shown in the app

| Plan | Monthly | Annual | AI requests / month |
|---|---:|---:|---:|
| Free | ₹0 | ₹0 | 0 |
| Pro | ₹99 | ₹999 | 50 |
| Elite | ₹199 | ₹1,999 | 200 |
| Coach | ₹499 | ₹4,999 | 750 |
| Academy | ₹799 | ₹7,999 | 1,000 shared |

**Student is a legacy plan** for existing subscribers only; it is not available for new purchases. Displayed prices are intended as totals inclusive of applicable GST. Do not add GST on top of the displayed price. The exact tax treatment and invoice requirements must be reviewed before billing is enabled.

**Paid checkout and recurring billing are currently disabled.** Plan information in the app is catalogue information, not an active purchase flow.

## Purchase and permission rules

- A plan selection never changes the user's account role.
- Coach access requires the existing verified Coach role and confirmed account email.
- Academy access requires the Academy Admin role, an active owned workspace, completed setup and verified contact email.
- Student verification is retained for legacy account handling; it is not open for new sales.
- Verification, provider payment confirmation and active subscription are separate states.
- The server and database must re-check role, relationship, entitlement and subscription rules. Hiding a button is not an authorization boundary.

## Develop locally

From the repository root:

```bash
cd AthleteN-Mobile
npm ci
npx expo start --clear
```

Start directly on an Android emulator/device:

```bash
npx expo start --android
```

Build and run the native Android project locally:

```bash
npx expo run:android
```

## Validate before sign-off

Run from `AthleteN-Mobile`:

```bash
npm ci
npx tsc --noEmit
npx eslint .
npx expo-doctor
```

Then test on a physical Android device using separate test accounts where applicable:

- Sign up, email confirmation, Google login, password recovery, logout and session restore
- Athlete, Coach and Academy routing and role boundaries
- Training, competition, medal and attendance save/read/refresh
- Private document upload and authorized file access
- Scanner/camera permissions and recovery from denial
- Messaging persistence, retries, delivery/ read receipts and refresh
- Push-token registration and actual push delivery
- Report entitlement, usage limits and authorized data scope
- Network interruption, empty states, loading and error feedback

## Configuration and secrets

Copy the supported public configuration from `.env.example`. Only the Supabase project URL and public/anon client key belong in the Android app.

Never put any of the following in mobile environment variables or the app bundle:

- Supabase service-role key
- OpenAI API key
- Payment-provider secret or webhook-signing secret
- Any other server credential

OAuth and password-reset redirects use the configured `athleten://auth/callback` app scheme. Keep the Supabase Site URL and mobile redirect allowlist correctly configured; do not replace the Site URL with a mobile deep link.

## Related guides

- [Main README](../README.md)
- [Web + Mobile Experience Model](../docs/WEB_MOBILE_EXPERIENCE_MODEL.md)
- [Plans, Verification & Billing](../docs/PLAN_VERIFICATION_AND_BILLING.md)
- [API Guide](../docs/API.md)
- [Deployment Guide](../docs/Deployment.md)
- [Release Readiness](../docs/RELEASE_READINESS_2026-11-12.md)
