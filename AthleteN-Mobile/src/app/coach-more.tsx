import { Pressable, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { Screen, Header, Section, Card, c } from '@/components/mobile-ui';
import CoachNav from '@/components/coach-nav';
import { useAuth } from '@/context/AuthContext';
import CoachSupportFooter from '@/components/coach-support-footer';

export default function CoachMore() {
  const router = useRouter();
  const { profile } = useAuth();
  const items = [
    ['Tournament Scanner', 'Find and track tournament sources.', '/scanner'],
    ['Competition Center', 'Review competition results and medals.', '/coach-competition'],
    ['Messages', 'Private athlete, coach and group communication.', '/messages'],
    ['Coach Profile', 'Photo, name, coach code, account and security.', '/coach-profile'],
    ['Feedback', 'Report a problem or request an improvement.', '/feedback'],
    ['Roadmap', 'See planned features and vote on what comes next.', '/roadmap'],
  ] as const;

  return (
    <Screen bottomBar={<CoachNav active="more" />}>
      <Header eyebrow="COACH TOOLS" title="More" subtitle="Everything outside your daily coaching workflow." />
      <Section title="TOOLS">
        {items.map(([title, text, route]) => (
          <Pressable key={route} onPress={() => router.push(route)}>
            <Card>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
                <View style={{ width: 42, height: 42, borderRadius: 14, backgroundColor: c.accentSoft, alignItems: 'center', justifyContent: 'center' }}>
                  <Text style={{ color: c.accentBright, fontWeight: '900', fontSize: 15 }}>{title.slice(0, 1)}</Text>
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={{ color: c.text, fontSize: 14, fontWeight: '900' }}>{title}</Text>
                  <Text style={{ color: c.muted, fontSize: 10, lineHeight: 15, marginTop: 2 }}>{text}</Text>
                </View>
                <Text style={{ color: c.muted, fontSize: 24 }}>›</Text>
              </View>
            </Card>
          </Pressable>
        ))}
      </Section>
      <Section title="ACCOUNT">
        <Card>
          <Text style={{ color: c.text, fontSize: 14, fontWeight: '900' }}>{profile?.full_name || 'Coach'}</Text>
          <Text style={{ color: c.muted, fontSize: 10, marginTop: 3 }}>Coach account · {profile?.account_code || 'Account code unavailable'}</Text>
          <Pressable onPress={() => router.push('/coach-profile')} style={{ marginTop: 10, backgroundColor: c.accent, borderRadius: 12, padding: 12, alignItems: 'center' }}>
            <Text style={{ color: '#fff', fontWeight: '900', fontSize: 10 }}>OPEN PROFILE</Text>
          </Pressable>
        </Card>
      </Section>
      <Section title="SUPPORT">
        <Card>
          <Text style={{ color: c.text, fontSize: 14, fontWeight: '900' }}>Need help?</Text>
          <Text style={{ color: c.muted, fontSize: 10, lineHeight: 15, marginTop: 3 }}>Contact AthleteN support for account, feature or technical help.</Text>
          <Pressable onPress={() => router.push('/feedback')} style={{ marginTop: 10, backgroundColor: c.accent, borderRadius: 12, padding: 12, alignItems: 'center' }}>
            <Text style={{ color: '#fff', fontWeight: '900', fontSize: 10 }}>SEND FEEDBACK</Text>
          </Pressable>
        </Card>
      </Section>
      <CoachSupportFooter />
    </Screen>
  );
}
