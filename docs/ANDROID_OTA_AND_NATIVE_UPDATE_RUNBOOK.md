# AthleteN Android Branding, OTA Updates and Native Release Runbook

## Branding source of truth

The official master logo is `AthleteN-Mobile/assets/logo.webp`. The mobile logo component already imports this exact asset. The native launcher icon, Android adaptive foreground and Expo splash screen now point to the same source; the app no longer uses the unrelated placeholder icon or the broken `assets/logo.png` splash path.

The app version was advanced to 1.0.5 / Android build code 6 because the native update module and image configuration change the installed binary. A fresh APK is mandatory to deliver these native configuration changes.

## Update types and compatibility

AthleteN uses two update paths:

1. **EAS Update / OTA** for JavaScript, UI and bundled assets that are compatible with the installed native runtime. The app checks on launch, downloads compatible updates, and can offer a safe restart to apply a downloaded update. Expo's automatic launch check is also enabled; a downloaded update is applied on a later launch if the user does not restart immediately.
2. **Signed APK release** for native changes: Expo/React Native SDK changes, native dependencies, permissions, app configuration, launcher icon, splash screen, Firebase/FCM configuration, or any other native code/resource change. Android must ask the user to approve installation; an ordinary app cannot silently replace its own APK.

The OTA runtime uses Expo's `fingerprint` policy. The fingerprint is computed from native dependencies and configuration; an OTA update is only eligible for builds with the same runtime fingerprint. Never weaken this compatibility check to force an OTA update onto an older binary.

## EAS channels

- `development`: development builds only.
- `preview`: internal preview/testing builds.
- `production`: release APK and production builds.

EAS build profiles are bound to their channel in `eas.json`. Use the preview channel to test a release before production. The first update-enabled APK build creates/embeds its configured channel and fingerprint.

## Build and release sequence

1. Merge/review the native branding and Expo Updates configuration.
2. Build a new signed Android APK using the `release-apk` profile. The old installed APK does not contain `expo-updates` and cannot receive OTA updates until upgraded to this new binary.
3. Install the new APK on a physical Android device. Verify launcher icon, adaptive icon, splash, login, offline launch, update check and native notifications.
4. Publish a preview OTA update through **GitHub Actions → AthleteN Publish OTA Update → preview**. Verify download, restart/apply, cold launch, warm resume and offline rollback behaviour.
5. Only after preview acceptance and release approval, publish through the production channel. The production job uses the `athleten-production-ota` GitHub Environment; configure required reviewers/approvals on that environment before enabling production releases.
6. Keep a prior known-good update available. If a published OTA is faulty, use the EAS Update rollback/republish controls to restore a previously published update or the embedded update, then verify recovery on a physical device.

## Rollback and anti-bricking

Expo Updates includes launch error recovery. If a downloaded update crashes before content appears for the first time, Expo marks that update as failed and tries to recover to a newer downloaded update or a previously working update/embedded bundle. This is a safety net, not a substitute for staged preview testing.

Do not use an OTA update to add native modules or change native app configuration. Such a release needs a new APK with a new fingerprint. Do not publish OTA updates directly from unreviewed branches.

## Current PR #76 implementation

- Official shared master logo connected to launcher, adaptive icon and splash.
- Expo Updates dependency: SDK 57-compatible `~57.0.29`.
- EAS update URL bound to project `7f308f88-5459-4f51-bb76-981f381eee3c`.
- Fingerprint runtime policy, automatic launch checks and a 3-second launch fallback window.
- Android update gate checks/fetches OTA updates, offers a safe restart, and retains the existing mandatory/optional APK release path as a native-change fallback.
- Development, preview and production EAS channels.
- Manual OTA publishing workflow with test/type/lint/Expo Doctor gates.
- Lockfile synchronization workflow to generate and commit the SDK-compatible npm lock entry.

## Required release acceptance

Do not mark automatic updates as production-ready until all of these are tested on a physical device:

- Fresh install of the new update-enabled APK.
- OTA update available, downloaded and restarted successfully.
- OTA check while offline; app still opens using the embedded/last-known-good update.
- OTA fetch failure; app remains usable and APK fallback still works.
- A JS update with the same fingerprint reaches the expected channel.
- A native configuration/dependency change produces a different fingerprint and is not delivered to an older runtime.
- Broken OTA launch recovers to a previously working update or embedded bundle.
- A required native APK update opens the Android installer and retains the current installed version until Android completes the upgrade.
- Preview channel cannot receive production-only updates and vice versa.
- Production workflow approval protection is enabled.

## Operational notes

- Configure `EXPO_TOKEN` as a GitHub Actions secret. Do not commit it.
- Configure required reviewers for the `athleten-production-ota` GitHub Environment before publishing production updates.
- The lockfile sync workflow will add the Expo Updates SDK package metadata and run mobile checks; the subsequent Mobile Check should be rerun against the lockfile commit.
- Code-signing certificates for signed update manifests are not configured in this change. If AthleteN later adopts custom update code signing, generate/manage the private signing key under an adult-controlled release account and store it only in a dedicated secret manager; never commit it.

## Official Expo references

- [Expo Updates SDK](https://docs.expo.dev/versions/v57.0.0/sdk/updates/)
- [Getting started with EAS Update](https://docs.expo.dev/eas-update/getting-started/)
- [Downloading updates](https://docs.expo.dev/eas-update/download-updates/)
- [Runtime versions and compatibility](https://docs.expo.dev/eas-update/runtime-versions/)
- [Expo Update error recovery](https://docs.expo.dev/eas-update/error-recovery/)
- [Expo Update rollbacks](https://docs.expo.dev/eas-update/rollbacks/)
