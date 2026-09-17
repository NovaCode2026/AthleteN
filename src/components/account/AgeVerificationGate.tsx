import { useEffect, useState } from "react";
import { BadgeCheck, Clock3, ShieldCheck } from "lucide-react";
import { requireSupabase } from "../../lib/supabase";
import type { Profile } from "../../types";

type AgeStatus = { date_of_birth: string; parent_email?: string | null; status: "not_required" | "pending" | "approved" | "rejected"; token_expires_at?: string | null; approved_at?: string | null; };
type Props = { profile: Profile; refresh: () => Promise<void>; children: React.ReactNode };

function ageFromDob(value: string) {
  if (!value) return -1;
  const dob = new Date(`${value}T00:00:00`);
  if (Number.isNaN(dob.getTime())) return -1;
  const now = new Date();
  let age = now.getFullYear() - dob.getFullYear();
  const month = now.getMonth() - dob.getMonth();
  if (month < 0 || (month === 0 && now.getDate() < dob.getDate())) age -= 1;
  return age;
}

export default function AgeVerificationGate({ profile, refresh, children }: Props) {
  const supabase = requireSupabase();
  const [status, setStatus] = useState<AgeStatus | null>(null);
  const [dateOfBirth, setDateOfBirth] = useState(profile.date_of_birth || "");
  const [parentEmail, setParentEmail] = useState("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");

  async function load() {
    setLoading(true);
    setMessage("");
    const { data, error } = await supabase.rpc("get_age_verification_status");
    if (error) setMessage(error.message || "Age verification status could not be loaded.");
    else {
      const next = (data?.[0] || null) as AgeStatus | null;
      setStatus(next);
      if (next?.date_of_birth) setDateOfBirth(next.date_of_birth);
      if (next?.parent_email) setParentEmail(next.parent_email);
    }
    setLoading(false);
  }

  useEffect(() => { void load(); }, [profile.date_of_birth]);

  async function startApproval() {
    setBusy(true);
    setMessage("");
    try {
      const age = ageFromDob(dateOfBirth);
      if (age < 0) throw new Error("Enter a valid date of birth.");
      if (age < 18 && !parentEmail.trim()) throw new Error("A parent or guardian email is required for users under 18.");
      const { data, error } = await supabase.functions.invoke("start-parent-approval", {
        body: { date_of_birth: dateOfBirth, parent_email: parentEmail.trim(), full_name: profile.full_name || "your athlete" }
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      setStatus({ date_of_birth: dateOfBirth, parent_email: parentEmail.trim(), status: data?.status || "pending", token_expires_at: data?.expires_at || null });
      await refresh();
      setMessage(age < 18 ? "Approval request sent to the parent/guardian email. You can enter AthleteN after they approve." : "Age verified. Your account is ready.");
    } catch (error) {
      let message = error instanceof Error ? error.message : "Age verification could not be started.";
      const context = error && typeof error === "object" && "context" in error ? (error as { context?: Response }).context : undefined;
      if (context) {
        try {
          const body = await context.clone().json() as { error?: string; message?: string };
          message = body.error || body.message || message;
        } catch {
          // Keep the original error message if the response is not JSON.
        }
      }
      setMessage(message);
    } finally { setBusy(false); }
  }

  if (loading) return <main className="onboarding-page"><section className="auth-card"><div className="skeleton card">Checking account safety...</div></section></main>;
  if (status?.status === "approved" || status?.status === "not_required") return <>{children}</>;

  const age = ageFromDob(dateOfBirth);
  const needsParent = age >= 0 && age < 18;

  return <main className="onboarding-page">
    <section className="auth-card">
      <div className="inline-actions"><ShieldCheck size={24} /><div><span className="eyebrow">Account safety</span><h1>Age verification</h1></div></div>
      {status?.status === "pending" ? <>
        <div className="notice" role="status"><Clock3 size={16} /> Waiting for parent/guardian approval.</div>
        <p>We sent an approval link to the parent/guardian email on file. The athlete account stays locked until approval is completed.</p>
        {status.token_expires_at && <p className="muted">Approval link expires {new Date(status.token_expires_at).toLocaleString()}.</p>}
        <button className="btn primary" onClick={() => void startApproval()} disabled={busy}>{busy ? "Sending..." : "Resend approval email"}</button>
      </> : <>
        <p>Enter your date of birth accurately. AthleteN uses it only to determine whether parent/guardian approval is required.</p>
        <label className="field"><span>Date of birth</span><input type="date" value={dateOfBirth} onChange={(e) => setDateOfBirth(e.target.value)} max={new Date().toISOString().slice(0,10)} required /></label>
        {needsParent && <label className="field"><span>Parent / guardian email</span><input type="email" value={parentEmail} onChange={(e) => setParentEmail(e.target.value)} placeholder="parent@example.com" required /></label>}
        {age >= 18 && <p className="notice" role="status"><BadgeCheck size={16} /> You are 18 or older, so parent/guardian approval is not required.</p>}
        <button className="btn primary" onClick={() => void startApproval()} disabled={busy}>{busy ? "Verifying..." : needsParent ? "Send parent approval request" : "Confirm age and continue"}</button>
      </>}
      {message && <p className="notice" role="alert">{message}</p>}
    </section>
  </main>;
}

export function ParentApprovalPage() {
  const supabase = requireSupabase();
  const [state, setState] = useState<"loading" | "approved" | "error">("loading");
  const [message, setMessage] = useState("");

  useEffect(() => {
    const token = new URLSearchParams(window.location.search).get("token") || "";
    if (!token) { setState("error"); setMessage("This approval link is missing its token."); return; }
    void (async () => {
      const { data, error } = await supabase.functions.invoke("approve-parent", { body: { token } });
      if (error || data?.error) {
        setState("error");
        setMessage(error?.message || data?.error || "This approval link could not be used.");
        return;
      }
      setState("approved");
      setMessage(data?.message || "Parent/guardian approval recorded.");
    })();
  }, []);

  return <main className="auth-page"><section className="auth-card">
    <span className="eyebrow">AthleteN</span>
    <h1>{state === "loading" ? "Checking approval link..." : state === "approved" ? "Account approved" : "Approval link unavailable"}</h1>
    <p>{state === "loading" ? "Please wait." : message}</p>
    {state === "approved" && <p className="notice" role="status">The athlete can now sign in and continue to AthleteN.</p>}
    {state === "error" && <p className="notice" role="alert">Ask the athlete to resend the parent/guardian approval email if this link has expired.</p>}
  </section></main>;
}
