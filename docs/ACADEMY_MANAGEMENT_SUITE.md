# Academy Management Suite

The Academy Management Suite extends the existing Academy workspace with ten operational workflows. The UI entry points are the mobile OPS action / Academy Portal and the web Coach/Academy Operations tab.

## Included workflows

1. Fee management — issue an athlete invoice, record partial/full receipts manually, show outstanding status and due dates.
2. Coach attendance & availability — Coaches can record their own daily status and weekly availability. Authorized Academy staff can oversee attendance.
3. Athlete transfers — the athlete initiates; the current Coach releases; the target Coach accepts; Academy staff approve. Only after all stages succeed does the RPC end the old Coach link and activate the new one.
4. Academy announcements — publish in-app notices to all active Academy members, athletes, or Coaches. Notifications respect both account-level and Academy-level preferences.
5. Parent/guardian access — invite an existing account. The guardian accepts first, then the athlete approves a limited set of scopes. The portal summary excludes medical and recovery calendar entries.
6. Reports — CSV exports for athletes, Coaches, attendance, fees, competitions and achievements; export events are logged.
7. Coach seats — Coach requests, Academy approval, included-seat allocation and payment-pending state for additional paid seats.
8. Academy notifications — per-account Academy preferences for announcements, fee updates, transfers, seat updates and reports.
9. Roles & permissions — Academy Admin can assign bounded capability sets to an active Academy Coach without promoting that account or granting Academy ownership.
10. Audit log — append-only action history containing actor, action, entity and changed field names, not the changed field values.

## Security and product boundaries

- The migration is additive and candidate-only. It has NOT been applied to production.
- All ten new tables have RLS enabled. Table privileges are explicitly revoked from PUBLIC, anon and authenticated before only required read and limited direct-write grants are restored.
- Money, transfers, announcements, guardian consent state, reports, seat approvals and staff permissions are written through validated security-definer RPCs. The audit log has no client write grant or write policy.
- Academy Admins cannot silently transfer an athlete. Athlete, current Coach, target Coach and Academy review are required.
- Guardian links require both guardian acceptance and athlete approval, with specific scopes. This workflow is not identity verification or proof of legal authority. Production use requires a separately reviewed adult-authorized consent and child-privacy process.
- Fee payment records are manual receipts only. No payment gateway, online collection, bank reconciliation or automated settlement has been integrated.
- Additional Coach seats remain payment_pending; no seat becomes paid/active until a verified payment-provider flow exists. No provider webhook is configured in this change.
- Notifications are in-app notification records using AthleteN's existing notification infrastructure. Live device delivery still depends on the previously documented push-provider and device acceptance gates.
- Web CSV export creates a downloadable CSV. Mobile shares CSV text through the platform share sheet; it does not create a managed downloadable file.
- No production migrations, provider secrets, payments, or deployments were performed.

## Acceptance still required

Run exact-head web and mobile CI; replay the candidate migration against an isolated PostgreSQL/Supabase staging database; verify RLS using multiple Academy, Coach, athlete and guardian identities; test transfer sequencing and fee partial-payment caps; test notification fan-out and preferences; and complete guardian/child privacy review and physical-device acceptance. Keep PR #76 in draft until those checks are complete.
