import { useEffect, useMemo, useState } from "react";
import { Plus, RefreshCw, ShieldCheck, Users, UserPlus, ClipboardList, Building2, Search } from "lucide-react";
import { supabase } from "../../lib/supabase";
import type { Profile } from "../../types";

type Toast = { type: "success" | "error" | "warning" } | null;
type Props = { profile: Profile; userId?: string; setToast: (toast: Toast) => void };
type Athlete = Pick<Profile, "user_id" | "full_name" | "username" | "belt" | "discipline" | "academy_id" | "coach_user_id">;
type LinkRow = { id: string; coach_user_id: string; athlete_user_id: string; academy_id?: string | null; status: string };
type PlanRow = { id: string; user_id: string; coach_user_id: string; title: string; focus_area?: string | null; starts_at?: string | null; ends_at?: string | null; status?: string | null; notes?: string | null };
type Membership = { id: string; academy_id: string; user_id: string; role: string; status: string; joined_at?: string | null };
type Academy = { id: string; owner_user_id: string; name: string; city?: string | null; state?: string | null; country?: string | null; status?: string | null };

type AthleteLookup = Pick<Athlete, "user_id" | "full_name" | "username" | "discipline" | "belt">;

function Card({ children }: { children: React.ReactNode }) { return <section className="card panel">{children}</section>; }
function ErrorText({ children }: { children: React.ReactNode }) { return <p className="notice" role="alert">{children}</p>; }

