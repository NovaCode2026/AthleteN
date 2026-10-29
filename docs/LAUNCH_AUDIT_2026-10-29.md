# AthleteN Launch Audit — 29 October 2026

## Scope

Reviewed repository structure, web and mobile package/workflow configuration, auth bootstrap paths, messaging clients, messaging database policies and constraints, Realtime publication, Supabase migration history, and Supabase security/performance advisors.

This is a code/database configuration audit, not a substitute for real-device and two-account end-to-end acceptance testing.

## Changes made during audit

- Added explicit database-confirmed insert handling to web and mobile messaging clients. The composer clears only after the database returns the saved message row.
- Applied the messaging delivery/persistence migration to the live AthleteN Supabase project. It makes the message body nullable only to support attachment-only messages, replaces the attachment/body constraint safely, and requires the authenticated sender to be a member of the conversation.
- Preserved the existing restrictive age-approval policies.
- Added messaging persistence and authorization regression tests.
- Aligned the repository migration filename with the migration version recorded by the live database.

## Verified checks

- Live Supabase project status: active/healthy.
- Public schema tables: 87 checked; 87 have row-level security enabled; 0 public tables were found with RLS disabled.
- Messaging constraints: non-empty text up to 4,000 characters, or a private attachment path.
- Messaging write policy: sender must match `auth.uid()`, must be a member of the conversation, and must provide text or an attachment.
- Messaging Realtime publication includes `messages`, `conversation_members`, and `messaging_hidden_conversations`.
- The existing mobile-check workflow passed on the reviewed mobile messaging commit: Expo Doctor, TypeScript, ESLint, and Android bundle export.
- Web CI passed on the messaging implementation commit. New regression checks were then added and a fresh CI run started; use the Actions page for its final result.
- The Android APK workflow has started; a successful APK artifact has not yet been confirmed by this audit.

## Findings requiring follow-up

### High priority — production authentication setting

Supabase Security Advisor reports **Leaked Password Protection Disabled**. Enable leaked-password protection in Supabase Auth settings before public launch.

### High priority — review SECURITY DEFINER RPC authorization

Security Advisor reports 62 SECURITY DEFINER functions executable by authenticated users. This is a warning class, not proof that all 62 are exploitable: many are intended RPCs. Each function must be reviewed for strict ownership/role checks and least-privilege grants. Do not blanket-revoke intended app RPCs without checking call sites.

### Medium priority — policy and performance cleanup

Security/performance advisors report multiple permissive policies, auth RLS initialization-plan warnings, unindexed foreign keys, and unused indexes. These need a table/function-by-table/function review. Avoid dropping indexes or merging policies blindly because both can change behavior.

### Messaging — real-user acceptance test still required

Database configuration and client-side confirmation handling are now hardened, but this audit has not logged in as two separate real users and confirmed send/receive/refresh/logout behavior end to end. That is required before calling messaging fully working. Also verify attachment upload/download, block/unblock, group membership, and age-approval gating.

A recent database log contained an invalid UUID argument (`{"pressed":false}`) sent to `unblock_messaging_user`. The current web and mobile settings call sites use explicit user IDs; re-test this path on the latest deployed app and investigate if it recurs.

## Release gate

Do not label the release fully production-ready until:
1. Latest web CI and CodeQL checks finish successfully.
2. Mobile checks and Android release APK build finish successfully.
3. Two-account messaging acceptance tests pass on deployed web and a real Android device.
4. Leaked-password protection is enabled.
5. SECURITY DEFINER RPCs and outstanding advisor findings receive an explicit risk review.
