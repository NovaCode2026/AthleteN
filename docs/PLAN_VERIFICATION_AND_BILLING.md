# AthleteN Plans, Verification & Billing

**Updated:** 27 November 2026  
**Status:** Product catalogue discussed; current code and billing are not reconciled. Paid checkout remains disabled.

## Product-owner catalogue discussed

| Plan | Monthly | Annual | Base AI messages/month | Intended audience |
|---|---:|---:|---:|---|
| Free | ₹0 | ₹0 | 0 | Getting started |
| Student | ₹49 | ₹499 | **40** | Verified students, subject to approved eligibility |
| Pro | ₹199 | ₹1,999 | 200 | Athletes |
| Elite | ₹399 | ₹3,999 | 500 | Competitive athletes |
| Coach | ₹499 | ₹4,999 | 750 | Verified coaches |
| Academy | ₹699 | ₹6,999 | 1,000 shared | Verified Academy Admins |

See [Pricing & Financial Controls](./PRICING_AND_FINANCIAL_CONTROL_V1.md) for the code/source mismatch and rewards rules.

## Current implementation mismatch

The candidate source catalogue still differs: Pro ₹99/₹999 and 50 AI requests; Elite ₹199/₹1,999 and 200; Student is legacy-only with 50; other plan price points remain Coach ₹499/₹4,999 and Academy ₹699/₹6,999. The new catalogue must not be represented as implemented until client, server, billing provider and entitlement tests agree.

## Verification, payment and entitlement are distinct

| Stage | What it proves | Unlocks paid features? |
|---|---|---|
| Account verification | Eligibility or identity checks required for a product | No, not by itself |
| Payment provider confirmation | Provider reports a valid payment | Only after server validation and processing |
| Active subscription | Server records an active entitlement for the correct role/plan | Yes, within permissions |

A plan selection, proof submission, verification approval or return URL must never activate a subscription by itself.

## Role and verification boundaries

- A plan must not silently change account role.
- Coach access requires the assigned/verified Coach role and required email confirmation.
- Academy access requires the authorized Academy Admin role, active owned workspace, completed setup and verified contact email where required.
- Student eligibility/verification is subject to the product decision and policy review. Under-18 consent/guardian workflows do not prove adult identity or legal guardianship.
- Server endpoints and database policies re-check roles, relationships, ownership, eligibility and entitlement.

## Billing state

**Paid checkout is disabled.** The repository's launch gate remains fail-closed. Provider recurring plans, signed webhook processing, idempotency, renewal, cancellation/refund, tax/invoice acceptance and a real trial must be completed and tested before activation.

## Required pre-launch tests

- [ ] Client and server catalogues match the approved prices/allowances.
- [ ] New Student eligibility and proof workflow match the final product decision.
- [ ] Wrong-role checkout is blocked.
- [ ] Unconfirmed/ineligible accounts are blocked.
- [ ] Provider failure/cancellation does not grant paid access.
- [ ] Forged return URL does not activate a subscription.
- [ ] Valid webhook activates once.
- [ ] Duplicate webhook is idempotent.
- [ ] Expired/cancelled subscription loses paid entitlement.
- [ ] Cross-role/cross-user access is denied.
- [ ] Tax and invoice totals are reviewed and tested.
- [ ] Trial terms and implementation match the approved decision, if a trial is retained.

**Never open the paid-launch gate merely to make a checkout button work.**