async function resolveAthlete(value: string): Promise<AthleteLookup> {
  const input = value.trim();
  if (!input) throw new Error("Enter an athlete username or user ID.");
  const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  if (uuid.test(input)) {
    if (!supabase) throw new Error("Supabase is not configured.");
    const { data, error } = await supabase.from("profiles").select("user_id,full_name,username,discipline,belt").eq("user_id", input).maybeSingle();
    if (error) throw error;
    if (!data || data.role === "coach" || data.role === "academy_admin") throw new Error("No athlete profile was found for that user ID.");
    return data as AthleteLookup;
  }
  if (!supabase) throw new Error("Supabase is not configured.");
  const { data, error } = await supabase.rpc("find_athlete_by_username", { p_username: input.replace(/^@/, "") });
  if (error) throw error;
  const athlete = Array.isArray(data) ? data[0] : data;
  if (!athlete) throw new Error("No Taekwondo athlete was found with that username.");
  return athlete as AthleteLookup;
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

  async function load() {
    if (!supabase || !userId) return;
    setLoading(true); setError("");
    const [profileResult, linkResult, planResult] = await Promise.all([
      supabase.from("profiles").select("user_id,full_name,username,belt,discipline,academy_id,coach_user_id").eq("coach_user_id", userId).order("full_name"),
      supabase.from("coach_athlete_links").select("id,coach_user_id,athlete_user_id,academy_id,status").eq("coach_user_id", userId).order("created_at", { ascending: false }),
      supabase.from("training_plans").select("id,user_id,coach_user_id,title,focus_area,starts_at,ends_at,status,notes").eq("coach_user_id", userId).order("created_at", { ascending: false }).limit(50)
    ]);
    const firstError = profileResult.error || linkResult.error || planResult.error;
    if (firstError) setError(firstError.message);
    setAthletes((profileResult.data || []) as Athlete[]);
    setLinks((linkResult.data || []) as LinkRow[]);
    setPlans((planResult.data || []) as PlanRow[]);
    setLoading(false);
  }
  useEffect(() => { void load(); }, [userId]);

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
      const { error: e } = await supabase.from("coach_athlete_links").insert({ coach_user_id: userId, athlete_user_id: foundAthlete.user_id, status: "active" });
      if (e) throw e;
      setAthleteQuery(""); setFoundAthlete(null); setToast({ type: "success", message: "Athlete linked to your coach workspace." }); await load();
    } catch (e) { setError(e instanceof Error ? e.message : "Athlete could not be linked."); }
    finally { setBusy(false); }
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
  return <div className="role-dashboard">
    <div className="page-head"><div><p className="eyebrow">Individual Coach</p><h2>Coach Command Center</h2><p>Manage your athletes, assign Taekwondo training plans, and keep coaching data separate from the athlete workspace.</p></div><button className="btn" onClick={() => void load()} disabled={loading}><RefreshCw size={15}/> {loading ? "Refreshing…" : "Refresh"}</button></div>
    <section className="metrics"><article className="metric card"><div className="metric-icon"><Users size={18}/></div><div><p>Athletes</p><strong>{athletes.length}</strong><small>Linked athlete profiles</small></div></article><article className="metric card"><div className="metric-icon"><UserPlus size={18}/></div><div><p>Active links</p><strong>{activeLinks}</strong><small>Coach relationships</small></div></article><article className="metric card"><div className="metric-icon"><ClipboardList size={18}/></div><div><p>Plans</p><strong>{plans.length}</strong><small>Assigned training plans</small></div></article></section>
    {error && <ErrorText>{error}</ErrorText>}
    <div className="grid two">
      <Card><div className="panel-head"><div><p className="eyebrow">Roster</p><h3>Link an athlete</h3><p className="muted">Search by the athlete's username or paste their user ID from their profile.</p></div><UserPlus size={20}/></div><div className="inline-form"><input value={athleteQuery} onChange={(e) => { setAthleteQuery(e.target.value); setFoundAthlete(null); }} placeholder="@athlete_username or user ID"/><button className="btn" onClick={() => void findAthlete()} disabled={busy || !athleteQuery.trim()}><Search size={15}/> Find</button></div>{foundAthlete && <div className="detail-row"><div><strong>{foundAthlete.full_name || foundAthlete.username}</strong><small>@{foundAthlete.username || "username not set"} · {foundAthlete.discipline?.toUpperCase() || "Taekwondo"} · {foundAthlete.belt || "Belt not set"}</small></div><button className="btn primary" onClick={() => void connectAthlete()} disabled={busy}><UserPlus size={15}/> Link athlete</button></div>}{athletes.length ? <DataList rows={athletes} empty="No athletes linked yet." render={(athlete) => <div><strong>{athlete.full_name || athlete.username || athlete.user_id}</strong><small>{athlete.discipline ? athlete.discipline.toUpperCase() : "Taekwondo"} · {athlete.belt || "Belt not set"}</small></div>}/> : <p className="muted">No athletes linked yet.</p>}</Card>
      <Card><div className="panel-head"><div><p className="eyebrow">Training plans</p><h3>Assign a plan</h3></div><ClipboardList size={20}/></div><label className="field"><span>Athlete</span><select value={selectedAthlete} onChange={(e) => setSelectedAthlete(e.target.value)}><option value="">Choose athlete</option>{athletes.map((athlete) => <option key={athlete.user_id} value={athlete.user_id}>{athlete.full_name || athlete.username || athlete.user_id}</option>)}</select></label><label className="field"><span>Plan title</span><input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Competition preparation"/></label><label className="field"><span>Focus</span><input value={focus} onChange={(e) => setFocus(e.target.value)} placeholder="Kyorugi performance"/></label><label className="field"><span>Coach notes</span><textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={3}/></label><button className="btn primary" onClick={() => void createPlan()} disabled={busy || !selectedAthlete || !title.trim()}><Plus size={15}/> Assign plan</button></Card>
    </div>
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
      supabase.from("profiles").select("user_id,full_name,username,belt,discipline,academy_id,coach_user_id").eq("academy_id", id).order("full_name")
    ]);
    const firstError = membershipResult.error || profileResult.error;
    if (firstError) setError(firstError.message);
    setMembers((membershipResult.data || []) as Membership[]);
    setMemberProfiles((profileResult.data || []) as Athlete[]);
    setLoading(false);
  }
  useEffect(() => { void load(); }, [userId]);

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
  return <div className="role-dashboard">
    <div className="page-head"><div><p className="eyebrow">Academy</p><h2>Academy Command Center</h2><p>Run the academy workspace separately from individual athlete accounts: membership, coaches, athletes, and academy operations.</p></div><button className="btn" onClick={() => void load()} disabled={loading}><RefreshCw size={15}/> {loading ? "Refreshing…" : "Refresh"}</button></div>
    {error && <ErrorText>{error}</ErrorText>}
    {!academies.length ? <Card><div className="panel-head"><div><p className="eyebrow">First setup</p><h3>Create your academy</h3><p className="muted">This creates the academy record and makes your account its academy administrator.</p></div><Building2 size={22}/></div><div className="inline-form"><input value={academyName} onChange={(e) => setAcademyName(e.target.value)} placeholder="Academy name"/><button className="btn primary" onClick={() => void createAcademy()} disabled={busy || !academyName.trim()}><Plus size={15}/> Create academy</button></div></Card> : <>
      <section className="metrics"><article className="metric card"><div className="metric-icon"><Building2 size={18}/></div><div><p>Academy</p><strong>{selectedAcademy?.name || "—"}</strong><small>{selectedAcademy?.status || "active"}</small></div></article><article className="metric card"><div className="metric-icon"><Users size={18}/></div><div><p>Members</p><strong>{members.length}</strong><small>Active and pending membership records</small></div></article><article className="metric card"><div className="metric-icon"><ShieldCheck size={18}/></div><div><p>Athletes</p><strong>{memberProfiles.length}</strong><small>Profiles connected to academy</small></div></article></section>
      <div className="grid two"><Card><div className="panel-head"><div><p className="eyebrow">Membership</p><h3>Add member</h3><p className="muted">Find an athlete by username or user ID, then add them to the academy.</p></div><UserPlus size={20}/></div><div className="inline-form"><input value={memberQuery} onChange={(e) => { setMemberQuery(e.target.value); setFoundMember(null); }} placeholder="@athlete_username or user ID"/><button className="btn" onClick={() => void findMember()} disabled={busy || !memberQuery.trim()}><Search size={15}/> Find</button></div>{foundMember && <div className="detail-row"><div><strong>{foundMember.full_name || foundMember.username}</strong><small>@{foundMember.username || "username not set"} · {foundMember.discipline?.toUpperCase() || "Taekwondo"} · {foundMember.belt || "Belt not set"}</small></div><button className="btn primary" onClick={() => void addMember()} disabled={busy}><UserPlus size={15}/> Add</button></div>}<label className="field"><span>Role</span><select value={memberRole} onChange={(e) => setMemberRole(e.target.value)}><option value="athlete">Athlete</option><option value="coach">Coach</option></select></label></Card><Card><div className="panel-head"><div><p className="eyebrow">Athlete roster</p><h3>Academy athletes</h3></div><Users size={20}/></div>{memberProfiles.length ? <DataList rows={memberProfiles} empty="No athletes yet." render={(member) => <div><strong>{member.full_name || member.username || member.user_id}</strong><small>{member.discipline ? member.discipline.toUpperCase() : "Taekwondo"} · {member.belt || "Belt not set"}</small></div>}/> : <p className="muted">Add athlete memberships to build the roster.</p>}</Card></div>
      <Card><h3>Membership management</h3>{members.length ? <DataList rows={members} empty="No membership records." render={(member) => <div className="membership-row"><div><strong>{memberProfiles.find((p) => p.user_id === member.user_id)?.full_name || member.user_id}</strong><small>{member.role} · {member.status}</small></div>{member.user_id !== userId && <div className="inline-actions"><button className="btn" onClick={() => void updateMember(member.id, member.status === "active" ? "suspended" : "active")}>{member.status === "active" ? "Suspend" : "Activate"}</button></div>}</div>}/> : <p className="muted">No membership records.</p>}</Card>
    </>}
  </div>;
}

function DataList<T>({ rows, render }: { rows: T[]; empty: string; render: (row: T) => React.ReactNode }) {
  if (!rows.length) return <p className="muted">No records.</p>;
  return <div className="details-list">{rows.map((row, index) => <div className="detail-row" key={(row as { id?: string }).id || index}>{render(row)}</div>)}</div>;
}
