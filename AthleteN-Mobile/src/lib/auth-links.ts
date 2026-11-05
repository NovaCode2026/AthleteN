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
    const url = new URL(WEB_AUTH_CALLBACK);
    if (next) url.searchParams.set('next', next);
    return url.toString();
  }

  return Linking.createURL(callbackPath(next));
}

/**
 * OAuth still needs to return to the running Expo Go client during development.
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
