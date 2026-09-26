import { useCallback,useEffect,useState } from 'react';
import { Pressable,Text,TextInput,View } from 'react-native';
import { Screen,Header,Section,Card,Empty,c } from '@/components/mobile-ui';
import { useAuth } from '@/context/AuthContext';
import { supabase } from '@/lib/supabase';

export default function AdminSupportScreen(){
 const {profile}=useAuth();
 const [tickets,setTickets]=useState<any[]>([]);
 const [selected,setSelected]=useState<any>(null);
 const [messages,setMessages]=useState<any[]>([]);
 const [reply,setReply]=useState('');
 const [resolution,setResolution]=useState('');
 const [admins,setAdmins]=useState<any[]>([]);
 const [busy,setBusy]=useState(false);
 const [error,setError]=useState('');

 const load=useCallback(async()=>{
  if(!profile)return;
  const [t,a]=await Promise.all([
   supabase.from('support_tickets').select('id,user_id,subject,body,status,priority,visibility,assigned_to,resolution,created_at,updated_at,closed_at').order('created_at',{ascending:false}).limit(100),
   supabase.from('profiles').select('user_id,full_name,username,role').in('role',['admin','super_admin','support_admin']).order('full_name')
  ]);
  if(t.error)setError(t.error.message);else setTickets(t.data||[]);
  if(!a.error)setAdmins(a.data||[]);
 },[profile]);
 useEffect(()=>{void load()},[load]);

 async function open(t:any){
  setSelected(t);setResolution(t.resolution||'');setError('');
  const {data,error:e}=await supabase.from('support_ticket_messages').select('id,sender_id,body,internal,created_at').eq('ticket_id',t.id).order('created_at',{ascending:true});
  if(e)setError(e.message);else setMessages(data||[]);
 }
 async function save(patch:any){
  if(!selected)return;
  setBusy(true);
  const {data,error:e}=await supabase.from('support_tickets').update({...patch,updated_at:new Date().toISOString()}).eq('id',selected.id).select().single();
  setBusy(false);
  if(e){setError(e.message);return;}
  setSelected(data);setTickets(all=>all.map(t=>t.id===data.id?data:t));
 }
 async function send(){
  if(!selected||!reply.trim()||!profile?.user_id)return;
  setBusy(true);
  const {error:e}=await supabase.from('support_ticket_messages').insert({ticket_id:selected.id,sender_id:profile.user_id,body:reply.trim(),internal:false});
  if(!e) await supabase.from('support_tickets').update({status:'in_progress',last_admin_response_at:new Date().toISOString(),updated_at:new Date().toISOString()}).eq('id',selected.id);
  setBusy(false);
  if(e){setError(e.message);return;}
  setReply('');await open({...selected,status:'in_progress'});
 }
 async function resolve(close:boolean){
  if(!selected)return;
  await save({status:close?'closed':'resolved',resolution:resolution.trim()||null,closed_at:close?new Date().toISOString():null});
 }
 return <Screen><Header back eyebrow="ADMIN • SUPPORT" title="Support Workspace" subtitle="Work tickets, reply, assign, resolve and close."/>
 <Section title="TICKETS">{tickets.length?tickets.map(t=><Pressable key={t.id} onPress={()=>void open(t)}><Card><View style={{flexDirection:'row',justifyContent:'space-between',gap:8}}><Text style={{color:c.text,fontSize:13,fontWeight:'900',flex:1}}>{t.subject}</Text><Text style={{color:t.status==='closed'?c.muted:c.accentBright,fontSize:8,fontWeight:'900'}}>{String(t.status).toUpperCase()}</Text></View><Text style={{color:c.muted,fontSize:9,marginTop:4}}>{t.visibility.toUpperCase()} · {t.priority.toUpperCase()} · {new Date(t.created_at).toLocaleString()}</Text><Text style={{color:c.muted,fontSize:10,marginTop:4}} numberOfLines={2}>{t.body}</Text></Card></Pressable>):<Empty text="No support tickets."/>}</Section>
 {selected?<Section title={selected.subject}><Card>
  <Text style={{color:c.muted,fontSize:9}}>TICKET ID · {selected.id}</Text>
  <Text style={{color:c.text,fontSize:12,lineHeight:18,marginTop:8}}>{selected.body}</Text>
  <Text style={label}>STATUS</Text><View style={row}>{['open','in_progress','waiting_user','resolved','closed'].map(v=><Pressable key={v} onPress={()=>void save({status:v,closed_at:v==='closed'?new Date().toISOString():null})} style={[chip,selected.status===v&&active]}><Text style={[chipText,selected.status===v&&activeText]}>{v.replace('_',' ').toUpperCase()}</Text></Pressable>)}</View>
  <Text style={label}>PRIORITY</Text><View style={row}>{['low','normal','high','urgent'].map(v=><Pressable key={v} onPress={()=>void save({priority:v})} style={[chip,selected.priority===v&&active]}><Text style={[chipText,selected.priority===v&&activeText]}>{v.toUpperCase()}</Text></Pressable>)}</View>
  <Text style={label}>ASSIGN TO</Text><View style={row}>{admins.map(a=><Pressable key={a.user_id} onPress={()=>void save({assigned_to:a.user_id})} style={[chip,selected.assigned_to===a.user_id&&active]}><Text style={[chipText,selected.assigned_to===a.user_id&&activeText]}>{a.full_name||a.username||a.role}</Text></Pressable>)}</View>
  <Text style={label}>RESOLUTION</Text><TextInput value={resolution} onChangeText={setResolution} placeholder="Resolution / admin notes" placeholderTextColor={c.muted} style={input} multiline/>
  {messages.map(m=><View key={m.id} style={{paddingVertical:9,borderBottomWidth:1,borderBottomColor:c.border}}><Text style={meta}>{m.sender_id===profile?.user_id?'YOU':'USER'} · {new Date(m.created_at).toLocaleString()}</Text><Text style={{color:c.text,fontSize:11,lineHeight:17}}>{m.body}</Text></View>)}
  <TextInput value={reply} onChangeText={setReply} placeholder="Reply to user..." placeholderTextColor={c.muted} style={input}/>
  <Pressable disabled={busy} onPress={()=>void send()} style={primary}><Text style={{color:'#fff',fontWeight:'900'}}>{busy?'SENDING…':'SEND REPLY'}</Text></Pressable>
  <View style={row}><Pressable onPress={()=>void resolve(false)} style={secondary}><Text style={{color:c.text,fontWeight:'900'}}>MARK RESOLVED</Text></Pressable><Pressable onPress={()=>void resolve(true)} style={danger}><Text style={{color:'#ff8b9b',fontWeight:'900'}}>CLOSE TICKET</Text></Pressable></View>
 </Card></Section>:null}
 {error?<Text style={{color:c.danger,fontSize:10}}>{error}</Text>:null}
 </Screen>
}
const input={backgroundColor:c.background,borderWidth:1,borderColor:c.border,borderRadius:12,color:c.text,padding:12,fontSize:12,marginTop:7} as any;
const label={color:c.muted,fontSize:8,fontWeight:'900',letterSpacing:1.2,marginTop:12,marginBottom:6} as any;
const row={flexDirection:'row',gap:7,flexWrap:'wrap',marginTop:4} as any;
const chip={borderWidth:1,borderColor:c.border,borderRadius:10,paddingHorizontal:10,paddingVertical:8} as any;
const active={backgroundColor:c.accentSoft,borderColor:c.accent} as any;
const chipText={color:c.muted,fontSize:8,fontWeight:'900'} as any;
const activeText={color:c.accentBright} as any;
const primary={backgroundColor:c.accent,borderRadius:12,padding:13,alignItems:'center',marginTop:9} as any;
const secondary={backgroundColor:c.surface,borderWidth:1,borderColor:c.borderStrong,borderRadius:12,padding:12,alignItems:'center'} as any;
const danger={backgroundColor:'#2A1116',borderWidth:1,borderColor:'#67313C',borderRadius:12,padding:12,alignItems:'center'} as any;
const meta={color:c.muted,fontSize:8,lineHeight:14} as any;
