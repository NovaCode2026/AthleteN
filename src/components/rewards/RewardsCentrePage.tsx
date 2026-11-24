import { useCallback, useEffect, useState } from "react";
import { Award, Gift, RefreshCw, ShieldCheck } from "lucide-react";
import { requireSupabase } from "../../lib/supabase";
import { useAuth } from "../../hooks/useAuth";

type RewardEvent = {
  id: string; rewardKey: string; amount: number; eventType: string;
  expiresAt: string | null; createdAt: string; provider: string;
};
type Wallet = {
  balance: number; dailyAdsUsed: number; dailyAdsLimit: number;
  monthlyAdCreditsEarned: number; monthlyAdCreditsLimit: number;
  history: RewardEvent[]; nextCursor: string | null;
};
type Badge = { id: string; badge_key: string; badge_label: string; awarded_at: string; permanent: boolean };
type BadgeDefinition = { badge_key: string; description?: string | null; icon?: string | null; rarity?: string | null };
type WalletPayload = Partial<Wallet> & { error?: string };
const API_BASE = (import.meta.env.VITE_ATHLETEN_API_URL as string | undefined)?.replace(/\\/$/, "") || "";

function Stat({ label, value, detail }: { label: string; value: string | number; detail: string }) {
  return <article className="rewards-stat card panel"><span>{label}</span><strong>{value}</strong><small>{detail}</small></article>;
}

