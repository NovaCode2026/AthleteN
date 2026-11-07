import Constants from 'expo-constants';
import * as Linking from 'expo-linking';

const WEB_AUTH_CALLBACK = 'https://athleten.netlify.app/auth/callback';

function callbackPath(next?: string) {
  return next
    ? `auth/callback?next=${encodeURIComponent(next)}`
    : 'auth/callback';
}

/**
 * Email links must remain valid after an Expo Go development server stops.
 * In Expo Go, open the stable web callback; installed builds use the app scheme.
 */
export function getEmailAuthRedirect(next?: string) {
  if (Constants.executionEnvironment === 'storeClient') {
    // The deployed web app handles /reset-password directly. Never route
    // recovery through a temporary LAN development-server URL.
    return next === 'reset-password'
      ? 'https://athleten.netlify.app/reset-password'
      : WEB_AUTH_CALLBACK;
  }

  return Linking.createURL(callbackPath(next));
}

/**
 * OAuth returns to the running Expo Go client during development.
 * Installed builds receive the athleten:// deep link from Linking.createURL.
 */
export function getOAuthRedirect(next?: string) {
  if (Constants.executionEnvironment === 'storeClient') {
    const hostUri = Constants.expoConfig?.hostUri;
    if (!hostUri) {
      throw new Error(
        'Could not determine the Expo development server address. Reopen AthleteN from the Expo development server and try again.'
      );
    }
    return `exp://${hostUri}/--/${callbackPath(next)}`;
  }

  return Linking.createURL(callbackPath(next));
}
