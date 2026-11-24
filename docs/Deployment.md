# AthleteN Production Deployment

This guide applies to the **AthleteN** repository and its existing production Supabase project.

## Current production targets

- GitHub repository: `NovaCode2026/AthleteN`
- Production branch: `main`
- Netlify site: `athleten`
- Production URL: `https://athleten.netlify.app`
- Supabase project: `wjegokgtrewtoopbsiol` (Mumbai region)

The connected production Supabase project is healthy and contains an existing production schema, but the Git-tracked migration directory is **not reconciled** with its live migration ledger. Do not infer that a candidate migration has been applied merely because later schema objects exist. **Do not re-run baseline schema/policy/storage SQL files, push the candidate migration set, reset the database, or edit the migration ledger** until the drift has been reconciled against trusted SQL sources and a restore/preview replay has passed.

## Current release-candidate hold — 24 November 2026

This dated snapshot is the controlling deployment warning until a newer, evidence-backed release review replaces it.

- Netlify production deploy `6afacd1f1942bf308824382c` is ready but was published on 16 November 2026 from main commit `df01b18935811c1a93c3246f039f07454ff91f45`. The currently inspected `main` is five commits ahead of that deployed commit. The open release candidate is not deployed.
- Supabase project `wjegokgtrewtoopbsiol` is `ACTIVE_HEALTHY` on PostgreSQL 17. Its live ledger contains 200 migration records through `20261119015503`.
- The 23 November migration inventory records 157 remote-only versions, 77 local-only timestamp versions, two duplicate local timestamp groups, and 19 nonstandard SQL filenames. Filename/version comparison is not proof of equivalent SQL effects. See `docs/MIGRATION_HISTORY_DRIFT_2026-11-23.md`.
- Read-only schema checks confirm the AI budget ledger tables and `activate_paid_subscription(uuid,text,text,text,text,timestamptz)` exist. They do **not** confirm the candidate webhook receipt objects: `private.payment_webhook_receipts` and the `claim_payment_webhook_event`, `complete_payment_webhook_event`, and `fail_payment_webhook_event` RPCs are absent. The `subscriptions.cancel_at_period_end` column is also absent.
- The release-candidate webhook claims a durable receipt before processing provider events. Deploying that webhook before its table and RPC migration is verified would make signed webhook processing fail closed. Keep the webhook migration and code deployment behind the reconciled-schema gate.
- Supabase Security Advisor still reports 60 authenticated-callable `SECURITY DEFINER` functions, `pg_net` in `public`, three RLS-enabled tables without policies (including intentionally backend-only tables), and leaked-password protection disabled. Review functions individually; do not bulk-revoke, and do not add broad RLS policies.
- Paid checkout and subscription cancellation remain disabled. Provider sandbox evidence, adult-authorized merchant onboarding and customer/legal terms, Auth dashboard configuration, a production-signed Android artifact, and physical-device/two-account acceptance remain separate release gates.

**Decision: do not merge or deploy PR #68 yet.** Reconcile the migration baseline and prove the preview/restore replay first. Then verify candidate schema effects and function privileges against production, complete the remaining operator/device gates, and rerun all checks on the final head.

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
| `SUPABASE_ANON_KEY` | Optional explicit public key for server-side user-scoped Supabase clients | Server only |
| `SUPABASE_SERVICE_ROLE_KEY` | Privileged server-side tasks and payment webhooks | **Secret — server only** |
| `OPENAI_API_KEY` | AI Coach and AI report requests | **Secret — server only** |
| `OPENAI_MODEL` | Optional model override; the function has a code default | Server only |
| `ATHLETEN_AI_PRICING_MODEL` | Exact model ID covered by verified prices; must equal `OPENAI_MODEL` | Server only |
| `ATHLETEN_AI_INPUT_PRICE_PER_1M_TOKENS_PAISE` | Verified input cost per 1M tokens, in paise | Server only |
| `ATHLETEN_AI_OUTPUT_PRICE_PER_1M_TOKENS_PAISE` | Verified output cost per 1M tokens, in paise | Server only |
| `ATHLETEN_AI_MONTHLY_BUDGET_PAISE` | Platform-wide AI budget per calendar month; defaults to 15000 (₹150) | Server only |
| `ATHLETEN_AI_MAX_OUTPUT_TOKENS` | Maximum output-token budget per request; defaults to 600 | Server only |
| `ATHLETEN_SITE_URL` | Canonical site URL used in payment provider return URLs | Server only |
| `PAYMENT_PROVIDER` | Provider selection: razorpay, stripe or cashfree | Server only |

