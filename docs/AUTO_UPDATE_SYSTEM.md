# AthleteN Android automatic update system

## Current delivery model

AthleteN currently uses a **published signed-APK release feed** for Android native app updates. It is not an Expo OTA (over-the-air) JavaScript update service.

The next mobile native build is prepared as version `1.0.4`; `AthleteN-Mobile/eas.json` now includes a `release-apk` profile for a signed APK and automatic remote Android version-code incrementing. The final `versionCode` shown by EAS must be copied into the release record. The source of truth is the singleton Supabase row in `public.mobile_app_releases` (`id = true`). Only the currently published release is stored in that row. The Super Admin release controls publish directly to that row; a draft cannot be stored separately in the current schema.

## Publishing a release

1. Build a sideloadable Android APK from `AthleteN-Mobile` using the new EAS profile: `eas build --platform android --profile release-apk --non-interactive`. The profile uses the production EAS environment, remote version management, automatic version-code incrementing, internal distribution and APK output.
2. Verify the completed EAS build's actual package name (`com.novacode.athleten`), signing identity and generated Android `versionCode`. EAS remote versioning is authoritative for this profile; do not assume the local `app.json` value is the final code. The local app version is prepared as `1.0.4` / code `5`, but check the build result before publishing.
3. Upload the signed APK to a stable HTTPS direct-file URL whose path ends in `.apk`. A GitHub release web page is not a direct APK URL.
4. In the Web Admin Command Center, sign in as a Super Admin and open **Android Auto-Update Release**. The mobile Super Admin Dashboard also links to Android Release Control.
5. Enter the version name, actual version code from the EAS build, minimum supported version code, direct APK URL and release notes. Publish only after the APK has been verified.
6. Verify the published row in Supabase and test update detection using an Android build with a lower version code.

The release control validates version syntax, positive integer version codes, the minimum-version boundary, HTTPS direct-APK URLs and release-note length. Supabase RLS restricts writes to authenticated Super Admin accounts and requires `updated_by` to match the signed-in user.

## What Android users experience

The mobile update gate checks the published release:
- when the app starts;
- when the app returns to the foreground, subject to a six-hour check interval;
- and on a six-hour periodic check while the app process remains active.

When the published version code is newer than the installed build, the app displays an optional update prompt. When the minimum supported version code is newer than the installed build, the prompt is mandatory and cannot be dismissed. The prompt includes release notes and a manual **Check Again** action.

Tapping **Download Update** opens the direct APK URL. Android then requires the user to open/approve the system installer. A normal Android app cannot silently replace its own installed APK on consumer devices. The existing app remains installed until Android confirms the update.

The update check is best-effort: a network or release-feed failure does not block sign-in, training or access to existing athlete data.

## Important release-table constraint

The current Supabase table is a singleton current-release record, not a release history or draft queue. Saving an unpublished record would replace the single row and hide the previous release from clients. Therefore both release controls publish directly, and the mobile release screen does not offer a destructive draft action. A future release-history workflow needs a separate reviewed schema with immutable release rows and an explicit active-release pointer.

## OTA updates and scope

Expo Updates is **not configured in the current mobile binary**: the current app configuration does not include the `expo-updates` native module, an Updates URL or a runtime version policy. The present system therefore delivers native Android APK updates; it does not silently patch JavaScript bundles in place.

A separate EAS Update rollout can later deliver compatible JavaScript and asset changes without replacing the APK. That requires installing/configuring `expo-updates`, setting the EAS project Updates URL and a deliberate runtime-version policy, adding release channels to EAS build profiles, producing a new native build with that module, and testing update compatibility. Changes to native dependencies, permissions, config plugins or the Expo SDK still require a new native binary. Do not publish an OTA update until those prerequisites and rollback/recovery behavior are tested.

## Verification checklist

- [ ] New APK is signed with the existing signing key and retains the Android package ID.
- [ ] APK installs as an update over the currently installed app.
- [ ] Version code is higher than the current public release.
- [ ] Super Admin can publish from the Web Admin Command Center.
- [ ] Non-Super Admin cannot publish; Supabase RLS rejects unauthorized writes.
- [ ] A lower installed version receives the optional update prompt.
- [ ] A build below minimum supported version receives a non-dismissible prompt.
- [ ] An installed version at or above the published version receives no prompt.
- [ ] An invalid URL or malformed release is ignored safely.
- [ ] Download link opens and Android system installer completes an update.
- [ ] Check Again works and foreground checking respects throttling.
- [ ] Physical-device tests cover offline startup, failed downloads, cancellation and successful installation.
- [ ] If EAS Update is introduced later, verify runtime-version compatibility and recovery before publishing OTA bundles.
