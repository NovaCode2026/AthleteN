import { useEffect, useState } from "react";
import { Activity, BadgeCheck, FileText, Flag, Layers3, ShieldCheck, UploadCloud, Users, Wallet } from "lucide-react";
import { supabase } from "../../lib/supabase";
import "./FounderMenu.css";

type Props = { userId: string; role: string };
type ReleaseRow = {
  version: string;
  version_code: number;
  minimum_version_code: number;
  download_url: string;
  storage_path?: string | null;
  release_notes: string | null;
  published?: boolean;
  updated_at?: string;
};
type ReleasePayload = {
  id: true;
  version: string;
  version_code: number;
  minimum_version_code: number;
  download_url: string;
  storage_path: string;
  release_notes: string;
  updated_by: string;
  updated_at: string;
};
const RELEASE_BUCKET = "athleten-mobile-releases";
const MAX_APK_BYTES = 250 * 1024 * 1024;

function nextPatchVersion(value: string) {
  const match = value.match(/^(\d+)\.(\d+)\.(\d+)/);
  return match ? `${match[1]}.${match[2]}.${Number(match[3]) + 1}` : "1.0.4";
}

export default function FounderMenu({ userId, role }: Props) {
  const isFounder = role === "super_admin";
  const [version, setVersion] = useState("1.0.4");
  const [versionCode, setVersionCode] = useState("5");
  const [minimumVersionCode, setMinimumVersionCode] = useState("1");
  const [releaseNotes, setReleaseNotes] = useState("");
  const [apk, setApk] = useState<File | null>(null);
  const [draft, setDraft] = useState<ReleaseRow | null>(null);
  const [live, setLive] = useState<ReleaseRow | null>(null);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState<"draft" | "publish" | null>(null);
  const [message, setMessage] = useState("");
  const [messageType, setMessageType] = useState<"success" | "error" | "info">("info");

  async function loadReleases() {
    if (!supabase || !isFounder) return;
    setLoading(true);
    try {
      const [liveResult, draftResult] = await Promise.all([
        supabase.from("mobile_app_releases").select("version,version_code,minimum_version_code,download_url,storage_path,release_notes,published,updated_at").eq("id", true).maybeSingle(),
        supabase.from("mobile_app_release_drafts").select("version,version_code,minimum_version_code,download_url,storage_path,release_notes,updated_at").eq("id", true).maybeSingle(),
      ]);
      if (liveResult.error) throw liveResult.error;
      if (draftResult.error) throw draftResult.error;
      const liveRow = (liveResult.data || null) as ReleaseRow | null;
      const draftRow = (draftResult.data || null) as ReleaseRow | null;
      setLive(liveRow);
      setDraft(draftRow);
      const source = draftRow || null;
      if (source) {
        setVersion(source.version);
        setVersionCode(String(source.version_code));
        setMinimumVersionCode(String(source.minimum_version_code));
        setReleaseNotes(source.release_notes || "");
      } else if (liveRow) {
        setVersion(nextPatchVersion(liveRow.version));
        setVersionCode(String(Number(liveRow.version_code) + 1));
        setMinimumVersionCode(String(liveRow.minimum_version_code || 1));
        setReleaseNotes("");
      }
      setMessage("");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Release information could not be loaded.");
      setMessageType("error");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { void loadReleases(); }, [isFounder]);

  function chooseApk(file: File | null) {
    setMessage("");
    if (!file) { setApk(null); return; }
    if (!file.name.toLowerCase().endsWith(".apk")) {
      setApk(null);
      setMessage("Select an Android .apk file.");
      setMessageType("error");
      return;
    }
    if (file.size <= 0 || file.size > MAX_APK_BYTES) {
      setApk(null);
      setMessage("The APK must be non-empty and no larger than 250 MB.");
      setMessageType("error");
      return;
    }
    setApk(file);
  }

  async function prepareRelease(): Promise<ReleasePayload> {
    if (!supabase) throw new Error("Supabase is not configured.");
    if (!userId || userId === "unknown") throw new Error("The signed-in Super Admin could not be identified.");
    const cleanVersion = version.trim();
    const code = Number(versionCode);
    const minimum = Number(minimumVersionCode);
    if (!/^\d+\.\d+\.\d+(?:[+-][0-9A-Za-z.-]+)?$/.test(cleanVersion)) throw new Error("Use a version such as 1.0.4.");
    if (!Number.isSafeInteger(code) || code < 1 || !Number.isSafeInteger(minimum) || minimum < 1) throw new Error("Version codes must be positive whole numbers.");
    if (minimum > code) throw new Error("Minimum supported version code cannot exceed the new version code.");
    if (releaseNotes.length > 10000) throw new Error("Release notes must be 10,000 characters or fewer.");
    if (live && code <= Number(live.version_code)) throw new Error(`Version code must be greater than the currently published code ${live.version_code}.`);

    let downloadUrl = draft?.download_url || "";
    let storagePath = draft?.storage_path || "";
    if (apk) {
      const safeName = apk.name.replace(/[^a-zA-Z0-9._-]/g, "_");
      storagePath = `android/${code}/${Date.now()}-${safeName}`;
      const { error: uploadError } = await supabase.storage.from(RELEASE_BUCKET).upload(storagePath, apk, {
        cacheControl: "31536000",
        contentType: "application/vnd.android.package-archive",
        upsert: false,
      });
      if (uploadError) throw uploadError;
      const { data } = supabase.storage.from(RELEASE_BUCKET).getPublicUrl(storagePath);
      downloadUrl = data.publicUrl;
      if (!downloadUrl.startsWith("https://") || !downloadUrl.toLowerCase().split("?")[0].endsWith(".apk")) {
        throw new Error("Storage did not return a valid HTTPS direct APK URL.");
      }
    }
    if (!downloadUrl || !storagePath) throw new Error("Choose a signed APK file before saving or publishing this release.");
    return {
      id: true,
      version: cleanVersion,
      version_code: code,
      minimum_version_code: minimum,
      download_url: downloadUrl,
      storage_path: storagePath,
      release_notes: releaseNotes.trim(),
      updated_by: userId,
      updated_at: new Date().toISOString(),
    };
  }

  async function saveDraft() {
    if (!isFounder || !supabase || busy) return;
    setBusy("draft");
    setMessage("");
    try {
      const payload = await prepareRelease();
      const { error } = await supabase.from("mobile_app_release_drafts").upsert(payload, { onConflict: "id" });
      if (error) throw error;
      setApk(null);
      setMessage("Draft saved. The currently published release remains live and unchanged.");
      setMessageType("success");
      await loadReleases();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Draft could not be saved.");
      setMessageType("error");
    } finally {
      setBusy(null);
    }
  }

  async function publishRelease() {
    if (!isFounder || !supabase || busy) return;
    if (!window.confirm("Publish this APK to AthleteN Android users? Devices will be prompted according to the minimum supported version.")) return;
    setBusy("publish");
    setMessage("");
    try {
      const payload = await prepareRelease();
      const { error: draftError } = await supabase.from("mobile_app_release_drafts").upsert(payload, { onConflict: "id" });
      if (draftError) throw draftError;
      const { error: publishError } = await supabase.from("mobile_app_releases").upsert({
        ...payload,
        published: true,
      }, { onConflict: "id" });
      if (publishError) throw publishError;
      const { error: clearDraftError } = await supabase.from("mobile_app_release_drafts").delete().eq("id", true);
      setApk(null);
      setMessage(clearDraftError
        ? "Release published. The old draft could not be cleared, but Android users can now see the new release."
        : "Release published. Android users will be prompted on their next update check.");
      setMessageType(clearDraftError ? "info" : "success");
      await loadReleases();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Release could not be published.");
      setMessageType("error");
    } finally {
      setBusy(null);
    }
  }

  function openAdminResource(key: string) {
    const target = document.querySelector<HTMLButtonElement>(`[data-testid="admin-resource-${key}"]`);
    if (!target) {
      setMessage("That workspace section is not available in this admin session.");
      setMessageType("error");
      return;
    }
    target.click();
    target.scrollIntoView({ behavior: "smooth", block: "center" });
  }

  if (!isFounder) return null;

  return <section className="founder-menu" aria-label="Founder menu">
    <div className="founder-menu-header">
      <div>
        <span className="founder-menu-eyebrow"><ShieldCheck size={15} /> Founder access · Super Admin</span>
        <h2>Founder Menu</h2>
        <p>Platform-level operations and release control. These controls are visible only to Super Admin accounts.</p>
      </div>
      <span className="founder-menu-status"><i /> OWNER CONTROL</span>
    </div>

    <div className="founder-menu-grid">
      <button type="button" className="founder-menu-tile" onClick={() => openAdminResource("profiles")}>
        <Users size={19} /><b>Users & access</b><span>Review athlete profiles, administrator roles and account access.</span>
      </button>
      <button type="button" className="founder-menu-tile" onClick={() => openAdminResource("subscriptions")}>
        <Wallet size={19} /><b>Plans & billing</b><span>Inspect subscriptions, plan entitlements and usage controls.</span>
      </button>
      <button type="button" className="founder-menu-tile" onClick={() => openAdminResource("featureFlags")}>
        <Flag size={19} /><b>Product controls</b><span>Manage feature flags and platform-wide availability.</span>
      </button>
      <button type="button" className="founder-menu-tile" onClick={() => openAdminResource("auditLogs")}>
        <FileText size={19} /><b>Audit & security</b><span>Review privileged activity and system audit records.</span>
      </button>
      <button type="button" className="founder-menu-tile" onClick={() => openAdminResource("support")}>
        <BadgeCheck size={19} /><b>Trust & support</b><span>Open support operations and account trust workflows.</span>
      </button>
      <div className="founder-menu-tile founder-menu-static">
        <Layers3 size={19} /><b>Platform workspace</b><span>Operational data, competition tools and product analytics remain in the Admin Command Center below.</span>
      </div>
    </div>

    <div className="founder-release">
      <div className="founder-release-heading">
        <div><span className="founder-menu-eyebrow"><UploadCloud size={15} /> Native Android distribution</span><h3>Mobile Release Manager</h3></div>
        <button type="button" className="founder-refresh" onClick={() => void loadReleases()} disabled={loading || busy !== null}>{loading ? "Refreshing…" : "Refresh status"}</button>
      </div>
      <div className="founder-release-status-grid">
        <div><small>LIVE RELEASE</small><strong>{live ? `v${live.version} · code ${live.version_code}` : "No release published"}</strong><span>{live?.updated_at ? new Date(live.updated_at).toLocaleString() : "No published release record"}</span></div>
        <div><small>SAVED DRAFT</small><strong>{draft ? `v${draft.version} · code ${draft.version_code}` : "No saved draft"}</strong><span>{draft ? "Private to Super Admin" : "Drafts do not affect installed apps"}</span></div>
      </div>
      <div className="founder-release-form">
        <label>Version name<input value={version} onChange={e => setVersion(e.target.value)} placeholder="1.0.4" /></label>
        <label>Android version code<input type="number" min="1" step="1" value={versionCode} onChange={e => setVersionCode(e.target.value)} /></label>
        <label>Minimum supported version code<input type="number" min="1" step="1" value={minimumVersionCode} onChange={e => setMinimumVersionCode(e.target.value)} /></label>
        <label className="founder-file-field">Signed Android APK<input type="file" accept=".apk,application/vnd.android.package-archive" onChange={e => chooseApk(e.target.files?.[0] || null)} /><span>{apk ? `${apk.name} · ${(apk.size / 1024 / 1024).toFixed(1)} MB` : draft?.storage_path ? "A previously uploaded draft APK is ready" : "Choose the production-signed .apk file"}</span></label>
        <label className="founder-notes-field">Release notes<textarea rows={4} value={releaseNotes} onChange={e => setReleaseNotes(e.target.value)} placeholder="List fixes, improvements and important changes for athletes." /></label>
      </div>
      <p className="founder-release-hint">Upload the APK built with AthleteN’s same Android package name and the same permanent signing key as the installed app. Increase versionCode for every release. Saving a draft never changes the live release; publishing replaces the live release record. Users approve the download and Android installer on their device.</p>
      <div className="founder-release-actions">
        <button type="button" className="btn" onClick={() => void saveDraft()} disabled={busy !== null || loading}>{busy === "draft" ? "Saving draft…" : "Save draft"}</button>
        <button type="button" className="btn primary" onClick={() => void publishRelease()} disabled={busy !== null || loading}>{busy === "publish" ? "Publishing…" : "Publish Android release"}</button>
      </div>
      {message && <p className={`founder-message ${messageType}`} role={messageType === "error" ? "alert" : "status"}>{message}</p>}
      {live?.download_url && <a className="founder-live-link" href={live.download_url} target="_blank" rel="noreferrer">Open currently published APK <Activity size={14} /></a>}
    </div>
  </section>;
}
