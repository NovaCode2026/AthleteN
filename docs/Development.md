# AthleteN Development Guide

**Updated:** 27 November 2026

## Prerequisites

- Node.js **22.x** (see `.nvmrc` / package engine)
- npm
- Git
- A Supabase project and public client configuration for connected features
- Android Studio/emulator or a physical Android device for native work

Use the repository lockfiles and `npm ci` for reproducible installs.

## Web development

From the repository root:

```bash
npm ci
npm run dev
```

The `dev` command starts Netlify Dev, including the local function environment. Use the Vite-only command when working on UI without Netlify functions:

```bash
npm run dev:vite
```

## Web checks

```bash
npm test
npm run build
npm run check
```

- `npm test`: Node test suite.
- `npm run build`: Vite production build and Netlify redirect generation.
- `npm run check`: build plus tests.

## Android development

```bash
cd AthleteN-Mobile
npm ci
npx expo start --clear
```

Run on Android:

```bash
npx expo start --android
```

Native build/run:

```bash
npx expo run:android
```

## Mobile checks

```bash
npm test
npx tsc --noEmit
npx eslint .
npx expo-doctor
```

Expo Go does not support all native modules used by AthleteN. Use a compatible development build for native feature validation, and a physical device for acceptance.

## Environment configuration

Web public configuration:

```env
VITE_SUPABASE_URL=
VITE_SUPABASE_ANON_KEY=
```

Mobile public configuration is described in `AthleteN-Mobile/.env.example`.

Server-only configuration may include Supabase service-role credentials, OpenAI API keys, payment-provider secrets, webhook-signing secrets, ad-verification secrets and other provider credentials. Configure these in the server environment (for example, Netlify's environment settings). Never put them in `VITE_*`, `EXPO_PUBLIC_*`, source code, screenshots or commits.

Do not copy production secrets into local logs or issue reports.

## Database work

- Review candidate migrations before use.
- Reconcile migration history against trusted SQL and live schema.
- Replay the full ordered chain in isolated staging.
- Test positive and negative RLS cases with separate roles/accounts.
- Never blindly push, reset, repair or edit the production migration ledger.

## Engineering practices

- Keep authorization server-side and in database policies; client hiding is not security.
- Preserve cross-client record consistency.
- Add regression tests for new workflows and authorization boundaries.
- Document environment variables, schema changes and operational gates.
- Distinguish code, automated test, staging, production and physical-device evidence.

See [Architecture](./Architecture.md), [Feature Inventory](./FEATURES.md), [Known Issues](./KNOWN_ISSUES.md) and [Release Checklist](./RELEASE_CHECKLIST.md).
