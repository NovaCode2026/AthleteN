# AthleteN Android automatic update system

## Current delivery model

AthleteN uses a **published signed-APK release feed** for Android native app updates. The Super Admin can publish a release from the Web Admin Command Center or AthleteN Mobile. Both release controls can upload the signed APK into Supabase Storage or accept an existing direct HTTPS APK URL. The mobile Founder Workspace provides a role-authorized path to Android Release Control.

This is a native APK update flow, not an Expo OTA (over-the-air) JavaScript update service. Android users receive an in-app update prompt; Android still requires the user to approve the package installer.

The next mobile native build is prepared as version `1.0.4`; `AthleteN-Mobile/eas.json` includes a `release-apk` profile for a signed APK and automatic remote Android version-code incrementing. The final `versionCode` shown by EAS must be copied into the release record. The source of truth is the singleton Supabase row in `public.mobile_app_releases` (`id = true`). Only the currently published release is stored in that row. The Super Admin release controls publish directly to that row; a draft cannot be stored separately in the current schema.

## Publishing a release

1. Build a sideloadable Android APK either by running `eas build --platform android --profile release-apk --non-interactive` from `AthleteN-Mobile`, or by manually starting **AthleteN Android Sideload Release APK** in GitHub Actions. The workflow uses the `EXPO_TOKEN` repository secret and the `release-apk` EAS profile.
2. Verify the completed EAS build's actual package name (`com.novacode.athleten`), signing identity and generated Android `versionCode`. EAS remote versioning is authoritative for this profile; do not assume the local `app.json` value is the final code. The local app version is prepared as `1.0.4` / code `5`, but check the build result before publishing.
3. Sign in as a Super Admin and open **Android Auto-Update Release** in the Web Admin Command Center, or open **Founder Workspace → Android Release Control** in AthleteN Mobile. Enter the version name, actual version code from the EAS build and minimum supported version code.
4. Upload the signed `.apk` file directly in the panel (maximum 50 MB), or provide a direct HTTPS URL whose path ends in `.apk`. Uploaded files are stored in the public-download bucket `mobile-release-apks`; public access is intentional for end-user downloads, while Storage RLS permits uploads and deletes only for authenticated Super Admins.
5. Add release notes and publish. The panel uploads the APK first, then updates the active release row. If publishing the database record fails after upload, it attempts to remove the just-uploaded file. A new version code must exceed the current published version, and the new release cannot accidentally reuse the old APK URL.
6. Verify the published row in Supabase and test update detection using an Android build with a lower version code.

The release control validates version syntax, positive integer version codes, the minimum-version boundary, APK type and size, HTTPS direct-APK URLs and release-note length. Supabase RLS restricts release-row writes to authenticated Super Admin accounts and requires `updated_by` to match the signed-in user. Storage RLS separately restricts APK upload/delete to authenticated Super Admins.

## What Android users experience

The mobile update gate checks the published release:
- when the app starts;
- when the app returns to the foreground, subject to a six-hour interval after a successful check; transient failures are retried after five minutes;
- and on a six-hour periodic check while the app process remains active.

When the published version code is newer than the installed build, the app displays an optional update prompt. When the minimum supported version code is newer than the installed build, the prompt is mandatory and cannot be dismissed. The prompt includes release notes and a manual **Check Again** action.

Tapping **Download Update** opens the direct APK URL. Android then requires the user to open/approve the system installer. A normal Android app cannot silently replace its own installed APK on consumer devices. The existing app remains installed until Android confirms the update.

The update check is best-effort: a network or release-feed failure does not block sign-in, training or access to existing athlete data. Failed checks are throttled to one retry every five minutes to avoid repeated requests during outages; successful checks are cached for six hours. Invalid release metadata clears any stale prompt rather than presenting an outdated download.

## Important release-table constraint

The current Supabase table is a singleton current-release record, not a release history or draft queue. Publishing another version replaces the previous active row. Uploaded APK files are stored under version-specific immutable paths, so previous APK files remain available by their URLs, but the panel does not yet provide a full release-history or rollback interface. A future release-history workflow needs a separate reviewed schema with immutable release rows and an explicit active-release pointer.

The GitHub Actions workflow is manual-only and does not publish a release record or upload the APK to Supabase. After EAS finishes, download the signed APK from the EAS build page, then upload/publish it from the Web Admin Command Center.

## OTA updates and scope

Expo Updates is **not configured in the current mobile binary**: the current app configuration does not include the `expo-updates` native module, an Updates URL or a runtime version policy. The present system therefore delivers native Android APK updates; it does not silently patch JavaScript bundles in place.

A separate EAS Update rollout can later deliver compatible JavaScript and asset changes without replacing the APK. That requires installing/configuring `expo-updates`, setting the EAS project Updates URL and a deliberate runtime-version policy, adding release channels to EAS build profiles, producing a new native build with that module, and testing update compatibility and recovery behavior. Changes to native dependencies, permissions, config plugins or the Expo SDK still require a new native binary. Do not publish an OTA update until those prerequisites and rollback/recovery behavior are tested.

## Official Expo references

- [EAS app version management](https://docs.expo.dev/build-reference/app-versions/)
- [Building APKs for Android devices](https://docs.expo.dev/build-reference/apk/)
- [EAS Update setup](https://docs.expo.dev/eas-update/getting-started/)
- [Expo Updates SDK](https://docs.expo.dev/versions/latest/sdk/updates/)

## Verification checklist

- [ ] New APK is signed with the existing signing key and retains the Android package ID.
- [ ] APK installs as an update over the currently installed app.
- [ ] Version code is higher than the current public release.
- [ ] Super Admin can upload an APK and publish from both the Web Admin Command Center and AthleteN Mobile.
- [ ] Non-Super Admin cannot upload, delete or publish; Supabase RLS rejects unauthorized requests.
- [ ] A lower installed version receives the optional update prompt.
- [ ] A build below minimum supported version receives a non-dismissible prompt.
- [ ] An installed version at or above the published version receives no prompt.
- [ ] An invalid URL, file type, file size or malformed release is rejected safely.
- [ ] Download link opens and Android system installer completes an update.
- [ ] Check Again works and foreground checking respects throttling.
- [ ] Physical-device tests cover offline startup, failed downloads, cancellation and successful installation.
- [ ] If EAS Update is introduced later, verify runtime-version compatibility and recovery before publishing OTA bundles.
