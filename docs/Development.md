# Development

## Toolchain

The repository root is the Web application and uses **pnpm 10.30.3**. The Android app is a separate Expo project under `AthleteN-Mobile/` and retains its own npm lockfile.

Requirements:
- Node.js 22
- Corepack
- Git
- Android device or emulator for native acceptance tests

## Web setup

From the repository root:

```bash
corepack enable
corepack prepare pnpm@10.30.3 --activate
pnpm install --frozen-lockfile
pnpm run dev
```

Open `http://localhost:5173`.

Checks:

```bash
pnpm test
pnpm run build
```

The root `pnpm-lock.yaml` is authoritative for Web and Netlify. Do not use `npm ci` at the repository root because the root project does not maintain an npm lockfile.

## Android setup

```bash
cd AthleteN-Mobile
npm ci
npx expo start --clear
```

Mobile validation:

```bash
npx tsc --noEmit
npm run lint
npx expo-doctor
npx expo export --platform android --output-dir .expo/ci-export
```

The mobile project owns `AthleteN-Mobile/package-lock.json`; use `npm ci` from that directory only.

## Environment

For Web, use an ignored `.env.local` file:

```bash
VITE_SUPABASE_URL=your_supabase_url
VITE_SUPABASE_ANON_KEY=your_publishable_or_anon_key
```

Mobile public variables are documented in `AthleteN-Mobile/.env.example`.

OpenAI, Supabase service-role, payment-provider and webhook secrets must stay server-side in Netlify. Never put them in `VITE_*` or `EXPO_PUBLIC_*` variables or commit them to Git.

## Project principles

- Web is the master management and intelligence workspace; Android is its compact operational companion.
- Keep both clients on the same Supabase records and authorization model.
- Keep secrets server-side.
- Use versioned Supabase migrations for database changes.
- Add explicit RLS policies for every new exposed table or relationship.
- Prefer explicit state updates and small helper modules.
- Preserve accessible labels and keyboard behavior when adding controls.
- Mirror migration behavior in `supabase/schema.sql` and the relevant policy documentation.
