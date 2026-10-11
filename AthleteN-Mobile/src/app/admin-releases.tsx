import { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import Constants from 'expo-constants';
import { Colors } from '@/constants/theme';
import { useAuth } from '@/context/AuthContext';
import { supabase } from '@/lib/supabase';

const c = Colors.dark;
type ReleaseRow = {
  version: string;
  version_code: number;
  minimum_version_code: number;
  download_url: string;
  release_notes: string | null;
  published: boolean;
  updated_at: string;
};

export default function AdminReleasesScreen() {
  const router = useRouter();
  const { profile, session } = useAuth();
  const allowed = profile?.role === 'super_admin';
  const [version, setVersion] = useState('1.0.2');
  const [versionCode, setVersionCode] = useState('3');
  const [minimumVersionCode, setMinimumVersionCode] = useState('1');
  const [downloadUrl, setDownloadUrl] = useState('');
  const [notes, setNotes] = useState('');
  const [published, setPublished] = useState(false);
  const [current, setCurrent] = useState<ReleaseRow | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');

  async function load() {
    if (!allowed) return;
    const { data, error } = await supabase.from('mobile_app_releases').select('*').eq('id', true).maybeSingle();
    if (error) { setMessage(error.message); return; }
    if (!data) return;
    const row = data as ReleaseRow;
    setCurrent(row);
    setVersion(row.version);
    setVersionCode(String(row.version_code));
    setMinimumVersionCode(String(row.minimum_version_code));
    setDownloadUrl(row.download_url);
    setNotes(row.release_notes || '');
    setPublished(row.published);
  }

  useEffect(() => { void load(); }, [allowed]);

  async function save(nextPublished: boolean) {
    if (!allowed || !session || busy) return;
    const code = Number(versionCode);
    const minimum = Number(minimumVersionCode);
    if (!/^\d+\.\d+\.\d+(?:[+-][0-9A-Za-z.-]+)?$/.test(version.trim()) ||
        !Number.isSafeInteger(code) || code < 1 ||
        !Number.isSafeInteger(minimum) || minimum < 1) {
      setMessage('Use a version such as 1.0.3 and positive whole-number version codes.');
      return;
    }
    let parsedUrl: URL;
    try {
      parsedUrl = new URL(downloadUrl.trim());
    } catch {
      setMessage('Enter a valid HTTPS URL for the APK release asset.');
      return;
    }
    if (parsedUrl.protocol !== 'https:' || !parsedUrl.hostname || parsedUrl.username || parsedUrl.password) {
      setMessage('The APK URL must use HTTPS and cannot contain embedded credentials.');
      return;
    }
    if (!parsedUrl.pathname.toLowerCase().endsWith('.apk')) {
      setMessage('Use a direct HTTPS link to the signed .apk file, not a GitHub release page or website page.');
      return;
    }
    if (notes.length > 10000) {
      setMessage('Release notes must be 10,000 characters or fewer.');
      return;
    }
    if (nextPublished && current && code < current.version_code) {
      setMessage('A published Android release cannot move to a lower version code. Increase the code for a newer release.');
      return;
    }
    if (minimum > code) {
      setMessage('Minimum supported version code cannot be greater than the published version code.');
      return;
    }
    setBusy(true);
    setMessage('');
    const { error } = await supabase.from('mobile_app_releases').upsert({
      id: true,
      version: version.trim(),
      version_code: code,
      minimum_version_code: minimum,
      download_url: downloadUrl.trim(),
      release_notes: notes.trim(),
      published: nextPublished,
      updated_by: session.user.id,
      updated_at: new Date().toISOString(),
    }, { onConflict: 'id' });
    setBusy(false);
    if (error) { setMessage(error.message); return; }
    setPublished(nextPublished);
    setMessage(nextPublished ? 'Release published. Android users will be prompted to update when they check in.' : 'Release saved as a draft; users will not see it.');
    await load();
  }

  if (!allowed) {
    return <SafeAreaView style={s.screen}><View style={s.panel}><Text style={s.kicker}>RELEASE SECURITY</Text><Text style={s.title}>Super Admin only</Text><Text style={s.body}>Only a Super Admin can publish a native Android release.</Text></View></SafeAreaView>;
  }

  return <SafeAreaView style={s.screen} edges={['top']}>
    <ScrollView contentContainerStyle={s.content}>
      <Pressable onPress={() => router.back()}><Text style={s.back}>‹ BACK</Text></Pressable>
      <Text style={s.kicker}>ANDROID RELEASE CONTROL</Text>
      <Text style={s.title}>Pre-Play-Store updates</Text>
      <Text style={s.body}>Upload the signed APK to a stable HTTPS direct-file URL ending in .apk first. Save as draft to prepare it; publish only after you verify the APK and version code. When published, the app checks on launch and prompts users with this download link.</Text>
      <View style={s.panel}>
        <Text style={s.label}>INSTALLED BUILD</Text>
        <Text style={s.body}>Installed build metadata: version {String(Constants.expoConfig?.version || 'unknown')} · Android version code {String(Constants.expoConfig?.android?.versionCode || 'unknown')}. Every distributed update must use the same application ID and signing key.</Text>
        <Field label="VERSION NAME" value={version} onChangeText={setVersion} placeholder="1.0.2" />
        <Field label="ANDROID VERSION CODE" value={versionCode} onChangeText={setVersionCode} placeholder="3" keyboardType="number-pad" />
        <Field label="MINIMUM SUPPORTED VERSION CODE" value={minimumVersionCode} onChangeText={setMinimumVersionCode} placeholder="1" keyboardType="number-pad" />
        <Field label="SIGNED APK DOWNLOAD URL (HTTPS)" value={downloadUrl} onChangeText={setDownloadUrl} placeholder="https://github.com/.../releases/download/..." />
        <Text style={s.label}>RELEASE NOTES</Text>
        <TextInput multiline value={notes} onChangeText={setNotes} placeholder="What changed in this release?" placeholderTextColor={c.muted} style={[s.input, s.notesInput]} />
        <View style={s.statusRow}><View style={{ flex: 1 }}><Text style={s.label}>PUBLICATION</Text><Text style={s.body}>{published ? 'Live to normal users' : 'Draft — hidden from users'}</Text></View><View style={[s.pill, published && s.pillOn]}><Text style={s.pillText}>{published ? 'PUBLISHED' : 'DRAFT'}</Text></View></View>
        {current?.updated_at ? <Text style={s.small}>Last saved: {new Date(current.updated_at).toLocaleString()}</Text> : null}
        <Pressable disabled={busy} onPress={() => void save(false)} style={[s.secondary, busy && s.disabled]}><Text style={s.secondaryText}>SAVE DRAFT</Text></Pressable>
        <Pressable disabled={busy} onPress={() => void save(true)} style={[s.primary, busy && s.disabled]}><Text style={s.primaryText}>PUBLISH TO ANDROID USERS</Text></Pressable>
        {busy ? <ActivityIndicator color={c.accentBright} /> : null}
        {message ? <Text style={s.message}>{message}</Text> : null}
      </View>
      <View style={s.panel}>
        <Text style={s.label}>IMPORTANT</Text>
        <Text style={s.body}>Android cannot silently install an APK on standard consumer phones. AthleteN can detect the release and open the direct APK download, but each user must open the downloaded file and approve Android’s installer. Keep the same signing key and package name for every update, and always increase versionCode. JavaScript-only changes can be delivered differently through an OTA update system, but that requires separate Expo Updates configuration and a native build.</Text>
      </View>
    </ScrollView>
  </SafeAreaView>;
}

function Field({ label, value, onChangeText, placeholder, keyboardType }: { label: string; value: string; onChangeText: (value: string) => void; placeholder: string; keyboardType?: 'default' | 'number-pad' }) {
  return <View style={s.field}><Text style={s.label}>{label}</Text><TextInput value={value} onChangeText={onChangeText} placeholder={placeholder} placeholderTextColor={c.muted} keyboardType={keyboardType} autoCapitalize="none" style={s.input} /></View>;
}

const s = StyleSheet.create({
  screen: { flex: 1, backgroundColor: c.background },
  content: { padding: 18, paddingBottom: 44, gap: 14 },
  panel: { backgroundColor: c.surface, borderColor: c.borderStrong, borderWidth: 1, borderRadius: 20, padding: 17, gap: 13 },
  kicker: { color: c.accentBright, fontSize: 9, fontWeight: '900', letterSpacing: 1.5 },
  title: { color: c.text, fontSize: 25, fontWeight: '900' },
  body: { color: c.muted, fontSize: 12, lineHeight: 18 },
  back: { color: c.accentBright, fontSize: 10, fontWeight: '900', letterSpacing: 1 },
  field: { gap: 6 },
  label: { color: c.muted, fontSize: 9, fontWeight: '900', letterSpacing: 1 },
  input: { color: c.text, backgroundColor: c.surfaceRaised, borderColor: c.border, borderWidth: 1, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 12, fontSize: 12 },
  notesInput: { minHeight: 88, textAlignVertical: 'top' },
  statusRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  pill: { borderColor: c.border, borderWidth: 1, borderRadius: 99, paddingHorizontal: 10, paddingVertical: 6 },
  pillOn: { borderColor: c.accent },
  pillText: { color: c.accentBright, fontSize: 9, fontWeight: '900' },
  small: { color: c.muted, fontSize: 10 },
  secondary: { borderColor: c.borderStrong, borderWidth: 1, borderRadius: 12, padding: 14, alignItems: 'center' },
  secondaryText: { color: c.text, fontSize: 10, fontWeight: '900' },
  primary: { backgroundColor: c.accent, borderRadius: 12, padding: 14, alignItems: 'center' },
  primaryText: { color: '#FFFFFF', fontSize: 10, fontWeight: '900', letterSpacing: 0.7 },
  disabled: { opacity: 0.6 },
  message: { color: c.accentBright, fontSize: 11, lineHeight: 16 },
});
