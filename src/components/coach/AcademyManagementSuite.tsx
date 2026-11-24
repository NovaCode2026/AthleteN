import { useCallback, useEffect, useState } from "react";
import { supabase } from "../../lib/supabase";
import type { Profile } from "../../types";
import "./academy-management-suite.css";

type Props = {
  profile: Profile;
  setToast: (toast: { type: "success" | "error" | "warning"; message: string } | null) => void;
};
const rolePermissions: Record<string,string[]> = {
  manager:["fees.manage","coaches.manage","attendance.manage","transfers.review","announcements.publish","guardians.manage","reports.export","seats.manage","members.manage","audit.read","notifications.manage"],
  operations:["coaches.manage","attendance.manage","transfers.review","announcements.publish","reports.export","notifications.manage"],
  finance:["fees.manage","reports.export"],
  communications:["announcements.publish","guardians.manage","notifications.manage"]
};
const amount=(v:unknown)=>"₹"+Number(v||0).toLocaleString("en-IN",{maximumFractionDigits:2});

export default function AcademyManagementSuite({profile,setToast}:Props){
  const academyId=profile.academy_id||null;
  const userId=profile.user_id;
  const isAdmin=profile.role==="academy_admin"||profile.role==="academy";
  const [section,setSection]=useState("fees");
  const [busy,setBusy]=useState(false);
  const [members,setMembers]=useState<any[]>([]);
  const [invoices,setInvoices]=useState<any[]>([]);
  const [attendance,setAttendance]=useState<any[]>([]);
  const [availability,setAvailability]=useState<any[]>([]);
  const [transfers,setTransfers]=useState<any[]>([]);
  const [announcements,setAnnouncements]=useState<any[]>([]);
  const [guardians,setGuardians]=useState<any[]>([]);
  const [exports,setExports]=useState<any[]>([]);
  const [seats,setSeats]=useState<any[]>([]);
  const [staff,setStaff]=useState<any[]>([]);
  const [prefs,setPrefs]=useState<any>({announcements:true,fees:true,transfers:true,seat_updates:true,reports:true});
  const [audit,setAudit]=useState<any[]>([]);
  const [fee,setFee]=useState<any>({athlete:"",title:"Monthly training fee",amount:"",due:"",description:""});
  const [coachRecord,setCoachRecord]=useState<any>({date:new Date().toISOString().slice(0,10),status:"present",weekday:"1",start:"16:00",end:"19:00",availability:"available"});
  const [transfer,setTransfer]=useState<any>({target:"",reason:""});
  const [announcement,setAnnouncement]=useState<any>({title:"",body:"",audience:"all"});
  const [guardian,setGuardian]=useState<any>({athlete:"",user:"",relationship:"parent",scopes:["announcements","calendar"]});
  const [staffForm,setStaffForm]=useState<any>({user:"",role:"operations"});
  const [reportType,setReportType]=useState("athletes");
  const [paymentAmount,setPaymentAmount]=useState<Record<string,string>>({});
  const [paymentMethod,setPaymentMethod]=useState<Record<string,string>>({});

  const memberName=useCallback((id:string)=>members.find(x=>x.user_id===id)?.full_name||members.find(x=>x.user_id===id)?.username||"Member",[members]);
  const load=useCallback(async()=>{
    if(!academyId)return;
    const mq=await supabase.from("academy_memberships").select("user_id,role,status").eq("academy_id",academyId).eq("status","active");
    if(mq.error)throw mq.error;
    const ids=(mq.data||[]).map((x:any)=>x.user_id);
    const pq=ids.length?await supabase.from("profiles").select("user_id,full_name,username").in("user_id",ids):{data:[],error:null};
    const pm=new Map((pq.data||[]).map((x:any)=>[x.user_id,x]));
    setMembers((mq.data||[]).map((x:any)=>({...x,...(pm.get(x.user_id)||{})})));
    const requests=await Promise.all([
      supabase.from("academy_fee_invoices").select("*").eq("academy_id",academyId).order("created_at",{ascending:false}).limit(200),
      supabase.from("academy_coach_attendance").select("*").eq("academy_id",academyId).order("attendance_date",{ascending:false}).limit(100),
      supabase.from("academy_coach_availability").select("*").eq("academy_id",academyId).order("weekday"),
      supabase.from("academy_athlete_transfer_requests").select("*").eq("academy_id",academyId).order("created_at",{ascending:false}).limit(100),
      supabase.from("academy_announcements").select("*").eq("academy_id",academyId).order("created_at",{ascending:false}).limit(100),
      supabase.from("academy_guardian_links").select("*").eq("academy_id",academyId).order("created_at",{ascending:false}).limit(100),
      supabase.from("academy_report_exports").select("*").eq("academy_id",academyId).order("created_at",{ascending:false}).limit(100),
      supabase.from("academy_seat_requests").select("*").eq("academy_id",academyId).order("created_at",{ascending:false}).limit(100),
      supabase.from("academy_staff_assignments").select("*").eq("academy_id",academyId).order("created_at",{ascending:false}),
      supabase.from("academy_audit_log").select("*").eq("academy_id",academyId).order("created_at",{ascending:false}).limit(150),
      supabase.from("academy_notification_preferences").select("*").eq("academy_id",academyId).eq("user_id",userId).maybeSingle()
    ]);
    const setters=[setInvoices,setAttendance,setAvailability,setTransfers,setAnnouncements,setGuardians,setExports,setSeats,setStaff,setAudit];
    requests.slice(0,10).forEach((r:any,i)=>{if(!r.error)setters[i](r.data||[])});
    if(requests[10].data)setPrefs(requests[10].data);
  },[academyId,userId]);
  useEffect(()=>{void load().catch(e=>setToast({type:"error",message:e instanceof Error?e.message:"Academy operations could not load."}))},[load,setToast]);

  async function run(action:()=>Promise<any>,message:string){
    setBusy(true);
    try{const result=await action();if(result?.error)throw result.error;setToast({type:"success",message});await load();}
    catch(e){setToast({type:"error",message:e instanceof Error?e.message:"The action could not be completed."})}
    finally{setBusy(false)}
  }
  const rpc=(name:string,args:any)=>supabase.rpc(name,args);
  const createFee=()=>run(()=>rpc("academy_create_fee_invoice",{p_academy_id:academyId,p_athlete_user_id:fee.athlete,p_title:fee.title,p_amount:Number(fee.amount),p_due_date:fee.due||null,p_description:fee.description||null}),"Fee invoice created. Payment recording remains manual.");
  const addPayment=(invoice:any)=>run(()=>rpc("academy_record_fee_payment",{p_invoice_id:invoice.id,p_amount:Number(paymentAmount[invoice.id]),p_method:paymentMethod[invoice.id]||"upi_manual",p_reference:null}),"Manual payment entry recorded.");
  const saveCoachAttendance=()=>run(()=>supabase.from("academy_coach_attendance").upsert({academy_id:academyId,coach_user_id:userId,attendance_date:coachRecord.date,status:coachRecord.status,recorded_by:userId},{onConflict:"academy_id,coach_user_id,attendance_date"}),"Coach attendance saved.");
  const saveAvailability=()=>run(()=>supabase.from("academy_coach_availability").upsert({academy_id:academyId,coach_user_id:userId,weekday:Number(coachRecord.weekday),starts_at:coachRecord.start,ends_at:coachRecord.end,availability_type:coachRecord.availability},{onConflict:"academy_id,coach_user_id,weekday,starts_at,ends_at"}),"Coach availability saved.");
  const requestTransfer=()=>run(()=>rpc("academy_request_athlete_transfer",{p_academy_id:academyId,p_to_coach_user_id:transfer.target,p_reason:transfer.reason||null}),"Transfer request submitted.");
  const reviewTransfer=(row:any,action:string)=>run(()=>rpc("academy_review_athlete_transfer",{p_request_id:row.id,p_action:action}),"Transfer status updated.");
  const publish=()=>run(()=>rpc("academy_publish_announcement",{p_academy_id:academyId,p_title:announcement.title,p_body:announcement.body,p_audience:announcement.audience,p_group_id:null}),"Academy announcement published.");
  const createGuardian=()=>run(()=>rpc("academy_create_guardian_link",{p_academy_id:academyId,p_athlete_user_id:guardian.athlete,p_guardian_user_id:guardian.user,p_relationship:guardian.relationship}),"Guardian invitation created; guardian and athlete approval are required.");
  const acceptGuardian=(row:any)=>run(()=>rpc("academy_accept_guardian_link",{p_link_id:row.id}),"Guardian invitation accepted.");
  const approveGuardian=(row:any)=>run(()=>rpc("academy_approve_guardian_link",{p_link_id:row.id,p_scopes:guardian.scopes}),"Guardian scopes approved.");
  const requestSeat=(type="additional")=>run(()=>rpc("academy_request_coach_seat",{p_academy_id:academyId,p_request_type:type}),"Coach seat request submitted.");
  const reviewSeat=(row:any,approved:boolean)=>run(()=>rpc("academy_review_coach_seat_request",{p_request_id:row.id,p_approve:approved}),approved?"Seat request reviewed.":"Seat request rejected.");
  const savePrefs=()=>run(()=>supabase.from("academy_notification_preferences").upsert({academy_id:academyId,user_id:userId,...prefs,updated_at:new Date().toISOString()},{onConflict:"academy_id,user_id"}),"Notification preferences saved.");
  const assignStaff=()=>run(()=>rpc("academy_set_staff_assignment",{p_academy_id:academyId,p_user_id:staffForm.user,p_role_key:staffForm.role,p_permissions:rolePermissions[staffForm.role]}),"Staff permissions saved.");
  const removeStaff=(row:any)=>run(()=>rpc("academy_remove_staff_assignment",{p_academy_id:academyId,p_user_id:row.user_id}),"Staff permissions removed.");

  async function exportCsv(){
    if(!academyId)return;
    setBusy(true);
    try{
      let rows:any[]=[];let headers:string[]=[];
      if(["athletes","coaches"].includes(reportType)){
        const role=reportType==="athletes"?"athlete":"coach";
        rows=members.filter(x=>x.role===role).map(x=>({name:x.full_name||x.username||"",user_id:x.user_id,role:x.role,status:x.status}));
        headers=["name","user_id","role","status"];
      }else if(reportType==="attendance"){rows=attendance.map(x=>({coach:memberName(x.coach_user_id),date:x.attendance_date,status:x.status}));headers=["coach","date","status"]}
      else if(reportType==="fees"){rows=invoices.map(x=>({athlete:memberName(x.athlete_user_id),title:x.title,amount:x.amount,due_date:x.due_date,status:x.status}));headers=["athlete","title","amount","due_date","status"]}
      else if(reportType==="competitions"){
        const q=await supabase.from("tournaments").select("user_id,name,starts_at,location,status,result").in("user_id",members.filter(x=>x.role==="athlete").map(x=>x.user_id));
        if(q.error)throw q.error;rows=q.data||[];headers=["user_id","name","starts_at","location","status","result"];
      }else if(reportType==="achievements"){
        const q=await supabase.from("medals").select("user_id,event_name,medal_type,awarded_at").in("user_id",members.filter(x=>x.role==="athlete").map(x=>x.user_id));
        if(q.error)throw q.error;rows=q.data||[];headers=["user_id","event_name","medal_type","awarded_at"];
      }
      const quote=(v:any)=>'"'+String(v??"").replace(/"/g,'""')+'"';
      const csv=[headers.join(","),...rows.map(row=>headers.map(key=>quote(row[key])).join(","))].join("\r\n");
      const log=await rpc("academy_record_report_export",{p_academy_id:academyId,p_report_type:reportType,p_format:"csv",p_filters:{rows:rows.length}});
      if(log.error)throw log.error;
      const blob=new Blob(["\uFEFF"+csv],{type:"text/csv;charset=utf-8"});
      const url=URL.createObjectURL(blob);
      const a=document.createElement("a");a.href=url;a.download="athleten-"+reportType+"-"+new Date().toISOString().slice(0,10)+".csv";a.click();URL.revokeObjectURL(url);
      setToast({type:"success",message:"CSV export created and logged."});await load();
    }catch(e){setToast({type:"error",message:e instanceof Error?e.message:"CSV export failed."})}
    finally{setBusy(false)}
  }
  const toggleScope=(key:string)=>setGuardian(p=>({...p,scopes:p.scopes.includes(key)?p.scopes.filter((x:string)=>x!==key):[...p.scopes,key]}));
  const input=(label:string,value:string,onChange:(v:string)=>void,placeholder="")=><label className="academy-suite-field"><span>{label}</span><input value={value} onChange={e=>onChange(e.target.value)} placeholder={placeholder}/></label>;
  const button=(label:string,onClick:()=>void,secondary=false)=><button type="button" disabled={busy} className={"btn "+(secondary?"":"primary")} onClick={onClick}>{label}</button>;

  if(!academyId)return <section className="card panel"><h3>Academy workspace required</h3><p>Join or create an Academy before opening its management suite.</p></section>;
  return <section className="academy-management-suite">
    <div className="panel-head"><div><span className="eyebrow">ACADEMY OPERATIONS</span><h3>Management Suite</h3><p>Fees, Coach operations, transfers, guardians, reports, seats and governance.</p></div><button className="btn" type="button" disabled={busy} onClick={()=>void load()}>Refresh</button></div>
    <nav className="academy-suite-tabs">{["fees","coach","transfers","announcements","guardians","reports","seats","notifications","roles","audit"].map(id=><button key={id} type="button" className={section===id?"active":""} onClick={()=>setSection(id)}>{id.replace("_"," ")}</button>)}</nav>

    {section==="fees"&&<div className="grid two">
      <article className="card panel"><h3>Fee invoices</h3><p>Create Academy fee invoices for active athletes. This records amounts due; it does not collect payments online.</p>{input("Athlete user ID",fee.athlete,v=>setFee(p=>({...p,athlete:v})))}{input("Invoice title",fee.title,v=>setFee(p=>({...p,title:v})))}{input("Amount (INR)",fee.amount,v=>setFee(p=>({...p,amount:v})),"1500")}{input("Due date",fee.due,v=>setFee(p=>({...p,due:v})),"YYYY-MM-DD")}{input("Description",fee.description,v=>setFee(p=>({...p,description:v})))}{button("Create invoice",createFee)}</article>
      <article className="card panel"><h3>Invoices and payments</h3>{invoices.map(x=><div className="academy-suite-row" key={x.id}><strong>{x.title} · {memberName(x.athlete_user_id)}</strong><span>{amount(x.amount)} · {x.status} · {x.due_date||"No due date"}</span>{!["paid","cancelled"].includes(x.status)&&<div className="inline-actions"><input aria-label="Payment amount" value={paymentAmount[x.id]||""} onChange={e=>setPaymentAmount(p=>({...p,[x.id]:e.target.value}))} placeholder="Amount received"/><select value={paymentMethod[x.id]||"upi_manual"} onChange={e=>setPaymentMethod(p=>({...p,[x.id]:e.target.value}))}><option value="cash">Cash</option><option value="bank_transfer">Bank transfer</option><option value="upi_manual">UPI recorded manually</option><option value="other">Other</option></select>{button("Record payment",()=>addPayment(x),true)}</div>}</div>)}</article>
    </div>}

    {section==="coach"&&<div className="grid two">
      <article className="card panel"><h3>Coach attendance</h3><p>Coaches may record their own attendance; authorized Academy staff can oversee records.</p>{input("Date",coachRecord.date,v=>setCoachRecord(p=>({...p,date:v})))}<select value={coachRecord.status} onChange={e=>setCoachRecord(p=>({...p,status:e.target.value}))}><option>present</option><option>absent</option><option>late</option><option>leave</option></select>{button("Save my attendance",saveCoachAttendance)}</article>
      <article className="card panel"><h3>Coach availability</h3><label>Weekday<select value={coachRecord.weekday} onChange={e=>setCoachRecord(p=>({...p,weekday:e.target.value}))}>{["Sunday","Monday","Tuesday","Wednesday","Thursday","Friday","Saturday"].map((x,i)=><option key={x} value={i}>{x}</option>)}</select></label>{input("Start time",coachRecord.start,v=>setCoachRecord(p=>({...p,start:v})))}{input("End time",coachRecord.end,v=>setCoachRecord(p=>({...p,end:v})))}<select value={coachRecord.availability} onChange={e=>setCoachRecord(p=>({...p,availability:e.target.value}))}><option value="available">Available</option><option value="unavailable">Unavailable</option></select>{button("Save availability",saveAvailability)}</article>
      <article className="card panel"><h3>Attendance history</h3>{attendance.map(x=><p key={x.id}>{memberName(x.coach_user_id)} · {x.attendance_date} · {x.status}</p>)}</article>
      <article className="card panel"><h3>Availability</h3>{availability.map(x=><p key={x.id}>{memberName(x.coach_user_id)} · Day {x.weekday} · {x.starts_at}–{x.ends_at} · {x.availability_type}</p>)}</article>
    </div>}

    {section==="transfers"&&<div className="grid two">
      <article className="card panel"><h3>Athlete-requested transfer</h3><p>Only the athlete can initiate. Current Coach, target Coach and Academy approval are required.</p>{input("Target Coach user ID",transfer.target,v=>setTransfer(p=>({...p,target:v})))}{input("Reason (optional)",transfer.reason,v=>setTransfer(p=>({...p,reason:v})))}{button("Request transfer",requestTransfer)}</article>
      <article className="card panel"><h3>Transfer queue</h3>{transfers.map(x=><div className="academy-suite-row" key={x.id}><strong>{memberName(x.athlete_user_id)}</strong><span>{memberName(x.from_coach_user_id)} → {memberName(x.to_coach_user_id)} · {x.status}</span><div className="inline-actions">{x.status==="pending_current_coach"&&userId===x.from_coach_user_id&&<>{button("Release",()=>reviewTransfer(x,"release"))}{button("Reject",()=>reviewTransfer(x,"reject"),true)}</>}{x.status==="pending_target_coach"&&userId===x.to_coach_user_id&&<>{button("Accept",()=>reviewTransfer(x,"accept"))}{button("Reject",()=>reviewTransfer(x,"reject"),true)}</>}{x.status==="pending_academy_review"&&isAdmin&&<>{button("Approve",()=>reviewTransfer(x,"approve"))}{button("Reject",()=>reviewTransfer(x,"reject"),true)}</>}</div></div>)}</article>
    </div>}

    {section==="announcements"&&<div className="grid two">
      <article className="card panel"><h3>Academy broadcast</h3><p>Publish to all active Academy members or only athletes / coaches.</p>{input("Title",announcement.title,v=>setAnnouncement(p=>({...p,title:v})))}<label className="academy-suite-field"><span>Message</span><textarea value={announcement.body} onChange={e=>setAnnouncement(p=>({...p,body:e.target.value}))}/></label><select value={announcement.audience} onChange={e=>setAnnouncement(p=>({...p,audience:e.target.value}))}><option value="all">All members</option><option value="athletes">Athletes</option><option value="coaches">Coaches</option></select>{button("Publish announcement",publish)}</article>
      <article className="card panel"><h3>Published notices</h3>{announcements.map(x=><div className="academy-suite-row" key={x.id}><strong>{x.title}</strong><span>{x.audience} · {x.published_at?new Date(x.published_at).toLocaleString():"Draft"}</span><p>{x.body}</p></div>)}</article>
    </div>}

    {section==="guardians"&&<div className="grid two">
      <article className="card panel"><h3>Guardian invitation</h3><p>Invite an existing AthleteN account. Guardian acceptance and athlete consent are both required. This is not identity verification.</p>{input("Athlete user ID",guardian.athlete,v=>setGuardian(p=>({...p,athlete:v})))}{input("Guardian account user ID",guardian.user,v=>setGuardian(p=>({...p,user:v})))}<select value={guardian.relationship} onChange={e=>setGuardian(p=>({...p,relationship:e.target.value}))}><option value="parent">Parent</option><option value="legal_guardian">Legal guardian</option><option value="caregiver">Caregiver</option></select>{button("Create invitation",createGuardian)}</article>
      <article className="card panel"><h3>Guardian consent queue</h3>{guardians.map(x=><div className="academy-suite-row" key={x.id}><strong>{memberName(x.athlete_user_id)} · {x.relationship}</strong><span>{x.guardian_user_id} · {x.status}</span>{x.guardian_user_id===userId&&x.status==="pending_guardian"&&button("Accept invitation",()=>acceptGuardian(x))}{x.athlete_user_id===userId&&x.status==="pending_athlete"&&<div><div className="academy-suite-checks">{["announcements","calendar","attendance_summary","fee_status"].map(scope=><label key={scope}><input type="checkbox" checked={guardian.scopes.includes(scope)} onChange={()=>toggleScope(scope)}/>{scope.replace("_"," ")}</label>)}</div>{button("Approve selected scopes",()=>approveGuardian(x))}</div>}{x.guardian_user_id===userId&&x.status==="active"&&<button type="button" className="btn" onClick={async()=>{const r=await rpc("academy_guardian_portal_summary",{p_link_id:x.id});if(r.error)setToast({type:"error",message:r.error.message});else setToast({type:"success",message:JSON.stringify(r.data)});}}>View guardian summary</button>}</div>)}</article>
    </div>}

    {section==="reports"&&<div className="card panel"><h3>Academy reports</h3><p>Generate a CSV download from records your signed-in account is already allowed to read. Exports are audit-logged.</p><select value={reportType} onChange={e=>setReportType(e.target.value)}>{["athletes","coaches","attendance","fees","competitions","achievements"].map(x=><option key={x}>{x}</option>)}</select>{button("Download CSV report",()=>void exportCsv())}<div className="academy-suite-row">{exports.map(x=><p key={x.id}>{x.report_type} · {x.format} · {new Date(x.created_at).toLocaleString()}</p>)}</div></div>}

    {section==="seats"&&<div className="grid two">
      <article className="card panel"><h3>Coach seat lifecycle</h3><p>Approve requests for included seats. Additional paid seats remain pending until a payment provider confirms settlement.</p>{button("Request an additional seat",()=>requestSeat("additional"))}{button("Request seat removal",()=>requestSeat("remove"),true)}</article>
      <article className="card panel"><h3>Requests</h3>{seats.map(x=><div className="academy-suite-row" key={x.id}><strong>{memberName(x.coach_user_id)}</strong><span>{x.request_type} · {x.status}</span>{isAdmin&&x.status==="pending"&&<div className="inline-actions">{button("Approve",()=>reviewSeat(x,true))}{button("Reject",()=>reviewSeat(x,false),true)}</div>}</div>)}</article>
    </div>}

    {section==="notifications"&&<article className="card panel"><h3>Academy notifications</h3><p>Manage this account's in-app Academy notification preferences. Device-level permission is separate.</p>{Object.keys(prefs).map(key=><label className="academy-suite-check" key={key}><input type="checkbox" checked={Boolean(prefs[key])} onChange={()=>setPrefs((p:any)=>({...p,[key]:!p[key]}))}/>{key.replace("_"," ")}</label>)}{button("Save preferences",()=>void run(()=>supabase.from("academy_notification_preferences").upsert({academy_id:academyId,user_id:userId,...prefs,updated_at:new Date().toISOString()},{onConflict:"academy_id,user_id"}),"Notification preferences saved."))}</article>}

    {section==="roles"&&<div className="grid two">
      <article className="card panel"><h3>Staff roles & permissions</h3><p>Add a scoped responsibility set to an existing Academy Coach. Account role and ownership are unchanged.</p>{input("Coach user ID",staffForm.user,v=>setStaffForm(p=>({...p,user:v})))}<select value={staffForm.role} onChange={e=>setStaffForm(p=>({...p,role:e.target.value}))}>{Object.keys(rolePermissions).map(x=><option key={x}>{x}</option>)}</select><p>{rolePermissions[staffForm.role].join(" · ")}</p>{button("Assign permissions",assignStaff)}</article>
      <article className="card panel"><h3>Current assignments</h3>{staff.map(x=><div className="academy-suite-row" key={x.id}><strong>{memberName(x.user_id)} · {x.role_key}</strong><p>{x.permissions.join(" · ")}</p>{isAdmin&&button("Remove",()=>removeStaff(x),true)}</div>)}</article>
    </div>}

    {section==="audit"&&<article className="card panel"><h3>Immutable audit log</h3><p>Action names and changed field names are recorded. Sensitive field values are not copied into this log.</p>{audit.map(x=><div className="academy-suite-row" key={x.id}><strong>{x.action.toUpperCase()} · {x.entity_type}</strong><span>{x.actor_user_id||"System"} · {new Date(x.created_at).toLocaleString()}</span><small>{(x.changed_fields||[]).join(", ")}</small></div>)}</article>}
  </section>;
}
