# AthleteN Release Readiness — 2026-11-12

## Decision
**Not approved for public production release or paid subscriptions.** This branch aligns proposed new-sale pricing, preserves legacy Student accounts, removes a mobile query for a nonexistent subscriptions.billing_cycle column, adds model-price metering and a monthly budget-ledger migration, and keeps paid/trial actions closed.

## Changes
- Pricing: Free ₹0; Pro ₹99/₹999; Elite ₹199/₹1,999; Coach ₹499/₹4,999; Academy ₹799/₹7,999.
- AI allowances: Free 0; Pro 50; Elite 200; Coach 750; Academy 1,000 shared; legacy Student remains 50.
- Student is no longer sold to new customers; existing IDs and subscription entitlements are preserved.
- New monthly provider keys are separated from legacy provider IDs; Cashfree is excluded from recurring subscription checkout.
- Web/mobile paid actions remain disabled; mobile no longer requests the nonexistent subscriptions.billing_cycle column.
- AI uses source-pinned conservative rates for default `gpt-6-luna`; alternate models fail closed without exact matched prices. The monthly budget ledger must still be applied before AI requests can run.
- AI token usage and API cost are recorded. Two additive migrations define budget reservations and new quotas; neither is applied to production.

## Live observations
- Supabase project wjegokgtrewtoopbsiol is active and PostgreSQL 17.6.
- Read-only Supabase audit on 2026-11-13 confirms the remote migration ledger has 177 entries; exact local/remote timestamp comparison is documented in PR #57's `docs/MIGRATION_HISTORY_DRIFT_2026-11-13.md`: 153 remote-only timestamps, 72 local-only timestamps, 5 duplicate local timestamp groups, and only 24 exact timestamp matches. This blocks a blind migration push.
- Netlify `athleten` is currently serving production deploy `6af42f978110916eb4db495a`, commit `0c2af19c46d4995dd4ee1b77969fc9055ca9996f`, not the current reviewed source branches.
- Read-only Netlify environment-name audit confirms `OPENAI_API_KEY` and Supabase credentials exist. `OPENAI_MODEL` and AI price/budget overrides are absent; current source defaults to pinned `gpt-6-luna`, ₹11 / 1M input tokens, ₹55 / 1M output tokens, a ₹150 monthly budget and 600 output tokens. Netlify environment writes returned HTTP 403 during this pass, so no production variables were changed. The budget-ledger migration remains unapplied.
- GPT-6 Luna model identifier and standard token rates were checked against official OpenAI API model/pricing documentation on 2026-11-13. The INR rates in the pricing document use a deliberately conservative planning conversion and remain subject to the provider invoice and actual model access for the production API key.
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
4. Verify the production API key can use the pinned model, then verify ledger behavior after migration-history reconciliation; configure both exact price overrides only if changing models.
5. Verify Netlify/Supabase/storage/email/push bills and quotas; ₹500 is not certified.
6. Implement recurring monthly/yearly billing, webhook reconciliation, refunds/cancellation and real seven-day no-charge trial.
7. Enforce coach/academy athlete limits before advertising them; only two academy coach seats are confirmed in current backend.
8. Finalize Android package ID/signing, produce signed AAB and test on device.
9. Complete two-account messaging, notification, attachment, role/guardian and recovery acceptance.
10. Deploy the exact reviewed SHA only after owner approval and verify the deployed SHA.

No production migration, auth-setting change, payment activation or live deployment is part of this branch.


## QA handoff — 2026-11-13

### What is green
- The combined candidate's earlier full CI pass completed web tests/build, AI-budget SQL integration, security SQL draft integration, CodeQL and the mobile check. The current combined branch must still finish its latest runs after the most recent base/workflow changes before treating those checks as final.
- The security branch now has a pull-request Android APK workflow. The artifact is a **debug-signed QA build**, not a Play Store production AAB.

### Where the current app is
- The public Netlify production site still serves commit `0c2af19c46d4995dd4ee1b77969fc9055ca9996f`, not this PR candidate.
- No Netlify deploy preview was found for the candidate.
- Do not use the public production URL as proof that the candidate has been deployed.

### Allowed first-pass QA
Use only the generated debug APK and a designated QA account. Start with non-destructive smoke checks: app launch, sign-in/sign-out, navigation, profile read, dashboard rendering, and viewing existing test records. Record failures with device/OS, screen, steps and a screenshot that contains no private data.

### Do not test against production yet
- Do not run migration or destructive SQL operations against the live Supabase project.
- Do not delete accounts, records, messages, files or attachments.
- Do not submit real identity, school, health or competition documents.
- Do not test paid checkout or the seven-day trial; both remain disabled.
- Do not assume AI Coach is available; its new budget ledger is not applied to production.
- Do not run cross-account privacy/authorization tests using real athlete accounts.
- The CI APK currently uses the app's production Supabase URL/key fallback unless a separate QA configuration is supplied. Treat any writes made with it as writes to production, even when logged in with a QA account.

### QA exit criteria before broader testing
1. Latest PR #58 combined merge commit has passing CI, CodeQL, security SQL integration, AI budget SQL integration, mobile checks and APK build.
2. A separate non-production backend is available and configured for the candidate before testing flows that create, update, upload, message, notify, bill or change roles.
3. Full migration-history reconciliation and complete-schema authorization testing are finished.
4. Matching server functions and required configuration are deployed to that non-production backend.
5. Two-account tests pass for guardian consent, role boundaries, messaging, notifications and file access.

**Decision:** limited, non-destructive QA may begin only with the debug APK and a designated QA account after the APK workflow succeeds. This is not approval for production-data QA, paid checkout, public launch or Play Store release.
