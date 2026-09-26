import { useCallback, useEffect, useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { Screen, Header, Section, Card, c } from '@/components/mobile-ui';
import CoachNav from '@/components/coach-nav';
import CoachSupportFooter from '@/components/coach-support-footer';
import { useAuth } from '@/context/AuthContext';
import { supabase } from '@/lib/supabase';

type Notice = { id: string; title: string; text: string; route: string; tone: 'blue' | 'red' | 'green'; requestId?: string };

export default function CoachNotifications() {
  const { profile } = useAuth();
  const router = useRouter();
  const [notices, setNotices] = useState<Notice[]>([]); const [unread,setUnread]=useState(0);

  const load = useCallback(async () => {
    if (!profile?.user_id) return;
    const next: Notice[] = []; const app = await supabase.from('notifications').select('id,title,body,notification_type,read_at,created_at').eq('user_id',profile.user_id).order('created_at',{ascending:false}).limit(30); setUnread((app.data||[]).filter((n:any)=>!n.read_at).length); for(const n of app.data||[]){ next.push({id:'n-'+n.id,title:String(n.title||'Notification'),text:String(n.body||''),route:String(n.notification_type||'').includes('training')?'/coach-training':'/coach',tone:String(n.notification_type||'').includes('training')?'green':'blue'}); }
    const approvalRows = await supabase.from('coach_approval_requests').select('id,athlete_user_id,request_type,current_value,requested_value,created_at').eq('coach_user_id', profile.user_id).eq('status', 'pending').order('created_at',{ascending:false}).limit(20); const approval = {count:(approvalRows.data||[]).length}; const reqIds=[...(approvalRows.data||[]).map((r:any)=>r.athlete_user_id)]; const reqProfiles=reqIds.length?await supabase.from('profiles').select('user_id,full_name').in('user_id',reqIds):{data:[],error:null} as any; const reqNames=new Map((reqProfiles.data||[]).map((p:any)=>[p.user_id,p.full_name])); for(const r of approvalRows.data||[]){ next.push({id:'request-'+r.id,title:`${reqNames.get(r.athlete_user_id)||'Athlete'} · ${String(r.request_type||'request').replace(/_/g,' ')}`,text:`${r.current_value||'—'} → ${r.requested_value||'—'}`,route:'/coach-athletes',tone:'red',requestId:r.id}); }
    if ((approval.count || 0) > 0) {
      next.push({ id: 'approvals', title: 'Athlete connection requests', text: String(approval.count) + ' request' + ((approval.count || 0) === 1 ? '' : 's') + ' need your review.', route: '/coach-athletes', tone: 'red' });
    }
    const events = await supabase.from('tournaments').select('id,name,starts_at,location').eq('coach_user_id', profile.user_id).gte('starts_at', new Date().toISOString()).order('starts_at', { ascending: true }).limit(5);
    for (const event of events.data || []) {
      next.push({ id: 'event-' + event.id, title: String(event.name || 'Upcoming tournament'), text: (event.starts_at ? new Date(event.starts_at).toLocaleDateString() : 'Date not set') + (event.location ? ' · ' + event.location : ''), route: '/coach-competition', tone: 'blue' });
    }
    setNotices(next);
  }, [profile?.user_id]);

  useEffect(() => { void load(); }, [load]);
  async function reviewRequest(requestId:string,status:'approved'|'rejected'){ const {error}=await supabase.rpc('review_coach_approval',{p_request_id:requestId,p_status:status}); if(error){return} await load(); }
  async function openNotice(n:Notice){ if(n.id.startsWith('n-')) await supabase.from('notifications').update({read_at:new Date().toISOString(),updated_at:new Date().toISOString()}).eq('id',n.id.slice(2)).eq('user_id',profile?.user_id); await load(); router.push(n.route as any); }

  return <Screen bottomBar={<CoachNav active="more" />}>
    <Header back eyebrow="COACH / ALERTS" title="Notifications" subtitle={`Requests, upcoming competitions and coaching alerts.${unread ? ` · ${unread} unread` : ''}`} />
    <Section title="ALERTS">
      {notices.length ? notices.map(n => (
        <Pressable key={n.id} onPress={n.requestId ? undefined : () => void openNotice(n)}>
          <Card>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
              <View style={{ width: 44, height: 44, borderRadius: 14, backgroundColor: n.tone === 'red' ? '#451522' : n.tone === 'green' ? '#073d24' : c.accentSoft, alignItems: 'center', justifyContent: 'center' }}>
                <Text style={{ color: n.tone === 'red' ? '#ff7082' : n.tone === 'green' ? '#39e878' : c.accentBright, fontSize: 18, fontWeight: '900' }}>{n.tone === 'red' ? '!' : '•'}</Text>
              </View>
              <View style={{ flex: 1 }}>
                <Text style={{ color: c.text, fontSize: 14, fontWeight: '900' }}>{n.title}</Text>
                <Text style={{ color: c.muted, fontSize: 10, lineHeight: 16, marginTop: 3 }}>{n.text}</Text>
              </View>
              {n.requestId ? <View style={{gap:6}}><Pressable onPress={()=>void reviewRequest(n.requestId!,'approved')} style={{backgroundColor:c.accent,borderRadius:9,padding:8}}><Text style={{color:'#fff',fontSize:8,fontWeight:'900'}}>APPROVE</Text></Pressable><Pressable onPress={()=>void reviewRequest(n.requestId!,'rejected')} style={{borderWidth:1,borderColor:c.borderStrong,borderRadius:9,padding:8}}><Text style={{color:c.danger,fontSize:8,fontWeight:'900'}}>REJECT</Text></Pressable></View> : <Text style={{ color: c.muted, fontSize: 24 }}>›</Text>}
            </View>
          </Card>
        </Pressable>
      )) : (
        <Card accent><Text style={{ color: c.text, fontSize: 15, fontWeight: '900' }}>No new notifications</Text><Text style={{ color: c.muted, fontSize: 10, lineHeight: 16, marginTop: 4 }}>AthleteN will show connection requests and upcoming competition alerts here.</Text></Card>
      )}
    </Section>
  <CoachSupportFooter />
  <CoachSupportFooter />
</Screen>;
}
