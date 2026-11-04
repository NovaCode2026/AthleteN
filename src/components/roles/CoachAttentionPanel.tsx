import { useCallback, useEffect, useMemo, useState } from "react";
import { AlertCircle, CalendarDays, HeartHandshake, RefreshCw } from "lucide-react";
import { supabase } from "../../lib/supabase";

type CoachAthlete = {
  user_id: string;
  full_name?: string | null;
  username?: string | null;
};

type AttentionItem = {
  userId: string;
  name: string;
  count?: number;
  date?: string;
  title?: string;
};

type Props = {
  userId: string;
  athletes: CoachAthlete[];
};

function dateOnly(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export default function CoachAttentionPanel({ userId, athletes }: Props) {
  const [absences, setAbsences] = useState<AttentionItem[]>([]);
  const [competitions, setCompetitions] = useState<AttentionItem[]>([]);
  const [injuries, setInjuries] = useState<AttentionItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");

  const athleteIds = useMemo(
    () => Array.from(new Set(athletes.map((athlete) => athlete.user_id).filter(Boolean))),
    [athletes]
  );
  const athleteNames = useMemo(
    () => new Map(athletes.map((athlete) => [
      athlete.user_id,
      athlete.full_name?.trim() || athlete.username?.trim() || "Athlete"
    ])),
    [athletes]
  );

  const load = useCallback(async () => {
    if (!supabase || !userId || athleteIds.length === 0) {
      setAbsences([]);
      setCompetitions([]);
      setInjuries([]);
      setLoading(false);
      setRefreshing(false);
      return;
    }

    setError("");
    try {
      const now = new Date();
      const today = dateOnly(now);
      const attendanceStart = new Date(now);
      attendanceStart.setDate(attendanceStart.getDate() - 29);
      const attendanceStartDate = dateOnly(attendanceStart);
      const eventEnd = new Date(now);
      eventEnd.setDate(eventEnd.getDate() + 14);
      const eventEndDate = dateOnly(eventEnd);

      const [groupResult, tournamentResult, injuryResult] = await Promise.all([
        supabase.from("training_groups")
          .select("id")
          .eq("coach_user_id", userId)
          .eq("active", true),
        supabase.from("tournaments")
          .select("id,user_id,name,starts_at")
          .in("user_id", athleteIds)
          .gte("starts_at", today)
          .lte("starts_at", eventEndDate)
          .order("starts_at", { ascending: true }),
        // Deliberately request status metadata only. Injury titles, notes and severity
        // are private athlete information and are not needed for this follow-up flag.
        supabase.from("injuries")
          .select("user_id,recovery_status,updated_at")
          .in("user_id", athleteIds)
          .order("updated_at", { ascending: false })
      ]);

      const firstError = groupResult.error || tournamentResult.error || injuryResult.error;
      if (firstError) throw firstError;

      const groupIds = (groupResult.data || []).map((row) => row.id);
      const sessionIds: string[] = [];
      const absentCounts = new Map<string, number>();

      if (groupIds.length) {
        const [memberResult, sessionResult] = await Promise.all([
          supabase.from("training_group_members")
            .select("group_id,athlete_user_id")
            .in("group_id", groupIds)
            .in("athlete_user_id", athleteIds)
            .eq("status", "active"),
          supabase.from("training_group_sessions")
            .select("id,group_id")
            .in("group_id", groupIds)
            .gte("session_date", attendanceStartDate)
            .lte("session_date", today)
            .neq("status", "cancelled")
        ]);

        if (memberResult.error) throw memberResult.error;
        if (sessionResult.error) throw sessionResult.error;
        sessionIds.push(...(sessionResult.data || []).map((row) => row.id));

        if (sessionIds.length) {
          const attendanceResult = await supabase.from("training_group_attendance")
            .select("athlete_user_id,status")
            .in("session_id", sessionIds)
            .in("athlete_user_id", athleteIds)
            .eq("status", "absent");
          if (attendanceResult.error) throw attendanceResult.error;

          for (const row of attendanceResult.data || []) {
            absentCounts.set(row.athlete_user_id, (absentCounts.get(row.athlete_user_id) || 0) + 1);
          }
        }
      }

      setAbsences(Array.from(absentCounts.entries())
        .filter(([, count]) => count >= 2)
        .map(([userId, count]) => ({
          userId,
          name: athleteNames.get(userId) || "Athlete",
          count
        }))
        .sort((a, b) => (b.count || 0) - (a.count || 0)));

      setCompetitions((tournamentResult.data || []).map((row) => ({
        userId: row.user_id,
        name: athleteNames.get(row.user_id) || "Athlete",
        title: row.name,
        date: row.starts_at || undefined
      })));

      const closedStatuses = new Set(["recovered", "resolved", "closed", "complete", "completed"]);
      const seenInjuryUsers = new Set<string>();
      setInjuries((injuryResult.data || [])
        .filter((row) => !closedStatuses.has(String(row.recovery_status || "").trim().toLowerCase()))
        .filter((row) => {
          if (seenInjuryUsers.has(row.user_id)) return false;
          seenInjuryUsers.add(row.user_id);
          return true;
        })
        .map((row) => ({
          userId: row.user_id,
          name: athleteNames.get(row.user_id) || "Athlete"
        })));
    } catch (e) {
      setError(e instanceof Error ? e.message : "The attention list could not be loaded.");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [athleteIds, athleteNames, userId]);

  useEffect(() => {
    void load();
  }, [load]);

  const empty = !absences.length && !competitions.length && !injuries.length;

  return (
    <section className="card panel coach-attention-panel">
      <div className="panel-head">
        <div>
          <p className="eyebrow">PILOT OPERATIONS</p>
          <h3>Needs attention</h3>
          <p className="muted">Follow-up prompts from recorded attendance, upcoming events and injury-status flags.</p>
        </div>
        <button className="btn" type="button" onClick={() => { setRefreshing(true); void load(); }} disabled={loading || refreshing}>
          <RefreshCw size={15} /> {refreshing ? "Refreshing…" : "Refresh"}
        </button>
      </div>

      {error && <p className="notice" role="alert">{error}</p>}
      {loading ? <p className="muted">Loading coach follow-ups…</p> : empty ? (
        <div className="empty">
          <strong>No follow-ups currently match these rules.</strong>
          <p>Only explicitly recorded absences are counted. Unmarked sessions are not treated as missed.</p>
        </div>
      ) : (
        <div className="role-analytics-grid coach-attention-grid">
          <article className="card panel">
            <div className="panel-head"><div><h3>Attendance follow-up</h3><p className="muted">Two or more recorded absences in the last 30 days</p></div><AlertCircle size={18}/></div>
            {absences.length ? absences.map((item) => (
              <div className="membership-row" key={item.userId}>
                <strong>{item.name}</strong><small>{item.count} recorded absences</small>
              </div>
            )) : <p className="muted">No athlete meets this threshold.</p>}
          </article>

          <article className="card panel">
            <div className="panel-head"><div><h3>Upcoming competitions</h3><p className="muted">Next 14 days</p></div><CalendarDays size={18}/></div>
            {competitions.length ? competitions.map((item) => (
              <div className="membership-row" key={item.userId + item.date + item.title}>
                <div><strong>{item.title || "Tournament"}</strong><small>{item.name}</small></div>
                <small>{item.date ? new Date(item.date + "T00:00:00").toLocaleDateString() : "Date to confirm"}</small>
              </div>
            )) : <p className="muted">No linked athlete competitions in the next 14 days.</p>}
          </article>

          <article className="card panel">
            <div className="panel-head"><div><h3>Injury-status follow-up</h3><p className="muted">Open records only · no medical notes shown</p></div><HeartHandshake size={18}/></div>
            {injuries.length ? injuries.map((item) => (
              <div className="membership-row" key={item.userId}>
                <strong>{item.name}</strong><small>Check in privately with the athlete and guardian where appropriate.</small>
              </div>
            )) : <p className="muted">No open injury-status records for linked athletes.</p>}
          </article>
        </div>
      )}

      <p className="muted coach-attention-footnote">This is an administrative follow-up aid, not a medical assessment. AthleteN does not create alerts based on body weight or weight targets.</p>
    </section>
  );
}
