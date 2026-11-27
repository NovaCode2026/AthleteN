import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState, Linking, Modal, Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import Constants from 'expo-constants';
import * as Updates from 'expo-updates';
import { supabase } from '@/lib/supabase';
import { Colors } from '@/constants/theme';

type Release = {
  version: string;
  version_code: number;
  minimum_version_code: number;
  download_url: string;
  release_notes: string | null;
};

const c = Colors.dark;
const installedCode = Number(Constants.nativeBuildVersion || Constants.expoConfig?.android?.versionCode || 1);
const APK_CHECK_INTERVAL_MS = 6 * 60 * 60 * 1000;
const RETRY_INTERVAL_MS = 5 * 60 * 1000;
const OTA_CHECK_INTERVAL_MS = 4 * 60 * 60 * 1000;
const VERSION_PATTERN = /^\\d+\\.\\d+\\.\\d+(?:[+-][0-9A-Za-z.-]+)?$/;

function parseRelease(data: unknown): Release | null {
  if (!data || typeof data !== 'object') return null;

  const row = data as Record<string, unknown>;
  const version = typeof row.version === 'string' ? row.version.trim() : '';
  const versionCode = Number(row.version_code);
  const minimumCode = Number(row.minimum_version_code);
  const downloadUrl = typeof row.download_url === 'string' ? row.download_url.trim() : '';

  if (
    !VERSION_PATTERN.test(version) ||
    !Number.isSafeInteger(versionCode) ||
    versionCode < 1 ||
    !Number.isSafeInteger(minimumCode) ||
    minimumCode < 1 ||
    minimumCode > versionCode
  ) return null;

  try {
    const parsedUrl = new URL(downloadUrl);
    if (
      parsedUrl.protocol !== 'https:' ||
      !parsedUrl.hostname ||
      parsedUrl.username ||
      parsedUrl.password ||
      !parsedUrl.pathname.toLowerCase().endsWith('.apk')
    ) return null;
  } catch {
    return null;
  }

  return {
    version,
    version_code: versionCode,
    minimum_version_code: minimumCode,
    download_url: downloadUrl,
    release_notes: typeof row.release_notes === 'string' ? row.release_notes : null,
  };
}

