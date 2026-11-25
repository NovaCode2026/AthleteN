import { useCallback, useEffect, useMemo, useState } from "react";
import { AlertTriangle, BadgeCheck, Clock3, ExternalLink, RefreshCw, Search, Shield, ShieldCheck, UserRoundCog } from "lucide-react";
import { supabase } from "../../lib/supabase";
import "./PlatformAdminExtensions.css";

type PermissionPayload = { base_role: string; permission_role: string; permissions: string[] };
type Overview = {
  users: number | null; athletes: number | null; coaches: number | null; academies: number | null; admins: number | null;
  pending_student_verifications: number | null; active_subscriptions: number | null; open_support_tickets: number | null;
  restricted_accounts: number | null; verified_athletes: number | null; verified_coaches: number | null; verified_academies: number | null;
};
type AthleteVerificationReview = {
  user_id: string; full_name: string | null; username: string | null;
  verified_athlete: boolean; created_at: string;
};
type VerificationRequest = {
  id: string; user_id: string; full_name: string | null; username: string | null;
  document_type: string; file_path: string | null; status: string; created_at: string;
};
type AdminAssignment = {
  admin_user_id: string; full_name: string | null; username: string | null; base_role: string;
  permission_role: string | null; assigned_by: string | null; updated_at: string;
};
type AccountSearchResult = {
  user_id: string; full_name: string | null; username: string | null; role: string;
  plan_id: string; created_at: string;
};
type AccessControl = {
  user_id: string; full_name: string | null; username: string | null; status: string;
  reason: string; expires_at: string | null; changed_by: string | null; updated_at: string;
};
type FeatureFlag = { id:string; flag_key:string; description:string|null; enabled:boolean; audience:string };
type PlatformAnnouncement = { id:string; title:string; body:string; audience:string; published_at:string|null; created_at:string };
type SupportTicket = { id:string; user_id:string; subject:string; body:string|null; status:string; priority:string; assigned_to:string|null; created_at:string; updated_at:string };
type FeedbackItem = { id:string; user_id:string; title:string; details:string|null; status:string; priority:string; created_at:string; updated_at:string };
type SubscriptionRecord = { id:string; user_id:string; plan_id:string; provider:string|null; status:string; current_period_end:string|null; created_at:string; updated_at:string };
type PaymentEventRecord = { id:string; user_id:string|null; provider:string; event_type:string; amount_minor:number|null; currency:string|null; status:string|null; created_at:string };
type AuditEntry = {
  id: string; actor_user_id: string | null; target_user_id: string | null;
  action: string; reason: string | null; metadata: Record<string, unknown>; created_at: string;
};

const text = (value: unknown) => value == null ? "" : String(value);
const localDateTime = (value: string | null) => value ? new Date(value).toLocaleString() : "No expiry";

