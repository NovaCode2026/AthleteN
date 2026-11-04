# AthleteN Automated QA

## Purpose

This repository uses layered checks. Static checks and unit/regression tests protect code and data rules; Playwright drives the web UI in a real browser; Maestro drives the Android app on an emulator. A green automation run is evidence for the journeys actually covered, not proof that every feature or production integration works.

## Current layers

| Layer | Tool | Workflow | What it proves |
|---|---|---|---|
| Web unit/regression | Node.js built-in test runner | CI | Pure logic, repository contracts and regression checks represented in tests |
| Web browser E2E | Playwright | AthleteN Web E2E | Public entry, login form, recovery-mode UI, registration policy gate and reset deep-link UI |
| Android UI E2E | Maestro | AthleteN Android E2E | App launch, sign-in screen, registration screen and return to sign-in |
| Mobile static/build | Expo Doctor, TypeScript, ESLint, Expo export | Mobile Check | Dependency health, type/lint checks and JS bundle export |
| Android release build | Gradle / existing APK workflow | Android APK | Native release build and artifact generation |

## Run web E2E locally

From the repository root:

```bash
pnpm install --frozen-lockfile
npm install --no-save --package-lock=false @playwright/test
npx playwright install chromium
npx playwright test
```

The config starts Vite on `127.0.0.1:4173` with deliberately non-production placeholder Supabase settings. These tests do not create accounts or write to production data.

## Run Android E2E locally

Prerequisites: Android SDK/emulator, Java 17, Node 22, and Maestro CLI.

```bash
cd AthleteN-Mobile
npm ci
npx expo prebuild --platform android
cd android
./gradlew assembleDebug
cd ../..
maestro test .maestro/flows/auth-smoke.yaml
```

Install the generated debug APK on the running emulator before running Maestro:

```bash
adb install AthleteN-Mobile/android/app/build/outputs/apk/debug/app-debug.apk
```

## Reports and artifacts

GitHub Actions uploads browser traces, screenshots, video, HTML/JSON Playwright reports, and Maestro JUnit output when available. Download the artifact from the relevant Actions run to inspect failures.

## Safe extension plan

1. Add dedicated disposable QA accounts for Athlete, Coach, Academy and Admin roles.
2. Add repository secrets for a non-production Supabase project only; never use production service-role credentials in browser/mobile builds.
3. Add two-account messaging flows with isolated seeded conversations and cleanup.
4. Add CRUD journeys for training, competitions, medals, attendance, documents and goals.
5. Add permission tests for role/plan boundaries and Supabase RLS using isolated test users.
6. Add push notification acceptance on physical Android devices; emulator success alone does not prove vendor delivery.
7. Add scanner/camera, upload/download, offline/reconnect, session expiry and account-switching tests.
8. Track feature coverage explicitly; do not report untested features as passed.

## Required QA secrets for future authenticated tests

Use a dedicated staging Supabase project and disposable accounts. Add secrets only when a test suite is ready to consume them. Never add `SUPABASE_SERVICE_ROLE_KEY`, production user credentials, payment secrets or OpenAI keys to Playwright browser context, Maestro flows, app build variables or test artifacts.

## Release interpretation

- **PASS** means all configured tests passed for that commit.
- **FAIL** means at least one configured test failed.
- **BLOCKED** means prerequisites or test credentials were unavailable.
- **NOT COVERED** means no automated test currently exercises that feature.

Do not equate a passing smoke suite with full production readiness.
