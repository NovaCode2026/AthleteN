import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const root = process.cwd();
const read = (path) => readFileSync(join(root, path), 'utf8');

test('native rewarded ads use the consent gate, test inventory in development and SSV custom data', () => {
  const source = read('src/lib/rewarded-ads.native.ts');
  assert.match(source, /AdsConsent\\.gatherConsent/);
  assert.match(source, /consent\\.canRequestAds/);
  assert.match(source, /MaxAdContentRating\\.PG/);
  assert.match(source, /TestIds\\.REWARDED/);
  assert.match(source, /serverSideVerificationOptions:\\s*\\{\\s*customData\\s*\\}/);
  assert.match(source, /RewardedAdEventType\\.EARNED_REWARD/);
  assert.match(source, /only AdMob's verified SSV callback/i);
  assert.doesNotMatch(source, /reward-wallet|grant_rewarded_ad_credit/);
});

test('Rewards Centre asks the server for a short-lived session before showing an ad', () => {
  const source = read('src/app/rewards.tsx');
  const sessionIndex = source.indexOf('create-reward-ad-session');
  const showIndex = source.indexOf('presentRewardedAd(');
  assert.ok(sessionIndex >= 0, 'server session endpoint must be used');
  assert.ok(showIndex > sessionIndex, 'the ad must not show before server session issuance');
  assert.match(source, /Ad \\u00b7 Not endorsed/);
  assert.match(source, /pending Google.s server-side verification/i);
});

test('Rewards Centre keeps the ad entry hidden unless the feature flag is enabled or in development', () => {
  const source = read('src/app/rewards.tsx');
  assert.match(source, /EXPO_PUBLIC_ATHLETEN_REWARDED_ADS_ENABLED/);
  assert.match(source, /isAdultDateOfBirth/);
});

test('web platform does not import or attempt to load the native ads SDK', () => {
  const source = read('src/lib/rewarded-ads.web.ts');
  assert.doesNotMatch(source, /react-native-google-mobile-ads/);
  assert.match(source, /Android only/);
});
