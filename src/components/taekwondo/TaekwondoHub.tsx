import { useEffect, useMemo, useState } from "react";
import { Activity, Award, Plus, Shield, Target, Trophy } from "lucide-react";
import { insertRow, listRows, upsertRow } from "../../services/database";
import type { KyorugiBout, PoomsaePerformance, Profile, TaekwondoDiscipline, TaekwondoTrainingLog } from "../../types";

type Toast = { type: "success" | "error" | "warning"; message: string } | null;
type Props = { profile: Profile; userId?: string; kyorugiBouts?: KyorugiBout[]; poomsaePerformances?: PoomsaePerformance[]; taekwondoTraining?: TaekwondoTrainingLog[]; setToast: (toast: Toast) => void; refresh: () => Promise<void> };

const COPY = {
  kyorugi: { title: "Kyorugi", subtitle: "Sparring and match-performance workspace", uses: ["Bout and opponent history", "Round and score tracking", "Competition results", "Fight-focused training logs"] },
  poomsae: { title: "Poomsae", subtitle: "Forms and performance workspace", uses: ["Poomsae performed", "Competition score and placing", "Category and event history", "Technique-focused training logs"] },
} as const;

export default function TaekwondoHub({ profile, userId, kyorugiBouts: initialKyorugi = [], poomsaePerformances: initialPoomsae = [], taekwondoTraining: initialTraining = [], setToast, refresh }: Props) {
  const athleteId = userId || profile.user_id;
  const [discipline, setDiscipline] = useState<TaekwondoDiscipline | null>(profile.discipline ?? null);
  const [bouts, setBouts] = useState<KyorugiBout[]>(initialKyorugi);
  const [performances, setPerformances] = useState<PoomsaePerformance[]>(initialPoomsae);
  const [training, setTraining] = useState<TaekwondoTrainingLog[]>(initialTraining);
  const [busy, setBusy] = useState(false);
  const [formMode, setFormMode] = useState<"training" | "competition" | null>(null);
  const [form, setForm] = useState<Record<string, string>>({});
  const [error, setError] = useState("");
  const copy = discipline ? COPY[discipline] : { title: "Taekwondo", subtitle: "Choose Kyorugi or Poomsae to continue", uses: ["Kyorugi and Poomsae data remain separate"] };

  async function load() {
    if (!athleteId) return;
    try {
      const [b, p, t] = await Promise.all([
        listRows<KyorugiBout>("kyorugiBouts", athleteId, { order: "event_date", ascending: false }),
        listRows<PoomsaePerformance>("poomsaePerformances", athleteId, { order: "event_date", ascending: false }),
        listRows<TaekwondoTrainingLog>("taekwondoTraining", athleteId, { order: "session_date", ascending: false }),
      ]);
      setBouts(b); setPerformances(p); setTraining(t); setError("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Taekwondo records could not be loaded. Apply the Taekwondo migration first.");
    }
  }

  useEffect(() => { void load(); }, [athleteId]);
  useEffect(() => { setBouts(initialKyorugi); setPerformances(initialPoomsae); setTraining(initialTraining); }, [initialKyorugi, initialPoomsae, initialTraining]);

  async function switchMode(next: TaekwondoDiscipline) {
    if (!athleteId || next === discipline) return;
    setBusy(true); setError("");
    try {
      await upsertRow("profile", { user_id: athleteId, sport: "taekwondo", discipline: next }, { onConflict: "user_id" });
      setDiscipline(next); setToast({ type: "success", message: `${COPY[next].title} selected.` }); await refresh();
    } catch (e) { setError(e instanceof Error ? e.message : "Discipline could not be saved."); }
    finally { setBusy(false); }
  }

  async function saveTraining() {
    if (!athleteId || !discipline || !form.title || !form.date) { setError("Choose a discipline and provide a training title and date."); return; }
    setBusy(true); setError("");
    try {
      const payload = { user_id: athleteId, discipline, title: form.title, session_date: form.date, focus: form.focus || null, notes: form.notes || null, is_official: false, ...(discipline === "kyorugi" ? { rounds: form.rounds ? Number(form.rounds) : null } : { repetitions: form.repetitions ? Number(form.repetitions) : null }) };
      await insertRow("taekwondoTraining", payload);
      setToast({ type: "success", message: `${copy.title} training saved.` }); setForm({}); setFormMode(null); await load(); await refresh();
    } catch (e) { setError(e instanceof Error ? e.message : "Training could not be saved."); }
    finally { setBusy(false); }
  }

  async function saveCompetition() {
    if (!athleteId || !discipline || !form.event || !form.date) { setError("Choose a discipline and provide an event and date."); return; }
    setBusy(true); setError("");
    try {
      if (discipline === "kyorugi") {
        await insertRow("kyorugiBouts", { user_id: athleteId, event_name: form.event, event_date: form.date, opponent_name: form.opponent || null, round_name: form.round || null, result: form.result || null, athlete_score: form.athleteScore === "" || form.athleteScore === undefined ? null : Number(form.athleteScore), opponent_score: form.opponentScore === "" || form.opponentScore === undefined ? null : Number(form.opponentScore), decision: form.decision || null, notes: form.notes || null, is_official: true });
      } else {
        const score = form.score === "" || form.score === undefined ? null : Number(form.score);
        if (score !== null && !Number.isFinite(score)) { setError("Enter a valid Poomsae score."); return; }
        await insertRow("poomsaePerformances", { user_id: athleteId, event_name: form.event, event_date: form.date, poomsae_name: form.poomsae || null, category: form.category || null, score, placing: form.placing ? Number(form.placing) : null, result: form.result || null, notes: form.notes || null, is_official: true });
      }
      setToast({ type: "success", message: `${copy.title} competition result saved.` }); setForm({}); setFormMode(null); await load(); await refresh();
    } catch (e) { setError(e instanceof Error ? e.message : "Competition result could not be saved."); }
    finally { setBusy(false); }
  }

  const relevantTraining = useMemo(() => discipline ? training.filter(x => x.discipline === discipline) : [], [training, discipline]);
  const official = discipline === "kyorugi" ? bouts.filter(x => x.is_official) : discipline === "poomsae" ? performances.filter(x => x.is_official) : [];
  const resultCount = discipline === "kyorugi" ? bouts.filter(x => x.is_official && x.result === "win").length : discipline === "poomsae" ? performances.filter(x => x.is_official && ["gold", "silver", "bronze", "placed"].includes(x.result || "")).length : 0;

  return <FeatureShell title={`Taekwondo${discipline ? ` · ${copy.title}` : ""}`} subtitle={copy.subtitle}>
    <section className="card panel"><div className="page-head"><div><span className="eyebrow">Discipline</span><h3>Choose your Taekwondo path</h3><p>Choose Kyorugi or Poomsae explicitly. Historical records stay tied to their original discipline.</p></div><div className="inline-actions"><button className={`btn ${discipline === "kyorugi" ? "primary" : ""}`} disabled={busy} onClick={() => void switchMode("kyorugi")}>Kyorugi</button><button className={`btn ${discipline === "poomsae" ? "primary" : ""}`} disabled={busy} onClick={() => void switchMode("poomsae")}>Poomsae</button></div></div></section>
    {discipline && <>
      <section className="metrics"><Metric icon={Activity} label="Training" value={relevantTraining.length} note="discipline sessions"/><Metric icon={Trophy} label="Official results" value={official.length} note="competition records"/><Metric icon={Award} label={discipline === "kyorugi" ? "Wins" : "Placings"} value={resultCount} note="official results only"/><Metric icon={Target} label="Mode" value={copy.title} note="selected discipline"/></section>
      <section className="grid two"><article className="card panel"><div className="inline-actions"><Shield size={18}/><div><h3>What {copy.title} is for</h3><p>{copy.subtitle}. Shared AthleteN features remain available in both disciplines.</p></div></div><ul>{copy.uses.map(x => <li key={x}>{x}</li>)}</ul></article><article className="card panel"><h3>Training vs official competition</h3><p>Practice sessions and official results are deliberately stored separately.</p><div className="hero-actions"><button className="btn primary" onClick={() => { setError(""); setForm({}); setFormMode("training"); }}><Plus size={16}/> Log training</button><button className="btn" onClick={() => { setError(""); setForm({}); setFormMode("competition"); }}><Trophy size={16}/> Add official result</button></div></article></section>
      {error && <p className="notice" role="alert">{error}</p>}
      {formMode && <div className="modal-backdrop"><form className="modal" onSubmit={e => { e.preventDefault(); void (formMode === "training" ? saveTraining() : saveCompetition()); }}><button type="button" className="close" onClick={() => setFormMode(null)} aria-label="Close">x</button><h2>{formMode === "training" ? `Log ${copy.title} training` : `Add official ${copy.title} result`}</h2>
        {formMode === "training" ? <><Field label="Session title" required value={form.title || ""} onChange={e => setForm({ ...form, title: e.target.value })}/><Field label="Date" required type="date" value={form.date || ""} onChange={e => setForm({ ...form, date: e.target.value })}/><Field label="Focus" placeholder={discipline === "kyorugi" ? "Footwork, sparring, countering..." : "Balance, accuracy, presentation..."} value={form.focus || ""} onChange={e => setForm({ ...form, focus: e.target.value })}/>{discipline === "kyorugi" ? <Field label="Rounds" type="number" min="0" value={form.rounds || ""} onChange={e => setForm({ ...form, rounds: e.target.value })}/> : <Field label="Repetitions" type="number" min="0" value={form.repetitions || ""} onChange={e => setForm({ ...form, repetitions: e.target.value })}/>}</> : discipline === "kyorugi" ? <><Field label="Event" required value={form.event || ""} onChange={e => setForm({ ...form, event: e.target.value })}/><Field label="Date" required type="date" value={form.date || ""} onChange={e => setForm({ ...form, date: e.target.value })}/><Field label="Opponent" value={form.opponent || ""} onChange={e => setForm({ ...form, opponent: e.target.value })}/><Field label="Round" value={form.round || ""} onChange={e => setForm({ ...form, round: e.target.value })}/><Select label="Result" value={form.result || ""} onChange={e => setForm({ ...form, result: e.target.value })} options={[["win", "Win"], ["loss", "Loss"], ["draw", "Draw"], ["no_contest", "No contest"]]}/><Field label="Your score" type="number" min="0" value={form.athleteScore || ""} onChange={e => setForm({ ...form, athleteScore: e.target.value })}/><Field label="Opponent score" type="number" min="0" value={form.opponentScore || ""} onChange={e => setForm({ ...form, opponentScore: e.target.value })}/><Field label="Decision" value={form.decision || ""} onChange={e => setForm({ ...form, decision: e.target.value })}/></> : <><Field label="Event" required value={form.event || ""} onChange={e => setForm({ ...form, event: e.target.value })}/><Field label="Date" required type="date" value={form.date || ""} onChange={e => setForm({ ...form, date: e.target.value })}/><Field label="Poomsae" value={form.poomsae || ""} onChange={e => setForm({ ...form, poomsae: e.target.value })}/><Field label="Category" value={form.category || ""} onChange={e => setForm({ ...form, category: e.target.value })}/><Field label="Score" type="number" step="0.001" min="0" value={form.score || ""} onChange={e => setForm({ ...form, score: e.target.value })}/><Field label="Placing" type="number" min="1" value={form.placing || ""} onChange={e => setForm({ ...form, placing: e.target.value })}/><Select label="Result" value={form.result || ""} onChange={e => setForm({ ...form, result: e.target.value })} options={[["gold", "Gold"], ["silver", "Silver"], ["bronze", "Bronze"], ["placed", "Placed"], ["not_placed", "Not placed"]]}/></>}
        <label className="field"><span>Notes</span><textarea value={form.notes || ""} onChange={e => setForm({ ...form, notes: e.target.value })}/></label><button className="btn primary" disabled={busy}>{busy ? "Saving..." : "Save record"}</button>
      </form></div>}
      <section className="card panel"><h3>Recent {copy.title} training</h3>{relevantTraining.length ? <div className="table-wrap"><table><thead><tr><th>Date</th><th>Session</th><th>Focus</th><th>{discipline === "kyorugi" ? "Rounds" : "Repetitions"}</th></tr></thead><tbody>{relevantTraining.slice(0, 10).map(x => <tr key={x.id}><td>{x.session_date}</td><td>{x.title}</td><td>{x.focus || "—"}</td><td>{discipline === "kyorugi" ? (x.rounds ?? "—") : (x.repetitions ?? "—")}</td></tr>)}</tbody></table></div> : <div className="empty"><strong>No {copy.title} training logged yet.</strong><p>Add a practice session above.</p></div>}</section>
      <section className="card panel"><h3>Official {copy.title} results</h3>{official.length ? <div className="table-wrap"><table><thead><tr>{discipline === "kyorugi" ? <><th>Date</th><th>Event</th><th>Opponent</th><th>Result</th><th>Score</th></> : <><th>Date</th><th>Event</th><th>Poomsae</th><th>Score</th><th>Place</th><th>Result</th></>}</tr></thead><tbody>{discipline === "kyorugi" ? bouts.filter(x => x.is_official).slice(0, 10).map(x => <tr key={x.id}><td>{x.event_date || "—"}</td><td>{x.event_name}</td><td>{x.opponent_name || "—"}</td><td>{x.result || "—"}</td><td>{x.athlete_score ?? "—"}–{x.opponent_score ?? "—"}</td></tr>) : performances.filter(x => x.is_official).slice(0, 10).map(x => <tr key={x.id}><td>{x.event_date || "—"}</td><td>{x.event_name}</td><td>{x.poomsae_name || "—"}</td><td>{x.score ?? "—"}</td><td>{x.placing ?? "—"}</td><td>{x.result || "—"}</td></tr>)}</tbody></table></div> : <div className="empty"><strong>No official {copy.title} results yet.</strong><p>Add competition records separately from training.</p></div>}</section>
    </>}
    {!discipline && <section className="card panel"><div className="empty"><strong>Choose Kyorugi or Poomsae before entering Taekwondo data.</strong><p>Your discipline must be explicitly selected; AthleteN will not silently default to Kyorugi.</p></div></section>}
  </FeatureShell>;
}

function Field({ label, ...props }: React.InputHTMLAttributes<HTMLInputElement> & { label: string }) { return <label className="field"><span>{label}</span><input {...props}/></label>; }
function Select({ label, value, onChange, options }: { label: string; value: string; onChange: (event: React.ChangeEvent<HTMLSelectElement>) => void; options: string[][] }) { return <label className="field"><span>{label}</span><select value={value} onChange={onChange}><option value="">Select</option>{options.map(([v, t]) => <option key={v} value={v}>{t}</option>)}</select></label>; }
function FeatureShell({ title, subtitle, children }: { title: string; subtitle: string; children: React.ReactNode }) { return <><div className="page-head"><div><p className="eyebrow">AthleteN · Taekwondo</p><h2>{title}</h2><p>{subtitle}</p></div></div>{children}</>; }
function Metric({ icon: Icon, label, value, note }: { icon: typeof Activity; label: string; value: string | number; note: string }) { return <article className="metric card"><div className="metric-icon"><Icon size={18}/></div><div><p>{label}</p><strong>{value}</strong><small>{note}</small></div></article>; }
