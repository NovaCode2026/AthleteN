# AthleteN Release Checklist

Use this checklist for the exact commit being considered. Record commit SHA and workflow links; do not carry results forward from older commits.

## Source and CI

- [ ] Release branch and exact commit reviewed
- [ ] Root test suite passes
- [ ] Web production build passes
- [ ] Mobile tests pass
- [ ] Mobile TypeScript passes
- [ ] Mobile lint passes
- [ ] Expo Doctor passes
- [ ] Android bundle/APK workflow completes and artifact is verified
- [ ] Security workflow results reviewed
- [ ] Dependency audit status reviewed (not silently skipped)

## Backend and database

- [ ] Migration-history drift reconciled from trusted sources
- [ ] Full migration chain replayed in isolated staging
- [ ] Candidate migrations reviewed
- [ ] RLS positive/negative cases tested
- [ ] Security-definer functions and grants reviewed
- [ ] Secrets and environment configuration verified
- [ ] Storage access, upload, download and deletion tested
- [ ] AI budget/model access and cost controls verified

## Product acceptance

- [ ] Web/mobile save-read-refresh parity verified
- [ ] Athlete, Coach, Academy and Admin role boundaries tested with separate accounts
- [ ] Login, OAuth, email confirmation, password reset and logout tested
- [ ] Android cold start, warm start and auth restoration verified
- [ ] Messaging persistence, actions, attachments and group permissions tested
- [ ] Notifications tested in foreground/background/killed-app states
- [ ] Scanner/camera permission and failure states tested
- [ ] Guardian/under-18 consent and privacy review completed where applicable

## Commercial and external integrations

- [ ] Product pricing reconciled between UI, server and provider
- [ ] Checkout remains safely gated until approval
- [ ] Payment webhooks, idempotency, cancellation/refund and renewals tested
- [ ] Tax and invoice review completed
- [ ] Rewarded-ad SDK, consent, age-appropriate request configuration and SSV verified
- [ ] Rewards caps/expiry and duplicate callback tests passed
- [ ] Provider credentials/IDs configured without committing secrets

## Android distribution

- [ ] Package identity verified
- [ ] Signing credentials secured
- [ ] Signed release build created
- [ ] Clean install tested
- [ ] Upgrade install tested
- [ ] Physical device matrix completed
- [ ] Artifact provenance and checksum recorded
- [ ] Release notes and support instructions prepared

## Deployment

- [ ] Exact reviewed commit deployed
- [ ] Deployment SHA verified
- [ ] Post-deployment smoke tests pass
- [ ] Monitoring and rollback plan ready
- [ ] Release decision recorded by authorized owner

**No production release until all required gates are complete.**
