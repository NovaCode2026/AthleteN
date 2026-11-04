# AthleteN dependency audit snapshot — 4 November 2026

**Repository:** `NovaCode2026/AthleteN`  
**Branch:** `audit/pilot-readiness-execution`  
**Workflow:** Dependency Security Audit, run 6 (head `98f5f0deaad92e567462484e14e782bccfb98df0`)  
**Artifact:** `athleten-dependency-audit-6` — available from the GitHub Actions run for 30 days.

## Current advisory counts

| Project | Info | Low | Moderate | High | Critical | Total |
|---|---:|---:|---:|---:|---:|---:|
| Web root (pnpm) | 0 | 1 | 10 | 3 | 0 | 14 |
| Android app (npm) | 0 | 2 | 26 | 7 | 1 | 36 |

The Android project audit repeats the previously reported 36 advisories, including one critical and seven high. The web root currently has 14 advisories, including three high.

## What this report means

- The workflow ran `pnpm audit --json` in the root web project and `npm audit --json` in `AthleteN-Mobile`.
- Both raw JSON reports were uploaded as the `athleten-dependency-audit-6` artifact.
- The audit workflow is intentionally informational: it records vulnerabilities and does not auto-upgrade packages or fail the PR just because advisories exist.
- The report is a dependency snapshot, not an exploitability assessment. Transitive paths, affected versions, available patched versions, Expo SDK compatibility and regression risk must be checked before changing packages.

## Safe remediation process

1. Download the artifact from the linked GitHub Actions run and inspect the exact package paths, affected ranges and direct/transitive dependency chain.
2. Fix direct dependencies and lockfile resolutions in isolated commits. Avoid `npm audit fix --force` and blanket major upgrades.
3. For Expo SDK-bound packages, check version compatibility with the project's Expo SDK before upgrading.
4. Run the existing test, Expo Doctor, TypeScript, ESLint and Android export checks after each dependency group.
5. Install a signed build on a physical Android device and validate sign-in, recovery, messaging and push before release.

## Release gate

Do not treat a green build or a generated audit report as vulnerability remediation. The Android app is not cleared for pilot until the critical/high advisories have been individually reviewed, safely resolved or documented with an explicit accepted-risk decision by the responsible operator.
