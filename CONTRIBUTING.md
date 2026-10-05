# Contributing to AthleteN

Thank you for your interest in AthleteN.

AthleteN is a product-focused sports platform. Contributions, bug reports, security reports, documentation improvements, and thoughtful product feedback should preserve three principles: **athlete-first UX, reliable engineering, and safe handling of user data.**

## Before You Start

1. Read the repository documentation and licence.
2. Check existing issues and pull requests before starting duplicate work.
3. For security vulnerabilities, follow [SECURITY.md](./SECURITY.md) instead of opening a public issue.
4. Keep changes focused and explain the user or engineering problem being solved.

## Development Workflow

1. Create a feature branch from `main`.
2. Install dependencies using the package manager defined by the target application.
3. Make the smallest complete change that solves the problem.
4. Run the relevant validation commands.
5. Update documentation when behavior, setup, architecture, or public interfaces change.
6. Open a pull request with a clear summary and test evidence.

## Mobile Validation

For changes under `AthleteN-Mobile/`:

```bash
cd AthleteN-Mobile
npm ci
npx tsc --noEmit
npx eslint .
npx expo-doctor
```

For Android-specific changes, also test the affected native flow when a local Android environment is available.

## Engineering Expectations

- Preserve existing behavior unless the change intentionally modifies it.
- Keep secrets out of source code, commits, screenshots, issues, and logs.
- Respect Supabase Row Level Security and role boundaries.
- Handle loading, empty, error, and success states explicitly.
- Prefer accessible, responsive interfaces.
- Avoid introducing dependencies without a clear product or engineering reason.
- Keep mobile and web terminology consistent with the AthleteN product language.
- Do not silently weaken authentication, authorization, validation, or security controls.

## Commit Style

Use concise imperative commits:

```text
feat: add attendance summary
fix: prevent duplicate training sessions
docs: clarify mobile setup
refactor: simplify competition service
chore: update Expo dependencies
```

## Pull Requests

A good pull request explains:

- **Problem** — what was wrong or missing?
- **Solution** — what changed?
- **Impact** — who or what is affected?
- **Validation** — what was tested?
- **Risk** — what could still go wrong?
- **Screenshots** — include them for meaningful UI changes.

## Product Quality Bar

A change is not complete simply because it compiles.

For user-facing work, consider:

**Correctness → Reliability → Security → Accessibility → Performance → UX → Documentation**

Thank you for helping make AthleteN better.