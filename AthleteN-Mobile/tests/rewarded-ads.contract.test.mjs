import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const cwd = process.cwd();
const mobileRoot = existsSync(join(cwd, 'AthleteN-Mobile')) ? join(cwd, 'AthleteN-Mobile') : cwd;
const read = (path) => readFileSync(join(mobileRoot, path), 'utf8');

test('native rewarded ads use consent, test inventory and server-side verification data', () => {
  const source = read('src/lib/rewarded-ads.native.ts');
  assert.ok(source.includes('AdsConsent.gatherConsent()'));
  assert.ok(source.includes('AgeRestrictedTreatment.UNSPECIFIED'));
  assert.ok(source.includes('AdsConsent.requestInfoUpdate'));
  assert.ok(source.includes('AdsConsentPrivacyOptionsRequirementStatus.REQUIRED'));
  assert.ok(source.includes('AdsConsent.showPrivacyOptionsForm'));
  assert.ok(source.includes('consent.canRequestAds'));
  assert.ok(source.includes('MaxAdContentRating.PG'));
  assert.ok(source.includes('TestIds.REWARDED'));
  assert.ok(source.includes('serverSideVerificationOptions: { customData }'));
  assert.ok(source.includes('RewardedAdEventType.EARNED_REWARD'));
  assert.ok(source.includes("only AdMob's verified SSV callback"));
  assert.ok(!source.includes('grant_rewarded_ad_credit'));
});

test('Rewards Centre obtains a server-issued session before presenting an ad', () => {
  const source = read('src/app/rewards.tsx');
  const sessionIndex = source.indexOf('create-reward-ad-session');
  const showIndex = source.indexOf('presentRewardedAd(');
  assert.ok(sessionIndex >= 0, 'server session endpoint must be used');
  assert.ok(showIndex > sessionIndex, 'the ad must not show before server session issuance');
  assert.ok(source.includes('Ad · Not endorsed'));
  assert.ok(source.includes('pending Google’s server-side verification'));
});

test('Rewards Centre hides the ad entry unless the feature flag and adult DOB check pass', () => {
  const source = read('src/app/rewards.tsx');
  assert.ok(source.includes('EXPO_PUBLIC_ATHLETEN_REWARDED_ADS_ENABLED'));
  assert.ok(source.includes('isAdultDateOfBirth(profile?.date_of_birth)'));
});

test('web platform does not import or attempt to load the native ads SDK', () => {
  const source = read('src/lib/rewarded-ads.web.ts');
  assert.ok(!source.includes('react-native-google-mobile-ads'));
  assert.ok(source.includes('Android only'));
});

test('native build config delays measurement and validates app/ad-unit publisher identity', () => {
  const source = read('app.config.js');
  assert.ok(source.includes('delayAppMeasurementInit: true'));
  assert.ok(source.includes('validateRewardedAdUnitId'));
  assert.ok(source.includes('publisher ID must match ADMOB_ANDROID_APP_ID'));
});

test('Rewards Centre exposes a user-controlled UMP privacy-options action', () => {
  const source = read('src/app/rewards.tsx');
  assert.ok(source.includes('Manage advertising privacy choices'));
  assert.ok(source.includes('MANAGE AD PRIVACY'));
  assert.ok(source.includes('openAdsPrivacyOptions'));
});

test('platform resolver re-exports the privacy-options action', () => {
  const source = read('src/lib/rewarded-ads.ts');
  assert.ok(source.includes('openAdsPrivacyOptions'));
  assert.ok(source.includes('presentRewardedAd'));
});
