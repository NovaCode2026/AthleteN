import {
  AdEventType,
  AdsConsent,
  AdsConsentPrivacyOptionsRequirementStatus,
  AgeRestrictedTreatment,
  MaxAdContentRating,
  RewardedAd,
  RewardedAdEventType,
  TestIds,
  default as mobileAds,
} from 'react-native-google-mobile-ads';
import { Platform } from 'react-native';

export type RewardedAdOutcome = 'earned' | 'closed';

let sdkReady: Promise<void> | null = null;

async function prepareGoogleMobileAds(): Promise<void> {
  if (!sdkReady) {
    sdkReady = (async () => {
      // The server checks the account's first-saved age-verification record
      // before issuing this short-lived session. That DOB is not sent to AdMob.
      // A recorded DOB is not independent identity proof; live serving stays
      // disabled until adult-owned policy review and any required age assurance
      // are complete.
      const consent = await AdsConsent.gatherConsent();
      if (!consent.canRequestAds) {
        throw new Error('Ad consent is not available. You can continue using AthleteN without watching an ad.');
      }

      await mobileAds().setRequestConfiguration({
        maxAdContentRating: MaxAdContentRating.PG,
        // The server issues sessions only to independently verified adults.
        // All accounts under 18 are denied before an ad session is created.
        ageRestrictedTreatment: AgeRestrictedTreatment.UNSPECIFIED,
      });
      await mobileAds().initialize();
    })().catch((error: unknown) => {
      sdkReady = null;
      throw error;
    });
  }
  await sdkReady;
}


/**
 * Opens Google's UMP privacy-options form when the current consent configuration
 * requires one. This is an explicit user action and does not load an ad.
 */
export async function openAdsPrivacyOptions(): Promise<boolean> {
  if (Platform.OS !== 'android') {
    throw new Error('Ad privacy options are currently available on Android only.');
  }

  await AdsConsent.requestInfoUpdate();
  const info = await AdsConsent.getConsentInfo();
  if (info.privacyOptionsRequirementStatus !== AdsConsentPrivacyOptionsRequirementStatus.REQUIRED) {
    return false;
  }

  await AdsConsent.showPrivacyOptionsForm();
  return true;
}

/**
 * Presents one user-initiated rewarded ad. The caller must first obtain the
 * server-issued SSV customData token. The native reward event is deliberately
 * treated as presentation feedback only; only AdMob's verified SSV callback
 * can change the wallet.
 */
export async function presentRewardedAd(customData: string): Promise<RewardedAdOutcome> {
  if (Platform.OS !== 'android') {
    throw new Error('Rewarded ads are currently available on Android only.');
  }
  if (typeof customData !== 'string' || customData.length < 20 || customData.length > 256) {
    throw new Error('The rewarded-ad session is invalid. Please refresh and try again.');
  }

  const adUnitId = __DEV__
    ? TestIds.REWARDED
    : process.env.EXPO_PUBLIC_ADMOB_REWARDED_AD_UNIT_ID;
  if (!adUnitId) {
    throw new Error('Rewarded ads are not configured for this build.');
  }

  await prepareGoogleMobileAds();

  const ad = RewardedAd.createForAdRequest(adUnitId, {
    requestNonPersonalizedAdsOnly: true,
    serverSideVerificationOptions: { customData },
  });

  return new Promise<RewardedAdOutcome>((resolve, reject) => {
    let settled = false;
    let earned = false;
    let showStarted = false;
    let timeout: ReturnType<typeof setTimeout> | undefined;
    const unsubscribe: Array<() => void> = [];

    const cleanup = () => {
      if (timeout) clearTimeout(timeout);
      for (const remove of unsubscribe) remove();
      try { ad.destroy(); } catch { /* The ad may already have been released by the SDK. */ }
    };
    const finish = (outcome: RewardedAdOutcome) => {
      if (settled) return;
      settled = true;
      cleanup();
      resolve(outcome);
    };
    const fail = (error: unknown) => {
      if (settled) return;
      settled = true;
      cleanup();
      reject(error instanceof Error ? error : new Error('The rewarded ad could not be completed.'));
    };

    unsubscribe.push(ad.addAdEventListener(RewardedAdEventType.LOADED, () => {
      if (showStarted || settled) return;
      showStarted = true;
      void ad.show().catch(fail);
    }));
    // Google emits EARNED_REWARD only after its rewarded-ad eligibility
    // condition is met. Closing/skipping before that event is never a reward.
    // Even after this event, the wallet is credited only by the signed SSV
    // callback handled on the server; this client event is presentation state.
    unsubscribe.push(ad.addAdEventListener(RewardedAdEventType.EARNED_REWARD, () => {
      earned = true;
    }));
    unsubscribe.push(ad.addAdEventListener(AdEventType.CLOSED, () => {
      // A close without the earned event is an explicit no-reward outcome.
      finish(earned ? 'earned' : 'closed');
    }));
    unsubscribe.push(ad.addAdEventListener(AdEventType.ERROR, (error) => {
      fail(new Error(String(error)));
    }));

    timeout = setTimeout(() => fail(new Error('The ad timed out. Please try again later.')), 45_000);
    try {
      ad.load();
    } catch (error) {
      fail(error);
    }
  });
}
