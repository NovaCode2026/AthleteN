import { useCallback, useEffect, useMemo, useState } from "react";
import { Download, RefreshCw, Share2, Sparkles, Swords } from "lucide-react";
import { supabase } from "../../lib/supabase";
import { useAuth } from "../../hooks/useAuth";
import type { Profile } from "../../types";

type Toast = (toast: { type: "success" | "error" | "warning"; message: string }) => void;
type ReportRow = { id: string; report_type: "match" | "monthly"; title: string; period_start?: string | null; period_end?: string | null; content: string; created_at: string };
type MonthlySnapshot = { role: string; periodStart: string; periodEnd: string; athleteCount: number; sessions: number; trainingMinutes: number; medals: number; competitions: number; activeGoals: number; medalBreakdown: Record<string, number> };

const roleLabel = (role: string) => role === "academy_admin" ? "Academy" : role === "coach" ? "Coach" : "Athlete";
const paidPlanForRole = (role: string, plan: string) => role === "coach" ? plan === "coach" : role === "academy_admin" ? plan === "academy" : ["student", "pro", "elite"].includes(plan);
const previousMonth = () => {
  const now = new Date();
  const start = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  const end = new Date(now.getFullYear(), now.getMonth(), 1);
  return { start: start.toISOString().slice(0, 10), end: end.toISOString().slice(0, 10), label: start.toLocaleString(undefined, { month: "long", year: "numeric" }) };
};

