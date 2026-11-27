# AthleteN Rewarded Ads & Rewards Centre — Product and Engineering Plan

**Status:** Proposed specification / implementation plan  
**Created:** 24 November 2026  
**Target delivery window:** Two days from approval (aspirational; not a release guarantee)  
**Initial platform:** Android rewarded ads; web reward redemption and provider support to follow only where the chosen network and policies permit  
**Release posture:** Feature-flagged and disabled by default. No production ads, reward issuance, or ad-network payments until account approval, privacy review, implementation, and acceptance tests are complete.

## Implementation snapshot — 24 November 2026

The following foundation has been committed on PR #76:

- Candidate reward-ad session and immutable reward-ledger schema, with RLS enabled and no client table policies.
- Server-side AdMob ECDSA SSV verification, transaction idempotency, per-user serialization, three-ad daily cap, 30-credit monthly cap, and month-end expiry.
- Authenticated wallet/history and short-lived ad-session endpoints, including session creation rate limiting.
- AI Coach fallback to a separate bonus-credit reservation after subscription quota is exhausted; the existing platform AI spending reservation remains mandatory.
- Mobile Rewards Centre wallet/history screen and Explore navigation entry.
- Wallet balances and daily/monthly caps are calculated from the complete server-side ledger (not a truncated history sample); reward history uses stable cursor pagination.
- Static security regression tests and an isolated PostgreSQL integration workflow for daily/monthly caps, duplicate events, expiry, credit reservation/refund, Student verification and client-role denial.

**Not yet implemented:** native Android ad SDK dependency/configuration, consent and ad-request lifecycle, actual rewarded-ad presentation, production app/ad-unit IDs, and end-to-end physical-device verification. The wallet aggregate and paginated history are repository-backed; the new summary RPC is a candidate migration and must be replayed in staging before the endpoint is deployed. The wallet screen intentionally states that ads are not live. Session creation is fail-closed unless the global feature, live approval, minor-safety approval and ad-unit environment gates are all explicitly configured.

The SQL files are candidate migrations only. They have not been applied to production. Do not enable the live environment gates or merge this PR until native SDK integration, consent and age-appropriate ad treatment, isolated SQL integration, mobile builds, and adult/legal/provider review are complete.

## 1. Product objective

Offer athletes an optional way to earn small in-app benefits by choosing to watch a rewarded advertisement. Ads must never interrupt a user, block core functionality, or be required to use AthleteN. Users choose whether to watch an ad and, where supported, which available reward to redeem.

This feature is intended to supplement—not replace—subscription allowances and must not make AthleteN financially dependent on unverified advertising revenue.

## 2. Confirmed product decisions

| Decision | Specification |
|---|---|
| Eligibility | All plans; adults and parent/guardian-approved teens aged 13–17. Accounts under 13 are not eligible in this release |
| Participation | Entirely optional; explicit user opt-in for each ad |
| Reward for one successfully completed rewarded ad | 2 bonus AI messages |
| Daily ad limit | At most 3 successfully rewarded ads per user per calendar day |
| Monthly AI bonus cap | At most 30 ad-earned bonus AI messages per user per calendar month |
| Verification | Server-side verification (SSV) or equivalent trusted provider verification; never trust a client callback alone |
| Subscription allowance | Keep subscription AI allowance and ad-earned bonus credits in separate ledgers |
| Incomplete, skipped, unavailable, or invalid ad | No reward |
| User choice | Users may decline and continue using the app with their existing entitlements |
| Expiry | Show an explicit expiry date; proposed ad-earned AI credits expire at the end of the calendar month in which they are earned and do not roll over |
| Initial rollout | Android first, using test ad units during development; production ad serving stays disabled until approval and release gates pass |

The monthly bonus cap is a cap on **ad-earned AI messages**, not a promise that users can always receive 30. Actual availability depends on valid completed ads and remaining limits.

## 3. Rewards Centre

Create a dedicated Rewards Centre with:

- Available rewards and the credit/ad cost for each reward.
- Clear explanation of what the user receives before opting into an ad.
- Current reward-credit balance and remaining daily/monthly earning limits.
- Reward history: earned, redeemed, expired, reversed, and the timestamp/reason.
- Expiry dates and a clear explanation of monthly expiry.
- A visible way to decline or leave without watching.
- Accessible loading, no-fill, network-error, and retry states.

### Proposed reward catalogue (costs require product and cost approval)

