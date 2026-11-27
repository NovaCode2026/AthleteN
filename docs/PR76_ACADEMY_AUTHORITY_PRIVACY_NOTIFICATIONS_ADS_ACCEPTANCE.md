# PR #76 — Academy authority, athlete privacy, notification acceptance, and rewarded ads

## Requested product rules

### Academy and Coach relationship
- An athlete linked to an Academy remains able to leave that Academy through a clear self-service action.
- Only the athlete's linked Academy can assign or change that athlete's Coach. Direct Coach assignment/connection must not bypass the Academy assignment authority while the athlete is Academy-linked.
- An Academy Admin account can also operate as a Coach: it may have its own coach roster, Coach dashboard, training/attendance workflows, and an included Coach seat, without needing a second account.
- Coach and authorized Academy staff may view athlete records relevant to the AthleteN training and competition workflow when they have a current, valid assignment/membership and the athlete has the appropriate consent/guardian safeguards. **Private messages and message contents are never included in Coach/Academy record access.**
- Access must be scoped to the assigned athlete/Academy, be revocable, audited for sensitive record access, and enforced by server/RLS—not just hidden UI.
- Do not treat “all details” as permission to expose private communications, credentials, account-security data, or unrelated personal data. Sensitive health/guardian data must remain separately permissioned and purpose-limited.

### Notifications
The PR currently contains the notification system and delivery-reliability implementation, but it is not yet production-verified. Acceptance requires:
- event producer + preferences + inbox/Realtime,
- device token registration and cleanup,
- Expo ticket/receipt tracking and retry/retirement,
- physical Android testing for permission grant/denial, foreground/background/killed delivery, tap routing, logout/account switching,
- browser background push only if separately configured and tested.
Do not describe notifications as “fully live” until deployment and device acceptance are evidenced.

### Rewarded ads
The current code intentionally fails closed behind adult/provider/privacy approval gates. This PR may finish integration, tests, and development test-ad behavior, but production ad serving/reward issuance must **not** be enabled by changing flags from this teen developer's account. A responsible adult must review and approve the publisher account, consent/age assurance, provider policy, privacy notice and applicable law, then configure production secrets and test inventory. Under-13 accounts remain ineligible; teen accounts require verified guardian approval; ads are optional and must not affect core access. Use non-personalized, age-appropriate requests and do not transmit athlete health, injury, weight, school, training or competition data to ad networks. Production remains paused until that adult review and exact-head QA are complete.

## Release and implementation status
This document records the requested scope and acceptance criteria; it is not evidence that every item has been implemented or production-deployed. Candidate database changes require migration-history reconciliation and isolated staging replay. PR #76 remains draft until exact-head checks and required acceptance gates pass.
