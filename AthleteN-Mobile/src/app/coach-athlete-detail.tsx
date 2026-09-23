import { useCallback, useEffect, useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Screen, Header, Section, Card, c } from '@/components/mobile-ui';
import { useAuth } from '@/context/AuthContext';
import { supabase } from '@/lib/supabase';

export default function CoachAthleteDetail() {
  const { athleteId } = useLocalSearchParams<{ athleteId?: string }>();
  const { profile } = useAuth();
  const router = useRouter();
  const [athlete, setAthlete] = useState<any>(null);
  const [sessions, setSessions] = useState<any[]>([]);
  const [matches, setMatches] = useState<any[]>([]);
  const [medals, setMedals] = useState<any[]>([]);

  const load = useCallback(async () => {
    if (!profile?.user_id || !athleteId) return;
    const link = await supabase.from('coach_athlete_links').select('athlete_user_id').eq('coach_user_id', profile.user_id).eq('athlete_user_id', athleteId).eq('status', 'active').maybeSingle();
    if (!link.data) return;
    const [p, s, m, md] = await Promise.all([
      supabase.from('profiles').select('full_name,username,discipline,belt,weight_kg,competition_weight_category,account_code').eq('user_id', athleteId).maybeSingle(),
      supabase.from('training_sessions').select('title,session_date,minutes,notes').eq('user_id', athleteId).order('session_date', { ascending: false }).limit(8),
      supabase.from('matches').select('opponent_name,round_name,result,score,created_at').eq('user_id', athleteId).order('created_at', { ascending: false }).limit(8),
      supabase.from('medals').select('event_name,medal_type,category,awarded_at').eq('user_id', athleteId).order('awarded_at', { ascending: false }).limit(8)
    ]);
    setAthlete(p.data);
    setSessions(s.data || []);
    setMatches(m.data || []);
    setMedals(md.data || []);
  }, [profile?.user_id, athleteId]);

  useEffect(() => { void load(); }, [load]);

  return <Screen>
    <Header back eyebrow="ATHLETE" title={athlete?.full_name || 'Athlete'} subtitle="Coach view of connected athlete performance and competition data." />
    <Section title="PROFILE">
      <Card>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
          <Card><Text style={{ color: c.accentBright, fontSize: 18, fontWeight: '900' }}>{athlete?.discipline || 'Taekwondo'}</Text><Text style={{ color: c.muted, fontSize: 9 }}>Discipline</Text></Card>
          <Card><Text style={{ color: c.text, fontSize: 18, fontWeight: '900' }}>{athlete?.belt || '—'}</Text><Text style={{ color: c.muted, fontSize: 9 }}>Belt</Text></Card>
          <Card><Text style={{ color: c.text, fontSize: 18, fontWeight: '900' }}>{athlete?.weight_kg ? String(athlete.weight_kg) + ' kg' : '—'}</Text><Text style={{ color: c.muted, fontSize: 9 }}>Weight</Text></Card>
          <Card><Text style={{ color: c.text, fontSize: 12, fontWeight: '900' }}>{athlete?.competition_weight_category || '—'}</Text><Text style={{ color: c.muted, fontSize: 9 }}>Category</Text></Card>
        </View>
      </Card>
    </Section>
    <Section title="COACHING ACTIONS"><Card><View style={{flexDirection:'row',gap:8}}><Pressable onPress={async()=>{if(!athleteId)return;const r=await supabase.rpc('create_direct_conversation_by_user',{p_recipient_id:athleteId});if(!r.error&&r.data)router.push({pathname:'/conversation',params:{id:String(r.data)}});}} style={{flex:1,backgroundColor:c.accent,borderRadius:12,padding:12,alignItems:'center'}}><Text style={{color:'#fff',fontWeight:'900'}}>MESSAGE ATHLETE</Text></Pressable><Pressable onPress={()=>router.push('/coach-training')} style={{flex:1,borderWidth:1,borderColor:c.accent,borderRadius:12,padding:12,alignItems:'center'}}><Text style={{color:c.accentBright,fontWeight:'900'}}>ADD TO TRAINING</Text></Pressable></View></Card></Section>
    <Section title="RECENT TRAINING">
      {sessions.length ? sessions.map((s, i) => <Card key={String(s.session_date) + i}><View style={{ flexDirection: 'row', justifyContent: 'space-between' }}><View style={{ flex: 1 }}><Text style={{ color: c.text, fontWeight: '900' }}>{s.title || 'Training session'}</Text><Text style={{ color: c.muted, fontSize: 9, marginTop: 3 }}>{s.session_date || 'Date not set'}</Text></View><Text style={{ color: c.accentBright, fontWeight: '900' }}>{Number(s.minutes || 0)}m</Text></View>{s.notes ? <Text style={{ color: c.muted, fontSize: 9, marginTop: 5 }}>{s.notes}</Text> : null}</Card>) : <Card><Text style={{ color: c.muted }}>No training records yet.</Text></Card>}
    </Section>
    <Section title="MATCH HISTORY">
      {matches.length ? matches.map((m, i) => <Card key={String(m.created_at) + i}><View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: 10 }}><View style={{ flex: 1 }}><Text style={{ color: c.text, fontWeight: '900' }}>vs {m.opponent_name || 'Opponent'}</Text><Text style={{ color: c.muted, fontSize: 9, marginTop: 3 }}>{m.round_name || 'Round'}</Text></View><Text style={{ color: /win/i.test(String(m.result || '')) ? c.success : c.text, fontWeight: '900' }}>{m.result || '—'}</Text></View>{m.score ? <Text style={{ color: c.muted, fontSize: 9, marginTop: 5 }}>Score: {m.score}</Text> : null}</Card>) : <Card><Text style={{ color: c.muted }}>No match records yet.</Text></Card>}
    </Section>
    <Section title="MEDALS">
      {medals.length ? medals.map((m, i) => <Card key={String(m.awarded_at) + i}><Text style={{ color: c.accentBright, fontWeight: '900' }}>{String(m.medal_type || 'Medal').toUpperCase()}</Text><Text style={{ color: c.text, fontWeight: '900', marginTop: 3 }}>{m.event_name || 'Competition'}</Text><Text style={{ color: c.muted, fontSize: 9, marginTop: 2 }}>{m.category || 'Category not set'} · {m.awarded_at || 'Date not set'}</Text></Card>) : <Card><Text style={{ color: c.muted }}>No medals recorded yet.</Text></Card>}
    </Section>
  </Screen>;
}
