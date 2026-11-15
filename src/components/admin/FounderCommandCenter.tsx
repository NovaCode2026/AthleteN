import { useCallback, useEffect, useState } from "react";
import { AlertTriangle, CheckCircle2, Clock3, Crown, History, RefreshCw, Rocket, ShieldCheck, Smartphone, UploadCloud } from "lucide-react";
import { supabase } from "../../lib/supabase";
import "./FounderCommandCenter.css";

type Release = {
  id?: boolean;
  version: string;
  version_code: number;
  minimum_version_code: number;
  download_url: string;
  release_notes: string | null;
  published: boolean;
  updated_at?: string;
  updated_by?: string | null;
};
type Draft = {
  version: string;
  version_code: number;
  minimum_version_code: number;
  download_url: string;
  release_notes: string;
};
type HistoryRow = {
  id: string;
  action: string;
  version: string;
  version_code: number;
  minimum_version_code: number;
  download_url: string;
  release_notes: string | null;
  published: boolean;
  actor_id: string | null;
  created_at: string;
};
type FormState = {
  version: string;
  versionCode: string;
  minimumVersionCode: string;
  downloadUrl: string;
  releaseNotes: string;
};

const emptyForm: FormState = {
  version: "1.0.4",
  versionCode: "5",
  minimumVersionCode: "1",
  downloadUrl: "",
  releaseNotes: "",
};

function isValidApkUrl(value: string) {
  try {
    const url = new URL(value.trim());
    return url.protocol === "https:" &&
      Boolean(url.hostname) &&
      !url.username &&
      !url.password &&
      url.pathname.toLowerCase().endsWith(".apk");
  } catch {
    return false;
  }
}

function nextPatch(version: string) {
  const match = /^(\d+)\.(\d+)\.(\d+)(.*)$/.exec(version || "");
  if (!match) return "1.0.1";
  return match[1] + "." + match[2] + "." + (Number(match[3]) + 1);
}

function formatDate(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "Unknown date" : date.toLocaleString();
}