| Reward | Proposed earning/redemption rule | Notes |
|---|---|---|
| AI Coach messages | 1 completed ad = 2 bonus messages | Confirmed reward |
| Training analysis | Redeem a separately defined credit cost | Do not imply clinical or medical analysis |
| Competition preparation report | Redeem a separately defined credit cost | Must be grounded in user-provided records |
| Temporary premium theme | Redeem a separately defined credit cost | Cosmetic only; no paid entitlement |
| Profile themes / cosmetic customisation | Redeem a separately defined credit cost | No competitive advantage |

No conversion rate for non-AI rewards is approved yet. Do not ship these redemptions until their credit costs, expiry treatment, eligibility, and server-side cost controls are explicitly approved.

## 4. Non-ad achievement rewards

The Rewards Centre may also recognise safe, non-ad engagement:

- Completing an athlete profile.
- Recording a training session.
- Completing a user-defined monthly goal.
- Adding a verified competition result or certificate.

Achievement rules must not encourage excessive training, unsafe weight changes, overtraining, or unnecessary competition participation. Do not reward training volume, calories burned, weight loss, or training through pain. Use one-time or sensible cadence limits and prevent duplicate claims. Achievement rewards should be separately identified from ad-earned credits.

## 5. Advertising provider and revenue model

### Initial provider

Evaluate Google AdMob Rewarded Ads for the Android application. Use Google's official SDK, test ad unit IDs in development, and server-side verification for reward callbacks. Do not ship production ad unit IDs or enable live requests before the publisher account and app are approved.

AdMob connects advertiser demand to eligible app inventory. Advertisers pay the advertising network; the network reports publisher earnings and pays the approved publisher account subject to its terms, thresholds, invalid-traffic controls, tax and payment requirements. Revenue is variable, not a guaranteed payment per view. Do not forecast revenue from assumed CPMs.

### Direct sponsorships (later phase)

A separate, later commercial channel may allow approved sports-equipment brands, academies, and tournament organisers to sponsor clearly labelled placements. Direct sponsorships require advertiser due diligence, written agreements, creative review, age-appropriate content, conflict checks, invoicing/tax review, and a manual approval workflow. Do not mix direct sponsorship billing with AdMob reward verification.

## 6. Minor safety, privacy, and account ownership

AthleteN may be used by minors. Before any live advertising:

- A parent or guardian must handle publisher-account creation, agreements, tax/payment details, and any required business authorisations where the platform/provider requires an adult account holder.
- Complete a documented review of applicable Indian law, Google Play requirements, AdMob policies, privacy notices, consent requirements, and child/teen restrictions with an appropriately qualified adult/legal adviser.
- Configure age-appropriate ad treatment and child/teen privacy controls as required by provider policy and applicable law. Parent/guardian approval is required for teen (13–17) rewarded-ad access. Accounts under 13 remain ineligible for this release. Personalised advertising and remarketing are disabled; use age-appropriate inventory and review provider/legal requirements before activation.
- Do not collect extra personal data to improve ad targeting. Do not send athlete health, biometric, weight, injury, training, school, or competition data to ad networks.
- Do not show ads that are unsuitable for minors or categories that could harm young users. Apply provider content ratings and block categories where supported.
- Explicitly block gambling/betting, alcohol, tobacco/nicotine, weapons, adult content, dating, and other age-inappropriate or high-risk ad categories wherever the provider exposes category controls; verify the settings in the publisher console and test inventory rather than assuming a content rating alone is sufficient.
- Do not create misleading buttons, fake close controls, forced viewing, or reward promises that cannot be fulfilled.
- Provide a privacy notice and a clear explanation that the user is choosing to view an advertisement in exchange for a stated in-app reward.

Provider eligibility, app approval, teen consent workflow, consent, and ad inventory must be confirmed before production activation. If policy or legal eligibility is uncertain, keep the feature disabled.

## 7. Technical architecture

### Android client

- Integrate the current supported Google Mobile Ads SDK version for the app's Expo / React Native architecture; confirm compatibility with the project's Expo SDK before selecting a native module or config plugin.
- Load rewarded ads only after explicit user intent or a suitable user-initiated screen entry.
- Use test ad units in development and test builds.
- Present the exact reward (2 bonus AI messages), daily limit, monthly cap, and any applicable expiry before the user opts in.
- Treat client completion callbacks as UI signals only; never mint credits locally.
- Provide graceful no-fill/offline/error states and a clear cancel/decline path.
- Do not show an ad automatically on app launch, during training, scoring, messaging, or AI generation.

### Verified native SDK target and consent gate

