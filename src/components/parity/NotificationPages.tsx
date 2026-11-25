import { useCallback, useEffect, useState } from "react";
import { RefreshCw, CheckCheck, Trash2, ExternalLink } from "lucide-react";
import { supabase } from "../../lib/supabase";
import { useAuth } from "../../hooks/useAuth";
import { desktopNotificationPermission, requestDesktopNotifications } from "../../lib/desktopNotifications";
const fields=[["training","Training"],["competitions","Competitions"],["messages","Messages"],["coach_academy","Coach / Academy"],["achievements","Achievements"],["system","System"]] as const;
const defaults={training:true,competitions:true,messages:true,coach_academy:true,achievements:true,system:true,message_preview:false};
type NotificationSource = { kind: "announcement" | "attendance"; title: string; body: string; meta: string[] };
function notificationCategory(type:string|null|undefined){
 const value=String(type||"").toLowerCase();
 if(value==="message")return "Messages";
 if(value==="training")return "Training";
 if(["competition","competitions","tournament","tournament_update"].includes(value))return "Competitions";
 if(["coach","academy","coach_academy","connection","connection_request","academy_invitation","coach_invitation"].includes(value))return "Coach & Academy";
 if(["achievement","badge","milestone"].includes(value))return "Achievements";
 return "System";
}
function groupMessageNotifications(rows:any[]){
 const groups=new Map<string,any[]>();
 const output:any[]=[];
 for(const row of rows){
  if(row.notification_type==="message"&&row.conversation_id){
   const key=String(row.conversation_id);
   const group=groups.get(key)||[];
   group.push(row);
   groups.set(key,group);
  }else output.push({...row,notification_ids:[row.id],message_count:1,unread_message_count:row.read_at?0:1});
 }
 for(const [conversationId,group] of groups){
  group.sort((a,b)=>new Date(b.created_at).getTime()-new Date(a.created_at).getTime());
  const latest=group[0];
  const unread=group.filter(row=>!row.read_at).length;
  output.push({...latest,id:"message-group:"+conversationId,notification_ids:group.map(row=>row.id),message_count:group.length,unread_message_count:unread,read_at:unread?null:latest.read_at,title:group.length>1?"New messages":latest.title,body:group.length>1?group.length+" message notifications · "+unread+" unread":latest.body});
 }
 return output.sort((a,b)=>new Date(b.created_at).getTime()-new Date(a.created_at).getTime());
}


