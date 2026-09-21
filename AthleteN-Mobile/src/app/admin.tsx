import { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { Colors } from '@/constants/theme';
import { useAuth } from '@/context/AuthContext';
import { supabase } from '@/lib/supabase';

const c=Colors.dark;
const resources=[
 ['profiles','Users'],['training_sessions','Training'],['training_plans','Training plans'],['tournaments','Tournaments'],['matches','Matches'],['medals','Medals'],
 ['weight_logs','Weight logs'],['goals','Goals'],['competition_checklists','Checklists'],['tournament_scans','Scanner'],['documents','Documents'],['certificates','Certificates'],
 ['notifications','Notifications'],['announcements','Announcements'],['support_tickets','Support tickets'],['subscriptions','Subscriptions'],['subscription_usage','Usage'],
 ['feature_flags','Feature flags'],['student_verifications','Verifications'],['audit_logs','Audit logs'],['feedback_items','Feedback'],['roadmap_items','Roadmap'],
 ['calendar_events','Calendar'],['injuries','Injuries'],['attendance_records','Attendance'],['referrals','Referrals']
] as const;

type Row=Record<string,any>;
export default function AdminScreen(){
 const {profile}=useAuth();
 const role=String(profile?.role||'athlete'); const canManage=role==='admin'||role==='super_admin'; const owner=role==='super_admin';
 const [selected,setSelected]=useState<string>('profiles'); const [rows,setRows]=useState<Row[]>([]); const [counts,setCounts]=useState<Record<string,number>>({});
 const [query,setQuery]=useState(''); const [selectedRow,setSelectedRow]=useState<Row|null>(null); const [draft,setDraft]=useState('');
 const [createOpen,setCreateOpen]=useState(false); const [createJson,setCreateJson]=useState('{}'); const [announcementOpen,setAnnouncementOpen]=useState(false);
 const [announcementTitle,setAnnouncementTitle]=useState(''); const [announcementBody,setAnnouncementBody]=useState('');
 const [loading,setLoading]=useState(false); const [busy,setBusy]=useState(false); const [message,setMessage]=useState('');

 const loadCounts=useCallback(async()=>{
  if(!canManage)return;
  const result:Record<string,number>={};
  await Promise.all(resources.map(async([table])=>{const r=await supabase.from(table).select('*',{count:'exact',head:true});result[table]=r.count??0;}));
  setCounts(result);
 },[canManage]);

 const load=useCallback(async()=>{
  if(!canManage)return;
  setLoading(true);setMessage('');setSelectedRow(null);
  const {data,error}=await supabase.from(selected).select('*').limit(100);
  if(error)setMessage(error.message); else setRows((data||[]) as Row[]);
  setLoading(false);
 },[canManage,selected]);

 useEffect(()=>{void loadCounts()},[loadCounts]);
 useEffect(()=>{void load()},[load]);

 const filtered=useMemo(()=>{const q=query.trim().toLowerCase();return q?rows.filter(r=>JSON.stringify(r).toLowerCase().includes(q)):rows},[rows,query]);

 if(!canManage)return <View style={s.denied}><Text style={s.brand}>ATHLETEN</Text><Text style={s.deniedTitle}>Admin access required</Text><Text style={s.meta}>Your account does not have an administrator role.</Text></View>;

 async function refresh(){await load();await loadCounts()}
 function open(r:Row){setSelectedRow(r);setDraft(JSON.stringify(r,null,2));}
 async function save(){
  if(!selectedRow?.id)return;
  let value:Row;try{value=JSON.parse(draft)}catch{setMessage('Record editor contains invalid JSON.');return}
  delete value.id;delete value.created_at;delete value.updated_at;
  setBusy(true);const {error}=await supabase.from(selected).update(value).eq('id',selectedRow.id);setBusy(false);
  if(error)setMessage(error.message);else{setMessage('Record saved.');await refresh()}
 }
 async function remove(){
  if(!selectedRow?.id||!owner)return;
  Alert.alert('Delete record','This permanently deletes the selected record.',[{text:'Cancel',style:'cancel'},{text:'Delete',style:'destructive',onPress:async()=>{setBusy(true);const {error}=await supabase.from(selected).delete().eq('id',selectedRow.id);setBusy(false);if(error)setMessage(error.message);else{setMessage('Record deleted.');await refresh()}}}]);
 }
 async function create(){
  let value:Row;try{value=JSON.parse(createJson)}catch{setMessage('New record JSON is invalid.');return}
  if(!value||Array.isArray(value)){setMessage('New record must be a JSON object.');return}
  delete value.id;delete value.created_at;delete value.updated_at;
  setBusy(true);const {error}=await supabase.from(selected).insert(value);setBusy(false);
  if(error)setMessage(error.message);else{setCreateOpen(false);setCreateJson('{}');setMessage('Record created.');await refresh()}
 }
 async function publish(){
  if(!announcementTitle.trim()||!announcementBody.trim())return;
  setBusy(true);const {error}=await supabase.from('announcements').insert({title:announcementTitle.trim(),body:announcementBody.trim(),audience:'all',published_at:new Date().toISOString(),created_by:profile?.user_id});setBusy(false);
  if(error)setMessage(error.message);else{setAnnouncementTitle('');setAnnouncementBody('');setAnnouncementOpen(false);setMessage('Announcement published.');await refresh()}
 }

 return <ScrollView style={s.screen} contentContainerStyle={s.content}>
  <View style={s.hero}><Text style={s.kicker}>SECURE ADMINISTRATION</Text><Text style={s.title}>Command Center</Text><Text style={s.sub}>Operate AthleteN from mobile: users, athlete data, verification, support, billing, product controls and records.</Text><View style={s.identity}><Text style={s.role}>{owner?'OWNER':'ADMIN'}</Text><Text style={s.meta}>Signed in administrator</Text></View></View>
  <View style={s.statRow}><Stat label="USERS" value={counts.profiles??0}/><Stat label="RECORDS" value={Object.values(counts).reduce((a,b)=>a+b,0)}/><Stat label="SUPPORT" value={counts.support_tickets??0}/></View>
  <View style={s.actions}><Pressable style={s.primary} onPress={()=>void refresh()} disabled={loading}><Text style={s.primaryText}>{loading?'REFRESHING…':'REFRESH ALL'}</Text></Pressable><Pressable style={s.secondary} onPress={()=>setAnnouncementOpen(v=>!v)}><Text style={s.secondaryText}>ANNOUNCEMENT</Text></Pressable><Pressable style={s.secondary} onPress={()=>{setCreateJson('{}');setCreateOpen(v=>!v)}}><Text style={s.secondaryText}>+ NEW RECORD</Text></Pressable></View>
  {announcementOpen&&<View style={s.panel}><Text style={s.panelTitle}>Publish announcement</Text><Field value={announcementTitle} onChangeText={setAnnouncementTitle} placeholder="Title"/><TextInput value={announcementBody} onChangeText={setAnnouncementBody} placeholder="Message" placeholderTextColor={c.muted} multiline style={[s.input,s.textarea]}/><Pressable style={s.primary} onPress={()=>void publish()} disabled={busy}><Text style={s.primaryText}>PUBLISH NOW</Text></Pressable></View>}
  {createOpen&&<View style={s.panel}><Text style={s.panelTitle}>Create record in {resources.find(x=>x[0]===selected)?.[1]}</Text><TextInput value={createJson} onChangeText={setCreateJson} multiline spellCheck={false} style={[s.input,s.json]} /><Pressable style={s.primary} onPress={()=>void create()} disabled={busy}><Text style={s.primaryText}>CREATE RECORD</Text></Pressable></View>}
  <Text style={s.section}>RESOURCES</Text>
  <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.resourceRow}>{resources.map(([table,label])=><Pressable key={table} onPress={()=>{setSelected(table);setQuery('');}} style={[s.resource,selected===table&&s.resourceActive]}><Text style={s.resourceText}>{label}</Text><Text style={s.resourceCount}>{counts[table]??'—'}</Text></Pressable>)}</ScrollView>
  <View style={s.toolbar}><Text style={s.section}>{resources.find(x=>x[0]===selected)?.[1]}</Text><TextInput value={query} onChangeText={setQuery} placeholder="Search records" placeholderTextColor={c.muted} style={s.search}/></View>
  {!!message&&<Text style={s.message}>{message}</Text>}
  {loading?<ActivityIndicator color={c.accent} size="large"/>:filtered.map((r,i)=><View key={String(r.id||i)} style={s.record}><View style={s.recordHead}><Text style={s.recordTitle}>{String(r.name||r.full_name||r.title||r.event_name||r.id||'Record').slice(0,50)}</Text><Text style={s.recordId}>{r.id?String(r.id).slice(0,8):'no id'}</Text></View><Text style={s.jsonPreview} numberOfLines={4}>{JSON.stringify(r,null,2)}</Text><View style={s.actions}><Pressable style={s.secondary} onPress={()=>open(r)}><Text style={s.secondaryText}>OPEN / EDIT</Text></Pressable>{owner&&r.id?<Pressable style={s.danger} onPress={()=>remove()}><Text style={s.dangerText}>DELETE</Text></Pressable>:null}</View></View>)}
  {filtered.length===0&&!loading&&<View style={s.empty}><Text style={s.recordTitle}>No records found</Text><Text style={s.meta}>Try another resource, search term, or refresh.</Text></View>}
  {selectedRow&&<View style={s.panel}><Text style={s.panelTitle}>Record editor</Text><Text style={s.meta}>Primary key and timestamps are protected.</Text><TextInput value={draft} onChangeText={setDraft} multiline spellCheck={false} style={[s.input,s.json]}/><View style={s.actions}><Pressable style={s.primary} onPress={()=>void save()} disabled={busy}><Text style={s.primaryText}>{busy?'SAVING…':'SAVE RECORD'}</Text></Pressable><Pressable style={s.secondary} onPress={()=>setSelectedRow(null)}><Text style={s.secondaryText}>CLOSE</Text></Pressable></View></View>}
 </ScrollView>
}
function Stat({label,value}:{label:string;value:number}){return <View style={s.stat}><Text style={s.statLabel}>{label}</Text><Text style={s.statValue}>{value}</Text></View>}
function Field({value,onChangeText,placeholder}:{value:string;onChangeText:(v:string)=>void;placeholder:string}){return <TextInput value={value} onChangeText={onChangeText} placeholder={placeholder} placeholderTextColor={c.muted} style={s.input}/>}
const s=StyleSheet.create({
 screen:{flex:1,backgroundColor:'#07090D'},content:{padding:18,paddingTop:48,paddingBottom:60,gap:12},hero:{backgroundColor:c.surface,borderWidth:1,borderColor:c.border,borderRadius:22,padding:20,gap:9},kicker:{color:c.accent,fontSize:10,fontWeight:'900',letterSpacing:1.8},title:{color:c.text,fontSize:30,fontWeight:'900'},sub:{color:c.muted,fontSize:13,lineHeight:19},identity:{marginTop:5,borderTopWidth:1,borderTopColor:c.border,paddingTop:12},role:{color:c.accent,fontSize:12,fontWeight:'900',letterSpacing:1},meta:{color:c.muted,fontSize:11,lineHeight:17},statRow:{flexDirection:'row',gap:9},stat:{flex:1,backgroundColor:c.surface,borderWidth:1,borderColor:c.border,borderRadius:15,padding:13},statLabel:{color:c.muted,fontSize:9,fontWeight:'900',letterSpacing:1},statValue:{color:c.text,fontSize:24,fontWeight:'900',marginTop:3},actions:{flexDirection:'row',gap:8,flexWrap:'wrap'},primary:{backgroundColor:c.accent,borderRadius:12,paddingVertical:13,paddingHorizontal:15,alignItems:'center',justifyContent:'center',minWidth:120},primaryText:{color:'#fff',fontSize:10,fontWeight:'900',letterSpacing:1},secondary:{backgroundColor:c.surface,borderWidth:1,borderColor:c.border,borderRadius:12,paddingVertical:12,paddingHorizontal:13,alignItems:'center',justifyContent:'center'},secondaryText:{color:c.text,fontSize:10,fontWeight:'900',letterSpacing:.7},danger:{backgroundColor:'#2A1116',borderWidth:1,borderColor:'#61303A',borderRadius:12,paddingVertical:12,paddingHorizontal:13},dangerText:{color:'#F0A8B1',fontSize:10,fontWeight:'900'},panel:{backgroundColor:c.surface,borderWidth:1,borderColor:c.accentSoft,borderRadius:18,padding:15,gap:10},panelTitle:{color:c.text,fontSize:17,fontWeight:'800'},input:{backgroundColor:c.background,borderWidth:1,borderColor:c.border,borderRadius:12,color:c.text,padding:13,fontSize:13},textarea:{minHeight:110,textAlignVertical:'top'},json:{minHeight:220,textAlignVertical:'top',fontFamily:'monospace'},section:{color:c.muted,fontSize:10,fontWeight:'900',letterSpacing:1.5},resourceRow:{gap:8,paddingVertical:2},resource:{backgroundColor:c.surface,borderWidth:1,borderColor:c.border,borderRadius:12,paddingVertical:10,paddingHorizontal:12,minWidth:100},resourceActive:{borderColor:c.accent,backgroundColor:c.accentDeep},resourceText:{color:c.text,fontSize:11,fontWeight:'800'},resourceCount:{color:c.muted,fontSize:10,marginTop:3},toolbar:{gap:8},search:{marginTop:3},message:{color:'#9BC3FF',fontSize:12},record:{backgroundColor:c.surface,borderWidth:1,borderColor:c.border,borderRadius:16,padding:14,gap:10},recordHead:{flexDirection:'row',justifyContent:'space-between',gap:8},recordTitle:{color:c.text,fontSize:14,fontWeight:'800',flex:1},recordId:{color:c.muted,fontSize:10},jsonPreview:{color:'#AEB9CB',fontFamily:'monospace',fontSize:10,lineHeight:15},empty:{backgroundColor:c.surface,borderWidth:1,borderColor:c.border,borderRadius:16,padding:20,gap:6},denied:{flex:1,backgroundColor:c.background,alignItems:'center',justifyContent:'center',padding:30,gap:12},brand:{color:c.accent,fontSize:14,fontWeight:'900',letterSpacing:4},deniedTitle:{color:c.text,fontSize:24,fontWeight:'900'}
});
