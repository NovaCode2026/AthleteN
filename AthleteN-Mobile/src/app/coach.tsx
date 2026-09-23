import { useEffect, useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { Image } from 'expo-image';
import { useRouter } from 'expo-router';
import { Screen, Card, c } from '@/components/mobile-ui';
import { useAuth } from '@/context/AuthContext';
import { supabase } from '@/lib/supabase';
import CoachNav from '@/components/coach-nav';

type Athlete = {
  athlete_user_id: string;
  full_name?: string | null;
  discipline?: string | null;
  belt?: string | null;
  weight_kg?: number | null;
};

function IconTile({ icon, tone }: { icon: string; tone: 'blue' | 'green' | 'red' | 'purple' | 'slate' }) {
  const bg = tone === 'green' ? '#073d24' : tone === 'red' ? '#451522' : tone === 'purple' ? '#2c174f' : tone === 'slate' ? '#152033' : '#0b274c';
  const color = tone === 'green' ? '#39e878' : tone === 'red' ? '#ff7082' : tone === 'purple' ? '#c16cff' : '#69a9ff';
  return (
    <View style={{ width: 60, height: 60, borderRadius: 19, backgroundColor: bg, alignItems: 'center', justifyContent: 'center' }}>
      <Text style={{ color, fontSize: 27, fontWeight: '900' }}>{icon}</Text>
    </View>
  );
}

function ActionCard({ icon, tone, title, subtitle, onPress }: { icon: string; tone: 'blue' | 'green' | 'red' | 'purple'; title: string; subtitle: string; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} style={({ pressed }) => [{ width: '48%', minHeight: 118 }, pressed && { opacity: 0.78 }]}>
      <Card>
        <View style={{ gap: 12 }}>
          <IconTile icon={icon} tone={tone} />
          <View style={{ flexDirection: 'row', alignItems: 'center' }}>
            <View style={{ flex: 1 }}>
              <Text style={{ color: c.text, fontSize: 16, fontWeight: '900' }}>{title}</Text>
              <Text style={{ color: c.muted, fontSize: 11, lineHeight: 16, marginTop: 3 }}>{subtitle}</Text>
            </View>
            <Text style={{ color: c.muted, fontSize: 27 }}>›</Text>
          </View>
        </View>
      </Card>
    </Pressable>
  );
}

