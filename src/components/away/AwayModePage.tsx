import { useCallback,useEffect,useState } from "react";
import { supabase } from "../../lib/supabase";
import { useAuth } from "../../hooks/useAuth";

type Toast=(toast:{type:"success"|"error"|"warning";message:string})=>void;
type PackingItem={id:string;label:string;packed:boolean};
type ItineraryItem={id:string;title:string;time:string};
type AwayPlan={id:string;user_id:string;event_name:string;event_date:string|null;venue:string|null;departure_date:string|null;return_date:string|null;packing_items:PackingItem[];itinerary_items:ItineraryItem[];notes:string|null;status:string};
const DEFAULT_PACKING_ITEMS=["Sport kit / uniform","Required protective equipment","Event registration documents","Suitable footwear","Water bottle","Towel and personal essentials","Phone charger"];
const makeId=()=>`${Date.now()}-${Math.random().toString(36).slice(2,8)}`;

function AwayPlanCard({plan,onUpdate,onDelete,busy}:{plan:AwayPlan;onUpdate:(plan:AwayPlan,patch:Partial<AwayPlan>)=>Promise<void>;onDelete:(plan:AwayPlan)=>void;busy:boolean}) {
 const [packingDraft,setPackingDraft]=useState("");
 const [itineraryTitle,setItineraryTitle]=useState("");
 const [itineraryTime,setItineraryTime]=useState("");
 const packing=Array.isArray(plan.packing_items)?plan.packing_items:[];
 const itinerary=Array.isArray(plan.itinerary_items)?plan.itinerary_items:[];
 const toggle=(item:PackingItem)=>void onUpdate(plan,{packing_items:packing.map(x=>x.id===item.id?{...x,packed:!x.packed}:x)});
 const addPacking=async()=>{const label=packingDraft.trim();if(!label)return;await onUpdate(plan,{packing_items:[...packing,{id:makeId(),label,packed:false}]});setPackingDraft("");};
 const addItinerary=async()=>{const title=itineraryTitle.trim();if(!title)return;await onUpdate(plan,{itinerary_items:[...itinerary,{id:makeId(),title,time:itineraryTime}]});setItineraryTitle("");setItineraryTime("");};
 const done=packing.filter(x=>x.packed).length;
 return <section className="card panel">
  <div className="parity-row"><div><h3>{plan.event_name}</h3><p className="empty-copy">{plan.event_date||"Date not set"} · {plan.venue||"Venue not set"}</p><p className="messaging-help">Travel dates: {plan.departure_date||"—"} to {plan.return_date||"—"} · {plan.status.toUpperCase()}</p></div><button className="plain danger" disabled={busy} onClick={()=>onDelete(plan)}>Delete</button></div>
  <div className="parity-row"><strong>Packing checklist</strong><span>{done}/{packing.length} packed</span></div>
  {packing.map(item=><label key={item.id} className="parity-row" style={{justifyContent:"flex-start",gap:10}}><input type="checkbox" checked={Boolean(item.packed)} disabled={busy} onChange={()=>toggle(item)}/><span>{item.label}</span></label>)}
  <div className="form-grid"><label className="field"><span>Add packing item</span><input value={packingDraft} maxLength={100} onChange={e=>setPackingDraft(e.target.value)} placeholder="Add an item"/></label><div className="inline-actions"><button className="btn" disabled={busy||!packingDraft.trim()} onClick={()=>void addPacking()}>Add item</button></div></div>
  <h3>Personal itinerary</h3>
  {itinerary.length?itinerary.map(item=><div className="parity-row" key={item.id}><strong>{item.title}</strong><span>{item.time||"Time not set"}</span></div>):<p className="empty-copy">No itinerary items yet.</p>}
  <div className="form-grid"><label className="field"><span>Schedule item</span><input value={itineraryTitle} maxLength={120} onChange={e=>setItineraryTitle(e.target.value)} placeholder="Registration, travel, event session…"/></label><label className="field"><span>Time (optional)</span><input type="time" value={itineraryTime} onChange={e=>setItineraryTime(e.target.value)}/></label></div>
  <button className="btn" disabled={busy||!itineraryTitle.trim()} onClick={()=>void addItinerary()}>Add to itinerary</button>
  {plan.notes?<p className="messaging-help">Notes: {plan.notes}</p>:null}
  {plan.status!=="ready"?<button className="btn primary" disabled={busy} onClick={()=>void onUpdate(plan,{status:"ready"})}>Mark plan ready</button>:<p className="empty-copy">Plan marked ready.</p>}
 </section>;
}

