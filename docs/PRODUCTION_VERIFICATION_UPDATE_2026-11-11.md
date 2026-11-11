# AthleteN production verification update — 2026-11-11

This update records verified production and CI evidence after the direct-message RPC fix. It does not replace the release gate.

## Production change applied

- Supabase migration name: `fix_direct_conversation_pair_lock`
- Remote migration version: `20261111110705`
- Matching repository migration: `supabase/migrations/20261111110705_fix_direct_conversation_pair_lock.sql`
- The RPC was queried after application and verified to have a pinned empty `search_path`, transaction-level advisory locking by unordered user pair, age-approval checks for both participants, mutual block checks, and EXECUTE granted to `authenticated` but not `anon`.
- The migration is additive to the migration history; it does not rewrite existing messages or delete conversations.

## Duplicate direct-thread cleanup — pending

A read-only preview found six two-member direct threads for one pair of accounts, containing 12 total messages. Five threads are duplicates of the canonical thread. The repository's `20261111111000_consolidate_duplicate_direct_message_threads.sql` migration moves messages and related references before deleting duplicate conversation rows. It has not been applied. Do not apply it without a reviewed rollback/recovery plan and explicit owner approval for this production data consolidation.

## Supabase security snapshot

- Public schema catalog: 86 `SECURITY DEFINER` functions.
- 61 are callable by `authenticated`; zero are callable by `anon`.
- All 86 have a pinned `search_path`; all 61 authenticated-callable functions include an `auth.uid()` identity check.
- These facts reduce exposure concerns but do not replace per-function authorization testing. The 61 authenticated-callable warnings remain a semantic review queue; blanket revocation would break intended RPCs.
- Security Advisor still reports `pg_net` installed in `public`, and leaked-password protection disabled.
- Catalog inspection found the `pg_net` extension is not relocatable in this project. It is therefore left in place; do not attempt a schema move that would break `net.http_post`.

## Notifications and academy data

- Notifications table contains 8 rows, including 5 message notifications; all 5 include a message ID and currently use the generic `/messages` route.
- `device_push_tokens` contains 0 rows. `net.http_request_queue` is empty and `net._http_response` has no response rows. Therefore push delivery has not yet been exercised in production; in-app notification records exist, but no registered device token was available for Expo push dispatch.
- `academy_memberships` and `coach_athlete_links` are both empty. No real academy/athlete or coach/athlete relationship exists for production acceptance testing.

## CI evidence

- Current main at audit time: `f2db8b962d4553143efaac69072e499c3e6149b7`.
- CI passed on that exact SHA: run [43002748706](https://github.com/NovaCode2026/AthleteN/actions/runs/43002748706).
- CodeQL passed on that exact SHA: run [43002748709](https://github.com/NovaCode2026/AthleteN/actions/runs/43002748709).
- Mobile Check passed on `b264437f949fa49fd4d0cce962eadfca12ec34b5`: [run 43001228818](https://github.com/NovaCode2026/AthleteN/actions/runs/43001228818).
- Android APK build workflow completed on the same mobile source SHA: [run 43001228858](https://github.com/NovaCode2026/AthleteN/actions/runs/43001228858).
- The three commits after `b264437f...` and before current main modify only Supabase migration files; the mobile app source and mobile workflow were unchanged.
- The APK workflow uses `gradlew assembleRelease` without a configured protected production signing credential flow. Its artifact is a CI build output, not a verified store-ready release.

## Remaining engineering and owner-controlled gates

1. Reconcile remote migration history against all repository migrations using schema and Git-history evidence. Do not fabricate placeholder files, reset production, or blindly edit the migration ledger.
2. Review and approve the duplicate-thread data consolidation separately.
3. Complete cross-account authorization tests for privileged RPCs and RLS policies.
4. Enable leaked-password protection if supported by the current Supabase Auth plan/configuration; the database tool cannot change this dashboard setting.
5. Register at least one real Android device token and verify foreground/background push, tap routing, token cleanup, and second-account message delivery.
6. Create controlled academy/coach/athlete test memberships and run role-boundary E2E.
7. Confirm the permanent Android application ID, establish protected signing credentials, produce a signed AAB/APK, and verify its certificate.
8. Owner publishes the reviewed web SHA; this pass does not deploy Netlify because deployment is owner-controlled.

No Netlify credits were used and no production message rows, conversation rows, academy memberships, or athlete links were changed by this update.
