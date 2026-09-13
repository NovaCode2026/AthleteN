import { useEffect, useMemo, useState } from "react";
import { Activity, AlertTriangle, Check, ChevronRight, Database, FileCheck2, Flag, Megaphone, RefreshCw, Search, ShieldCheck, Ticket, Trash2, Users, X } from "lucide-react";
import { supabase } from "../../lib/supabase";
import "./AdminControlCenter.css";

type AdminControlCenterProps = { userId: string; role: string };
type RecordRow = Record<string, unknown>;
type Section = { key: string; label: string; table: string; group: string; deleteAllowed?: boolean };
type Summary = { key: string; label: string; table: string; count: number; error?: string };

const sections: Section[] = [
  ["profiles", "Users / Profiles", "profiles", "People"],
  ["academies", "Academies", "academies", "People"],
  ["academyMemberships", "Academy Memberships", "academy_memberships", "People"],
  ["training", "Training Sessions", "training_sessions", "Athlete data"],
  ["trainingPlans", "Training Plans", "training_plans", "Athlete data"],
  ["attendance", "Attendance", "attendance_records", "Athlete data"],
  ["tournaments", "Tournaments", "tournaments", "Competition"],
  ["matches", "Matches", "matches", "Competition"],
  ["medals", "Medals", "medals", "Competition"],
  ["certificates", "Certificates", "certificates", "Athlete data"],
  ["documents", "Documents", "documents", "Athlete data"],
  ["weights", "Weight Logs", "weight_logs", "Athlete data"],
  ["calendar", "Calendar", "calendar_events", "Athlete data"],
  ["notifications", "Notifications", "notifications", "Operations", false],
  ["checklist", "Competition Checklist", "competition_checklists", "Competition"],
  ["injuries", "Injuries", "injuries", "Athlete data"],
  ["goals", "Goals", "goals", "Athlete data"],
  ["feedback", "Feedback", "feedback_items", "Operations"],
  ["verifications", "Student Verification", "student_verifications", "Trust & safety"],
  ["roadmap", "Roadmap", "roadmap_items", "Product"],
  ["roadmapVotes", "Roadmap Votes", "roadmap_votes", "Product"],
  ["tournamentScans", "Tournament Scans", "tournament_scans", "Competition"],
  ["referrals", "Referrals", "referrals", "Growth"],
  ["badges", "Athlete Badges", "athlete_badges", "Growth"],
  ["aiUsage", "AI Usage", "ai_usage_events", "Usage & billing"],
  ["subscriptions", "Subscriptions", "subscriptions", "Usage & billing"],
  ["subscriptionUsage", "Subscription Usage", "subscription_usage", "Usage & billing"],
  ["paymentEvents", "Payment Events", "payment_events", "Usage & billing"],
  ["support", "Support Tickets", "support_tickets", "Operations", false],
  ["announcements", "Announcements", "announcements", "Operations"],
  ["featureFlags", "Feature Flags", "feature_flags", "System"],
  ["auditLogs", "Audit Logs", "audit_logs", "System", false],
].map(([key, label, table, group, deleteAllowed = true]) => ({ key, label, table, group, deleteAllowed }));

const groups = ["People", "Athlete data", "Competition", "Trust & safety", "Operations", "Usage & billing", "Product", "Growth", "System"];
const prioritySections = new Set(["profiles", "verifications", "support", "subscriptions", "paymentEvents", "announcements", "featureFlags", "auditLogs"]);

