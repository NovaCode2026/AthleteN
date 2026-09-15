import { useMemo, useState } from "react";
import { Activity, Award, CalendarDays, CircleDot, Dumbbell, Footprints, Plus, Shield, Sparkles, Target, Trophy } from "lucide-react";
import { insertRow, type Resource } from "../../services/database";
import type { KyorugiBout, PoomsaePerformance, Profile, TaekwondoTrainingLog } from "../../types";

type Toast = { type: "success" | "error" | "warning"; message: string } | null;

type Props = {
  profile: Profile;
  kyorugiBouts: KyorugiBout[];
  poomsaePerformances: PoomsaePerformance[];
  taekwondoTraining: TaekwondoTrainingLog[];
  setToast: (toast: Toast) => void;
  refresh: () => Promise<void>;
};

const modeCopy = {
  kyorugi: {
    title: "Kyorugi",
    subtitle: "Sparring and match-performance workspace",
    uses: ["Match and bout history", "Opponent and round notes", "Score tracking", "Competition results", "Fight-focused training logs"],
  },
  poomsae: {
    title: "Poomsae",
    subtitle: "Forms and performance workspace",
    uses: ["Poomsae performed", "Competition scores and placing", "Category and event history", "Technique-focused training logs", "Performance notes"],
  },
} as const;

export default function TaekwondoHub({ profile, kyorugiBouts, poomsaePerformances, taekwondoTraining, setToast, refresh }: Props) {
  const discipline = profile.discipline || "kyorugi";
  const [busy, setBusy] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState<Record<string, string>>({});
  const copy = modeCopy[discipline];

  const relevantTraining = useMemo(() => taekwondoTraining.filter((row) => row.discipline === discipline), [taekwondoTraining, discipline]);
  const officialResults = discipline === "kyorugi" ? kyorugiBouts.filter((row) => row.is_official) : poomsaePerformances.filter((row) => row.is_official);
  const wins = discipline === "kyorugi" ? kyorugiBouts.filter((row) => row.result === "win").length : poomsaePerformances.filter((row) => ["gold", "silver", "bronze", "placed"].includes(row.result || "")).length;

  async function saveTraining() {
    if (!profile.user_id || !form.session_date || !form.title) return setToast({ type: "warning", message: "Add a training title and date first." });
    setBusy(true);
    try {
      await insertRow("taekwondoTraining", { user_id: profile.user_id, discipline, session_date: form.session_date, title: form.title, focus: form.focus || null, rounds: form.rounds ? Number(form.rounds) : null, notes: form.notes || null, is_official: false });
      setToast({ type: "success", message: `${copy.title} training saved.` });
      setForm({});
      setShowForm(false);
      await refresh();
    } catch (error) {
      setToast({ type: "error", message: error instanceof Error ? error.message : "Training could not be saved." });
    } finally { setBusy(false); }
  }

  return <FeatureShell title={`Taekwondo · ${copy.title}`} subtitle={copy.subtitle}>
    <section className="metrics">
      <Metric icon={Activity} label="Training" value={relevantTraining.length} note="discipline sessions" />
      <Metric icon={Trophy} label="Official results" value={officialResults.length} note="competition records" />
      <Metric icon={Award} label={discipline === "kyorugi" ? "Wins" : "Placings"} value={wins} note="recorded results" />
      <Metric icon={Target} label="Mode" value={copy.title} note="selected discipline" />
    </section>

    <section className="grid two">
      <article className="card panel"><div className="inline-actions"><Shield size={18}/><div><h3>What {copy.title} is for</h3><p>{copy.subtitle}. Shared AthleteN features such as profile, plans, verification, documents, messaging, calendar, AI Coach and medals remain available.</p></div></div><ul>{copy.uses.map((item) => <li key={item}>{item}</li>)}</ul></article>
      <article className="card panel"><h3>Training and competition stay separate</h3><p>Training logs are practice records. Official results are competition records. They can both exist for the same athlete without mixing the two.</p><div className="hero-actions"><button className="btn primary" onClick={() => setShowForm(true)}><Plus size={16}/> Log {copy.title} training</button></div></article>
    </section>

    {showForm && <div className="modal-backdrop"><form className="modal" onSubmit={(event) => { event.preventDefault(); void saveTraining(); }}><button type="button" className="close" onClick={() => setShowForm(false)} aria-label="Close">x</button><h2>Log {copy.title} training</h2><label className="field"><span>Session title</span><input required value={form.title || ""} onChange={(e) => setForm({ ...form, title: e.target.value })}/></label><label className="field"><span>Date</span><input required type="date" value={form.session_date || ""} onChange={(e) => setForm({ ...form, session_date: e.target.value })}/></label><label className="field"><span>Focus</span><input placeholder={discipline === "kyorugi" ? "Footwork, sparring, countering..." : "Balance, accuracy, presentation..."} value={form.focus || ""} onChange={(e) => setForm({ ...form, focus: e.target.value })}/></label><label className="field"><span>{discipline === "kyorugi" ? "Rounds" : "Repetitions"}</span><input type="number" min="0" max="999" value={form.rounds || ""} onChange={(e) => setForm({ ...form, rounds: e.target.value })}/></label><label className="field"><span>Notes</span><textarea value={form.notes || ""} onChange={(e) => setForm({ ...form, notes: e.target.value })}/></label><button className="btn primary" disabled={busy}>{busy ? "Saving..." : "Save training"}</button></form></div>}

    <section className="card panel"><h3>Recent {copy.title} training</h3>{relevantTraining.length === 0 ? <div className="empty"><strong>No {copy.title} training logged yet.</strong><p>Use the button above to add the first practice record.</p></div> : <div className="table-wrap"><table><thead><tr><th>Date</th><th>Session</th><th>Focus</th><th>{discipline === "kyorugi" ? "Rounds" : "Reps"}</th></tr></thead><tbody>{relevantTraining.slice(0, 10).map((row) => <tr key={row.id}><td>{row.session_date}</td><td>{row.title}</td><td>{row.focus || "—"}</td><td>{row.rounds ?? "—"}</td></tr>)}</tbody></table></div>}</section>
  </FeatureShell>;
}

function FeatureShell({ title, subtitle, children }: { title: string; subtitle: string; children: React.ReactNode }) { return <><div className="page-head"><div><p className="eyebrow">AthleteN · Taekwondo</p><h2>{title}</h2><p>{subtitle}</p></div></div>{children}</>; }
function Metric({ icon: Icon, label, value, note }: { icon: typeof Activity; label: string; value: string | number; note: string }) { return <article className="metric card"><div className="metric-icon"><Icon size={18}/></div><div><p>{label}</p><strong>{value}</strong><small>{note}</small></div></article>; }