The current mobile app is on Expo SDK 57 / React Native 0.86.3. The maintained `react-native-google-mobile-ads` v17.4.0 package declares React Native `>=0.86.0`, so it is a compatible candidate for this project. Its Expo config plugin requires a native development build; Expo Go is not supported. Pin and validate the exact package version in the lockfile before adopting it, then run Expo prebuild, Android build, Expo Doctor, and physical-device QA.

Required implementation order:

1. Resolve age eligibility server-side before any ad session. Adults are eligible through the adult age-verification path; teens aged 13–17 require an approved parent/guardian consent record; accounts under 13 are ineligible for this release. Do not send date of birth or identity documents to the ad provider.
2. Set the global request configuration before SDK initialization. Use a conservative maximum ad content rating (`PG`) and the `TEEN` age-restricted treatment for all rewarded-ad requests as a conservative default. Never use `UNSPECIFIED` for this feature. Google's teen treatment disables personalized ads and remarketing; confirm this configuration through adult-authorized compliance review.
3. Run Google's User Messaging Platform consent update and any required consent form before initializing the Mobile Ads SDK. If the user cannot request ads after the consent flow, keep the ad placement unavailable. Consent must be revocable/manageable where required.
4. Initialize the SDK only after the age and consent gates pass. Load only the rewarded format, only from the Rewards Centre after a clear user action. Do not preload from app launch or other screens.
5. Use Google's test app/ad unit IDs in development. Production IDs must be injected through the approved build environment and must never be committed to source control. Production builds must fail closed if IDs or the release approval configuration are absent.
6. Attach the short-lived server-issued `customData` token to the rewarded ad's SSV options before display. Treat the client reward callback as a UI signal only; wait for the verified AdMob SSV callback before showing the wallet credit as earned. A delayed callback must show a pending state, not mint client-side credit.
7. Test load, no-fill, show failure, early close, completed reward, duplicate SSV, forged callback, expired session, offline behavior, and consent denial on a physical Android device. Verify that only the server ledger changes the wallet.

The selected SDK's v17 API exposes `ageRestrictedTreatment` values `child`, `teen`, and `unspecified`, plus the UMP consent helper. This project must use the age-treatment API rather than relying on deprecated child/under-age booleans. The native SDK integration is not complete until the exact dependency and lockfile, config plugin, consent lifecycle, request configuration, SSV custom-data attachment, and device test evidence are committed.

### Backend and database

- Add a server-owned reward ledger with immutable earning/redemption/expiry/reversal entries.
- Persist provider, provider transaction/event identifier, user ID, reward type, amount, status, timestamps, and safe audit metadata. Never store ad network secrets in client code.
- Verify provider SSV signatures and expected ad unit / reward / transaction fields on the server.
- Enforce unique provider transaction IDs and idempotent event processing.
- Enforce daily and monthly caps using server time and a transaction/locking strategy that prevents concurrent duplicate claims.
- Issue the 2 AI bonus messages atomically only after a verified eligible event.
- Keep bonus balance separate from plan allowance. Define and test the order in which the AI endpoint consumes subscription quota versus bonus quota; never silently decrement both.
- Enforce expiry server-side and show it to the user. Prevent client-side balance edits.
- Ensure RLS and server authorization prevent users from reading or changing another user's wallet or history.
- Add an admin-controlled kill switch and feature flags. Default all live ad/reward flags to off.
- Add rate limits, abuse detection, reconciliation logs, and a support-safe reversal path for provider-invalidated events.

### AI quota integration

The AI endpoint must compute available plan allowance and bonus allowance server-side. Ad-earned credits must not increase a paid subscription's entitlement, change plan status, or unlock premium features. A user with no plan allowance may use valid bonus messages if otherwise eligible. When a request fails before provider processing, quota handling must follow the existing AI budget ledger's reservation/settlement rules; do not invent a second unmetered AI path.

### Mobile navigation and Rewards Centre placement

The mobile Rewards Centre has three deliberate entry points:

1. **Primary entry:** Explore → Account & Subscription → Rewards Centre. Keep this as the canonical navigation destination.
2. **Profile shortcut:** Add a compact Rewards Centre card to the athlete Profile screen, below the profile identity header. This is a secondary shortcut; it must not expose sensitive athlete data to an ad provider.
3. **AI quota fallback:** When the subscription AI allowance is exhausted or the plan has no included AI requests, show a contextual link to Rewards Centre from AI Coach. The AI endpoint remains authoritative: it may use a valid reward credit if available, and must return a clear quota response otherwise.

Do not add automatic pop-ups, interstitial prompts, or ad prompts to Home, Training, or Competition screens. Do not interrupt a training or competition workflow to promote rewards. The user must navigate to Rewards Centre and explicitly opt in before any future ad can be requested.

