// @ts-nocheck
import { useCallback, useEffect, useState } from 'react';
import { Alert, Pressable, ScrollView, Share, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { Screen, Card, Button, Field, c, RefreshButton } from '@/components/mobile-ui';
import { useAuth } from '@/context/AuthContext';
import { supabase } from '@/lib/supabase';

const sections = [
  {id:'fees',label:'Fees'},{id:'coach',label:'Coach Ops'},{id:'transfers',label:'Transfers'},
  {id:'announcements',label:'Announcements'},{id:'guardians',label:'Guardians'},{id:'reports',label:'Reports'},
  {id:'seats',label:'Seats'},{id:'notifications',label:'Notifications'},{id:'roles',label:'Roles'},{id:'audit',label:'Audit Log'}
];
const money=(v:any)=>'₹'+Number(v||0).toLocaleString('en-IN',{maximumFractionDigits:2});
const today=()=>new Date().toISOString().slice(0,10);
const permissionSets:any={
  manager:['fees.manage','coaches.manage','attendance.manage','transfers.review','announcements.publish','guardians.manage','reports.export','seats.manage','members.manage','audit.read','notifications.manage'],
  operations:['coaches.manage','attendance.manage','transfers.review','announcements.publish','reports.export','notifications.manage'],
  finance:['fees.manage','reports.export'],
  communications:['announcements.publish','guardians.manage','notifications.manage']
};

export default function AcademyOperations(){
  const {session,profile}=useAuth(); const router=useRouter(); const userId=session?.user?.id; const academyId=profile?.academy_id;
  const [section,setSection]=useState(()=>!profile?.academy_id?'guardians':profile?.role==='athlete'?'transfers':profile?.role==='coach'?'coach':'fees'); const [busy,setBusy]=useState(false); const [refreshing,setRefreshing]=useState(false); const [error,setError]=useState('');
  const [members,setMembers]=useState<any[]>([]); const [invoices,setInvoices]=useState<any[]>([]); const [payments,setPayments]=useState<any[]>([]);
  const [coachAttendance,setCoachAttendance]=useState<any[]>([]); const [availability,setAvailability]=useState<any[]>([]); const [transfers,setTransfers]=useState<any[]>([]);
  const [announcements,setAnnouncements]=useState<any[]>([]); const [guardianLinks,setGuardianLinks]=useState<any[]>([]); const [reportExports,setReportExports]=useState<any[]>([]);
  const [seatRequests,setSeatRequests]=useState<any[]>([]); const [staffAssignments,setStaffAssignments]=useState<any[]>([]); const [auditRows,setAuditRows]=useState<any[]>([]);
  const [notificationPrefs,setNotificationPrefs]=useState<any>({announcements:true,fees:true,transfers:true,seat_updates:true,reports:true});
  const [feeAthlete,setFeeAthlete]=useState(''); const [feeTitle,setFeeTitle]=useState('Monthly training fee'); const [feeAmount,setFeeAmount]=useState(''); const [feeDue,setFeeDue]=useState(''); const [feeDescription,setFeeDescription]=useState('');
  const [paymentAmounts,setPaymentAmounts]=useState<any>({}); const [paymentMethods,setPaymentMethods]=useState<any>({});
  const [coachDate,setCoachDate]=useState(today()); const [coachStatus,setCoachStatus]=useState('present');
  const [availabilityDay,setAvailabilityDay]=useState('1'); const [availabilityStart,setAvailabilityStart]=useState('16:00'); const [availabilityEnd,setAvailabilityEnd]=useState('19:00'); const [availabilityType,setAvailabilityType]=useState('available');
  const [transferCoach,setTransferCoach]=useState(''); const [transferReason,setTransferReason]=useState('');
  const [announcementTitle,setAnnouncementTitle]=useState(''); const [announcementBody,setAnnouncementBody]=useState(''); const [announcementAudience,setAnnouncementAudience]=useState('all');
  const [guardianAthlete,setGuardianAthlete]=useState(''); const [guardianUser,setGuardianUser]=useState(''); const [guardianRelationship,setGuardianRelationship]=useState('parent'); const [guardianScopes,setGuardianScopes]=useState<string[]>(['announcements','calendar']);
  const [staffUser,setStaffUser]=useState(''); const [staffRole,setStaffRole]=useState('operations'); const [reportType,setReportType]=useState('athletes');
  const isAdmin=profile?.role==='academy_admin'||profile?.role==='academy';
  const memberName=(id:string)=>members.find(x=>x.user_id===id)?.full_name||members.find(x=>x.user_id===id)?.username||'Member';

  const load=useCallback(async()=>{
    setError('');
    if(!userId){setError('Sign in to use Academy operations.');return;}
    const membershipQuery=academyId?await supabase.from('academy_memberships').select('user_id,role,status').eq('academy_id',academyId).eq('status','active'):{data:[],error:null};
    if(membershipQuery.error)setError(membershipQuery.error.message);
    const raw=membershipQuery.data||[];
    if(raw.length){
      const profileQuery=await supabase.from('profiles').select('user_id,full_name,username').in('user_id',raw.map((x:any)=>x.user_id));
      const profileMap=new Map((profileQuery.data||[]).map((x:any)=>[x.user_id,x]));
      setMembers(raw.map((x:any)=>({...x,...(profileMap.get(x.user_id)||{})})));
    }else setMembers([]);
    if(!academyId){
      const inbound=await supabase.from('academy_guardian_links').select('*').eq('guardian_user_id',userId).order('created_at',{ascending:false}).limit(50);
      setGuardianLinks(inbound.data||[]);
      return;
    }
    const requests:any[]=[];
    const add=(key:string,p:any)=>requests.push(p.then((r:any)=>({key,data:r.data||[],error:r.error?.message||''})));
    add('invoices',supabase.from('academy_fee_invoices').select('id,athlete_user_id,title,amount,due_date,status,created_at').eq('academy_id',academyId).order('created_at',{ascending:false}).limit(200));
    add('attendance',supabase.from('academy_coach_attendance').select('id,coach_user_id,attendance_date,status,note').eq('academy_id',academyId).order('attendance_date',{ascending:false}).limit(100));
    add('availability',supabase.from('academy_coach_availability').select('id,coach_user_id,weekday,starts_at,ends_at,availability_type,note').eq('academy_id',academyId).order('weekday'));
    add('transfers',supabase.from('academy_athlete_transfer_requests').select('*').eq('academy_id',academyId).order('created_at',{ascending:false}).limit(100));
    add('announcements',supabase.from('academy_announcements').select('id,title,body,audience,group_id,published_at,created_at,created_by').eq('academy_id',academyId).order('created_at',{ascending:false}).limit(100));
    add('guardians',supabase.from('academy_guardian_links').select('*').eq('academy_id',academyId).order('created_at',{ascending:false}).limit(100));
    add('reports',supabase.from('academy_report_exports').select('*').eq('academy_id',academyId).order('created_at',{ascending:false}).limit(100));
    add('seats',supabase.from('academy_seat_requests').select('*').eq('academy_id',academyId).order('created_at',{ascending:false}).limit(100));
    add('staff',supabase.from('academy_staff_assignments').select('*').eq('academy_id',academyId).order('created_at',{ascending:false}));
    add('audit',supabase.from('academy_audit_log').select('*').eq('academy_id',academyId).order('created_at',{ascending:false}).limit(150));
    const pref=await supabase.from('academy_notification_preferences').select('announcements,fees,transfers,seat_updates,reports').eq('academy_id',academyId).eq('user_id',userId).maybeSingle();
    if(pref.data)setNotificationPrefs(pref.data);
    const invoiceIds=await supabase.from('academy_fee_invoices').select('id').eq('academy_id',academyId);
    if(invoiceIds.data?.length){
      const paymentQuery=await supabase.from('academy_fee_payments').select('id,invoice_id,amount,method,reference,received_at').in('invoice_id',invoiceIds.data.map((x:any)=>x.id));
      setPayments(paymentQuery.data||[]);
    }else setPayments([]);
    const results=await Promise.all(requests); const map:any=Object.fromEntries(results.map(x=>[x.key,x.data]));
    setInvoices(map.invoices||[]);setCoachAttendance(map.attendance||[]);setAvailability(map.availability||[]);setTransfers(map.transfers||[]);
    setAnnouncements(map.announcements||[]);setGuardianLinks(map.guardians||[]);setReportExports(map.reports||[]);setSeatRequests(map.seats||[]);
    setStaffAssignments(map.staff||[]);setAuditRows(map.audit||[]);
    const firstError=results.find(x=>x.error);if(firstError)setError(firstError.error);
    const inbound=await supabase.from('academy_guardian_links').select('*').eq('guardian_user_id',userId).order('created_at',{ascending:false}).limit(50);
    if(inbound.data?.length)setGuardianLinks(prev=>[...inbound.data,...prev.filter((x:any)=>!inbound.data.some((y:any)=>y.id===x.id))]);
  },[academyId,userId]);

  useEffect(()=>{void load()},[load]);
  const refresh=async()=>{setRefreshing(true);try{await load()}finally{setRefreshing(false)}};
  const run=async(fn:()=>Promise<any>,success='Saved')=>{
    setBusy(true);
    try{const result=await fn();if(result?.error)throw result.error; if(success)Alert.alert('AthleteN',success);await load();}
    catch(e:any){Alert.alert('Could not complete action',e?.message||'Please try again.');}
    finally{setBusy(false);}
  };
  const rpc=(name:string,args:any)=>supabase.rpc(name,args);
  const createInvoice=()=>run(()=>rpc('academy_create_fee_invoice',{p_academy_id:academyId,p_athlete_user_id:feeAthlete,p_title:feeTitle,p_amount:Number(feeAmount),p_due_date:feeDue||null,p_description:feeDescription||null}),'Fee invoice created. Payments are recorded manually.');
  const recordPayment=(invoice:any)=>run(()=>rpc('academy_record_fee_payment',{p_invoice_id:invoice.id,p_amount:Number(paymentAmounts[invoice.id]),p_method:paymentMethods[invoice.id]||'upi_manual',p_reference:null}),'Manual payment record saved.');
  const markAttendance=()=>run(async()=>{const {error}=await supabase.from('academy_coach_attendance').upsert({academy_id:academyId,coach_user_id:userId,attendance_date:coachDate,status:coachStatus,recorded_by:userId},{onConflict:'academy_id,coach_user_id,attendance_date'});return {error};},'Coach attendance saved.');
  const addAvailability=()=>run(async()=>{const {error}=await supabase.from('academy_coach_availability').upsert({academy_id:academyId,coach_user_id:userId,weekday:Number(availabilityDay),starts_at:availabilityStart,ends_at:availabilityEnd,availability_type:availabilityType},{onConflict:'academy_id,coach_user_id,weekday,starts_at,ends_at'});return {error};},'Coach availability updated.');
  const requestTransfer=()=>run(()=>rpc('academy_request_athlete_transfer',{p_academy_id:academyId,p_to_coach_user_id:transferCoach,p_reason:transferReason||null}),'Transfer request sent to the current and target Coaches.');
  const reviewTransfer=(row:any,action:string)=>run(()=>rpc('academy_review_athlete_transfer',{p_request_id:row.id,p_action:action}),'Transfer updated.');
  const publishAnnouncement=()=>run(()=>rpc('academy_publish_announcement',{p_academy_id:academyId,p_title:announcementTitle,p_body:announcementBody,p_audience:announcementAudience,p_group_id:null}),'Academy announcement published.');
  const createGuardian=()=>run(()=>rpc('academy_create_guardian_link',{p_academy_id:academyId,p_athlete_user_id:guardianAthlete,p_guardian_user_id:guardianUser,p_relationship:guardianRelationship}),'Guardian invitation created. Both guardian and athlete must approve.');
  const guardianAccept=(row:any)=>run(()=>rpc('academy_accept_guardian_link',{p_link_id:row.id}),'Guardian accepted. Athlete approval is still required.');
  const guardianApprove=(row:any)=>run(()=>rpc('academy_approve_guardian_link',{p_link_id:row.id,p_scopes:guardianScopes}),'Guardian access activated with selected scopes.');
  const guardianRevoke=(row:any)=>run(()=>rpc('academy_revoke_guardian_link',{p_link_id:row.id}),'Guardian access revoked.');
  const requestSeat=(type='additional')=>run(()=>rpc('academy_request_coach_seat',{p_academy_id:academyId,p_request_type:type}),'Coach seat request submitted.');
  const reviewSeat=(row:any,approve:boolean)=>run(()=>rpc('academy_review_coach_seat_request',{p_request_id:row.id,p_approve:approve}),approve?'Seat request reviewed.':'Seat request rejected.');
  const savePrefs=()=>run(async()=>{const {error}=await supabase.from('academy_notification_preferences').upsert({academy_id:academyId,user_id:userId,...notificationPrefs,updated_at:new Date().toISOString()},{onConflict:'academy_id,user_id'});return {error};},'Notification preferences saved.');
  const assignRole=()=>run(()=>rpc('academy_set_staff_assignment',{p_academy_id:academyId,p_user_id:staffUser,p_role_key:staffRole,p_permissions:permissionSets[staffRole]||[] }),'Staff permissions assigned.');
  const removeRole=(row:any)=>run(()=>rpc('academy_remove_staff_assignment',{p_academy_id:academyId,p_user_id:row.user_id}),'Staff permissions removed.');
  const csvCell=(v:any)=>'"'+String(v??'').replace(/"/g,'""')+'"';
  const exportReport=async()=>{
    if(!academyId)return;setBusy(true);
    try{
      let rows:any[]=[];let headers:string[]=[];
      if(reportType==='athletes'||reportType==='coaches'){
        const role=reportType==='athletes'?'athlete':'coach';rows=members.filter(x=>x.role===role).map(x=>({name:x.full_name||x.username||'',user_id:x.user_id,role:x.role,status:x.status}));headers=['name','user_id','role','status'];
      }else if(reportType==='attendance'){rows=coachAttendance.map(x=>({coach:memberName(x.coach_user_id),date:x.attendance_date,status:x.status,note:x.note||''}));headers=['coach','date','status','note'];}
      else if(reportType==='fees'){rows=invoices.map(x=>({athlete:memberName(x.athlete_user_id),title:x.title,amount:x.amount,due_date:x.due_date,status:x.status}));headers=['athlete','title','amount','due_date','status'];}
      else if(reportType==='achievements'){const q=await supabase.from('medals').select('user_id,event_name,medal_type,awarded_at').in('user_id',members.filter(x=>x.role==='athlete').map(x=>x.user_id));rows=q.data||[];headers=['user_id','event_name','medal_type','awarded_at'];}
      else if(reportType==='competitions'){const q=await supabase.from('tournaments').select('user_id,name,starts_at,location,status,result').in('user_id',members.filter(x=>x.role==='athlete').map(x=>x.user_id));rows=q.data||[];headers=['user_id','name','starts_at','location','status','result'];}
      const csv=[headers.join(','),...rows.map(r=>headers.map(h=>csvCell(r[h])).join(','))].join('\n');
      const {error}=await rpc('academy_record_report_export',{p_academy_id:academyId,p_report_type:reportType,p_format:'csv',p_filters:{rows:rows.length}});
      if(error)throw error; await Share.share({title:'AthleteN '+reportType+' report',message:csv}); await load();
    }catch(e:any){Alert.alert('Export unavailable',e?.message||'Check report permissions.');}finally{setBusy(false);}
  };
  const titleStyle:any={color:c.text,fontSize:22,fontWeight:'900'};const hintStyle:any={color:c.muted,fontSize:10,lineHeight:16};

  return <Screen>
    <View style={{flexDirection:'row',alignItems:'center',justifyContent:'space-between',marginBottom:12}}>
      <View style={{flex:1}}><Text style={{color:c.accentBright,fontSize:8,fontWeight:'900',letterSpacing:1.3}}>ATHLETEN · OPERATIONS</Text><Text style={{color:c.text,fontSize:23,fontWeight:'900',marginTop:3}}>Academy Management Suite</Text></View>
      <View style={{flexDirection:'row',gap:8}}><RefreshButton onPress={()=>void refresh()} busy={refreshing}/><Pressable onPress={()=>router.back()} style={{padding:10,backgroundColor:c.surface,borderRadius:10}}><Text style={{color:c.text}}>Back</Text></Pressable></View>
    </View>
    {error?<Card style={{borderColor:'#8b3a45'}}><Text style={{color:'#ff8f9f',fontSize:10,fontWeight:'900'}}>ACCESS / DATA NOTE</Text><Text style={{color:c.text,fontSize:9,marginTop:4}}>{error}</Text></Card>:null}
    <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{marginBottom:12}} contentContainerStyle={{gap:7}}>
      {sections.map(x=><Pressable key={x.id} onPress={()=>setSection(x.id)} style={{paddingHorizontal:13,paddingVertical:9,borderRadius:12,backgroundColor:section===x.id?c.accent:c.surface,borderWidth:1,borderColor:section===x.id?c.accent:c.border}}><Text style={{color:section===x.id?'#fff':c.text,fontSize:9,fontWeight:'900'}}>{x.label}</Text></Pressable>)}
    </ScrollView>

    {section==='fees'?<View style={{gap:9}}>
      <Text style={titleStyle}>Academy fee management</Text><Text style={hintStyle}>Create invoices and record payments received outside AthleteN. This is not online payment collection.</Text>
      <Card><Text style={{color:c.text,fontSize:13,fontWeight:'900'}}>New invoice</Text><Field label="ATHLETE USER ID" value={feeAthlete} onChangeText={setFeeAthlete} placeholder="Paste active Academy athlete ID"/><Field label="FEE TITLE" value={feeTitle} onChangeText={setFeeTitle}/><Field label="AMOUNT (INR)" value={feeAmount} onChangeText={setFeeAmount} keyboardType="decimal-pad" placeholder="1500"/><Field label="DUE DATE" value={feeDue} onChangeText={setFeeDue} placeholder="YYYY-MM-DD"/><Field label="DESCRIPTION" value={feeDescription} onChangeText={setFeeDescription} placeholder="Monthly tuition"/><Button title="CREATE INVOICE" onPress={createInvoice} busy={busy}/></Card>
      {invoices.map(x=><Card key={x.id}><Text style={{color:c.text,fontSize:12,fontWeight:'900'}}>{x.title} · {memberName(x.athlete_user_id)}</Text><Text style={hintStyle}>{money(x.amount)} · Due {x.due_date||'not set'} · {x.status}</Text>{payments.filter(p=>p.invoice_id===x.id).map(p=><Text key={p.id} style={{color:c.muted,fontSize:8,marginTop:4}}>Received {money(p.amount)} via {p.method.replace('_',' ')} · {new Date(p.received_at).toLocaleDateString('en-IN')}</Text>)}{!['paid','cancelled'].includes(x.status)?<View style={{gap:6,marginTop:8}}><Field label="RECEIVED AMOUNT" value={paymentAmounts[x.id]||''} onChangeText={v=>setPaymentAmounts((p:any)=>({...p,[x.id]:v}))} keyboardType="decimal-pad" placeholder="Amount received"/><View style={{flexDirection:'row',gap:7,flexWrap:'wrap'}}>{['cash','bank_transfer','upi_manual','other'].map(m=><Pressable key={m} onPress={()=>setPaymentMethods((p:any)=>({...p,[x.id]:m}))} style={{padding:7,borderRadius:8,backgroundColor:(paymentMethods[x.id]||'upi_manual')===m?c.accent:c.surface}}><Text style={{color:c.text,fontSize:8}}>{m.replace('_',' ')}</Text></Pressable>)}</View><Button title="RECORD MANUAL PAYMENT" onPress={()=>recordPayment(x)} busy={busy} secondary/></View>:null}</Card>)}
    </View>:null}

    {section==='coach'?<View style={{gap:9}}>
      <Text style={titleStyle}>Coach attendance & availability</Text><Text style={hintStyle}>Coaches can record their own attendance and availability. Academy staff with matching permissions can oversee records.</Text>
      <Card><Text style={{color:c.text,fontWeight:'900'}}>Record my attendance</Text><Field label="DATE" value={coachDate} onChangeText={setCoachDate}/><View style={{flexDirection:'row',gap:7,flexWrap:'wrap'}}>{['present','absent','late','leave'].map(x=><Pressable key={x} onPress={()=>setCoachStatus(x)} style={{padding:8,borderRadius:8,backgroundColor:coachStatus===x?c.accent:c.surface}}><Text style={{color:c.text,fontSize:9}}>{x}</Text></Pressable>)}</View><Button title="SAVE ATTENDANCE" onPress={markAttendance} busy={busy}/></Card>
      <Card><Text style={{color:c.text,fontWeight:'900'}}>Set my availability</Text><Field label="WEEKDAY (0=SUN … 6=SAT)" value={availabilityDay} onChangeText={setAvailabilityDay} keyboardType="number-pad"/><Field label="START (HH:MM)" value={availabilityStart} onChangeText={setAvailabilityStart}/><Field label="END (HH:MM)" value={availabilityEnd} onChangeText={setAvailabilityEnd}/><View style={{flexDirection:'row',gap:7,flexWrap:'wrap'}}>{['available','unavailable'].map(x=><Pressable key={x} onPress={()=>setAvailabilityType(x)} style={{padding:8,borderRadius:8,backgroundColor:availabilityType===x?c.accent:c.surface}}><Text style={{color:c.text,fontSize:9}}>{x}</Text></Pressable>)}</View><Button title="SAVE AVAILABILITY" onPress={addAvailability} busy={busy} secondary/></Card>
      {coachAttendance.slice(0,25).map(x=><Card key={x.id}><Text style={{color:c.text,fontWeight:'900'}}>{memberName(x.coach_user_id)} · {x.status}</Text><Text style={hintStyle}>{x.attendance_date}</Text></Card>)}
      {availability.slice(0,25).map(x=><Card key={x.id}><Text style={{color:c.text,fontWeight:'900'}}>{memberName(x.coach_user_id)} · {['Sun','Mon','Tue','Wed','Thu','Fri','Sat'][x.weekday]} {String(x.starts_at).slice(0,5)}–{String(x.ends_at).slice(0,5)}</Text><Text style={hintStyle}>{x.availability_type}</Text></Card>)}
    </View>:null}

    {section==='transfers'?<View style={{gap:9}}>
      <Text style={titleStyle}>Athlete transfer workflow</Text><Text style={hintStyle}>The athlete starts a transfer; the current Coach, target Coach and Academy must approve in sequence.</Text>
      <Card><Text style={{color:c.text,fontWeight:'900'}}>Request a Coach change (athlete account)</Text><Field label="TARGET COACH USER ID" value={transferCoach} onChangeText={setTransferCoach} placeholder="Active Coach user ID"/><Field label="REASON (OPTIONAL)" value={transferReason} onChangeText={setTransferReason}/><Button title="REQUEST TRANSFER" onPress={requestTransfer} busy={busy}/></Card>
      {transfers.map(x=><Card key={x.id}><Text style={{color:c.text,fontWeight:'900'}}>{memberName(x.athlete_user_id)} · {x.status.replaceAll('_',' ')}</Text><Text style={hintStyle}>From {memberName(x.from_coach_user_id)} → {memberName(x.to_coach_user_id)}</Text>{x.status==='pending_current_coach'&&userId===x.from_coach_user_id?<View style={{flexDirection:'row',gap:7,flexWrap:'wrap'}}><Button title="RELEASE" onPress={()=>reviewTransfer(x,'release')} busy={busy}/><Button title="REJECT" onPress={()=>reviewTransfer(x,'reject')} busy={busy} secondary/></View>:null}{x.status==='pending_target_coach'&&userId===x.to_coach_user_id?<View style={{flexDirection:'row',gap:7,flexWrap:'wrap'}}><Button title="ACCEPT" onPress={()=>reviewTransfer(x,'accept')} busy={busy}/><Button title="REJECT" onPress={()=>reviewTransfer(x,'reject')} busy={busy} secondary/></View>:null}{x.status==='pending_academy_review'&&isAdmin?<View style={{flexDirection:'row',gap:7,flexWrap:'wrap'}}><Button title="APPROVE" onPress={()=>reviewTransfer(x,'approve')} busy={busy}/><Button title="REJECT" onPress={()=>reviewTransfer(x,'reject')} busy={busy} secondary/></View>:null}{x.athlete_user_id===userId&&!['approved','rejected','withdrawn'].includes(x.status)?<Button title="WITHDRAW REQUEST" onPress={()=>reviewTransfer(x,'withdraw')} busy={busy} secondary/>:null}</Card>)}
    </View>:null}

    {section==='announcements'?<View style={{gap:9}}>
      <Text style={titleStyle}>Academy announcements</Text><Text style={hintStyle}>Publish to active Academy members. Delivery also follows the account's notification preferences.</Text>
      <Card><Field label="TITLE" value={announcementTitle} onChangeText={setAnnouncementTitle}/><Field label="MESSAGE" value={announcementBody} onChangeText={setAnnouncementBody}/><View style={{flexDirection:'row',gap:7,flexWrap:'wrap'}}>{['all','athletes','coaches'].map(x=><Pressable key={x} onPress={()=>setAnnouncementAudience(x)} style={{padding:8,borderRadius:8,backgroundColor:announcementAudience===x?c.accent:c.surface}}><Text style={{color:c.text,fontSize:9}}>{x}</Text></Pressable>)}</View><Button title="PUBLISH ANNOUNCEMENT" onPress={publishAnnouncement} busy={busy}/></Card>
      {announcements.map(x=><Card key={x.id}><Text style={{color:c.text,fontWeight:'900'}}>{x.title}</Text><Text style={hintStyle}>{x.audience} · {x.published_at?'Published':'Draft'}</Text><Text style={{color:c.text,fontSize:10,marginTop:5}}>{x.body}</Text></Card>)}
    </View>:null}

    {section==='guardians'?<View style={{gap:9}}>
      <Text style={titleStyle}>Parent / guardian portal</Text><Text style={hintStyle}>Invitations target an existing AthleteN account. Guardian acceptance and athlete approval are both required. This workflow is not legal identity verification; production use requires an adult-authorized consent review.</Text>
      {academyId?<Card><Field label="ATHLETE USER ID" value={guardianAthlete} onChangeText={setGuardianAthlete}/><Field label="GUARDIAN ACCOUNT USER ID" value={guardianUser} onChangeText={setGuardianUser}/><View style={{flexDirection:'row',gap:7,flexWrap:'wrap'}}>{['parent','legal_guardian','caregiver'].map(x=><Pressable key={x} onPress={()=>setGuardianRelationship(x)} style={{padding:7,borderRadius:8,backgroundColor:guardianRelationship===x?c.accent:c.surface}}><Text style={{color:c.text,fontSize:8}}>{x.replace('_',' ')}</Text></Pressable>)}</View><Button title="CREATE GUARDIAN INVITATION" onPress={createGuardian} busy={busy}/></Card>:<Text style={hintStyle}>This account can review and respond to guardian invitations below. Invitation creation is available to authorized Academy staff.</Text>}
      {guardianLinks.map(x=><Card key={x.id}><Text style={{color:c.text,fontWeight:'900'}}>{memberName(x.athlete_user_id)} · {x.relationship}</Text><Text style={hintStyle}>Guardian account {x.guardian_user_id} · {x.status.replaceAll('_',' ')}</Text>{x.guardian_user_id===userId&&x.status==='pending_guardian'?<Button title="ACCEPT INVITATION" onPress={()=>guardianAccept(x)} busy={busy}/>:null}{x.athlete_user_id===userId&&x.status==='pending_athlete'?<View style={{gap:7}}><View style={{flexDirection:'row',gap:7,flexWrap:'wrap'}}>{['announcements','calendar','attendance_summary','fee_status'].map(s=><Pressable key={s} onPress={()=>setGuardianScopes(p=>p.includes(s)?p.filter(q=>q!==s):[...p,s])} style={{padding:8,borderRadius:8,backgroundColor:guardianScopes.includes(s)?c.accent:c.surface}}><Text style={{color:c.text,fontSize:8}}>{guardianScopes.includes(s)?'✓ ':''}{s.replace('_',' ')}</Text></Pressable>)}</View><Button title="APPROVE SELECTED SCOPES" onPress={()=>guardianApprove(x)} busy={busy}/></View>:null}{x.guardian_user_id===userId&&x.status==='active'?<Button title="OPEN GUARDIAN SUMMARY" onPress={()=>run(()=>rpc('academy_guardian_portal_summary',{p_link_id:x.id}).then((r:any)=>{if(r.error)throw r.error;Alert.alert('Guardian Summary',JSON.stringify(r.data));return {data:r.data}}),'')}/>:null}{x.athlete_user_id===userId&&x.status==='active'?<Button title="REVOKE GUARDIAN ACCESS" onPress={()=>guardianRevoke(x)} busy={busy} secondary/>:null}</Card>)}
    </View>:null}

    {section==='reports'?<View style={{gap:9}}>
      <Text style={titleStyle}>Academy reports</Text><Text style={hintStyle}>Share CSV reports using only data your current account can read. Each export is logged.</Text>
      <Card><View style={{flexDirection:'row',gap:7,flexWrap:'wrap'}}>{['athletes','coaches','attendance','fees','competitions','achievements'].map(x=><Pressable key={x} onPress={()=>setReportType(x)} style={{padding:8,borderRadius:8,backgroundColor:reportType===x?c.accent:c.surface}}><Text style={{color:c.text,fontSize:9}}>{x}</Text></Pressable>)}</View><Button title="SHARE CSV REPORT" onPress={exportReport} busy={busy}/></Card>
      {reportExports.slice(0,20).map(x=><Card key={x.id}><Text style={{color:c.text,fontWeight:'900'}}>{x.report_type.toUpperCase()} · {x.format.toUpperCase()}</Text><Text style={hintStyle}>{new Date(x.created_at).toLocaleString('en-IN')}</Text></Card>)}
    </View>:null}

    {section==='seats'?<View style={{gap:9}}>
      <Text style={titleStyle}>Coach seats & subscription capacity</Text><Text style={hintStyle}>Coach requests require Academy review. Additional paid seats stay payment_pending until a verified billing provider confirms payment.</Text>
      <Card><Button title="REQUEST ADDITIONAL COACH SEAT" onPress={()=>requestSeat('additional')} busy={busy}/><Button title="REQUEST MY SEAT REMOVAL" onPress={()=>requestSeat('remove')} busy={busy} secondary/></Card>
      {seatRequests.map(x=><Card key={x.id}><Text style={{color:c.text,fontWeight:'900'}}>{memberName(x.coach_user_id)} · {x.request_type}</Text><Text style={hintStyle}>{x.status.replaceAll('_',' ')}</Text>{isAdmin&&x.status==='pending'?<View style={{flexDirection:'row',gap:7,flexWrap:'wrap'}}><Button title="APPROVE" onPress={()=>reviewSeat(x,true)} busy={busy}/><Button title="REJECT" onPress={()=>reviewSeat(x,false)} busy={busy} secondary/></View>:null}</Card>)}
    </View>:null}

    {section==='notifications'?<View style={{gap:9}}>
      <Text style={titleStyle}>Academy notification preferences</Text><Text style={hintStyle}>These are in-app Academy preferences. Android/iOS permission settings are separate.</Text>
      <Card>{Object.keys(notificationPrefs).map(key=><Pressable key={key} onPress={()=>setNotificationPrefs((p:any)=>({...p,[key]:!p[key]}))} style={{flexDirection:'row',justifyContent:'space-between',paddingVertical:12,borderBottomWidth:1,borderColor:c.border}}><Text style={{color:c.text,fontSize:11,fontWeight:'800'}}>{key.replace('_',' ')}</Text><Text style={{color:notificationPrefs[key]?c.accentBright:c.muted,fontWeight:'900'}}>{notificationPrefs[key]?'ON':'OFF'}</Text></Pressable>)}<Button title="SAVE NOTIFICATION SETTINGS" onPress={savePrefs} busy={busy}/></Card>
    </View>:null}

    {section==='roles'?<View style={{gap:9}}>
      <Text style={titleStyle}>Academy roles & permissions</Text><Text style={hintStyle}>Assign additional capabilities to an active Coach. This does not change the Coach's account role or confer Academy ownership.</Text>
      <Card><Field label="COACH USER ID" value={staffUser} onChangeText={setStaffUser}/><View style={{flexDirection:'row',gap:7,flexWrap:'wrap'}}>{['manager','operations','finance','communications'].map(x=><Pressable key={x} onPress={()=>setStaffRole(x)} style={{padding:8,borderRadius:8,backgroundColor:staffRole===x?c.accent:c.surface}}><Text style={{color:c.text,fontSize:9}}>{x}</Text></Pressable>)}</View><Text style={hintStyle}>Permissions: {(permissionSets[staffRole]||[]).join(', ')}</Text><Button title="SAVE STAFF PERMISSIONS" onPress={assignRole} busy={busy}/></Card>
      {staffAssignments.map(x=><Card key={x.id}><Text style={{color:c.text,fontWeight:'900'}}>{memberName(x.user_id)} · {x.role_key}</Text><Text style={hintStyle}>{x.permissions.join(', ')}</Text><Button title="REMOVE ASSIGNMENT" onPress={()=>removeRole(x)} busy={busy} secondary/></Card>)}
    </View>:null}

    {section==='audit'?<View style={{gap:9}}>
      <Text style={titleStyle}>Academy audit log</Text><Text style={hintStyle}>Append-only action history. It records action names and changed field names, not private values.</Text>
      {auditRows.length?auditRows.map(x=><Card key={x.id}><Text style={{color:c.text,fontWeight:'900'}}>{x.action.toUpperCase()} · {x.entity_type}</Text><Text style={hintStyle}>{x.actor_user_id||'System'} · {new Date(x.created_at).toLocaleString('en-IN')}</Text><Text style={hintStyle}>Changed: {(x.changed_fields||[]).join(', ')||'—'}</Text></Card>):<Card><Text style={{color:c.text,fontWeight:'900'}}>No audit events or permission unavailable</Text></Card>}
    </View>:null}
    <View style={{height:35}}/>
  </Screen>;
}
