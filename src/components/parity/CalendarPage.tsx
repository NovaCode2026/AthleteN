import { useCallback, useEffect, useMemo, useState } from "react";
import { ChevronLeft, ChevronRight, Plus, RefreshCw, Trash2 } from "lucide-react";
import { useAuth } from "../../hooks/useAuth";
import { supabase } from "../../lib/supabase";

type CalendarItem = {
  id: string;
  title: string;
  day: string;
  kind: "training" | "competition" | "personal" | "achievement";
  label: string;
  detail?: string;
  time?: string;
  source: "calendar_events" | "training_sessions" | "tournaments" | "medals";
};

const weekdays = ["MON", "TUE", "WED", "THU", "FRI", "SAT", "SUN"];
const eventTypes = ["training", "competition", "recovery", "medical", "reminder", "travel"];

function dateKey(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return year + "-" + month + "-" + day;
}
function safeDay(value: unknown) {
  const raw = String(value ?? "");
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw;
  const parsed = new Date(raw);
  return Number.isNaN(parsed.getTime()) ? "" : dateKey(parsed);
}
function safeTime(value: unknown) {
  if (!value) return "";
  const parsed = new Date(String(value));
  return Number.isNaN(parsed.getTime())
    ? ""
    : parsed.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}
function dateLabel(key: string, options: Intl.DateTimeFormatOptions = { weekday: "long", day: "numeric", month: "long", year: "numeric" }) {
  const parsed = new Date(key + "T12:00:00");
  return Number.isNaN(parsed.getTime()) ? key : parsed.toLocaleDateString(undefined, options);
}