function labelForKey(key: string) {
  return key.replace(/_/g, " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function displayValue(value: unknown) {
  if (value === null || value === undefined || value === "") return "—";
  if (typeof value === "boolean") return value ? "Yes" : "No";
  if (typeof value === "object") return JSON.stringify(value);
  return String(value);
}

function initials(value: unknown) {
  const text = String(value || "Admin").trim();
  return text.split(/\s+/).slice(0, 2).map((part) => part[0]?.toUpperCase() || "").join("") || "A";
}

export default function AdminControlCenter({ userId, role }: AdminControlCenterProps) {
  const [selected, setSelected] = useState("profiles");
  const [rows, setRows] = useState<RecordRow[]>([]);
  const [summaries, setSummaries] = useState<Summary[]>([]);
  const [loading, setLoading] = useState(false);
  const [summaryLoading, setSummaryLoading] = useState(true);
  const [error, setError] = useState("");
  const [query, setQuery] = useState("");
  const [group, setGroup] = useState("All");
  const [selectedRow, setSelectedRow] = useState<RecordRow | null>(null);
  const [notice, setNotice] = useState("");
  const [announcementOpen, setAnnouncementOpen] = useState(false);
  const [announcement, setAnnouncement] = useState({ title: "", body: "", audience: "all" });

  const section = sections.find((item) => item.key === selected) ?? sections[0];
  const isSuperAdmin = role === "super_admin";
  const canManage = role === "admin" || isSuperAdmin;
  const canDelete = canManage && Boolean(section.deleteAllowed) && (isSuperAdmin || !["profiles", "subscriptions", "paymentEvents", "auditLogs"].includes(section.key));

  const loadSummaries = async () => {
    if (!supabase) return;
    setSummaryLoading(true);
    const results = await Promise.all(sections.map(async (item) => {
      const { count, error: countError } = await supabase.from(item.table).select("id", { count: "exact", head: true });
      return { key: item.key, label: item.label, table: item.table, count: count ?? 0, error: countError?.message };
    }));
    setSummaries(results);
    setSummaryLoading(false);
  };

  const load = async () => {
    if (!supabase) { setError("Supabase is not configured."); setRows([]); return; }
    setLoading(true); setError(""); setSelectedRow(null);
    const { data, error: queryError } = await supabase.from(section.table).select("*").limit(100);
    if (queryError) setError(queryError.message);
    setRows((data ?? []) as RecordRow[]);
    setLoading(false);
  };

  useEffect(() => { void loadSummaries(); }, []);
  useEffect(() => {
    void load();
    if (!supabase) return;
    const channel = supabase.channel(`admin-${section.table}`).on("postgres_changes", { event: "*", schema: "public", table: section.table }, () => { void load(); void loadSummaries(); }).subscribe();
    return () => { void supabase.removeChannel(channel); };
  }, [section.table]);

  const filteredRows = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return rows;
    return rows.filter((row) => JSON.stringify(row).toLowerCase().includes(needle));
  }, [rows, query]);

  const columns = useMemo(() => {
    const keys = new Set<string>();
    filteredRows.slice(0, 30).forEach((row) => Object.keys(row).forEach((key) => keys.add(key)));
    return Array.from(keys).filter((key) => key !== "id").slice(0, 9);
  }, [filteredRows]);

  const totalRecords = summaries.reduce((sum, item) => sum + item.count, 0);
  const userCount = summaries.find((item) => item.key === "profiles")?.count ?? 0;
  const pendingVerifications = rows.length && selected === "verifications"
    ? rows.filter((row) => row.status === "pending").length
    : summaries.find((item) => item.key === "verifications")?.count ?? 0;
  const openTickets = summaries.find((item) => item.key === "support")?.count ?? 0;

  async function updateRow(id: unknown, patch: RecordRow) {
    if (!canManage || !supabase || !id) return;
    setNotice("");
    const { error: updateError } = await supabase.from(section.table).update(patch).eq("id", String(id));
    if (updateError) { setError(updateError.message); return; }
    setNotice("Saved successfully.");
    await load();
    await loadSummaries();
  }

  async function remove(id: unknown) {
    if (!canDelete || !supabase || !id || !window.confirm("Delete this record? This action cannot be undone.")) return;
    const { error: deleteError } = await supabase.from(section.table).delete().eq("id", String(id));
    if (deleteError) setError(deleteError.message); else { setNotice("Record deleted."); await load(); await loadSummaries(); }
  }

  async function publishAnnouncement() {
    if (!canManage || !supabase || !announcement.title.trim() || !announcement.body.trim()) return;
    const { error: insertError } = await supabase.from("announcements").insert({
      title: announcement.title.trim(), body: announcement.body.trim(), audience: announcement.audience, published_at: new Date().toISOString(), created_by: userId
    });
    if (insertError) { setError(insertError.message); return; }
    setAnnouncement({ title: "", body: "", audience: "all" });
    setAnnouncementOpen(false);
    setNotice("Announcement published.");
    if (selected === "announcements") await load();
    await loadSummaries();
  }

  const resourceGroups = group === "All" ? groups : [group];

  return <section className="admin-control-center" aria-label="Admin control center">
    <div className="admin-hero">
      <div className="admin-hero-copy">
        <div className="admin-kicker"><ShieldCheck size={16} /> Secure administration</div>
        <h2>Command Center</h2>
        <p>One place to operate AthleteOS: users, athlete data, verification, support, billing, product controls and audit history.</p>
        <div className="admin-identity"><span className="admin-avatar">{initials(role)}</span><span><b>{role}</b><small>Signed in administrator</small></span></div>
      </div>
      <div className="admin-hero-actions">
        <div className="admin-live"><span /> Realtime connected</div>
        <button className="btn" onClick={() => { void load(); void loadSummaries(); }} disabled={loading || summaryLoading}><RefreshCw size={15} /> {loading || summaryLoading ? "Refreshing..." : "Refresh all"}</button>
        {canManage && <button className="btn primary" onClick={() => setAnnouncementOpen((open) => !open)}><Megaphone size={15} /> Announcement</button>}
      </div>
    </div>

    <div className="admin-stats">
      <article><span><Users size={17} /></span><div><small>Users</small><strong>{summaryLoading ? "…" : userCount}</strong><em>Profiles in platform</em></div></article>
      <article><span><Database size={17} /></span><div><small>Total records</small><strong>{summaryLoading ? "…" : totalRecords}</strong><em>Across admin resources</em></div></article>
      <article><span><FileCheck2 size={17} /></span><div><small>Verification queue</small><strong>{summaryLoading ? "…" : pendingVerifications}</strong><em>Records visible to admin</em></div></article>
      <article><span><Ticket size={17} /></span><div><small>Support tickets</small><strong>{summaryLoading ? "…" : openTickets}</strong><em>All ticket records</em></div></article>
    </div>

    {announcementOpen && canManage && <div className="admin-compose">
      <div><div><Megaphone size={18} /><h3>Publish announcement</h3></div><button className="icon-btn" onClick={() => setAnnouncementOpen(false)} aria-label="Close announcement"><X size={17} /></button></div>
      <div className="admin-form-grid"><label>Title<input value={announcement.title} onChange={(event) => setAnnouncement({ ...announcement, title: event.target.value })} placeholder="Announcement title" /></label><label>Audience<select value={announcement.audience} onChange={(event) => setAnnouncement({ ...announcement, audience: event.target.value })}><option value="all">Everyone</option><option value="athletes">Athletes</option><option value="coaches">Coaches</option><option value="academies">Academies</option><option value="admins">Admins</option></select></label></div>
      <label>Message<textarea value={announcement.body} onChange={(event) => setAnnouncement({ ...announcement, body: event.target.value })} placeholder="Write the announcement..." rows={4} /></label>
      <div className="inline-actions"><button className="btn primary" onClick={() => void publishAnnouncement()} disabled={!announcement.title.trim() || !announcement.body.trim()}><Megaphone size={15} /> Publish now</button><button className="plain" onClick={() => setAnnouncementOpen(false)}>Cancel</button></div>
    </div>}

    <div className="admin-toolbar">
      <div className="admin-search"><Search size={16} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder={`Search ${section.label.toLowerCase()}...`} /></div>
      <select value={group} onChange={(event) => setGroup(event.target.value)} aria-label="Resource group"><option>All</option>{groups.map((item) => <option key={item}>{item}</option>)}</select>
      <span className="admin-result-count">{filteredRows.length} shown · {rows.length} loaded</span>
    </div>

    <div className="admin-workspace">
      <aside className="admin-resource-nav" aria-label="Admin resources">
        <div className="admin-nav-title">Resources</div>
        {resourceGroups.map((groupName) => <div key={groupName} className="admin-nav-group"><span>{groupName}</span>{sections.filter((item) => item.group === groupName).map((item) => <button key={item.key} className={item.key === selected ? "active" : ""} onClick={() => { setSelected(item.key); setQuery(""); }}><span>{item.label}</span><b>{summaries.find((summary) => summary.key === item.key)?.count ?? "—"}</b><ChevronRight size={14} /></button>)}</div>)}
      </aside>

      <div className="admin-content">
        <div className="admin-section-head"><div><span className="admin-section-label">{section.group}</span><h3>{section.label}</h3><p>{canManage ? "Administrative controls are enabled for your role." : "Read-only view. Elevated write controls require admin access."}</p></div><div className="admin-permission"><span className={canManage ? "ok" : "limited"}>{canManage ? "Manage" : "Read only"}</span><small>{isSuperAdmin ? "Super administrator" : role}</small></div></div>
        {error && <div className="admin-alert error"><AlertTriangle size={17} /><span>{error}</span><button onClick={() => setError("")}><X size={15} /></button></div>}
        {notice && <div className="admin-alert success"><Check size={17} /><span>{notice}</span><button onClick={() => setNotice("")}><X size={15} /></button></div>}

        {loading ? <div className="admin-loading"><span /><span /><span /></div> : filteredRows.length ? <div className="admin-table-shell"><table><thead><tr><th>Record</th>{columns.map((key) => <th key={key}>{labelForKey(key)}</th>)}<th>Open</th></tr></thead><tbody>{filteredRows.map((row, index) => <tr key={String(row.id ?? index)}><td><strong>{displayValue(row.id).slice(0, 8)}</strong><small>{displayValue(row.created_at)}</small></td>{columns.map((key) => <td key={key}><span title={displayValue(row[key])}>{displayValue(row[key]).slice(0, 80)}</span></td>)}<td><button className="row-open" onClick={() => setSelectedRow(row)}>View <ChevronRight size={14} /></button></td></tr>)}</tbody></table></div> : <div className="admin-empty"><Database size={28} /><h4>{error ? "Unable to load records" : "No records found"}</h4><p>{error ? "Check the error above and refresh after the database is available." : query ? "Try a different search." : "This resource currently has no records visible to this administrator."}</p></div>}

        <div className="admin-foot"><span>Showing up to 100 records for safe browser performance.</span><span>Realtime updates enabled</span></div>
      </div>
    </div>

    {selectedRow && <div className="admin-drawer-backdrop" onMouseDown={() => setSelectedRow(null)}><aside className="admin-drawer" onMouseDown={(event) => event.stopPropagation()}>
      <div className="admin-drawer-head"><div><span>{section.group}</span><h3>Record details</h3></div><button className="icon-btn" onClick={() => setSelectedRow(null)} aria-label="Close"><X size={17} /></button></div>
      <div className="admin-record-id"><span>ID</span><code>{displayValue(selectedRow.id)}</code></div>
      <div className="admin-detail-list">{Object.entries(selectedRow).map(([key, value]) => <div key={key}><span>{labelForKey(key)}</span><strong>{displayValue(value)}</strong></div>)}</div>
      {canManage && section.key === "profiles" && <div className="admin-action-box"><h4>Account controls</h4><label>Plan<select defaultValue={displayValue(selectedRow.plan_id)} onChange={(event) => void updateRow(selectedRow.id, { plan_id: event.target.value })}><option value="free">Free</option><option value="student">Student</option><option value="pro">Pro</option><option value="champion">Champion</option><option value="academy">Academy</option></select></label><label>Role<select defaultValue={displayValue(selectedRow.role)} onChange={(event) => void updateRow(selectedRow.id, { role: event.target.value })}><option value="athlete">Athlete</option><option value="coach">Coach</option><option value="academy_admin">Academy admin</option><option value="support_admin">Support admin</option><option value="admin">Admin</option><option value="super_admin">Super admin</option></select></label><label className="admin-toggle"><input type="checkbox" defaultChecked={Boolean(selectedRow.verified_athlete)} onChange={(event) => void updateRow(selectedRow.id, { verified_athlete: event.target.checked })} /> Verified athlete</label></div>}
      {canManage && section.key === "verifications" && <div className="admin-action-box"><h4>Verification decision</h4><label>Status<select defaultValue={displayValue(selectedRow.status)} onChange={(event) => void updateRow(selectedRow.id, { status: event.target.value, reviewed_by: userId, reviewed_at: new Date().toISOString() })}><option value="pending">Pending</option><option value="approved">Approved</option><option value="rejected">Rejected</option></select></label><label>Reviewer notes<textarea defaultValue={displayValue(selectedRow.reviewer_notes) === "—" ? "" : displayValue(selectedRow.reviewer_notes)} onBlur={(event) => void updateRow(selectedRow.id, { reviewer_notes: event.target.value, reviewed_by: userId, reviewed_at: new Date().toISOString() })} rows={4} /></label></div>}
      {canManage && section.key === "support" && <div className="admin-action-box"><h4>Ticket controls</h4><label>Status<select defaultValue={displayValue(selectedRow.status)} onChange={(event) => void updateRow(selectedRow.id, { status: event.target.value })}><option value="open">Open</option><option value="pending">Pending</option><option value="resolved">Resolved</option><option value="closed">Closed</option></select></label><label>Priority<select defaultValue={displayValue(selectedRow.priority)} onChange={(event) => void updateRow(selectedRow.id, { priority: event.target.value })}><option value="low">Low</option><option value="normal">Normal</option><option value="high">High</option><option value="urgent">Urgent</option></select></label></div>}
      {canManage && section.key === "featureFlags" && <div className="admin-action-box"><h4>Feature control</h4><label className="admin-toggle"><input type="checkbox" defaultChecked={Boolean(selectedRow.enabled)} onChange={(event) => void updateRow(selectedRow.id, { enabled: event.target.checked })} /> Feature enabled</label></div>}
      {canDelete && <button className="btn danger admin-delete" onClick={() => { void remove(selectedRow.id); setSelectedRow(null); }}><Trash2 size={15} /> Delete record</button>}
    </aside></div>}
  </section>;
}
