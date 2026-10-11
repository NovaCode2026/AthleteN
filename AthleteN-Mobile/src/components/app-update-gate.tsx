import { useCallback, useEffect, useState } from 'react';
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
const installedVersion = String(Constants.expoConfig?.version || '1.0.0');
const installedCode = Number(Constants.expoConfig?.android?.versionCode || 1);

export default function AppUpdateGate() {
  const [release, setRelease] = useState<Release | null>(null);
  const [visible, setVisible] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [lastCheckedAt, setLastCheckedAt] = useState(0);

  const checkForUpdate = useCallback(async (force = false) => {
    if (Platform.OS !== 'android' || busy) return;
    if (!force && Date.now() - lastCheckedAt < 6 * 60 * 60 * 1000) return;
    setLastCheckedAt(Date.now());
    try {
      const { data, error } = await supabase
        .from('mobile_app_releases')
        .select('version,version_code,minimum_version_code,download_url,release_notes')
        .eq('id', true)
        .eq('published', true)
        .maybeSingle();
      if (error || !data) return;
      const next = data as Release;
      const url = String(next.download_url || '');
      if (!url.startsWith('https://')) return;
      if (Number(next.version_code) > installedCode || Number(next.minimum_version_code) > installedCode) {
        setRelease(next);
        setVisible(true);
      } else {
        setRelease(null);
        setVisible(false);
      }
    } catch {
      // Updates are best-effort; network problems must not block sign-in or training.
    }
  }, [busy, lastCheckedAt]);

  useEffect(() => {
    void checkForUpdate(true);
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') void checkForUpdate();
    });
    const timer = setInterval(() => void checkForUpdate(true), 6 * 60 * 60 * 1000);
    return () => {
      subscription.remove();
      clearInterval(timer);
    };
  }, [checkForUpdate]);

  const required = Boolean(release && Number(release.minimum_version_code) > installedCode);

  async function downloadUpdate() {
    if (!release || busy) return;
    setBusy(true);
    setMessage('');
    try {
      await Linking.openURL(release.download_url);
      setMessage('The APK download page has opened. Download the APK, then tap the downloaded file and approve Android’s installer prompt. Your current app remains installed until Android confirms the update.');
    } catch {
      setMessage('Could not open the download link. Check your internet connection or contact AthleteN support.');
    } finally {
      setBusy(false);
    }
  }

  if (!visible || !release) return null;

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={() => { if (!required) setVisible(false); }}>
      <View style={s.scrim}>
        <View style={s.card}>
          <Text style={s.kicker}>ATHLETEN RELEASE CONTROL</Text>
          <Text style={s.title}>Update available</Text>
          <Text style={s.version}>Version {release.version}</Text>
          <Text style={s.body}>{required ? 'This release is marked as required. Update to continue using the latest supported AthleteN version.' : 'A newer AthleteN version is ready.'}</Text>
          {release.release_notes ? <ScrollView style={s.notesScroll} nestedScrollEnabled><Text style={s.notes}>{release.release_notes}</Text></ScrollView> : null}
          <Pressable disabled={busy} onPress={() => void downloadUpdate()} style={[s.primary, busy && s.disabled]}>
            <Text style={s.primaryText}>{busy ? 'OPENING DOWNLOAD…' : 'DOWNLOAD UPDATE'}</Text>
          </Pressable>
          <Text style={s.hint}>Android requires your approval to install APK updates. This check does not install software silently.</Text>
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
  secondary: { alignItems: 'center', padding: 10 },
  secondaryText: { color: c.muted, fontSize: 10, fontWeight: '900', letterSpacing: 1 },
  message: { color: c.accentBright, fontSize: 11, lineHeight: 16 },
});
