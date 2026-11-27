# AthleteN Pricing and Financial Control

**Updated:** 27 November 2026  
**Status:** Product-owner pricing discussion recorded; implementation reconciliation required. Paid billing is disabled.

## Product catalogue discussed and confirmed

| Plan | Monthly | Annual | Base AI messages/month |
|---|---:|---:|---:|
| Free | ₹0 | ₹0 | 0 |
| Student | ₹49 | ₹499 | **40** |
| Pro | ₹199 | ₹1,999 | 200 |
| Elite | ₹399 | ₹3,999 | 500 |
| Coach | ₹499 | ₹4,999 | 750 |
| Academy | ₹699 | ₹6,999 | 1,000 shared |

These are product-planning/customer-facing totals intended to be inclusive of applicable GST. The tax classification, registration, rate, place-of-supply, invoice and cross-border treatment must be reviewed by a qualified Indian tax adviser before checkout is enabled. Do not add GST on top of these displayed amounts without an approved pricing/tax decision.

## Source-code mismatch — must be resolved before launch

The candidate repository currently defines a different catalogue in `src/config/plans.ts` and `netlify/payment-common.mjs`:

| Source plan | Current source monthly | Current source annual | Current source AI allowance |
|---|---:|---:|---:|
| Free | ₹0 | ₹0 | 0 |
| Student (legacy) | Not for sale | Not for sale | 50 |
| Pro | ₹99 | ₹999 | 50 |
| Elite | ₹199 | ₹1,999 | 200 |
| Coach | ₹499 | ₹4,999 | 750 |
| Academy | ₹799 | ₹7,999 | 1,000 shared |

This documentation-only change does **not** change client catalogue code, server checkout prices, provider plan IDs, subscriptions, entitlements or database records. Before launch, reconcile the product-owner catalogue across:
- Web plan configuration
- Android plan screen
- Server-side paise/checkout mapping
- Provider recurring plan IDs
- AI entitlement and quota enforcement
- Subscription/billing tests
- Terms, privacy and billing copy

Do not advertise or charge the new catalogue until this reconciliation is implemented and tested.

## Rewarded-ad credit policy discussed

- Each successfully verified rewarded ad grants **2 bonus AI messages**.
- Maximum **3 successful ads per day**.
- Maximum **30 ad-earned AI messages per month**.
- Bonus credits are separate from plan allowances and expire at month-end.
- Ads are optional; declining must not restrict existing access.
- Rewards apply only when provider verification succeeds. Duplicate callbacks must not issue duplicate credits.

**Operational status:** not live. Native Android rewarded-ad lifecycle, UMP/consent integration, age-appropriate ad configuration, publisher approval, server gates, environment configuration and physical-device acceptance remain outstanding.

## Billing status

Paid checkout, recurring billing, trials, renewal/cancellation/refund lifecycle and live payment activation remain disabled until provider, webhook, tax, invoice, security and acceptance gates are complete.

## Financial controls

- Server chooses plan price; client-supplied amounts are never trusted.
- Keep provider credentials and webhook secrets server-side.
- AI usage must reserve estimated cost before provider calls and settle against actual provider usage.
- Pause/fail closed when budget controls or provider configuration are unavailable.
- Reconcile actual provider invoices; estimates are not authoritative.
- Verify storage, email, push, hosting and payment costs against the operating budget.

## Historical decisions

Older documents and code may contain earlier price points or Student legacy entitlements. Treat them as historical until source and billing are reconciled; do not silently reprice existing subscriptions.
