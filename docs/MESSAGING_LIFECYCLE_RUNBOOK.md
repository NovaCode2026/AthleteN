# AthleteN Messaging Lifecycle and Push Delivery Runbook

Status: deployment instructions for the candidate workflows in PR #76. No production migration, Edge Function deployment, secret or schedule is created by this PR.

## Database migration order

1. Reconcile the existing Supabase migration ledger with the repository first. The project has documented migration-history drift.
2. Replay candidate migrations in an isolated staging database:
   - `20261124150000_rich_media_attachment_limits.sql`
   - `20261124160000_messaging_lifecycle_and_disappearing_messages.sql`
   - `20261124170000_expo_push_ticket_and_receipt_tracking.sql`
   - `20261124180000_private_saved_messages.sql`
   - `20261124190000_group_conversation_push_notifications.sql`
3. Run the messaging rich-media, lifecycle and push-delivery SQL integration workflows.
4. Run Supabase security and performance advisors. Review every result before proposing production rollout.
5. Only after staging acceptance and adult/product approval should a migration owner prepare a separately reviewed production rollout plan.

Do not run `db push`, migration repair, reset, or production DDL directly from this PR.

## Attachment expiry and cleanup

Deploy the `cleanup-message-attachments` Edge Function after the lifecycle migration is approved for the target environment.

Required Edge Function secret:
- `MESSAGE_ATTACHMENT_CLEANUP_SECRET`: a random server-only value used in the `x-cleanup-secret` header.

The caller must keep this secret in its server-side scheduler only. It must never be included in web/mobile config, app code, analytics, logs, or client requests. Invoke the function at a trusted cadence (for example every 15 minutes) using POST and the secret header. The worker deletes expired messages in bounded batches and removes associated files from the private `message-attachments` bucket. Failures are retained in the private retry queue.

Until the function is deployed, its secret is configured, and a trusted schedule is enabled, the database will hide expired messages at their expiry time but queued Storage objects will not be physically removed.

## Expo push ticket and receipt processing

Deploy the `process-push-delivery-receipts` Edge Function after the push tracking migration is approved for the target environment.

Required Edge Function secret:
- `PUSH_DELIVERY_WORKER_SECRET`: a random server-only value used in the `x-worker-secret` header.

Invoke this function at a trusted cadence (for example every 15 minutes) using POST. It records completed pg_net responses as Expo push tickets, then checks receipts that are at least 15 minutes old. It marks a successful receipt as `handed_off`, meaning Expo reports that FCM/APNs accepted the notification; it does not prove that a person saw the notification. A `DeviceNotRegistered` ticket or receipt retires that stored device token. Missing receipts remain retryable and eventually become `receipt_unavailable` after the Expo retention window.

Do not expose the service-role key or either worker secret to clients. The worker returns aggregate counts only; it does not return device tokens, message content, or recipient identities.

## End-to-end encryption and encrypted backups

The accompanying E2E document is an architecture proposal only. No encrypted message payload, key exchange, client key storage, or backup implementation is enabled by this PR. E2E must remain off until a maintained protocol library is selected, cross-platform interoperability tests pass, and independent security plus age/privacy review is complete.

## Physical-device acceptance

Before release, validate on real Android devices and, where supported, iOS devices:
- media upload, download, signed URL expiry, delete-for-everyone and eventual Storage cleanup;
- disappearing-message settings in direct and group conversations, including a member who is removed;
- notification permission grant/denial, foreground/background/killed-app delivery, message deep links, logout/account switching and lock-screen preview privacy;
- Expo ticket and receipt processing, transient HTTP failures, missing receipts, and invalid-token retirement;
- message persistence, read/delivered receipts, search, reactions, report flow and group role restrictions.

Keep PR #76 in draft until staging, CI and physical-device evidence is attached.


## Conversation-level notification grouping

- The web and mobile notification centers group message-alert rows by the authorized conversation, show the latest alert and an unread count, and mark/delete the grouped alert rows together.
- Native Expo push payloads use a stable conversation-scoped `collapseId`, Android `tag`, and `threadId` while keeping message previews generic by default. These fields group or replace notifications; they do not change message retention or receipt records.
- Expo ticket acceptance and provider handoff remain distinct from human receipt/read state. In-app message receipts are still the source of truth for delivered/read status.

## Remaining platform gates

- Browser background Push API delivery is not enabled in this PR. The current web desktop-notification helper supports foreground permission/display only; a production Web Push rollout still needs VAPID public/private key provisioning, a server-side sender, an authenticated subscription lifecycle, a trusted worker schedule, and HTTPS acceptance testing.
- End-to-end encryption and encrypted backup remain architecture-only. Do not advertise either feature until the selected maintained protocol implementation, cross-platform interoperability, independent review, device/key lifecycle, and recovery tests are complete.
