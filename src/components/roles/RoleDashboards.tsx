import { useEffect, useMemo, useState } from "react";
import { Plus, RefreshCw, ShieldCheck, Users, UserPlus, ClipboardList, Building2, Search, BarChart3, CalendarCheck, Trophy, Award } from "lucide-react";
import { BarChart, Bar, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";
function downloadCsv(filename:string,rows:Array<Record<string,unknown>>){if(!rows.length)return;const columns=Array.from(new Set(rows.flatMap(row=>Object.keys(row))));const quote=(value:unknown)=>`"${String(value??"").replace(/"/g,'""')}"`;const csv=[columns.map(quote).join(","),...rows.map(row=>columns.map(key=>quote(row[key])).join(","))].join("\r\n");const blob=new Blob([csv],{type:"text/csv;charset=utf-8"});const url=URL.createObjectURL(blob);const anchor=document.createElement("a");anchor.href=url;anchor.download=filename;anchor.click();URL.revokeObjectURL(url);}
import { supabase } from "../../lib/supabase";
import type { Profile } from "../../types";

type Toast = { type: "success" | "error" | "warning" } | null;
type Props = { profile: Profile; userId?: string; setToast: (toast: Toast) => void };
type Athlete = Pick<Profile, "user_id" | "full_name" | "username" | "belt" | "discipline" | "academy_id" | "coach_user_id" | "role">;
type LinkRow = { id: string; coach_user_id: string; athlete_user_id: string; academy_id?: string | null; status: string };
type PlanRow = { id: string; user_id: string; coach_user_id: string; title: string; focus_area?: string | null; starts_at?: string | null; ends_at?: string | null; status?: string | null; notes?: string | null };
type Membership = { id: string; academy_id: string; user_id: string; role: string; status: string; joined_at?: string | null };
type Academy = { id: string; owner_user_id: string; name: string; city?: string | null; state?: string | null; country?: string | null; status?: string | null };

type AthleteLookup = Pick<Athlete, "user_id" | "full_name" | "username" | "discipline" | "belt" | "role">;
type TrainingMetric = { user_id:string; session_date:string; minutes:number };
type AttendanceMetric = { user_id:string; attended_at:string; status:string };
type MedalMetric = { user_id:string; awarded_at:string|null; medal_type:string };
type CompetitionMetric = { user_id:string; starts_at:string|null; result:string|null; name?:string|null };
type GroupAttendanceMetric = { athlete_user_id:string; status:string; training_group_sessions?:{session_date:string;status:string}|null };
type InjuryAttentionMetric = { user_id:string; occurred_at:string|null; recovery_status:string|null };
function monthlySeries(rows:Array<{date:string|null}>,key:"sessions"|"records",months=6){const count=Math.max(3,Math.min(12,months));return Array.from({length:count},(_,i)=>{const d=new Date();d.setDate(1);d.setMonth(d.getMonth()-(count-1-i));const month=d.toLocaleDateString(undefined,{month:"short"});const prefix=`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}`;return {month,[key]:rows.filter(x=>x.date?.startsWith(prefix)).length};});}
async function fetchAllPages<T>(fetchPage:(from:number,to:number)=>PromiseLike<any>):Promise<T[]>{const rows:T[]=[];for(let from=0;from<100000;from+=500){const {data,error}=await fetchPage(from,from+499);if(error)throw error;const page=(data||[]) as T[];rows.push(...page);if(page.length<500)return rows;}throw new Error("Analytics result exceeded the safe 100,000-row paging limit. Narrow the date range.");}

function Card({ children }: { children: React.ReactNode }) { return <section className="card panel">{children}</section>; }
function ErrorText({ children }: { children: React.ReactNode }) { return <p className="notice" role="alert">{children}</p>; }

async function resolveAthlete(value: string): Promise<AthleteLookup> {
  const input = value.trim();
  if (!input) throw new Error("Enter an athlete username or user ID.");
  const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  if (uuid.test(input)) {
    if (!supabase) throw new Error("Supabase is not configured.");
    const { data, error } = await supabase.from("profiles").select("user_id,full_name,username,discipline,belt,role,sport").eq("user_id", input).maybeSingle();
    if (error) throw error;
    if (!data || data.role !== "athlete" || String(data.sport || "").toLowerCase() !== "taekwondo") throw new Error("No Taekwondo athlete profile was found for that user ID.");
    return data as AthleteLookup;
  }
  if (!supabase) throw new Error("Supabase is not configured.");
  const { data, error } = await supabase.rpc("find_athlete_by_username", { p_username: input.replace(/^@/, "") });
  if (error) throw error;
  const athlete = Array.isArray(data) ? data[0] : data;
  if (!athlete) throw new Error("No Taekwondo athlete was found with that username.");
  return { ...athlete, role: "athlete" } as AthleteLookup;
}

export function CoachDashboard({ profile, userId, setToast }: Props) {
  const [athletes, setAthletes] = useState<Athlete[]>([]);
  const [links, setLinks] = useState<LinkRow[]>([]);
  const [plans, setPlans] = useState<PlanRow[]>([]);
  const [athleteQuery, setAthleteQuery] = useState("");
  const [foundAthlete, setFoundAthlete] = useState<AthleteLookup | null>(null);
  const [selectedAthlete, setSelectedAthlete] = useState("");
  const [title, setTitle] = useState("");
  const [focus, setFocus] = useState("Kyorugi performance");
  const [notes, setNotes] = useState("");
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [nutritionEnabled, setNutritionEnabled] = useState<Record<string, boolean>>({});
  const [checklistTournaments, setChecklistTournaments] = useState<Array<{id:string;name:string}>>([]);
  const [coachChecklistRows, setCoachChecklistRows] = useState<Array<{id:string;tournament_id:string|null;item:string;category:string;completed:boolean}>>([]);
  const [checklistTournamentId, setChecklistTournamentId] = useState("");
  const [coachChecklistItem, setCoachChecklistItem] = useState("");
  const [coachChecklistCategory, setCoachChecklistCategory] = useState("equipment");
  const [checklistBusy, setChecklistBusy] = useState(false);
  const [checklistMessage, setChecklistMessage] = useState("");
  const [academyAnnouncements, setAcademyAnnouncements] = useState<Array<{id:string;title:string;body:string;published_at:string;read_count:number|null}>>([]);
  const [announcementTitle, setAnnouncementTitle] = useState("");
  const [announcementBody, setAnnouncementBody] = useState("");
  const [announcementBusy, setAnnouncementBusy] = useState(false);
  const [announcementMessage, setAnnouncementMessage] = useState("");
  const [trainingMetrics,setTrainingMetrics]=useState<TrainingMetric[]>([]);
  const [attendanceMetrics,setAttendanceMetrics]=useState<AttendanceMetric[]>([]);
  const [medalMetrics,setMedalMetrics]=useState<MedalMetric[]>([]);
  const [competitionMetrics,setCompetitionMetrics]=useState<CompetitionMetric[]>([]);
  const [groupAttendanceMetrics,setGroupAttendanceMetrics]=useState<GroupAttendanceMetric[]>([]);
  const [injuryAttentionMetrics,setInjuryAttentionMetrics]=useState<InjuryAttentionMetric[]>([]);
  const [attentionUnavailable,setAttentionUnavailable]=useState(false);
  const [analyticsUnavailable,setAnalyticsUnavailable]=useState(false);
  const [rangeMonths,setRangeMonths]=useState(6);

  async function loadAcademyAnnouncements() {
    if (!supabase || !userId || !profile.academy_id) { setAcademyAnnouncements([]); return; }
    const { data, error: loadError } = await supabase.from("announcements").select("id,title,body,published_at").eq("academy_id", profile.academy_id).eq("created_by", userId).order("created_at", { ascending: false }).limit(10);
    if (loadError) { setAnnouncementMessage("Announcements could not be loaded: " + loadError.message); return; }
    const rows = await Promise.all((data || []).map(async (row:any) => {
      const receipt = await supabase.from("announcement_reads").select("id", { count: "exact", head: true }).eq("announcement_id", row.id);
      return { ...row, read_count: receipt.error ? null : (receipt.count || 0) };
    }));
    setAcademyAnnouncements(rows as Array<{id:string;title:string;body:string;published_at:string;read_count:number|null}>);
  }

  useEffect(() => { void loadAcademyAnnouncements(); }, [userId, profile.academy_id]);

  async function publishAcademyAnnouncement() {
    if (!supabase || !profile.academy_id || !announcementTitle.trim() || !announcementBody.trim()) return;
    setAnnouncementBusy(true); setAnnouncementMessage("");
    try {
      const { error: publishError } = await supabase.rpc("publish_academy_announcement", { p_academy_id: profile.academy_id, p_title: announcementTitle.trim(), p_body: announcementBody.trim() });
      if (publishError) throw publishError;
      setAnnouncementTitle(""); setAnnouncementBody(""); setAnnouncementMessage("Announcement published to your academy.");
      await loadAcademyAnnouncements();
    } catch (e) { setAnnouncementMessage(e instanceof Error ? e.message : "Announcement could not be published."); }
    finally { setAnnouncementBusy(false); }
  }

  async function loadAthleteChecklist(athleteId: string) {
    if (!supabase || !athleteId) {
      setChecklistTournaments([]); setCoachChecklistRows([]); setChecklistTournamentId(""); return;
    }
    setChecklistBusy(true); setChecklistMessage("");
    try {
      const [tournamentsResult, checklistResult] = await Promise.all([
        supabase.from("tournaments").select("id,name").eq("user_id", athleteId).order("starts_at", { ascending: true }).limit(100),
        supabase.from("competition_checklists").select("id,tournament_id,item,category,completed").eq("user_id", athleteId).order("created_at", { ascending: true }).limit(300)
      ]);
      if (tournamentsResult.error) throw tournamentsResult.error;
      if (checklistResult.error) throw checklistResult.error;
      const tournaments = (tournamentsResult.data || []) as Array<{id:string;name:string}>;
      setChecklistTournaments(tournaments);
      setCoachChecklistRows((checklistResult.data || []) as Array<{id:string;tournament_id:string|null;item:string;category:string;completed:boolean}>);
      setChecklistTournamentId(current => tournaments.some(item => item.id === current) ? current : (tournaments[0]?.id || ""));
    } catch (e) { setChecklistMessage(e instanceof Error ? e.message : "The athlete checklist could not be loaded."); }
    finally { setChecklistBusy(false); }
  }

  useEffect(() => {
    if (selectedAthlete) void loadAthleteChecklist(selectedAthlete);
    else { setChecklistTournaments([]); setCoachChecklistRows([]); setChecklistTournamentId(""); }
  }, [selectedAthlete]);

  async function load() {
    if (!supabase || !userId) return;
    setLoading(true); setError("");
    const [profileResult, linkResult, planResult, nutritionResult] = await Promise.all([
      supabase.from("profiles").select("user_id,full_name,username,belt,discipline,academy_id,coach_user_id,role").eq("coach_user_id", userId).order("full_name"),
      supabase.from("coach_athlete_links").select("id,coach_user_id,athlete_user_id,academy_id,status").eq("coach_user_id", userId).order("created_at", { ascending: false }),
      supabase.from("training_plans").select("id,user_id,coach_user_id,title,focus_area,starts_at,ends_at,status,notes").eq("coach_user_id", userId).order("created_at", { ascending: false }).limit(50),
      supabase.from("athlete_feature_controls").select("athlete_user_id,enabled").eq("feature_key", "nutrition")
    ]);
    const activeLinkIds = Array.from(new Set((linkResult.data || []).filter((item:any) => item.status === "active").map((item:any) => item.athlete_user_id).filter(Boolean)));
    const linkedProfilesResult = activeLinkIds.length
      ? await supabase.from("profiles").select("user_id,full_name,username,belt,discipline,academy_id,coach_user_id,role").in("user_id", activeLinkIds)
      : { data: [], error: null };
    const rosterById = new Map<string, Athlete>();
    for (const athlete of [...(profileResult.data || []), ...(linkedProfilesResult.data || [])] as Athlete[]) rosterById.set(String(athlete.user_id), athlete);
    const roster = Array.from(rosterById.values());
    const firstError = profileResult.error || linkedProfilesResult.error || linkResult.error || planResult.error || nutritionResult.error;
    if (firstError) setError(firstError.message);
    setAthletes(roster);
    setLinks((linkResult.data || []) as LinkRow[]);
    setPlans((planResult.data || []) as PlanRow[]);
    setNutritionEnabled(Object.fromEntries(((nutritionResult.data || []) as any[]).map((row) => [row.athlete_user_id, row.enabled === true])));
    const athleteIds=Array.from(new Set([...roster.map((a:any)=>a.user_id),...activeLinkIds].filter(Boolean)));
    if(athleteIds.length){
      const start=new Date();start.setDate(1);start.setMonth(start.getMonth()-(rangeMonths-1));
      const startDate=[start.getFullYear(),String(start.getMonth()+1).padStart(2,"0"),"01"].join("-");
      try{
        const [tr,ar,mr,cr,groupAttendanceResult,injuryResult]=await Promise.all([
          fetchAllPages<TrainingMetric>((from,to)=>supabase.from("training_sessions").select("user_id,session_date,minutes").in("user_id",athleteIds).gte("session_date",startDate).order("session_date",{ascending:false}).range(from,to)),
          fetchAllPages<AttendanceMetric>((from,to)=>supabase.from("attendance_records").select("user_id,attended_at,status").in("user_id",athleteIds).gte("attended_at",startDate).order("attended_at",{ascending:false}).range(from,to)),
          fetchAllPages<MedalMetric>((from,to)=>supabase.from("medals").select("user_id,awarded_at,medal_type").in("user_id",athleteIds).gte("awarded_at",startDate).order("awarded_at",{ascending:false}).range(from,to)),
          fetchAllPages<CompetitionMetric>((from,to)=>supabase.from("tournaments").select("user_id,starts_at,result,name").in("user_id",athleteIds).gte("starts_at",startDate).order("starts_at",{ascending:false}).range(from,to)),
          fetchAllPages<GroupAttendanceMetric>((from,to)=>supabase.from("training_group_attendance").select("athlete_user_id,status,training_group_sessions!inner(session_date,status)").in("athlete_user_id",athleteIds).gte("training_group_sessions.session_date",startDate).order("marked_at",{ascending:false}).range(from,to)).then(data=>({data,error:false})).catch(()=>({data:[] as GroupAttendanceMetric[],error:true})),
          fetchAllPages<InjuryAttentionMetric>((from,to)=>supabase.from("injuries").select("user_id,occurred_at,recovery_status").in("user_id",athleteIds).order("occurred_at",{ascending:false}).range(from,to)).then(data=>({data,error:false})).catch(()=>({data:[] as InjuryAttentionMetric[],error:true}))
        ]);
        setTrainingMetrics(tr);setAttendanceMetrics(ar);setMedalMetrics(mr);setCompetitionMetrics(cr);
        setGroupAttendanceMetrics(groupAttendanceResult.data);setInjuryAttentionMetrics(injuryResult.data);
        setAttentionUnavailable(groupAttendanceResult.error||injuryResult.error);setAnalyticsUnavailable(false);
      }catch(e){
        setTrainingMetrics([]);setAttendanceMetrics([]);setMedalMetrics([]);setCompetitionMetrics([]);
        setGroupAttendanceMetrics([]);setInjuryAttentionMetrics([]);setAttentionUnavailable(true);setAnalyticsUnavailable(true);
        setError(e instanceof Error?e.message:"Coach analytics could not be loaded.");
      }
    }else{setTrainingMetrics([]);setAttendanceMetrics([]);setMedalMetrics([]);setCompetitionMetrics([]);setGroupAttendanceMetrics([]);setInjuryAttentionMetrics([]);setAttentionUnavailable(false);setAnalyticsUnavailable(false);}
    setLoading(false);
  }
  useEffect(() => { void load(); }, [userId, rangeMonths]);

  async function findAthlete() {
    setBusy(true); setError(""); setFoundAthlete(null);
    try { setFoundAthlete(await resolveAthlete(athleteQuery)); }
    catch (e) { setError(e instanceof Error ? e.message : "Athlete could not be found."); }
    finally { setBusy(false); }
  }

  async function connectAthlete() {
    if (!supabase || !userId || !foundAthlete?.user_id) return;
    setBusy(true); setError("");
    try {
      const { error: e } = await supabase.rpc("request_coach_athlete_link", { p_athlete_user_id: foundAthlete.user_id });
      if (e) throw e;
      setAthleteQuery(""); setFoundAthlete(null); setToast({ type: "success", message: "Invitation sent. The athlete must accept before their records are shared." }); await load();
    } catch (e) { setError(e instanceof Error ? e.message : "Coach invitation could not be sent."); }
    finally { setBusy(false); }
  }

  async function addCoachChecklistItem() {
    if (!supabase || !selectedAthlete || !checklistTournamentId || !coachChecklistItem.trim()) return;
    setChecklistBusy(true); setChecklistMessage("");
    try {
      const { error: e } = await supabase.from("competition_checklists").insert({ user_id: selectedAthlete, tournament_id: checklistTournamentId, item: coachChecklistItem.trim(), category: coachChecklistCategory, completed: false });
      if (e) throw e;
      setCoachChecklistItem(""); setChecklistMessage("Checklist item added."); await loadAthleteChecklist(selectedAthlete);
    } catch (e) { setChecklistMessage(e instanceof Error ? e.message : "Checklist item could not be saved."); }
    finally { setChecklistBusy(false); }
  }

  async function updateCoachChecklistItem(row: {id:string;completed:boolean}, remove = false) {
    if (!supabase || !selectedAthlete) return;
    setChecklistBusy(true); setChecklistMessage("");
    try {
      const result = remove
        ? await supabase.from("competition_checklists").delete().eq("id", row.id).eq("user_id", selectedAthlete)
        : await supabase.from("competition_checklists").update({ completed: !row.completed }).eq("id", row.id).eq("user_id", selectedAthlete);
      if (result.error) throw result.error;
      await loadAthleteChecklist(selectedAthlete);
    } catch (e) { setChecklistMessage(e instanceof Error ? e.message : "Checklist update failed."); }
    finally { setChecklistBusy(false); }
  }

  async function createPlan() {
    if (!supabase || !userId || !selectedAthlete || !title.trim()) return;
    setBusy(true); setError("");
    try {
      const { error: e } = await supabase.from("training_plans").insert({ user_id: selectedAthlete, coach_user_id: userId, title: title.trim(), focus_area: focus.trim() || null, status: "active", notes: notes.trim() || null });
      if (e) throw e;
      setTitle(""); setNotes(""); setToast({ type: "success", message: "Training plan assigned to the athlete." }); await load();
    } catch (e) { setError(e instanceof Error ? e.message : "Training plan could not be created."); }
    finally { setBusy(false); }
  }

  const activeLinks = links.filter((item) => item.status === "active").length;
  const rangeStart=useMemo(()=>{const d=new Date();d.setDate(1);d.setMonth(d.getMonth()-(rangeMonths-1));d.setHours(0,0,0,0);return d;},[rangeMonths]);
  const filteredTrainingMetrics=useMemo(()=>trainingMetrics.filter(x=>new Date(x.session_date)>=rangeStart),[trainingMetrics,rangeStart]);
  const filteredAttendanceMetrics=useMemo(()=>attendanceMetrics.filter(x=>new Date(x.attended_at)>=rangeStart),[attendanceMetrics,rangeStart]);
  const filteredMedalMetrics=useMemo(()=>medalMetrics.filter(x=>x.awarded_at&&new Date(x.awarded_at)>=rangeStart),[medalMetrics,rangeStart]);
  const filteredCompetitionMetrics=useMemo(()=>competitionMetrics.filter(x=>x.starts_at&&new Date(x.starts_at)>=rangeStart),[competitionMetrics,rangeStart]);
  const trainingByMonth=useMemo(()=>monthlySeries(filteredTrainingMetrics.map(x=>({date:x.session_date})),"sessions",rangeMonths),[filteredTrainingMetrics,rangeMonths]);
  const attendanceByMonth=useMemo(()=>monthlySeries(filteredAttendanceMetrics.map(x=>({date:x.attended_at})),"records",rangeMonths),[filteredAttendanceMetrics,rangeMonths]);
  const presentCount=filteredAttendanceMetrics.filter(x=>["present","attended","late"].includes(String(x.status).toLowerCase())).length;
  const attendanceRate=filteredAttendanceMetrics.length?Math.round(presentCount/filteredAttendanceMetrics.length*100):null;
  const totalMinutes=filteredTrainingMetrics.reduce((sum,x)=>sum+(Number(x.minutes)||0),0);
  function exportCoachReport(){downloadCsv("athleten-coach-roster-report.csv",[
    ...filteredTrainingMetrics.map(x=>({record_type:"training",athlete_user_id:x.user_id,date:x.session_date,value:x.minutes,unit:"minutes"})),
    ...filteredAttendanceMetrics.map(x=>({record_type:"attendance",athlete_user_id:x.user_id,date:x.attended_at,value:x.status,unit:""})),
    ...filteredMedalMetrics.map(x=>({record_type:"medal",athlete_user_id:x.user_id,date:x.awarded_at,value:x.medal_type,unit:""})),
    ...filteredCompetitionMetrics.map(x=>({record_type:"competition",athlete_user_id:x.user_id,date:x.starts_at,value:x.result,unit:""}))
  ]);}
  const medalBreakdown=useMemo(()=>Array.from(new Set(filteredMedalMetrics.map(x=>String(x.medal_type||"Unspecified")))).map(name=>({name,count:filteredMedalMetrics.filter(x=>String(x.medal_type||"Unspecified")===name).length})),[filteredMedalMetrics]);
  const competitionBreakdown=useMemo(()=>Array.from(new Set(filteredCompetitionMetrics.map(x=>String(x.result||"Unrecorded")))).map(name=>({name,count:filteredCompetitionMetrics.filter(x=>String(x.result||"Unrecorded")===name).length})),[filteredCompetitionMetrics]);
  const attentionItems=useMemo(()=>{
    const today=new Date();today.setHours(0,0,0,0);
    const dateKey=(value:Date)=>[value.getFullYear(),String(value.getMonth()+1).padStart(2,"0"),String(value.getDate()).padStart(2,"0")].join("-");
    const todayKey=dateKey(today);
    const cutoff=new Date(today);cutoff.setDate(cutoff.getDate()-30);
    const cutoffKey=dateKey(cutoff);
    const horizon=new Date(today);horizon.setDate(horizon.getDate()+14);
    const horizonKey=dateKey(horizon);
    const reasons=new Map<string,Set<string>>();
    const add=(id:string,reason:string)=>{if(!reasons.has(id))reasons.set(id,new Set());reasons.get(id)!.add(reason);};
    const absences=new Map<string,number>();
    for(const row of groupAttendanceMetrics){
      const session=row.training_group_sessions;
      if(row.status!=="absent"||!session||session.status==="cancelled"||session.session_date<cutoffKey||session.session_date>todayKey)continue;
      absences.set(row.athlete_user_id,(absences.get(row.athlete_user_id)||0)+1);
    }
    for(const [id,count] of absences)if(count>=2)add(id,String(count)+" missed sessions in the last 30 days");
    for(const row of competitionMetrics){
      const date=String(row.starts_at||"").slice(0,10);
      if(date>=todayKey&&date<=horizonKey)add(row.user_id,"Tournament within 14 days"+(row.name?": "+row.name:""));
    }
    const resolved=/^(resolved|closed|cleared|recovered|fully recovered|returned to training|completed)$/i;
    for(const row of injuryAttentionMetrics){
      if(!resolved.test(String(row.recovery_status||"").trim()))add(row.user_id,"Injury record needs follow-up");
    }
    const knownIds=new Set([...athletes.map(a=>a.user_id),...links.filter(x=>x.status==="active").map(x=>x.athlete_user_id)]);
    return Array.from(reasons.entries()).filter(([id])=>knownIds.has(id)).map(([id,items])=>{
      const athlete=athletes.find(a=>a.user_id===id);
      const name=athlete?.full_name||(athlete?.username?"@"+athlete.username:"Linked athlete "+id.slice(0,8));
      return {id,name,reasons:Array.from(items)};
    }).sort((a,b)=>b.reasons.length-a.reasons.length||a.name.localeCompare(b.name));
  },[groupAttendanceMetrics,competitionMetrics,injuryAttentionMetrics,athletes,links]);
  async function toggleNutrition(athleteUserId: string) {
    if (!supabase || !userId) return;
    setBusy(true); setError("");
    try {
      const next = !nutritionEnabled[athleteUserId];
      const { error: e } = await supabase.from("athlete_feature_controls").upsert(
        { athlete_user_id: athleteUserId, feature_key: "nutrition", enabled: next, set_by: userId },
        { onConflict: "athlete_user_id,feature_key" }
      );
      if (e) throw e;
      setNutritionEnabled((current) => ({ ...current, [athleteUserId]: next }));
      setToast({ type: "success", message: next ? "Nutrition tracking enabled for the athlete." : "Nutrition tracking disabled for the athlete." });
    } catch (e) { setError(e instanceof Error ? e.message : "Nutrition access could not be changed."); }
    finally { setBusy(false); }
  }

  return <div className="role-dashboard">
    <div className="page-head"><div><p className="eyebrow">Individual Coach</p><h2>Coach Command Center</h2><p>Manage your athletes, assign Taekwondo training plans, and keep coaching data separate from the athlete workspace.</p></div><div className="role-dashboard-actions"><label className="role-range-picker"><span>Analytics range</span><select value={rangeMonths} onChange={e=>setRangeMonths(Number(e.target.value))}><option value={3}>Last 3 months</option><option value={6}>Last 6 months</option><option value={12}>Last 12 months</option></select></label><button type="button" className="btn" onClick={()=>window.print()}>Print / Save PDF</button><button className="btn" onClick={() => void load()} disabled={loading}><RefreshCw size={15}/> {loading ? "Refreshing…" : "Refresh"}</button></div></div>
    <section className="metrics"><article className="metric card"><div className="metric-icon"><Users size={18}/></div><div><p>Athletes</p><strong>{athletes.length}</strong><small>Linked athlete profiles</small></div></article><article className="metric card"><div className="metric-icon"><UserPlus size={18}/></div><div><p>Active links</p><strong>{activeLinks}</strong><small>Coach relationships</small></div></article><article className="metric card"><div className="metric-icon"><ClipboardList size={18}/></div><div><p>Plans</p><strong>{plans.length}</strong><small>Assigned training plans</small></div></article></section>
    <Card>
      <div className="panel-head"><div><p className="eyebrow">Coach follow-up</p><h3>Needs attention</h3><p className="muted">Signals from linked-athlete records. Review privately with the athlete and guardian where appropriate.</p></div><ShieldCheck size={20}/></div>
      {attentionUnavailable&&<p className="notice" role="status">Some follow-up records could not be checked. Refresh or verify the source records before relying on this list.</p>}
      {loading?<p className="muted">Checking linked-athlete records…</p>:attentionItems.length?<div className="data-list">{attentionItems.slice(0,12).map(item=><div className="detail-row" key={item.id}><div><strong>{item.name}</strong><small>{item.reasons.join(" · ")}</small></div></div>)}</div>:<div className="empty"><strong>No follow-up flags from available records</strong><span>Flags use 2+ absences in 30 days, tournaments in the next 14 days and injury records not marked resolved.</span></div>}
      <p className="muted">This view does not score athletes by body weight or prescribe medical action. It is a reminder to check records and speak with the athlete and guardian.</p>
    </Card>
    <Card>
      <div className="panel-head"><div><p className="eyebrow">Academy communication</p><h3>Announcements</h3><p className="muted">Published to active members of your academy. The sender sees only the read count, not individual private activity.</p></div><Users size={20}/></div>
      {profile.academy_id ? <>
        <label className="field"><span>Title</span><input value={announcementTitle} onChange={e=>setAnnouncementTitle(e.target.value)} maxLength={120} placeholder="Training schedule update"/></label>
        <label className="field"><span>Message</span><textarea value={announcementBody} onChange={e=>setAnnouncementBody(e.target.value)} maxLength={2000} rows={3} placeholder="Write an update for your academy members."/></label>
        <button type="button" className="btn primary" onClick={()=>void publishAcademyAnnouncement()} disabled={announcementBusy || !announcementTitle.trim() || !announcementBody.trim()}>{announcementBusy ? "Publishing…" : "Publish announcement"}</button>
        {announcementMessage && <p className="muted" role="status">{announcementMessage}</p>}
        <div className="details-list">{academyAnnouncements.map(item=><div className="detail-row" key={item.id}><div><strong>{item.title}</strong><small>{item.read_count===null ? "Read count unavailable" : item.read_count+" member(s) viewed"} · {new Date(item.published_at).toLocaleString()}</small><p>{item.body}</p></div></div>)}</div>
        {!academyAnnouncements.length && <p className="muted">No academy announcements published by you yet.</p>}
      </> : <p className="muted">Your coach profile is not assigned to an academy yet. An academy administrator must complete that membership before you can publish academy announcements.</p>}
    </Card>
    {error && <ErrorText>{error}</ErrorText>}
    <section className="role-analytics-grid">
      <article className="card panel role-analytics-card"><div className="panel-head"><div><span className="eyebrow">Roster intelligence</span><h3>Training activity</h3><p className="muted">Monthly sessions from linked athletes · latest {rangeMonths} months</p></div><button className="btn" type="button" onClick={exportCoachReport}>Export CSV</button><BarChart3/></div>{filteredTrainingMetrics.length?<ResponsiveContainer width="100%" height={220}><BarChart data={trainingByMonth}><CartesianGrid strokeDasharray="3 3" stroke="#25405f"/><XAxis dataKey="month" tick={{fill:"#91a8c1",fontSize:11}}/><YAxis allowDecimals={false} tick={{fill:"#91a8c1",fontSize:11}}/><Tooltip contentStyle={{background:"#0c1d32",border:"1px solid #294663",borderRadius:12}}/><Bar dataKey="sessions" name="Training sessions" fill="#49d7ff" radius={[6,6,0,0]}/></BarChart></ResponsiveContainer>:<div className="empty"><strong>No training analytics yet</strong><span>Training sessions from linked athletes will appear here when recorded and accessible.</span></div>}</article>
      <article className="card panel role-analytics-card"><div className="panel-head"><div><span className="eyebrow">Participation</span><h3>Attendance overview</h3><p className="muted">Based on attendance records visible to this coach</p></div><CalendarCheck/></div><div className="role-analytics-kpis"><div><strong>{attendanceRate===null?"—":`${attendanceRate}%`}</strong><small>Attendance rate</small></div><div><strong>{filteredAttendanceMetrics.length}</strong><small>Recorded check-ins in this range</small></div><div><strong>{Math.round(totalMinutes/60*10)/10}h</strong><small>Training hours</small></div></div>{attendanceMetrics.length?<ResponsiveContainer width="100%" height={145}><LineChart data={attendanceByMonth}><CartesianGrid strokeDasharray="3 3" stroke="#25405f"/><XAxis dataKey="month" tick={{fill:"#91a8c1",fontSize:11}}/><YAxis allowDecimals={false} tick={{fill:"#91a8c1",fontSize:11}}/><Tooltip contentStyle={{background:"#0c1d32",border:"1px solid #294663",borderRadius:12}}/><Line type="monotone" dataKey="records" name="Attendance records" stroke="#65e0b5" strokeWidth={3}/></LineChart></ResponsiveContainer>:<div className="empty"><strong>Attendance data will appear here</strong><span>No accessible attendance records were returned for this roster.</span></div>}</article>
    </section>
    {analyticsUnavailable&&<p className="muted" role="status">Some analytics sources are currently unavailable. Available charts are shown without inventing missing values.</p>}
    <section className="role-analytics-grid">
      <article className="card panel role-analytics-card"><div className="panel-head"><div><span className="eyebrow">Achievements</span><h3>Medal distribution</h3><p className="muted">Recorded medal types across your roster</p></div><Trophy/></div>{medalBreakdown.length?<ResponsiveContainer width="100%" height={190}><BarChart data={medalBreakdown} layout="vertical"><CartesianGrid strokeDasharray="3 3" stroke="#25405f"/><XAxis type="number" allowDecimals={false} tick={{fill:"#91a8c1",fontSize:11}}/><YAxis type="category" dataKey="name" width={75} tick={{fill:"#91a8c1",fontSize:11}}/><Tooltip contentStyle={{background:"#0c1d32",border:"1px solid #294663",borderRadius:12}}/><Bar dataKey="count" name="Medals" fill="#f4c45e" radius={[0,6,6,0]}/></BarChart></ResponsiveContainer>:<div className="empty"><strong>No medals recorded yet</strong><span>Roster achievements will appear when recorded.</span></div>}</article>
      <article className="card panel role-analytics-card"><div className="panel-head"><div><span className="eyebrow">Competition outcomes</span><h3>Recorded results</h3><p className="muted">Only outcomes explicitly saved in athlete records</p></div><Award/></div>{competitionBreakdown.length?<ResponsiveContainer width="100%" height={190}><BarChart data={competitionBreakdown}><CartesianGrid strokeDasharray="3 3" stroke="#25405f"/><XAxis dataKey="name" tick={{fill:"#91a8c1",fontSize:10}}/><YAxis allowDecimals={false} tick={{fill:"#91a8c1",fontSize:11}}/><Tooltip contentStyle={{background:"#0c1d32",border:"1px solid #294663",borderRadius:12}}/><Bar dataKey="count" name="Competition records" fill="#7c8cff" radius={[6,6,0,0]}/></BarChart></ResponsiveContainer>:<div className="empty"><strong>No recorded outcomes yet</strong><span>Competition result summaries will appear here when athletes save results.</span></div>}</article>
    </section>
    <div className="grid two">
      <Card><div className="panel-head"><div><p className="eyebrow">Roster</p><h3>Invite an athlete</h3><p className="muted">Search by the athlete's username or paste their user ID. The athlete must accept before a coach relationship becomes active.</p></div><UserPlus size={20}/></div><div className="inline-form"><input value={athleteQuery} onChange={(e) => { setAthleteQuery(e.target.value); setFoundAthlete(null); }} placeholder="@athlete_username or user ID"/><button className="btn" onClick={() => void findAthlete()} disabled={busy || !athleteQuery.trim()}><Search size={15}/> Find</button></div>{foundAthlete && <div className="detail-row"><div><strong>{foundAthlete.full_name || foundAthlete.username}</strong><small>@{foundAthlete.username || "username not set"} · {foundAthlete.discipline?.toUpperCase() || "Taekwondo"} · {foundAthlete.belt || "Belt not set"}</small></div><button className="btn primary" onClick={() => void connectAthlete()} disabled={busy}><UserPlus size={15}/> Send invitation</button></div>}{athletes.length ? <DataList rows={athletes} empty="No athletes linked yet." render={(athlete) => <div><strong>{athlete.full_name || athlete.username || athlete.user_id}</strong><small>{athlete.discipline ? athlete.discipline.toUpperCase() : "Taekwondo"} · {athlete.belt || "Belt not set"}</small></div>}/> : <p className="muted">No athletes linked yet.</p>}</Card>
      <Card><div className="panel-head"><div><p className="eyebrow">Training plans</p><h3>Assign a plan</h3></div><ClipboardList size={20}/></div><label className="field"><span>Athlete</span><select value={selectedAthlete} onChange={(e) => setSelectedAthlete(e.target.value)}><option value="">Choose athlete</option>{athletes.map((athlete) => <option key={athlete.user_id} value={athlete.user_id}>{athlete.full_name || athlete.username || athlete.user_id}</option>)}</select></label><label className="field"><span>Plan title</span><input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Competition preparation"/></label><label className="field"><span>Focus</span><input value={focus} onChange={(e) => setFocus(e.target.value)} placeholder="Kyorugi performance"/></label><label className="field"><span>Coach notes</span><textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={3}/></label><button className="btn primary" onClick={() => void createPlan()} disabled={busy || !selectedAthlete || !title.trim()}><Plus size={15}/> Assign plan</button></Card>
    </div>
    <Card><div className="panel-head"><div><p className="eyebrow">Nutrition</p><h3>Coach-controlled nutrition</h3><p className="muted">Enable nutrition, hydration and optional calorie logging only for athletes you choose.</p></div></div>{athletes.length ? <DataList rows={athletes} empty="No athletes linked yet." render={(athlete) => <div className="membership-row"><div><strong>{athlete.full_name || athlete.username || athlete.user_id}</strong><small>{nutritionEnabled[athlete.user_id] ? "Nutrition enabled" : "Nutrition not enabled"}</small></div><button className="btn" onClick={() => void toggleNutrition(athlete.user_id)} disabled={busy}>{nutritionEnabled[athlete.user_id] ? "Disable" : "Enable"}</button></div>}/> : <p className="muted">Link athletes first.</p>}</Card>
    <Card>
      <div className="panel-head"><div><p className="eyebrow">Tournament preparation</p><h3>Coach-managed checklist</h3><p className="muted">Add preparation tasks to a linked athlete's competition. This is available only after the athlete accepts your invitation.</p></div><ClipboardList size={20}/></div>
      <label className="field"><span>Athlete</span><select value={selectedAthlete} onChange={(e) => setSelectedAthlete(e.target.value)}><option value="">Choose linked athlete</option>{athletes.map((athlete) => <option key={athlete.user_id} value={athlete.user_id}>{athlete.full_name || athlete.username || athlete.user_id}</option>)}</select></label>
      {selectedAthlete && <>
        <label className="field"><span>Tournament</span><select value={checklistTournamentId} onChange={(e) => setChecklistTournamentId(e.target.value)}><option value="">Choose tournament</option>{checklistTournaments.map((event) => <option key={event.id} value={event.id}>{event.name}</option>)}</select></label>
        <div className="inline-form"><input value={coachChecklistItem} onChange={e=>setCoachChecklistItem(e.target.value)} placeholder="Add a preparation task"/><select value={coachChecklistCategory} onChange={e=>setCoachChecklistCategory(e.target.value)}><option value="entry">Entry</option><option value="weigh_in">Weigh-in</option><option value="documents">Documents</option><option value="travel">Travel</option><option value="equipment">Equipment</option><option value="other">Other</option></select><button type="button" className="btn primary" onClick={()=>void addCoachChecklistItem()} disabled={checklistBusy || !checklistTournamentId || !coachChecklistItem.trim()}>Add item</button></div>
        {checklistMessage && <p className="muted" role="status">{checklistMessage}</p>}
        {checklistBusy && <p className="muted">Saving checklist…</p>}
        {coachChecklistRows.filter(row=>row.tournament_id===checklistTournamentId).map(row=><div className="detail-row" key={row.id}><div><strong>{row.item}</strong><small>{String(row.category||"other").replace("_"," ").toUpperCase()} · {row.completed ? "Complete" : "Open"}</small></div><div className="inline-actions"><button type="button" className="btn" onClick={()=>void updateCoachChecklistItem(row)} disabled={checklistBusy}>{row.completed ? "Reopen" : "Mark done"}</button><button type="button" className="btn" onClick={()=>void updateCoachChecklistItem(row,true)} disabled={checklistBusy}>Remove</button></div></div>)}
        {!checklistBusy && checklistTournamentId && !coachChecklistRows.some(row=>row.tournament_id===checklistTournamentId) && <p className="muted">No checklist tasks for this tournament yet.</p>}
        {!checklistTournaments.length && <p className="muted">This athlete has no tournaments saved yet. Ask them to add the event first.</p>}
      </>}
    </Card>
    <Card><h3>Assigned plans</h3>{plans.length ? <DataList rows={plans} empty="No plans yet." render={(plan) => <div><strong>{plan.title}</strong><small>{athletes.find((a) => a.user_id === plan.user_id)?.full_name || plan.user_id} · {plan.focus_area || "General"} · {plan.status || "active"}</small></div>}/> : <p className="muted">Your assigned plans will appear here.</p>}</Card>
  </div>;
}

export function AcademyDashboard({ profile, userId, setToast }: Props) {
  const [academies, setAcademies] = useState<Academy[]>([]);
  const [academyId, setAcademyId] = useState("");
  const [members, setMembers] = useState<Membership[]>([]);
  const [memberProfiles, setMemberProfiles] = useState<Athlete[]>([]);
  const [memberQuery, setMemberQuery] = useState("");
  const [foundMember, setFoundMember] = useState<AthleteLookup | null>(null);
  const [memberRole, setMemberRole] = useState("athlete");
  const [academyName, setAcademyName] = useState("");
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [academyTraining,setAcademyTraining]=useState<TrainingMetric[]>([]);
  const [academyAttendance,setAcademyAttendance]=useState<AttendanceMetric[]>([]);
  const [academyMedals,setAcademyMedals]=useState<MedalMetric[]>([]);
  const [academyCompetitions,setAcademyCompetitions]=useState<CompetitionMetric[]>([]);
  const [rangeMonths,setRangeMonths]=useState(6);

  async function load() {
    if (!supabase || !userId) return;
    setLoading(true); setError("");
    const { data: owned, error: academyError } = await supabase.from("academies").select("id,owner_user_id,name,city,state,country,status").eq("owner_user_id", userId).order("created_at", { ascending: false });
    if (academyError) setError(academyError.message);
    const academyRows = (owned || []) as Academy[];
    setAcademies(academyRows);
    const id = academyId && academyRows.some((a) => a.id === academyId) ? academyId : academyRows[0]?.id || "";
    setAcademyId(id);
    if (!id) { setMembers([]); setMemberProfiles([]); setLoading(false); return; }
    const [membershipResult, profileResult] = await Promise.all([
      supabase.from("academy_memberships").select("id,academy_id,user_id,role,status,joined_at").eq("academy_id", id).order("created_at", { ascending: false }),
      supabase.from("profiles").select("user_id,full_name,username,belt,discipline,academy_id,coach_user_id,role").eq("academy_id", id).order("full_name")
    ]);
    const firstError = membershipResult.error || profileResult.error;
    if (firstError) setError(firstError.message);
    setMembers((membershipResult.data || []) as Membership[]);
    setMemberProfiles((profileResult.data || []) as Athlete[]);
    const athleteIds=(profileResult.data||[]).filter((p:any)=>!["coach","academy_admin","admin","super_admin","support_admin"].includes(String(p.role||""))).map((p:any)=>p.user_id).filter(Boolean);
    if(athleteIds.length){
      const start=new Date();start.setDate(1);start.setMonth(start.getMonth()-(rangeMonths-1));
      const startDate=[start.getFullYear(),String(start.getMonth()+1).padStart(2,"0"),"01"].join("-");
      try{
        const [tr,ar,mr,cr]=await Promise.all([
          fetchAllPages<TrainingMetric>((from,to)=>supabase.from("training_sessions").select("user_id,session_date,minutes").in("user_id",athleteIds).gte("session_date",startDate).order("session_date",{ascending:false}).range(from,to)),
          fetchAllPages<AttendanceMetric>((from,to)=>supabase.from("attendance_records").select("user_id,attended_at,status").eq("academy_id",id).gte("attended_at",startDate).order("attended_at",{ascending:false}).range(from,to)),
          fetchAllPages<MedalMetric>((from,to)=>supabase.from("medals").select("user_id,awarded_at,medal_type").in("user_id",athleteIds).gte("awarded_at",startDate).order("awarded_at",{ascending:false}).range(from,to)),
          fetchAllPages<CompetitionMetric>((from,to)=>supabase.from("tournaments").select("user_id,starts_at,result").in("user_id",athleteIds).gte("starts_at",startDate).order("starts_at",{ascending:false}).range(from,to))
        ]);
        setAcademyTraining(tr);setAcademyAttendance(ar);setAcademyMedals(mr);setAcademyCompetitions(cr);
      }catch(e){
        setAcademyTraining([]);setAcademyAttendance([]);setAcademyMedals([]);setAcademyCompetitions([]);
        setError(e instanceof Error?e.message:"Academy analytics could not be loaded.");
      }
    }else{setAcademyTraining([]);setAcademyAttendance([]);setAcademyMedals([]);setAcademyCompetitions([]);}
    setLoading(false);
  }
  useEffect(() => { void load(); }, [userId, rangeMonths]);

  async function createAcademy() {
    if (!supabase || !userId || !academyName.trim()) return;
    setBusy(true); setError("");
    try {
      const { data, error: e } = await supabase.from("academies").insert({ owner_user_id: userId, name: academyName.trim(), status: "active" }).select("id").single();
      if (e) throw e;
      const { error: me } = await supabase.from("academy_memberships").insert({ academy_id: data.id, user_id: userId, role: "academy_admin", status: "active", joined_at: new Date().toISOString() });
      if (me) throw me;
      setAcademyName(""); setToast({ type: "success", message: "Academy created and your admin membership is active." }); await load();
    } catch (e) { setError(e instanceof Error ? e.message : "Academy could not be created."); }
    finally { setBusy(false); }
  }

  async function findMember() {
    setBusy(true); setError(""); setFoundMember(null);
    try { setFoundMember(await resolveAthlete(memberQuery)); }
    catch (e) { setError(e instanceof Error ? e.message : "Athlete could not be found."); }
    finally { setBusy(false); }
  }

  async function addMember() {
    if (!supabase || !academyId || !foundMember?.user_id) return;
    setBusy(true); setError("");
    try {
      const { error: e } = await supabase.from("academy_memberships").insert({ academy_id: academyId, user_id: foundMember.user_id, role: memberRole, status: "active", joined_at: new Date().toISOString() });
      if (e) throw e;
      setMemberQuery(""); setFoundMember(null); setToast({ type: "success", message: `${memberRole === "athlete" ? "Athlete" : "Coach"} added to the academy.` }); await load();
    } catch (e) { setError(e instanceof Error ? e.message : "Membership could not be added."); }
    finally { setBusy(false); }
  }

  async function updateMember(id: string, status: string) {
    if (!supabase) return;
    const { error: e } = await supabase.from("academy_memberships").update({ status, updated_at: new Date().toISOString() }).eq("id", id);
    if (e) setError(e.message); else { setToast({ type: "success", message: `Membership ${status}.` }); await load(); }
  }

  const selectedAcademy = useMemo(() => academies.find((academy) => academy.id === academyId), [academies, academyId]);
  const academyRangeStart=useMemo(()=>{const d=new Date();d.setDate(1);d.setMonth(d.getMonth()-(rangeMonths-1));d.setHours(0,0,0,0);return d;},[rangeMonths]);
  const filteredAcademyTraining=useMemo(()=>academyTraining.filter(x=>new Date(x.session_date)>=academyRangeStart),[academyTraining,academyRangeStart]);
  const filteredAcademyAttendance=useMemo(()=>academyAttendance.filter(x=>new Date(x.attended_at)>=academyRangeStart),[academyAttendance,academyRangeStart]);
  const filteredAcademyMedals=useMemo(()=>academyMedals.filter(x=>x.awarded_at&&new Date(x.awarded_at)>=academyRangeStart),[academyMedals,academyRangeStart]);
  const filteredAcademyCompetitions=useMemo(()=>academyCompetitions.filter(x=>x.starts_at&&new Date(x.starts_at)>=academyRangeStart),[academyCompetitions,academyRangeStart]);
  const academyTrainingByMonth=useMemo(()=>monthlySeries(filteredAcademyTraining.map(x=>({date:x.session_date})),"sessions",rangeMonths),[filteredAcademyTraining,rangeMonths]);
  const academyAttendanceByMonth=useMemo(()=>monthlySeries(filteredAcademyAttendance.map(x=>({date:x.attended_at})),"records",rangeMonths),[filteredAcademyAttendance,rangeMonths]);
  const academyPresent=filteredAcademyAttendance.filter(x=>["present","attended","late"].includes(String(x.status).toLowerCase())).length;
  const academyAttendanceRate=filteredAcademyAttendance.length?Math.round(academyPresent/filteredAcademyAttendance.length*100):null;
  const academyHours=filteredAcademyTraining.reduce((sum,x)=>sum+(Number(x.minutes)||0),0)/60;
  function exportAcademyReport(){downloadCsv("athleten-academy-performance-report.csv",[
    ...filteredAcademyTraining.map(x=>({record_type:"training",athlete_user_id:x.user_id,date:x.session_date,value:x.minutes,unit:"minutes"})),
    ...filteredAcademyAttendance.map(x=>({record_type:"attendance",athlete_user_id:x.user_id,date:x.attended_at,value:x.status,unit:""})),
    ...filteredAcademyMedals.map(x=>({record_type:"medal",athlete_user_id:x.user_id,date:x.awarded_at,value:x.medal_type,unit:""})),
    ...filteredAcademyCompetitions.map(x=>({record_type:"competition",athlete_user_id:x.user_id,date:x.starts_at,value:x.result,unit:""}))
  ]);}
  const medalCount=filteredAcademyMedals.length;
  const competitionCount=filteredAcademyCompetitions.length;
  const academyMedalBreakdown=useMemo(()=>Array.from(new Set(filteredAcademyMedals.map(x=>String(x.medal_type||"Unspecified")))).map(name=>({name,count:filteredAcademyMedals.filter(x=>String(x.medal_type||"Unspecified")===name).length})),[filteredAcademyMedals]);
  const academyCompetitionBreakdown=useMemo(()=>Array.from(new Set(filteredAcademyCompetitions.map(x=>String(x.result||"Unrecorded")))).map(name=>({name,count:filteredAcademyCompetitions.filter(x=>String(x.result||"Unrecorded")===name).length})),[filteredAcademyCompetitions]);
  return <div className="role-dashboard">
    <div className="page-head"><div><p className="eyebrow">Academy</p><h2>Academy Command Center</h2><p>Run the academy workspace separately from individual athlete accounts: membership, coaches, athletes, and academy operations.</p></div><div className="role-dashboard-actions"><label className="role-range-picker"><span>Analytics range</span><select value={rangeMonths} onChange={e=>setRangeMonths(Number(e.target.value))}><option value={3}>Last 3 months</option><option value={6}>Last 6 months</option><option value={12}>Last 12 months</option></select></label><button type="button" className="btn" onClick={()=>window.print()}>Print / Save PDF</button><button className="btn" onClick={() => void load()} disabled={loading}><RefreshCw size={15}/> {loading ? "Refreshing…" : "Refresh"}</button></div></div>
    {error && <ErrorText>{error}</ErrorText>}
    {!academies.length ? <Card><div className="panel-head"><div><p className="eyebrow">First setup</p><h3>Create your academy</h3><p className="muted">This creates the academy record and makes your account its academy administrator.</p></div><Building2 size={22}/></div><div className="inline-form"><input value={academyName} onChange={(e) => setAcademyName(e.target.value)} placeholder="Academy name"/><button className="btn primary" onClick={() => void createAcademy()} disabled={busy || !academyName.trim()}><Plus size={15}/> Create academy</button></div></Card> : <>
      <section className="metrics"><article className="metric card"><div className="metric-icon"><Building2 size={18}/></div><div><p>Academy</p><strong>{selectedAcademy?.name || "—"}</strong><small>{selectedAcademy?.status || "active"}</small></div></article><article className="metric card"><div className="metric-icon"><Users size={18}/></div><div><p>Active members</p><strong>{members.filter(member=>member.status==="active").length}</strong><small>{members.filter(member=>member.status==="pending").length} pending · {members.length} total</small></div></article><article className="metric card"><div className="metric-icon"><ShieldCheck size={18}/></div><div><p>Athletes</p><strong>{memberProfiles.length}</strong><small>Profiles connected to academy</small></div></article></section>
      <section className="role-analytics-grid">
        <article className="card panel role-analytics-card"><div className="panel-head"><div><span className="eyebrow">Academy intelligence</span><h3>Training activity</h3><p className="muted">Monthly athlete sessions · latest {rangeMonths} months</p></div><button className="btn" type="button" onClick={exportAcademyReport}>Export CSV</button><BarChart3/></div>{filteredAcademyTraining.length?<ResponsiveContainer width="100%" height={220}><BarChart data={academyTrainingByMonth}><CartesianGrid strokeDasharray="3 3" stroke="#25405f"/><XAxis dataKey="month" tick={{fill:"#91a8c1",fontSize:11}}/><YAxis allowDecimals={false} tick={{fill:"#91a8c1",fontSize:11}}/><Tooltip contentStyle={{background:"#0c1d32",border:"1px solid #294663",borderRadius:12}}/><Bar dataKey="sessions" name="Training sessions" fill="#49d7ff" radius={[6,6,0,0]}/></BarChart></ResponsiveContainer>:<div className="empty"><strong>No training data yet</strong><span>Academy athlete training records will appear here when available.</span></div>}</article>
        <article className="card panel role-analytics-card"><div className="panel-head"><div><span className="eyebrow">Participation and outcomes</span><h3>Academy performance</h3><p className="muted">Metrics from accessible academy records</p></div><Trophy/></div><div className="role-analytics-kpis"><div><strong>{academyAttendanceRate===null?"—":`${academyAttendanceRate}%`}</strong><small>Attendance rate</small></div><div><strong>{medalCount}</strong><small>Medals recorded</small></div><div><strong>{competitionCount}</strong><small>Competition records</small></div><div><strong>{academyHours.toFixed(1)}h</strong><small>Training hours</small></div></div>{filteredAcademyAttendance.length?<ResponsiveContainer width="100%" height={145}><LineChart data={academyAttendanceByMonth}><CartesianGrid strokeDasharray="3 3" stroke="#25405f"/><XAxis dataKey="month" tick={{fill:"#91a8c1",fontSize:11}}/><YAxis allowDecimals={false} tick={{fill:"#91a8c1",fontSize:11}}/><Tooltip contentStyle={{background:"#0c1d32",border:"1px solid #294663",borderRadius:12}}/><Line type="monotone" dataKey="records" name="Attendance records" stroke="#65e0b5" strokeWidth={3}/></LineChart></ResponsiveContainer>:<div className="empty"><strong>No attendance data yet</strong><span>Attendance records will populate this view after sessions are recorded.</span></div>}</article>
      </section>
      <section className="role-analytics-grid">
        <article className="card panel role-analytics-card"><div className="panel-head"><div><span className="eyebrow">Achievements</span><h3>Medal distribution</h3><p className="muted">Recorded medal types across academy athletes</p></div><Trophy/></div>{academyMedalBreakdown.length?<ResponsiveContainer width="100%" height={190}><BarChart data={academyMedalBreakdown} layout="vertical"><CartesianGrid strokeDasharray="3 3" stroke="#25405f"/><XAxis type="number" allowDecimals={false} tick={{fill:"#91a8c1",fontSize:11}}/><YAxis type="category" dataKey="name" width={75} tick={{fill:"#91a8c1",fontSize:11}}/><Tooltip contentStyle={{background:"#0c1d32",border:"1px solid #294663",borderRadius:12}}/><Bar dataKey="count" name="Medals" fill="#f4c45e" radius={[0,6,6,0]}/></BarChart></ResponsiveContainer>:<div className="empty"><strong>No medals recorded yet</strong><span>Academy athlete achievements will appear here.</span></div>}</article>
        <article className="card panel role-analytics-card"><div className="panel-head"><div><span className="eyebrow">Competition outcomes</span><h3>Recorded results</h3><p className="muted">Based on saved competition records</p></div><Award/></div>{academyCompetitionBreakdown.length?<ResponsiveContainer width="100%" height={190}><BarChart data={academyCompetitionBreakdown}><CartesianGrid strokeDasharray="3 3" stroke="#25405f"/><XAxis dataKey="name" tick={{fill:"#91a8c1",fontSize:10}}/><YAxis allowDecimals={false} tick={{fill:"#91a8c1",fontSize:11}}/><Tooltip contentStyle={{background:"#0c1d32",border:"1px solid #294663",borderRadius:12}}/><Bar dataKey="count" name="Competition records" fill="#7c8cff" radius={[6,6,0,0]}/></BarChart></ResponsiveContainer>:<div className="empty"><strong>No competition results yet</strong><span>Recorded results will appear here when saved.</span></div>}</article>
      </section>
      <div className="grid two"><Card><div className="panel-head"><div><p className="eyebrow">Membership</p><h3>Add member</h3><p className="muted">Find an athlete by username or user ID, then add them to the academy.</p></div><UserPlus size={20}/></div><div className="inline-form"><input value={memberQuery} onChange={(e) => { setMemberQuery(e.target.value); setFoundMember(null); }} placeholder="@athlete_username or user ID"/><button className="btn" onClick={() => void findMember()} disabled={busy || !memberQuery.trim()}><Search size={15}/> Find</button></div>{foundMember && <div className="detail-row"><div><strong>{foundMember.full_name || foundMember.username}</strong><small>@{foundMember.username || "username not set"} · {foundMember.discipline?.toUpperCase() || "Taekwondo"} · {foundMember.belt || "Belt not set"}</small></div><button className="btn primary" onClick={() => void addMember()} disabled={busy}><UserPlus size={15}/> Add</button></div>}<label className="field"><span>Role</span><select value={memberRole} onChange={(e) => setMemberRole(e.target.value)}><option value="athlete">Athlete</option><option value="coach">Coach</option></select></label></Card><Card><div className="panel-head"><div><p className="eyebrow">Athlete roster</p><h3>Academy athletes</h3></div><Users size={20}/></div>{memberProfiles.length ? <DataList rows={memberProfiles} empty="No athletes yet." render={(member) => <div><strong>{member.full_name || member.username || member.user_id}</strong><small>{member.discipline ? member.discipline.toUpperCase() : "Taekwondo"} · {member.belt || "Belt not set"}</small></div>}/> : <p className="muted">Add athlete memberships to build the roster.</p>}</Card></div>
      <Card><h3>Membership management</h3>{members.length ? <DataList rows={members} empty="No membership records." render={(member) => <div className="membership-row"><div><strong>{memberProfiles.find((p) => p.user_id === member.user_id)?.full_name || member.user_id}</strong><small>{member.role} · {member.status}</small></div>{member.user_id !== userId && <div className="inline-actions"><button className="btn" onClick={() => void updateMember(member.id, member.status === "active" ? "suspended" : "active")}>{member.status === "active" ? "Suspend" : "Activate"}</button></div>}</div>}/> : <p className="muted">No membership records.</p>}</Card>
    </>}
  </div>;
}

export function AthleteConnectionInbox({ userId }: { userId?: string }) {
  const [invitations, setInvitations] = useState<Array<{link_id:string;coach_user_id:string;coach_name:string|null;coach_username:string|null;academy_name:string|null;invited_at:string}>>([]);
  const [message, setMessage] = useState("");
  const [busyId, setBusyId] = useState<string | null>(null);

  async function loadInvitations() {
    if (!supabase || !userId) return;
    const { data, error } = await supabase.rpc("list_my_coach_invitations");
    if (error) {
      setMessage("Coach invitations could not be loaded. " + error.message);
      return;
    }
    setInvitations((data || []) as Array<{link_id:string;coach_user_id:string;coach_name:string|null;coach_username:string|null;academy_name:string|null;invited_at:string}>);
  }

  useEffect(() => { void loadInvitations(); }, [userId]);

  async function respond(linkId: string, accept: boolean) {
    if (!supabase) return;
    setBusyId(linkId);
    setMessage("");
    const { error } = await supabase.rpc("respond_to_coach_invitation", { p_link_id: linkId, p_accept: accept });
    if (error) setMessage(error.message);
    else setMessage(accept ? "Coach connection accepted." : "Invitation declined.");
    await loadInvitations();
    setBusyId(null);
  }

  return <Card>
    <div className="panel-head"><div><p className="eyebrow">Connections</p><h3>Coach invitations</h3><p className="muted">A coach cannot access connected athlete records until the athlete accepts.</p></div><Users size={20}/></div>
    {message && <p className="muted" role="status">{message}</p>}
    {invitations.length ? <div className="details-list">{invitations.map(invitation=><div className="detail-row" key={invitation.link_id}><div><strong>{invitation.coach_name || invitation.coach_username || "AthleteN coach"}</strong><small>{invitation.coach_username ? "@"+invitation.coach_username+" · " : ""}{invitation.academy_name || "Coach connection request"}</small></div><div className="inline-actions"><button type="button" className="btn primary" onClick={()=>void respond(invitation.link_id,true)} disabled={busyId===invitation.link_id}>Accept</button><button type="button" className="btn" onClick={()=>void respond(invitation.link_id,false)} disabled={busyId===invitation.link_id}>Decline</button></div></div>)}</div> : <p className="muted">No pending coach invitations.</p>}
  </Card>;
}

function DataList<T>({ rows, render }: { rows: T[]; empty: string; render: (row: T) => React.ReactNode }) {
  if (!rows.length) return <p className="muted">No records.</p>;
  return <div className="details-list">{rows.map((row, index) => <div className="detail-row" key={(row as { id?: string }).id || index}>{render(row)}</div>)}</div>;
}
