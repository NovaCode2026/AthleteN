import { useCallback, useEffect, useState } from "react";
import { AlertCircle, CalendarClock, RefreshCw } from "lucide-react";
import { supabase } from "../../lib/supabase";

type Group = { id: string };
type Session = { id: string; group_id: string; session_date: string };
type Attendance = { athlete_user_id: string; session_id: string };
type Link = { athlete_user_id: string; status: string };
type Tournament = { id: string; user_id: string; name: string; starts_at: string | null };
type Profile = { user_id: string; full_name: string | null; username: string | null };
type AttentionItem = {
  key: string;
  userId: string;
  athlete: string;
  kind: "absence" | "competition";
  title: string;
  detail: string;
  date: string;
  count?: number;
};

function dateOnly(date: Date) {
  return [date.getFullYear(), String(date.getMonth() + 1).padStart(2, "0"), String(date.getDate()).padStart(2, "0")].join("-");
}

function athleteName(profile?: Profile, userId?: string) {
  return profile?.full_name?.trim() || (profile?.username ? `@${profile.username}` : `Athlete ${(userId || "").slice(0, 8)}`);
}

export default function CoachAttentionPanel({ userId }: { userId?: string }) {
  const [items, setItems] = useState<AttentionItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [updatedAt, setUpdatedAt] = useState("");

  const load = useCallback(async () => {
    if (!supabase || !userId) {
      setItems([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    setError("");
    try {
      const today = new Date();
      const todayText = dateOnly(today);
      const from = new Date(today);
      from.setDate(from.getDate() - 30);
      const until = new Date(today);
      until.setDate(until.getDate() + 14);

      const [groupsResult, linksResult] = await Promise.all([
        supabase.from("training_groups").select("id").eq("coach_user_id", userId).eq("active", true),
        supabase.from("coach_athlete_links").select("athlete_user_id,status").eq("coach_user_id", userId).eq("status", "active"),
      ]);
      if (groupsResult.error) throw groupsResult.error;
      if (linksResult.error) throw linksResult.error;

      const groups = (groupsResult.data || []) as Group[];
      const links = (linksResult.data || []) as Link[];
      const sessionPromise = groups.length
        ? supabase.from("training_group_sessions")
          .select("id,group_id,session_date")
          .in("group_id", groups.map((group) => group.id))
          .gte("session_date", dateOnly(from))
          .lte("session_date", todayText)
          .neq("status", "cancelled")
          .limit(1000)
        : Promise.resolve({ data: [], error: null });

      const linkedAthleteIds = Array.from(new Set(links.map((link) => link.athlete_user_id).filter(Boolean)));
      const tournamentsPromise = linkedAthleteIds.length
        ? supabase.from("tournaments")
          .select("id,user_id,name,starts_at")
          .in("user_id", linkedAthleteIds)
          .gte("starts_at", todayText)
          .lt("starts_at", dateOnly(until))
          .order("starts_at", { ascending: true })
          .limit(200)
        : Promise.resolve({ data: [], error: null });

      const [sessionsResult, tournamentsResult] = await Promise.all([sessionPromise, tournamentsPromise]);
      if (sessionsResult.error) throw sessionsResult.error;
      if (tournamentsResult.error) throw tournamentsResult.error;

      const sessions = (sessionsResult.data || []) as Session[];
      const sessionIds = sessions.map((session) => session.id);
      const attendanceResult = sessionIds.length
        ? await supabase.from("training_group_attendance")
          .select("athlete_user_id,session_id")
          .in("session_id", sessionIds)
          .eq("status", "absent")
        : { data: [], error: null };
      if (attendanceResult.error) throw attendanceResult.error;

      const absenceCounts = new Map<string, number>();
      for (const row of (attendanceResult.data || []) as Attendance[]) {
        absenceCounts.set(row.athlete_user_id, (absenceCounts.get(row.athlete_user_id) || 0) + 1);
      }

      const tournaments = (tournamentsResult.data || []) as Tournament[];
      const athleteIds = Array.from(new Set([
        ...Array.from(absenceCounts.entries()).filter(([, count]) => count >= 2).map(([id]) => id),
        ...tournaments.map((event) => event.user_id),
      ]));
      const profilesResult = athleteIds.length
        ? await supabase.from("profiles").select("user_id,full_name,username").in("user_id", athleteIds)
        : { data: [], error: null };
      const profiles = new Map(((profilesResult.data || []) as Profile[]).map((profile) => [profile.user_id, profile]));

      const next: AttentionItem[] = [];
      for (const [athleteId, count] of absenceCounts) {
        if (count < 2) continue;
        next.push({
          key: `absence:${athleteId}`,
          userId: athleteId,
          athlete: athleteName(profiles.get(athleteId), athleteId),
          kind: "absence",
          title: "Repeated missed sessions",
          detail: `${count} sessions marked absent in the last 30 days`,
          date: todayText,
          count,
        });
      }
      for (const event of tournaments) {
        if (!event.starts_at) continue;
        next.push({
          key: `competition:${event.id}`,
          userId: event.user_id,
          athlete: athleteName(profiles.get(event.user_id), event.user_id),
          kind: "competition",
          title: event.name,
          detail: "Competition within the next 14 days",
          date: event.starts_at,
        });
      }
      next.sort((a, b) => a.date.localeCompare(b.date));
      setItems(next);
      setUpdatedAt(new Date().toLocaleTimeString());
    } catch (cause) {
      setItems([]);
      setError(cause instanceof Error ? cause.message : "The attention list could not be loaded.");
    } finally {
      setLoading(false);
    }
  }, [userId]);

  useEffect(() => { void load(); }, [load]);

  return (
    <section className="card panel">
      <div className="panel-head">
        <div>
          <p className="eyebrow">COACH FOLLOW-UP</p>
          <h3>Needs attention</h3>
          <p className="muted">Operational follow-ups based only on recorded attendance and upcoming competition dates.</p>
        </div>
        <button className="btn" type="button" onClick={() => void load()} disabled={loading}>
          <RefreshCw size={15} /> {loading ? "Refreshing…" : "Refresh"}
        </button>
      </div>
      {error && <p className="notice" role="alert">{error}</p>}
      {loading ? <p className="muted">Checking linked athlete records…</p> :
        items.length ? (
          <div className="details-list">
            {items.map((item) => (
              <div className="detail-row" key={item.key}>
                <div className="metric-icon">{item.kind === "absence" ? <AlertCircle size={17} /> : <CalendarClock size={17} />}</div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <strong>{item.athlete}</strong>
                  <small>{item.title} · {item.detail}</small>
                </div>
                <span className="muted">{item.date}</span>
              </div>
            ))}
          </div>
        ) : (
          <div className="empty">
            <strong>No follow-ups from the current records</strong>
            <span>Repeated absences and competitions in the next 14 days will appear here when they are recorded.</span>
          </div>
        )
      }
      {updatedAt && <p className="muted" style={{ marginTop: 8 }}>Updated {updatedAt}</p>}
    </section>
  );
}
