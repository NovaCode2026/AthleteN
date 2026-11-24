import { useCallback, useEffect, useState } from "react";
import { supabase } from "../../lib/supabase";
import { useAuth } from "../../context/AuthContext";

type ToastState = { type: "success" | "error" | "warning"; message: string } | null;
type Props = { setToast: (toast: ToastState) => void };

const allowedScopes = ["announcements","calendar","attendance_summary","fee_status"] as const;
const scopeLabel: Record<string,string> = {
  announcements:"Academy announcements",
  calendar:"Athlete calendar",
  attendance_summary:"Attendance summary",
  fee_status:"Fee status"
};

export default function AcademyGuardianTransferPortal({setToast}:Props){
  const auth=useAuth();
  const userId=auth.user?.id;
  const academyId=auth.profile?.academy_id||null;
  const role=auth.profile?.role||"athlete";
  const isAdmin=role==="academy_admin"||role==="academy";
  const [members,setMembers]=useState<any[]>([]);
  const [coaches,setCoaches]=useState<any[]>([]);
  const [transfers,setTransfers]=useState<any[]>([]);
  const [guardians,setGuardians]=useState<any[]>([]);
  const [busy,setBusy]=useState(false);
  const [loading,setLoading]=useState(true);
  const [targetCoach,setTargetCoach]=useState("");
  const [reason,setReason]=useState("");
  const [inviteAthlete,setInviteAthlete]=useState("");
  const [inviteGuardian,setInviteGuardian]=useState("");
  const [relationship,setRelationship]=useState("parent");
  const [scopes,setScopes]=useState<string[]>(["announcements","calendar"]);
  const [guardianSummary,setGuardianSummary]=useState<any>(null);

  const memberName=useCallback((id:string)=>{
    const row=members.find(x=>x.user_id===id);
    return row?.full_name||row?.username||"AthleteN member";
  },[members]);

  const load=useCallback(async()=>{
    if(!userId){setLoading(false);return;}
    setLoading(true);
    try{
      let memberRows:any[]=[];
      let guardianRows:any[]=[];
      let transferRows:any[]=[];
      if(academyId){
        const membership=await supabase.from("academy_memberships")
          .select("user_id,role,status").eq("academy_id",academyId).eq("status","active");
        if(membership.error)throw membership.error;
        memberRows=membership.data||[];
        const coachIds=memberRows.filter(x=>x.role==="coach").map(x=>x.user_id);
        const profileIds=memberRows.map(x=>x.user_id);
        const [profiles,transferResult,guardianResult,inboundResult]=await Promise.all([
          profileIds.length?supabase.from("profiles").select("user_id,full_name,username").in("user_id",profileIds):Promise.resolve({data:[],error:null}),
          supabase.from("academy_athlete_transfer_requests").select("*").eq("academy_id",academyId).order("created_at",{ascending:false}).limit(100),
          supabase.from("academy_guardian_links").select("*").eq("academy_id",academyId).order("created_at",{ascending:false}).limit(100),
          supabase.from("academy_guardian_links").select("*").eq("guardian_user_id",userId).order("created_at",{ascending:false}).limit(50)
        ]);
        if(profiles.error)throw profiles.error;
        if(transferResult.error)throw transferResult.error;
        if(guardianResult.error)throw guardianResult.error;
        const profileMap=new Map((profiles.data||[]).map((x:any)=>[x.user_id,x]));
        setMembers(memberRows.map((x:any)=>({...x,...(profileMap.get(x.user_id)||{})})));
        setCoaches(memberRows.filter(x=>x.role==="coach").map((x:any)=>({...x,...(profileMap.get(x.user_id)||{})})));
        transferRows=transferResult.data||[];
        guardianRows=[...(guardianResult.data||[]),...(inboundResult.data||[]).filter((x:any)=>!(guardianResult.data||[]).some((y:any)=>y.id===x.id))];
      }else{
        const inbound=await supabase.from("academy_guardian_links").select("*")
          .eq("guardian_user_id",userId).order("created_at",{ascending:false}).limit(50);
        if(inbound.error)throw inbound.error;
        guardianRows=inbound.data||[];
        setMembers([]);setCoaches([]);
      }
      setTransfers(transferRows);
      setGuardians(guardianRows);
    }catch(error){
      setToast({type:"error",message:error instanceof Error?error.message:"Academy requests could not be loaded."});
    }finally{setLoading(false);}
  },[academyId,userId,setToast]);

  useEffect(()=>{void load()},[load]);

  async function run(action:()=>Promise<any>,message:string){
    setBusy(true);
    try{
      const result=await action();
      if(result?.error)throw result.error;
      setToast({type:"success",message});
      setGuardianSummary(null);
      await load();
    }catch(error){
      setToast({type:"error",message:error instanceof Error?error.message:"The request could not be completed."});
    }finally{setBusy(false);}
  }

  const requestTransfer=()=>run(
    ()=>supabase.rpc("academy_request_athlete_transfer",{p_academy_id:academyId,p_to_coach_user_id:targetCoach,p_reason:reason.trim()||null}),
    "Coach transfer request submitted. The current Coach must review it first."
  );
  const reviewTransfer=(row:any,action:string)=>run(
    ()=>supabase.rpc("academy_review_athlete_transfer",{p_request_id:row.id,p_action:action}),
    "Transfer request updated."
  );
  const inviteGuardian=()=>run(
    ()=>supabase.rpc("academy_create_guardian_link",{p_academy_id:academyId,p_athlete_user_id:inviteAthlete.trim(),p_guardian_user_id:inviteGuardian.trim(),p_relationship:relationship}),
    "Guardian invitation created. Guardian acceptance and athlete approval are both required."
  );
  const acceptGuardian=(row:any)=>run(
    ()=>supabase.rpc("academy_accept_guardian_link",{p_link_id:row.id}),
    "Invitation accepted. The athlete must approve the requested data access."
  );
  const approveGuardian=(row:any)=>run(
    ()=>supabase.rpc("academy_approve_guardian_link",{p_link_id:row.id,p_scopes:scopes}),
    "Guardian access approved for the selected scopes."
  );
  const withdrawGuardian=(row:any)=>run(
    ()=>supabase.from("academy_guardian_links").update({status:"revoked",scopes:[],updated_at:new Date().toISOString()})
      .eq("id",row.id).eq("athlete_user_id",userId),
    "Guardian access update submitted."
  );
  const openSummary=async(row:any)=>{
    setBusy(true);
    try{
      const {data,error}=await supabase.rpc("academy_guardian_portal_summary",{p_link_id:row.id});
      if(error)throw error;
      setGuardianSummary(data||{});
    }catch(error){
      setToast({type:"error",message:error instanceof Error?error.message:"Guardian summary could not be loaded."});
    }finally{setBusy(false);}
  };
  const toggleScope=(scope:string)=>setScopes(current=>current.includes(scope)?current.filter(x=>x!==scope):[...current,scope]);

  return <section className="card panel academy-guardian-transfer-portal">
    <div className="panel-head"><div><span className="eyebrow">TEAM & ACADEMY</span><h3>Transfer & Guardian Portal</h3><p>Review Coach transfers and parent/guardian access using explicit approvals.</p></div><button type="button" className="btn" disabled={busy||loading} onClick={()=>void load()}>Refresh</button></div>

    {role==="athlete"&&academyId&&<section className="academy-portal-subsection">
      <h4>Request a Coach change</h4>
      <p className="messaging-help">You start the request. Your current Coach, selected Coach and Academy must each review it before the connection changes.</p>
      <label className="field"><span>NEW COACH</span><select value={targetCoach} onChange={e=>setTargetCoach(e.target.value)}><option value="">Select an active Academy Coach</option>{coaches.filter(x=>x.user_id!==auth.profile?.coach_user_id).map(x=><option key={x.user_id} value={x.user_id}>{x.full_name||x.username||x.user_id}</option>)}</select></label>
      <label className="field"><span>REASON (OPTIONAL)</span><textarea rows={2} maxLength={500} value={reason} onChange={e=>setReason(e.target.value)} placeholder="Add a short note for the review."/></label>
      <button type="button" className="btn primary" disabled={busy||!targetCoach} onClick={()=>void requestTransfer()}>Request transfer</button>
    </section>}

    {isAdmin&&academyId&&<section className="academy-portal-subsection">
      <h4>Invite a parent / guardian account</h4>
      <p className="messaging-help">Only invite an account after the Academy has confirmed an appropriate adult-authorized basis. This workflow does not independently verify legal identity or guardianship.</p>
      <div className="form-grid">
        <label className="field"><span>ATHLETE USER ID</span><input value={inviteAthlete} onChange={e=>setInviteAthlete(e.target.value)} placeholder="Active Academy athlete UUID"/></label>
        <label className="field"><span>GUARDIAN ACCOUNT USER ID</span><input value={inviteGuardian} onChange={e=>setInviteGuardian(e.target.value)} placeholder="Existing guardian account UUID"/></label>
        <label className="field"><span>RELATIONSHIP</span><select value={relationship} onChange={e=>setRelationship(e.target.value)}><option value="parent">Parent</option><option value="legal_guardian">Legal guardian</option><option value="caregiver">Caregiver</option></select></label>
      </div>
      <button type="button" className="btn primary" disabled={busy||!inviteAthlete.trim()||!inviteGuardian.trim()} onClick={()=>void inviteGuardian()}>Create guardian invitation</button>
    </section>}

    <section className="academy-portal-subsection">
      <h4>Coach transfer requests</h4>
      {loading?<p className="empty-copy">Loading transfer requests…</p>:transfers.length?transfers.map(row=><article className="academy-portal-row" key={row.id}>
        <div><strong>{memberName(row.athlete_user_id)}</strong><small>{memberName(row.from_coach_user_id)} → {memberName(row.to_coach_user_id)} · {row.status.replace(/_/g," ")}</small></div>
        <div className="inline-actions">
          {row.status==="pending_current_coach"&&userId===row.from_coach_user_id&&<><button type="button" className="btn primary" disabled={busy} onClick={()=>void reviewTransfer(row,"release")}>Release</button><button type="button" className="btn" disabled={busy} onClick={()=>void reviewTransfer(row,"reject")}>Reject</button></>}
          {row.status==="pending_target_coach"&&userId===row.to_coach_user_id&&<><button type="button" className="btn primary" disabled={busy} onClick={()=>void reviewTransfer(row,"accept")}>Accept</button><button type="button" className="btn" disabled={busy} onClick={()=>void reviewTransfer(row,"reject")}>Reject</button></>}
          {row.status==="pending_academy_review"&&isAdmin&&<><button type="button" className="btn primary" disabled={busy} onClick={()=>void reviewTransfer(row,"approve")}>Approve</button><button type="button" className="btn" disabled={busy} onClick={()=>void reviewTransfer(row,"reject")}>Reject</button></>}
          {row.athlete_user_id===userId&&!["approved","rejected","withdrawn"].includes(row.status)&&<button type="button" className="btn" disabled={busy} onClick={()=>void reviewTransfer(row,"withdraw")}>Withdraw</button>}
        </div>
      </article>):<p className="empty-copy">No transfer requests are visible to this account.</p>}
    </section>

    <section className="academy-portal-subsection">
      <h4>Parent / guardian access</h4>
      {loading?<p className="empty-copy">Loading guardian invitations…</p>:guardians.length?guardians.map(row=><article className="academy-portal-row" key={row.id}>
        <div><strong>{memberName(row.athlete_user_id)} · {row.relationship}</strong><small>{row.status.replace(/_/g," ")} · {row.guardian_user_id===userId?"Invitation addressed to this account":"Guardian account: "+row.guardian_user_id}</small></div>
        <div className="inline-actions">
          {row.guardian_user_id===userId&&row.status==="pending_guardian"&&<button type="button" className="btn primary" disabled={busy} onClick={()=>void acceptGuardian(row)}>Accept invitation</button>}
          {row.athlete_user_id===userId&&row.status==="pending_athlete"&&<div className="academy-portal-scopes">{allowedScopes.map(scope=><label key={scope}><input type="checkbox" checked={scopes.includes(scope)} onChange={()=>toggleScope(scope)}/>{scopeLabel[scope]}</label>)}<button type="button" className="btn primary" disabled={busy||scopes.length===0} onClick={()=>void approveGuardian(row)}>Approve selected scopes</button></div>}
          {row.guardian_user_id===userId&&row.status==="active"&&<button type="button" className="btn primary" disabled={busy} onClick={()=>void openSummary(row)}>Open approved summary</button>}
          {row.athlete_user_id===userId&&row.status==="active"&&<button type="button" className="btn" disabled={busy} onClick={()=>void withdrawGuardian(row)}>Revoke access</button>}
        </div>
      </article>):<p className="empty-copy">No guardian invitations are visible to this account.</p>}
      {guardianSummary&&<article className="academy-portal-summary"><h4>Approved athlete summary</h4><pre>{JSON.stringify(guardianSummary,null,2)}</pre></article>}
    </section>
  </section>;
}
