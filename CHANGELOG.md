# Changelog

All notable **AthleteN** changes are documented here.

The project evolved from its earlier internal AthleteOS naming into the AthleteN product identity. Historical release notes may retain legacy terminology where it describes the state of the product at that time.

## [Unreleased]

### Product
- Continued AthleteN web and mobile development.
- Continued Taekwondo-first athlete, coach, and academy workflows.

### Mobile
- Hardened Expo startup by removing an optional native widget dependency from the launch path.
- Cleaned orphan widget integrations and dependency state.
- Validated installation, TypeScript, ESLint, and Expo Doctor for the hardened mobile path.

### Documentation
- Reworked the repository README into a product/company-grade overview.
- Standardized contribution, security, and community documentation around AthleteN.
- Removed obsolete self-modifying GitHub Actions in favor of explicit validation workflows.

## [2.0.0] - 2026-08-01

### Added
- Academy, academy membership, training plan, and attendance schema foundations.
- Subscription usage and payment event tables.
- Support ticket, announcement, feature flag, and audit log foundations.
- Expanded RLS helpers for administrative roles.
- Private academy media storage foundation.
- Typed application shell and domain models.
- Student verification, feedback, roadmap, usage, subscription, referral, and badge foundations.

### Changed
- Migrated major application surfaces from the original JavaScript shell to TypeScript.
- Updated authentication, Supabase, and data-access modules.
- Expanded deployment and architecture documentation.

### Validation
- Production web build passed.
- OpenAI credentials remained server-side.

## [1.0.0] - 2026-07-28

### Added
- React and Vite production application shell.
- Supabase authentication and protected access.
- Training, tournament, match, medal, certificate, document, weight, calendar, notification, checklist, injury, and goal data foundations.
- SQL schema, RLS policy, and storage setup.
- Secure Netlify Function for AI coaching.
- Responsive athlete dashboard.
- Netlify deployment configuration.

### Security
- OpenAI calls moved to server-side functions.
- Supabase Row Level Security used for protected records.
- Local environment secrets excluded from version control.
