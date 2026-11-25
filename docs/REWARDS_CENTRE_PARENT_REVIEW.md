# AthleteN Rewards Centre — Parent & Guardian Review

**Product:** AthleteN — The Athlete Operating System  
**Feature:** Optional Rewards Centre  
**Review status:** Proposal for parent/guardian review; advertisements remain disabled

## What it does

AthleteN's Rewards Centre offers an optional way for eligible athletes to earn a small in-app benefit by choosing to watch a rewarded advertisement. Ads are never automatic, and declining them does not restrict existing AthleteN access.

## Reward rules

| Completed, provider-verified ad | Reward |
|---|---:|
| 1 ad | 2 bonus AI Coach messages |
| Daily limit | 3 completed ads |
| Monthly limit | 30 ad-earned AI messages |
| Credit expiry | End of the earning month |

Skipped, closed before earning, unavailable, invalid, or unverified ads earn no credits. Rewards are in-app credits—not cash, transferable funds, or a subscription.

## Age eligibility proposal

- **Adults (18+):** eligible after the adult age-verification path.
- **Teens (13–17):** eligible only after the account has an approved parent/guardian consent record and all provider/legal checks are satisfied.
- **Under 13:** not eligible for rewarded ads in this release.

Age is calculated by AthleteN's server from the account DOB. DOB is not sent to the ad provider. A locked self-entered DOB prevents ordinary profile edits, but is not independent proof of age; any age-assurance and consent requirements must be reviewed and approved by a responsible adult.

## Teen advertising safeguards

- Use Google's **TEEN** age treatment for rewarded-ad requests, conservatively for all requests in this feature.
- Non-personalised ads only; no behavioural targeting or remarketing.
- Conservative content rating and age-appropriate inventory.
- Explicit consent and privacy choices where required.
- Parent/guardian approval for teen accounts.
- No athlete health, injury, weight, school, training, biometric, or competition data sent to advertising networks.
- Ads are only shown after a user deliberately enters Rewards Centre and chooses to watch.
- Server-side verification—not a mobile callback—controls reward crediting.
- Daily/monthly limits, duplicate-event protection, and an admin pause control.
- Ads can be declined; normal app access remains unchanged.

## Privacy and account controls

AthleteN stores reward balances and history in its own secured ledger. The ad provider receives the ad request and the appropriate age-treatment signal, not the athlete's DOB or AthleteN records. Parent/guardian review should cover the privacy notice, applicable law, provider terms, and any account ownership requirements before live ads are enabled.

## Current engineering status

The branch now includes the proposed teen-eligibility logic:

- Teen ages 13–17 require an approved parent/guardian status.
- Adult accounts use the adult age-verification status.
- Under-13 accounts are denied rewarded-ad sessions.
- Rewarded-ad requests use the teen-safe treatment.
- The feature still fails closed behind environment approval gates.
- Production ad serving, real rewards, and database rollout are **not enabled**.

## Parent/guardian approval checklist

- [ ] Review the Rewards Centre concept and reward limits.
- [ ] Review age assurance, consent, privacy notice, and applicable Indian law/provider rules.
- [ ] Confirm the adult-authorized publisher account and agreements, if required.
- [ ] Confirm age-appropriate ad inventory and content/category restrictions.
- [ ] Review the test-build flow on a physical Android device.
- [ ] Approve any production activation only after all release checks pass.

**AthleteN's rule:** ads are optional, privacy-first, age-appropriate, and never a condition for using the platform.
