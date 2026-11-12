# AthleteN Release Readiness — 2026-11-12

## Decision
**Not approved for public production release or paid subscriptions.** This branch aligns proposed new-sale pricing, preserves legacy Student accounts, removes a mobile query for a nonexistent subscriptions.billing_cycle column, adds model-price metering and a monthly budget-ledger migration, and keeps paid/trial actions closed.

## Changes
- Pricing: Free ₹0; Pro ₹99/₹999; Elite ₹199/₹1,999; Coach ₹499/₹4,999; Academy ₹799/₹7,999.
- AI allowances: Free 0; Pro 50; Elite 200; Coach 750; Academy 1,000 shared; legacy Student remains 50.
- Student is no longer sold to new customers; existing IDs and subscription entitlements are preserved.
- New monthly provider keys are separated from legacy provider IDs; Cashfree is excluded from recurring subscription checkout.
- Web/mobile paid actions remain disabled; mobile no longer requests the nonexistent subscriptions.billing_cycle column.
- AI fails closed without exact model-matched positive prices and a ready monthly budget ledger.
- AI token usage and API cost are recorded. Two additive migrations define budget reservations and new quotas; neither is applied to production.

## Live observations
- Supabase project wjegokgtrewtoopbsiol is active and PostgreSQL 17.6.
- Live ai_usage_events contains input/output/total token and api_cost_minor fields.
- Live subscriptions did not contain billing_cycle.
- Security Advisor reports authenticated-callable SECURITY DEFINER functions, pg_net in exposed public, and leaked-password protection disabled. Review functions individually; warnings do not by themselves prove exploitability.
- Remote migration history does not map one-to-one to checked-in migration filenames; do not reset, create empty stubs, replay old migrations or alter the live ledger blindly.
- Paid checkout remains gated. The actual no-charge seven-day trial is not implemented; legacy ₹9 endpoint remains gated.
- Previous release handoff lists Android signing, physical-device acceptance and production deployment verification as open gates.

## Release gates
1. Reconcile migration history before applying either migration.
2. Complete SECURITY DEFINER/RLS function review and cross-account tests.
3. Confirm Supabase Auth, OAuth, SMTP and password-security settings.
4. Configure actual AI model prices and verify ledger behavior.
5. Verify Netlify/Supabase/storage/email/push bills and quotas; ₹500 is not certified.
6. Implement recurring monthly/yearly billing, webhook reconciliation, refunds/cancellation and real seven-day no-charge trial.
7. Enforce coach/academy athlete limits before advertising them; only two academy coach seats are confirmed in current backend.
8. Finalize Android package ID/signing, produce signed AAB and test on device.
9. Complete two-account messaging, notification, attachment, role/guardian and recovery acceptance.
10. Deploy the exact reviewed SHA only after owner approval and verify the deployed SHA.

No production migration, auth-setting change, payment activation or live deployment is part of this branch.