export default function CalendarPage() {
  const { user } = useAuth();
  const today = new Date();
  const [month, setMonth] = useState(() => new Date(today.getFullYear(), today.getMonth(), 1));
  const [selectedDay, setSelectedDay] = useState(() => dateKey(today));
  const [items, setItems] = useState<CalendarItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [showAdd, setShowAdd] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [draft, setDraft] = useState({
    title: "",
    event_type: "training",
    event_date: dateKey(today) + "T18:00",
    notes: "",
  });

  const load = useCallback(async () => {
    if (!user?.id || !supabase) {
      setItems([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    setError("");
    const start = new Date(month.getFullYear(), month.getMonth(), 1);
    const end = new Date(month.getFullYear(), month.getMonth() + 1, 1);
    const startKey = dateKey(start);
    const endKey = dateKey(end);
    const [custom, training, tournaments, medals] = await Promise.all([
      supabase.from("calendar_events")
        .select("id,title,event_type,event_date,notes")
        .eq("user_id", user.id)
        .gte("event_date", start.toISOString())
        .lt("event_date", end.toISOString())
        .order("event_date", { ascending: true }),
      supabase.from("training_sessions")
        .select("id,title,session_date,minutes,intensity")
        .eq("user_id", user.id)
        .gte("session_date", startKey)
        .lt("session_date", endKey)
        .order("session_date", { ascending: true }),
      supabase.from("tournaments")
        .select("id,name,starts_at,location,status")
        .eq("user_id", user.id)
        .gte("starts_at", startKey)
        .lt("starts_at", endKey)
        .order("starts_at", { ascending: true }),
      supabase.from("medals")
        .select("id,event_name,medal_type,category,awarded_at")
        .eq("user_id", user.id)
        .gte("awarded_at", startKey)
        .lt("awarded_at", endKey)
        .order("awarded_at", { ascending: true }),
    ]);
    const failed = [custom, training, tournaments, medals].find((result) => result.error);
    if (failed?.error) {
      setError(failed.error.message);
      setItems([]);
      setLoading(false);
      return;
    }

    const mapped: CalendarItem[] = [
      ...(custom.data || []).map((row) => ({
        id: row.id,
        title: row.title,
        day: safeDay(row.event_date),
        kind: (row.event_type === "competition" ? "competition" : row.event_type === "training" ? "training" : "personal") as CalendarItem["kind"],
        label: String(row.event_type || "event").replace(/_/g, " "),
        detail: row.notes || "",
        time: safeTime(row.event_date),
        source: "calendar_events" as const,
      })),
      ...(training.data || []).map((row) => ({
        id: row.id,
        title: row.title || "Training session",
        day: safeDay(row.session_date),
        kind: "training" as const,
        label: "Training",
        detail: [row.minutes ? row.minutes + " minutes" : "", row.intensity || ""].filter(Boolean).join(" · "),
        source: "training_sessions" as const,
      })),
      ...(tournaments.data || []).map((row) => ({
        id: row.id,
        title: row.name || "Competition",
        day: safeDay(row.starts_at),
        kind: "competition" as const,
        label: "Competition",
        detail: [row.location || "", row.status || ""].filter(Boolean).join(" · "),
        source: "tournaments" as const,
      })),
      ...(medals.data || []).map((row) => ({
        id: row.id,
        title: row.event_name || "Medal awarded",
        day: safeDay(row.awarded_at),
        kind: "achievement" as const,
        label: "Achievement",
        detail: [row.medal_type || "", row.category || ""].filter(Boolean).join(" · "),
        source: "medals" as const,
      })),
    ].filter((item) => Boolean(item.day));
    mapped.sort((a, b) => a.day.localeCompare(b.day) || (a.time || "").localeCompare(b.time || ""));
    setItems(mapped);
    setLoading(false);
  }, [user?.id, month]);

  useEffect(() => { void load(); }, [load]);

  const eventsByDay = useMemo(() => {
    const grouped = new Map<string, CalendarItem[]>();
    for (const item of items) {
      const existing = grouped.get(item.day) || [];
      existing.push(item);
      grouped.set(item.day, existing);
    }
    return grouped;
  }, [items]);

  const cells = useMemo(() => {
    const first = new Date(month.getFullYear(), month.getMonth(), 1);
    const daysInMonth = new Date(month.getFullYear(), month.getMonth() + 1, 0).getDate();
    const mondayOffset = (first.getDay() + 6) % 7;
    const all: Array<Date | null> = [
      ...Array.from({ length: mondayOffset }, () => null),
      ...Array.from({ length: daysInMonth }, (_, index) => new Date(month.getFullYear(), month.getMonth(), index + 1)),
    ];
    while (all.length % 7 !== 0) all.push(null);
    return all;
  }, [month]);

  const selectedItems = eventsByDay.get(selectedDay) || [];

  function changeMonth(delta: number) {
    const next = new Date(month.getFullYear(), month.getMonth() + delta, 1);
    const nextDay = dateKey(next);
    setMonth(next);
    setSelectedDay(nextDay);
    setDraft((current) => ({ ...current, event_date: nextDay + "T18:00" }));
  }

  function goToday() {
    const now = new Date();
    const key = dateKey(now);
    setMonth(new Date(now.getFullYear(), now.getMonth(), 1));
    setSelectedDay(key);
    setDraft((current) => ({ ...current, event_date: key + "T18:00" }));
  }

  async function addEvent(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!user?.id || !supabase || !draft.title.trim() || !draft.event_date) return;
    const eventDate = new Date(draft.event_date);
    if (Number.isNaN(eventDate.getTime())) {
      setError("Choose a valid event date and time.");
      return;
    }
    setSaving(true);
    setError("");
    setNotice("");
    const { error: insertError } = await supabase.from("calendar_events").insert({
      user_id: user.id,
      title: draft.title.trim(),
      event_type: eventTypes.includes(draft.event_type) ? draft.event_type : "reminder",
      event_date: eventDate.toISOString(),
      notes: draft.notes.trim() || null,
    });
    setSaving(false);
    if (insertError) {
      setError(insertError.message);
      return;
    }
    const newKey = dateKey(eventDate);
    setSelectedDay(newKey);
    setMonth(new Date(eventDate.getFullYear(), eventDate.getMonth(), 1));
    setDraft({ title: "", event_type: "training", event_date: newKey + "T18:00", notes: "" });
    setShowAdd(false);
    setNotice("Event saved. Its date now has a calendar marker.");
    await load();
  }

  async function deleteEvent(item: CalendarItem) {
    if (!supabase || item.source !== "calendar_events" || !user?.id) return;
    const { error: deleteError } = await supabase.from("calendar_events").delete().eq("id", item.id).eq("user_id", user.id);
    if (deleteError) {
      setError(deleteError.message);
      return;
    }
    setNotice("Calendar event deleted.");
    await load();
  }

  const monthLabel = month.toLocaleDateString(undefined, { month: "long", year: "numeric" });

  return (
    <div className="athleten-calendar-page">
      <div className="athleten-calendar-heading">
        <div>
          <p className="eyebrow">ATHLETEN PLANNER</p>
          <h2>Calendar</h2>
          <p>Every training session, competition, achievement and personal event in one monthly view.</p>
        </div>
        <button className="btn primary" type="button" onClick={() => setShowAdd((open) => !open)}>
          <Plus size={16} /> {showAdd ? "Close form" : "Add event"}
        </button>
      </div>

      <div className="athleten-calendar-layout">
        <section className="card panel athleten-calendar-panel">
          <div className="athleten-calendar-toolbar">
            <div className="athleten-calendar-month">
              <button type="button" aria-label="Previous month" onClick={() => changeMonth(-1)}><ChevronLeft size={18} /></button>
              <h3>{monthLabel}</h3>
              <button type="button" aria-label="Next month" onClick={() => changeMonth(1)}><ChevronRight size={18} /></button>
            </div>
            <button className="athleten-calendar-today" type="button" onClick={goToday}>TODAY</button>
          </div>

          <div className="athleten-calendar-weekdays">
            {weekdays.map((day) => <span className="athleten-calendar-weekday" key={day}>{day}</span>)}
          </div>
          <div className="athleten-calendar-grid" role="grid" aria-label={monthLabel}>
            {cells.map((day, index) => {
              if (!day) return <div className="athleten-calendar-empty" key={"empty-" + index} aria-hidden="true" />;
              const key = dateKey(day);
              const dayItems = eventsByDay.get(key) || [];
              const isToday = key === dateKey(new Date());
              const classes = [
                "athleten-calendar-day",
                key === selectedDay ? "is-selected" : "",
                isToday ? "is-today" : "",
              ].filter(Boolean).join(" ");
              const kinds = [...new Set(dayItems.map((item) => item.kind))].slice(0, 4);
              return (
                <button
                  className={classes}
                  type="button"
                  key={key}
                  onClick={() => setSelectedDay(key)}
                  aria-label={dateLabel(key) + (dayItems.length ? ", " + dayItems.length + " scheduled items" : ", no scheduled items")}
                  aria-pressed={key === selectedDay}
                >
                  <span className="athleten-calendar-number">{day.getDate()}</span>
                  <span className="athleten-calendar-dots" aria-hidden="true">
                    {kinds.map((kind) => <i key={kind} className={"athleten-calendar-dot " + kind} />)}
                  </span>
                </button>
              );
            })}
          </div>

          <div className="athleten-calendar-legend">
            <span><i className="athleten-calendar-dot training" /> Training</span>
            <span><i className="athleten-calendar-dot competition" /> Competition</span>
            <span><i className="athleten-calendar-dot personal" /> Personal event</span>
            <span><i className="athleten-calendar-dot achievement" /> Achievement</span>
          </div>
        </section>

        <div className="athleten-calendar-side">
          <section className="card panel athleten-calendar-panel">
            <div className="athleten-calendar-selected-date">
              <div>
                <p className="eyebrow">SELECTED DAY</p>
                <h3>{dateLabel(selectedDay)}</h3>
              </div>
              <span className="athleten-calendar-count">{selectedItems.length} ITEMS</span>
            </div>
            {loading ? <div className="athleten-calendar-empty-copy">Loading your schedule…</div> :
              selectedItems.length ? selectedItems.map((item) => (
                <div className="athleten-calendar-event" key={item.source + "-" + item.id}>
                  <i className={"athleten-calendar-event-mark " + item.kind} />
                  <div className="athleten-calendar-event-main">
                    <strong>{item.title}</strong>
                    <small>{item.label.toUpperCase()}{item.time ? " · " + item.time : ""}</small>
                    {item.detail ? <p>{item.detail}</p> : null}
                  </div>
                  {item.source === "calendar_events" ? (
                    <button className="plain danger" type="button" aria-label={"Delete " + item.title} onClick={() => void deleteEvent(item)}><Trash2 size={14} /></button>
                  ) : null}
                </div>
              )) : <div className="athleten-calendar-empty-copy">Nothing is scheduled for this day. Select another date or add an event.</div>}
          </section>

          {showAdd ? (
            <section className="card panel athleten-calendar-panel">
              <h3>Add to calendar</h3>
              <form className="athleten-calendar-add" onSubmit={(event) => void addEvent(event)}>
                <label className="field">
                  <span>Event title</span>
                  <input value={draft.title} onChange={(event) => setDraft((current) => ({ ...current, title: event.target.value }))} maxLength={160} placeholder="Academy training" required />
                </label>
                <div className="athleten-calendar-add-grid">
                  <label className="field">
                    <span>Type</span>
                    <select value={draft.event_type} onChange={(event) => setDraft((current) => ({ ...current, event_type: event.target.value }))}>
                      {eventTypes.map((type) => <option key={type} value={type}>{type.charAt(0).toUpperCase() + type.slice(1)}</option>)}
                    </select>
                  </label>
                  <label className="field">
                    <span>Date & time</span>
                    <input type="datetime-local" value={draft.event_date} onChange={(event) => setDraft((current) => ({ ...current, event_date: event.target.value }))} required />
                  </label>
                </div>
                <label className="field">
                  <span>Notes</span>
                  <textarea value={draft.notes} onChange={(event) => setDraft((current) => ({ ...current, notes: event.target.value }))} rows={3} maxLength={2000} placeholder="Optional details for this day" />
                </label>
                <button className="btn primary" type="submit" disabled={saving || !draft.title.trim()}>{saving ? "Saving…" : "Save event"}</button>
              </form>
            </section>
          ) : null}
        </div>
      </div>

      {error ? <p className="notice" role="alert">{error}</p> : null}
      {notice ? <p className="notice" role="status">{notice}</p> : null}
      <div className="inline-actions">
        <button className="btn" type="button" onClick={() => void load()} disabled={loading}><RefreshCw size={14} /> Refresh calendar</button>
      </div>
    </div>
  );
}
