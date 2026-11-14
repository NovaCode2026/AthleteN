import { Linking, Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAuth } from '@/context/AuthContext';
import { Colors } from '@/constants/theme';

const c = Colors.dark;

export default function AdminReleasesScreen() {
  const { profile } = useAuth();
  const allowed = profile?.role === 'super_admin';

  return (
    <SafeAreaView style={s.screen}>
      <View style={s.panel}>
        <Text style={s.kicker}>ATHLETEN RELEASE OPERATIONS</Text>
        <Text style={s.title}>{allowed ? 'Publishing is managed on the website' : 'Super Admin only'}</Text>
        <Text style={s.body}>
          {allowed
            ? 'To prepare a release, upload the signed APK, save a draft, or publish an Android update, use the website Admin Center → Founder Menu → Mobile Release Manager. The website is the single publishing control point.'
            : 'Android release management is restricted to Super Admin accounts.'}
        </Text>
        {allowed ? (
          <Pressable onPress={() => void Linking.openURL('https://athleten.netlify.app')} style={s.primary}>
            <Text style={s.primaryText}>OPEN ATHLETEN WEBSITE</Text>
          </Pressable>
        ) : null}
      </View>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  screen: { flex: 1, backgroundColor: c.background, justifyContent: 'center', padding: 20 },
  panel: { backgroundColor: c.surface, borderColor: c.borderStrong, borderWidth: 1, borderRadius: 20, padding: 20, gap: 14 },
  kicker: { color: c.accentBright, fontSize: 9, fontWeight: '900', letterSpacing: 1.5 },
  title: { color: c.text, fontSize: 23, fontWeight: '900' },
  body: { color: c.muted, fontSize: 12, lineHeight: 19 },
  primary: { backgroundColor: c.accent, borderRadius: 12, padding: 14, alignItems: 'center' },
  primaryText: { color: '#FFFFFF', fontSize: 10, fontWeight: '900', letterSpacing: 0.7 },
});
