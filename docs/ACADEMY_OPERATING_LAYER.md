# AthleteN Academy Operating Layer

## Product rule

An Academy account inherits the Coach toolkit. A Coach operates their own athlete relationships; an Academy Admin oversees active Academy members, Coach workloads, group operations and organization-level reporting. Academy access does not silently transfer athlete relationships or give an Academy Admin permission to approve another Coach's pending decisions.

## Academy workspace modules

| Module | Scope in this release |
|---|---|
| Dashboard | Academy identity, active member and coach counts, training-group activity, upcoming competitions and last-seven-day attendance summary |
| People | Active and suspended Academy members; athlete detail opens the athlete's Academy-scoped training, competition, calendar, attendance and achievement records |
| Coaches | Academy-wide coach roster, active athlete links, training groups and seat type/status |
| Training | Create Academy training groups, assign an active Academy Coach and active Academy athletes, define focus/level in the group focus field, and generate recurring sessions |
| Attendance | Academy-wide read-only attendance oversight from existing group sessions; the responsible Coach remains the only role that records attendance |
| Events | Register an active Academy athlete for a competition and optionally associate an active Academy Coach |
| Calendar | Combined group-session schedule and recent/upcoming competition records |
| Intelligence | Aggregate training logs, training time, attendance, competitions, medals, coach-to-athlete links and group workload; no health scoring or outcome prediction |
| Achievements | Academy medal and certificate records, including the stored verification status |
| Approvals | Academy-wide belt/category request visibility; approve/reject controls are shown only to the Coach who owns the request |
| Communication | Links to existing private conversations and training-group conversations, with current messaging membership controls |
| Finance | Existing Academy finance account and manual income/expense ledger, with income, expense and net totals |
| AI | Existing shared Academy AI allowance plus a richer prompt context based on stored operational aggregates |

## Access and data boundaries

- Academy membership is loaded by the signed-in profile's Academy ID.
- Academy-wide athlete and Coach operations use active membership IDs as query boundaries.
- Coach-athlete link reporting is constrained to active Coaches and active Academy athletes.
- Competition, training, medal and certificate summaries are constrained to active Academy athlete IDs.
- Attendance is read-only to the Academy dashboard. Existing database policies keep attendance updates with the Coach who owns the training group.
- The existing `review_coach_approval` server function remains authoritative. The UI only shows decision controls when the signed-in user is the request's assigned Coach.
- Training-group conversations use the existing conversation ID and messaging application; no new chat or notification system is introduced.
- Academy navigation preferences are stored separately from athlete navigation preferences. Six sections can be pinned; remaining sections stay reachable from the Academy dashboard.

## Explicitly not represented as completed

The current schema does not provide a full Academy dues/invoice/payment collection lifecycle, coach availability/leave management, coach attendance ledger, one-click athlete transfer, Academy-wide broadcast announcements, or parent/guardian delivery and consent workflow. The Finance area is a manual ledger, not a payment gateway. Messaging provides direct and group conversations, not an Academy broadcast service. Athlete-to-Coach relationship changes remain consent-based. These require dedicated server-side data models, authorization rules, and end-to-end tests before being presented as live capabilities.

## Verification

The regression test `tests/academy-operating-layer-regression.test.mjs` checks the mobile and web query boundaries, navigation separation, read-only attendance, assigned-Coach approval controls and use of existing messaging/finance systems. It is a source-contract test; database replay and physical-device acceptance are still separate release gates.
