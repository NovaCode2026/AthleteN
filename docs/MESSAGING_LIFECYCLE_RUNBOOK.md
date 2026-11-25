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
   - `20261125100000_notification_system_reliability.sql`
3. Run the messaging rich-media, lifecycle, push-delivery and notification-system SQL integration workflows.
4. Run Supabase security and performance advisors. Review every result before proposing production rollout.
5. Only after staging acceptance and adult/product approval should a migration owner prepare a separately reviewed production rollout plan.

Do not run `db push`, migration repair, reset, or production DDL directly from this PR.

## Attachment expiry and cleanup

Deploy the `cleanup-message-attachments` Edge Function after the lifecycle migration is approved for the target environment.

Required Edge Function secret:
- `MESSAGE_ATTACHMENT_CLEANUP_SECRET`: a random server-only value used in the `x-cleanup-secret` header.

The caller must keep this secret in its server-side scheduler only. It must never be included in web/mobile config, app code, analytics, logs, or client requests. Invoke the function at a trusted cadence (for example every 15 minutes) using POST and the secret header. The worker deletes expired messages in bounded batches and removes associated files from the private `message-attachments` bucket. Failures are retained in the private retry queue.

Until the function is deployed, its secret is configured, and a trusted schedule is enabled, the database will hide expired messages at their expiry time but queued Storage objects will not be physically removed.

## Expo push ticket, retry and receipt processing

The reliability migration installs the primary worker as a one-minute `pg_cron` job named `athleten-push-delivery-cycle` when the managed database exposes `pg_cron`. The database cycle:
- reconciles asynchronous `pg_net` send responses into Expo tickets;
- retries transient enqueue/network/rate-limit/server failures with bounded exponential backoff (maximum five send attempts);
- polls receipts once they are at least 15 minutes old;
- retires device tokens when Expo reports `DeviceNotRegistered`.

After staging replay, verify the job exists and is active:

```sql
select jobid, jobname, schedule, active, command
from cron.job
where jobname = 'athleten-push-delivery-cycle';
```

Inspect the latest job runs and private delivery states:

```sql
select jobid, status, start_time, end_time, return_message
from cron.job_run_details
where jobid = (
  select jobid from cron.job
  where jobname = 'athleten-push-delivery-cycle'
)
order by start_time desc
limit 20;

select delivery_status, count(*)
from public.push_delivery_attempts
group by delivery_status
order by delivery_status;
```

A successful Expo ticket means Expo accepted the send request. A receipt state of `handed_off` means Expo reports that FCM/APNs accepted the notification; it does not prove that the phone displayed it or that a person saw it. Missing receipts are checked again and eventually become `receipt_unavailable` after the provider retention window. A permanent `DeviceNotRegistered` response removes the obsolete token.

The repository also contains `process-push-delivery-receipts` as an alternative externally scheduled worker. It is not required when the database cron job is active. Do not enable both schedules without a deliberate operational decision. If an external worker is chosen instead, use a server-only `PUSH_DELIVERY_WORKER_SECRET` and never place it or the service-role key in web/mobile configuration.

Do not expose the service-role key or worker secrets to clients. Delivery-ledger rows and polling requests remain private to `service_role`.


## Notification event coverage

The reliability migration adds durable in-app notification events for server-assigned badge awards, student verification decisions, Coach–athlete link activation, Academy invitations/membership activation and subscription state changes. Attendance alerts link to their exact attendance row. Group-training cancellation chat announcements no longer generate a second message-category alert in addition to the direct training alert. The existing central preference guard remains authoritative for every producer.

All notification producers create an in-app row first. Push delivery is a separate, asynchronous channel and must never be treated as the durable inbox record. Message previews remain disabled by default.

## Current production device gate

A read-only production audit before this candidate migration found zero registered rows in `device_push_tokens`. The app must be installed on a physical device, notification permission granted and Expo project ID configured before that account can receive native push. A successful registration state means the token was saved; it is not evidence that Expo delivered a push. Complete at least one two-account Android acceptance run after staging replay and before release certification.

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

- Browser background Push API delivery is not enabled in this PR. Web now has an explicit browser-permission control and foreground desktop alerts through the registered service worker while the site is open. A production background Web Push rollout still needs VAPID public/private key provisioning, a server-side sender, an authenticated subscription lifecycle, a trusted worker schedule, and HTTPS acceptance testing.
- End-to-end encryption and encrypted backup remain architecture-only. Do not advertise either feature until the selected maintained protocol implementation, cross-platform interoperability, independent review, device/key lifecycle, and recovery tests are complete.
