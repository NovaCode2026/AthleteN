# AthleteN Pricing and Financial Control — V1

**Status:** proposed new-sale catalogue; paid billing disabled. India / INR.

| Plan | Monthly | Annual | AI requests/month |
|---|---:|---:|---:|
| Free | ₹0 | ₹0 | 0 |
| Pro | ₹99 | ₹999 | 50 |
| Elite | ₹199 | ₹1,999 | 200 |
| Coach | ₹499 | ₹4,999 | 750 |
| Academy | ₹799 | ₹7,999 | 1,000 shared |

Free includes core athlete records, medals, goals, calendar and Athlete Journey. Academy is fixed-price with two included coach seats, already enforced in the current academy workflow.

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
- `OPENAI_MODEL`: exact model identifier.
- `ATHLETEN_AI_PRICING_MODEL`: exact match to model.
- `ATHLETEN_AI_INPUT_PRICE_PER_1M_TOKENS_PAISE`: verified input cost per million tokens.
- `ATHLETEN_AI_OUTPUT_PRICE_PER_1M_TOKENS_PAISE`: verified output cost per million tokens.
- `ATHLETEN_AI_MONTHLY_BUDGET_PAISE`: defaults to 15000 paise / ₹150.
- `ATHLETEN_AI_MAX_OUTPUT_TOKENS`: defaults to 600, bounded by server validation.

AI reserves an estimated maximum cost before provider calls and settles against provider-reported usage. Timeouts consume the reservation conservatively. Token estimation is not a mathematical upper bound; validate model tokenizer/pricing and retain a safety margin. AI stays paused until model prices are verified and the budget migration is safely applied.

## Payments and controls
Paid checkout remains disabled until recurring monthly/annual provider billing, signed webhook reconciliation, idempotency, renewals, cancellation, refunds, tax and legal requirements pass. The planned free seven-day trial is not active. Cashfree is not enabled for subscriptions because the existing path creates one-time orders.

Do not unlock paid features from client flags or return URLs. Verify all Supabase, Netlify, storage, email, push and payment costs from provider billing dashboards. Keep spending within cash received; alert at 50/70/80/90% of budget; preserve authentication, security and data access when AI spending is paused. Retain one month of operating costs before calling the service self-sustaining.