export default function PlatformAdminExtensions({ userId, role }: { userId: string; role: string }) {
  const [permission, setPermission] = useState<PermissionPayload | null>(null);
  const [overview, setOverview] = useState<Overview | null>(null);
  const [featureFlags, setFeatureFlags] = useState<FeatureFlag[]>([]);
  const [announcements, setAnnouncements] = useState<PlatformAnnouncement[]>([]);
  const [supportTickets, setSupportTickets] = useState<SupportTicket[]>([]);
  const [feedbackItems, setFeedbackItems] = useState<FeedbackItem[]>([]);
  const [subscriptions, setSubscriptions] = useState<SubscriptionRecord[]>([]);
  const [paymentEvents, setPaymentEvents] = useState<PaymentEventRecord[]>([]);
  const [announcementDraft, setAnnouncementDraft] = useState({ title:"", body:"", audience:"all" });
  const [verificationQueue, setVerificationQueue] = useState<VerificationRequest[]>([]);
  const [athleteReviews, setAthleteReviews] = useState<AthleteVerificationReview[]>([]);
  const [athleteQuery, setAthleteQuery] = useState("");
  const [athleteReasons, setAthleteReasons] = useState<Record<string,string>>({});
  const [assignments, setAssignments] = useState<AdminAssignment[]>([]);
  const [audit, setAudit] = useState<AuditEntry[]>([]);
  const [accessRows, setAccessRows] = useState<AccessControl[]>([]);
  const [accountResults, setAccountResults] = useState<AccountSearchResult[]>([]);
  const [selectedAccount, setSelectedAccount] = useState<AccountSearchResult | null>(null);
  const [accountRole, setAccountRole] = useState("athlete");
  const [roleChangeReason, setRoleChangeReason] = useState("");
  const [accountQuery, setAccountQuery] = useState("");
  const [assignmentTarget, setAssignmentTarget] = useState("");
  const [assignmentScope, setAssignmentScope] = useState("support");
  const [accessStatus, setAccessStatus] = useState("restricted");
  const [accessReason, setAccessReason] = useState("");
  const [accessExpiry, setAccessExpiry] = useState("");
  const [reviewReasons, setReviewReasons] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(false);
  const [busyKey, setBusyKey] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const permissions = permission?.permissions || [];
  const has = (key: string) => role === "super_admin" || permissions.includes("*") || permissions.includes(key);
  const canAssign = role === "super_admin" && has("platform.roles.manage");
  const canVerify = has("verification.read");
  const canManageAthleteVerification = has("verification.athlete.manage");
  const canManageAccounts = has("account.manage");
  const canChangePlatformRoles = role === "super_admin";
  const canManageFlags = has("flags.manage");
  const canManageAnnouncements = has("announcements.manage");
  const canReadSupport = has("support.read");
  const canManageSupport = has("support.manage");
  const canReadFinance = has("billing.read");
  const canReadAudit = has("audit.read");
  const canReadOverview = ["platform.read","analytics.read","billing.read","verification.read","support.read"].some(has);

  const load = useCallback(async () => {
    if (!supabase) return;
    setLoading(true); setError("");
    try {
      const { data: accessData, error: permissionError } = await supabase.rpc("get_my_platform_admin_permissions");
      if (permissionError) throw permissionError;
      const loadedPermission = accessData as PermissionPayload;
      setPermission(loadedPermission);
      const keys = loadedPermission.permissions || [];
      const allowed = (key: string) => loadedPermission.base_role === "super_admin" || keys.includes("*") || keys.includes(key);
      const jobs: Array<Promise<void>> = [];
      if (["platform.read","analytics.read","billing.read","verification.read","support.read"].some(allowed)) {
        jobs.push((async () => {
          const r = await supabase.rpc("get_platform_admin_overview");
          if (r.error) throw r.error;
          setOverview(r.data as Overview);
        })());
      }
      if (allowed("verification.read")) {
        jobs.push((async () => {
          const r = await supabase.rpc("get_student_verification_queue");
          if (r.error) throw r.error;
          setVerificationQueue((r.data || []) as VerificationRequest[]);
        })());
      } else setVerificationQueue([]);
      if (allowed("flags.manage")) {
        jobs.push((async () => {
          const r = await supabase.from("feature_flags").select("id,flag_key,description,enabled,audience").order("flag_key");
          if (r.error) throw r.error;
          setFeatureFlags((r.data || []) as FeatureFlag[]);
        })());
      } else setFeatureFlags([]);
      if (allowed("announcements.manage")) {
        jobs.push((async () => {
          const r = await supabase.from("announcements").select("id,title,body,audience,published_at,created_at").order("created_at",{ascending:false}).limit(30);
          if (r.error) throw r.error;
          setAnnouncements((r.data || []) as PlatformAnnouncement[]);
        })());
      } else setAnnouncements([]);
      if (allowed("support.read")) {
        jobs.push((async () => {
          const [ticketsResult, feedbackResult] = await Promise.all([
            supabase.from("support_tickets").select("id,user_id,subject,body,status,priority,assigned_to,created_at,updated_at").order("created_at",{ascending:false}).limit(100),
            supabase.from("feedback_items").select("id,user_id,title,details,status,priority,created_at,updated_at").order("created_at",{ascending:false}).limit(100)
          ]);
          if (ticketsResult.error) throw ticketsResult.error;
          if (feedbackResult.error) throw feedbackResult.error;
          setSupportTickets((ticketsResult.data || []) as SupportTicket[]);
          setFeedbackItems((feedbackResult.data || []) as FeedbackItem[]);
        })());
      } else { setSupportTickets([]); setFeedbackItems([]); }
      if (allowed("billing.read")) {
        jobs.push((async () => {
          const [subscriptionsResult, paymentsResult] = await Promise.all([
            supabase.from("subscriptions").select("id,user_id,plan_id,provider,status,current_period_end,created_at,updated_at").order("updated_at",{ascending:false}).limit(100),
            supabase.from("payment_events").select("id,user_id,provider,event_type,amount_minor,currency,status,created_at").order("created_at",{ascending:false}).limit(100)
          ]);
          if (subscriptionsResult.error) throw subscriptionsResult.error;
          if (paymentsResult.error) throw paymentsResult.error;
          setSubscriptions((subscriptionsResult.data || []) as SubscriptionRecord[]);
          setPaymentEvents((paymentsResult.data || []) as PaymentEventRecord[]);
        })());
      } else { setSubscriptions([]); setPaymentEvents([]); }
      if (allowed("platform.roles.manage")) {
        jobs.push((async () => {
          const r = await supabase.rpc("get_platform_admin_assignments");
          if (r.error) throw r.error;
          setAssignments((r.data || []) as AdminAssignment[]);
        })());
      } else setAssignments([]);
      if (allowed("account.manage")) {
        jobs.push((async () => {
          const r = await supabase.rpc("get_platform_account_access_controls");
          if (r.error) throw r.error;
          setAccessRows((r.data || []) as AccessControl[]);
        })());
      } else setAccessRows([]);
      if (allowed("audit.read")) {
        jobs.push((async () => {
          const r = await supabase.rpc("get_platform_admin_audit", { p_limit: 40 });
          if (r.error) throw r.error;
          setAudit((r.data || []) as AuditEntry[]);
        })());
      } else setAudit([]);
      await Promise.all(jobs);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Platform admin data could not be loaded.");
    } finally { setLoading(false); }
  }, [role]);

  useEffect(() => { void load(); }, [load]);

  async function openProof(row: VerificationRequest) {
    if (!supabase || !row.file_path || !canVerify) return;
    setBusyKey("proof:" + row.id); setError("");
    try {
      const { data, error: signedError } = await supabase.storage.from("verification-proofs").createSignedUrl(row.file_path, 120);
      if (signedError || !data?.signedUrl) throw signedError || new Error("Proof preview is unavailable.");
      window.open(data.signedUrl, "_blank", "noopener,noreferrer");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Verification proof could not be opened.");
    } finally { setBusyKey(""); }
  }

  async function review(row: VerificationRequest, status: "approved" | "rejected") {
    if (!supabase) { setError("Admin service is unavailable."); return; }
    const reason = (reviewReasons[row.id] || "").trim();
    if (reason.length < 5 || reason.length > 500) {
      setError("Enter a verification decision reason between 5 and 500 characters.");
      return;
    }
    setBusyKey("review:" + row.id); setError(""); setNotice("");
    try {
      const { error: reviewError } = await supabase.rpc("admin_review_student_verification", {
        p_request_id: row.id, p_status: status, p_reason: reason
      });
      if (reviewError) throw reviewError;
      setNotice(status === "approved" ? "Student proof approved. The decision was recorded in the platform audit log." : "Student proof rejected with feedback recorded for the athlete.");
      setReviewReasons((values) => ({ ...values, [row.id]: "" }));
      await load();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Verification review failed.");
    } finally { setBusyKey(""); }
  }

  async function updateSupportTicket(row: SupportTicket, values: Partial<Pick<SupportTicket,"status"|"priority"|"assigned_to">>) {
    if (!supabase || !canManageSupport) return;
    setBusyKey("ticket:" + row.id); setError(""); setNotice("");
    try {
      const { error: updateError } = await supabase.from("support_tickets")
        .update({...values}).eq("id",row.id);
      if (updateError) throw updateError;
      setNotice("Support ticket updated. The database audit trigger recorded the change.");
      await load();
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Support ticket could not be updated."); }
    finally { setBusyKey(""); }
  }

  async function updateFeedbackItem(row: FeedbackItem, values: Partial<Pick<FeedbackItem,"status"|"priority">>) {
    if (!supabase || !canManageSupport) return;
    setBusyKey("feedback:" + row.id); setError(""); setNotice("");
    try {
      const { error: updateError } = await supabase.from("feedback_items")
        .update({...values}).eq("id",row.id);
      if (updateError) throw updateError;
      setNotice("Feedback item updated. The database audit trigger recorded the change.");
      await load();
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Feedback item could not be updated."); }
    finally { setBusyKey(""); }
  }

  async function toggleFeatureFlag(flag: FeatureFlag) {
    if (!supabase || !canManageFlags) return;
    setBusyKey("flag:" + flag.id); setError(""); setNotice("");
    try {
      const { error: updateError } = await supabase.from("feature_flags")
        .update({ enabled: !flag.enabled, updated_at: new Date().toISOString() })
        .eq("id", flag.id);
      if (updateError) throw updateError;
      setNotice("Feature flag updated. The database audit trigger recorded this change.");
      const { data, error: refreshError } = await supabase.from("feature_flags")
        .select("id,flag_key,description,enabled,audience").order("flag_key");
      if (refreshError) throw refreshError;
      setFeatureFlags((data || []) as FeatureFlag[]);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Feature flag could not be updated."); }
    finally { setBusyKey(""); }
  }

  async function publishAnnouncement() {
    if (!supabase || !canManageAnnouncements) return;
    const title = announcementDraft.title.trim();
    const body = announcementDraft.body.trim();
    if (title.length < 3 || title.length > 120 || body.length < 5 || body.length > 4000) {
      setError("Announcement title must be 3–120 characters and body 5–4,000 characters.");
      return;
    }
    setBusyKey("announcement"); setError(""); setNotice("");
    try {
      const { error: publishError } = await supabase.from("announcements").insert({
        title, body, audience: announcementDraft.audience,
        published_at: new Date().toISOString(), created_by: userId
      });
      if (publishError) throw publishError;
      setAnnouncementDraft({ title:"", body:"", audience:"all" });
      setNotice("Announcement published and added to the platform audit log.");
      const { data, error: refreshError } = await supabase.from("announcements")
        .select("id,title,body,audience,published_at,created_at")
        .order("created_at",{ascending:false}).limit(30);
      if (refreshError) throw refreshError;
      setAnnouncements((data || []) as PlatformAnnouncement[]);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Announcement could not be published."); }
    finally { setBusyKey(""); }
  }

  async function searchAthleteReviews() {
    if (!supabase) return;
    if (athleteQuery.trim().length < 2) { setError("Enter at least two characters to search Athlete accounts."); return; }
    setBusyKey("athlete-search"); setError("");
    try {
      const { data, error: searchError } = await supabase.rpc("search_athlete_verification_reviews", {
        p_query: athleteQuery.trim(), p_limit: 20
      });
      if (searchError) throw searchError;
      setAthleteReviews((data || []) as AthleteVerificationReview[]);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Athlete verification search failed."); }
    finally { setBusyKey(""); }
  }

  async function setAthleteVerified(row: AthleteVerificationReview, verified: boolean) {
    if (!supabase || !canManageAthleteVerification) return;
    const reason = (athleteReasons[row.user_id] || "").trim();
    if (reason.length < 5 || reason.length > 500) {
      setError("Record the evidence reviewed and decision reason (5–500 characters).");
      return;
    }
    setBusyKey("athlete-review:" + row.user_id); setError(""); setNotice("");
    try {
      const { error: updateError } = await supabase.rpc("admin_set_athlete_verified", {
        p_user_id: row.user_id, p_verified: verified, p_reason: reason
      });
      if (updateError) throw updateError;
      setNotice(verified ? "Athlete verification granted and audited." : "Athlete verification revoked and audited.");
      setAthleteReasons((values)=>({...values,[row.user_id]:""}));
      await searchAthleteReviews();
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Athlete verification update failed."); }
    finally { setBusyKey(""); }
  }

  async function searchAccounts() {
    if (!supabase) { setError("Admin service is unavailable."); return; }
    if (accountQuery.trim().length < 2) { setError("Enter at least two characters to search accounts."); return; }
    setBusyKey("search"); setError("");
    try {
      const { data, error: searchError } = await supabase.rpc("search_platform_accounts", { p_query: accountQuery.trim(), p_limit: 20 });
      if (searchError) throw searchError;
      setAccountResults((data || []) as AccountSearchResult[]);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Account search failed."); }
    finally { setBusyKey(""); }
  }

  async function applyAccountAccess() {
    if (!supabase || !selectedAccount) { setError("Select an account first."); return; }
    const reason = accessReason.trim();
    if (reason.length < 5 || reason.length > 500) { setError("Enter an account-access reason between 5 and 500 characters."); return; }
    let expiresAt: string | null = null;
    if (accessExpiry.trim()) {
      const parsedExpiry = Date.parse(accessExpiry);
      if (Number.isNaN(parsedExpiry) || parsedExpiry <= Date.now()) {
        setError("Expiry must be a valid future date and time.");
        return;
      }
      expiresAt = new Date(parsedExpiry).toISOString();
    }
    if (accessStatus === "restricted" && !expiresAt) {
      setError("A temporary restriction needs a future expiry date and time.");
      return;
    }
    setBusyKey("access"); setError(""); setNotice("");
    try {
      const { error: actionError } = await supabase.rpc("admin_set_platform_account_access", {
        p_user_id: selectedAccount.user_id, p_status: accessStatus, p_reason: reason, p_expires_at: expiresAt
      });
      if (actionError) throw actionError;
      setNotice("Account access status updated and written to the administrative audit log.");
      setAccessReason(""); setAccessExpiry(""); setSelectedAccount(null); setAccountResults([]);
      await load();
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Account access could not be changed."); }
    finally { setBusyKey(""); }
  }

  async function changeUserRole() {
    if (!supabase || !canChangePlatformRoles || !selectedAccount) return;
    const reason = roleChangeReason.trim();
    if (reason.length < 5 || reason.length > 500) { setError("Enter a role-change reason between 5 and 500 characters."); return; }
    const confirmed = window.confirm("Change " + (selectedAccount.full_name || selectedAccount.username || "this account") + " from " + selectedAccount.role + " to " + accountRole + "? This is a high-impact platform role change.");
    if (!confirmed) return;
    setBusyKey("user-role"); setError(""); setNotice("");
    try {
      const { error: roleError } = await supabase.rpc("admin_set_user_role", {
        p_user_id: selectedAccount.user_id, p_role: accountRole, p_reason: reason
      });
      if (roleError) throw roleError;
      setNotice("Platform account role updated and written to the administrative audit logs.");
      setRoleChangeReason("");
      setSelectedAccount({...selectedAccount,role:accountRole});
      await searchAccounts();
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Account role could not be changed."); }
    finally { setBusyKey(""); }
  }

  async function changeAssignment() {
    if (!supabase) { setError("Admin service is unavailable."); return; }
    if (!assignmentTarget) { setError("Choose an administrator account."); return; }
    setBusyKey("assignment"); setError(""); setNotice("");
    try {
      const { error: assignmentError } = await supabase.rpc("admin_assign_platform_role", {
        p_admin_user_id: assignmentTarget,
        p_permission_role: assignmentScope === "full" ? null : assignmentScope
      });
      if (assignmentError) throw assignmentError;
      setNotice("Administrator permission scope updated and audited.");
      setAssignmentTarget("");
      await load();
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Permission assignment failed."); }
    finally { setBusyKey(""); }
  }

  const pendingCount = useMemo(() => verificationQueue.length, [verificationQueue]);
  if (!permission && !loading) return null;
  if (!permission && loading) return <section className="platform-admin-extensions"><p>Loading platform permissions…</p></section>;
  return <section className="platform-admin-extensions" aria-label="Platform control centre">
    <div className="platform-admin-heading">
      <div><span className="admin-section-label">Platform governance</span><h3>Platform Control Centre</h3>
        <p>Permission-aware operations. Sensitive actions run through audited database functions.</p>
      </div>
      <button className="btn" type="button" onClick={() => void load()} disabled={loading}><RefreshCw size={14}/> {loading ? "Refreshing…" : "Refresh controls"}</button>
    </div>
    <div className="platform-admin-scope">
      <ShieldCheck size={15}/>
      <span><b>{permission.permission_role.replace(/_/g," ")}</b> scope for {permission.base_role}. Your access is limited by server-side permissions.</span>
    </div>
    {error && <div className="admin-alert error" role="alert"><AlertTriangle size={16}/><span>{error}</span></div>}
    {notice && <div className="admin-alert success" role="status"><BadgeCheck size={16}/><span>{notice}</span></div>}
    {canReadOverview && overview && <div className="platform-admin-metrics">
      {[
        ["Users",overview.users],["Athletes",overview.athletes],["Coaches",overview.coaches],["Academies",overview.academies],
        ["Verified athletes",overview.verified_athletes],["Pending Student reviews",overview.pending_student_verifications],["Active subscriptions",overview.active_subscriptions],
        ["Open support",overview.open_support_tickets],["Restricted accounts",overview.restricted_accounts],
        ["Coach email verified",overview.verified_coaches],["Academy setup verified",overview.verified_academies]
      ].filter(([,value])=>value!==null&&value!==undefined).map(([label,value])=><article key={String(label)}><span>{label}</span><strong>{value==null?"—":Number(value).toLocaleString()}</strong></article>)}
    </div>}

    {canVerify && <div className="platform-admin-panel">
      <div className="platform-admin-panel-head"><div><span className="admin-section-label">Athlete trust</span><h4>Athlete Profile Verification</h4>
        <p>Search individual Athlete accounts. Grant or revoke the verified badge only after reviewing credible supporting records. Every decision requires a reason and is audited. Student-plan proof review is a separate workflow below.</p></div><BadgeCheck size={20}/></div>
      <div className="platform-admin-account-search"><label>Find Athlete<input value={athleteQuery} onChange={(event)=>setAthleteQuery(event.target.value)} placeholder="Athlete name, username or user ID prefix"/></label><button type="button" className="btn" disabled={busyKey==="athlete-search"} onClick={()=>void searchAthleteReviews()}><Search size={14}/> Search Athletes</button></div>
      {athleteReviews.map((row)=><article className="platform-admin-verification" key={row.user_id}>
        <div className="platform-admin-verification-summary"><div><b>{row.full_name || "Athlete account"}</b><small>@{row.username || "username not set"} · Joined {new Date(row.created_at).toLocaleDateString()}</small><code>{row.user_id}</code></div>
          <span className="platform-admin-count">{row.verified_athlete ? "Verified" : "Not verified"}</span></div>
        {canManageAthleteVerification ? <>
          <label>Evidence reviewed / decision reason<textarea rows={2} maxLength={500} value={athleteReasons[row.user_id] || ""} onChange={(event)=>setAthleteReasons((values)=>({...values,[row.user_id]:event.target.value}))} placeholder="Record the evidence source reviewed and reason (5–500 characters)."/></label>
          <div className="inline-actions">
            <button className="btn primary" type="button" disabled={busyKey==="athlete-review:"+row.user_id||row.verified_athlete} onClick={()=>void setAthleteVerified(row,true)}>Verify Athlete</button>
            <button className="btn danger" type="button" disabled={busyKey==="athlete-review:"+row.user_id||!row.verified_athlete} onClick={()=>void setAthleteVerified(row,false)}>Revoke Verification</button>
          </div>
        </> : <p>Read-only review scope. A Verification Admin must make the decision.</p>}
      </article>)}
      {athleteQuery.trim().length>=2&&!athleteReviews.length&&<div className="platform-admin-empty">No matching Athlete accounts. Run Search Athletes to refresh this list.</div>}
    </div>}

    {canVerify && <div className="platform-admin-panel">
      <div className="platform-admin-panel-head"><div><span className="admin-section-label">Trust & safety</span><h4>Student Verification Queue</h4>
        <p>{pendingCount} pending Athlete proof review(s). Coach and Academy trust checks continue using their existing email and workspace verification gates.</p></div><span className="platform-admin-count">{pendingCount} pending</span></div>
      {verificationQueue.length ? verificationQueue.map((row)=><article className="platform-admin-verification" key={row.id}>
        <div className="platform-admin-verification-summary"><div><b>{row.full_name || "Athlete account"}</b><small>@{row.username || "username not set"} · {row.document_type.replace(/_/g," ")} · {new Date(row.created_at).toLocaleDateString()}</small><code>{row.user_id}</code></div>
          <button className="btn" type="button" onClick={()=>void openProof(row)} disabled={!row.file_path||busyKey==="proof:"+row.id}><ExternalLink size={13}/> {busyKey==="proof:"+row.id?"Opening…":"Open proof"}</button></div>
        <label>Decision reason<textarea rows={2} maxLength={500} value={reviewReasons[row.id] || ""} onChange={(event)=>setReviewReasons((values)=>({...values,[row.id]:event.target.value}))} placeholder="Record the evidence-based reason for this decision (5–500 characters)."/></label>
        <div className="inline-actions"><button className="btn primary" type="button" disabled={busyKey==="review:"+row.id} onClick={()=>void review(row,"approved")}>Approve</button><button className="btn danger" type="button" disabled={busyKey==="review:"+row.id} onClick={()=>void review(row,"rejected")}>Reject</button></div>
      </article>):<div className="platform-admin-empty">No Student proof requests are waiting for review.</div>}
    </div>}

    {canReadSupport && <div className="platform-admin-panel">
      <div className="platform-admin-panel-head"><div><span className="admin-section-label">Support operations</span><h4>Support & Dispute Queue</h4>
        <p>Support tickets and feedback are visible to Support Admins. Status and priority changes are permission-gated and recorded by database audit triggers. Ticket content is not copied into audit metadata.</p></div><Shield size={20}/></div>
      <div className="platform-admin-count">{supportTickets.filter((row)=>["open","pending"].includes(row.status)).length} open / pending tickets</div>
      {supportTickets.map((row)=><article className="platform-admin-verification" key={row.id}>
        <div className="platform-admin-verification-summary"><div><b>{row.subject}</b><small>{row.status} · {row.priority} · {new Date(row.created_at).toLocaleString()}</small><code>Account {row.user_id}</code></div>
          {row.assigned_to===userId ? <span className="platform-admin-count">Assigned to you</span> : canManageSupport ? <button type="button" className="btn" disabled={busyKey==="ticket:"+row.id} onClick={()=>void updateSupportTicket(row,{assigned_to:userId})}>Assign to me</button> : null}</div>
        {row.body && <p className="platform-admin-ticket-body">{row.body}</p>}
        {canManageSupport && <div className="platform-admin-assignment-form">
          <label>Status<select value={row.status} disabled={busyKey==="ticket:"+row.id} onChange={(event)=>void updateSupportTicket(row,{status:event.target.value})}>
            <option value="open">Open</option><option value="pending">Pending</option><option value="resolved">Resolved</option><option value="closed">Closed</option>
          </select></label>
          <label>Priority<select value={row.priority} disabled={busyKey==="ticket:"+row.id} onChange={(event)=>void updateSupportTicket(row,{priority:event.target.value})}>
            <option value="low">Low</option><option value="normal">Normal</option><option value="high">High</option><option value="urgent">Urgent</option>
          </select></label>
        </div>}
      </article>)}
      {feedbackItems.length>0 && <><h4>Product feedback</h4>{feedbackItems.map((row)=><article className="platform-admin-verification" key={row.id}>
        <div><b>{row.title}</b><small>{row.status} · {row.priority} · Account {row.user_id}</small></div>
        {row.details && <p className="platform-admin-ticket-body">{row.details}</p>}
        {canManageSupport && <div className="platform-admin-assignment-form">
          <label>Status<select value={row.status} disabled={busyKey==="feedback:"+row.id} onChange={(event)=>void updateFeedbackItem(row,{status:event.target.value})}>
            <option value="new">New</option><option value="reviewing">Reviewing</option><option value="planned">Planned</option><option value="closed">Closed</option>
          </select></label>
          <label>Priority<select value={row.priority} disabled={busyKey==="feedback:"+row.id} onChange={(event)=>void updateFeedbackItem(row,{priority:event.target.value})}>
            <option value="low">Low</option><option value="normal">Normal</option><option value="high">High</option>
          </select></label>
        </div>}
      </article>)}</>}
      {!supportTickets.length&&!feedbackItems.length&&<div className="platform-admin-empty">No support tickets or feedback items are currently available.</div>}
    </div>}

    {canReadFinance && <div className="platform-admin-panel">
      <div className="platform-admin-panel-head"><div><span className="admin-section-label">Finance operations</span><h4>Subscription & Payment Ledger</h4>
        <p>Read-only provider-backed records. This workspace cannot change plan entitlements, mark a payment successful, issue refunds or alter settlement state.</p></div><ShieldCheck size={20}/></div>
      <h4>Subscriptions ({subscriptions.length})</h4>
      <div className="platform-admin-table-wrap"><table><thead><tr><th>Account</th><th>Plan</th><th>Provider</th><th>Status</th><th>Period end</th></tr></thead><tbody>{subscriptions.map((row)=><tr key={row.id}><td><code>{row.user_id}</code></td><td>{row.plan_id}</td><td>{row.provider || "—"}</td><td>{row.status}</td><td>{row.current_period_end ? new Date(row.current_period_end).toLocaleDateString() : "—"}</td></tr>)}</tbody></table></div>
      <h4>Payment events ({paymentEvents.length})</h4>
      <div className="platform-admin-table-wrap"><table><thead><tr><th>Created</th><th>Account</th><th>Provider</th><th>Event</th><th>Amount</th><th>Status</th></tr></thead><tbody>{paymentEvents.map((row)=><tr key={row.id}><td>{new Date(row.created_at).toLocaleString()}</td><td><code>{row.user_id || "—"}</code></td><td>{row.provider}</td><td>{row.event_type}</td><td>{row.amount_minor==null?"—":String(row.currency || "INR")+" "+(row.amount_minor/100).toFixed(2)}</td><td>{row.status || "—"}</td></tr>)}</tbody></table></div>
    </div>}

    {(canManageFlags || canManageAnnouncements) && <div className="platform-admin-panel">
      <div className="platform-admin-panel-head"><div><span className="admin-section-label">Platform configuration</span><h4>Feature Flags & Announcements</h4>
        <p>Operations-scoped controls. Feature flag toggles and published announcements are recorded by database audit triggers.</p></div><ShieldCheck size={20}/></div>
      {canManageFlags && <div className="platform-admin-config-grid">
        <div><b>Feature flags</b><p>Toggle a flag only after checking the impact of the feature it controls.</p></div>
        {featureFlags.map((flag)=><div className="platform-admin-flag" key={flag.id}>
          <div><b>{flag.flag_key}</b><small>{flag.description || "No description"} · audience: {flag.audience}</small></div>
          <button className={flag.enabled?"btn danger":"btn primary"} type="button" disabled={busyKey==="flag:"+flag.id} onClick={()=>void toggleFeatureFlag(flag)}>{flag.enabled?"Disable":"Enable"}</button>
        </div>)}
      </div>}
      {canManageAnnouncements && <div className="platform-admin-announcement-compose">
        <b>Publish announcement</b>
        <label>Title<input value={announcementDraft.title} maxLength={120} onChange={(event)=>setAnnouncementDraft(v=>({...v,title:event.target.value}))} placeholder="Announcement title"/></label>
        <label>Audience<select value={announcementDraft.audience} onChange={(event)=>setAnnouncementDraft(v=>({...v,audience:event.target.value}))}>
          <option value="all">Everyone</option><option value="athletes">Athletes</option><option value="coaches">Coaches</option><option value="academies">Academies</option><option value="admins">Administrators</option>
        </select></label>
        <label>Message<textarea rows={3} maxLength={4000} value={announcementDraft.body} onChange={(event)=>setAnnouncementDraft(v=>({...v,body:event.target.value}))} placeholder="Write a clear platform announcement."/></label>
        <button className="btn primary" type="button" disabled={busyKey==="announcement"} onClick={()=>void publishAnnouncement()}>Publish announcement</button>
        {announcements.slice(0,8).map((item)=><article className="platform-admin-announcement" key={item.id}>
          <div><b>{item.title}</b><small>{item.audience} · {item.published_at ? new Date(item.published_at).toLocaleString() : "Draft"}</small></div><p>{item.body}</p>
        </article>)}
      </div>}
    </div>}

    {canAssign && <div className="platform-admin-panel">
      <div className="platform-admin-panel-head"><div><span className="admin-section-label">Role governance</span><h4>Administrator Permissions</h4>
        <p>Assign narrowly scoped permissions to existing Admin or Support Admin accounts. Super Admin accounts remain separately protected.</p></div><UserRoundCog size={20}/></div>
      <div className="platform-admin-assignment-form"><label>Administrator<select value={assignmentTarget} onChange={(event)=>setAssignmentTarget(event.target.value)}><option value="">Select administrator</option>{assignments.filter((row)=>row.base_role!=="super_admin").map((row)=><option key={row.admin_user_id} value={row.admin_user_id}>{row.full_name || row.username || row.admin_user_id} · {row.base_role}</option>)}</select></label>
        <label>Permission scope<select value={assignmentScope} onChange={(event)=>setAssignmentScope(event.target.value)}><option value="support">Support Admin</option><option value="verification">Verification Reviewer</option><option value="finance">Finance Admin (read-only settlement)</option><option value="operations">Operations Admin</option><option value="full">Full Admin (all capabilities)</option></select></label>
        <button className="btn primary" type="button" disabled={busyKey==="assignment"} onClick={()=>void changeAssignment()}>Save permission scope</button></div>
      <div className="platform-admin-table-wrap"><table><thead><tr><th>Account</th><th>Base role</th><th>Scope</th><th>Updated</th></tr></thead><tbody>{assignments.map((row)=><tr key={row.admin_user_id}><td>{row.full_name || row.username || row.admin_user_id}</td><td>{row.base_role}</td><td>{row.permission_role || "Full Admin"}</td><td>{new Date(row.updated_at).toLocaleString()}</td></tr>)}</tbody></table></div>
    </div>}

    {canManageAccounts && <div className="platform-admin-panel">
      <div className="platform-admin-panel-head"><div><span className="admin-section-label">Account safety</span><h4>Account Access Controls</h4>
        <p>Restrictions are enforced by database row-level security on core app data. Login sessions are not forcibly terminated; profile and support access remain available.</p></div><Shield size={20}/></div>
      <div className="platform-admin-account-search"><label>Find account<input value={accountQuery} onChange={(event)=>setAccountQuery(event.target.value)} placeholder="Name, username or user ID prefix"/></label><button type="button" className="btn" disabled={busyKey==="search"} onClick={()=>void searchAccounts()}><Search size={14}/> Search</button></div>
      {accountResults.length>0&&<div className="platform-admin-search-results">{accountResults.map((row)=><button type="button" key={row.user_id} className={selectedAccount?.user_id===row.user_id?"selected":""} onClick={()=>{setSelectedAccount(row);setAccountRole(row.role);}}><b>{row.full_name || "Unnamed account"}</b><small>@{row.username || "no username"} · {row.role} · {row.plan_id}</small><code>{row.user_id}</code></button>)}</div>}
      {selectedAccount&&<div className="platform-admin-access-form"><b>Selected: {selectedAccount.full_name || selectedAccount.user_id}</b>
        {canChangePlatformRoles && <div className="platform-admin-role-editor">
          <label>Platform account role<select value={accountRole} onChange={(event)=>setAccountRole(event.target.value)}>
            <option value="athlete">Athlete</option><option value="coach">Coach</option><option value="academy_admin">Academy Admin</option><option value="support_admin">Support Admin</option><option value="admin">Admin</option><option value="super_admin">Super Admin</option>
          </select></label>
          <label>Role-change reason<textarea rows={2} maxLength={500} value={roleChangeReason} onChange={(event)=>setRoleChangeReason(event.target.value)} placeholder="Document the operational reason (5–500 characters)."/></label>
          <button type="button" className="btn danger" disabled={busyKey==="user-role"||accountRole===selectedAccount.role} onClick={()=>void changeUserRole()}>Change account role</button>
        </div>}
        <div className="platform-admin-assignment-form">
        <label>Account status<select value={accessStatus} onChange={(event)=>setAccessStatus(event.target.value)}><option value="restricted">Temporary restriction</option><option value="suspended">Suspended (indefinite unless expiry supplied)</option><option value="active">Restore access</option></select></label>
        <label>Expiry {accessStatus==="restricted"?"(required)": "(optional)"}<input type="datetime-local" value={accessExpiry} onChange={(event)=>setAccessExpiry(event.target.value)} disabled={accessStatus==="active"}/></label>
        <label className="full">Reason<textarea rows={2} maxLength={500} value={accessReason} onChange={(event)=>setAccessReason(event.target.value)} placeholder="Document the policy or security reason (5–500 characters)."/></label>
        <button type="button" className="btn danger" disabled={busyKey==="access"} onClick={()=>void applyAccountAccess()}>{accessStatus==="active"?"Restore account":"Apply access control"}</button></div></div>}
      {accessRows.length>0&&<div className="platform-admin-table-wrap"><table><thead><tr><th>Account</th><th>Status</th><th>Reason</th><th>Expiry</th><th>Updated</th></tr></thead><tbody>{accessRows.map((row)=><tr key={row.user_id}><td>{row.full_name || row.username || row.user_id}</td><td>{row.status}</td><td>{row.reason}</td><td>{localDateTime(row.expires_at)}</td><td>{new Date(row.updated_at).toLocaleString()}</td></tr>)}</tbody></table></div>}
    </div>}

    {canReadAudit && <div className="platform-admin-panel">
      <div className="platform-admin-panel-head"><div><span className="admin-section-label">Governance history</span><h4>Administrative Audit Trail</h4><p>Role, verification and account-access changes are recorded with actor, target, reason and timestamp.</p></div><Clock3 size={20}/></div>
      <div className="platform-admin-table-wrap"><table><thead><tr><th>Time</th><th>Actor</th><th>Target</th><th>Action</th><th>Reason</th></tr></thead><tbody>{audit.map((row)=><tr key={row.id}><td>{new Date(row.created_at).toLocaleString()}</td><td><code>{text(row.actor_user_id).slice(0,8)||"—"}</code></td><td><code>{text(row.target_user_id).slice(0,8)||"—"}</code></td><td>{row.action}</td><td>{row.reason || "—"}</td></tr>)}</tbody></table></div>
    </div>}
    {role==="super_admin"&&<p className="platform-admin-guardrail">Payment activation, refunds and subscription settlement remain provider/webhook-controlled. This panel does not allow administrators to mark a payment successful manually. Coach and Academy verification states are derived from the existing confirmed-email and verified-workspace checks.</p>}
  </section>;
}
