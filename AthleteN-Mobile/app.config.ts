import type { ExpoConfig } from 'expo/config';

export default ({ config }: { config: ExpoConfig }): ExpoConfig => {
  const googleServicesFile =
    process.env.GOOGLE_SERVICES_FILE ||
    process.env.GOOGLE_SERVICES_JSON_FILE;

  return {
    ...config,
    android: {
      ...config.android,
      ...(googleServicesFile ? { googleServicesFile } : {}),
    },
  };
};