export function NotificationsPage({setToast}:{setToast:(toast:{type:"success"|"error"|"warning";message:string})=>void}){
 const uid=useAuth().user?.id;
 const [rows,setRows]=useState<any[]>([]);
 const [loading,setLoading]=useState(true);
 const [busy,setBusy]=useState(false);
 const [selectedSource,setSelectedSource]=useState<NotificationSource|null>(null);

 const load=useCallback(async()=>{
  if(!uid)return;
  setLoading(true);
  let {data,error}=await supabase.from("notifications")
   .select("id,title,body,notification_type,action_route,message_id,announcement_id,attendance_record_id,created_at,read_at")
   .eq("user_id",uid).order("created_at",{ascending:false}).limit(50);
  if(error && String(error.message||"").toLowerCase().includes("attendance_record_id")){
   const fallback=await supabase.from("notifications")
    .select("id,title,body,notification_type,action_route,message_id,announcement_id,created_at,read_at")
    .eq("user_id",uid).order("created_at",{ascending:false}).limit(50);
   data=fallback.data;error=fallback.error;
  }
  if(error)setToast({type:"error",message:error.message});
  else {
   let next=(data||[]) as any[];
   const messageIds=next.filter(row=>row.notification_type==="message"&&row.message_id).map(row=>row.message_id);
   if(messageIds.length){
    const {data:messageRows,error:messageLookupError}=await supabase.from("messages").select("id,conversation_id").in("id",messageIds);
    if(!messageLookupError){
     const conversationByMessage=new Map((messageRows||[]).map((row:any)=>[String(row.id),String(row.conversation_id)]));
     next=next.map(row=>({...row,conversation_id:row.message_id?conversationByMessage.get(String(row.message_id)):undefined}));
    }
   }
   setRows(next);
  }
  setLoading(false);
 },[uid,setToast]);

 useEffect(()=>{
  void load();
  if(!uid)return;
  const ch=supabase.channel("web-notifications-"+uid)
   .on("postgres_changes",{event:"*",schema:"public",table:"notifications",filter:"user_id=eq."+uid},()=>{void load()})
   .subscribe();
  return()=>{void supabase.removeChannel(ch)};
 },[load,uid]);

 async function markRead(row:any){
  const ids=Array.isArray(row.notification_ids)&&row.notification_ids.length?row.notification_ids:[row.id];
  const {error}=await supabase.from("notifications").update({read_at:new Date().toISOString()}).in("id",ids).eq("user_id",uid);
  if(error)throw error;
 }

 async function openNotification(row:any){
  if(!uid||busy)return;
  setBusy(true);
  try{
   await markRead(row);
   if(row.message_id){
    const {data,error}=await supabase.from("messages").select("conversation_id").eq("id",row.message_id).maybeSingle();
    if(error)throw error;
    if(data?.conversation_id){
     await load();
     const route="/messages?conversation="+encodeURIComponent(data.conversation_id);
     window.history.pushState({}, "", route);
     window.dispatchEvent(new PopStateEvent("popstate"));
     return;
    }
    setToast({type:"warning",message:"The original message is no longer available. It may have been deleted."});
    await load();
    return;
   }
   if(row.announcement_id){
    const {data,error}=await supabase.from("announcements").select("id,title,body,published_at").eq("id",row.announcement_id).maybeSingle();
    if(error)throw error;
    if(!data){setToast({type:"warning",message:"The original announcement is no longer available."});}
    else setSelectedSource({kind:"announcement",title:String(data.title||"Announcement"),body:String(data.body||""),meta:[data.published_at?"Published "+new Date(data.published_at).toLocaleString():"Announcement"]});
    await load();
    return;
   }
   if(row.attendance_record_id){
    const {data:attendance,error}=await supabase.from("attendance_records").select("id,training_session_id,attended_at,status,notes").eq("id",row.attendance_record_id).eq("user_id",uid).maybeSingle();
    if(error)throw error;
    if(!attendance){setToast({type:"warning",message:"The original attendance record is no longer available."});}
    else{
     let sessionTitle="Training session";
     let sessionDate="";
     if(attendance.training_session_id){
      const {data:session,error:sessionError}=await supabase.from("training_sessions").select("title,session_date").eq("id",attendance.training_session_id).eq("user_id",uid).maybeSingle();
      if(sessionError)throw sessionError;
      if(session){sessionTitle=session.title||sessionTitle;sessionDate=session.session_date||"";}
     }
     setSelectedSource({kind:"attendance",title:sessionTitle,body:String(attendance.notes||"No additional attendance notes were recorded."),meta:[sessionDate?"Session date: "+sessionDate:"", "Attendance: "+String(attendance.status||"Updated"), attendance.attended_at?"Recorded: "+new Date(attendance.attended_at).toLocaleString():""].filter(Boolean)});
    }
    await load();
    return;
   }
   const route=typeof row.action_route==="string"&&row.action_route.startsWith("/")&&!row.action_route.startsWith("//")?row.action_route:"/notifications";
   if(route!=="/notifications"&&!route.startsWith("/notifications?")){
    await load();
    window.history.pushState({}, "", route);
    window.dispatchEvent(new PopStateEvent("popstate"));
    return;
   }
   if(String(row.notification_type||"").toLowerCase()==="training"){
    setToast({type:"warning",message:"This older attendance alert has no saved attendance-record link, so AthleteN cannot open the exact original record. The notification itself can still be deleted."});
   }else{
    setToast({type:"warning",message:"This notification has no linked source record yet."});
   }
   await load();
  }catch(error){
   setToast({type:"error",message:error instanceof Error?error.message:"Notification could not be opened."});
  }finally{setBusy(false)}
 }

 async function deleteOne(row:any){
  if(!uid||busy)return;
  const ids=Array.isArray(row.notification_ids)&&row.notification_ids.length?row.notification_ids:[row.id];
  setBusy(true);
  const {error}=await supabase.from("notifications").delete().in("id",ids).eq("user_id",uid);
  setBusy(false);
  if(error)setToast({type:"error",message:error.message});
  else{setRows(old=>old.filter(item=>!ids.includes(item.id)));setToast({type:"success",message:ids.length>1?"Conversation notifications deleted.":"Notification deleted. Its original content was not changed."});}
 }

 async function readAll(){
  if(!uid||busy)return;
  setBusy(true);
  const {error}=await supabase.from("notifications").update({read_at:new Date().toISOString()}).eq("user_id",uid).is("read_at",null);
  setBusy(false);
  if(error)setToast({type:"error",message:error.message});
  else{await load();setToast({type:"success",message:"Notifications marked as read."});}
 }

 async function clearAll(){
  if(!uid||busy||!rows.length)return;
  if(!window.confirm("Delete all your notifications? Messages, announcements, attendance and other original content will not be deleted."))return;
  setBusy(true);
  const {error}=await supabase.from("notifications").delete().eq("user_id",uid);
  setBusy(false);
  if(error)setToast({type:"error",message:error.message});
  else{setRows([]);setToast({type:"success",message:"All notifications cleared. Original content was not deleted."});}
 }

 const displayRows=groupMessageNotifications(rows);

 if(selectedSource)return <><div className="page-head"><div><p className="eyebrow">Notification source</p><h2>{selectedSource.title}</h2><p className="messaging-help">Original {selectedSource.kind} record</p></div><button type="button" className="btn" onClick={()=>setSelectedSource(null)}>Back to notifications</button></div><section className="card panel notification-source-detail"><div className="inline-actions">{selectedSource.meta.map((item,index)=><span className="tag" key={index}>{item}</span>)}</div><p>{selectedSource.body}</p></section></>;

 return <><div className="page-head"><div><p className="eyebrow">AthleteN</p><h2>Notifications</h2><p className="messaging-help">Competition, account, coach and platform updates.</p></div><div className="inline-actions"><button className="btn" onClick={()=>void load()} disabled={loading||busy}><RefreshCw size={15}/> Refresh</button><button className="btn primary" disabled={busy||!rows.some(x=>!x.read_at)} onClick={()=>void readAll()}><CheckCheck size={15}/> Mark all read</button><button className="btn" disabled={busy||!rows.length} onClick={()=>void clearAll()}><Trash2 size={15}/> Clear all</button></div></div><section className="card panel">{loading?<p>Loading notifications…</p>:displayRows.length?displayRows.map(x=><div className="notification-row" key={x.id}><span className={"notification-dot "+(x.read_at?"read":"new")}/><button type="button" className="notification-open" disabled={busy} onClick={()=>void openNotification(x)}><span className="notification-copy"><small className="tag">{notificationCategory(x.notification_type)}{x.message_count>1?" · "+x.message_count+" messages":""}</small><strong>{x.title||"AthleteN notification"}</strong>{x.body&&<span>{x.body}</span>}<small>{x.created_at?new Date(x.created_at).toLocaleString():"—"} · {x.read_at?"READ":"NEW"}</small></span><span className="notification-open-label"><ExternalLink size={14}/> Open</span></button><button type="button" className="plain danger notification-delete" aria-label={"Delete notification: "+(x.title||"AthleteN notification")} title="Delete notification" disabled={busy} onClick={()=>void deleteOne(x)}><Trash2 size={16}/></button></div>):<div className="empty"><strong>No notifications yet.</strong><p>Updates will appear here when AthleteN sends them to your account.</p></div>}</section></>;
}

