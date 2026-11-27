# Contributing to AthleteN

AthleteN is an active development project. Changes should preserve user privacy, authorization boundaries, shared Web/Mobile behaviour and release safety.

## Workflow

1. Start from the latest intended base branch.
2. Create a focused feature or fix branch.
3. Keep changes scoped and avoid unrelated refactors.
4. Add/update regression tests.
5. Run the checks relevant to the change.
6. Document migrations, environment variables and user-visible behaviour.
7. Open a pull request with clear scope, test evidence and known limitations.

## Pull request requirements

Include:
- Purpose and affected workspaces/platforms
- Changed data/API contracts
- Migration details and rollback considerations
- Security/permission implications
- Tests run and exact results
- Screenshots or recordings for UI changes where practical
- Outstanding limitations and acceptance needed

Do not describe a feature as complete if it is only a screen, mock, candidate migration or isolated test.

## Security and data

- Never commit secrets, credentials, personal data or production dumps.
- Use least privilege and server/database authorization; client visibility is not security.
- Keep athlete, guardian, coach, academy and admin data scopes explicit.
- Avoid sending sensitive athlete information to external services unless an approved, necessary flow explicitly requires it.
- Do not apply candidate migrations to production without reconciliation and staging acceptance.

## Local validation

Root:
```bash
npm ci
npm test
npm run build
```

Mobile:
```bash
cd AthleteN-Mobile
npm ci
npm test
npx tsc --noEmit
npx eslint .
npx expo-doctor
```

## Review standard

Prefer small, maintainable modules; explicit error states; accessible controls; tests for negative authorization cases; and documentation that matches the actual implementation.
