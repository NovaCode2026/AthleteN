# AthleteN parent/guardian approval email setup

This guide configures the branded approval email sent by the `start-parent-approval` Supabase Edge Function.

## 1. Set up the sender in Resend

1. Sign in to Resend and open **Domains**.
2. Add a domain that Nova Code/AthleteN owns and can administer. Do not use a domain you do not control.
3. Publish the DNS records Resend provides (typically SPF and DKIM; configure DMARC as recommended) with your DNS host.
4. Wait until Resend marks the domain verified.
5. Choose a sender such as `AthleteN <accounts@your-verified-domain.example>`. Replace the example with an actual mailbox/domain you control. The sender does not need to receive mail unless you want replies to reach it; if replies are enabled, configure a monitored reply-to address.

Do not use `onboarding@resend.dev` as a production sender. The function now requires an explicit sender value.

## 2. Configure Supabase Edge Function secrets

In the Supabase dashboard for project `wjegokgtrewtoopbsiol`, open **Edge Functions → Secrets** (or the project secrets/settings area) and set:

- `RESEND_API_KEY`: a server-side Resend API key with permission to send email.
- `PARENT_APPROVAL_FROM`: the sender identity using your verified domain, for example `AthleteN <accounts@your-verified-domain.example>`.
- `ATHLETEN_PUBLIC_URL`: `https://athleten.netlify.app` (change this if the canonical production domain changes).

Keep these values in Supabase secrets only. Never commit them, put them in frontend/mobile environment variables, or share them in screenshots. If you use the Supabase CLI, you can set them locally with `supabase secrets set RESEND_API_KEY=... PARENT_APPROVAL_FROM=... ATHLETEN_PUBLIC_URL=https://athleten.netlify.app --project-ref wjegokgtrewtoopbsiol`; enter the real key only in your trusted terminal.

The approval function also needs its existing Supabase server-side credentials. Do not disable JWT verification.

## 3. What the email contains

The template is generated in `supabase/functions/start-parent-approval/index.ts`. It includes:

- AthleteN branding and a clear parent/guardian approval subject.
- A review button and plain-text fallback link.
- The 72-hour expiry notice.
- A warning to ignore the email if the recipient is not the parent/lawful guardian or did not expect the request.
- HTML escaping for the athlete name and URL.

The token is random, stored as a hash, and expires after 72 hours. Do not log or share the raw approval URL/token.

## 4. Test safely before launch

Use a test account and a parent/guardian who has explicitly agreed to participate in the test.

- [ ] Under-18 account submits a valid DOB and a different parent/guardian email.
- [ ] The Edge Function returns success only when Resend accepts the email request.
- [ ] Email arrives in inbox (also check spam), branding and button render on desktop and mobile, and plain-text content is readable.
- [ ] Link opens the production parent-approval page and records approval exactly once.
- [ ] Expired, missing, reused, and invalid tokens fail safely.
- [ ] Athlete workspace remains blocked while pending/rejected and unlocks only after approved status is confirmed.
- [ ] A parent email identical to the athlete's account email is rejected.
- [ ] A simulated missing sender/API key returns a configuration error and does not create a misleading pending request.
- [ ] Test sign-out/account switching and both web and Android.
- [ ] Verify delivery using Resend logs; do not assume an HTTP success proves inbox delivery.

## 5. Before calling AthleteN launch-ready

Email approval is one part of child-safety and privacy compliance, not a legal-compliance certificate by itself. Confirm the consent-verification process with a qualified Indian privacy/legal professional, complete the privacy policy and grievance/contact details with real operator information, verify account deletion and data-access flows, review Supabase security advisories, and test the deployed web/mobile builds. Never invent company identity, grievance-officer details, or contact addresses.