export default function AppUpdateGate() {
  const { isUpdatePending } = Updates.useUpdates();
  const [release, setRelease] = useState<Release | null>(null);
  const [apkVisible, setApkVisible] = useState(false);
  const [otaReady, setOtaReady] = useState(false);
  const [busy, setBusy] = useState(false);
  const [checkingApk, setCheckingApk] = useState(false);
  const [checkingOta, setCheckingOta] = useState(false);
  const [message, setMessage] = useState('');
  const lastApkCheckAt = useRef(0);
  const lastApkCheckSucceeded = useRef(false);
  const apkCheckInFlight = useRef(false);
  const lastOtaCheckAt = useRef(0);
  const otaCheckInFlight = useRef(false);

  const checkForOtaUpdate = useCallback(async (force = false) => {
    if (Platform.OS !== 'android' || __DEV__ || !Updates.isEnabled || otaCheckInFlight.current) return;

    const now = Date.now();
    if (!force && now - lastOtaCheckAt.current < OTA_CHECK_INTERVAL_MS) return;

    otaCheckInFlight.current = true;
    lastOtaCheckAt.current = now;
    setCheckingOta(true);
    try {
      // A previously downloaded update is ready to apply. Expo's native
      // error-recovery logic retains the last working launch if the new bundle
      // fails before the app has rendered content.
      if (isUpdatePending) {
        setOtaReady(true);
        return;
      }

      const check = await Updates.checkForUpdateAsync();
      if (!check.isAvailable) return;

      const downloaded = await Updates.fetchUpdateAsync();
      if (downloaded.isNew) setOtaReady(true);
    } catch {
      // OTA failure must never block app startup or the native APK fallback.
      lastOtaCheckAt.current = 0;
    } finally {
      otaCheckInFlight.current = false;
      setCheckingOta(false);
    }
  }, [isUpdatePending]);

  const checkForApkUpdate = useCallback(async (force = false) => {
    if (Platform.OS !== 'android' || apkCheckInFlight.current) return;

    const now = Date.now();
    const interval = lastApkCheckSucceeded.current ? APK_CHECK_INTERVAL_MS : RETRY_INTERVAL_MS;
    if (!force && now - lastApkCheckAt.current < interval) return;

    apkCheckInFlight.current = true;
    lastApkCheckAt.current = now;
    setCheckingApk(true);
    try {
      const { data, error } = await supabase
        .from('mobile_app_releases')
        .select('version,version_code,minimum_version_code,download_url,release_notes')
        .eq('id', true)
        .eq('published', true)
        .maybeSingle();

      if (error) {
        lastApkCheckSucceeded.current = false;
        setMessage('The APK update service could not be reached. AthleteN will retry automatically.');
        return;
      }

      lastApkCheckSucceeded.current = true;
      if (!data) {
        setRelease(null);
        setApkVisible(false);
        return;
      }

      const next = parseRelease(data);
      if (!next) {
        setRelease(null);
        setApkVisible(false);
        return;
      }

      if (next.version_code > installedCode || next.minimum_version_code > installedCode) {
        setRelease(next);
        setApkVisible(true);
        setMessage('');
      } else {
        setRelease(null);
        setApkVisible(false);
        setMessage('');
      }
    } catch {
      lastApkCheckSucceeded.current = false;
      setMessage('The APK update service could not be reached. AthleteN will retry automatically.');
    } finally {
      apkCheckInFlight.current = false;
      setCheckingApk(false);
    }
  }, []);

  useEffect(() => {
    void checkForOtaUpdate(true);
    void checkForApkUpdate(true);

    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') {
        void checkForOtaUpdate();
        void checkForApkUpdate();
      }
    });
    const timer = setInterval(() => {
      void checkForOtaUpdate();
      void checkForApkUpdate();
    }, RETRY_INTERVAL_MS);

    return () => {
      subscription.remove();
      clearInterval(timer);
    };
  }, [checkForOtaUpdate, checkForApkUpdate]);

  const requiredApk = Boolean(release && release.minimum_version_code > installedCode);

  async function downloadApkUpdate() {
    if (!release || busy) return;
    setBusy(true);
    setMessage('');
    try {
      await Linking.openURL(release.download_url);
      setMessage('The APK download link has opened. After it downloads, open it and approve Android’s installer. Native APK updates require your approval.');
    } catch {
      setMessage('The APK link could not be opened. Check your connection or contact AthleteN support.');
    } finally {
      setBusy(false);
    }
  }

  async function restartForOtaUpdate() {
    if (busy || !otaReady || !Updates.isEnabled) return;
    setBusy(true);
    setMessage('');
    try {
      await Updates.reloadAsync();
    } catch {
      setBusy(false);
      setMessage('The update is downloaded, but AthleteN could not restart automatically. Close and reopen the app to apply it.');
    }
  }

  function retryAllChecks() {
    lastApkCheckAt.current = 0;
    lastOtaCheckAt.current = 0;
    setMessage('');
    void checkForOtaUpdate(true);
    void checkForApkUpdate(true);
  }

  // A mandatory native build takes precedence over OTA. A JS update cannot
  // supply native code, permissions, SDK changes, icons or splash assets.
  if (requiredApk && apkVisible && release) {
    return (
      <Modal visible transparent animationType="fade" onRequestClose={() => undefined}>
        <View style={s.scrim}>
          <View style={s.card}>
            <Text style={s.kicker}>ATHLETEN NATIVE RELEASE</Text>
            <Text style={s.title}>Required Android update</Text>
            <Text style={s.version}>Version {release.version} · Build {release.version_code}</Text>
            <Text style={s.body}>This release contains native app changes that OTA cannot install. Install the updated APK to continue.</Text>
            {release.release_notes ? <ScrollView style={s.notesScroll} nestedScrollEnabled><Text style={s.notes}>{release.release_notes}</Text></ScrollView> : null}
            <Pressable disabled={busy || checkingApk} onPress={() => void downloadApkUpdate()} style={[s.primary, (busy || checkingApk) && s.disabled]}>
              <Text style={s.primaryText}>{busy ? 'OPENING APK…' : 'DOWNLOAD ANDROID UPDATE'}</Text>
            </Pressable>
            <Pressable disabled={checkingApk || checkingOta} onPress={retryAllChecks} style={s.secondary}>
              <Text style={s.secondaryText}>{checkingApk || checkingOta ? 'CHECKING…' : 'CHECK AGAIN'}</Text>
            </Pressable>
            {message ? <Text accessibilityLiveRegion="polite" style={s.message}>{message}</Text> : null}
          </View>
        </View>
      </Modal>
    );
  }

  if (otaReady) {
    return (
      <Modal visible transparent animationType="fade" onRequestClose={() => setOtaReady(false)}>
        <View style={s.scrim}>
          <View style={s.card}>
            <Text style={s.kicker}>ATHLETEN SOFTWARE UPDATE</Text>
            <Text style={s.title}>Update downloaded</Text>
            <Text style={s.body}>A compatible AthleteN update is ready. Restart now to apply it, or continue using the current version and it will be applied the next time AthleteN starts.</Text>
            <Pressable disabled={busy} onPress={() => void restartForOtaUpdate()} style={[s.primary, busy && s.disabled]}>
              <Text style={s.primaryText}>{busy ? 'RESTARTING…' : 'RESTART AND UPDATE'}</Text>
            </Pressable>
            <Pressable onPress={() => setOtaReady(false)} style={s.secondary}>
              <Text style={s.secondaryText}>LATER</Text>
            </Pressable>
            <Text style={s.hint}>Compatible code updates download automatically. Native Android changes still require a new APK.</Text>
          </View>
        </View>
      </Modal>
    );
  }

  if (!apkVisible || !release) return null;

  return (
    <Modal visible transparent animationType="fade" onRequestClose={() => { if (!requiredApk) setApkVisible(false); }}>
      <View style={s.scrim}>
        <View style={s.card}>
          <Text style={s.kicker}>ATHLETEN NATIVE RELEASE</Text>
          <Text style={s.title}>Android update available</Text>
          <Text style={s.version}>Version {release.version} · Build {release.version_code}</Text>
          <Text style={s.body}>{requiredApk ? 'This release is required to keep using the supported AthleteN version.' : 'A newer native AthleteN build is ready.'}</Text>
          {release.release_notes ? <ScrollView style={s.notesScroll} nestedScrollEnabled><Text style={s.notes}>{release.release_notes}</Text></ScrollView> : null}
          <Pressable disabled={busy || checkingApk} onPress={() => void downloadApkUpdate()} style={[s.primary, (busy || checkingApk) && s.disabled]}>
            <Text style={s.primaryText}>{busy ? 'OPENING APK…' : 'DOWNLOAD ANDROID UPDATE'}</Text>
          </Pressable>
          <Pressable disabled={checkingApk || checkingOta} onPress={retryAllChecks} style={s.secondary}>
            <Text style={s.secondaryText}>{checkingApk || checkingOta ? 'CHECKING…' : 'CHECK AGAIN'}</Text>
          </Pressable>
          <Text style={s.hint}>APK updates are checked at launch and on return to AthleteN. Android requires your approval to install a native APK.</Text>
          {!requiredApk ? <Pressable onPress={() => setApkVisible(false)} style={s.secondary}><Text style={s.secondaryText}>NOT NOW</Text></Pressable> : null}
          {message ? <Text accessibilityLiveRegion="polite" style={s.message}>{message}</Text> : null}
        </View>
      </View>
    </Modal>
  );
}