export function NotificationSettingsPage({setToast}:{setToast:(toast:{type:"success"|"error"|"warning";message:string})=>void}){
 const uid=useAuth().user?.id;const [prefs,setPrefs]=useState<any>(defaults);const [busy,setBusy]=useState(false);const [error,setError]=useState("");
 const [desktopPermission,setDesktopPermission]=useState<NotificationPermission|"unsupported">("default");
 const [desktopBusy,setDesktopBusy]=useState(false);
 const load=useCallback(async()=>{if(!uid)return;const {data,error}=await supabase.from("notification_preferences").select("*").eq("user_id",uid).maybeSingle();if(error){setError(error.message);return}if(data)setPrefs({...defaults,...data})},[uid]);
 useEffect(()=>{void load();setDesktopPermission(desktopNotificationPermission())},[load]);
 async function enableDesktop(){
  if(desktopBusy)return;
  setDesktopBusy(true);
  try{
   const permission=await requestDesktopNotifications();
   setDesktopPermission(permission);
   if(permission==="granted")setToast({type:"success",message:"Browser notifications enabled for AthleteN while this site is open."});
   else if(permission==="denied")setToast({type:"warning",message:"Browser notifications are blocked. Allow them in this site's browser permissions, then retry."});
   else if(permission==="unsupported")setToast({type:"warning",message:"This browser does not support desktop notifications."});
   else setToast({type:"warning",message:"Browser notification permission was not granted."});
  }catch(e){
   setToast({type:"error",message:e instanceof Error?e.message:"Browser notification permission could not be requested."});
   setDesktopPermission(desktopNotificationPermission());
  }finally{setDesktopBusy(false)}
 }
 async function toggle(key:string){if(!uid||busy)return;const previous=prefs;const next={...prefs,[key]:!prefs[key]};setPrefs(next);setBusy(true);setError("");const {error}=await supabase.from("notification_preferences").upsert({user_id:uid,...next,updated_at:new Date().toISOString()});if(error){setPrefs(previous);setError(error.message)}else setToast({type:"success",message:"Notification preferences saved."});setBusy(false)}
 const desktopCopy=desktopPermission==="granted"?"Browser permission is enabled. Alerts appear while AthleteN is open.":desktopPermission==="denied"?"Browser permission is blocked. Change this site's permission in browser settings.":desktopPermission==="unsupported"?"This browser does not support desktop notifications.":"Enable browser alerts to see notifications while AthleteN is open.";
 return <><div className="page-head"><div><p className="eyebrow">AthleteN settings</p><h2>Notification settings</h2><p className="messaging-help">Choose which AthleteN notification categories you want enabled.</p></div></div><section className="card panel notification-desktop-permission"><div><strong>Browser desktop alerts</strong><p className="messaging-help">{desktopCopy}</p></div><button type="button" className="btn" disabled={desktopBusy||desktopPermission==="granted"||desktopPermission==="unsupported"} onClick={()=>void enableDesktop()}>{desktopBusy?"Checking…":desktopPermission==="granted"?"Enabled":desktopPermission==="denied"?"Retry after browser settings":"Enable desktop alerts"}</button></section><section className="card panel">{fields.map(([key,label])=><button type="button" className="notification-setting" key={key} disabled={busy} onClick={()=>void toggle(key)}><span><strong>{label}</strong><small>{prefs[key]?"Enabled":"Muted"}</small></span><span className={"switch "+(prefs[key]?"on":"")}><i/></span></button>)}<button type="button" className="notification-setting" disabled={busy} onClick={()=>void toggle("message_preview")}><span><strong>Message previews on lock screen</strong><small>{prefs.message_preview?"Sender and message text may appear":"Private preview · message text hidden by default"}</small></span><span className={"switch "+(prefs.message_preview?"on":"")}><i/></span></button></section>{error&&<p className="notice" role="alert">{error}</p>}</>
}
export function SettingsPage(){
 return <><div className="page-head"><div><p className="eyebrow">AthleteN</p><h2>Settings</h2><p className="messaging-help">Account, privacy, communication and app controls.</p></div></div><section className="grid two">{[["Profile","Name, sport, club, coach and profile photo","/profile"],["Plan & billing","Subscription, features and AI usage","/plans"],["Messages & privacy","Username search, blocked accounts and chats","/messages"],["Notifications","Competition, training and account alerts","/notifications"],["Notification preferences","Choose which categories can notify you","/notification-settings"],["Navigation settings","Choose and reorder your shortcuts across devices","/navigation-settings"],["Attendance","View attendance across linked training groups","/attendance"],["Athlete Journey","Season, competition review, progress and milestones","/journey"],["Reports","Download or share your athlete report","/reports"],["Badges","Founding status and achievements","/badges"]].map(([title,description,url])=><a className="card panel settings-link" href={url} key={url}><strong>{title}</strong><p>{description}</p><span>Open →</span></a>)}</section></>
}

