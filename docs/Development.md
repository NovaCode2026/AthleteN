# Development

## Requirements

- Node.js 22 (the repository pins the major version in `.nvmrc`)
- Corepack and pnpm 10.30.3 (the exact version is pinned in the root `package.json`)
- Git
- Supabase project URL and a publishable/anon client key for connected local testing

## Install

Run from the repository root:

```bash
corepack enable
corepack prepare pnpm@10.30.3 --activate
pnpm install --frozen-lockfile
```

The root project uses **pnpm** and `pnpm-lock.yaml`. Do not use `npm ci` at the repository root because there is no root `package-lock.json`.

The Android application is a separate npm project. For mobile work, use its own `AthleteN-Mobile/package-lock.json` and run `npm ci` from `AthleteN-Mobile/`.

## Run locally

For the full local Netlify environment, including Netlify Functions and configured redirects:

```bash
pnpm run dev
```

Open `http://localhost:8888`.

For the Vite frontend only (Netlify Functions are not served in this mode):

```bash
pnpm run dev:vite
```

Open `http://localhost:5173`.

## Checks

Run the same root checks used by CI:

```bash
pnpm test
pnpm run build
```

Or run both through the convenience script:

```bash
pnpm run check
```

The primary app entrypoint is `src/App.tsx`. Vite transpiles TSX during development and production builds.

## Environment

Use `.env.local` for local-only values. Public client configuration may include:

```env
VITE_SUPABASE_URL=your_supabase_url
VITE_SUPABASE_ANON_KEY=your_supabase_publishable_or_anon_key
```

Private values such as `OPENAI_API_KEY`, payment credentials, webhook signing secrets and Supabase service-role/secret keys must never use a `VITE_*` prefix or be included in a browser/mobile bundle. Configure server-only values through Netlify's local environment workflow for development and Netlify's site environment settings for deployed functions.

Local `.env.local` values are not automatically available to Netlify production builds. Configure the required server-side variables in the Netlify site settings.

## Project Principles

- Keep secrets server-side.
- Treat Supabase/Postgres as the source of truth; Web and Mobile are clients of the same records and authorization rules.
- Prefer explicit state updates and small helper modules.
- Preserve accessible labels and keyboard behavior when adding controls.
- Keep Supabase table changes and their RLS policies in reviewed migrations.
- A green build is not proof of production acceptance; test real account boundaries and physical-device behavior before release.
