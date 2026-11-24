# AthleteN Production Security Snapshot — 23 November 2026

## Scope

- Supabase project: `wjegokgtrewtoopbsiol`
- Project status at inspection: `ACTIVE_HEALTHY`
- Database: PostgreSQL 17.6.1
- Snapshot method: read-only SQL/catalog inspection and Supabase Security Advisor
- No production tables, policies, functions, Auth settings, credentials, or migration records were changed during this inspection.

## Confirmed controls

- `switch_my_product_role(text)` is not executable by `anon` or `authenticated`; only `service_role` can execute it.
- `activate_paid_subscription(...)` is not executable by `anon` or `authenticated`; only `service_role` can execute it.
- AI budget reservation, settlement, and release RPCs are not executable by `anon` or `authenticated`; they are restricted to `service_role`.
- AI budget tables have RLS enabled and no policies. The inspected ledger RPCs are the intended controlled access path; these tables are not directly accessible through client roles.
- The `public` schema does not grant `CREATE` to `anon` or `authenticated`, reducing the risk of client-created objects shadowing functions with a `public, pg_temp` search path.
- `subscriptions.cancel_at_period_end` is absent from the live `public.subscriptions` table. The cancellation UI/function must stay unavailable until its migration is reconciled and applied.

## Security Advisor findings

| Finding | Count / state | Assessment |
|---|---:|---|
| Leaked-password protection | Disabled | Must be enabled in Supabase Auth settings by the project owner. Supabase documents this under Auth settings and notes it is available on Pro and above. |
| Authenticated-callable `SECURITY DEFINER` functions | 60 | Requires per-function review; do not bulk-revoke because legitimate RPCs and RLS helpers rely on authenticated execution. |
| `pg_net` installed in `public` | 1 | Review extension dependencies, triggers, and function references before moving it. |
| RLS enabled without policies | 3 | Includes private QA overrides and the backend-only AI budget tables; verify intended role grants rather than adding broad policies. |

## Function screening performed

A read-only catalog screen of the 60 authenticated-callable `SECURITY DEFINER` functions found:

- 0 callable by `anon`.
- 60 of 60 contain a reference to `auth.uid()`.
- 36 use an empty `search_path`.
- 23 use `search_path = public, pg_temp`.
- 1 uses `search_path = public, private, pg_temp`.

This is only a screening result. A reference to `auth.uid()` does not prove that every input, target record, membership, role, or state transition is correctly authorized. Complete the function-by-function review and positive/negative authorization tests before public launch.

## Specific follow-up items

1. `public.can_start_paid_checkout(uuid, text)` currently checks that the caller matches the target user and checks product role / Student approval, but its live definition does not enforce age/guardian approval or full Academy ownership/setup/contact-email checks. Treat it as a UI preflight only. The server checkout handler must independently enforce these controls. Do not enable paid checkout until both layers are tested.
2. `subscriptions.cancel_at_period_end` is not yet present in production. Do not expose cancellation UI or deploy a function that updates this column until a reviewed migration is applied.
3. Enable leaked-password protection in the Supabase Dashboard under Authentication → Settings / Password Security, then re-run Security Advisor and record the result. See https://supabase.com/docs/guides/auth/password-security.
4. Review the 60 callable `SECURITY DEFINER` functions individually. Revoke access only where the client should not call the function; preserve RPCs required by legitimate workflows and policies.
5. Review the `pg_net` extension placement and all notification-dispatch dependencies before moving it.
6. Reconcile migration history before any production schema deployment. See `docs/MIGRATION_HISTORY_DRIFT_2026-11-23.md`.

## Release controls

- Keep `FREE_LAUNCH = true` in the release candidate.
- Keep web and mobile paid-checkout flags disabled.
- Do not configure live payment collection, make real charges, or enable recurring billing until adult-authorized provider onboarding, monthly/yearly sandbox acceptance, webhook replay/idempotency, renewal, failure, cancellation, refund, tax/legal, and support checks are complete.
- Do not deploy PR #68 to production while Supabase Preview is skipped and migration history remains unreconciled.

## Verification links

- Supabase Auth password security: https://supabase.com/docs/guides/auth/password-security
- Supabase database Security Advisor: https://supabase.com/dashboard/project/wjegokgtrewtoopbsiol/advisors/security
- Supabase project: https://supabase.com/dashboard/project/wjegokgtrewtoopbsiol