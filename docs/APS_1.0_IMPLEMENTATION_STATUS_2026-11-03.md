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
- Mobile sign-out now removes only the current device's Expo push token, preserving registrations on other devices signed into the same account.
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
- `harden_message_receipt_rpc_limits_and_search_path`
  - Pins both receipt RPCs to an empty search path and keeps all table/function references schema-qualified.
  - Limits a single delivery acknowledgement to 200 message IDs; web and mobile clients batch larger conversations into 200-ID chunks.
  - Grants execution only to authenticated users; anonymous and PUBLIC execution remain revoked.
- `optimize_rls_auth_uid_initplans_20261103`
  - Updated 30 policies to wrap direct `auth.uid()` calls in scalar SELECTs, preserving each policy's table, roles, command, USING and WITH CHECK semantics.
  - Verification query found zero remaining direct `auth.uid()` policy calls of this class.

Matching migration files are in `supabase/migrations/`.

## CI and build evidence

| Gate | Latest observed result | Notes |
|---|---|---|
| Web CI | PASS | Tests and production build passed on current documentation/release-status commit `06fed37064e6da36ebf275e9abecea7c0715c589` (run `41628528132`). |
| CodeQL | PASS | Analysis passed on current documentation/release-status commit `06fed37064e6da36ebf275e9abecea7c0715c589` (run `41628528010`). |
| Mobile Check | PASS | Expo Doctor, TypeScript, ESLint and Android bundle check passed on mobile source commit `21416958d102db405090b3723084ca39f5252ee9` (run `41628045317`), including the per-200-message receipt batching. |
| Android APK | IN PROGRESS | The APK workflow for mobile source commit `21416958d102db405090b3723084ca39f5252ee9` is running (run `41628045170`); no artifact is available yet. The older APK workflow `41626472271` is also still running and has no artifact. |
| Netlify production | READY, but STALE | Published deploy `6ae372d8d6582ed467b6b3cc` is ready, but it points to commit `6137212178dfa49a0cc19711e681d692b120b551` from 29 October 2026, not the current release candidate. |

## Open strict-release blockers

1. **Live two-account messaging acceptance:** test direct and group chats with sender/recipient online, offline, backgrounded and app-terminated; validate receipts and retries on physical devices.
2. **Push provider acceptance:** confirm Expo ticket/receipt outcomes, invalid-token handling and delivery on physical Android devices. The production `device_push_tokens` table currently contains zero registered devices, and there are no recorded `pg_net` HTTP responses yet; no real device push has been exercised.
3. **Web background push:** current desktop notification behavior is tied to the web app's active realtime session; a separately configured browser Push API / service-worker subscription is not verified.
4. **Supabase Auth:** Leaked Password Protection is disabled and must be enabled in Auth security settings.
5. **Supabase Security Advisor:** remaining warnings include pg_net installed in public (non-relocatable extension), 61 authenticated-executable SECURITY DEFINER functions, and disabled leaked-password protection. A live SQL screen found all 61 functions have pinned search paths and an auth/role/relationship guard signal; none is executable by `anon` or `PUBLIC`. This is a static screen, not proof of authorization correctness—retain a manual function-by-function review and enable leaked-password protection in Auth settings.
6. **Supabase Performance Advisor:** the 30 `auth_rls_initplan` warnings were eliminated and rechecked. 80 unused-index info notices and 121 multiple-permissive-policy warnings remain. Do not drop indexes or merge/rewrite policies without workload and access-model review.
7. **Dependency audit:** Mobile dependency install reported 36 advisories (2 low, 26 moderate, 7 high, 1 critical). Review exact dependency paths and upgrade safely; do not run a blind force-upgrade.
8. **Production deployment:** deploy the current `main` release candidate to Netlify and verify it; the currently published Netlify deploy is behind by several days. Confirm the Android APK artifact can be downloaded, installed and launched. A GitHub build alone does not prove production deployment or device installation.

## Additional verification performed

- Supabase production project status: `ACTIVE_HEALTHY`, PostgreSQL 17.6.
- Public schema RLS inventory: 88 tables checked; 0 public tables without RLS.
- Receipt RPC verification: unauthenticated delivery/read acknowledgements were rejected; function search paths are empty/pinned; `mark_messages_delivered` and `mark_messages_read` are executable by `authenticated` only, while the trigger functions are not directly executable by API roles.
- RLS optimization verification: 30 policy expressions were rewritten in place; the follow-up query returned 0 remaining direct `auth.uid()` policies in the targeted class; Performance Advisor no longer reports `auth_rls_initplan`.
- SECURITY DEFINER screen: 61 authenticated-callable functions; 61 pinned search paths; 61 source bodies with an auth/role/relationship guard signal; 0 anon-callable and 0 PUBLIC-callable.
- Netlify environment audit: production Supabase URL/publishable key, Supabase service-role secret and OpenAI API key are present. Secret values are not included in this report. `FREE_LAUNCH = true` intentionally keeps paid checkout disabled pending payment provider onboarding and testing.

## Release rule

No P0/P1 defects may remain open. All P2s need an owner and documented disposition. Android and Web must each pass their acceptance suite, security review, and real-device / real-account checks before release approval.
