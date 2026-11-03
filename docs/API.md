# 🔌 AthleteN API

AthleteN uses Supabase for authenticated application data and Netlify Functions for operations that require server-side secrets.

## Authentication

Protected Netlify endpoints require:

```http
Authorization: Bearer <Supabase access token>
```

The server must resolve the authenticated user using Supabase Auth. Do not trust a user ID supplied in the JSON body for authorization.

## 🤖 POST `/.netlify/functions/ai-coach`

Performs a server-side AI request.

Example:

```json
{
  "topic": "Match Analysis",
  "prompt": "Review this match result and the observations I recorded."
}
```

Supported topics include Training Coach, Tournament Preparation, Match Analysis, Nutrition Advice, Recovery Advice, Goal Suggestions, Performance Reports, Motivational Feedback and Emotional Support.

The function:
1. Validates method, topic and request size.
2. Requires a valid Supabase access token.
3. Reads the signed-in user's profile and canonical plan.
4. Checks that the paid plan matches the account role.
5. Requires the latest Student verification to be approved for Student access.
6. Requires a valid existing Academy workspace for Academy accounts.
7. Requires an active subscription for the matching plan.
8. Reserves the monthly AI usage server-side.
9. Calls the AI provider using the server-side API key.
10. Records usage and returns the answer.

Free plan AI allowance is zero. Monthly allowances are defined by the canonical plan configuration and server-side quota logic. Client-side counters are display-only.

## 🧠 AI Intelligence Reports

The web and mobile report screens use the AI Coach server function for report generation.

### AI Match Report
The client supplies event, opponent/style where known, result, recorded score and user observations. The AI response is structured into summary, observations, review areas, tactical lessons and practice priorities.

This workflow does not imply video ingestion or automated video analysis. The AI must not invent match events or statistics absent from the source details.

### AI Monthly Report
The client builds a period snapshot for the previous completed calendar month from the data visible to the signed-in account. Current snapshot fields include:
- Training session count and recorded training minutes
- Attendance record count and status breakdown
- Medal count and medal-type breakdown
- Competition entries
- Goals not marked completed or cancelled
- Athlete count for Coach/Academy report scope

The client passes only those totals and categories to the AI. The model must not infer unprovided physiology, match events or attendance.

The generation interface is currently user-initiated. Scheduled monthly delivery is not described as live functionality.

### Report storage

Reports are stored in `public.ai_intelligence_reports`:

| Column | Purpose |
|---|---|
| `user_id` | Owner of the saved report |
| `report_type` | `match` or `monthly` |
| `subject_role` | `athlete`, `coach` or `academy_admin` |
| `title` | Display title |
| `period_start`, `period_end` | Monthly reporting period where applicable |
| `input_snapshot` | Source facts used to generate the report |
| `content` | AI-generated report text |
| `created_at` | Saved timestamp |

RLS controls private report history. Inserts require:
- The authenticated user owns the row.
- The report role matches the user's profile role.
- The role has the matching paid plan.
- The subscription for that plan is active or trialing and not expired.
- Student verification is approved for the latest request.
- Academy workspace verification is complete for Academy reports.

The user's saved report history is not a shared team feed. Coach/Academy reports can include authorized athletes in the generated snapshot, but the report record itself remains owned by the generating account.

## 💳 POST `/.netlify/functions/create-checkout`

Creates a provider checkout session after checking:
- Signed-in user
- Selected plan ID
- Matching account role
- Student Admin approval for Student
- Confirmed account email for Coach and Academy
- Existing Academy owner/workspace setup and verified contact email for Academy
- Supported payment provider configuration

Provider integrations are scaffolded for Razorpay, Stripe and Cashfree.

**Current launch gate:** the function contains `FREE_LAUNCH = true`. Paid checkout is intentionally blocked until provider onboarding and acceptance testing are completed. Do not switch this off simply to make the button work.

## 💳 Payment webhook

`POST /.netlify/functions/payment-webhook`

The webhook validates the configured provider signature before accepting provider events. It updates the payment order and calls the database subscription activation function. Browser redirects are not treated as proof of payment.

## 🗄️ Supabase data modules

The platform includes data modules for:
- Profiles and role identities
- Academies, memberships, coach/athlete links and coach seats
- Training sessions, training plans and attendance records
- Tournaments, match records, medals and certificates
- Goals, weight logs and athlete records
- Documents and private verification proofs
- Student verification and age verification
- Messaging, receipts, notifications and push tokens
- AI usage events, subscription usage and subscriptions
- AI intelligence reports
- Payment orders and payment events
- Badges, referrals, feedback, roadmap and support
- Announcements, feature flags and audit logs

The authoritative table definitions and access rules are in `supabase/migrations/`, `supabase/schema.sql`, `supabase/policies.sql` and `supabase/storage.sql`.

## 🔒 Secret handling

Server-only variables include Supabase service-role credentials, OpenAI API key, payment-provider API credentials and webhook signing secrets. Never expose these through `VITE_*`, `EXPO_PUBLIC_*`, client source or mobile bundles.