### Web

Web reward wallet/history may display and redeem rewards earned on Android after authentication. Do not assume AdMob's Android rewarded inventory can be embedded on web. Any web ad provider integration is a separate approval and policy review. Keep web ad playback disabled until a supported web provider is selected and verified.

## 8. Security and abuse controls

- Server-side provider SSV signature verification.
- Unique event ID / transaction ID constraint.
- Idempotent processing under retries and concurrent callbacks.
- Per-user daily and monthly caps enforced in the database transaction.
- Server-derived user identity; never accept user ID, reward quantity, or credit balance as trusted client input.
- Validate ad unit, reward type, amount, provider app identity, and timestamp.
- Reject replayed, malformed, stale, or mismatched events.
- Separate admin audit events from user-visible reward history.
- Feature kill switch must stop new ad requests and reward issuance without affecting authentication, athlete records, or existing subscription entitlements.

## 9. Admin controls and observability

Admin controls should support:

- Global enable/disable for ad requests and reward issuance.
- Separate test/live environment status.
- Provider and ad-unit configuration status without exposing secrets.
- Approved reward catalogue and credit costs.
- Daily/monthly caps.
- Reward-event and reconciliation views.
- Invalid/reversed event counts and no-fill/error rates.
- Estimated ad revenue and provider-reported payout data, clearly distinguished from cash received.
- AI cost attributable to bonus messages.
- Audit trail for every configuration change.

Do not provide an admin feature that can silently alter an individual user's reward history or subscription allowance.

## 10. Two-day implementation plan

This is an aggressive engineering target, not a guarantee of production readiness. The two-day goal is to produce a reviewed, tested, feature-flagged implementation candidate—not to bypass provider approval or production safety gates.

### Day 1 — Specification, backend, and Android foundation

- Confirm Expo SDK compatibility and select the maintained AdMob integration.
- Implement schema/ledger design and isolated database tests.
- Implement SSV verification endpoint, idempotency, daily/monthly caps, and atomic reward issuance.
- Add AI quota integration with separate subscription and bonus balances.
- Add feature flags defaulting to disabled.
- Add Android Rewards Centre UI and test-ad integration.
- Add tests for duplicate callbacks, forged callbacks, cap races, expiry, and cross-user access.

### Day 2 — Integration, QA, and review

- Complete Android ad lifecycle and no-fill/offline/decline states.
- Complete wallet, history, expiry display, and approved reward catalogue UI.
- Complete achievement reward rules only if they are safe, bounded, and covered by tests.
- Add admin controls and audit visibility.
- Add web read-only wallet/history if the API and parity tests are ready; do not add unsupported web ad playback.
- Run web/mobile tests, lint, TypeScript, Expo Doctor, database integration tests, and production builds.
- Review privacy, child/teen policy, provider account eligibility, and release configuration.
- Attach exact test evidence and unresolved blockers to the PR.

## 11. Acceptance criteria

- [ ] All plans can access the optional Rewards Centre when the feature is enabled.
- [ ] User must explicitly choose to watch each ad.
- [ ] User can decline and continue with existing app access.
- [ ] One valid completed rewarded ad grants exactly 2 bonus AI messages.
- [ ] Incomplete, skipped, no-fill, invalid, forged, or replayed events grant zero.
- [ ] Maximum 3 successful rewarded ads per user per day.
- [ ] Maximum 30 ad-earned AI messages per user per calendar month.
- [ ] Caps remain correct under simultaneous requests and callback retries.
- [ ] Subscription AI quota and bonus quota remain separate and auditable.
- [ ] Monthly expiry is enforced and visible; credits do not roll over.
- [ ] Reward wallet and history are isolated by user and protected by RLS/server authorization.
- [ ] Non-AI reward costs are explicitly approved before those redemptions are enabled.
- [ ] Achievement rewards cannot encourage unsafe training or duplicate claims.
- [ ] No ad appears automatically or in critical training/competition flows.
- [ ] Ad network receives no athlete health, biometric, weight, injury, or training data.
- [ ] Feature flags default to disabled and kill switch is tested.
- [ ] Android test ads are used in development; no production ad request is made before provider approval.
- [ ] Web does not attempt to play Android AdMob inventory.
- [ ] Provider account, privacy, minor safety, legal/tax, and payment eligibility reviews are documented.
- [ ] CI passes on the exact PR head and all unresolved risks are documented.

## 12. Explicit non-goals and release boundaries

