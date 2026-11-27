// TypeScript resolution fallback. Metro selects the .native.ts or .web.ts
// implementation for the target platform before consulting this file.
export { openAdsPrivacyOptions, presentRewardedAd } from './rewarded-ads.native';
export type { RewardedAdOutcome } from './rewarded-ads.native';
