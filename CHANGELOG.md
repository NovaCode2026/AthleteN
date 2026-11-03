# Changelog


## [Unreleased] — 2026-11-03

### Web and Mobile experience model
- Established Web as the full master information workspace for detailed dashboards, charts, history, comparisons and complex role administration; Mobile is the compact touch-first companion for daily checks and quick actions.
- Added shared-data and parity contracts: same Supabase records, identity, role/relationship permissions and KPI definitions across both clients.
- Expanded the Web Athlete Command Centre with a six-month activity graph and a saved-goal progress chart, plus clearer source/meaning context.
- Simplified Android Home into one compact discipline-aware flow, removed duplicated Poomsae panels and retained focused task routes and the short seven-day trend.
- Documented the cross-platform experience model and acceptance checks.

### Taekwondo discipline experience
- Made Web and Android sport/discipline selection explicit and cascading: Taekwondo first, then Kyorugi or Poomsae; unsupported sports remain hidden.
- Removed silent Kyorugi defaults from incomplete Android onboarding/profile state and added a clear profile-selection prompt in the Taekwondo Hub.
- Standardized discipline-aware labels such as Kyorugi Hub, Poomsae Studio, Kyorugi Training, Poomsae Training and dedicated timed-session labels.
- Expanded the Taekwondo discipline guide and mobile README with the Poomsae tool catalogue and sport-first acceptance criteria.
- Standardized sport-first selection: Taekwondo is the only currently available sport, followed by Kyorugi or Poomsae.
- Standardized Android profile values to the lowercase database enums taekwondo, kyorugi and poomsae.
- Corrected the mobile Taekwondo Hub discipline comparison and aligned its reads/writes with the shared Web Taekwondo domain tables.
- Added an Android Poomsae Studio with form practice logging, category/focus/repetition inputs, official event score/placing/result entry, score history and Poomsae-specific labels.
- Added docs/TAEKWONDO_DISCIPLINES.md documenting the sport selector, discipline feature matrix, implementation map and release acceptance checklist.

### Documentation and purchase journey
- Added a colorful documentation hub at `docs/README.md` to make product, engineering, operations, release and legal guides easy to discover.
- Added `docs/PLAN_VERIFICATION_AND_BILLING.md` with role-specific Student, Coach and Academy verification-to-payment diagrams, state definitions, implementation file map and launch acceptance checklist.
- Updated the root README, platform guide and Android README to cross-link the documentation and clearly explain that Coach/Academy verification happens before checkout.
- Clarified that a missing Coach or Academy role requires authorized Admin review; choosing a plan never changes account roles.
- Reiterated that paid checkout remains closed during Free Launch and only verified provider webhooks can activate subscriptions.

All notable **AthleteN** changes are documented here.

The project evolved from its earlier internal AthleteOS naming into the AthleteN product identity. Historical release notes may retain legacy terminology where it describes the state of the product at that time.

## [Unreleased]

### Product
- Added role-specific AI Match Reports and previous-month AI Monthly Reports for eligible Athlete, Coach and Academy accounts.
- Documented paid-report entitlements, Student Admin approval, existing Coach verification and Academy workspace verification.
- Added Coach/Academy verification preflight before the checkout request in Web and Android clients.
- Kept role, verification, active-subscription and report ownership checks at the server/database boundary.

### Documentation
- Rebuilt the main README as a visual product overview with feature catalogue, role matrix, plans, architecture, setup and release-state links.
- Added the full AthleteN Platform Guide and expanded the Mobile and API documentation.

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
