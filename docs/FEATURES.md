# AthleteN Feature Inventory

**Snapshot date:** 27 November 2026  
**Scope:** Candidate branch documentation. Statuses below distinguish code presence from operational acceptance.

Legend:
- **Implemented in source** — code/UI/API exists on the candidate branch.
- **Automated-tested** — relevant tests/workflows have passed on a cited exact head; re-check latest head before release.
- **Partial / gated** — implementation is incomplete, configuration is absent, or rollout is disabled.
- **Planned** — not represented as completed functionality.

## Athlete

| Feature | Source status | Acceptance notes |
|---|---|---|
| Athlete profile and sporting identity | Implemented in source | Verify account data, privacy and profile editing on-device |
| Training logs/history | Implemented in source | Shared web/mobile refresh and save/read acceptance required |
| Taekwondo discipline selection | Implemented in source | Kyorugi and Poomsae; validate history preservation |
| Kyorugi bouts and competition records | Implemented in source | Verify record ownership and cross-client refresh |
| Poomsae practice/performance | Implemented in source | Verify scoring/history |
| Competitions and calendar | Implemented in source | Real workflow and notification tests required |
| Medals, certificates, badges, milestones | Implemented in source | Verification/award permissions must be tested |
| Goals, attendance and Athlete Journey | Implemented in source | Record-level parity and device acceptance |
| Documents/private storage | Implemented in source | Upload/open/access/delete tests required |
| Scanner | Partial / acceptance required | Camera permission, OCR/data accuracy and error handling need device tests |

## Coach and Academy

| Feature | Source status | Acceptance notes |
|---|---|---|
| Coach profile and linked roster | Implemented in source | Coach/athlete relationship enforcement |
| Training and attendance tools | Implemented in source | Physical-device and authorization tests |
| Coach reports and analytics | Implemented in source | Plan/role/data-scope checks |
| Academy workspace and operations | Implemented in source | Candidate migrations require staging replay |
| Academy fees | Partial | Manual records; not online payment processing |
| Coach seat management | Partial | Payment-pending state; provider settlement not live |
| Academy announcements/notifications | Implemented in source | External SMS/email not implied |
| Parent/guardian portal | Partial / gated | Does not prove adult identity or legal guardianship |
| Transfer workflow and staff permissions | Implemented in source | Candidate migration, tenant isolation and staging acceptance |

## Communication

| Feature | Source status | Acceptance notes |
|---|---|---|
| Private conversations and groups | Implemented in source | Test member boundaries and persistence |
| Message search | Implemented in source | Conversation-local scope |
| Reactions, bookmarks, receipts | Implemented in source | Realtime/device acceptance |
| Edit/delete/hide actions | Implemented in source | Server-side ownership/time rules |
| Attachments | Implemented in source | Private storage, size/type, deletion and expiry |
| Disappearing messages | Implemented in source | Policy and cleanup acceptance |
| Push notifications | Partial / gated | Config, token registration and physical-device tests |
| End-to-end encryption | Planned / design gate | Do not claim current chat is E2EE |

## Intelligence, rewards and engagement

| Feature | Source status | Acceptance notes |
|---|---|---|
| AI Coach / reports | Partial / gated | Budget migration, model access, entitlement and server safety |
| Rewards wallet/ledger | Implemented in source, gated | Candidate migration and no production issuance |
| Rewarded ads | Not live | Native SDK lifecycle, consent/age configuration and provider approval outstanding |
| Daily leaderboard | Implemented in source, gated | Opt-in alias privacy and candidate migration staging |
| Analytics | Implemented in source | Confirm source correctness and cross-client parity |

## Admin and account safety

| Feature | Source status | Acceptance notes |
|---|---|---|
| Verification and Student proof queue | Implemented in source | Sensitive proof access must be restricted/audited |
| Scoped Admin operations | Implemented in source | Least privilege, audit and account-restriction tests |
| Support/feedback | Implemented in source | Sensitive fields and escalation process |
| Guardian access | Partial / gated | Adult-authorized consent and child-privacy review |
| Account deletion | Acceptance required | Verify data/storage deletion lifecycle and legal retention |

## Platform and release

| Area | Status |
|---|---|
| Web production build and automated tests | Workflow evidence exists; re-check exact current commit |
| Android source and bundle export | CI workflow exists; does not prove a signed installable release |
| Android native startup | **Open investigation**; recent diagnostic build reportedly exits splash/logo into black screen |
| Production database migration chain | **Blocked by migration-history drift**; no blind push/reset |
| Paid subscriptions | **Disabled / not production-ready** |
| Rewarded ads | **Disabled / not live** |
| Push delivery | Requires configuration and physical-device acceptance |
| Full Web/Mobile parity | Automated parity coverage exists; physical acceptance remains |
| Public production launch | **Not approved** |

See [Release Status](./RELEASE_STATUS_2026-11-27.md) and [Release Checklist](./RELEASE_CHECKLIST.md).
