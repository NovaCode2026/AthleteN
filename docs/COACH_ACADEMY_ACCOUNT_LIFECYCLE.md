# Coach and Academy account lifecycle

This document describes the current AthleteN mobile flow and its remaining backend gate.

## Product distinction

- **Athlete Intelligence** is the saved-record analytics destination. It calculates training, weight, competition and goal trends from the signed-in account.
- **AI Coach** is the conversational assistant. The mobile client calls the protected Netlify function `/.netlify/functions/ai-coach` with the signed-in access token. Server-side plan, subscription, quota and platform-budget checks remain authoritative. If those gates are not ready, the screen must show the service error; it must not substitute scripted text and call it an AI response.

## Plan catalogue (INR)

| Plan | Monthly | Yearly | Monthly AI requests |
|---|---:|---:|---:|
| Free | ₹0 | ₹0 | 0 |
| Student (legacy) | ₹99 reference | ₹999 reference | 50 |
| Pro | ₹99 | ₹999 | 50 |
| Elite | ₹199 | ₹1,999 | 200 |
| Coach | ₹499 | ₹4,999 | 750 |
| Academy | ₹799 | ₹7,999 | 1,000 shared |

Student is a legacy entitlement for existing approved subscribers only. Its displayed numbers are the legacy entitlement catalogue reference; existing subscription terms are preserved and no new Student purchases are offered.

The mobile and web catalogues state that displayed plan amounts are GST inclusive where applicable. Paid checkout is currently disabled in both client and server; the prices are catalogue information, not proof that a purchase can be completed.

## Requesting a Coach account

1. Create a normal AthleteN login.
2. Open **More → Support & Safety / Support Center** and submit a private role-review ticket.
3. AthleteN Admin reviews the request and assigns the Coach role through the administrator-controlled workflow.
4. Confirm the account email.
5. The Coach workspace and Coach subscription options become available when role and billing checks are satisfied.

The Coach plan requires an existing Coach role and confirmed email. It is not intended to be a role-creation purchase button.

## Requesting an Academy account

1. Create a normal AthleteN login.
2. Submit a private Support Center request for Academy Admin role review.
3. After an administrator assigns the role, open Academy Setup.
4. Complete academy name, city, state, country, contact email and phone.
5. Verify the contact email and finish setup.
6. Academy plan access requires an active owned workspace, completed setup and verified contact email.

The mobile Academy Setup screen now checks for the Academy Admin role before it creates or edits a workspace. The Academy product includes two Coach seats and 1,000 shared monthly AI requests.

## Closing or deleting Coach / Academy accounts

Deleting a login and closing a Coach or Academy workspace are different actions.

- A user can request account closure, personal-data deletion, or both through [the published deletion instructions](/data-deletion.html).
- The request should be sent from the registered account email with the subject **AthleteN Account and Data Deletion Request**.
- The operator may verify identity or a parent/guardian's authority. Never send a password, government ID number or payment-card details by email.
- A Coach role cannot be switched away while pending or active athlete links remain. An Academy Admin role cannot be switched away while invited or active academy memberships remain. Arrange a transfer or closure of those relationships with Support before requesting workspace removal.
- Deletion is not instant. Lawful transaction, accounting, security, fraud-prevention, dispute and retention requirements may apply; backups may expire later.

There is currently no one-tap delete control for the Coach/Academy account in the app. The deletion page provides the supported request process.

## Security release gate

The repository contains `supabase/security/role_and_finance_authorization_hardening.sql` as a **review draft only**. It revokes authenticated execution of `public.switch_my_product_role(text)`, which the 2026-11-12 readiness audit found could otherwise let an authenticated user self-assign Coach or Academy Admin without verification. The draft has not been applied as a migration. Migration-history reconciliation and local non-billable security tests are required before it can be promoted. Do not treat the role-review UI as a substitute for backend authorization.

The current `supabase/policies.sql` definition for `academies owner insert` checks only that the authenticated user matches `owner_user_id`; it does not independently require the caller's profile role to be `academy_admin`. The new Academy Setup screen guard improves the normal UI path, but a client-side guard is not a database authorization boundary. This policy therefore needs a separately reviewed, role-aware RLS hardening change and negative direct-PostgREST/RPC tests after migration-history reconciliation. No such production policy change is claimed here.

The app must not enable public Coach/Academy self-enrolment or paid checkout until this backend gate is resolved and the negative authorization tests pass.
