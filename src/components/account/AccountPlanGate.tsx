import { useEffect, useMemo, useState } from "react";
import type { User } from "@supabase/supabase-js";
import { plans } from "../../config/plans";
import type { PlanId } from "../../types";
import { supabase } from "../../lib/supabase";

type Entitlement = {
  user_id: string;
  selected_plan_id: PlanId;
  trial_claimed_at?: string | null;
  trial_plan_id?: PlanId | null;
  trial_started_at?: string | null;
  trial_ends_at?: string | null;
};

const TRIAL_PRICE = "₹9";
const TRIAL_DAYS = 7;

export default function AccountPlanGate({ user }: { user: User | null }) {
  const [entitlement, setEntitlement] = useState<Entitlement | null>(null);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [selected, setSelected] = useState<PlanId>("pro");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");

  const trialActive = Boolean(entitlement?.trial_ends_at && new Date(entitlement.trial_ends_at).getTime() > Date.now());
  const trialUsed = Boolean(entitlement?.trial_claimed_at);
  const currentPlan = useMemo(() => plans.find((plan) => plan.id === (entitlement?.selected_plan_id || "free")) || plans[0], [entitlement?.selected_plan_id]);

  async function load() {
    if (!user || !supabase) { setLoading(false); return; }
    setLoading(true);
    const { data, error } = await supabase.from("account_entitlements").select("user_id,selected_plan_id,trial_claimed_at,trial_plan_id,trial_started_at,trial_ends_at").eq("user_id", user.id).maybeSingle();
    if (!error) setEntitlement(data as Entitlement | null);
    setLoading(false);
  }

  useEffect(() => { void load(); }, [user?.id]);

  if (!user || loading || !supabase) return null;

  async function choose(planId: PlanId, startTrial: boolean) {
    setBusy(true); setMessage("");
    try {
      if (startTrial) {
        // The UI records the one-time trial entitlement. A production payment gateway
        // must be connected before this is advertised as an actual ₹9 charge.
      }
      const { error } = await supabase!.rpc("choose_account_plan", { p_plan_id: planId, p_start_trial: startTrial });
      if (error) throw error;
      await load(); setOpen(false); setPassword("");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Plan selection could not be saved.");
    } finally { setBusy(false); }
  }

  async function changePlan() {
    if (!password) { setMessage("Enter your account password to change the plan."); return; }
    if (!user.email) { setMessage("This account does not have an email password available for re-authentication."); return; }
    setBusy(true); setMessage("");
    try {
      const { error: authError } = await supabase!.auth.signInWithPassword({ email: user.email, password });
      if (authError) throw new Error("The account password is incorrect.");
      const { error } = await supabase!.rpc("change_account_plan", { p_plan_id: selected });
      if (error) throw error;
      await load(); setOpen(false); setPassword("");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Plan change could not be saved.");
    } finally { setBusy(false); }
  }

  const needsInitialChoice = !entitlement;
  const showChange = !needsInitialChoice;

  return <>
    {showChange && <button type="button" className="btn" onClick={() => { setOpen(true); setSelected(entitlement?.selected_plan_id || "free"); setMessage(""); }} style={{ position: "fixed", right: 22, bottom: 22, zIndex: 1200, boxShadow: "0 12px 32px rgba(0,0,0,.35)" }}>Account plan</button>}
    {(needsInitialChoice || open) && <div className="modal-backdrop" style={{ zIndex: 1100 }}>
      <section className="modal" style={{ maxWidth: 980, width: "min(94vw, 980px)" }}>
        <div className="page-head">
          <div><span className="eyebrow">Account setup</span><h2>{needsInitialChoice ? "Start your AthleteN trial" : "Change account plan"}</h2></div>
          {showChange && <button type="button" className="close" onClick={() => setOpen(false)} aria-label="Close">x</button>}
        </div>
        {needsInitialChoice ? <p>Try the normal AthleteN app experience for <strong>7 days for {TRIAL_PRICE}</strong>. Choose the plan you want to trial below. This offer is limited to <strong>one trial per account</strong>.</p> : <p>Changing plans requires your current account password. Your one-time {TRIAL_DAYS}-day trial cannot be reset or reused.</p>}
        <div className="plan-grid" style={{ marginTop: 18 }}>
          {plans.map((plan) => <article key={plan.id} className={`card plan-card ${selected === plan.id ? "active" : ""}`} onClick={() => setSelected(plan.id)} style={{ cursor: "pointer" }}>
            <div className="plan-card-head"><span className="pill">{plan.audience}</span>{selected === plan.id && <span className="status-chip success">Selected</span>}</div>
            <h3>{plan.name}</h3><div className="plan-price"><strong>{plan.price}</strong></div><p className="plan-ai">{plan.aiLimit.toLocaleString()} AI coach messages/month</p>
            <ul>{plan.features.map((feature) => <li key={feature}>{feature}</li>)}</ul>
            {needsInitialChoice && plan.id !== "free" && !trialUsed && <span className="status-chip success">7 days · {TRIAL_PRICE}</span>}
            {plan.id === "free" && <span className="status-chip">Free plan</span>}
          </article>)}
        </div>
        {showChange && trialActive && <p className="notice" role="status">Trial active. You can switch the trial plan, but the original trial end date does not change.</p>}
        {showChange && !trialActive && <p className="notice" role="status">Your one-time trial has ended. Paid-plan billing must be completed through the configured payment provider.</p>}
        {showChange && <label className="field" style={{ marginTop: 14 }}><span>Account password</span><input type="password" value={password} onChange={(event) => setPassword(event.target.value)} autoComplete="current-password" placeholder="Enter your current password" /></label>}
        {message && <p className="notice" role="alert">{message}</p>}
        <div className="inline-actions" style={{ justifyContent: "flex-end", marginTop: 18 }}>
          {showChange && <button type="button" className="btn" onClick={() => setOpen(false)} disabled={busy}>Cancel</button>}
          {needsInitialChoice ? <button type="button" className="btn primary" disabled={busy} onClick={() => void choose(selected, selected !== "free")}>{busy ? "Starting..." : selected === "free" ? "Continue with Free" : `Start ${TRIAL_DAYS}-day trial · ${TRIAL_PRICE}`}</button> : <button type="button" className="btn primary" disabled={busy} onClick={() => void changePlan()}>{busy ? "Verifying..." : "Confirm plan change"}</button>}
        </div>
      </section>
    </div>}
  </>;
}
