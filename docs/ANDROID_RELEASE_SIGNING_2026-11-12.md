# AthleteN Android Release Signing — 2026-11-12

## Android application identity

The current release candidate sets:

- Android application ID: `com.novacode.athleten`
- iOS bundle identifier: `com.novacode.athleten`
- Expo project ID: `7f308f88-5459-4f51-bb76-981f381eee3c`

Before the first Play Console upload, the authorised app owner must verify that this is the package ID associated with the intended Play Console app. Android package identity cannot be renamed after publication; if a Play Console app already exists, its package ID must take precedence. Do not create a second listing just to match this candidate.

## CI APK is not a store release

The existing GitHub Android workflow is now named **AthleteN Android CI APK (debug-signed)** and uploads `AthleteN-ci-debug-signed-apk`. It is an internal CI artifact only.

For evidence, the APK artifact from Actions run `43064521592` was inspected directly on 2026-11-12. Its APK Signing Block contained a certificate with subject `CN=Android Debug`, SHA-1 `5E:8F:16:06:2E:A3:CD:2C:4A:0D:54:78:76:BA:A6:F3:8C:AB:F6:25`, SHA-256 `FA:C6:17:45:DC:09:03:78:6F:B9:ED:E6:2A:96:2B:39:9F:73:48:F0:BB:6F:89:9B:83:32:66:75:91:03:3B:9C`, and `SHA1withRSA`. This is a debug certificate, not a production upload key. Do not publish this APK or use its fingerprints for production OAuth configuration.

## Production AAB workflow

A manual-only GitHub Actions workflow has been added at `.github/workflows/android-production-aab.yml`. It uses the existing EAS production profile in `AthleteN-Mobile/eas.json`, which builds an Android App Bundle and uses remote version management.

It requires:

1. An authorised owner to configure Android signing credentials for the exact application ID in the linked Expo/EAS project. EAS can generate and securely store a new upload keystore or use a previously managed keystore.
2. A GitHub Actions repository secret named `EXPO_TOKEN` containing an Expo access token with permission to build this EAS project. Never paste this token into source code, issue comments, or chat.
3. The production EAS credentials to be present before the workflow is started. The workflow is non-interactive; it must not attempt to create or select credentials during a release run.

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
- Run the AAB through the Play Console internal-testing track first. Validate install, upgrade, authentication, Google OAuth return, notifications, deep links, uploads, messaging, and account deletion on physical devices and separate test accounts.
- Update OAuth/Firebase/Google Cloud Android certificate fingerprints only if the selected sign-in integration requires those Android fingerprints. Use the correct upload/app-signing fingerprints from the actual release, not the CI debug certificate.
- Have an authorised account holder complete store listing, privacy/data-safety disclosures, age/target-audience settings, and any required legal or guardian approvals. Do not bypass store or account age requirements.

## Official Expo references

- EAS Build setup and signing: https://docs.expo.dev/build/setup/
- Production Android AAB tutorial: https://docs.expo.dev/tutorial/eas/android-production-build/
- App credentials and Google Play App Signing: https://docs.expo.dev/app-signing/app-credentials/
- Credential storage and recovery: https://docs.expo.dev/app-signing/security/

## Current status

**Not signed off.** The package identity has been set in this release candidate, and the manual signed-AAB workflow is in the repository. No production EAS AAB has been built or cryptographically verified in this pass because the EXPO token and EAS production credentials are not available through this repository connection. The current CI artifact is debug-signed only. Physical-device acceptance and Play Console verification remain release gates.