export default function FounderCommandCenter({ userId, role }: { userId: string; role: string }) {
  const [current, setCurrent] = useState<Release | null>(null);
  const [history, setHistory] = useState<HistoryRow[]>([]);
  const [form, setForm] = useState<FormState>(emptyForm);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const load = useCallback(async () => {
    if (role !== "super_admin") {
      setLoading(false);
      return;
    }
    if (!supabase) {
      setError("Supabase is not configured in this build.");
      setLoading(false);
      return;
    }
    setLoading(true);
    setError("");
    const [liveResult, draftResult, historyResult] = await Promise.all([
      supabase.from("mobile_app_releases").select("*").eq("id", true).maybeSingle(),
      supabase.from("mobile_app_release_drafts").select("*").eq("id", true).maybeSingle(),
      supabase.from("mobile_app_release_history")
        .select("id,action,version,version_code,minimum_version_code,download_url,release_notes,published,actor_id,created_at")
        .order("created_at", { ascending: false }).limit(20),
    ]);
    if (liveResult.error) setError(liveResult.error.message);
    const live = liveResult.data as Release | null;
    const savedDraft = draftResult.data as Draft | null;
    setCurrent(live);
    setHistory((historyResult.data || []) as HistoryRow[]);
    if (savedDraft) {
      setForm({
        version: savedDraft.version,
        versionCode: String(savedDraft.version_code),
        minimumVersionCode: String(savedDraft.minimum_version_code),
        downloadUrl: savedDraft.download_url || "",
        releaseNotes: savedDraft.release_notes || "",
      });
    } else if (live) {
      setForm({
        version: nextPatch(live.version),
        versionCode: String(Number(live.version_code) + 1),
        minimumVersionCode: String(live.minimum_version_code),
        downloadUrl: "",
        releaseNotes: "",
      });
    }
    if (draftResult.error || historyResult.error) {
      setError("Release-history migration is not available in this database yet. Apply the new AthleteN migration before saving or publishing releases.");
    }
    setLoading(false);
  }, [role]);

  useEffect(() => { void load(); }, [load]);

  function validate(requireApk: boolean) {
    const versionCode = Number(form.versionCode);
    const minimumVersionCode = Number(form.minimumVersionCode);
    if (!/^\d+\.\d+\.\d+(?:[+-][0-9A-Za-z.-]+)?$/.test(form.version.trim())) {
      throw new Error("Use a version such as 1.0.4.");
    }
    if (!Number.isSafeInteger(versionCode) || versionCode < 1 ||
        !Number.isSafeInteger(minimumVersionCode) || minimumVersionCode < 1 ||
        minimumVersionCode > versionCode) {
      throw new Error("Version codes must be positive whole numbers, and minimum supported code cannot exceed the release code.");
    }
    if (current && versionCode <= current.version_code) {
      throw new Error("The next Android release must use a versionCode greater than the currently published release (" + current.version_code + ").");
    }
    if (form.downloadUrl.trim() && !isValidApkUrl(form.downloadUrl)) {
      throw new Error("Enter a direct HTTPS URL ending in .apk. A release webpage is not an APK download.");
    }
    if (requireApk && !isValidApkUrl(form.downloadUrl)) {
      throw new Error("Add the direct HTTPS URL for the signed APK before publishing.");
    }
    if (form.releaseNotes.length > 10000) {
      throw new Error("Release notes must be 10,000 characters or fewer.");
    }
    return { version_code: versionCode, minimum_version_code: minimumVersionCode };
  }

  async function saveDraft() {
    if (role !== "super_admin" || !userId || !supabase || saving || publishing) return;
    setError("");
    setNotice("");
    try {
      const codes = validate(false);
      setSaving(true);
      const { error: saveError } = await supabase.from("mobile_app_release_drafts").upsert({
        id: true,
        version: form.version.trim(),
        version_code: codes.version_code,
        minimum_version_code: codes.minimum_version_code,
        download_url: form.downloadUrl.trim(),
        release_notes: form.releaseNotes.trim(),
        updated_by: userId,
        updated_at: new Date().toISOString(),
      }, { onConflict: "id" });
      if (saveError) throw saveError;
      setNotice("Draft saved. The currently published release remains live for athletes.");
      await load();
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Draft could not be saved.");
    } finally {
      setSaving(false);
    }
  }

  async function publish() {
    if (role !== "super_admin" || !userId || !supabase || saving || publishing) return;
    setError("");
    setNotice("");
    try {
      const codes = validate(true);
      const confirmation = "Publish AthleteN " + form.version + " (Android versionCode " + codes.version_code + ")? This will make the APK available to Android users.";
      if (!window.confirm(confirmation)) return;
      setPublishing(true);
      const { error: publishError } = await supabase.rpc("publish_mobile_app_release", {
        p_version: form.version.trim(),
        p_version_code: codes.version_code,
        p_minimum_version_code: codes.minimum_version_code,
        p_download_url: form.downloadUrl.trim(),
        p_release_notes: form.releaseNotes.trim(),
      });
      if (publishError) throw publishError;
      setNotice("Release published. The app will detect it on its next update check; Android users still approve installation.");
      await load();
    } catch (publishError) {
      setError(publishError instanceof Error ? publishError.message : "Release could not be published.");
    } finally {
      setPublishing(false);
    }
  }

  function prepareRollbackBuild(previous: HistoryRow) {
    const baseVersion = current?.version || previous.version;
    const nextCode = Number(current?.version_code || previous.version_code) + 1;
    setForm({
      version: nextPatch(baseVersion),
      versionCode: String(nextCode),
      minimumVersionCode: String(Math.min(Number(current?.minimum_version_code || 1), nextCode)),
      downloadUrl: "",
      releaseNotes: "Recovery build based on AthleteN " + previous.version + " (Android versionCode " + previous.version_code + "). Rebuild this code as a new APK with Android versionCode " + nextCode + ", sign it with the existing production key, upload it, and then publish.",
    });
    setNotice("Rollback build prepared. Android does not allow installing an older versionCode over a newer one, so this must be rebuilt and signed as a new higher-versionCode APK.");
    setError("");
    document.getElementById("founder-release-form")?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  if (role !== "super_admin") {
    return <section className="founder-denied"><ShieldCheck size={22}/><h2>Super Admin access required</h2><p>The Founder Menu is available only to authenticated Super Admin accounts.</p></section>;
  }

  return (
    <section className="founder-console" aria-label="Founder command center">
      <div className="founder-hero">
        <div>
          <span className="founder-eyebrow"><Crown size={15}/> NOVA CODE · FOUNDER WORKSPACE</span>
          <h2>Founder Command Center</h2>
          <p>Platform-level controls are separated from routine administration. Release publishing is protected by the Super Admin database policy and a server-side publishing function.</p>
          <div className="founder-role"><ShieldCheck size={14}/> Super Admin session · {userId.slice(0, 8)}…</div>
        </div>
        <div className="founder-mark"><Crown size={29}/><span>FOUNDER</span></div>
      </div>

      <div className="founder-kpis">
        <article><span><Smartphone size={17}/></span><small>Android release</small><strong>{current?.version || "Not published"}</strong><em>{current ? "Version code " + current.version_code : "No live release row"}</em></article>
        <article><span><Rocket size={17}/></span><small>Publication</small><strong>{current?.published ? "Live" : "Not live"}</strong><em>{current?.updated_at ? "Updated " + formatDate(current.updated_at) : "Awaiting first publish"}</em></article>
        <article><span><History size={17}/></span><small>Release history</small><strong>{history.length}</strong><em>Audited release events</em></article>
      </div>

      <div className="founder-panel" id="founder-release-form">
        <div className="founder-panel-head">
          <div><span className="founder-section-label">APP DISTRIBUTION</span><h3>Android release manager</h3><p>Save a draft without interrupting the current live release, then publish only after the signed APK has been verified.</p></div>
          <button className="founder-refresh" type="button" onClick={() => void load()} disabled={loading || saving || publishing}><RefreshCw size={15}/> Refresh</button>
        </div>
        {current && <div className="founder-live-release"><span className="founder-live-dot"/><div><strong>Currently published: {current.version}</strong><small>Android versionCode {current.version_code} · minimum supported {current.minimum_version_code}</small></div><span className="founder-live-status">{current.published ? "PUBLISHED" : "NOT PUBLISHED"}</span></div>}
        {error && <div className="founder-alert error"><AlertTriangle size={17}/><span>{error}</span></div>}
        {notice && <div className="founder-alert success"><CheckCircle2 size={17}/><span>{notice}</span></div>}
        {loading ? <div className="founder-loading">Loading release controls…</div> : (
          <div className="founder-form-grid">
            <label>Version name<input value={form.version} onChange={event => setForm({ ...form, version: event.target.value })} placeholder="1.0.4"/></label>
            <label>Android versionCode<input type="number" min="1" step="1" value={form.versionCode} onChange={event => setForm({ ...form, versionCode: event.target.value })}/></label>
            <label>Minimum supported versionCode<input type="number" min="1" step="1" value={form.minimumVersionCode} onChange={event => setForm({ ...form, minimumVersionCode: event.target.value })}/></label>
            <label className="founder-wide">Signed APK download URL<input value={form.downloadUrl} onChange={event => setForm({ ...form, downloadUrl: event.target.value })} placeholder="https://downloads.example.com/athleten-1.0.4.apk"/></label>
            <label className="founder-wide">Release notes<textarea rows={5} value={form.releaseNotes} onChange={event => setForm({ ...form, releaseNotes: event.target.value })} maxLength={10000} placeholder="Describe the changes in this release."/></label>
            <div className="founder-actions founder-wide">
              <button type="button" className="founder-button secondary" onClick={() => void saveDraft()} disabled={saving || publishing}><UploadCloud size={16}/>{saving ? "Saving…" : "Save draft"}</button>
              <button type="button" className="founder-button primary" onClick={() => void publish()} disabled={saving || publishing}><Rocket size={16}/>{publishing ? "Publishing…" : "Publish new version"}</button>
            </div>
          </div>
        )}
        <div className="founder-checklist">
          <strong>Release gate</strong>
          <ul>
            <li>Use the same Android application ID and production signing key as the installed app.</li>
            <li>Build the APK with a versionCode greater than the currently published build.</li>
            <li>Host the signed APK at a stable direct HTTPS URL ending in .apk.</li>
            <li>Install-test the APK over the existing app before publishing it to users.</li>
            <li>Publishing makes the release visible; each Android user must approve installation.</li>
          </ul>
        </div>
      </div>

      <div className="founder-panel">
        <div className="founder-panel-head"><div><span className="founder-section-label">AUDIT TRAIL</span><h3>Release history</h3><p>Every saved draft and published release is recorded by the database trigger.</p></div><Clock3 size={20}/></div>
        {history.length ? <div className="founder-history">{history.map(item => (
          <article className="founder-history-row" key={item.id}>
            <div className="founder-history-icon"><History size={16}/></div>
            <div className="founder-history-copy"><strong>{item.action === "published" ? "Published" : "Draft saved"} · {item.version}</strong><span>VersionCode {item.version_code} · minimum {item.minimum_version_code} · {formatDate(item.created_at)}</span><small>{item.release_notes || "No release notes."}</small></div>
            {item.action === "published" && <button type="button" className="founder-rollback" onClick={() => prepareRollbackBuild(item)}>Prepare rollback build</button>}
          </article>
        ))}</div> : <p className="founder-empty">No release events yet. The first save or publish will appear here after the database migration is applied.</p>}
      </div>

      <div className="founder-warning"><AlertTriangle size={17}/><p><strong>Rollback and installation rule:</strong> Android blocks replacing an installed app with an APK carrying a lower versionCode. A rollback therefore requires rebuilding the previous code as a new APK with a higher versionCode and the same signing key. This screen prepares release metadata; it does not modify or sign APK files.</p></div>
    </section>
  );
}
