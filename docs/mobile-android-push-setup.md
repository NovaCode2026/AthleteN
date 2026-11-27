# AthleteN Android push notification setup

The Android `Default FirebaseApp is not initialized` error means the APK lacks Firebase Android configuration required to obtain an FCM token. Retrying or changing notification permissions cannot fix a missing native configuration.

1. In Firebase Console, create/select the Firebase project for AthleteN.
2. Add an Android app using package name `com.novacode.athleten`.
3. Download `google-services.json`.
4. Configure it securely in EAS as a **file environment variable** named `GOOGLE_SERVICES_FILE`. For a local build, place the file in the mobile project and set `GOOGLE_SERVICES_FILE=./google-services.json`.
5. The Expo config reads the environment variable and sets `android.googleServicesFile`. The JSON is not committed.
6. Configure the matching Android FCM v1 credentials in the Expo/EAS project.
7. Rebuild the Android app, install it, grant notification permission, then Settings → Notifications → Enable or Retry.

A successful token registration saves the device token to `device_push_tokens`. The app now reports Firebase setup errors clearly; the current APK cannot be repaired by retrying.
