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
  trial_fee_paise?: number | null;
  trial_payment_status?: "not_required" | "pending" | "paid" | "failed" | "refunded" | null;
  trial_payment_provider?: string | null;
  trial_payment_reference?: string | null;
};

type TrialCheckout = {
  orderId: string;
  provider: "razorpay" | "stripe" | "cashfree";
  planId: PlanId;
  checkoutUrl?: string;
  providerOrderId?: string;
  providerSessionId?: string;
  paymentSessionId?: string;
  keyId?: string;
  amountMinor: number;
  currency: string;
};

async function loadScript(src: string) {
  const existing = document.querySelector(`script[src="${src}"]`);
  if (existing) return;
  await new Promise<void>((resolve, reject) => {
    const script = document.createElement("script");
    script.src = src;
    script.async = true;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error("Payment checkout could not be loaded."));
    document.head.appendChild(script);
  });
}

export default function AccountPlanGate({ user }: { user: User | null }) {
  const [entitlement, setEntitlement] = useState<Entitlement | null>(null);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [selected, setSelected] = useState<PlanId>("pro");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");

  async function load() {
    if (!user || !supabase) { setLoading(false); return; }
    setLoading(true);
    const { data, error } = await supabase.rpc("get_account_entitlement");
    if (!error) setEntitlement(data as Entitlement | null);
    else setMessage(import.meta.env.DEV ? error.message : "Your account plan could not be loaded. Please refresh and try again.");
    setLoading(false);
  }

  useEffect(() => { void load(); }, [user?.id]);

  const trialActive = Boolean(entitlement?.trial_ends_at && new Date(entitlement.trial_ends_at).getTime() > Date.now());
  const trialUsed = Boolean(entitlement?.trial_claimed_at);
  const currentPlan = useMemo(() => plans.find((plan) => plan.id === (entitlement?.selected_plan_id || "free")) || plans[0], [entitlement?.selected_plan_id]);

  if (!user || loading || !supabase) return null;

  async function chooseFree() {
    setBusy(true); setMessage("");
    try {
      const { error } = await supabase!.rpc("choose_account_plan", { p_plan_id: "free", p_start_trial: false });
      if (error) throw error;
      await load(); setOpen(false); setPassword("");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Plan selection could not be saved.");
    } finally { setBusy(false); }
  }

  async function waitForTrialActivation() {
    for (let attempt = 0; attempt < 20; attempt += 1) {
      await new Promise((resolve) => setTimeout(resolve, 1000));
      const { data, error } = await supabase!.rpc("get_account_entitlement");
      if (!error && data) {
        const next = data as Entitlement;
        setEntitlement(next);
        if (next.trial_ends_at && new Date(next.trial_ends_at).getTime() > Date.now()) return true;
      }
    }
    return false;
  }

  async function startTrialCheckout() {
    if (selected === "free") return;
    if (trialActive || trialUsed) return;
    setBusy(true); setMessage("");
    try {
      const { data: sessionData } = await supabase!.auth.getSession();
      const token = sessionData.session?.access_token;
      if (!token) throw new Error("Your sign-in session expired. Please sign in again.");

      const response = await fetch("/.netlify/functions/create-trial-checkout", {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ planId: selected })
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.error || "Unable to start the trial checkout.");
      const checkout = payload as TrialCheckout;

      if (checkout.provider === "stripe") {
        if (!checkout.checkoutUrl) throw new Error("Stripe checkout URL was not returned.");
        window.location.assign(checkout.checkoutUrl);
        return;
      }

      if (checkout.provider === "razorpay") {
        await loadScript("https://checkout.razorpay.com/v1/checkout.js");
        const Razorpay = (window as typeof window & { Razorpay?: new (options: Record<string, unknown>) => { open: () => void } }).Razorpay;
        if (!Razorpay || !checkout.providerOrderId || !checkout.keyId) throw new Error("Razorpay checkout could not be initialized.");
        const razorpay = new Razorpay({
          key: checkout.keyId,
          amount: checkout.amountMinor,
          currency: checkout.currency,
          name: "AthleteN",
          description: `${selected} 7-day trial`,
          order_id: checkout.providerOrderId,
          prefill: { name: user.user_metadata?.full_name || "", email: user.email || "" },
          notes: { purpose: "trial", plan_id: selected },
          theme: { color: "#111827" },
          handler: () => { void waitForTrialActivation().then((active) => {
            setBusy(false);
            if (active) { setMessage("Trial activated successfully."); setOpen(false); }
            else setMessage("Payment was received, but confirmation is still processing. Refresh shortly.");
          }); }
        });
        razorpay.open();
        return;
      }

      await loadScript("https://sdk.cashfree.com/js/v3/cashfree.js");
      const cashfreeFactory = (window as typeof window & { Cashfree?: (options: { mode: string }) => { checkout: (options: { paymentSessionId: string; redirectTarget: string }) => Promise<unknown> } }).Cashfree;
      if (!cashfreeFactory || !checkout.paymentSessionId) throw new Error("Cashfree checkout could not be initialized.");
      const cashfree = cashfreeFactory({ mode: "production" });
      await cashfree.checkout({ paymentSessionId: checkout.paymentSessionId, redirectTarget: "_modal" });
      const active = await waitForTrialActivation();
      if (active) { setMessage("Trial activated successfully."); setOpen(false); }
      else setMessage("Payment confirmation is still processing. Refresh shortly.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Trial payment could not be started.");
    } finally {
      setBusy(false);
    }
  }

  async function changePlan() {
    if (trialActive) { setMessage("Your trial plan is locked for seven days. It cannot be changed during the trial."); return; }
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
  const trialExpired = Boolean(entitlement?.trial_claimed_at && !trialActive);

  return <>
    {showChange && <button type="button" className="btn" onClick={() => { setOpen(true); setSelected(entitlement?.selected_plan_id || "free"); setMessage(""); }} style={{ position: "fixed", right: 22, bottom: 22, zIndex: 1200, boxShadow: "0 12px 32px rgba(0,0,0,.35)" }}>Account plan</button>}
    {(needsInitialChoice || open) && <div className="modal-backdrop" style={{ zIndex: 1100 }}>
      <section className="modal" style={{ maxWidth: 980, width: "min(94vw, 980px)" }}>
        <div className="page-head">
          <div><span className="eyebrow">Account setup</span><h2>{needsInitialChoice ? "Choose your AthleteN plan" : "Account plan"}</h2></div>
          {showChange && <button type="button" className="close" onClick={() => setOpen(false)} aria-label="Close">x</button>}
        </div>
        {needsInitialChoice
          ? <p>Free is available immediately. A paid seven-day trial requires the <strong>₹9 payment to be completed first</strong>. The trial starts automatically only after the payment provider confirms the payment.</p>
          : trialActive
            ? <p><strong>{currentPlan.name}</strong> trial is active until {new Date(entitlement!.trial_ends_at!).toLocaleString()}. The trial plan is locked for the full seven days and cannot be changed.</p>
            : trialExpired
              ? <p>Your one-time seven-day trial has ended. Your account has automatically returned to <strong>Free Athlete</strong>. The trial cannot be started again.</p>
              : <p>Your account is on <strong>{currentPlan.name}</strong>. A paid plan change requires payment; the one-time trial cannot be reused.</p>}

        <div className="plan-grid" style={{ marginTop: 18 }}>
          {plans.map((plan) => {
            const lockedTrial = trialActive && plan.id !== entitlement?.selected_plan_id;
            const trialEligible = !trialUsed && !trialActive && !trialExpired && plan.id !== "free";
            return <article
              key={plan.id}
              className={`card plan-card ${selected === plan.id ? "active" : ""}`}
              onClick={() => {
                if (busy || lockedTrial || trialActive) return;
                if (needsInitialChoice && plan.id === "free") { void chooseFree(); return; }
                setSelected(plan.id);
              }}
              role="button"
              tabIndex={lockedTrial || trialActive ? -1 : 0}
              aria-disabled={lockedTrial || trialActive}
              style={{ cursor: busy || lockedTrial || trialActive ? "not-allowed" : "pointer", opacity: lockedTrial ? 0.55 : 1 }}
            >
              <div className="plan-card-head"><span className="pill">{plan.audience}</span>{selected === plan.id && <span className="status-chip success">Selected</span>}</div>
              <h3>{plan.name}</h3><div className="plan-price"><strong>{plan.price}</strong></div><p className="plan-ai">{plan.aiLimit.toLocaleString()} AI coach messages/month</p>
              <ul>{plan.features.map((feature) => <li key={feature}>{feature}</li>)}</ul>
              {trialEligible && <span className="status-chip success">₹9 / 7 days — payment required</span>}
              {plan.id === "free" && <span className="status-chip">No trial payment</span>}
              {trialActive && plan.id === entitlement?.selected_plan_id && <span className="status-chip success">Trial locked</span>}
            </article>;
          })}
        </div>

        {needsInitialChoice && selected !== "free" && <div className="card" style={{ marginTop: 16 }}>
          <div className="plan-card-head"><div><strong>Pay first, then trial</strong><div className="muted">₹9 one-time payment · 7 days</div></div><span className={`status-chip ${entitlement?.trial_payment_status === "paid" ? "success" : ""}`}>{entitlement?.trial_payment_status === "paid" ? "Payment confirmed" : entitlement?.trial_payment_status === "pending" ? "Payment pending" : "Payment required"}</span></div>
          <p style={{ marginBottom: 12 }}>The trial is activated only from a verified payment webhook. The selected plan is locked for seven days, then the account returns to Free and the one-time trial is permanently consumed.</p>
          <button type="button" className="btn primary" disabled={busy || entitlement?.trial_payment_status === "pending" || entitlement?.trial_payment_status === "paid"} onClick={() => void startTrialCheckout()}>{busy ? "Opening checkout..." : entitlement?.trial_payment_status === "paid" ? "Payment confirmed" : entitlement?.trial_payment_status === "pending" ? "Payment processing..." : "Pay ₹9 — start 7-day trial"}</button>
        </div>}

        {trialActive && <p className="notice" role="status">Trial active. Plan changes are disabled until the trial end date.</p>}
        {trialExpired && <p className="notice" role="status">Trial ended. Free Athlete is active again. No second trial is available.</p>}
        {entitlement?.trial_payment_status === "pending" && <p className="notice" role="status">Trial payment is pending. AthleteN will not grant access until the payment provider confirms the payment.</p>}
        {entitlement?.trial_payment_status === "failed" && <p className="notice" role="alert">The trial payment failed. No trial access was granted.</p>}
        {showChange && !trialActive && !trialExpired && <label className="field" style={{ marginTop: 14 }}><span>Account password</span><input type="password" value={password} onChange={(event) => setPassword(event.target.value)} autoComplete="current-password" placeholder="Enter your current password" /></label>}
        {message && <p className="notice" role="alert">{message}</p>}
        <div className="inline-actions" style={{ justifyContent: "flex-end", marginTop: 18 }}>
          {showChange && <button type="button" className="btn" onClick={() => setOpen(false)} disabled={busy}>Close</button>}
          {needsInitialChoice && selected === "free" && <button type="button" className="btn primary" disabled={busy} onClick={() => void chooseFree()}>{busy ? "Saving..." : "Continue with Free"}</button>}
          {showChange && !trialActive && !trialExpired && <button type="button" className="btn primary" disabled={busy} onClick={() => void changePlan()}>{busy ? "Verifying..." : "Confirm plan change"}</button>}
        </div>
      </section>
    </div>}
  </>;
}
