import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState, Linking, Modal, Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import Constants from 'expo-constants';
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
const CHECK_INTERVAL_MS = 6 * 60 * 60 * 1000;

export default function AppUpdateGate() {
  const [release, setRelease] = useState<Release | null>(null);
  const [visible, setVisible] = useState(false);
  const [busy, setBusy] = useState(false);
  const [checking, setChecking] = useState(false);
  const [message, setMessage] = useState('');
  const lastCheckedAt = useRef(0);
  const checkInFlight = useRef(false);

  const checkForUpdate = useCallback(async (force = false) => {
    if (Platform.OS !== 'android' || checkInFlight.current) return;
    if (!force && Date.now() - lastCheckedAt.current < CHECK_INTERVAL_MS) return;

    checkInFlight.current = true;
    setChecking(true);
    try {
      const { data, error } = await supabase
        .from('mobile_app_releases')
        .select('version,version_code,minimum_version_code,download_url,release_notes')
        .eq('id', true)
        .eq('published', true)
        .maybeSingle();

      if (error) return;
      lastCheckedAt.current = Date.now();

      if (!data) {
        setRelease(null);
        setVisible(false);
        setMessage('');
        return;
      }

      const next = data as Release;
      const versionCode = Number(next.version_code);
      const minimumCode = Number(next.minimum_version_code);
      let parsedUrl: URL;
      try {
        parsedUrl = new URL(String(next.download_url || ''));
      } catch {
        return;
      }

      const validRelease =
        typeof next.version === 'string' &&
        next.version.trim().length > 0 &&
        Number.isSafeInteger(versionCode) &&
        versionCode > 0 &&
        Number.isSafeInteger(minimumCode) &&
        minimumCode > 0 &&
        minimumCode <= versionCode &&
        parsedUrl.protocol === 'https:' &&
        Boolean(parsedUrl.hostname) &&
        !parsedUrl.username &&
        !parsedUrl.password &&
        parsedUrl.pathname.toLowerCase().endsWith('.apk');

      if (!validRelease) {
        setRelease(null);
        setVisible(false);
        return;
      }

      if (versionCode > installedCode || minimumCode > installedCode) {
        setRelease({ ...next, version_code: versionCode, minimum_version_code: minimumCode });
        setVisible(true);
        setMessage('');
      } else {
        setRelease(null);
        setVisible(false);
        setMessage('');
      }
    } catch {
      // A failed release check must never block sign-in, training or saved athlete data.
    } finally {
      checkInFlight.current = false;
      setChecking(false);
    }
  }, []);

  useEffect(() => {
    void checkForUpdate(true);
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') void checkForUpdate();
    });
    const timer = setInterval(() => void checkForUpdate(true), CHECK_INTERVAL_MS);
    return () => {
      subscription.remove();
      clearInterval(timer);
    };
  }, [checkForUpdate]);

  const required = Boolean(release && release.minimum_version_code > installedCode);

  async function downloadUpdate() {
    if (!release || busy) return;
    setBusy(true);
    setMessage('');
    try {
      await Linking.openURL(release.download_url);
      setMessage('The signed APK download has opened. When Android finishes downloading it, open the file and approve the system installer to replace AthleteN. Your current app stays installed until Android confirms the update.');
    } catch {
      setMessage('The APK link could not be opened. Check your connection or contact AthleteN support.');
    } finally {
      setBusy(false);
    }
  }

  function retryCheck() {
    lastCheckedAt.current = 0;
    setMessage('');
    void checkForUpdate(true);
  }

  if (!visible || !release) return null;

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={() => { if (!required) setVisible(false); }}>
      <View style={s.scrim}>
        <View style={s.card}>
          <Text style={s.kicker}>ATHLETEN RELEASE CONTROL</Text>
          <Text style={s.title}>Update available</Text>
          <Text style={s.version}>Version {release.version} · Build {release.version_code}</Text>
          <Text style={s.body}>{required ? 'This release is required to keep using the supported AthleteN version. Install it to continue.' : 'A newer AthleteN Android release is ready.'}</Text>
          {release.release_notes ? <ScrollView style={s.notesScroll} nestedScrollEnabled><Text style={s.notes}>{release.release_notes}</Text></ScrollView> : null}
          <Pressable disabled={busy || checking} onPress={() => void downloadUpdate()} style={[s.primary, (busy || checking) && s.disabled]}>
            <Text style={s.primaryText}>{busy ? 'OPENING APK…' : 'DOWNLOAD UPDATE'}</Text>
          </Pressable>
          <Pressable disabled={checking} onPress={retryCheck} style={s.secondary}>
            <Text style={s.secondaryText}>{checking ? 'CHECKING…' : 'CHECK AGAIN'}</Text>
          </Pressable>
          <Text style={s.hint}>AthleteN checks for published releases on launch and when reopened. Android requires your approval to install the downloaded APK; ordinary apps cannot silently replace themselves.</Text>
          {!required ? <Pressable onPress={() => setVisible(false)} style={s.secondary}><Text style={s.secondaryText}>NOT NOW</Text></Pressable> : null}
          {message ? <Text style={s.message}>{message}</Text> : null}
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
