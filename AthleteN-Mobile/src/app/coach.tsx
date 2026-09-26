import { useCallback, useEffect, useMemo, useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { Image } from 'expo-image';
import { useRouter } from 'expo-router';
import { Screen, Card, c, Icon } from '@/components/mobile-ui';
import { useAuth } from '@/context/AuthContext';
import { supabase } from '@/lib/supabase';
import CoachNav from '@/components/coach-nav';
import PlanSection from '@/components/plan-section';

type Athlete = { athlete_user_id: string; full_name?: string | null; discipline?: string | null; belt?: string | null; weight_kg?: number | null };
type DayPoint = { label: string; sessions: number; attended: number };

function BellIcon() { return <Icon name="bell.fill" size={22} color={c.text}/>; }

function IconTile({ icon, tone }: { icon: string; tone: 'blue' | 'green' | 'red' | 'purple' | 'slate' }) {
  const bg = tone === 'green' ? '#073d24' : tone === 'red' ? '#451522' : tone === 'purple' ? '#2c174f' : tone === 'slate' ? '#152033' : '#0b274c';
  const color = tone === 'green' ? '#39e878' : tone === 'red' ? '#ff7082' : tone === 'purple' ? '#c16cff' : '#69a9ff';
  return <View style={{ width: 54, height: 54, borderRadius: 17, backgroundColor: bg, alignItems: 'center', justifyContent: 'center' }}><Icon name={icon} size={23} color={color}/></View>;
}

function ActionCard({ icon, tone, title, subtitle, onPress }: { icon: string; tone: 'blue' | 'green' | 'red' | 'purple'; title: string; subtitle: string; onPress: () => void }) {
  return <Pressable onPress={onPress} style={({ pressed }) => [{ width: '48.5%' }, pressed && { opacity: 0.72 }]}><Card><View style={{ minHeight: 108, justifyContent: 'space-between', gap: 10 }}><IconTile icon={icon} tone={tone}/><View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: 8 }}><View style={{ flex: 1 }}><Text style={{ color: c.text, fontSize: 16, fontWeight: '900' }}>{title}</Text><Text style={{ color: c.muted, fontSize: 10, lineHeight: 15, marginTop: 3 }}>{subtitle}</Text></View><Icon name="arrow" size={16} color={c.muted}/></View></View></Card></Pressable>;
}

function TrainingChart({ points }: { points: DayPoint[] }) {
  const [chartWidth, setChartWidth] = useState(0);
  const max = Math.max(1, ...points.flatMap(p => [p.sessions, p.attended]));
  return <View style={{ gap: 8 }}>
    <View onLayout={e => setChartWidth(e.nativeEvent.layout.width)} style={{ height: 150, position: 'relative', paddingTop: 8 }}>
      {[34,76,118].map(y => <View key={y} style={{ position:'absolute', left:0, right:0, top:y, height:1, backgroundColor:c.border }} />)}
      <View style={{ position:'absolute', left:0, right:0, bottom:8, height:1, backgroundColor:c.borderStrong }} />
      {points.map((p, i) => {
        const x = points.length === 1 ? 0.5 : i / (points.length - 1);
        const y1 = 142 - (p.sessions / max) * 124;
        const y2 = 142 - (p.attended / max) * 124;
        const prev = points[i - 1];
        const segment = (fromX:number, fromY:number, toX:number, toY:number, color:string, key:string) => {
          const dx = chartWidth * (toX-fromX); const dy = toY-fromY; const length = Math.sqrt(dx*dx+dy*dy); const angle = Math.atan2(dy,dx)*180/Math.PI;
          return <View key={key} style={{ position:'absolute', left: chartWidth * fromX, top: Math.min(fromY,toY), width:length, height:3, borderRadius:2, backgroundColor:color, transform:[{rotate:angle+'deg'}], transformOrigin:'left center' as any }} />;
        };
        const px = points.length === 1 ? 0.5 : (i-1) / (points.length-1);
        const py1 = prev ? 142-(prev.sessions/max)*124 : y1; const py2 = prev ? 142-(prev.attended/max)*124 : y2;
        return <View key={p.label+i} style={{ position:'absolute', left: chartWidth ? chartWidth*x-16 : 0, top:0, bottom:0, width:32, alignItems:'center' }}>
          {prev ? segment(px,py1,x,y1,c.accentBright,'s'+i) : null}
          {prev ? segment(px,py2,x,y2,c.success,'a'+i) : null}
          <View style={{ position:'absolute', left:'50%', marginLeft:-4, top:y1-4, width:8,height:8,borderRadius:4,backgroundColor:c.accentBright }} />
          <View style={{ position:'absolute', left:'50%', marginLeft:-4, top:y2-4, width:8,height:8,borderRadius:4,backgroundColor:c.success }} />
          <Text style={{ position:'absolute', bottom:0, color:c.muted, fontSize:8 }}>{p.label}</Text>
        </View>;
      })}
    </View>
    <View style={{ flexDirection:'row', gap:14 }}><View style={{flexDirection:'row',alignItems:'center',gap:5}}><View style={{width:8,height:8,borderRadius:4,backgroundColor:c.accentBright}}/><Text style={{color:c.muted,fontSize:9}}>Sessions</Text></View><View style={{flexDirection:'row',alignItems:'center',gap:5}}><View style={{width:8,height:8,borderRadius:4,backgroundColor:c.success}}/><Text style={{color:c.muted,fontSize:9}}>Athletes attended</Text></View></View>
    <Text style={{ color:c.muted,fontSize:9 }}>Last 7 days · scheduled group sessions and attendance.</Text>
  </View>;
}

