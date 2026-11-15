import { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import Constants from 'expo-constants';
import * as DocumentPicker from 'expo-document-picker';
import { Colors } from '@/constants/theme';
import { useAuth } from '@/context/AuthContext';
import { supabase } from '@/lib/supabase';

const c = Colors.dark;
const APK_BUCKET = 'mobile-release-apks';
const APK_MIME_TYPE = 'application/vnd.android.package-archive';

type ReleaseRow = {
  version: string;
  version_code: number;
  minimum_version_code: number;
  download_url: string;
  release_notes: string | null;
  published: boolean;
  updated_at: string;
};
type ApkAsset = { name: string; uri: string; size?: number | null; mimeType?: string | null };

export default function AdminReleasesScreen() {
  const router = useRouter();
  const { profile, session } = useAuth();
  const allowed = profile?.role === 'super_admin';
  const [version, setVersion] = useState('1.0.4');
  const [versionCode, setVersionCode] = useState('5');
  const [minimumVersionCode, setMinimumVersionCode] = useState('4');
  const [downloadUrl, setDownloadUrl] = useState('');
  const [notes, setNotes] = useState('');
  const [apkFile, setApkFile] = useState<ApkAsset | null>(null);
  const [published, setPublished] = useState(false);
  const [current, setCurrent] = useState<ReleaseRow | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');

  async function load() {
    if (!allowed) return;
    const { data, error } = await supabase.from('mobile_app_releases').select('*').eq('id', true).maybeSingle();
    if (error) { setMessage(error.message); return; }
    if (!data) {
      setCurrent(null);
      setPublished(false);
      setVersion('1.0.4');
      setVersionCode('5');
      setMinimumVersionCode('4');
      setDownloadUrl('');
      setNotes('');
      return;
    }
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

  async function chooseApk() {
    if (!allowed || busy) return;
    setMessage('');
    try {
      const result = await DocumentPicker.getDocumentAsync({
        copyToCacheDirectory: true,
        multiple: false,
        type: [APK_MIME_TYPE, 'application/octet-stream'],
      });
      if (result.canceled || !result.assets?.[0]) return;
      const asset = result.assets[0];
      const name = String(asset.name || '');
      if (!name.toLowerCase().endsWith('.apk')) {
        setApkFile(null);
        setMessage('Select a signed Android .apk file.');
        return;
      }
      setApkFile({ name, uri: asset.uri, size: asset.size, mimeType: asset.mimeType });
      setDownloadUrl('');
      setMessage('APK selected. Verify its version code and signing key before publishing.');
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Could not open the APK picker.');
    }
  }

  async function publish() {
    if (!allowed || !session || busy) return;
    const code = Number(versionCode);
    const minimum = Number(minimumVersionCode);
    const cleanVersion = version.trim();
    if (!/^\d+\.\d+\.\d+(?:[+-][0-9A-Za-z.-]+)?$/.test(cleanVersion) ||
        !Number.isSafeInteger(code) || code < 1 ||
        !Number.isSafeInteger(minimum) || minimum < 1) {
      setMessage('Use a version such as 1.0.4 and positive whole-number version codes.');
      return;
    }
    if (minimum > code) {
      setMessage('Minimum supported version code cannot be greater than the published version code.');
      return;
    }
    if (current?.published && code <= current.version_code) {
      setMessage('The next published APK must use a version code higher than the currently published release.');
      return;
    }
    if (current && !current.published && code < current.version_code) {
      setMessage('A new release cannot move to a lower version code.');
      return;
    }
    if (notes.length > 10000) {
      setMessage('Release notes must be 10,000 characters or fewer.');
      return;
    }
    if (!apkFile && !downloadUrl.trim()) {
      setMessage('Choose a signed APK from this device or enter its direct HTTPS download URL.');
      return;
    }

    let releaseDownloadUrl = downloadUrl.trim();
    if (!apkFile) {
      let parsedUrl: URL;
      try { parsedUrl = new URL(releaseDownloadUrl); }
      catch {
        setMessage('Enter a direct HTTPS URL for the APK release asset.');
        return;
      }
      if (parsedUrl.protocol !== 'https:' || !parsedUrl.hostname || parsedUrl.username || parsedUrl.password ||
          !parsedUrl.pathname.toLowerCase().endsWith('.apk')) {
        setMessage('Use a direct HTTPS link ending in .apk, without embedded credentials.');
        return;
      }
      if (current?.published && code > current.version_code && releaseDownloadUrl === current.download_url) {
        setMessage('This is the previous release APK link. Select the new APK or enter a new direct link.');
        return;
      }
    }

    setBusy(true);
    setMessage('');
    let uploadedPath: string | null = null;
    try {
      if (apkFile) {
        const response = await fetch(apkFile.uri);
        if (!response.ok) throw new Error('Could not read the selected APK from the device cache.');
        const apkBytes = await response.arrayBuffer();
        if (apkBytes.byteLength <= 0) throw new Error('The selected APK is empty.');
        const safeVersion = cleanVersion.replace(/[^0-9A-Za-z.-]/g, '-');
        const filePath = code + '/' + Date.now() + '-AthleteN-' + safeVersion + '.apk';
        const { error: uploadError } = await supabase.storage.from(APK_BUCKET).upload(filePath, apkBytes, {
          cacheControl: '31536000',
          contentType: APK_MIME_TYPE,
          upsert: false,
        });
        if (uploadError) throw uploadError;
        uploadedPath = filePath;
        const { data: publicAsset } = supabase.storage.from(APK_BUCKET).getPublicUrl(filePath);
        releaseDownloadUrl = publicAsset.publicUrl;
      }

      const finalUrl = new URL(releaseDownloadUrl);
      if (finalUrl.protocol !== 'https:' || !finalUrl.hostname || finalUrl.username || finalUrl.password ||
          !finalUrl.pathname.toLowerCase().endsWith('.apk')) {
        throw new Error('The resolved release asset is not a valid direct HTTPS APK URL.');
      }

      const { error } = await supabase.from('mobile_app_releases').upsert({
        id: true,
        version: cleanVersion,
        version_code: code,
        minimum_version_code: minimum,
        download_url: releaseDownloadUrl,
        release_notes: notes.trim(),
        published: true,
        updated_by: session.user.id,
        updated_at: new Date().toISOString(),
      }, { onConflict: 'id' });
      if (error) throw error;

      setDownloadUrl(releaseDownloadUrl);
      setApkFile(null);
      setPublished(true);
      setMessage('Release published. Android devices will detect it on their next automatic check.');
      await load();
    } catch (error) {
      const rawMessage = error instanceof Error ? error.message : 'The Android release could not be published.';
      const baseMessage = /maximum|file.?size|payload too large|413/i.test(rawMessage)
        ? rawMessage + ' Supabase currently enforces a 50 MB global upload ceiling on this Free project. Use the direct HTTPS APK URL field for a larger file, or raise the project Storage limit in Supabase.'
        : rawMessage;
      if (uploadedPath) {
        const { error: cleanupError } = await supabase.storage.from(APK_BUCKET).remove([uploadedPath]);
        setMessage(cleanupError
          ? baseMessage + ' The uploaded file could not be removed automatically; contact support before retrying.'
          : baseMessage);
      } else {
        setMessage(baseMessage);
      }
    } finally {
      setBusy(false);
    }
  }

  if (!allowed) {
    return <SafeAreaView style={s.screen}><View style={s.panel}><Text style={s.kicker}>RELEASE SECURITY</Text><Text style={s.title}>Super Admin only</Text><Text style={s.body}>Only a Super Admin can upload or publish a native Android release.</Text></View></SafeAreaView>;
  }

  return (
    <SafeAreaView style={s.screen} edges={['top']}>
      <ScrollView contentContainerStyle={s.content} keyboardShouldPersistTaps="handled">
        <Pressable onPress={() => router.back()}><Text style={s.back}>‹ BACK</Text></Pressable>
        <Text style={s.kicker}>ANDROID RELEASE CONTROL</Text>
        <Text style={s.title}>Automatic app updates</Text>
        <Text style={s.body}>Publish a signed APK here or from the Web Admin Command Center. Android devices check the published release on launch, when reopened, and periodically while AthleteN is active.</Text>

        <View style={s.panel}>
          <Text style={s.label}>CURRENT RELEASE</Text>
          <View style={s.statusRow}>
            <View style={{ flex: 1 }}>
              <Text style={s.releaseName}>{current?.published ? 'Version ' + current.version + ' · Build ' + current.version_code : 'No Android release is live'}</Text>
              <Text style={s.body}>{published ? 'Published to compatible Android devices' : 'No published release is currently being served.'}</Text>
            </View>
            <View style={[s.pill, published && s.pillOn]}><Text style={s.pillText}>{published ? 'LIVE' : 'NOT LIVE'}</Text></View>
          </View>
          {current?.updated_at ? <Text style={s.small}>Last published: {new Date(current.updated_at).toLocaleString()}</Text> : null}
        </View>

        <View style={s.panel}>
          <Text style={s.label}>BUILD DETAILS</Text>
          <Text style={s.body}>Installed app version {String(Constants.expoConfig?.version || 'unknown')} · Local Android version code {String(Constants.expoConfig?.android?.versionCode || 'unknown')}. EAS remote versioning can assign a different final code, so use the actual code shown by the completed build.</Text>
          <Field label="VERSION NAME" value={version} onChangeText={setVersion} placeholder="1.0.4" />
          <Field label="ANDROID VERSION CODE" value={versionCode} onChangeText={setVersionCode} placeholder="5" keyboardType="number-pad" />
          <Field label="MINIMUM SUPPORTED VERSION CODE" value={minimumVersionCode} onChangeText={setMinimumVersionCode} placeholder="1" keyboardType="number-pad" />

          <View style={s.uploadBox}>
            <Text style={s.label}>SIGNED APK FILE · NO APP-SIDE SIZE CAP</Text>
            <Pressable disabled={busy} onPress={() => void chooseApk()} style={[s.secondary, busy && s.disabled]}>
              <Text style={s.secondaryText}>{apkFile ? 'CHOOSE A DIFFERENT APK' : 'SELECT APK FROM DEVICE'}</Text>
            </Pressable>
            {apkFile ? (
              <View style={s.fileRow}>
                <View style={{ flex: 1 }}>
                  <Text style={s.fileName} numberOfLines={2}>{apkFile.name}</Text>
                  <Text style={s.small}>{apkFile.size != null ? (apkFile.size / (1024 * 1024)).toFixed(2) + ' MB' : 'File size will be verified before upload'}</Text>
                </View>
                <Pressable disabled={busy} onPress={() => { setApkFile(null); setMessage('Selected APK cleared.'); }}><Text style={s.clearText}>CLEAR</Text></Pressable>
              </View>
            ) : <Text style={s.body}>Upload the signed APK directly from your phone. The app has no APK size cap. Supabase Free projects currently enforce a 50 MB global file limit; use a direct HTTPS APK URL for larger files until the project Storage limit is raised.</Text>}
            <Text style={s.or}>OR USE A DIRECT HTTPS APK LINK</Text>
            <TextInput value={downloadUrl} onChangeText={setDownloadUrl} editable={!Boolean(apkFile) && !busy} placeholder="https://downloads.example.com/athleten.apk" placeholderTextColor={c.muted} autoCapitalize="none" autoCorrect={false} keyboardType="url" style={[s.input, Boolean(apkFile) && s.inputDisabled]} />
          </View>

          <Text style={s.label}>RELEASE NOTES</Text>
          <TextInput multiline value={notes} onChangeText={setNotes} maxLength={10000} placeholder="What changed in this release?" placeholderTextColor={c.muted} style={[s.input, s.notesInput]} />
          <Text style={s.small}>Release notes: {notes.length}/10,000 characters</Text>
          <Pressable disabled={busy} onPress={() => void publish()} style={[s.primary, busy && s.disabled]}><Text style={s.primaryText}>{busy ? (apkFile ? 'UPLOADING & PUBLISHING…' : 'PUBLISHING…') : 'PUBLISH ANDROID UPDATE'}</Text></Pressable>
          {busy ? <ActivityIndicator color={c.accentBright} /> : null}
          {message ? <Text accessibilityLiveRegion="polite" style={s.message}>{message}</Text> : null}
        </View>

        <View style={s.panel}>
          <Text style={s.label}>HOW AUTOMATIC UPDATES WORK</Text>
          <Text style={s.body}>AthleteN checks for a published release on app launch, when the app returns to the foreground, and on a periodic check while it is open. An optional or required update prompt opens the signed APK download. Android still asks the device owner to approve the system installer; ordinary apps cannot silently replace their installed APK.</Text>
          <Text style={s.body}>Keep the same package name and signing key for every APK. Increase versionCode for each release. The release bucket has no additional per-bucket size cap; the Supabase project-wide Storage plan limit still applies. JavaScript-only over-the-air updates are a separate feature and are not enabled in the current native binary.</Text>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

function Field({ label, value, onChangeText, placeholder, keyboardType }: { label: string; value: string; onChangeText: (value: string) => void; placeholder: string; keyboardType?: 'default' | 'number-pad' }) {
  return <View style={s.field}><Text style={s.label}>{label}</Text><TextInput value={value} onChangeText={onChangeText} placeholder={placeholder} placeholderTextColor={c.muted} keyboardType={keyboardType} autoCapitalize="none" autoCorrect={false} style={s.input} /></View>;
}

const s = StyleSheet.create({
  screen: { flex: 1, backgroundColor: c.background },
  content: { paddingHorizontal: 18, paddingTop: 12, paddingBottom: 54, gap: 14 },
  panel: { backgroundColor: c.surface, borderColor: c.borderStrong, borderWidth: 1, borderRadius: 20, padding: 16, gap: 12 },
  kicker: { color: c.accentBright, fontSize: 9, fontWeight: '900', letterSpacing: 1.5 },
  title: { color: c.text, fontSize: 25, fontWeight: '900' },
  body: { color: c.muted, fontSize: 11, lineHeight: 17 },
  back: { color: c.accentBright, fontSize: 10, fontWeight: '900', letterSpacing: 1 },
  releaseName: { color: c.text, fontSize: 16, fontWeight: '900' },
  field: { gap: 6 },
  label: { color: c.muted, fontSize: 9, fontWeight: '900', letterSpacing: 1 },
  input: { color: c.text, backgroundColor: c.surfaceRaised, borderColor: c.border, borderWidth: 1, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 12, fontSize: 12 },
  inputDisabled: { opacity: 0.55 },
  notesInput: { minHeight: 88, textAlignVertical: 'top' },
  uploadBox: { borderWidth: 1, borderColor: c.border, borderRadius: 15, padding: 12, gap: 10, backgroundColor: c.background },
  statusRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  fileRow: { flexDirection: 'row', alignItems: 'center', gap: 10, borderTopWidth: 1, borderTopColor: c.border, paddingTop: 10 },
  fileName: { color: c.text, fontSize: 11, fontWeight: '800', lineHeight: 16 },
  clearText: { color: c.danger, fontSize: 9, fontWeight: '900' },
  or: { color: c.muted, fontSize: 8, fontWeight: '900', textAlign: 'center', letterSpacing: 1 },
  pill: { borderColor: c.border, borderWidth: 1, borderRadius: 99, paddingHorizontal: 10, paddingVertical: 6 },
  pillOn: { borderColor: c.success },
  pillText: { color: c.accentBright, fontSize: 9, fontWeight: '900' },
  small: { color: c.muted, fontSize: 9, lineHeight: 14 },
  secondary: { borderColor: c.borderStrong, borderWidth: 1, borderRadius: 12, padding: 13, alignItems: 'center', backgroundColor: c.surface },
  secondaryText: { color: c.accentBright, fontSize: 10, fontWeight: '900', letterSpacing: 0.6 },
  primary: { backgroundColor: c.accent, borderRadius: 12, padding: 14, alignItems: 'center' },
  primaryText: { color: '#FFFFFF', fontSize: 10, fontWeight: '900', letterSpacing: 0.7 },
  disabled: { opacity: 0.55 },
  message: { color: c.accentBright, fontSize: 10, lineHeight: 16 },
});