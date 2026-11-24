import { useCallback, useEffect, useMemo, useState } from "react";
import { RefreshCw, ShieldCheck, Trophy } from "lucide-react";
import { requireSupabase } from "../../lib/supabase";
import { useAuth } from "../../hooks/useAuth";

type Category = { key: string; label: string; status: "active" | "coming_soon"; description: string };
type Entry = { rank: number; displayName: string; totalPoints: number; categories: Record<string, number>; isYou: boolean };
type Payload = {
  period: string;
  timeZone: string;
  resetsAt: string;
  categories: Category[];
  optedIn: boolean;
  displayName: string;
  yourRank: number | null;
  yourPoints: number | null;
  leaderboard: Entry[];
  error?: string;
};

const API_BASE = (import.meta.env.VITE_ATHLETEN_API_URL as string | undefined)?.replace(/\/$/, "") || "";
const ALIAS_PATTERN = /^[A-Za-z0-9][A-Za-z0-9 ._-]{1,23}$/;

export default function DailyLeaderboardPage() {
  const auth = useAuth();
  const supabase = requireSupabase();
  const [data, setData] = useState<Payload | null>(null);
  const [alias, setAlias] = useState("");
  const [optedIn, setOptedIn] = useState(false);
  const [filter, setFilter] = useState("overall");
  const [busy, setBusy] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  const load = useCallback(async () => {
    if (!auth.session?.access_token) {
      setBusy(false);
      setError("Sign in to view the daily leaderboard.");
      return;
    }
    setBusy(true);
    setError("");
    try {
      const response = await fetch(API_BASE + "/.netlify/functions/daily-leaderboard", {
        headers: { Authorization: "Bearer " + auth.session.access_token }
      });
      const payload = await response.json().catch(() => ({})) as Payload;
      if (!response.ok) throw new Error(payload.error || "Leaderboard is temporarily unavailable.");
      setData(payload);
      setOptedIn(payload.optedIn === true);
      setAlias(payload.displayName || "");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Leaderboard is temporarily unavailable.");
    } finally {
      setBusy(false);
    }
  }, [auth.session?.access_token]);

  useEffect(() => { void load(); }, [load]);

  async function savePreferences() {
    if (!auth.user?.id) {
      setError("Sign in again before updating leaderboard settings.");
      return;
    }
    if (optedIn && !ALIAS_PATTERN.test(alias.trim())) {
      setError("Choose a public alias with 2–24 letters, numbers, spaces, dots, underscores or hyphens.");
      return;
    }
    setSaving(true);
    setError("");
    setMessage("");
    const { error: saveError } = await supabase.from("profiles").update({
      leaderboard_opt_in: optedIn,
      leaderboard_display_name: optedIn ? alias.trim() : null
    }).eq("user_id", auth.user.id);
    if (saveError) setError(saveError.message);
    else {
      setMessage(optedIn ? "You are now included using your public alias." : "You have opted out of public leaderboard rankings.");
      await load();
    }
    setSaving(false);
  }

  const selectedCategory = data?.categories.find((item) => item.key === filter);
  const rows = useMemo(() => {
    if (!data) return [];
    const scored = data.leaderboard.map((entry) => ({
      ...entry,
      score: filter === "overall" ? entry.totalPoints : Number(entry.categories[filter] || 0)
    })).filter((entry) => entry.score > 0);
    scored.sort((a, b) => b.score - a.score || a.displayName.localeCompare(b.displayName));
    let previous: number | null = null;
    let rank = 0;
    return scored.map((entry, index) => {
      if (entry.score !== previous) rank = index + 1;
      previous = entry.score;
      return { ...entry, visibleRank: rank };
    });
  }, [data, filter]);

  const resetLabel = data?.resetsAt
    ? new Date(data.resetsAt).toLocaleTimeString("en-IN", { timeZone: "Asia/Kolkata", hour: "2-digit", minute: "2-digit", hour12: true })
    : "12:00 AM";

  return <div className="daily-leaderboard">
    <section className="card panel daily-leaderboard-hero">
      <div>
        <p className="eyebrow">ATHLETEN COMPETE</p>
        <h2>Daily Leaderboard</h2>
        <p>Today’s verified athlete activity. The ranking period follows the Asia/Kolkata calendar day.</p>
      </div>
      <div className="daily-leaderboard-reset"><strong>{resetLabel}</strong><span>IST RESET</span></div>
    </section>

    <section className="daily-leaderboard-privacy">
      <ShieldCheck size={18}/>
      <p>Joining is optional. Only your chosen public alias and points are shown. Your full name, username, photo and private athlete records are not displayed.</p>
    </section>

    <section className="card panel daily-leaderboard-settings">
      <h3>Your leaderboard settings</h3>
      <label className="daily-leaderboard-optin">
        <span><strong>{optedIn ? "Included in daily rankings" : "Opt in to daily rankings"}</strong><small>You can leave the public leaderboard whenever you choose.</small></span>
        <input type="checkbox" checked={optedIn} onChange={(event) => setOptedIn(event.target.checked)}/>
      </label>
      {optedIn && <label className="field">
        <span>Public display alias</span>
        <input value={alias} maxLength={24} onChange={(event) => setAlias(event.target.value)} placeholder="Choose an alias"/>
        <small>2–24 characters. Do not use your full name or private contact details.</small>
      </label>}
      <div className="inline-actions">
        <button className="btn primary" onClick={() => void savePreferences()} disabled={saving}>{saving ? "Saving…" : "Save settings"}</button>
        <button className="btn" onClick={() => void load()} disabled={busy}><RefreshCw size={15}/> Refresh</button>
      </div>
      {message && <p className="leaderboard-success" role="status">{message}</p>}
      {error && <p className="notice" role="alert">{error}</p>}
    </section>

    <section className="metrics daily-leaderboard-stats">
      <article className="metric card"><div><p>Your overall rank</p><strong>{data?.yourRank ? "#" + data.yourRank : "—"}</strong><small>Among opted-in athletes</small></div></article>
      <article className="metric card"><div><p>Your daily points</p><strong>{data?.yourPoints ?? "—"}</strong><small>IST daily total</small></div></article>
      <article className="metric card"><div><p>Opted-in athletes</p><strong>{data?.leaderboard.length ?? "—"}</strong><small>Public aliases only</small></div></article>
    </section>

    <section className="card panel">
      <div className="panel-head"><div><h3>Leaderboard categories</h3><p>Select a category to view its rankings. Categories without a verified scoring source are marked Coming soon.</p></div><Trophy size={20}/></div>
      <div className="daily-leaderboard-categories">
        <button className={filter === "overall" ? "active" : ""} onClick={() => setFilter("overall")}>Overall</button>
        {data?.categories.map((category) => <button key={category.key} disabled={category.status !== "active"} className={(filter === category.key ? "active " : "") + (category.status !== "active" ? "coming-soon" : "")} onClick={() => setFilter(category.key)}>{category.label}{category.status !== "active" ? " · Soon" : ""}</button>)}
      </div>
      {selectedCategory && <p>{selectedCategory.description}</p>}
    </section>

    <section className="card panel">
      <div className="panel-head"><div><h3>{filter === "overall" ? "Overall rankings" : (selectedCategory?.label || "Category rankings")}</h3><p>Leaderboard period: {data?.period || "—"} · resets at 12:00 AM IST</p></div>{busy && <span className="pill">Loading</span>}</div>
      {error && <p className="notice" role="alert">{error}</p>}
      {!busy && !error && rows.length === 0 && <div className="empty"><strong>No ranked activity yet</strong><p>Verified activities will appear here. Unverified claims do not add points.</p></div>}
      <div className="daily-leaderboard-list">
        {rows.map((entry) => <div className={"daily-leaderboard-row" + (entry.isYou ? " is-you" : "")} key={entry.displayName + "-" + entry.visibleRank}>
          <span className="daily-leaderboard-rank">#{entry.visibleRank}</span>
          <span className="daily-leaderboard-name"><strong>{entry.displayName}{entry.isYou ? " · YOU" : ""}</strong><small>{filter === "overall" ? "Daily total" : "Category points"}</small></span>
          <strong className="daily-leaderboard-points">{entry.score} <small>PTS</small></strong>
        </div>)}
      </div>
      <p className="daily-leaderboard-footnote">Training scores are capped at one daily credit. Higher training volume, body metrics, injuries and app screen time do not improve rank.</p>
    </section>
  </div>;
}
