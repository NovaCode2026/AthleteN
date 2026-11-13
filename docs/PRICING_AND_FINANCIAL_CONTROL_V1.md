# AthleteN Pricing and Financial Control — V1

**Status:** approved launch price points and tax-inclusive display policy; paid billing remains disabled pending billing, tax-invoice and release gates. India / INR. Prices below are customer-facing totals, inclusive of applicable GST; customers must not be charged GST on top of these displayed amounts.

| Plan | Monthly | Annual | AI requests/month |
|---|---:|---:|---:|
| Free | ₹0 | ₹0 | 0 |
| Pro | ₹99 | ₹999 | 50 |
| Elite | ₹199 | ₹1,999 | 200 |
| Coach | ₹499 | ₹4,999 | 750 |
| Academy | ₹799 | ₹7,999 | 1,000 shared |

Free includes core athlete records, medals, goals, calendar and Athlete Journey. Academy is fixed-price with two included coach seats, already enforced in the current academy workflow.

## Approved launch pricing and GST policy (2026-11-13)

The launch catalogue is locked at the monthly and annual amounts in the table above. Launch pricing choice: **same prices from launch**; there is no separate introductory-price phase or automatic post-launch increase. Annual amounts are billed once per year when recurring annual billing is implemented. The annual savings are compared with twelve monthly payments: Pro ₹189, Elite ₹389, Coach ₹989 and Academy ₹1,589.

**GST presentation:** all displayed plan amounts are GST-inclusive where GST is legally applicable. The displayed amount is the total customer price; do not add GST on top at checkout. When GST is chargeable, calculate the taxable value and GST component backwards from the inclusive amount using the legally applicable rate and correct place-of-supply/tax treatment, and show the required tax details on the invoice. Do not hard-code an assumed GST rate in the client. A qualified Indian tax adviser must confirm AthleteN's registration status, supply classification, rate, place-of-supply rules, invoicing and any cross-border treatment before paid checkout is enabled. If GST is not legally chargeable, do not represent a GST amount as collected. No price increase or separate tax surcharge is authorised by this decision.

This is a product-pricing decision, not a determination of AthleteN's GST liability. Checkout stays disabled until the tax treatment and provider implementation are reviewed and tested.

Student remains a legacy plan for existing subscribers only. Do not rewrite or reprice existing subscriptions. The seven-day no-charge trial is planned but not implemented; the legacy ₹9 trial endpoint remains server-gated.

## Initial operating envelope
Monthly ceiling for the first 100 active users: ₹500, pending actual provider bills.
| Category | Initial allocation |
|---|---:|
| AI | ₹150 |
| Storage and notifications | ₹75 |
| Monitoring and other services | ₹50 |
| Maintenance reserve | ₹125 |
| Contingency | ₹100 |
| **Total** | **₹500** |

## AI server variables
- `OPENAI_MODEL`: optional exact model identifier; defaults to `gpt-6-luna`.
- `ATHLETEN_AI_PRICING_MODEL`: required only when overriding the built-in pricing; must exactly match `OPENAI_MODEL`.
- `ATHLETEN_AI_INPUT_PRICE_PER_1M_TOKENS_PAISE` and `ATHLETEN_AI_OUTPUT_PRICE_PER_1M_TOKENS_PAISE`: both required together for any pricing override.
- The pinned `gpt-6-luna` default has conservative, versioned rates in source (₹11 input / ₹55 output per 1M tokens). Unsupported alternate models fail closed without an exact model-and-price override.
- `ATHLETEN_AI_MONTHLY_BUDGET_PAISE`: defaults to 15000 paise / ₹150.
- `ATHLETEN_AI_MAX_OUTPUT_TOKENS`: defaults to 600, bounded by server validation.

### Reviewed AI model and INR pricing basis (2026-11-13)
Use `gpt-6-luna` as the default text model. OpenAI describes it as an efficient model for focused, high-volume tasks, and it supports the Responses API used by AthleteN. The published standard text rates are USD $0.10 / 1M input tokens and USD $0.50 / 1M output tokens.

For launch budgeting, use a conservative planning conversion of ₹100 per USD plus a 10% buffer:
- Input: 1,100 paise per 1M tokens (₹11 / 1M).
- Output: 5,500 paise per 1M tokens (₹55 / 1M).
- Monthly platform AI ceiling: 15,000 paise (₹150).
- Maximum output: 600 tokens per response.

The ₹100/USD planning conversion is deliberately above the 13 November 2026 mid-market rate; provider invoices remain authoritative. Recheck rates before changing model IDs or pricing. These values are estimates for budget enforcement, not a substitute for reconciling actual API usage and billing.

Model documentation: https://developers.openai.com/api/docs/models/gpt-6-luna
Official API pricing: https://developers.openai.com/api/docs/pricing

AI reserves an estimated maximum cost before provider calls and settles against provider-reported usage. Timeouts consume the reservation conservatively. Token estimation is not a mathematical upper bound; validate model tokenizer/pricing and retain a safety margin. AI stays paused until the budget migration is safely applied and the production API key has been verified with the selected model. Alternate models remain paused until exact model-matched prices are configured.

## Payments and controls
Paid checkout remains disabled until recurring monthly/annual provider billing, signed webhook reconciliation, idempotency, renewals, cancellation, refunds, tax and legal requirements pass. The planned free seven-day trial is not active. Cashfree is not enabled for subscriptions because the existing path creates one-time orders.

Do not unlock paid features from client flags or return URLs. Verify all Supabase, Netlify, storage, email, push and payment costs from provider billing dashboards. Keep spending within cash received; alert at 50/70/80/90% of budget; preserve authentication, security and data access when AI spending is paused. Retain one month of operating costs before calling the service self-sustaining.
