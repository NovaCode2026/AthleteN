# 🖥️📱 AthleteN Web + Mobile Experience Model

<div align="center">

<img src="https://img.shields.io/badge/WEB-FULL%20COMMAND%20CENTRE-0B1F3A?style=for-the-badge" alt="Web full command centre">
<img src="https://img.shields.io/badge/MOBILE-COMPACT%20ATHLETE%20COMPANION-00AEEF?style=for-the-badge" alt="Mobile companion">
<img src="https://img.shields.io/badge/DATA-ONE%20SHARED%20SOURCE-6C5CE7?style=for-the-badge" alt="One shared source">

**One AthleteN product. One set of records. Two interfaces designed for different moments.**

</div>

---

## 1. Product rule

AthleteN Web is the **master information experience**: the broad command centre for understanding the athlete, team or academy; reviewing detailed history; comparing trends; exploring reports; and managing complex settings.

AthleteN Mobile is the **compact operating companion**: it puts essential information and actions close at hand while the athlete or coach is moving through the day—check status, log training, prepare for competition, open discipline tools, receive messages and notifications, and review a few high-value signals.

This is not two products and not two databases. Both clients use the same signed-in account, role/relationship authorization, Supabase records, entitlements and canonical workflows. Web may reveal more detail at once; Mobile prioritizes the next useful action and opens focused screens for detail.

> **Important source-of-truth distinction:** Web is the master *information workspace*, not a separate master database. Supabase/Postgres remains the authoritative shared record and permission boundary. A value saved on either client must be read back consistently by the other client.

## 2. Experience responsibilities

| Concern | Web — full command centre | Mobile — compact companion |
|---|---|---|
| Primary use | Understand, compare, plan, review and administer | Check, capture, act and respond |
| Information density | Full tables, filters, history, explanations and multi-chart views | Priority metrics, short timelines and focused summaries |
| Charts | Detailed trends, comparisons, ranges and report visualizations | Small readable trends and key totals; open a focused detail screen for more |
| Records | Full entry, review, edit, export and detailed history where authorized | Fast entry and essential review; deeper inspection in focused screens |
| Navigation | Full role-aware workspace and information architecture | Bottom tabs, More and direct task screens |
| Admin / setup | Detailed configuration, reviews, audit and advanced management | Essential role-authorized operations; complex configuration can use a focused screen or Web |
| Layout | Responsive desktop/tablet master view | Touch-first, thumb-friendly, scroll-efficient phone view |
| Feedback | Explain metric meaning, time range and source records | Show the value, period and a short explanation without crowding |

## 3. Shared product contracts

1. **One identity:** the same profile, username, role, sport, discipline and account status on both clients.
2. **One authorization model:** role, ownership, active coach-athlete relationship, academy membership, verification and subscription checks remain enforced by the backend/RLS—not by hiding buttons alone.
3. **One canonical record:** a training session, competition, medal, attendance record, message or report saved on Web must appear on Mobile after refresh/sync, and vice versa, within account permissions.
4. **One discipline model:** choose Taekwondo first, then Kyorugi or Poomsae. Labels and tools follow lowercase stored values (kyorugi / poomsae). Historical records are not silently converted when a profile selection changes.
5. **One calculation definition:** the same KPI uses the same filters, date range, units and inclusion rules on both clients. Presentation may differ; the number must not.
6. **No invented analytics:** charts and reports are calculated from saved records. Empty, incomplete or unavailable data must be labelled as such—not replaced with guessed values.
7. **Honest freshness:** show loading, last-updated or refresh feedback where useful. Do not label cached or unavailable data as live.

## 4. Web master information architecture

### Athlete Command Centre

The athlete Web workspace is the complete overview and deep-review surface:

- Athlete identity, sport, discipline, verification and account context
- Training totals, minutes and historical consistency
- Kyorugi or Poomsae domain workspace and competition history
- Medal breakdown and achievement history
- Goal progress and record-completion factors with their definitions
- Upcoming competition, checklist, recent activity and next actions
- Weight history where the athlete chooses to record it
- AI usage and saved intelligence/report access where eligible
- Full feature navigation for attendance, calendar, messages, documents, scanner, analytics, reports, badges, journey and account settings

### Coach and Academy workspaces

Web is the detailed team-management view for permitted roles:

- Linked athlete/member rosters and relationships
- Training plans, sessions and attendance
- Competition and medal overviews
- Approval queues, academy configuration, seats and finance where enabled
- Detailed team analytics and authorized monthly reports
- Messaging, notifications and operational review

