export type RewardedAdOutcome = 'earned' | 'closed';

export async function presentRewardedAd(_customData: string): Promise<RewardedAdOutcome> {
  throw new Error('Rewarded ads are currently available on Android only.');
}
