import { useEffect, useState } from "react";
import type { User } from "@supabase/supabase-js";
import { plans } from "../../config/plans";
import type { PlanId } from "../../types";
import { supabase } from "../../lib/supabase";

export default function AccountPlanGate({ user }: { user: User | null }) {
  const [planId, setPlanId] = useState<PlanId>("free");
  const [open, setOpen] = useState(false);

  async function loadPlan() {
    if (!user || !supabase) return;
    const { data } = await supabase.from("profiles").select("plan_id").eq("user_id", user.id).maybeSingle();
    const next = data?.plan_id as PlanId | undefined;
    if (next && plans.some((plan) => plan.id === next)) setPlanId(next);
  }

  useEffect(() => { void loadPlan(); }, [user?.id]);

  if (!user || !supabase) return null;
  const current = plans.find((plan) => plan.id === planId) || plans[0];

  function openPlans() {
    setOpen(false);
    if (window.location.pathname !== "/plans") {
      window.history.pushState({}, "", "/plans");
      window.dispatchEvent(new PopStateEvent("popstate"));
    }
  }

  return <>
    <button
      type="button"
      className="btn"
      aria-label="Open account plan"
      data-testid="account-plan-button"
      onClick={() => setOpen(true)}
      style={{ position: "fixed", right: 22, bottom: 22, zIndex: 1200, boxShadow: "0 12px 32px rgba(0,0,0,.35)" }}
    >
      Account plan
    </button>
    {open && <div className="modal-backdrop" style={{ zIndex: 1100 }}>
      <section className="modal" role="dialog" aria-modal="true" aria-labelledby="account-plan-title" style={{ maxWidth: 620 }}>
        <div className="page-head">
          <div><span className="eyebrow">Account</span><h2 id="account-plan-title">Your AthleteN plan</h2></div>
          <button type="button" className="close" aria-label="Close account plan" onClick={() => setOpen(false)}>x</button>
        </div>
        <div className="card plan-card">
          <span className="pill">{current.audience}</span>
          <h3>{current.name}</h3>
          <div className="plan-price"><strong>{current.price}</strong></div>
          <p>{current.aiLimit.toLocaleString()} AI coach messages/month</p>
          <ul>{current.features.map((feature) => <li key={feature}>{feature}</li>)}</ul>
        </div>
        <p className="notice">Subscription checkout and paid plan changes are intentionally deferred until the payment integration is finalized.</p>
        <div className="inline-actions" style={{ justifyContent: "flex-end" }}>
          <button type="button" className="btn" onClick={() => setOpen(false)}>Close</button>
          <button type="button" className="btn primary" onClick={openPlans}>Open Plans</button>
        </div>
      </section>
    </div>}
  </>;
}