### Admin workspaces

Web is the detailed platform operations surface for authorized Admin/Super Admin roles. Elevated access must remain backend-authorized and auditable.

## 5. Web chart and metric standards

| Visualization | Meaning | Required explanation |
|---|---|---|
| Training rhythm | Count of saved training sessions in each displayed week | Exact date window and that counts come from saved logs |
| Six-month activity | Training sessions, competition entries and medals per calendar month | Calendar-month range; counts are records, not performance scores |
| Goal progress | User-entered progress for each saved goal | Saved goal progress, not an AI prediction |
| Medal collection | Saved gold/silver/bronze medal record counts | Depends on medal type labels entered |
| Weight trend | Athlete-entered weight history | Recorded measurements only; no target-body judgement or automatic recommendation |
| Progress/completion factors | Completion of profile and record-keeping areas | Explain the scoring formula; never present it as medical or physical readiness |

Charts must use readable axis labels, units, date ranges, tooltips and empty states. Avoid comparing incompatible units on one axis. Keep the source record available from the relevant feature page.

## 6. Mobile companion information architecture

Mobile home should stay short and action-oriented:

1. **Header:** brand, greeting, refresh, notifications and settings.
2. **Snapshot:** a small set of high-value metrics, such as recent sessions/minutes, medals and an existing recorded athlete metric.
3. **Role entry:** direct access to Coach, Academy or authorized Admin workspace when applicable.
4. **Discipline card:** one focused Kyorugi Hub or Poomsae Studio summary with the most useful shortcuts. Never show both sets of discipline tools as if they apply to one account.
5. **Plan and consistency:** active plan, current training streak and a compact seven-day chart.
6. **Next competition:** one upcoming event with a direct link to Compete.
7. **Quick actions:** cockpit, competition, AI and athlete passport; main tabs and More retain access to the wider product.

Keep repeated cards out of the same home screen. Poomsae Studio should not appear twice with repeated links to form practice and results. Detailed Poomsae records belong in the Taekwondo screen; detailed training belongs in Training.

### Mobile detail screens

A compact home does not mean removing essential tasks. Keep focused screens for Training, Session Mode, Compete, Taekwondo, Messages, Notifications, Attendance, Calendar, Profile, Documents, AI, Reports, Badges, Journey and role-authorized Coach/Academy/Admin operations. Use the full screen for the task rather than squeezing a desktop table onto a phone.

## 7. Role and discipline parity checklist

| Capability | Web | Mobile |
|---|---|---|
| Athlete profile and Taekwondo selector | Full profile and editable detail | Compact profile and selector |
| Kyorugi | Full Hub and bout records | Kyorugi Hub and focused bout workflow |
| Poomsae | Poomsae Studio, records and detailed review | Poomsae Studio, practice and result capture |
| Training | Full history and trend review | Fast log, timed session and compact trend |
| Competition | Detailed list, preparation and history | Event summary, quick actions and focused event screen |
| Coach / Academy | Detailed team and operational dashboard | Compact role entry plus focused operational screens |
| Messaging / notifications | Full review and account controls | Quick inbox and notification access |
| AI reports | Detailed report generation/history where eligible | Focused AI/report access where the mobile route is enabled |
| Admin / Super Admin | Full authorized control centre | Authorized mobile admin workspace for supported tasks |

A row is not complete merely because a button or route exists. Verify the underlying save, read, edit, refresh, relationship boundary and error state on both clients.

## 8. Acceptance tests before calling parity complete

- [ ] Create a training session on Web; confirm it appears in Mobile after refresh.
- [ ] Create a training session on Mobile; confirm it appears in Web with the same date, minutes and discipline.
- [ ] Create a Kyorugi bout on either client; verify the same bout and result on the other client.
- [ ] Create a Poomsae practice log and official result on either client; verify forms, category, repetitions, score, placing and notes on the other client.
- [ ] Verify changing the selected discipline never relabels or mixes historical records.
- [ ] Verify athlete, coach and academy summaries use only records visible to their permitted role and relationships.
- [ ] Compare shared KPIs using the same date range and definition on both clients.
- [ ] Check empty, slow-network, failed-refresh and no-upcoming-event states.
- [ ] Check phone-size layouts, accessible labels, touch targets and chart readability.
- [ ] Verify important mobile tasks remain reachable without needing a desktop.
- [ ] Complete Web CI, Mobile checks and physical-device acceptance before release sign-off.

---

**Design principle:** Web explains the whole picture. Mobile helps the user take the next action. The data, permissions and product capabilities remain AthleteN.