The server functions currently accept `VITE_SUPABASE_URL` as a fallback for `SUPABASE_URL`; setting `SUPABASE_URL` as well makes the server configuration explicit.

The budgeted AI Coach defaults to `gpt-6-luna` with conservative, versioned source rates and a ₹150 monthly platform budget. No model-price variables are required for that pinned default. When selecting another model, configure `OPENAI_MODEL`, `ATHLETEN_AI_PRICING_MODEL` (exact match), and both positive input/output price variables together. The live Production site was audited on 2026-11-13 and these optional overrides were absent. The AI Coach remains paused until the budget-ledger migration is safely applied and the production API key is verified against the selected model; no unmetered provider calls are allowed.

Use the current publishable/anon key from Supabase Project API Keys. Never put the service-role key, OpenAI key, payment secret, Instagram app secret, or webhook secret in a `VITE_*` variable, source file, or client bundle.

Optional Instagram integration variables already configured on the site include the app ID, app secret, callback URLs and webhook verification token. Keep secret values server-side.

### Verification and AI report entitlements

The latest report-entitlement migration is:

`20261103170000_harden_ai_reports_active_subscription_academy_verification.sql`

It is already applied to the connected production Supabase project. It:
- Restricts saved report reads/inserts to the account owner with a matching paid role and active/trialing, unexpired subscription.
- Requires the latest Student verification request to be approved.
- Requires Academy Admin role, Academy ownership, active workspace, completed setup and verified Academy contact email.
- Keeps Coach access on the existing verified Coach role. It does not create a second Coach verification table.
- Restricts subscription activation to the server payment role.

The clients also perform verification preflight before requesting checkout:
- Student: latest Student proof status must be approved by platform Admin.
- Coach: existing Coach account role plus confirmed account email.
- Academy: Academy Admin role plus active owned workspace, completed setup and verified contact email.

A successful verification check is not payment. The signed payment webhook remains the only route to paid subscription activation.

### AI report acceptance tests

Use separate test accounts for Athlete, Coach, Academy Admin and Free users:
1. Confirm Free cannot generate or read paid AI reports.
2. Confirm Student is unavailable to non-Athlete roles.
3. Confirm Student checkout is blocked while pending or rejected and allowed only after the latest proof is approved.
4. Confirm Coach report access is limited to a verified Coach account with an active Coach subscription.
5. Confirm Academy report access requires the existing Academy workspace setup and verified contact email.
6. Confirm a cancelled, past-due or expired subscription cannot create or read paid reports.
7. Confirm report history is private to its generating account and monthly data only includes authorized athlete records.
8. Confirm AI reports do not invent missing scores, match events, attendance, techniques or health metrics.

### Payments are intentionally disabled during Free launch

The checkout Netlify Function currently has a server-side `FREE_LAUNCH = true` gate. This intentionally returns HTTP 503 for paid checkouts even if payment credentials are later added. Do not remove that gate as part of a routine deploy. When paid subscriptions are ready, first complete provider onboarding, legal/refund terms, webhook verification and test-mode acceptance. Then configure the selected provider's server-only credentials and per-plan IDs:

