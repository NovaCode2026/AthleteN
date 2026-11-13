# AthleteN Android Release Signing — 2026-11-12

## Android application identity

The current release candidate sets:

- Android application ID: `com.novacode.athleten`
- iOS bundle identifier: `com.novacode.athleten`
- Expo project ID: `7f308f88-5459-4f51-bb76-981f381eee3c`

Before the first Play Console upload, the authorised app owner must verify that this is the package ID associated with the intended Play Console app. Android package identity cannot be renamed after publication; if a Play Console app already exists, its package ID must take precedence. Do not create a second listing just to match this candidate.

## Internal QA APK (not a store release)

The GitHub workflow **AthleteN Android CI APK (debug-signed QA)** builds the standalone release variant with the Android debug signing key and uploads the artifact `AthleteN-qa-debug-signed-apk`. It runs `assembleRelease` so the JavaScript bundle is packaged into the APK, then runs Android `apksigner` and requires the signing certificate subject to be `CN=Android Debug`.

The workflow sets `EXPO_PUBLIC_APP_CHANNEL=qa`. The app displays a persistent warning:

> QA BUILD • LIVE DATABASE • TEST ACCOUNT ONLY

The current mobile client has a fallback URL for the production Supabase project. There is no isolated QA Supabase branch configured for this build. Therefore this APK is for controlled private QA using the designated test account only. Do not use it for destructive testing against real athlete accounts, account deletion, billing, real competition records, or public distribution.

A debug certificate is not a production upload key. The QA APK cannot be used for Play Store publication and may not update an installation signed with the Play App Signing/upload key. Install on a separate test device or remove an existing installation only after confirming that its local data is not needed.

## Production AAB workflow

A manual-only GitHub Actions workflow has been added at `.github/workflows/android-production-aab.yml`. It uses the existing EAS production profile in `AthleteN-Mobile/eas.json`, which builds an Android App Bundle and uses remote version management.

It requires:

1. An authorised owner to configure Android signing credentials for the exact application ID in the linked Expo/EAS project. EAS can securely manage a new upload keystore or use a previously managed keystore.
2. A GitHub Actions repository secret named `EXPO_TOKEN` containing an Expo access token with permission to build this EAS project. Never paste this token into source code, issue comments, or chat.
3. Production EAS credentials to be present before the workflow is started. The workflow is non-interactive.

After the above is in place, an authorised owner can manually start **AthleteN Android Production AAB** from GitHub Actions. The workflow runs:

```bash
npx --yes eas-cli@latest build --platform android --profile production --non-interactive
```

The build is performed by EAS Build and produces a signed `.aab` when the configured signing credentials are valid. This workflow only builds; it does not upload to Play Console or publish a release.

## Release acceptance

Before any public release:

- Check the AAB's application ID and version code against the Play Console listing.
- Verify the signing certificate and record its fingerprints in the authorised release record.
- Enable Google Play App Signing for the first Play Console upload and keep a secure, backed-up copy of the upload keystore and recovery information.
- Run the AAB through the Play Console internal-testing track first. Validate install, upgrade, authentication, Google OAuth return, notifications, deep links, uploads, messaging and account deletion on physical devices and separate test accounts.
- Update OAuth/Firebase/Google Cloud Android certificate fingerprints only if the selected sign-in integration requires those Android fingerprints. Use the correct upload/app-signing fingerprints from the actual release, not the CI debug certificate.
- Have an authorised account holder complete store listing, privacy/data-safety disclosures, age/target-audience settings, and any required legal or guardian approvals. Do not bypass store or account age requirements.

## Official Expo references

- EAS Build setup and signing: https://docs.expo.dev/build/setup/
- Production Android AAB tutorial: https://docs.expo.dev/tutorial/eas/android-production-build/
- App credentials and Google Play App Signing: https://docs.expo.dev/app-signing/app-credentials/
- Credential storage and recovery: https://docs.expo.dev/app-signing/security/

## Current status

**Not production signed off.** The Android package identity and manual signed-AAB workflow are in the repository. No production EAS AAB has been built or cryptographically verified because the EXPO token and EAS production credentials are not available through this repository connection. The CI APK is debug-signed for controlled QA only. Physical-device acceptance, the real production migration baseline, payment/AI configuration and Play Console verification remain release gates.
