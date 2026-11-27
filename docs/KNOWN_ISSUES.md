# AthleteN Known Issues and Investigations

**Updated:** 27 November 2026  
This list is a working register. Items are not considered resolved without a reproducible test and evidence.

## KNI-001 — Android startup black screen

**Status:** Open investigation  
**Reported behaviour:** On recent diagnostic APKs, the splash/logo disappears and the app displays a black screen.  
**Root cause:** Unknown; no root cause is claimed.

**Investigation requirements**
- Record APK artifact, commit SHA, build type, Android version/device, install path and logs.
- Reproduce on a clean install and upgrade install.
- Separate native boot, JS bundle load, font/assets, Expo Router initial route, auth/session restoration and runtime exception stages.
- Capture the first fatal exception and native/JS logs.
- Compare diagnostic isolation builds with the normal app using the same source commit and build environment.
- Verify a visible error fallback rather than an indefinitely blank surface.
- Retest the exact fix APK on a physical device.

## KNI-002 — Candidate migrations versus production history

**Status:** Release blocker  
Repository migration files and production migration ledger are not reconciled. Do not push, reset, repair the live ledger or apply candidate migrations until trusted-source comparison and isolated staging replay pass.

## KNI-003 — Paid catalogue/source mismatch

**Status:** Product and engineering reconciliation required  
The product-owner pricing discussed in November differs from `src/config/plans.ts` and server checkout prices. Documentation now records the proposed catalogue but does not change code. Reconcile UI, backend amount mapping, provider plan IDs, entitlements and tests before launch.

## KNI-004 — Rewarded ads are not live

**Status:** Gated  
Native SDK/config, consent and youth-safe ad request setup, publisher approval, server environment gates and physical-device acceptance remain incomplete.

## KNI-005 — Push delivery acceptance

**Status:** Gated  
Configuration and actual device delivery must be verified across foreground/background/killed-app states, permission denial, account switching, logout and notification deep links.

## KNI-006 — Production AI budget/model access

**Status:** Gated  
Verify candidate budget ledger migration, model access, configured pricing, reservation/settlement behaviour and provider cost. Keep AI fail-closed until evidence is complete.

## KNI-007 — Subscription lifecycle

**Status:** Gated  
Checkout is disabled. Recurring billing, provider plan configuration, webhook signatures/idempotency, cancellation, refunds, renewal and tax/invoice handling need acceptance.

## Reporting and updating this list

For each issue, record: ID, date, exact commit, reproducible steps, expected/actual behaviour, logs with secrets removed, owner, fix commit, tests and physical/staging acceptance. Close an issue only after verifying the fix on the exact candidate.