- Razorpay: `RAZORPAY_KEY_ID`, `RAZORPAY_KEY_SECRET`, `RAZORPAY_WEBHOOK_SECRET`, plus new monthly IDs `RAZORPAY_PLAN_V2_PRO_MONTHLY`, `RAZORPAY_PLAN_V2_ELITE_MONTHLY`, `RAZORPAY_PLAN_V2_COACH_MONTHLY`, and `RAZORPAY_PLAN_V2_ACADEMY_MONTHLY`.
- Stripe: `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, plus `STRIPE_PLAN_V2_<PLAN>_MONTHLY` for Pro, Elite, Coach and Academy.
- Student is legacy-only and has no new-sale provider plan ID. Annual provider IDs are not implemented yet.
- Cashfree: `CASHFREE_CLIENT_ID`, `CASHFREE_CLIENT_SECRET` (also used for Cashfree webhook signature verification).

Set `PAYMENT_PROVIDER` only after the server secrets and plan IDs are configured and tested. Never expose payment secrets to the browser.

**Release-candidate billing contract:** the web and mobile Plans screens send `planId` plus `billingPeriod` (`monthly` or `yearly`). The server calculates the amount in paise from `netlify/payment-common.mjs`; never accept a client-supplied amount. The new amounts are Pro ₹99 / ₹999, Elite ₹199 / ₹1,999, Coach ₹499 / ₹4,999 and Academy ₹799 / ₹7,999 (monthly / yearly). Configure period-specific Razorpay or Stripe recurring plan IDs using `RAZORPAY_PLAN_V2_<PLAN>_MONTHLY`, `RAZORPAY_PLAN_V2_<PLAN>_YEARLY`, `STRIPE_PLAN_V2_<PLAN>_MONTHLY` and `STRIPE_PLAN_V2_<PLAN>_YEARLY`. Verify each provider product has the matching INR amount and recurring interval. The webhook now requires a confirmed provider subscription period end and rechecks account age/guardian approval and product role before granting access.

Cashfree Payment Gateway `/pg/orders` creates a one-time payment order and is intentionally not exposed as a recurring subscription adapter. Cashfree Subscriptions API, renewals and cancellation require a separate implementation and sandbox acceptance.

**Paid checkout remains disabled:** `FREE_LAUNCH = true` in the server and client paid-checkout flags remain off. This PR does not configure provider credentials, execute sandbox charges or enable live collection. Do not remove the gate until provider monthly/yearly sandbox flows, webhook replay/idempotency, failures, renewal, cancellation/refund, tax/legal and device acceptance all pass.

## Supabase Auth URLs

In Supabase Authentication URL Configuration, verify:

- Site URL: `https://athleten.netlify.app`
- Allowed redirect URL: `https://athleten.netlify.app/auth/callback`
- Allowed redirect URL: `https://athleten.netlify.app/reset-password`
- Mobile app redirect URL pattern: `athleten://**` (the Expo scheme declared in `AthleteN-Mobile/app.json`).
- Mobile recovery and email-verification callback: `athleten://auth/callback`.

The mobile redirect must be present in Supabase's Auth redirect allow list. Installed Android builds use the `athleten://auth/callback` scheme for password recovery and signup verification; allowing only the two web URLs is not sufficient for installed-app deep links.

Expo Go email links must not use a temporary `exp://<LAN-host>:<port>` URL because that address depends on the development server remaining reachable when the user opens the email. The mobile app therefore sends Expo Go password-recovery emails to the stable web route `https://athleten.netlify.app/reset-password`, and signup-verification emails to `https://athleten.netlify.app/auth/callback`. The web app detects the Supabase recovery session and displays the password form. Google OAuth remains a separate in-session development-client flow.

Keep local development callbacks only if they are still needed. Do not add unrelated wildcard production redirects.

## Pre-deploy checks

1. Confirm the latest `main` commit is the intended release candidate.
2. Confirm GitHub CI and CodeQL are green for that exact commit.
3. Confirm the Mobile Check and APK workflows are green for the exact mobile source commit.
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
- AI reports: confirm Free is blocked; Student requires latest Admin approval; Coach requires the existing Coach role and confirmed account email; Academy requires the verified Academy Admin workspace.
- Monthly reports: check the previous completed month, attendance/training/competition snapshot, correct athlete relationship scope and private saved report history.
- Deep links and refresh: `/auth/callback`, `/reset-password`, and normal SPA route refresh.

## Release caveats

A successful Netlify build is not proof of full production acceptance. Android push must be tested on a physical device with notification permission granted. Two-account messaging and offline/background delivery must be tested separately. Web notifications while the browser is fully closed require a configured browser push subscription and are not covered by the current active-session desktop notifications.

Do not mark the release as production-ready until the device, security, and post-deploy acceptance checks are complete.


### Subscription cancellation release gate

The candidate exposes authenticated, account-scoped end-of-period cancellation for recurring Stripe and Razorpay subscriptions. It never requests immediate cancellation. Stripe uses `cancel_at_period_end=true`; Razorpay uses `cancel_at_cycle_end=true`. The user keeps access through the provider-confirmed period end, and webhook updates synchronize the stored cancellation flag. Cashfree Payment Gateway orders are one-time payments and do not use this recurring cancellation endpoint.

The endpoint and UI depend on `subscriptions.cancel_at_period_end` from migration `20261118000500_subscription_cancel_at_period_end.sql`. Keep cancellation unavailable in production until the complete migration history is reconciled, the migration is applied, provider sandbox scheduling and webhooks have been verified, and both web and physical Android flows pass. Do not test by creating real charges or canceling a real customer subscription.
