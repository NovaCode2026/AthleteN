import { useCallback,useEffect,useState } from 'react';
import { Alert, Pressable, Text, TextInput, View } from 'react-native';
import { Screen,Header,Section,Card,Empty,c } from '@/components/mobile-ui';
import { useAuth } from '@/context/AuthContext';
import { supabase } from '@/lib/supabase';

export default function SupportScreen(){
 const {session}=useAuth();
 const [tickets,setTickets]=useState<any[]>([]);
 const [publicTickets,setPublicTickets]=useState<any[]>([]);
 const [subject,setSubject]=useState('');
 const [body,setBody]=useState('');
 const [visibility,setVisibility]=useState<'private'|'public'>('private');
 const [priority,setPriority]=useState<'low'|'normal'|'high'|'urgent'>('normal');
 const [selected,setSelected]=useState<any>(null);
 const [reply,setReply]=useState('');
 const [messages,setMessages]=useState<any[]>([]);
 const [busy,setBusy]=useState(false);
 const [error,setError]=useState('');

 const load=useCallback(async()=>{
  if(!session)return;
  const [mine,pub]=await Promise.all([
   supabase.from('support_tickets').select('id,subject,body,status,priority,visibility,resolution,created_at,updated_at,closed_at').eq('user_id',session.user.id).order('created_at',{ascending:false}),
   supabase.from('support_tickets').select('id,subject,body,status,priority,visibility,resolution,created_at,updated_at,closed_at').eq('visibility','public').neq('status','closed').order('created_at',{ascending:false}).limit(30)
  ]);
  if(mine.error)setError(mine.error.message); else setTickets(mine.data||[]);
  if(pub.error)setError(pub.error.message); else setPublicTickets(pub.data||[]);
 },[session]);
 useEffect(()=>{void load()},[load]);

 async function openTicket(t:any){
  setSelected(t);
  const {data,error:e}=await supabase.from('support_ticket_messages').select('id,sender_id,body,internal,created_at').eq('ticket_id',t.id).eq('internal',false).order('created_at',{ascending:true});
  if(e)setError(e.message); else setMessages(data||[]);
 }
 async function create(){
  if(!subject.trim()||!body.trim())return;
  setBusy(true);setError('');
  const {data,error:e}=await supabase.rpc('create_support_ticket',{p_subject:subject.trim(),p_body:body.trim(),p_visibility:visibility,p_priority:priority});
  setBusy(false);
  if(e){setError(e.message);return;}
  setSubject('');setBody('');setVisibility('private');setPriority('normal');await load();
  if(data){const {data:row}=await supabase.from('support_tickets').select('*').eq('id',data).maybeSingle();if(row)await openTicket(row);}
 }
 async function sendReply(){
  if(!session||!selected||!reply.trim())return;
  setBusy(true);
  const {error:e}=await supabase.from('support_ticket_messages').insert({ticket_id:selected.id,sender_id:session.user.id,body:reply.trim(),internal:false});
  setBusy(false);if(e){setError(e.message);return;}setReply('');await openTicket(selected);
 }
 async function close(){
  if(!selected)return;
  Alert.alert('Close ticket','Close this support ticket?',[
   {text:'Cancel',style:'cancel'},
   {text:'Close',onPress:async()=>{const {error:e}=await supabase.rpc('close_support_ticket',{p_ticket_id:selected.id,p_resolution:selected.resolution||'Closed by user'});if(e)setError(e.message);else{await load();const t={...selected,status:'closed'};setSelected(t);}}}
  ]);
 }
 return <Screen><Header back eyebrow="ATHLETEN SUPPORT" title="Support Center" subtitle="Create a ticket, choose its visibility, and follow the resolution."/>
 <Section title="NEW TICKET"><Card>
  <TextInput value={subject} onChangeText={setSubject} placeholder="Subject" placeholderTextColor={c.muted} style={input}/>
  <TextInput value={body} onChangeText={setBody} placeholder="Describe the problem..." placeholderTextColor={c.muted} style={[input,{minHeight:100,textAlignVertical:'top'}]} multiline/>
  <Text style={label}>VISIBILITY</Text>
  <View style={row}>{(['private','public'] as const).map(v=><Pressable key={v} onPress={()=>setVisibility(v)} style={[chip,visibility===v&&active]}><Text style={[chipText,visibility===v&&activeText]}>{v.toUpperCase()}</Text></Pressable>)}</View>
  <Text style={hint}>{visibility==='private'?'Only you and AthleteN admins can see this ticket.':'Your ticket can be seen by authenticated AthleteN users and admins.'}</Text>
  <Text style={label}>PRIORITY</Text><View style={row}>{(['low','normal','high','urgent'] as const).map(v=><Pressable key={v} onPress={()=>setPriority(v)} style={[chip,priority===v&&active]}><Text style={[chipText,priority===v&&activeText]}>{v.toUpperCase()}</Text></Pressable>)}</View>
  <Pressable disabled={busy} onPress={()=>void create()} style={primary}><Text style={{color:'#fff',fontWeight:'900'}}>{busy?'CREATING…':'CREATE SUPPORT TICKET'}</Text></Pressable>
 </Card></Section>
 <Section title="MY TICKETS">{tickets.length?tickets.map(t=><Pressable key={t.id} onPress={()=>void openTicket(t)}><Card><View style={rowBetween}><Text style={title}>{t.subject}</Text><Text style={status}>{String(t.status).toUpperCase()}</Text></View><Text style={meta}>{t.visibility.toUpperCase()} · {t.priority.toUpperCase()} · {new Date(t.created_at).toLocaleString()}</Text>{t.resolution?<Text style={meta}>Resolution: {t.resolution}</Text>:null}</Card></Pressable>):<Empty text="No support tickets yet."/>}</Section>
 <Section title="PUBLIC SUPPORT TICKETS">{publicTickets.length?publicTickets.map(t=><Pressable key={t.id} onPress={()=>void openTicket(t)}><Card><Text style={title}>{t.subject}</Text><Text style={meta}>{String(t.status).toUpperCase()} · {t.priority.toUpperCase()}</Text><Text style={bodyText} numberOfLines={2}>{t.body}</Text></Card></Pressable>):<Empty text="No public support tickets."/>}</Section>
 {selected?<Section title={selected.subject}><Card><Text style={meta}>{selected.visibility.toUpperCase()} · {String(selected.status).toUpperCase()}</Text>{messages.map(m=><View key={m.id} style={{paddingVertical:9,borderBottomWidth:1,borderBottomColor:c.border}}><Text style={meta}>{m.sender_id===session?.user.id?'YOU':'ATHLETEN SUPPORT'}</Text><Text style={bodyText}>{m.body}</Text></View>)}{selected.status!=='closed'?<><TextInput value={reply} onChangeText={setReply} placeholder="Reply to this ticket..." placeholderTextColor={c.muted} style={[input,{marginTop:10}]} /><Pressable disabled={busy} onPress={()=>void sendReply()} style={primary}><Text style={{color:'#fff',fontWeight:'900'}}>SEND REPLY</Text></Pressable><Pressable onPress={()=>void close()} style={secondary}><Text style={{color:c.text,fontWeight:'900'}}>CLOSE TICKET</Text></Pressable></>:<Text style={meta}>This ticket is closed.</Text>}</Card></Section>:null}
 {error?<Text style={{color:c.danger,fontSize:10}}>{error}</Text>:null}
 </Screen>
}
const input={backgroundColor:c.background,borderWidth:1,borderColor:c.border,borderRadius:12,color:c.text,padding:12,fontSize:12,marginBottom:8} as any;
const label={color:c.muted,fontSize:8,fontWeight:'900',letterSpacing:1.2,marginTop:4,marginBottom:5} as any;
const hint={color:c.muted,fontSize:9,lineHeight:14,marginBottom:8} as any;
const row={flexDirection:'row',gap:7,flexWrap:'wrap'} as any;
const rowBetween={flexDirection:'row',justifyContent:'space-between',alignItems:'center',gap:8} as any;
const chip={borderWidth:1,borderColor:c.border,borderRadius:10,paddingHorizontal:11,paddingVertical:8} as any;
const active={backgroundColor:c.accentSoft,borderColor:c.accent} as any;
const chipText={color:c.muted,fontSize:9,fontWeight:'900'} as any;
const activeText={color:c.accentBright} as any;
const primary={backgroundColor:c.accent,borderRadius:12,padding:13,alignItems:'center',marginTop:6} as any;
const secondary={backgroundColor:c.surface,borderWidth:1,borderColor:c.borderStrong,borderRadius:12,padding:12,alignItems:'center',marginTop:8} as any;
const title={color:c.text,fontSize:13,fontWeight:'900'} as any;
const meta={color:c.muted,fontSize:9,lineHeight:15} as any;
const status={color:c.accentBright,fontSize:8,fontWeight:'900'} as any;
const bodyText={color:c.text,fontSize:11,lineHeight:17,marginTop:4} as any;