export default function Coach() {
  const { profile } = useAuth();
  const router = useRouter();
  const [athletes, setAthletes] = useState<Athlete[]>([]);
  const [events, setEvents] = useState(0);
  const [approvals, setApprovals] = useState(0);
  const [wins, setWins] = useState(0);
  const [losses, setLosses] = useState(0);
  const [draws, setDraws] = useState(0);
  const [avatar, setAvatar] = useState<string | null>(null);
  const [trainingPoints, setTrainingPoints] = useState<DayPoint[]>([]);

  const load = useCallback(async () => {
    if (!profile?.user_id) return;
    const links = await supabase.from('coach_athlete_links').select('athlete_user_id').eq('coach_user_id', profile.user_id).eq('status', 'active');
    const ids = (links.data || []).map((x: any) => x.athlete_user_id);

    if (ids.length) {
      const p = await supabase.from('profiles').select('user_id,full_name,discipline,belt,weight_kg').in('user_id', ids);
      const byId = new Map((p.data || []).map((x: any) => [x.user_id, x]));
      setAthletes(ids.map((id: string) => ({ athlete_user_id: id, ...(byId.get(id) || {}) })));

      const matches = await supabase.from('matches').select('result').in('user_id', ids).limit(500);
      const results = matches.data || [];
      setWins(results.filter((m: any) => /win/i.test(String(m.result || ''))).length);
      setLosses(results.filter((m: any) => /loss/i.test(String(m.result || ''))).length);
      setDraws(results.filter((m: any) => /draw|tie/i.test(String(m.result || ''))).length);

      const since = new Date();
      since.setDate(since.getDate() - 6);
      const groupRows = await supabase.from('training_groups').select('id').eq('coach_user_id', profile.user_id).eq('active', true);
      const groupIds = (groupRows.data || []).map((g:any)=>g.id);
      const sessionRows = groupIds.length ? await supabase.from('training_group_sessions').select('id,session_date').in('group_id',groupIds).gte('session_date',since.toISOString().slice(0,10)).neq('status','cancelled').order('session_date',{ascending:true}) : {data:[],error:null} as any;
      const sessionIds = (sessionRows.data || []).map((s:any)=>s.id);
      const attendanceRows = sessionIds.length ? await supabase.from('training_group_attendance').select('session_id,athlete_user_id,status').in('session_id',sessionIds).in('status',['present','late']) : {data:[],error:null} as any;
      const attendedBySession = new Map<string,number>();
      for (const a of attendanceRows.data || []) attendedBySession.set(a.session_id,(attendedBySession.get(a.session_id)||0)+1);
      const points: DayPoint[] = [];
      for (let i = 6; i >= 0; i -= 1) {
        const d = new Date(); d.setDate(d.getDate()-i);
        const key=d.toISOString().slice(0,10);
        const todays=(sessionRows.data||[]).filter((s:any)=>String(s.session_date).slice(0,10)===key);
        points.push({label:d.toLocaleDateString(undefined,{weekday:'short'}).slice(0,2),sessions:todays.length,attended:todays.reduce((n:number,s:any)=>n+(attendedBySession.get(s.id)||0),0)});
      }
      setTrainingPoints(points);
    } else {
      setAthletes([]);
      setWins(0); setLosses(0); setDraws(0);
      setTrainingPoints(['M','T','W','T','F','S','S'].map(label => ({ label, sessions: 0, attended: 0 })));
    }

    const approval = await supabase.from('coach_approval_requests').select('id', { count: 'exact', head: true }).eq('coach_user_id', profile.user_id).eq('status', 'pending');
    setApprovals(approval.count || 0);
    const tournaments = await supabase.from('tournaments').select('id', { count: 'exact', head: true }).eq('coach_user_id', profile.user_id).gte('starts_at', new Date().toISOString());
    setEvents(tournaments.count || 0);

    if (profile.profile_image_path) {
      const signed = await supabase.storage.from('avatars').createSignedUrl(String(profile.profile_image_path), 3600);
      setAvatar(signed.data?.signedUrl || null);
    } else setAvatar(null);
  }, [profile?.user_id, profile?.profile_image_path]);

  useEffect(() => { void load(); }, [load]);

  const totalMatches = wins + losses + draws;
  const recordText = totalMatches ? String(wins) + 'W · ' + String(losses) + 'L' + (draws ? ' · ' + String(draws) + 'D' : '') : 'No match data yet';
  const firstName = (profile?.full_name || 'Coach').split(' ')[0];
  const initial = (profile?.full_name || 'C').slice(0, 1).toUpperCase();
  const totalTraining = useMemo(() => trainingPoints.reduce((sum, p) => sum + p.sessions, 0), [trainingPoints]);
  const totalAttended = useMemo(() => trainingPoints.reduce((sum, p) => sum + p.attended, 0), [trainingPoints]);

  return <Screen bottomBar={<CoachNav active="home" />}>
    <View style={{ gap: 18 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingTop: 2 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 9 }}>
          <Image source={require('@/assets/logo.png')} style={{ width: 42, height: 42, borderRadius: 13 }} contentFit="cover" />
          <View><Text style={{ color: c.text, fontSize: 15, fontWeight: '900', letterSpacing: 2.2 }}>ATHLETEN</Text><Text style={{ color: c.muted, fontSize: 7, fontWeight: '800', letterSpacing: 1 }}>COACH PERFORMANCE</Text></View>
        </View>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
          <Pressable onPress={() => router.push('/coach-notifications')} hitSlop={8} style={{ width: 34, height: 40, alignItems: 'center', justifyContent: 'center' }}><BellIcon /></Pressable>
          <Pressable onPress={() => router.push('/coach-profile')} style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            {avatar ? <Image source={{ uri: avatar }} style={{ width: 48, height: 48, borderRadius: 24 }} contentFit="cover" /> : <View style={{ width: 48, height: 48, borderRadius: 24, backgroundColor: '#17335e', alignItems: 'center', justifyContent: 'center' }}><Text style={{ color: '#6faaff', fontSize: 20, fontWeight: '900' }}>{initial}</Text></View>}
            <View><Text style={{ color: c.text, fontSize: 15, fontWeight: '900' }}>{firstName}</Text><Text style={{ color: c.muted, fontSize: 10, marginTop: 2 }}>View profile ›</Text></View>
          </Pressable>
        </View>
      </View>

      <View style={{ gap: 6 }}>
        <Text style={{ color: c.muted, fontSize: 11, fontWeight: '900', letterSpacing: 2 }}>GOOD EVENING,</Text>
        <Text style={{ color: c.text, fontSize: 38, lineHeight: 43, fontWeight: '900' }}>{firstName}<Text style={{ color: c.accentBright }}>.</Text></Text>
        <Text style={{ color: c.muted, fontSize: 15, lineHeight: 22, fontWeight: '700' }}>Train. Compete. Develop. <Text style={{ color: c.textSecondary }}>All in one place.</Text></Text>
      <PlanSection />
      </View>

      <Pressable onPress={() => router.push('/coach-athletes')}>
        <Card><View style={{ flexDirection: 'row', minHeight: 92 }}>
          <View style={{ flex: 1, flexDirection: 'row', alignItems: 'center', gap: 10 }}><IconTile icon="athlete" tone="blue" /><View><Text style={{ color: c.muted, fontSize: 11 }}>Your Athletes</Text><Text style={{ color: c.text, fontSize: 26, fontWeight: '900', marginTop: 2 }}>{athletes.length}</Text><Text style={{ color: c.muted, fontSize: 10 }}>Active athletes</Text></View></View>
          <View style={{ width: 1, backgroundColor: c.borderStrong, marginVertical: 5 }} />
          <View style={{ flex: 1, flexDirection: 'row', alignItems: 'center', gap: 10, paddingLeft: 14 }}><IconTile icon="calendar" tone="blue" /><View><Text style={{ color: c.muted, fontSize: 11 }}>Upcoming Events</Text><Text style={{ color: c.text, fontSize: 26, fontWeight: '900', marginTop: 2 }}>{events}</Text><Text style={{ color: c.muted, fontSize: 10 }}>Scheduled</Text></View></View>
        </View></Card>
      </Pressable>

      <View style={{ flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', rowGap: 10 }}>
        <ActionCard icon="people" tone="blue" title="Athletes" subtitle="Manage your team" onPress={() => router.push('/coach-athletes')} />
        <ActionCard icon="training" tone="green" title="Training" subtitle="Plans & progress" onPress={() => router.push('/coach-training')} />
        <ActionCard icon="calendar" tone="blue" title="Attendance" subtitle="Mark & review attendance" onPress={() => router.push('/coach-training')} />
        <ActionCard icon="event" tone="red" title="Competitions" subtitle="Tournaments & results" onPress={() => router.push('/coach-competition')} />
        <ActionCard icon="message" tone="purple" title="Messages" subtitle="Chat with your team" onPress={() => router.push('/messages')} />
      </View>

      <View style={{ gap: 10 }}>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}><Text style={{ color: c.text, fontSize: 20, fontWeight: '900' }}>Performance</Text><Pressable onPress={() => router.push('/coach-competition')}><Text style={{ color: c.accentBright, fontSize: 13, fontWeight: '900' }}>Competition ›</Text></Pressable></View>
        <Card><View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}><View><Text style={{ color: c.text, fontSize: 15, fontWeight: '900' }}>Training attendance</Text><Text style={{ color: c.muted, fontSize: 10, marginTop: 2 }}>Last 7 days · {totalAttended} athlete attendances</Text></View><Text style={{ color: c.accentBright, fontSize: 18, fontWeight: '900' }}>{totalTraining} sessions</Text></View><TrainingChart points={trainingPoints} /></Card>
        <View style={{ flexDirection: 'row', gap: 8 }}><Card><Text style={{ color: c.accentBright, fontSize: 20, fontWeight: '900' }}>{wins}</Text><Text style={{ color: c.muted, fontSize: 9 }}>Wins</Text></Card><Card><Text style={{ color: c.text, fontSize: 20, fontWeight: '900' }}>{losses}</Text><Text style={{ color: c.muted, fontSize: 9 }}>Losses</Text></Card><Card><Text style={{ color: c.text, fontSize: 13, fontWeight: '900' }}>{recordText}</Text><Text style={{ color: c.muted, fontSize: 9 }}>Record</Text></Card></View>
      </View>

      <View style={{ gap: 10 }}>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}><Text style={{ color: c.text, fontSize: 20, fontWeight: '900' }}>Recent Activity</Text><Pressable onPress={() => router.push('/coach-notifications')}><Text style={{ color: c.accentBright, fontSize: 13, fontWeight: '900' }}>View all ›</Text></Pressable></View>
        <Pressable onPress={() => router.push('/coach-notifications')}><Card><View style={{ flexDirection: 'row', alignItems: 'center', gap: 13, minHeight: 72 }}><IconTile icon="warning" tone={approvals ? 'red' : 'slate'} /><View style={{ flex: 1 }}><Text style={{ color: c.text, fontSize: 14, fontWeight: '900' }}>{approvals ? String(approvals) + ' athlete request' + (approvals === 1 ? '' : 's') + ' waiting' : 'Everything is up to date'}</Text><Text style={{ color: c.muted, fontSize: 10, lineHeight: 16, marginTop: 3 }}>{approvals ? 'Open notifications to review pending connections.' : 'New coaching activity and alerts will appear here.'}</Text></View><Text style={{ color: c.muted, fontSize: 24 }}>›</Text></View></Card></Pressable>
      </View>

      <View style={{ gap: 10 }}>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}><Text style={{ color: c.text, fontSize: 20, fontWeight: '900' }}>Quick tools</Text><Pressable onPress={() => router.push('/coach-more')}><Text style={{ color: c.accentBright, fontSize: 13, fontWeight: '900' }}>More ›</Text></Pressable></View>
        <Pressable onPress={() => router.push('/scanner')}><Card accent><View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}><IconTile icon="ai" tone="blue" /><View style={{ flex: 1 }}><Text style={{ color: c.accentBright, fontSize: 9, fontWeight: '900', letterSpacing: 1 }}>COACH TOOL</Text><Text style={{ color: c.text, fontSize: 15, fontWeight: '900', marginTop: 3 }}>Tournament Scanner</Text><Text style={{ color: c.muted, fontSize: 10, lineHeight: 15, marginTop: 2 }}>Scan an official event source and track changes.</Text></View><Text style={{ color: c.accentBright, fontSize: 24 }}>›</Text></View></Card></Pressable>
      </View>
    </View>
  
  
</Screen>;
}
