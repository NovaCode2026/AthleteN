# AthleteN Mobile

AthleteN is a Taekwondo-focused athlete, coach, and academy mobile workspace built with Expo and React Native.

## Development

From the repository root:

```powershell
cd ".\AthleteN-Mobile"
npm install
npx expo start --clear
```

The app uses Expo Router and Supabase for authentication, profiles, subscriptions, usage limits, academy/coach data, and server-side entitlements.

## Plans

Current public plans:

| Plan | Monthly | Yearly | AI allowance |
|---|---:|---:|---:|
| Free | ₹0 | ₹0 | 0/month |
| Student | ₹99 | ₹999 | 50/month |
| Pro | ₹199 | ₹1,999 | 200/month |
| Elite | ₹399 | ₹3,999 | 500/month |
| Coach | ₹499 | ₹4,999 | 750/month |
| Academy | ₹799 | ₹7,999 | 1,000/month |

Yearly billing is displayed as the default option in the app, while monthly billing remains available.

### Academy plan

The public Academy plan is ₹799/month or ₹7,999/year and includes:

- 2 Coach-plan accounts
- Both included coaches receive the full Coach-plan feature set
- Additional coaches: ₹50/month each
- Additional coach onboarding: ₹100 one-time per coach
- Unlimited academy athletes
- Academy-wide analytics, attendance, training and competition management
- Finance, reports, announcements and academy calendar
- Academy AI: 1,000 messages/month

Additional coach charges are intended to be added to the Academy subscription payment. Payment-provider checkout still needs to be connected before real charges are taken.

## Dashboard plan management

The Athlete, Coach, and Academy dashboards include a **Plan** section.

It shows:

- Current server-side plan
- Subscription status
- Monthly price
- Yearly price
- AI allowance
- A **Manage / Change Plan** action

The action opens the shared Plans screen. Paid plan changes must only take effect after successful payment; the app does not fake a successful subscription.

## Sponsored Academy access — later

A special sponsored Academy entitlement is planned for the user's coach:

- Full Academy plan
- ₹0/month
- Full Academy and Coach-plan features

This is intentionally a **later implementation** and does not change the public Academy price. The normal Academy pricing and dashboard plan-management work are being implemented first.

## AI limits

AI allowances are enforced server-side. The mobile app displays the allowance from the subscription/usage data and must never be treated as the security boundary.

## Important

Do not change the Supabase Site URL to the mobile app URL. Mobile deep links and OAuth/reset flows use their configured redirect URLs separately.