const mobileNavigationOptions=[
 ["index","Home"],["training","Training"],["ai","AI Coach"],["compete","Compete"],["profile","Profile"],["explore","More"],
 ["calendar","Calendar"],["journey","Journey"],["weight","Weight"],["messages","Messages"],["documents","Documents"],["attendance","Attendance"],["analytics","Analytics"],["reports","Reports"],["coach","Coach"],["verification-review","Verification"],["academy","Academy"],["badges","Badges"],
 ["taekwondo-hub","Taekwondo"],["scanner-panel","Scanner"],["plans-panel","Plans"],["notifications-panel","Alerts"],["medals-panel","Medals"],["checklist-panel","Checklist"],["nutrition-panel","Nutrition"],["missions-panel","Missions"],["passport-panel","Passport"],["support-panel","Support"],["team-panel","Team"],["session-panel","Training Session"],["competition-mode-panel","Competition Mode"]
] as const;
const REQUIRED_NAV_ITEM="explore";
const MAX_NAV_ITEMS=6;
function normalizeWebNavigation(ids:string[]){const valid=[...new Set(ids.filter(id=>id!==REQUIRED_NAV_ITEM&&mobileNavigationOptions.some(o=>o[0]===id)))].slice(0,MAX_NAV_ITEMS-1);return [...valid,REQUIRED_NAV_ITEM]}
export function NavigationSettingsPage({setToast}:{setToast:(toast:{type:"success"|"error"|"warning";message:string})=>void}){
 const uid=useAuth().user?.id;const [items,setItems]=useState<string[]>(["index","training","ai","compete","profile","explore"]);const [busy,setBusy]=useState(false);
 const load=useCallback(async()=>{if(!uid)return;const {data,error}=await supabase.rpc("get_my_navigation_preferences");if(error){setToast({type:"error",message:error.message});return}if(Array.isArray(data))setItems(normalizeWebNavigation(data))},[uid,setToast]);
 useEffect(()=>{void load()},[load]);
 function toggle(id:string){if(id===REQUIRED_NAV_ITEM){setToast({type:"warning",message:"More is required so every feature remains accessible."});return}setItems(old=>normalizeWebNavigation(old.includes(id)?old.filter(x=>x!==id):[...old.filter(x=>x!==REQUIRED_NAV_ITEM),id]))}
 function move(id:string,dir:number){if(id===REQUIRED_NAV_ITEM)return;setItems(old=>{const next=[...old],i=next.indexOf(id),j=i+dir;if(i<0||j<0||j>=next.length-1)return old;[next[i],next[j]]=[next[j],next[i]];return next})}
 async function save(){if(!uid)return;setBusy(true);const next=normalizeWebNavigation(items);const {error}=await supabase.rpc("set_my_navigation_preferences",{p_item_ids:next});setBusy(false);if(error)setToast({type:"error",message:error.message});else setToast({type:"success",message:"Navigation saved and synced with mobile. More stays available."})}
 return <><div className="page-head"><div><p className="eyebrow">AthleteN settings</p><h2>Navigation settings</h2><p className="messaging-help">Choose and reorder up to five shortcuts. More is always pinned so every feature stays one tap away.</p></div><button className="btn primary" disabled={busy} onClick={()=>void save()}>{busy?"Saving…":"Save navigation"}</button></div><section className="card panel"><p><strong>Bottom bar · {Math.max(0,items.length-1)}/5 shortcuts + required More</strong></p>{items.map((id,i)=><div className="navigation-setting-row" key={id}><span>{i+1}. {mobileNavigationOptions.find(x=>x[0]===id)?.[1]||id}{id===REQUIRED_NAV_ITEM?" · Always available":""}</span><button className="btn" onClick={()=>move(id,-1)} disabled={id===REQUIRED_NAV_ITEM||i===0}>↑</button><button className="btn" onClick={()=>move(id,1)} disabled={id===REQUIRED_NAV_ITEM||i===items.length-2}>↓</button>{id===REQUIRED_NAV_ITEM?<span className="plain">Required</span>:<button className="plain danger" onClick={()=>toggle(id)}>Remove</button>}</div>)}</section><section className="card panel"><h3>All available shortcuts</h3><p className="messaging-help">Add any available destination. The More button cannot be removed.</p><div className="navigation-options">{mobileNavigationOptions.filter(x=>x[0]!==REQUIRED_NAV_ITEM&&!items.includes(x[0])).map(([id,label])=><button className="btn" key={id} disabled={items.length>=MAX_NAV_ITEMS} onClick={()=>toggle(id)}>+ {label}</button>)}</div></section></>
}