const s = StyleSheet.create({
  scrim: { flex: 1, backgroundColor: 'rgba(0,0,0,0.78)', justifyContent: 'center', padding: 22 },
  card: { backgroundColor: c.surface, borderColor: c.accent, borderWidth: 1, borderRadius: 24, padding: 22, gap: 12 },
  kicker: { color: c.accentBright, fontSize: 9, fontWeight: '900', letterSpacing: 1.6 },
  title: { color: c.text, fontSize: 25, fontWeight: '900' },
  version: { color: c.accentBright, fontSize: 14, fontWeight: '800' },
  body: { color: c.text, fontSize: 13, lineHeight: 19 },
  notesScroll: { maxHeight: 130, backgroundColor: c.surfaceRaised, borderRadius: 12, padding: 12 },
  notes: { color: c.muted, fontSize: 12, lineHeight: 18 },
  primary: { backgroundColor: c.accent, borderRadius: 13, padding: 15, alignItems: 'center' },
  primaryText: { color: '#FFFFFF', fontSize: 11, fontWeight: '900', letterSpacing: 0.8 },
  disabled: { opacity: 0.6 },
  hint: { color: c.muted, fontSize: 10, lineHeight: 15 },
  secondary: { borderWidth: 1, borderColor: c.border, borderRadius: 12, alignItems: 'center', padding: 10 },
  secondaryText: { color: c.muted, fontSize: 10, fontWeight: '900', letterSpacing: 1 },
  message: { color: c.accentBright, fontSize: 11, lineHeight: 16 },
});
