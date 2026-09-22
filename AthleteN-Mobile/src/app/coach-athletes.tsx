import { useCallback, useEffect, useMemo, useState } from 'react';
import { Pressable, Text, TextInput, View } from 'react-native';
import { useRouter } from 'expo-router';
import { Screen, Header, Section, Card, c } from '@/components/mobile-ui';
import CoachNav from '@/components/coach-nav';
import { useAuth } from '@/context/AuthContext';
import { supabase } from '@/lib/supabase';

type Athlete = {
  athlete_user_id: string;
  full_name?: string | null;
  belt?: string | null;
  discipline?: string | null;
  weight_kg?: number | null;
  competition_weight_category?: string | null;
};

export default function CoachAthletes() {
  const { profile } = useAuth();
  const router = useRouter();
  const [athletes, setAthletes] = useState<Athlete[]>([]);
  const [search, setSearch] = useState('');

  const load = useCallback(async () => {
    if (!profile?.user_id) return;
    const links = await supabase.from('coach_athlete_links').select('athlete_user_id').eq('coach_user_id', profile.user_id).eq('status', 'active');
    const ids = (links.data || []).map((x: any) => x.athlete_user_id);
    if (!ids.length) { setAthletes([]); return; }
    const p = await supabase.from('profiles').select('user_id,full_name,belt,discipline,weight_kg,competition_weight_category').in('user_id', ids);
    const byId = new Map((p.data || []).map((x: any) => [x.user_id, x]));
    setAthletes(ids.map((id: string) => ({ athlete_user_id: id, ...(byId.get(id) || {}) })));
  }, [profile?.user_id]);

  useEffect(() => { void load(); }, [load]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return athletes;
    return athletes.filter(a => [a.full_name, a.discipline, a.belt, a.competition_weight_category].some(v => String(v || '').toLowerCase().includes(q)));
  }, [athletes, search]);

  return (
    <Screen bottomBar={<CoachNav active="athletes" />}>
      <Header eyebrow="TEAM" title="My Athletes" subtitle="Your active roster, athlete details and competition categories." />
      <TextInput value={search} onChangeText={setSearch} placeholder="Search athletes..." placeholderTextColor={c.muted} style={{ backgroundColor: c.surface, borderWidth: 1, borderColor: c.border, borderRadius: 14, color: c.text, padding: 13, fontSize: 13 }} />
      <Section title="ROSTER">
        {filtered.length ? filtered.map(a => (
          <Pressable key={a.athlete_user_id} onPress={() => router.push('/coach-competition')} style={{ marginBottom: 8 }}>
            <Card>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
                <View style={{ width: 44, height: 44, borderRadius: 15, backgroundColor: c.accentSoft, alignItems: 'center', justifyContent: 'center' }}>
                  <Text style={{ color: c.accentBright, fontWeight: '900', fontSize: 17 }}>{(a.full_name || 'A').slice(0, 1).toUpperCase()}</Text>
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={{ color: c.text, fontSize: 15, fontWeight: '900' }}>{a.full_name || 'Athlete'}</Text>
                  <Text style={{ color: c.muted, fontSize: 10, marginTop: 3 }}>{a.discipline || 'Taekwondo'} · {a.belt || 'Belt not set'}</Text>
                  <Text style={{ color: c.muted, fontSize: 10 }}>{a.weight_kg ? String(a.weight_kg) + ' kg' : 'Weight not set'} · {a.competition_weight_category || 'Category not set'}</Text>
                </View>
                <Text style={{ color: c.muted, fontSize: 24 }}>›</Text>
              </View>
            </Card>
          </Pressable>
        )) : (
          <Card accent>
            <Text style={{ color: c.text, fontSize: 16, fontWeight: '900' }}>No athletes connected yet</Text>
            <Text style={{ color: c.muted, fontSize: 11, lineHeight: 17, marginTop: 3 }}>Set your coach connection code in Profile, then give it to athletes so they can join your roster.</Text>
            <Pressable onPress={() => router.push('/coach-profile')} style={{ marginTop: 8, backgroundColor: c.accent, borderRadius: 12, padding: 12, alignItems: 'center' }}>
              <Text style={{ color: '#fff', fontWeight: '900', fontSize: 10 }}>OPEN COACH PROFILE</Text>
            </Pressable>
          </Card>
        )}
      </Section>
      <Section title="QUICK TOOLS">
        <Pressable onPress={() => router.push('/coach-training')}><Card><Text style={{ color: c.text, fontWeight: '900' }}>Training plans</Text><Text style={{ color: c.muted, fontSize: 10 }}>Create and manage athlete training blocks.</Text></Card></Pressable>
        <Pressable onPress={() => router.push('/coach-competition')}><Card><Text style={{ color: c.text, fontWeight: '900' }}>Competition center</Text><Text style={{ color: c.muted, fontSize: 10 }}>Review wins, losses, medals and upcoming events.</Text></Card></Pressable>
      </Section>
    </Screen>
  );
}
