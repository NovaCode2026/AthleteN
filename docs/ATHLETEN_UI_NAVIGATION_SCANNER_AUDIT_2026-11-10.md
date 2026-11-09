# AthleteN Product UI, Navigation & Scanner Audit

**Audit date:** 10 November 2026  
**Scope:** Web + Android UI, navigation discoverability, messaging identity, tournament scanners  
**Disposition:** Implement safe navigation and identity improvements; keep the duplicate-feature inventory for product-owner decisions. No user data or feature records deleted.

## Implemented in this branch

1. **More is permanently pinned.** The mobile bottom bar now reserves five customizable shortcuts plus More. Loading saved preferences, realtime preference updates and local fallback all normalize the list so More cannot disappear.
2. **Navigation customization protects More.** Users can add, remove and reorder the five other shortcuts; More is pinned and cannot be removed or moved. The saved preference remains capped at six entries for compatibility with the existing preference RPC.
3. **Messaging identity is more complete.** Direct conversations on web and mobile now display the other person's profile photo when available, display name, username, plan label and account role. Existing private avatar storage and signed-URL flow are retained.

## Scanner audit — findings and acceptance status

The web scanner is a separate component using Netlify Functions; the mobile scanner calls the same scanner endpoints. This is a good shared-service direction, but it does not prove every source is readable or every extracted fact is correct.

### Website scanner

**Existing strengths found in code**
- Authenticated requests and per-user scan ownership.
- Public HTTP/HTTPS URL validation and private/special-use IP blocking tests.
- Same-site relevant-page discovery and linked PDF discovery.
- Structured-event extraction and PDF text extraction tests.
- Date parsing includes Indian day-first numeric dates.
- Source status can be marked blocked instead of presenting a failed read as a successful scan.
- Source links, page counts, extracted facts and evidence conflicts are represented in the result model.

**Still not proven / required**
- Live tests against a representative set of real Taekwondo federation, academy and tournament websites.
- JavaScript-rendered pages, bot protection, login walls, rate limits and scanned-image-only PDFs can still prevent complete extraction.
- OCR accuracy and poster extraction need a fixture set with expected values and human review.
- Cross-page facts need provenance shown next to each important field, not just a list of scanned URLs.
- Scanner result must clearly distinguish verified source facts, extracted-but-unconfirmed facts, conflicting facts and unavailable fields.
- Test redirect chains, DNS rebinding protections, response-size/time limits and malformed PDF handling end-to-end.

### Instagram scanner

**Existing strengths found in code**
- Input parser accepts Instagram post, Reel and public organizer-account URL shapes.
- Backend has a dedicated Instagram tournament scan function, poster/OCR extraction and organizer discovery flows.
- The test plan explicitly forbids invented facts, false event dates, silent conflict resolution and automatic merges.
- Manual merge and tournament grouping are user-confirmed; source scans are retained.

**Platform limitations**
- Instagram/Meta does not guarantee access to arbitrary public posts, private accounts, personal accounts, every Reel or all media metadata. Business Discovery is restricted to eligible public professional accounts and connected permissions.
- A successful API response does not prove that all relevant post history, captions, video frames or spoken audio were accessible.
- A Reel transcript must never be implied unless a transcript was actually returned or separately supplied.
- Token expiry, missing permissions, rate limits and account-type restrictions must be shown as actionable states.

**Still not proven / required**
- Real account acceptance tests for public professional organizer accounts, post URLs, Reel URLs, unavailable/private sources, expired token and revoked permissions.
- OCR/poster fixtures with expected tournament names, event dates, reporting dates, divisions, fees, venue, organizer and registration URLs.
- Evidence provenance for every extracted fact and explicit confidence/uncertainty states.
- A human review screen before saving important event details into the athlete's competition calendar.
- No claim of “perfect” scanning until source coverage and extraction accuracy have been measured on a labelled test set.

## Duplicate / overlap inventory — do not delete yet

These are candidates for consolidation or clearer naming. Some are intentionally separate workflows, so this is not a deletion list.

| Candidate overlap | Why it looks duplicated | Recommended decision before removal |
|---|---|---|
| Training / Training Session Mode | Both relate to training | Keep Training as history/planning; Session Mode as live timed workflow. Clarify labels. |
| Calendar / Competition Mode / Checklist | All expose event preparation | Keep calendar as timeline, competition mode as event workspace, checklist as task list. Link them together. |
| Journey / Athlete Journey | Similar journey and milestone language across web/mobile routes | Choose one canonical page/route and retain redirects/aliases until verified. |
| Messages in primary navigation and More | Same destination appears in two places | Keep one canonical route; allow shortcut pinning, but avoid duplicate cards in More if already pinned. |
| Scanner in primary navigation and More | Same destination appears in two places | Keep More as the permanent directory; only show scanner shortcut once in the visible More list if pinned elsewhere. |
| AI Coach in primary navigation and More | Same destination appears in two places | Same treatment as Scanner. |
| Profile / Settings / Navigation Settings | Account controls are split across destinations | Keep profile identity separate; consolidate preferences under Settings with clear sub-sections. |
| Verification / Verify / Student verification | Similar labels can imply the same workflow | Audit role-specific states and route aliases; use one user-facing label per workflow. |
| Medals / Badges / Achievements | Recognition records overlap conceptually | Keep medals as competition results; badges as platform/achievement awards. Avoid duplicate award records. |
| Reports / Analytics / Athlete Passport | All present athlete performance data | Keep analytics interactive, reports exportable, passport shareable identity. Avoid duplicate metric cards. |
| Coach / Team / Academy | Relationship and workspace concepts overlap | Keep Coach relationship, Team connections and Academy administration distinct; explain ownership clearly. |
| Notifications / Notification Settings | Same subject but different purpose | Keep inbox separate from preferences. |

## Product-wide visual and interaction standards to apply

- Consistent AthleteN dark design tokens, spacing, typography, cards, empty states, loading states and error states across web and mobile.
- Every button must have a real action, a disabled/loading state where appropriate, and a visible success/error result.
- Every route must have a working back path, active navigation state, and no dead-end screen.
- Navigation settings must be discoverable from More and Settings. More remains pinned permanently.
- Profile identity should consistently show photo, display name, username/account code, role and plan where appropriate; never expose private account data to unrelated users.
- Plan badges must reflect the effective active entitlement, not merely a stale profile field.
- Paid feature locks must explain which plan unlocks the feature and link to Plans; billing stays disabled until payment acceptance is complete.
- Avoid showing the same destination twice in the same navigation surface.
- Preserve accessibility labels, touch target sizes, keyboard behavior and responsive layouts.

## Verification performed

- Source review only for this audit. The changes have not yet been run through local TypeScript, ESLint, Expo Doctor, Android export, browser interaction tests or physical-device acceptance.
- Existing scanner regression tests were inspected; they cover URL safety, PDF text, date parsing, structured event extraction and several mobile scanner behaviors, but they do not establish real-world Instagram/website extraction accuracy.
- No production deployment, database migration, data deletion or billing change was made.
