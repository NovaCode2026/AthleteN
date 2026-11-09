# Mobile dependency compatibility notes

## Expo SDK 57 splash screen version check

The app is pinned to Expo SDK 57 and uses `expo-splash-screen@57.0.10`, which is the package version currently published under npm's `sdk-57` distribution tag. The Expo Doctor version map in this CI environment requests `~57.0.11`, but that version is not present in the published SDK 57 tag/version history.

To avoid replacing a known-published SDK 57 dependency with a version that is not available, `expo-splash-screen` is temporarily excluded from Expo's package-version validator. This is a narrow validator exception, not a claim that all native release checks have passed.

Evidence checked on 2026-11-10:
- npm package version history and SDK tags: https://www.npmjs.com/package/expo-splash-screen?activeTab=versions
- Expo SDK 57 release notes: https://expo.dev/changelog/sdk-57
- Expo's SDK 57 splash-screen changelog: https://github.com/expo/expo/blob/sdk-57/packages/expo-splash-screen/CHANGELOG.md

Revisit this exception whenever the SDK 57 package tag or Expo Doctor compatibility map changes. Remove the exclusion and use Expo's verified SDK-compatible version as soon as a corresponding stable package is published.