export default function RewardsCentrePage() {
  const auth = useAuth();
  const supabase = requireSupabase();
  const [wallet, setWallet] = useState<Wallet | null>(null);
  const [badges, setBadges] = useState<Badge[]>([]);
  const [badgeDefinitions, setBadgeDefinitions] = useState<Record<string, BadgeDefinition>>({});
  const [busy, setBusy] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState("");
  const [historyError, setHistoryError] = useState("");
  const [badgeError, setBadgeError] = useState("");

  const requestWallet = useCallback(async (cursor?: string) => {
    const token = auth.session?.access_token;
    if (!token) throw new Error("Sign in to view your Rewards Centre.");
    const suffix = cursor ? "?cursor=" + encodeURIComponent(cursor) : "";
    const response = await fetch(API_BASE + "/.netlify/functions/reward-wallet" + suffix, {
      headers: { Authorization: "Bearer " + token }
    });
    const payload = await response.json().catch(() => ({})) as WalletPayload;
    if (!response.ok) throw new Error(payload.error || "Rewards are temporarily unavailable.");
    return {
      balance: Math.max(0, Number(payload.balance) || 0),
      dailyAdsUsed: Math.max(0, Number(payload.dailyAdsUsed) || 0),
      dailyAdsLimit: Math.max(1, Number(payload.dailyAdsLimit) || 3),
      monthlyAdCreditsEarned: Math.max(0, Number(payload.monthlyAdCreditsEarned) || 0),
      monthlyAdCreditsLimit: Math.max(1, Number(payload.monthlyAdCreditsLimit) || 30),
      history: Array.isArray(payload.history) ? payload.history : [],
      nextCursor: typeof payload.nextCursor === "string" ? payload.nextCursor : null
    } satisfies Wallet;
  }, [auth.session?.access_token]);

  const load = useCallback(async () => {
    setBusy(true); setError(""); setBadgeError("");
    try {
      const walletRequest = requestWallet();
      const badgeRequest = auth.user?.id
        ? Promise.all([
            supabase.from("athlete_badges").select("id,badge_key,badge_label,awarded_at,permanent")
              .eq("user_id", auth.user.id).order("awarded_at", { ascending: false }).limit(5),
            supabase.from("badge_definitions").select("badge_key,description,icon,rarity")
          ])
        : Promise.resolve(null);
      const [nextWallet, badgeResults] = await Promise.all([walletRequest, badgeRequest]);
      setWallet(nextWallet);
      if (badgeResults) {
        const [awards, definitions] = badgeResults;
        if (awards.error || definitions.error) setBadgeError("Achievement badges could not be loaded.");
        else {
          setBadges((awards.data || []) as Badge[]);
          setBadgeDefinitions(Object.fromEntries((definitions.data || []).map((item: BadgeDefinition) => [item.badge_key, item])));
        }
      }
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Rewards are temporarily unavailable.");
    } finally { setBusy(false); }
  }, [auth.user?.id, requestWallet, supabase]);

  useEffect(() => { void load(); }, [load]);

  const loadMore = useCallback(async () => {
    if (!wallet?.nextCursor || loadingMore) return;
    setLoadingMore(true); setHistoryError("");
    try {
      const next = await requestWallet(wallet.nextCursor);
      setWallet(current => current ? {
        ...current,
        history: [...current.history, ...next.history.filter(item => !current.history.some(existing => existing.id === item.id))],
        nextCursor: next.nextCursor
      } : current);
    } catch (cause) {
      setHistoryError(cause instanceof Error ? cause.message : "Older reward history is unavailable.");
    } finally { setLoadingMore(false); }
  }, [loadingMore, requestWallet, wallet?.nextCursor]);

  const expiryLabel = (value: string | null) => value
    ? new Date(value).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" })
    : "No expiry";
  const eventLabel = (event: RewardEvent) => {
    if (event.eventType === "earned") return "Reward earned";
    if (event.eventType === "redeemed") return "AI message used";
    if (event.eventType === "reversed") return "Unused credit returned";
    if (event.eventType === "expired") return "Credit expired";
    return "Reward ledger update";
  };

  return <div className="rewards-centre">
    <section className="rewards-hero card panel">
      <div><p className="eyebrow">ATHLETEN BENEFITS</p><h2>Rewards Centre</h2>
        <p>Track verified bonus AI messages and achievement recognition in one place. Rewards never replace your subscription entitlements.</p>
      </div>
      <div className="rewards-balance"><span>AVAILABLE BONUS MESSAGES</span>
        <strong>{busy ? "…" : wallet?.balance ?? "—"}</strong><small>Separate from your plan allowance</small>
      </div>
      <button className="btn" type="button" onClick={() => void load()} disabled={busy}><RefreshCw size={15}/> Refresh</button>
    </section>
    <section className="rewards-stats">
      <Stat label="Rewarded ads today" value={wallet ? wallet.dailyAdsUsed + " / " + wallet.dailyAdsLimit : "—"} detail="Maximum verified rewards per UTC day"/>
      <Stat label="Ad-earned messages" value={wallet ? wallet.monthlyAdCreditsEarned + " / " + wallet.monthlyAdCreditsLimit : "—"} detail="Monthly earning limit"/>
      <Stat label="Current bonus balance" value={wallet?.balance ?? "—"} detail="Unused credits expire at month end"/>
    </section>
    <section className="rewards-safety card panel"><ShieldCheck size={21}/><div>
      <strong>Rewarded ads are not live yet</strong>
      <p>Consent, age-appropriate ad requests, provider approval and physical-device testing remain release gates. Ads will stay unavailable until these checks pass. Choosing not to watch an ad never restricts existing AthleteN access.</p>
    </div></section>
    <section className="card panel rewards-rules">
      <div className="rewards-section-heading"><div><p className="eyebrow">OPTIONAL REWARD</p><h3>Bonus AI messages</h3></div><span className="rewards-reward-value">+2</span></div>
      <p>One successfully completed and server-verified rewarded ad is designed to grant two bonus AI messages.</p>
      <div className="rewards-limits">
        <div><strong>3 ads per day</strong><span>Server-enforced daily limit</span></div>
        <div><strong>30 messages per month</strong><span>Maximum ad-earned credits</span></div>
        <div><strong>Month-end expiry</strong><span>Unused ad credits do not roll over</span></div>
      </div>
      <p className="rewards-muted">No ad will play automatically. Web displays your wallet only; Android rewarded inventory will not be embedded on this page.</p>
    </section>
    <section className="card panel">
      <div className="rewards-section-heading"><div><p className="eyebrow">ATHLETE RECOGNITION</p><h3>Achievement badges</h3></div><Award size={23}/></div>
      {badgeError ? <p className="rewards-error" role="status">{badgeError}</p> : null}
      {badges.length ? <div className="rewards-badges">{badges.map(badge => {
        const definition = badgeDefinitions[badge.badge_key] || {};
        return <article className="rewards-badge" key={badge.id}>
          <span>{definition.icon || "🏅"}</span>
          <div><strong>{badge.badge_label}</strong><small>{definition.description || "AthleteN achievement"} · {new Date(badge.awarded_at).toLocaleDateString()}</small></div>
          {badge.permanent ? <em>PERMANENT</em> : null}
        </article>;
      })}</div> : <p className="rewards-muted">Badges earned through your AthleteN journey will appear here. Recognition badges are separate from redeemable AI credits.</p>}
      <a className="btn" href="/badges">View all achievements</a>
    </section>
    <section className="card panel rewards-history">
      <div className="rewards-section-heading"><div><p className="eyebrow">ACCOUNT ACTIVITY</p><h3>Reward history</h3></div><Gift size={23}/></div>
      {error ? <div className="empty"><strong>Wallet unavailable</strong><p>{error}</p><button className="btn" onClick={() => void load()}>Try again</button></div> : null}
      {historyError ? <p className="rewards-error" role="alert">{historyError}</p> : null}
      {busy && !wallet ? <p className="muted">Loading reward history…</p> : null}
      {!busy && !error && wallet?.history.length === 0 ? <div className="empty"><strong>No rewards yet</strong><p>Verified reward credits and their expiry dates will appear here when available.</p></div> : null}
      {wallet?.history.map(event => <article className="rewards-history-row" key={event.id}>
        <div><strong>{eventLabel(event)}</strong><small>{new Date(event.createdAt).toLocaleString()} · Expires {expiryLabel(event.expiresAt)}</small></div>
        <b className={event.amount < 0 ? "negative" : "positive"}>{event.amount > 0 ? "+" : ""}{event.amount}</b>
      </article>)}
      {wallet?.nextCursor ? <button className="btn" onClick={() => void loadMore()} disabled={loadingMore}>{loadingMore ? "Loading…" : "Load older history"}</button> : null}
    </section>
  </div>;
}