export default function Coach() {
  const { profile } = useAuth();
  const router = useRouter();
  const [athletes, setAthletes] = useState<Athlete[]>([]);
  const [events, setEvents] = useState(0);
  const [approvals, setApprovals] = useState(0);
  const [avatar, setAvatar] = useState<string | null>(null);

  async function load() {
    if (!profile?.user_id) return;

    const links = await supabase.from('coach_athlete_links')
      .select('athlete_user_id')
      .eq('coach_user_id', profile.user_id)
      .eq('status', 'active');

    const ids = (links.data || []).map((x: any) => x.athlete_user_id);
    if (ids.length) {
      const p = await supabase.from('profiles')
        .select('user_id,full_name,discipline,belt,weight_kg')
        .in('user_id', ids);
      const byId = new Map((p.data || []).map((x: any) => [x.user_id, x]));
      setAthletes(ids.map((id: string) => ({ athlete_user_id: id, ...(byId.get(id) || {}) })));
    } else {
      setAthletes([]);
    }

    const approval = await supabase.from('coach_approval_requests')
      .select('id', { count: 'exact', head: true })
      .eq('coach_user_id', profile.user_id)
      .eq('status', 'pending');
    setApprovals(approval.count || 0);

    const tournaments = await supabase.from('tournaments')
      .select('id', { count: 'exact', head: true })
      .eq('coach_user_id', profile.user_id)
      .gte('start_date', new Date().toISOString().slice(0, 10));
    setEvents(tournaments.count || 0);

    if (profile.profile_image_path) {
      const signed = await supabase.storage.from('avatars').createSignedUrl(profile.profile_image_path, 3600);
      setAvatar(signed.data?.signedUrl || null);
    } else {
      setAvatar(null);
    }
  }

  useEffect(() => { void load(); }, [profile?.user_id, profile?.profile_image_path]);

  const firstName = (profile?.full_name || 'Coach').split(' ')[0];
  const initial = (profile?.full_name || 'C').slice(0, 1).toUpperCase();

  return (
    <Screen bottomBar={<CoachNav active="home" />}>
      <View style={{ gap: 24 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingTop: 2 }}>
          <Image source={require('../../assets/images/logo-glow.png')} style={{ width: 170, height: 54 }} contentFit="contain" />
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
            <Pressable onPress={() => router.push('/messages')} style={{ width: 40, height: 48, alignItems: 'center', justifyContent: 'center' }}>
              <Text style={{ color: c.text, fontSize: 27 }}>♧</Text>
              <View style={{ position: 'absolute', right: 3, top: 7, width: 8, height: 8, borderRadius: 4, backgroundColor: c.accentBright }} />
            </Pressable>
            <Pressable onPress={() => router.push('/coach-profile')} style={{ flexDirection: 'row', alignItems: 'center', gap: 9 }}>
              {avatar ? (
                <Image source={{ uri: avatar }} style={{ width: 50, height: 50, borderRadius: 25 }} contentFit="cover" />
              ) : (
                <View style={{ width: 50, height: 50, borderRadius: 25, backgroundColor: '#17335e', alignItems: 'center', justifyContent: 'center' }}>
                  <Text style={{ color: '#6faaff', fontSize: 20, fontWeight: '900' }}>{initial}</Text>
                </View>
              )}
              <View>
                <Text style={{ color: c.text, fontSize: 15, fontWeight: '900' }}>Coach</Text>
                <Text style={{ color: c.muted, fontSize: 11, marginTop: 2 }}>View profile  ›</Text>
              </View>
            </Pressable>
          </View>
        </View>

        <View style={{ gap: 7, marginTop: 3 }}>
          <Text style={{ color: c.muted, fontSize: 12, fontWeight: '900', letterSpacing: 2 }}>GOOD EVENING,</Text>
          <Text style={{ color: c.text, fontSize: 38, lineHeight: 43, fontWeight: '900' }}>{firstName}<Text style={{ color: c.accentBright }}>.</Text></Text>
          <Text style={{ color: c.muted, fontSize: 16, lineHeight: 23, fontWeight: '700' }}>Train. Compete. Develop. <Text style={{ color: c.textSecondary }}>All in one place.</Text></Text>
        </View>

        <Card>
          <View style={{ flexDirection: 'row', minHeight: 92 }}>
            <View style={{ flex: 1, flexDirection: 'row', alignItems: 'center', gap: 12 }}>
              <IconTile icon="♙" tone="blue" />
              <View>
                <Text style={{ color: c.muted, fontSize: 12 }}>Your Athletes</Text>
                <Text style={{ color: c.text, fontSize: 27, fontWeight: '900', marginTop: 2 }}>{athletes.length}</Text>
                <Text style={{ color: c.muted, fontSize: 11 }}>Active athletes</Text>
              </View>
            </View>
            <View style={{ width: 1, backgroundColor: c.borderStrong, marginVertical: 5 }} />
            <View style={{ flex: 1, flexDirection: 'row', alignItems: 'center', gap: 12, paddingLeft: 17 }}>
              <IconTile icon="▣" tone="blue" />
              <View>
                <Text style={{ color: c.muted, fontSize: 12 }}>Upcoming Events</Text>
                <Text style={{ color: c.text, fontSize: 27, fontWeight: '900', marginTop: 2 }}>{events}</Text>
                <Text style={{ color: c.muted, fontSize: 11 }}>Next 30 days</Text>
              </View>
            </View>
          </View>
        </Card>

        <View style={{ flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', rowGap: 12 }}>
          <ActionCard icon="▥" tone="blue" title="Athletes" subtitle="Manage your team" onPress={() => router.push('/coach-athletes')} />
          <ActionCard icon="⌁" tone="green" title="Training" subtitle="Plans & progress" onPress={() => router.push('/coach-training')} />
          <ActionCard icon="♜" tone="red" title="Competitions" subtitle="Tournaments & results" onPress={() => router.push('/coach-tournaments')} />
          <ActionCard icon="•••" tone="purple" title="Messages" subtitle="Chat with your team" onPress={() => router.push('/messages')} />
        </View>

        <View style={{ gap: 11 }}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
            <Text style={{ color: c.text, fontSize: 20, fontWeight: '900' }}>Recent Activity</Text>
            <Pressable onPress={() => router.push('/coach-more')}><Text style={{ color: c.accentBright, fontSize: 14, fontWeight: '900' }}>View all  ›</Text></Pressable>
          </View>
          <Card>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 14, minHeight: 82 }}>
              <IconTile icon="▤" tone="slate" />
              <View style={{ flex: 1 }}>
                <Text style={{ color: c.text, fontSize: 15, fontWeight: '900' }}>{approvals ? `${approvals} approval request${approvals === 1 ? '' : 's'} waiting` : 'No recent activity'}</Text>
                <Text style={{ color: c.muted, fontSize: 11, lineHeight: 17, marginTop: 3 }}>{approvals ? 'Review athlete requests from your Coach workspace.' : 'Your latest coaching updates will appear here.'}</Text>
              </View>
            </View>
          </Card>
        </View>

        <View style={{ gap: 11 }}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
            <Text style={{ color: c.text, fontSize: 20, fontWeight: '900' }}>Tips for Coaches</Text>
            <Pressable onPress={() => router.push('/coach-more')}><Text style={{ color: c.accentBright, fontSize: 14, fontWeight: '900' }}>View all  ›</Text></Pressable>
          </View>
          <Card>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 14, minHeight: 84 }}>
              <IconTile icon="◇" tone="blue" />
              <View style={{ flex: 1 }}>
                <Text style={{ color: c.text, fontSize: 16, fontWeight: '900' }}>Build better athletes</Text>
                <Text style={{ color: c.muted, fontSize: 12, lineHeight: 18, marginTop: 3 }}>Plan consistent training, track progress and keep your athletes motivated.</Text>
              </View>
            </View>
          </Card>
        </View>

        <Pressable onPress={() => router.push('/scanner')} style={{ marginBottom: 8 }}>
          <Card accent>
            <Text style={{ color: c.accentBright, fontSize: 10, fontWeight: '900', letterSpacing: 1 }}>COACH TOOL</Text>
            <Text style={{ color: c.text, fontSize: 15, fontWeight: '900', marginTop: 4 }}>Tournament Scanner</Text>
            <Text style={{ color: c.muted, fontSize: 11, marginTop: 2 }}>Track tournament sources and bring useful event intelligence into your workspace.</Text>
          </Card>
        </Pressable>
      </View>
    </Screen>
  );
}
