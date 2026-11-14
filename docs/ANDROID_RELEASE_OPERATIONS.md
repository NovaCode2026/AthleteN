# AthleteN Android release operations

## One-time build setup

1. Configure the GitHub Actions repository secret `EXPO_TOKEN` with an Expo access token that can build the linked EAS project.
2. In the linked Expo project, configure the Android production signing credentials once. Keep the same EAS-managed Android keystore for every subsequent release; do not rotate or regenerate it for routine builds.
3. Run **AthleteN Production-Signed Android APK** from GitHub Actions. This workflow uses the `production-apk` EAS profile, which inherits the production versioning configuration and creates an installable APK using the persistent EAS credentials.
4. Download the finished APK from the EAS build page linked in the workflow output. Copy the actual Android versionCode from the EAS build details; EAS remote versioning is the source of truth, and the production profile auto-increments that code.

The existing `AthleteN Android CI APK (debug-signed)` workflow is for CI validation only. Do not upload its APK as a public update: its runner-generated debug signing key is not the persistent production signing identity.

## Publish from the website

1. Sign in to the AthleteN website with a `super_admin` account and open **Admin → Founder Menu → Mobile Release Manager**.
2. Choose the production-signed APK, set its version name and versionCode, set the minimum supported versionCode, and write release notes.
3. Copy the actual versionCode from the completed EAS build details into the website form. Do not guess it or reuse the previous version code.
4. **Save draft** uploads the APK to the dedicated public-download bucket and saves private draft metadata. It does not alter the currently live release.
5. Verify the build and metadata, then choose **Publish Android release**. The currently published release record is replaced only after the APK upload succeeds.
6. Android clients check on launch, when returning to the foreground, and every 15 minutes while active. A newer release is shown as optional unless its minimum supported version code is higher than the installed version code.

## Important Android constraints

- Keep application ID `com.novacode.athleten` unchanged.
- Keep the same production signing key for all update APKs. Android will reject an update signed with a different key.
- Increase Android versionCode for every new release.
- The user must approve the download and the Android installer. Android does not permit ordinary apps to silently install their own APK updates.
- A device that has an earlier CI/debug-signed APK may need that test build removed before the first production-signed build can be installed. Removing an app can remove its local app data; confirm any important data is synced before doing so.
- The SQL migration `20261114194500_founder_mobile_release_manager.sql` must be applied to the Supabase project before the website release controls can upload APKs or persist drafts. Do not assume a migration committed to GitHub is already applied to production.
