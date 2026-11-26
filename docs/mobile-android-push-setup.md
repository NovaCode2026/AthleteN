# AthleteN Android push notifications setup

The Android error `Default FirebaseApp is not initialized` means this APK was built without the Firebase Android configuration required by Expo Notifications to obtain an Android push token. This is not fixable by repeatedly tapping Retry or by changing Android notification permissions.

## Required configuration

1. In Firebase Console, create/select the Firebase project used by AthleteN.
2. Add an Android app with package name **`com.novacode.athleten`**.
3. Download that app's **`google-services.json`** file.
4. Store it securely in EAS as a **file-type environment variable**, named `GOOGLE_SERVICES_FILE`. For local builds, place the file in `AthleteN-Mobile/` and set `GOOGLE_SERVICES_FILE=./google-services.json`.
5. The Expo app config reads this variable and adds it to `android.googleServicesFile` at build time. The JSON file is intentionally not committed to Git.
6. In the Expo/EAS project, configure Android FCM v1 credentials for the same Firebase project so Expo's push service can deliver messages.
7. Rebuild the Android app (a native rebuild is required), install the new APK, grant notifications permission, and open Settings → Notifications → Retry Device Registration.

## Expected result

The settings screen should show **This device is registered for push notifications** after the token is generated and saved to `device_push_tokens`.

If the Firebase file is absent, AthleteN now reports a clear configuration status instead of showing the raw Firebase initialization exception. Retrying on the same APK will not resolve a missing native configuration.
