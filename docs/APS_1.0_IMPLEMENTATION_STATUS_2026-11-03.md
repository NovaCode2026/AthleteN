# AthleteN Production Standard 1.0 — Implementation Status

**Status snapshot:** 3 November 2026  
**Target:** Android + Web  
**Quality bar:** Strict  
**Release decision:** NOT SIGNED OFF

This report records implemented work and verified gates. A merged commit or a successful CI job is not proof of full end-to-end production readiness.

## Implemented in this pass

### Athlete Web command centre
- Dedicated athlete home with athlete identity, sport/discipline, belt, achievements, training activity, goals, Taekwondo workspace, readiness factors, next competition, notifications and weight history.
- Quick actions for training logs, competitions and achievements.
- Training rhythm and medal breakdown charts.
- Athlete widgets can be enabled/disabled and reordered.
- Widget preferences persist in the Supabase `dashboard_widgets` table across devices; the save RPC is SECURITY INVOKER and relies on the table's owner-scoped RLS policy.
- The dashboard's “readiness” label was changed to “Athlete progress” to avoid implying a clinical or physiological readiness assessment.

### Coach and Academy Web workspaces
- Role-specific dashboards remain separate from the athlete home.
- Real-data training, attendance, medal and competition summaries.
- 3-, 6- and 12-month date filters.
- CSV export and browser print / Save as PDF.
- Group analytics use the same filtered rows as their charts; academy member cards distinguish active and pending memberships.
- Coach and academy analytics fetch the selected date window at the database and page through results in batches of 500 (up to a defensive 100,000-row ceiling), avoiding the prior 500/1,000-row truncation.
- Academy analytics now explicitly select profile roles and count only athlete accounts; coach/academy athlete lookup enforces Taekwondo athlete role/sport requirements.
- Empty states explain when there is no data, rather than showing fabricated metrics.

### Messaging and notifications
- Existing message persistence and idempotent client message IDs retained.
- Attachment retries reuse a stable path and do not intentionally create a duplicate message.
- Sent, Delivered and Read receipts are separate.
- Group message states now show partial and all-member delivery/read counts.
- Notifications created from a message now carry a `message_id`; the Expo push payload includes `messageId`.
- Web and Mobile notification handlers attempt to acknowledge message delivery through the recipient-scoped RPC.
- Message notification previews were changed to generic text so private message bodies are not exposed in OS notification previews.
- Desktop notification clicks route to the notification's action route.

## Database migrations applied to Supabase

- `message_notification_delivery_ack`
  - Adds a source `message_id` to message notifications.
  - Adds an FK and partial index.
  - Updates the message notification trigger and push payload to carry the message ID.
- `dashboard_widget_preferences_rpc`
  - Adds `save_my_dashboard_widgets(text[])`.
  - Enforces authenticated ownership, known widget keys, unique keys and between 1 and 8 widgets.
  - Runs as SECURITY INVOKER and uses existing RLS.

Matching migration files are in `supabase/migrations/`.

## CI and build evidence

| Gate | Latest observed result | Notes |
|---|---|---|
| Web CI | PASS | Tests and production build passed on latest code commit `3617ede24fa5cf900ce99c47f9caac367834c6cd` (run `41625568854`). |
| CodeQL | IN PROGRESS | Latest code commit `3617ede24fa5cf900ce99c47f9caac367834c6cd` is being analyzed (run `41625568372`); prior CodeQL runs completed successfully. |
| Mobile Check | PASS | Expo Doctor, TypeScript, ESLint and Android bundle check passed on `06da641483a3492564f590f8e166d257e1236e02` (run `41623373489`). No mobile source changed after that mobile gate. |
| Android APK | IN PROGRESS | Scanner regression job passed; standalone Gradle APK build remains in progress on `06da641483a3492564f590f8e166d257e1236e02` (run `41623373182`). No downloadable artifact was present at the last check. |
| Netlify production | READY, but STALE | Published deploy `6ae372d8d6582ed467b6b3cc` is ready, but it points to commit `6137212178dfa49a0cc19711e681d692b120b551` from 29 October 2026, not the current release candidate. |

## Open strict-release blockers

1. **Live two-account messaging acceptance:** test direct and group chats with sender/recipient online, offline, backgrounded and app-terminated; validate receipts and retries on physical devices.
2. **Push provider acceptance:** confirm Expo ticket/receipt outcomes, invalid-token handling and delivery on physical Android devices. A successful database enqueue is not proof that the push provider delivered to an OS device.
3. **Web background push:** current desktop notification behavior is tied to the web app's active realtime session; a separately configured browser Push API / service-worker subscription is not verified.
4. **Supabase Auth:** Leaked Password Protection is disabled and must be enabled in Auth security settings.
5. **Supabase Security Advisor:** current warnings include pg_net installed in public (non-relocatable extension), 61 authenticated-executable SECURITY DEFINER RPCs requiring a purpose/authorization review, and 121 multiple-permissive-policy warnings. These must be reviewed individually; do not bulk revoke role-gated RPCs or rewrite RLS policies blindly. A live SQL screening of all 61 authenticated-callable functions found a pinned `search_path` and an obvious auth/role/relationship guard signal in each definition; this is a static screen, not proof of full authorization correctness.
6. **Supabase Performance Advisor:** 30 auth_rls_initplan warnings and 80 unused-index info notices remain for reviewed remediation. Do not drop unused indexes without workload evidence.
7. **Dependency audit:** Mobile dependency install reported 36 advisories (2 low, 26 moderate, 7 high, 1 critical). Review exact dependency paths and upgrade safely; do not run a blind force-upgrade.
8. **Production deployment:** deploy the current `main` release candidate to Netlify and verify it; the currently published Netlify deploy is behind by several days. Confirm the Android APK artifact can be downloaded, installed and launched. A GitHub build alone does not prove production deployment or device installation.

## Release rule

No P0/P1 defects may remain open. All P2s need an owner and documented disposition. Android and Web must each pass their acceptance suite, security review, and real-device / real-account checks before release approval.
