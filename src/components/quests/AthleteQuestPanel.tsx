import { useCallback,useEffect,useState } from "react";
import { supabase } from "../../lib/supabase";
import { useAuth } from "../../hooks/useAuth";
import { ATHLETE_QUESTS,getQuestPeriodKey } from "../../utils/athleteQuests";

type Toast=(toast:{type:"success"|"error"|"warning";message:string})=>void;

export default function AthleteQuestPanel({setToast}:{setToast:Toast}) {
 const uid=useAuth().user?.id;
 const [rows,setRows]=useState<Array<{quest_key:string;period_key:string}>>([]);
 const [busyKey,setBusyKey]=useState<string|null>(null);
 const load=useCallback(async()=>{
  if(!uid)return;
  const periods=[...new Set(ATHLETE_QUESTS.map(q=>getQuestPeriodKey(q.cadence)))];
  const {data,error}=await supabase.from("athlete_quest_completions").select("quest_key,period_key").eq("user_id",uid).in("period_key",periods);
  if(error){setToast({type:"error",message:"Quest progress could not load. Install the AthleteN Quest migration before enabling this feature."});return;}
  setRows(data||[]);
 },[uid,setToast]);
 useEffect(()=>{void load()},[load]);
 const isDone=(quest:{key:string;cadence:"daily"|"weekly"|"monthly"})=>rows.some(row=>row.quest_key===quest.key&&row.period_key===getQuestPeriodKey(quest.cadence));
 async function toggle(quest:{key:string;cadence:"daily"|"weekly"|"monthly"}) {
  if(!uid)return;
  const period=getQuestPeriodKey(quest.cadence);const done=isDone(quest);setBusyKey(quest.key);
  const result=done
   ? await supabase.from("athlete_quest_completions").delete().eq("user_id",uid).eq("quest_key",quest.key).eq("period_key",period)
   : await supabase.from("athlete_quest_completions").insert({user_id:uid,quest_key:quest.key,period_key:period});
  if(result.error)setToast({type:"error",message:result.error.message});
  else await load();
  setBusyKey(null);
 }
 const completed=ATHLETE_QUESTS.filter(q=>isDone(q)).length;
 return <section className="card panel">
  <div className="parity-row"><div><h3>AthleteN Quest</h3><p className="empty-copy">Optional daily, weekly and monthly check-ins. Missed quests never reset your training streak.</p></div><strong>{completed}/{ATHLETE_QUESTS.length}</strong></div>
  <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(220px,1fr))",gap:10,marginTop:12}}>
   {(["daily","weekly","monthly"] as const).map(cadence=><div key={cadence} className="card panel">
    <h3>{cadence==="daily"?"Daily quests":cadence==="weekly"?"Weekly quests":"Monthly quest"}</h3>
    {ATHLETE_QUESTS.filter(q=>q.cadence===cadence).map(quest=>{
     const done=isDone(quest);
     return <div key={quest.key} className="parity-row" style={{alignItems:"flex-start"}}>
      <div><strong>{quest.title}</strong><p className="empty-copy">{quest.description}</p></div>
      <button className={done?"plain":"btn"} disabled={busyKey!==null} onClick={()=>void toggle(quest)}>{busyKey===quest.key?"Saving…":done?"Done · Undo":"Complete"}</button>
     </div>;
    })}
   </div>)}
  </div>
  <p className="messaging-help">Quest completion is personal progress tracking only. It does not award leaderboard points or encourage extra training volume.</p>
 </section>;
}
