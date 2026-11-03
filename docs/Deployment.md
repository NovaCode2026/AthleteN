# AthleteN Production Deployment

This guide applies to the **AthleteN** repository and its existing production Supabase project.

## Current production targets

- GitHub repository: `NovaCode2026/AthleteN`
- Production branch: `main`
- Netlify site: `athleten`
- Production URL: `https://athleten.netlify.app`
- Supabase project: `wjegokgtrewtoopbsiol` (Mumbai region)

The current Supabase project already has the production schema and migrations applied. **Do not re-run the baseline schema/policy/storage SQL files against this live database.** Use the versioned migration files for future database changes and verify applied migrations before deploying code that depends on them.

## Netlify build settings

The repository's `netlify.toml` already defines these settings:

- Base directory: repository root
- Build command: `npm run build`
- Publish directory: `dist`
- Functions directory: `netlify/functions`
- SPA fallback: generated as `dist/_redirects`

For a Git-based deployment, select `NovaCode2026/AthleteN` and deploy branch `main`. Keep the existing site name `athleten`; do not create a duplicate site or rename the production site.

## Required Netlify environment variables

The existing production site was checked and the core values below are present in Production context: `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, and `OPENAI_API_KEY`. The optional `SUPABASE_URL` and `OPENAI_MODEL` overrides were not present and are not required by the current code defaults. Verify scopes remain correct before deploying:

| Variable | Purpose | Exposure |
|---|---|---|
| `VITE_SUPABASE_URL` | Supabase project URL | Frontend |
| `VITE_SUPABASE_ANON_KEY` | Supabase publishable/anon key | Frontend |
| `SUPABASE_URL` | Optional canonical URL for server functions; current functions fall back to `VITE_SUPABASE_URL` | Server only |
| `SUPABASE_SERVICE_ROLE_KEY` | Scheduled scanner and privileged server-side tasks | **Secret — server only** |
| `OPENAI_API_KEY` | AI Coach requests | **Secret — server only** |
| `OPENAI_MODEL` | Optional model override; the function has a code default | Server only |

The server functions currently accept `VITE_SUPABASE_URL` as a fallback for `SUPABASE_URL`; setting `SUPABASE_URL` as well makes the server configuration explicit.

Use the current publishable/anon key from Supabase Project API Keys. Never put the service-role key, OpenAI key, payment secret, Instagram app secret, or webhook secret in a `VITE_*` variable, source file, or client bundle.

Optional Instagram integration variables already configured on the site include the app ID, app secret, callback URLs and webhook verification token. Keep secret values server-side.

### Payments are intentionally disabled during Free launch

The checkout Netlify Function currently has a server-side `FREE_LAUNCH = true` gate. This intentionally returns HTTP 503 for paid checkouts even if payment credentials are later added. Do not remove that gate as part of a routine deploy. When paid subscriptions are ready, first complete provider onboarding, legal/refund terms, webhook verification and test-mode acceptance. Then configure the selected provider's server-only credentials and per-plan IDs:

- Razorpay: `RAZORPAY_KEY_ID`, `RAZORPAY_KEY_SECRET`, `RAZORPAY_WEBHOOK_SECRET`, plus `RAZORPAY_PLAN_STUDENT`, `RAZORPAY_PLAN_PRO`, `RAZORPAY_PLAN_ELITE`, `RAZORPAY_PLAN_COACH`, and `RAZORPAY_PLAN_ACADEMY`.
- Stripe: `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, plus `STRIPE_PLAN_<PLAN>` values for the plans offered.
- Cashfree: `CASHFREE_CLIENT_ID`, `CASHFREE_CLIENT_SECRET` (also used for Cashfree webhook signature verification).

Set `PAYMENT_PROVIDER` only after the server secrets and plan IDs are configured and tested. Never expose payment secrets to the browser.

## Supabase Auth URLs

In Supabase Authentication URL Configuration, verify:

- Site URL: `https://athleten.netlify.app`
- Allowed redirect URL: `https://athleten.netlify.app/auth/callback`
- Allowed redirect URL: `https://athleten.netlify.app/reset-password`

Keep local development callbacks only if they are still needed. Do not add broad wildcard production redirects.

## Pre-deploy checks

1. Confirm the latest `main` commit is the intended release candidate.
2. Confirm GitHub CI and CodeQL are green for that exact commit.
3. Confirm the mobile check is green for the mobile source commit.
4. Confirm Supabase migrations referenced by the code are applied to project `wjegokgtrewtoopbsiol`.
5. Confirm Netlify Production environment variables exist; do not reveal or copy secrets into chat or source control.
6. Build from the repository root and confirm `dist/index.html` and `dist/_redirects` exist.
7. Deploy to the existing `athleten` site.

## Post-deploy smoke test

Use a test account for each role; do not use a real athlete's private data for acceptance testing.

- Sign in, sign out, signup/email confirmation and password reset.
- Athlete home: load profile, training, goals, competitions, medals and dashboard preferences.
- Coach: roster, training, attendance, competition analytics and CSV export.
- Academy: members, coaches, attendance and academy analytics.
- Admin/Super Admin: resource views, role-gated controls, support and announcements.
- Messaging: direct and group chats, retry after a network interruption, attachments, Delivered/Read receipts.
- Notifications: in-app inbox and Android push with a registered physical device.
- AI Coach: entitlement checks, request limits and server-side API key handling.
- Deep links and refresh: `/auth/callback`, `/reset-password`, and normal SPA route refresh.

## Release caveats

A successful Netlify build is not proof of full production acceptance. Android push must be tested on a physical device with notification permission granted. Two-account messaging and offline/background delivery must be tested separately. Web notifications while the browser is fully closed require a configured browser push subscription and are not covered by the current active-session desktop notifications.

Do not mark the release as production-ready until the device, security, and post-deploy acceptance checks are complete.