export default function AwayModePage({setToast}:{setToast:Toast}) {
 const uid=useAuth().user?.id;
 const [rows,setRows]=useState<AwayPlan[]>([]);
 const [loading,setLoading]=useState(false);
 const [busy,setBusy]=useState(false);
 const [eventName,setEventName]=useState("");
 const [eventDate,setEventDate]=useState("");
 const [venue,setVenue]=useState("");
 const [departureDate,setDepartureDate]=useState("");
 const [returnDate,setReturnDate]=useState("");
 const [notes,setNotes]=useState("");
 const load=useCallback(async()=>{
  if(!uid)return;setLoading(true);
  const {data,error}=await supabase.from("athlete_away_plans").select("*").eq("user_id",uid).order("event_date",{ascending:true});
  if(error)setToast({type:"error",message:"Away Mode could not load. Install its candidate migration in the target environment first."});
  else setRows((data||[]) as AwayPlan[]);
  setLoading(false);
 },[uid,setToast]);
 useEffect(()=>{void load()},[load]);
 async function createPlan(){
  if(!uid||eventName.trim().length<2){setToast({type:"warning",message:"Enter an event name with at least two characters."});return;}
  if(departureDate&&returnDate&&departureDate>returnDate){setToast({type:"warning",message:"Return date cannot be before departure date."});return;}
  if(venue.length>180||notes.length>1200){setToast({type:"warning",message:"Venue or notes exceed the allowed length."});return;}
  setBusy(true);
  const packing=DEFAULT_PACKING_ITEMS.map((label,index)=>({id:`default-${index}`,label,packed:false}));
  const {data,error}=await supabase.from("athlete_away_plans").insert({
   user_id:uid,event_name:eventName.trim(),event_date:eventDate||null,venue:venue.trim()||null,
   departure_date:departureDate||null,return_date:returnDate||null,notes:notes.trim()||null,
   packing_items:packing,itinerary_items:[],status:"planning"
  }).select("*").single();
  if(error)setToast({type:"error",message:error.message});
  else{setRows(old=>[...old,data as AwayPlan]);setEventName("");setEventDate("");setVenue("");setDepartureDate("");setReturnDate("");setNotes("");setToast({type:"success",message:"Private travel plan created."});}
  setBusy(false);
 }
 async function updatePlan(plan:AwayPlan,patch:Partial<AwayPlan>){
  if(!uid)return;setBusy(true);
  const {data,error}=await supabase.from("athlete_away_plans").update(patch).eq("id",plan.id).eq("user_id",uid).select("*").single();
  if(error)setToast({type:"error",message:error.message});
  else setRows(old=>old.map(row=>row.id===plan.id?data as AwayPlan:row));
  setBusy(false);
 }
 async function deletePlan(plan:AwayPlan){
  if(!uid)return;setBusy(true);
  const {error}=await supabase.from("athlete_away_plans").delete().eq("id",plan.id).eq("user_id",uid);
  if(error)setToast({type:"error",message:error.message});
  else setRows(old=>old.filter(row=>row.id!==plan.id));
  setBusy(false);
 }
 return <><div className="page-head"><div><p className="eyebrow">AthleteN · Athlete workspace</p><h2>Away Mode</h2><p className="messaging-help">A private competition travel planner for the athlete. No live location tracking or shared lodging details.</p></div><div className="inline-actions"><button className="btn" onClick={()=>void load()} disabled={loading}>Refresh</button></div></div>
  <section className="card panel"><h3>Create a travel plan</h3><div className="form-grid">
   <label className="field"><span>Event / competition</span><input value={eventName} maxLength={120} onChange={e=>setEventName(e.target.value)} placeholder="Competition name"/></label>
   <label className="field"><span>Event date</span><input type="date" value={eventDate} onChange={e=>setEventDate(e.target.value)}/></label>
   <label className="field"><span>Venue</span><input value={venue} maxLength={180} onChange={e=>setVenue(e.target.value)} placeholder="Public venue name"/></label>
   <label className="field"><span>Departure date</span><input type="date" value={departureDate} onChange={e=>setDepartureDate(e.target.value)}/></label>
   <label className="field"><span>Return date</span><input type="date" value={returnDate} onChange={e=>setReturnDate(e.target.value)}/></label>
   <label className="field"><span>Private notes (non-sensitive only)</span><textarea value={notes} maxLength={1200} rows={3} onChange={e=>setNotes(e.target.value)} placeholder="Reminders that do not include room numbers or identity-document numbers."/></label>
  </div><p className="messaging-help">Travel plans are private to your account. Do not store room numbers, passwords, identity-document numbers or other highly sensitive details.</p><button className="btn primary" disabled={busy} onClick={()=>void createPlan()}>{busy?"Saving…":"Create travel plan"}</button></section>
  <div className="page-head"><div><h2>Your travel plans</h2></div></div>
  {loading?<section className="card panel">Loading travel plans…</section>:rows.length?rows.map(plan=><AwayPlanCard key={plan.id} plan={plan} busy={busy} onUpdate={updatePlan} onDelete={deletePlan}/>):<section className="card panel"><p className="empty-copy">No travel plans yet. Create one when you have an upcoming event.</p></section>}
 </>;
}
