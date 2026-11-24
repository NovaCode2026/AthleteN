// @ts-nocheck
import { useCallback,useEffect,useState } from 'react';
import { Pressable,Text,TextInput,View } from 'react-native';
import { useAuth } from '@/context/AuthContext';
import { supabase } from '@/lib/supabase';
import { Screen,Header,Section,Card,Button,Field,c,RefreshButton,Icon } from '@/components/mobile-ui';

const DEFAULT_PACKING_ITEMS=[
 'Sport kit / uniform','Required protective equipment','Event registration documents',
 'Suitable footwear','Water bottle','Towel and personal essentials','Phone charger'
];
const inputStyle={backgroundColor:c.panel,borderWidth:1,borderColor:c.border,borderRadius:10,padding:10,color:c.text,fontSize:11};
const makeId=()=>String(Date.now())+'-'+Math.random().toString(36).slice(2,7);

export default function AwayMode(){
 const {session}=useAuth();const uid=session?.user?.id;
 const [rows,setRows]=useState<any[]>([]);const [eventName,setEventName]=useState('');
 const [eventDate,setEventDate]=useState('');const [venue,setVenue]=useState('');
 const [departureDate,setDepartureDate]=useState('');const [returnDate,setReturnDate]=useState('');
 const [notes,setNotes]=useState('');const [busy,setBusy]=useState(false);const [message,setMessage]=useState('');
 const [packingDrafts,setPackingDrafts]=useState<Record<string,string>>({});
 const [itineraryDrafts,setItineraryDrafts]=useState<Record<string,string>>({});
 const [timeDrafts,setTimeDrafts]=useState<Record<string,string>>({});
 const load=useCallback(async()=>{
  if(!uid)return;setBusy(true);const {data,error}=await supabase.from('athlete_away_plans').select('*').eq('user_id',uid).order('event_date',{ascending:true});
  if(error)setMessage('Away Mode data could not load. Check that its migration has been installed.');else setRows(data||[]);
  setBusy(false);
 },[uid]);
 useEffect(()=>{void load()},[load]);
 const create=async()=>{
  if(!uid||eventName.trim().length<2){setMessage('Enter a competition or event name.');return;}
  if(departureDate&&returnDate&&departureDate>returnDate){setMessage('Return date cannot be before departure date.');return;}
  if(venue.length>180||notes.length>1200){setMessage('Venue or notes are longer than the allowed limit.');return;}
  setBusy(true);setMessage('');
  const packing=DEFAULT_PACKING_ITEMS.map((label,index)=>({id:'default-'+index,label,packed:false}));
  const {data,error}=await supabase.from('athlete_away_plans').insert({
   user_id:uid,event_name:eventName.trim(),event_date:eventDate||null,venue:venue.trim()||null,
   departure_date:departureDate||null,return_date:returnDate||null,notes:notes.trim()||null,
   packing_items:packing,itinerary_items:[],status:'planning'
  }).select('*').single();
  if(error)setMessage(error.message);else{setRows(old=>[...old,data]);setEventName('');setEventDate('');setVenue('');setDepartureDate('');setReturnDate('');setNotes('');}
  setBusy(false);
 };
 const updatePlan=async(plan,patch)=>{
  if(!uid)return;setBusy(true);const {data,error}=await supabase.from('athlete_away_plans').update(patch).eq('id',plan.id).eq('user_id',uid).select('*').single();
  if(error)setMessage(error.message);else setRows(old=>old.map(row=>row.id===plan.id?data:row));setBusy(false);
 };
 const togglePacking=(plan,item)=>void updatePlan(plan,{packing_items:(plan.packing_items||[]).map(x=>x.id===item.id?{...x,packed:!x.packed}:x)});
 const addPacking=async(plan)=>{
  const label=(packingDrafts[plan.id]||'').trim();if(!label)return;
  await updatePlan(plan,{packing_items:[...(plan.packing_items||[]),{id:makeId(),label,packed:false}]});
  setPackingDrafts(old=>({...old,[plan.id]:''}));
 };
 const addItinerary=async(plan)=>{
  const title=(itineraryDrafts[plan.id]||'').trim();if(!title)return;
  await updatePlan(plan,{itinerary_items:[...(plan.itinerary_items||[]),{id:makeId(),title,time:timeDrafts[plan.id]||''}]});
  setItineraryDrafts(old=>({...old,[plan.id]:''}));setTimeDrafts(old=>({...old,[plan.id]:''}));
 };
 const removePlan=async(plan)=>{
  if(!uid)return;setBusy(true);const {error}=await supabase.from('athlete_away_plans').delete().eq('id',plan.id).eq('user_id',uid);
  if(error)setMessage(error.message);else setRows(old=>old.filter(x=>x.id!==plan.id));setBusy(false);
 };
 return <Screen>
  <Header back eyebrow="ATHLETEN · ATHLETE TRAVEL" title="Away Mode" subtitle="Your private competition travel planner." right={<RefreshButton onPress={()=>void load()} busy={busy}/>}/>
  <Card accent><Text style={{color:c.accentBright,fontSize:9,fontWeight:'900'}}>TRAVEL WORKSPACE</Text><Text style={{color:c.text,fontSize:18,fontWeight:'900',marginTop:4}}>Plan the trip. Focus on the event.</Text><Text style={{color:c.muted,fontSize:10,lineHeight:16,marginTop:4}}>Store event logistics, packing tasks and your own itinerary. Away Mode does not track your live location. Keep sensitive details such as room numbers and identity-document numbers out of notes.</Text></Card>
  <Section title="CREATE A TRIP">
   <Card>
    <Field label="EVENT / COMPETITION" value={eventName} onChangeText={setEventName} placeholder="Competition name" maxLength={120}/>
    <Field label="EVENT DATE · YYYY-MM-DD" value={eventDate} onChangeText={setEventDate} placeholder="2026-12-10"/>
    <Field label="VENUE" value={venue} onChangeText={setVenue} placeholder="Venue name or public location" maxLength={180}/>
    <View style={{flexDirection:'row',gap:9}}><View style={{flex:1}}><Field label="DEPARTURE DATE" value={departureDate} onChangeText={setDepartureDate} placeholder="YYYY-MM-DD"/></View><View style={{flex:1}}><Field label="RETURN DATE" value={returnDate} onChangeText={setReturnDate} placeholder="YYYY-MM-DD"/></View></View>
    <Text style={{color:c.muted,fontSize:9,fontWeight:'900'}}>PRIVATE NOTES</Text>
    <TextInput value={notes} onChangeText={setNotes} multiline maxLength={1200} placeholder="Add non-sensitive reminders…" placeholderTextColor={c.muted} style={[inputStyle,{minHeight:70,textAlignVertical:'top'}]}/>
    <Button title="CREATE TRAVEL PLAN" onPress={create} busy={busy}/>
   </Card>
  </Section>
  <Section title="MY TRAVEL PLANS">
   {rows.map(plan=><Card key={plan.id}>
    <View style={{flexDirection:'row',alignItems:'flex-start',justifyContent:'space-between',gap:8}}>
     <View style={{flex:1,gap:4}}><Text style={{color:c.text,fontSize:15,fontWeight:'900'}}>{plan.event_name}</Text><Text style={{color:c.accentBright,fontSize:10,fontWeight:'900'}}>{plan.event_date||'Date not set'} · {(plan.status||'planning').toUpperCase()}</Text><Text style={{color:c.muted,fontSize:10}}>{plan.venue||'Venue not set'}</Text><Text style={{color:c.muted,fontSize:9}}>Travel: {plan.departure_date||'—'} to {plan.return_date||'—'}</Text></View>
     <Pressable accessibilityRole="button" accessibilityLabel="Delete travel plan" disabled={busy} onPress={()=>void removePlan(plan)}><Icon name="trash-can-outline" size={18} color={c.warning}/></Pressable>
    </View>
    <View style={{height:1,backgroundColor:c.border,marginVertical:10}}/>
    <Text style={{color:c.accentBright,fontSize:9,fontWeight:'900',letterSpacing:1}}>PACKING CHECKLIST</Text>
    {(plan.packing_items||[]).map(item=><Pressable key={item.id} disabled={busy} onPress={()=>togglePacking(plan,item)} style={{flexDirection:'row',alignItems:'center',gap:9,paddingVertical:6}}>
      <Icon name={item.packed?'checkbox-marked':'checkbox-blank-outline'} size={18} color={item.packed?c.success:c.muted}/><Text style={{color:item.packed?c.muted:c.text,fontSize:11,textDecorationLine:item.packed?'line-through':'none',flex:1}}>{item.label}</Text>
     </Pressable>)}
    <View style={{flexDirection:'row',alignItems:'center',gap:7,marginTop:5}}><TextInput value={packingDrafts[plan.id]||''} onChangeText={v=>setPackingDrafts(old=>({...old,[plan.id]:v}))} placeholder="Add packing item" placeholderTextColor={c.muted} style={[inputStyle,{flex:1}]}/><Button title="ADD" secondary onPress={()=>void addPacking(plan)} busy={busy}/></View>
    <Text style={{color:c.accentBright,fontSize:9,fontWeight:'900',letterSpacing:1,marginTop:13}}>PERSONAL ITINERARY</Text>
    {(plan.itinerary_items||[]).map(item=><View key={item.id} style={{paddingVertical:7,borderBottomWidth:1,borderBottomColor:c.border}}><Text style={{color:c.text,fontSize:11,fontWeight:'800'}}>{item.title}</Text>{item.time?<Text style={{color:c.muted,fontSize:9}}>{item.time}</Text>:null}</View>)}
    <View style={{gap:7,marginTop:7}}><Field label="SCHEDULE ITEM" value={itineraryDrafts[plan.id]||''} onChangeText={v=>setItineraryDrafts(old=>({...old,[plan.id]:v}))} placeholder="Registration, travel, event session…"/><Field label="TIME (OPTIONAL)" value={timeDrafts[plan.id]||''} onChangeText={v=>setTimeDrafts(old=>({...old,[plan.id]:v}))} placeholder="09:00"/><Button title="ADD TO ITINERARY" secondary onPress={()=>void addItinerary(plan)} busy={busy}/></View>
    {plan.notes?<Text style={{color:c.muted,fontSize:10,lineHeight:15,marginTop:10}}>Notes: {plan.notes}</Text>:null}
    {plan.status!=='ready'?<Button title="MARK PLAN READY" onPress={()=>void updatePlan(plan,{status:'ready'})} secondary busy={busy}/>:<Text style={{color:c.success,fontSize:9,fontWeight:'900',marginTop:10}}>PLAN READY</Text>}
   </Card>)}
   {!rows.length?<Card><Text style={{color:c.muted,fontSize:10}}>No travel plans yet. Create one when you have an upcoming event.</Text></Card>:null}
  </Section>
  {message?<Text style={{color:c.warning,fontSize:10}}>{message}</Text>:null}
 </Screen>;
}
