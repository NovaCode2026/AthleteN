import type { ReactNode } from "react";
import { createContext, useContext, useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import type { Session, User } from "@supabase/supabase-js";
import { requireSupabase, supabase } from "../lib/supabase";
import AccountPlanGate from "../components/account/AccountPlanGate";

interface Credentials { email: string; password: string; }
interface SignUpCredentials extends Credentials { metadata?: Record<string, string>; }
interface AuthContextValue {
  session: Session | null;
  user: User | null;
  loading: boolean;
  configured: boolean;
  emailVerified: boolean;
  profileBootstrapError: string | null;
  signUp: (credentials: SignUpCredentials) => Promise<void>;
  signIn: (credentials: Credentials) => Promise<void>;
  signInWithGoogle: () => Promise<void>;
  resetPassword: (email: string) => Promise<void>;
  resendVerification: (email: string) => Promise<void>;
  updatePassword: (password: string) => Promise<void>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

function toSafeAuthError(error: unknown, fallback: string) {
  const message = error instanceof Error ? error.message : "";
  const lower = message.toLowerCase();
  if (error instanceof TypeError && lower.includes("failed to fetch")) return new Error("Unable to connect to AthleteN services. Please check your connection and try again.");
  if (lower.includes("fetch") || lower.includes("network")) return new Error("Registration service is temporarily unavailable. Please try again.");
  if (lower.includes("invalid login credentials")) return new Error("The email or password is incorrect.");
  if (lower.includes("already registered") || lower.includes("already exists")) return new Error("An account with this email may already exist. Try logging in or resetting your password.");
  if (lower.includes("expired") || lower.includes("one-time token")) return new Error("This verification link has expired. Request a new verification email.");
  if (lower.includes("rate limit") || lower.includes("only request this after")) return new Error("Please wait a moment before requesting another email.");
  if (lower.includes("password")) return new Error("Your email or password could not be accepted. Please check the requirements and try again.");
  return new Error(message || fallback);
}

function GoogleAuthButton() {
  const auth = useAuth();
  const [target, setTarget] = useState<HTMLElement | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  useEffect(() => {
    if (auth.user || !auth.configured) return undefined;
    const findTarget = () => setTarget(document.querySelector<HTMLElement>(".auth-card"));
    findTarget();
    const observer = new MutationObserver(findTarget);
    observer.observe(document.body, { childList: true, subtree: true });
    return () => observer.disconnect();
  }, [auth.user, auth.configured]);
  if (auth.user || !target) return null;
  async function handleGoogleSignIn() {
    setBusy(true); setMessage("");
    try { await auth.signInWithGoogle(); }
    catch (error) { setMessage(error instanceof Error ? error.message : "Google sign-in could not be started."); setBusy(false); }
  }
  return createPortal(<div className="google-auth" aria-label="Google sign-in"><div className="google-auth-divider"><span>or</span></div><button type="button" className="btn" onClick={() => void handleGoogleSignIn()} disabled={busy}><span aria-hidden="true" style={{ fontWeight: 800, fontSize: 18 }}>G</span>{busy ? "Connecting to Google..." : "Continue with Google"}</button>{message && <p className="notice" role="alert">{message}</p>}</div>, target);
}

async function ensureProfileForUser(user: User) {
  if (!supabase) return;
  const metadata = user.user_metadata || {};
  const name = String(metadata.full_name || metadata.name || "").trim() || String(user.email || "").split("@")[0].trim() || "Athlete";
  const { data: existing, error: selectError } = await supabase.from("profiles").select("user_id,role,plan_id").eq("user_id", user.id).maybeSingle();
  if (selectError) throw selectError;
  if (!existing) {
    const { error } = await supabase.from("profiles").insert({ user_id: user.id, full_name: name, plan_id: "free", role: "athlete", verified_athlete: false, founder_badge: false });
    if (error && !String(error.message || "").toLowerCase().includes("duplicate")) throw error;
    return;
  }
  if (existing.role === "user") {
    const { error } = await supabase.from("profiles").update({ role: "athlete" }).eq("user_id", user.id);
    if (error) throw error;
  }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const [profileBootstrapError, setProfileBootstrapError] = useState<string | null>(null);
  useEffect(() => {
    if (!supabase) { setLoading(false); return undefined; }
    let mounted = true;
    supabase.auth.getSession().then(async ({ data }) => {
      if (data.session?.user) {
        try { await ensureProfileForUser(data.session.user); setProfileBootstrapError(null); }
        catch (error) { const message = error instanceof Error ? error.message : "Your AthleteN profile could not be initialized."; console.error("AthleteN profile bootstrap failed:", error); if (mounted) setProfileBootstrapError(message); }
      }
      if (mounted) { setSession(data.session); setLoading(false); }
    }).catch((error) => {
      console.error("AthleteN session initialization failed:", error);
      if (mounted) { setProfileBootstrapError("Your secure session could not be initialized. Please refresh and try again."); setLoading(false); }
    });
    const { data: listener } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      setProfileBootstrapError(null);
      if (nextSession?.user) void ensureProfileForUser(nextSession.user).catch((error) => { const message = error instanceof Error ? error.message : "Your AthleteN profile could not be initialized."; console.error("AthleteN profile bootstrap failed:", error); setProfileBootstrapError(message); });
      setSession(nextSession); setLoading(false);
    });
    return () => { mounted = false; listener.subscription.unsubscribe(); };
  }, []);

  const value = useMemo<AuthContextValue>(() => ({
    session,
    user: session?.user ?? null,
    loading,
    configured: Boolean(supabase),
    emailVerified: Boolean(session?.user.email_confirmed_at),
    profileBootstrapError,
    signUp: async ({ email, password, metadata }) => {
      try { const { error } = await requireSupabase().auth.signUp({ email, password, options: { data: metadata, emailRedirectTo: `${window.location.origin}/auth/callback` } }); if (error) throw error; }
      catch (error) { throw toSafeAuthError(error, "Registration could not be completed. Please try again."); }
    },
    signIn: async ({ email, password }) => {
      try { const { error } = await requireSupabase().auth.signInWithPassword({ email, password }); if (error) throw error; }
      catch (error) { throw toSafeAuthError(error, "Login could not be completed. Please try again."); }
    },
    signInWithGoogle: async () => {
      try { const { error } = await requireSupabase().auth.signInWithOAuth({ provider: "google", options: { redirectTo: `${window.location.origin}/auth/callback` } }); if (error) throw error; }
      catch (error) { throw toSafeAuthError(error, "Google sign-in could not be started. Please try again."); }
    },
    resetPassword: async (email) => {
      try { const { error } = await requireSupabase().auth.resetPasswordForEmail(email, { redirectTo: `${window.location.origin}/reset-password` }); if (error) throw error; }
      catch (error) { throw toSafeAuthError(error, "Password reset could not be started. Please try again."); }
    },
    resendVerification: async (email) => {
      try { const { error } = await requireSupabase().auth.resend({ type: "signup", email, options: { emailRedirectTo: `${window.location.origin}/auth/callback` } }); if (error) throw error; }
      catch (error) { throw toSafeAuthError(error, "Verification email could not be resent. Please try again."); }
    },
    updatePassword: async (password) => {
      try { const { error } = await requireSupabase().auth.updateUser({ password }); if (error) throw error; }
      catch (error) { throw toSafeAuthError(error, "Password could not be updated. Please try again."); }
    },
    signOut: async () => { const { error } = await requireSupabase().auth.signOut(); if (error) throw error; }
  }), [session, loading, profileBootstrapError]);

  return <AuthContext.Provider value={value}>{children}<GoogleAuthButton /><AccountPlanGate user={session?.user ?? null} /></AuthContext.Provider>;
}

export function useAuth() {
  const value = useContext(AuthContext);
  if (!value) throw new Error("useAuth must be used inside AuthProvider.");
  return value;
}