export default function IntelligenceReportsPage({ setToast, profile }: { setToast: Toast; profile: Profile }) {
  const auth = useAuth();
  const uid = auth.user?.id;
  const role = String(profile.role || "athlete");
  const plan = String(profile.plan_id || "free");
  const eligible = paidPlanForRole(role, plan);
  const [reports, setReports] = useState<ReportRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<"monthly" | "match" | null>(null);
  const [selectedReport, setSelectedReport] = useState<ReportRow | null>(null);
  const [match, setMatch] = useState({ event: "", opponent: "", result: "", score: "", notes: "" });
  const period = useMemo(previousMonth, []);
  const [snapshot, setSnapshot] = useState<MonthlySnapshot | null>(null);

  const loadReports = useCallback(async () => {
    if (!uid) return;
    setLoading(true);
    const { data, error } = await supabase.from("ai_intelligence_reports")
      .select("id,report_type,title,period_start,period_end,content,created_at")
      .eq("user_id", uid).order("created_at", { ascending: false }).limit(12);
    if (error) setToast({ type: "error", message: "Saved reports could not be loaded: " + error.message });
    else setReports((data || []) as ReportRow[]);
    setLoading(false);
  }, [uid, setToast]);

  useEffect(() => { void loadReports(); }, [loadReports]);

  async function getMonthlySnapshot(): Promise<MonthlySnapshot> {
    if (!uid) throw new Error("Sign in to generate a report.");
    let athleteIds = [uid];
    if (role === "coach") {
      const links = await supabase.from("coach_athlete_links").select("athlete_user_id").eq("coach_user_id", uid).eq("status", "active");
      if (links.error) throw links.error;
      athleteIds = [...new Set((links.data || []).map((x: any) => String(x.athlete_user_id)))];
    } else if (role === "academy_admin") {
      let academyId = String(profile.academy_id || "");
      if (!academyId) {
        const academy = await supabase.from("academies").select("id").eq("owner_user_id", uid).eq("status", "active").order("created_at", { ascending: false }).limit(1).maybeSingle();
        if (academy.error) throw academy.error;
        academyId = String(academy.data?.id || "");
      }
      if (academyId) {
        const members = await supabase.from("academy_memberships").select("user_id").eq("academy_id", academyId).eq("status", "active").eq("role", "athlete");
        if (members.error) throw members.error;
        athleteIds = [...new Set((members.data || []).map((x: any) => String(x.user_id)))];
      } else athleteIds = [];
    }
    if (role === "athlete") athleteIds = [uid];
    if (!athleteIds.length) return { role, periodStart: period.start, periodEnd: period.end, athleteCount: 0, sessions: 0, trainingMinutes: 0, medals: 0, competitions: 0, activeGoals: 0, medalBreakdown: {} };

    const [training, medals, competitions, goals] = await Promise.all([
      supabase.from("training_sessions").select("user_id,session_date,minutes").in("user_id", athleteIds).gte("session_date", period.start).lt("session_date", period.end),
      supabase.from("medals").select("user_id,awarded_at,medal_type").in("user_id", athleteIds).gte("awarded_at", period.start).lt("awarded_at", period.end),
      supabase.from("tournaments").select("user_id,starts_at,status").in("user_id", athleteIds).gte("starts_at", period.start).lt("starts_at", period.end),
      supabase.from("goals").select("user_id,status").in("user_id", athleteIds)
    ]);
    const failed = [training, medals, competitions, goals].find((x) => x.error);
    if (failed?.error) throw failed.error;
    const medalBreakdown: Record<string, number> = {};
    (medals.data || []).forEach((m: any) => { const key = String(m.medal_type || "Unspecified"); medalBreakdown[key] = (medalBreakdown[key] || 0) + 1; });
    return {
      role, periodStart: period.start, periodEnd: period.end,
      athleteCount: role === "athlete" ? 1 : athleteIds.length,
      sessions: (training.data || []).length,
      trainingMinutes: (training.data || []).reduce((sum: number, x: any) => sum + Number(x.minutes || 0), 0),
      medals: (medals.data || []).length,
      competitions: (competitions.data || []).length,
      activeGoals: (goals.data || []).filter((x: any) => !["completed", "cancelled"].includes(String(x.status || "").toLowerCase())).length,
      medalBreakdown
    };
  }

  async function callAi(topic: string, prompt: string) {
    const token = auth.session?.access_token;
    if (!token) throw new Error("Your session expired. Sign in again.");
    const response = await fetch("/.netlify/functions/ai-coach", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: "Bearer " + token },
      body: JSON.stringify({ topic, prompt })
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(payload.error || "AI report generation failed.");
    return String(payload.answer || "");
  }

  async function generateMonthly() {
    if (!eligible || !uid) { setToast({ type: "warning", message: "An active paid plan for your account role is required for AI reports." }); return; }
    setBusy("monthly");
    try {
      const facts = await getMonthlySnapshot();
      setSnapshot(facts);
      const prompt = [
        "Create an AthleteN monthly performance report for the completed period " + facts.periodStart + " to " + facts.periodEnd + ".",
        "Account role: " + roleLabel(role) + ". Use only these verified account-record totals; do not infer missing data.",
        "Athletes included: " + facts.athleteCount,
        "Training sessions: " + facts.sessions,
        "Training minutes: " + facts.trainingMinutes,
        "Medals: " + facts.medals + " (" + JSON.stringify(facts.medalBreakdown) + ")",
        "Competitions recorded: " + facts.competitions,
        "Goals not marked completed/cancelled: " + facts.activeGoals,
        "Write sections: Monthly overview, recorded highlights, consistency observations, what the data cannot tell us, and practical next-month priorities. Do not invent attendance, heart-rate, technical or match facts."
      ].join("\n");
      const answer = await callAi("Performance Reports", prompt);
      const title = roleLabel(role) + " Monthly Report · " + period.label;
      const { error } = await supabase.from("ai_intelligence_reports").insert({
        user_id: uid, report_type: "monthly", subject_role: role, title,
        period_start: facts.periodStart, period_end: facts.periodEnd, input_snapshot: facts, content: answer
      });
      if (error) throw error;
      setToast({ type: "success", message: "Monthly report generated and saved." });
      await loadReports();
    } catch (error) { setToast({ type: "error", message: error instanceof Error ? error.message : "Monthly report failed." }); }
    finally { setBusy(null); }
  }

  async function generateMatch() {
    if (!eligible || !uid) { setToast({ type: "warning", message: "An active paid plan for your account role is required for AI reports." }); return; }
    if (!match.event.trim() || !match.result.trim() || !match.notes.trim()) { setToast({ type: "warning", message: "Enter the event, result and match observations first." }); return; }
    setBusy("match");
    try {
      const prompt = [
        "Create an AthleteN AI match report using only the details supplied below.",
        "Event: " + match.event, "Opponent/style (if known): " + (match.opponent || "Not provided"),
        "Result/round: " + match.result, "Score (if recorded): " + (match.score || "Not provided"),
        "Athlete/coach observations: " + match.notes,
        "Use sections: Match summary, observed strengths, areas to review, tactical lessons, and next-practice priorities.",
        "Do not invent scoring events, techniques, statistics, or claim to have analysed video. Distinguish supplied observations from suggestions."
      ].join("\n");
      const answer = await callAi("Match Analysis", prompt);
      const title = "Match Report · " + match.event.trim();
      const { error } = await supabase.from("ai_intelligence_reports").insert({
        user_id: uid, report_type: "match", subject_role: role, title,
        input_snapshot: match, content: answer
      });
      if (error) throw error;
      setSelectedReport({ id: "new", report_type: "match", title, content: answer, created_at: new Date().toISOString() });
      setMatch({ event: "", opponent: "", result: "", score: "", notes: "" });
      setToast({ type: "success", message: "AI match report generated and saved." });
      await loadReports();
    } catch (error) { setToast({ type: "error", message: error instanceof Error ? error.message : "Match report failed." }); }
    finally { setBusy(null); }
  }

  function download(report: ReportRow) {
    const blob = new Blob([report.title + "\n\n" + report.content], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a"); link.href = url; link.download = "athleten-" + report.report_type + "-report.txt"; link.click(); URL.revokeObjectURL(url);
  }
  async function share(report: ReportRow) {
    const content = report.title + "\n\n" + report.content;
    try { if (navigator.share) await navigator.share({ title: report.title, text: content }); else { await navigator.clipboard.writeText(content); setToast({ type: "success", message: "Report copied to clipboard." }); } }
    catch (error) { if (error instanceof Error && error.name !== "AbortError") setToast({ type: "error", message: "Report could not be shared." }); }
  }

  const currentReport = selectedReport || reports[0] || null;
  return <Page title="AthleteN Intelligence Reports" subtitle="AI match analysis and monthly reporting, grounded in your saved AthleteN records." actions={<button className="btn" onClick={() => void loadReports()}><RefreshCw size={15}/> Refresh</button>}>
    {!eligible ? <section className="card panel"><h3><Sparkles size={18}/> AI reports are a paid feature</h3><p>Choose the plan for your account type to unlock AI Match Reports and AI Monthly Reports. Your report history remains private to your account.</p><a className="btn primary" href="/plans">View paid plans</a></section> : <>
      <div className="grid two">
        <section className="card panel"><div className="section-heading"><Swords size={20}/><div><h3>AI Match Report</h3><p className="messaging-help">Turn a match result and your observations into a structured review.</p></div></div>
          <label className="field"><span>Event / tournament *</span><input value={match.event} onChange={e=>setMatch({...match,event:e.target.value})} maxLength={120}/></label>
          <label className="field"><span>Opponent / style (optional)</span><input value={match.opponent} onChange={e=>setMatch({...match,opponent:e.target.value})} maxLength={160}/></label>
          <label className="field"><span>Result / round reached *</span><input value={match.result} onChange={e=>setMatch({...match,result:e.target.value})} maxLength={100}/></label>
          <label className="field"><span>Score (optional)</span><input value={match.score} onChange={e=>setMatch({...match,score:e.target.value})} maxLength={60}/></label>
          <label className="field"><span>Match observations *</span><textarea rows={4} value={match.notes} onChange={e=>setMatch({...match,notes:e.target.value})} maxLength={2000} placeholder="What happened? What worked? What would you review with your coach?"/></label>
          <button className="btn primary" disabled={!!busy} onClick={()=>void generateMatch()}>{busy==="match"?"Generating…":"Generate AI Match Report"}</button>
        </section>
        <section className="card panel"><div className="section-heading"><Sparkles size={20}/><div><h3>AI Monthly Report</h3><p className="messaging-help">Completed month: {period.label}</p></div></div>
          <p>Summarises sessions, training time, competition entries, medals and current goals for the {roleLabel(role).toLowerCase()} workspace.</p>
          {snapshot&&<div className="metrics"><div><strong>{snapshot.sessions}</strong><span>Sessions</span></div><div><strong>{Math.round(snapshot.trainingMinutes/60*10)/10} h</strong><span>Training time</span></div><div><strong>{snapshot.medals}</strong><span>Medals</span></div><div><strong>{snapshot.athleteCount}</strong><span>Athletes</span></div></div>}
          <button className="btn primary" disabled={!!busy} onClick={()=>void generateMonthly()}>{busy==="monthly"?"Generating…":"Generate AI Monthly Report"}</button>
        </section>
      </div>
    </>}
    <section className="card panel"><div className="section-heading"><h3>Saved report history</h3></div>
      {loading?<p>Loading reports…</p>:reports.length?<div className="grid two">{reports.map(report=><button key={report.id} className="btn" onClick={()=>setSelectedReport(report)} style={{display:"block",textAlign:"left",padding:14}}><strong>{report.title}</strong><br/><small>{report.report_type.toUpperCase()} · {new Date(report.created_at).toLocaleString()}</small></button>)}</div>:<p className="empty-copy">No AI reports generated yet.</p>}
    </section>
    {currentReport&&<section className="card panel"><div className="section-heading"><div><p className="eyebrow">SAVED REPORT</p><h3>{currentReport.title}</h3></div><div className="inline-actions"><button className="btn" onClick={()=>void share(currentReport)}><Share2 size={14}/> Share</button><button className="btn" onClick={()=>download(currentReport)}><Download size={14}/> Download</button></div></div><div className="answer" style={{whiteSpace:"pre-wrap"}}>{currentReport.content}</div></section>}
  </Page>;
}
