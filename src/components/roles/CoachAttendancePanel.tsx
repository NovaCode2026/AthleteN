import { useCallback, useEffect, useMemo, useState } from "react";
import { CalendarCheck, CheckCheck, RefreshCw } from "lucide-react";
import { supabase } from "../../lib/supabase";

type GroupRow = { id: string; name: string };
type SessionRow = { id: string; group_id: string; session_date: string; start_time: string | null; title: string; status: string };
type MemberRow = { athlete_user_id: string; status: string };
type ProfileRow = { user_id: string; full_name: string | null; username: string | null };
type AttendanceRow = { athlete_user_id: string; status: "present" | "late" | "absent" | "excused"; marked_at: string | null };
type RosterRow = { userId: string; name: string; status: AttendanceRow["status"] | "unmarked" };

function localDate(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function displayName(profile?: ProfileRow) {
  return profile?.full_name?.trim() || (profile?.username ? `@${profile.username}` : "Athlete");
}

export default function CoachAttendancePanel({ userId }: { userId?: string }) {
  const [sessions, setSessions] = useState<Array<SessionRow & { group_name: string }>>([]);
  const [selectedSessionId, setSelectedSessionId] = useState("");
  const [roster, setRoster] = useState<RosterRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const selectedSession = useMemo(
    () => sessions.find((session) => session.id === selectedSessionId),
    [sessions, selectedSessionId]
  );

  const loadSessions = useCallback(async () => {
    if (!supabase || !userId) {
      setSessions([]);
      setSelectedSessionId("");
      setLoading(false);
      return;
    }
    setLoading(true);
    setError("");
    setNotice("");
    try {
      const { data: groups, error: groupError } = await supabase
        .from("training_groups")
        .select("id,name")
        .eq("coach_user_id", userId)
        .eq("active", true)
        .order("name");
      if (groupError) throw groupError;

      const groupRows = (groups || []) as GroupRow[];
      if (!groupRows.length) {
        setSessions([]);
        setSelectedSessionId("");
        setRoster([]);
        return;
      }

      const today = new Date();
      const cutoff = new Date(today);
      cutoff.setDate(cutoff.getDate() - 14);
      const { data, error: sessionError } = await supabase
        .from("training_group_sessions")
        .select("id,group_id,session_date,start_time,title,status")
        .in("group_id", groupRows.map((group) => group.id))
        .gte("session_date", localDate(cutoff))
        .lte("session_date", localDate(today))
        .neq("status", "cancelled")
        .order("session_date", { ascending: false })
        .order("start_time", { ascending: false })
        .limit(50);
      if (sessionError) throw sessionError;

      const groupNames = new Map(groupRows.map((group) => [group.id, group.name]));
      const mapped = ((data || []) as SessionRow[]).map((session) => ({
        ...session,
        group_name: groupNames.get(session.group_id) || "Training group",
      }));
      setSessions(mapped);
      setSelectedSessionId((current) =>
        mapped.some((session) => session.id === current) ? current : (mapped[0]?.id || "")
      );
      if (!mapped.length) setRoster([]);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Class sessions could not be loaded.");
    } finally {
      setLoading(false);
    }
  }, [userId]);

  const loadRoster = useCallback(async (sessionId: string) => {
    if (!supabase || !sessionId) {
      setRoster([]);
      return;
    }
    setError("");
    try {
      const session = sessions.find((item) => item.id === sessionId);
      if (!session) return;
      const { data: members, error: memberError } = await supabase
        .from("training_group_members")
        .select("athlete_user_id,status")
        .eq("group_id", session.group_id)
        .eq("status", "active")
        .order("joined_at", { ascending: true });
      if (memberError) throw memberError;

      const memberRows = (members || []) as MemberRow[];
      if (!memberRows.length) {
        setRoster([]);
        return;
      }
      const athleteIds = memberRows.map((member) => member.athlete_user_id);
      const [profilesResult, attendanceResult] = await Promise.all([
        supabase.from("profiles").select("user_id,full_name,username").in("user_id", athleteIds),
        supabase.from("training_group_attendance")
          .select("athlete_user_id,status,marked_at")
          .eq("session_id", sessionId)
          .in("athlete_user_id", athleteIds),
      ]);
      if (profilesResult.error) throw profilesResult.error;
      if (attendanceResult.error) throw attendanceResult.error;

      const profiles = new Map(((profilesResult.data || []) as ProfileRow[]).map((profile) => [profile.user_id, profile]));
      const attendance = new Map(((attendanceResult.data || []) as AttendanceRow[]).map((row) => [row.athlete_user_id, row.status]));
      setRoster(memberRows.map((member) => ({
        userId: member.athlete_user_id,
        name: displayName(profiles.get(member.athlete_user_id)),
        status: attendance.get(member.athlete_user_id) || "unmarked",
      })));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "The class roster could not be loaded.");
    }
  }, [sessions]);

  useEffect(() => { void loadSessions(); }, [loadSessions]);
  useEffect(() => {
    if (selectedSessionId) void loadRoster(selectedSessionId);
    else setRoster([]);
  }, [selectedSessionId, loadRoster]);

  async function saveStatus(athleteUserId: string, status: RosterRow["status"]) {
    if (!supabase || !selectedSessionId) return;
    setSaving(true);
    setError("");
    setNotice("");
    try {
      if (status === "unmarked") {
        const { error: deleteError } = await supabase.from("training_group_attendance")
          .delete()
          .eq("session_id", selectedSessionId)
          .eq("athlete_user_id", athleteUserId);
        if (deleteError) throw deleteError;
      } else {
        const { error: upsertError } = await supabase.from("training_group_attendance").upsert({
          session_id: selectedSessionId,
          athlete_user_id: athleteUserId,
          status,
          marked_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        }, { onConflict: "session_id,athlete_user_id" });
        if (upsertError) throw upsertError;
      }
      await loadRoster(selectedSessionId);
      setNotice("Attendance saved.");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Attendance could not be saved.");
    } finally {
      setSaving(false);
    }
  }

  async function markAllPresent() {
    if (!supabase || !selectedSession || !roster.length) return;
    setSaving(true);
    setError("");
    setNotice("");
    try {
      const markedAt = new Date().toISOString();
      const { error: upsertError } = await supabase.from("training_group_attendance").upsert(
        roster.map((athlete) => ({
          session_id: selectedSession.id,
          athlete_user_id: athlete.userId,
          status: "present",
          marked_at: markedAt,
          updated_at: markedAt,
        })),
        { onConflict: "session_id,athlete_user_id" }
      );
      if (upsertError) throw upsertError;
      await loadRoster(selectedSession.id);
      setNotice(`Marked ${roster.length} athletes present. You can correct any individual record below.`);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Class attendance could not be saved.");
    } finally {
      setSaving(false);
    }
  }

  const markedCount = roster.filter((athlete) => athlete.status !== "unmarked").length;
  const presentCount = roster.filter((athlete) => athlete.status === "present" || athlete.status === "late").length;

  return (
    <section className="card panel">
      <div className="panel-head">
        <div>
          <p className="eyebrow">PILOT · COACH OPERATIONS</p>
          <h3>Class attendance</h3>
          <p className="muted">Choose a recent class, mark everyone present in one action, then correct individual records where needed.</p>
        </div>
        <CalendarCheck size={20} />
      </div>
      <div className="inline-actions" style={{ alignItems: "end", marginBottom: 12 }}>
        <label className="field" style={{ flex: 1, minWidth: 240 }}>
          <span>Class session</span>
          <select value={selectedSessionId} onChange={(event) => setSelectedSessionId(event.target.value)} disabled={loading || saving}>
            <option value="">Choose a recent class</option>
            {sessions.map((session) => (
              <option key={session.id} value={session.id}>
                {session.session_date} · {session.group_name} · {session.title}
              </option>
            ))}
          </select>
        </label>
        <button className="btn" type="button" onClick={() => void loadSessions()} disabled={loading || saving}>
          <RefreshCw size={15} /> Refresh
        </button>
      </div>
      {selectedSession && (
        <div className="role-analytics-kpis" style={{ marginBottom: 12 }}>
          <div><strong>{roster.length}</strong><small>Active athletes</small></div>
          <div><strong>{markedCount}/{roster.length}</strong><small>Records marked</small></div>
          <div><strong>{presentCount}</strong><small>Present or late</small></div>
        </div>
      )}
      {error && <p className="notice" role="alert">{error}</p>}
      {notice && <p className="notice" role="status">{notice}</p>}
      {loading ? <p className="muted">Loading classes…</p> :
        !sessions.length ? <div className="empty"><strong>No recent class sessions</strong><span>Create a training group and schedule a class to start recording attendance.</span></div> :
        !roster.length ? <div className="empty"><strong>No active athletes in this class</strong><span>Only active members of the selected training group appear here.</span></div> :
        <div className="details-list">
          <div className="inline-actions" style={{ justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
            <strong>{selectedSession.group_name} · {selectedSession.title}</strong>
            <button className="btn primary" type="button" onClick={() => void markAllPresent()} disabled={saving || !roster.length}>
              <CheckCheck size={15} /> {saving ? "Saving…" : "Mark all present"}
            </button>
          </div>
          {roster.map((athlete) => (
            <div className="detail-row" key={athlete.userId}>
              <div><strong>{athlete.name}</strong><small>{athlete.status === "unmarked" ? "Not marked yet" : `Recorded: ${athlete.status}`}</small></div>
              <select aria-label={`Attendance for ${athlete.name}`} value={athlete.status} disabled={saving} onChange={(event) => void saveStatus(athlete.userId, event.target.value as RosterRow["status"])}>
                <option value="unmarked">Not marked</option>
                <option value="present">Present</option>
                <option value="late">Late</option>
                <option value="absent">Absent</option>
                <option value="excused">Excused</option>
              </select>
            </div>
          ))}
        </div>
      }
    </section>
  );
}
