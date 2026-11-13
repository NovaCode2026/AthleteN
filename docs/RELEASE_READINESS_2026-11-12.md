# AthleteN Release Readiness — 2026-11-13

## Decision

The combined source candidate is tracked in [PR #59](https://github.com/NovaCode2026/AthleteN/pull/59). This report is the current release-readiness reference; older PR-specific gate reports are historical snapshots.


**Not approved for public production release or paid subscriptions yet.** The combined source candidate includes the current security, pricing, AI-budget and Android-release work, but the production database/deployment contract and real-device acceptance are not complete.

## Approved pricing decision (2026-11-13)

- Launch price points are locked with no introductory phase or automatic post-launch increase: Free ₹0; Pro ₹99/month or ₹999/year; Elite ₹199/month or ₹1,999/year; Coach ₹499/month or ₹4,999/year; Academy ₹799/month or ₹7,999/year.
- All displayed prices are customer-facing totals inclusive of applicable GST. GST must not be added on top of the displayed amount. If GST is legally chargeable, the invoice must extract and disclose the tax component from the inclusive price using the rate and treatment confirmed by a qualified Indian tax adviser; do not hard-code a tax rate in the client. Registration status, classification, rate, place of supply and invoice requirements remain a pre-checkout tax gate.
- Existing Student subscriptions remain legacy-only and are not repriced. The approved pricing decision does not enable checkout, recurring billing or trials.

## Candidate changes

- Pricing: Free ₹0; Pro ₹99/₹999; Elite ₹199/₹1,999; Coach ₹499/₹4,999; Academy ₹799/₹7,999.
- AI allowances: Free 0; Pro 50; Elite 200; Coach 750; Academy 1,000 shared; Student remains a legacy entitlement for existing accounts.
- New-sale Student checkout is blocked; existing Student subscription IDs and entitlements remain supported.
- Web/mobile paid checkout and the proposed seven-day no-charge trial remain disabled.
- The mobile plans screen no longer queries the nonexistent `subscriptions.billing_cycle` column.
- AI uses a source-pinned `gpt-6-luna` default with conservative token pricing, token caps, monthly budget reservation/settlement, and fail-closed behavior.
- Security candidate includes DOB immutability, guardian approval validation, role/finance/coach-access review drafts, messaging regression coverage and a separately gated Android production AAB workflow.

## Live observations

- Supabase project `wjegokgtrewtoopbsiol` is ACTIVE_HEALTHY, region `ap-south-1`, PostgreSQL version `17.6.1.147`.
- Production Supabase migration ledger has 177 versions; latest recorded version is `20261112092215`.
- The exact timestamp comparison is in `docs/MIGRATION_HISTORY_DRIFT_2026-11-13.md`: 116 candidate SQL files, 99 unique local timestamps, 27 exact timestamps shared with production, 150 remote-only timestamps, 72 local-only timestamps, and five duplicate local timestamp groups. This blocks blind CLI migration push/reset/replay.
- Three applied Nov 4 SQL files were restored from trusted Git history and compared against live schema/policy/function effects; they increased exact timestamp overlap from 24 to 27. This does not resolve the broader drift.
- A read-only live database query confirmed `public.ai_usage_events` exists with `input_tokens`, `output_tokens`, `total_tokens` and `api_cost_minor`. The candidate migration `20261112180000_athleten_ai_monthly_budget_ledger.sql` defines the server-only relations `public.athleten_ai_budget_monthly` and `public.athleten_ai_budget_reservations`, plus service-role-only reservation/settlement functions. The candidate migration is not applied to production. Verify both relation states and the full migration history before applying it; the AI endpoint stays fail-closed until the ledger is safely installed and verified.
- Netlify site `athleten` currently serves production deploy `6af42f978110916eb4db495a`, commit `0c2af19c46d4995dd4ee1b77969fc9055ca9996f` from 2026-11-11, not this candidate branch.
- Netlify has an `OPENAI_API_KEY` variable. `OPENAI_MODEL` and explicit price overrides are absent; source defaults to `gpt-6-luna`, with built-in conservative rates of ₹11 / 1M input tokens and ₹55 / 1M output tokens, a ₹150 monthly AI budget and 600 max output tokens. The API key's access to that model has not been tested from production.
- The `gpt-6-luna` model ID and published standard rates ($0.10 input / $0.50 output per 1M tokens) were checked against official OpenAI API docs on 2026-11-13. Source adds a 10% budget buffer over a ₹100/USD planning conversion; actual provider invoices remain authoritative.
- Supabase Security Advisor reports 57 authenticated-callable SECURITY DEFINER functions, one `pg_net` extension in `public`, and leaked-password protection disabled. Performance Advisor reports 97 multiple-permissive-policy warnings. These require individual review; they are not proof that every finding is exploitable.
- The live project is on PostgreSQL 17.6.1.147; review Supabase's current minor-version guidance and schedule any upgrade with a tested maintenance plan.
- Paid checkout remains gated. Monthly/yearly recurring billing, webhook idempotency/reconciliation, renewals, cancellation/refunds and the real seven-day no-charge trial are not implemented end-to-end.

## Release gates

1. Recover missing original migrations from trusted history/backups or validate a tested baseline/squash plan. Do not reset production, create placeholder files, or edit the live ledger to hide drift.
2. Test the full ordered migration chain on a non-billable local Supabase/PostgreSQL stack. Validate the AI ledger and all three security SQL drafts against the actual application schema and positive/negative RLS cases before production DDL.
3. Review the 57 SECURITY DEFINER functions, the 97 multiple-permissive-policy warnings, `pg_net` placement and the Auth leaked-password setting individually.
4. Verify production API-key access to `gpt-6-luna`, then apply and test the monthly AI ledger only after migration reconciliation. Keep AI fail-closed until verified.
5. Verify Supabase/Netlify/storage/email/push/provider invoices and usage against the ₹500 operating ceiling; this ceiling is not certified.
6. Implement and test monthly/annual recurring billing, signed webhook reconciliation, idempotency, refunds/cancellation and the genuine seven-day no-charge trial before enabling paid checkout.
7. Enforce coach/academy athlete caps before advertising them; only the current two included Academy coach seats are confirmed enforced.
8. Verify Android package ID `com.novacode.athleten` against the intended Play Console app, configure EAS signing, build a signed production AAB and install/test it on physical devices.
9. Complete two-account physical-device acceptance for OAuth, email verification/reset, guardian approval, messaging persistence, notifications, attachments, file access, account deletion and role boundaries.
10. Deploy only the exact reviewed commit after all database/backend acceptance gates pass; verify the deployed SHA and run post-deployment smoke tests.

No production database migration, Auth setting, payment activation, Netlify deployment or user-data change is included in this source candidate.