- This plan does not create or approve an AdMob publisher account.
- This plan does not establish guaranteed ad revenue or a fixed payout per view.
- This plan does not enable production advertisements, payment collection, or production reward issuance.
- This plan does not change plan pricing, subscription entitlements, or paid checkout.
- This plan does not make Student available for new purchases or alter legacy Student subscriptions.
- This plan does not apply Supabase production migrations or modify production data.
- This plan does not add behavioural ad targeting.
- This plan does not make web rewarded ads available without a separately approved provider.
- This plan does not claim the two-day target overrides testing, privacy, provider, or release gates.

**Release rule:** If any critical security, quota, provider, privacy, minor-safety, or acceptance gate is open, keep live ads and reward issuance disabled. A tested feature-flagged candidate is preferable to an unsafe live launch.


## Integrated Rewards Centre update — 24 November 2026

- Added a web Rewards Centre route with the same authenticated wallet API and cursor-paginated history as mobile.
- Added a read-only summary of existing AthleteN achievement badges. Badge recognition is separate from redeemable credits; no training-volume, weight-loss, calorie, or competitive-advantage reward rules were introduced.
- Hardened ad-session issuance with a user-bound `get_age_verification_status` check. Only accounts whose stored status is `not_required` and whose stored date of birth independently calculates to age 18+ can request an ad session. Parent-approved minor accounts, missing/invalid age records, and QA-only states are denied. The date of birth is not sent to AdMob.
- Existing global feature, live-approval, minor-safety-approval and ad-unit configuration gates remain mandatory. An unavailable ad never blocks existing AthleteN access.
- Native Android rewarded-ad presentation, app IDs, consent lifecycle and development-build/device verification remain separate release gates. No production ads are enabled.
- All migrations remain candidate-only and must be reconciled/replayed in isolated staging before any rollout.

## Native Android AdMob integration slice — 24 November 2026

- Added and pinned `react-native-google-mobile-ads@17.4.0`, compatible with the app's React Native 0.86.3 baseline, plus the required Expo config plugin.
- Dynamic Expo config uses Google's official sample App IDs by default. Real App IDs are read only from the adult-managed build environment; the ad unit ID is not committed to source.
- Added Android-only rewarded presentation with UMP consent before SDK initialization, a PG content rating, non-personalized ad requests, and a server-issued SSV `customData` value attached to the request.
- Development builds use Google's rewarded test unit. Production presentation requires a separately supplied ad-unit value and the existing server-side ad approval gates.
- The client reward callback is presentation feedback only. It never adds credits; the wallet changes only after AdMob's signed SSV callback is verified by AthleteN's backend.
- Added a platform-specific web fallback, a user-initiated Rewards Centre CTA, and the small `Ad · Not endorsed` disclosure label. The CTA is hidden unless the local profile has an adult DOB and the mobile feature flag is enabled (or the app is a development build); the backend independently verifies adult or approved teen eligibility before issuing a session.
- CI and native-device testing are pending on the resulting exact PR head. A development/EAS native build is required; Expo Go cannot load this native module.

### Remaining release gates

- Verify the publisher account and app IDs with the responsible adult and Google provider setup; review the ad unit and account ownership.
- Complete the required child/teen privacy, policy and legal review. Parent/guardian-approved teens aged 13–17 are eligible in the proposal; accounts under 13 remain ineligible.
- Verify the UMP privacy-options entry point and consent-denial, offline, no-fill, early-close, show-failure and completed-ad states on a physical Android device.
- Confirm the exact production EAS environment and Netlify approval flags only after review. Keep production ad serving and reward issuance disabled until all evidence is recorded.
- Reconcile and replay candidate Supabase migrations in isolated staging. No production migration, deployment or reward enablement is authorized by this implementation.


## Admin reward operations and emergency pause — 24 November 2026

- Added an admin-only database read model for daily verified ads, monthly credits earned/redeemed, the latest 50 ledger events, and the latest 20 administrative safety actions.
- The browser does not receive direct table access to reward sessions, reward ledger, controls, or audit rows. Admin access is enforced again inside the database functions using the authenticated profile role.
- Added a one-way emergency pause for new rewarded-ad sessions. It records the administrator and reason, and the server checks it before creating a new session.
- Previously issued sessions can still complete through Google's signed SSV callback; pausing does not discard a reward already earned with Google.
- No browser-facing unpause or live-ad activation control exists. Resumption requires a separate adult-owned release review and server environment approval.
- Added isolated PostgreSQL integration coverage for admin visibility, athlete denial, pause audit, and service-role enforcement. This is CI/staging evidence only, not proof that the candidate migration has been applied to a real staging project.
