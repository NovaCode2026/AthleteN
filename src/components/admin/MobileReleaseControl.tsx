import { useEffect, useState } from "react";
import { AlertTriangle, RefreshCw, ShieldCheck, UploadCloud } from "lucide-react";
import { supabase } from "../../lib/supabase";

type ReleaseRow = {
  version: string;
  version_code: number;
  minimum_version_code: number;
  download_url: string;
  release_notes: string | null;
  published: boolean;
  updated_by: string | null;
  updated_at: string;
};

type Props = { role: string; userId: string };

const VERSION_PATTERN = /^\d+\.\d+\.\d+(?:[+-][0-9A-Za-z.-]+)?$/;

export default function MobileReleaseControl({ role, userId }: Props) {
  const allowed = role === "super_admin";
  const [current, setCurrent] = useState<ReleaseRow | null>(null);
  const [version, setVersion] = useState("1.0.4");
  const [versionCode, setVersionCode] = useState("5");
  const [minimumVersionCode, setMinimumVersionCode] = useState("4");
  const [downloadUrl, setDownloadUrl] = useState("");
  const [notes, setNotes] = useState("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  async function load() {
    if (!allowed) { setLoading(false); return; }
    setLoading(true);
    setError("");
    const { data, error: queryError } = await supabase
      .from("mobile_app_releases")
      .select("version,version_code,minimum_version_code,download_url,release_notes,published,updated_by,updated_at")
      .eq("id", true)
      .maybeSingle();
    if (queryError) {
      setError(queryError.message);
      setLoading(false);
      return;
    }
    if (data) {
      const row = data as ReleaseRow;
      setCurrent(row);
      setVersion(row.version);
      setVersionCode(String(row.version_code));
      setMinimumVersionCode(String(row.minimum_version_code));
      setDownloadUrl(row.download_url);
      setNotes(row.release_notes || "");
    } else {
      setCurrent(null);
    }
    setLoading(false);
  }

  useEffect(() => { void load(); }, [allowed]);

  async function publish() {
    if (!allowed || !userId || busy) return;
    setError("");
    setNotice("");

    const cleanVersion = version.trim();
    const code = Number(versionCode);
    const minimum = Number(minimumVersionCode);
    if (!VERSION_PATTERN.test(cleanVersion)) {
      setError("Use a version such as 1.0.4.");
      return;
    }
    if (!Number.isSafeInteger(code) || code < 1 || !Number.isSafeInteger(minimum) || minimum < 1) {
      setError("Version codes must be positive whole numbers.");
      return;
    }
    if (minimum > code) {
      setError("The minimum supported version code cannot exceed this release's version code.");
      return;
    }
    if (current?.published && code <= current.version_code) {
      setError("The next published APK must have a version code greater than the currently published release.");
      return;
    }
    if (current && !current.published && code < current.version_code) {
      setError("A new release cannot move to a lower version code.");
      return;
    }
    if (notes.length > 10000) {
      setError("Release notes must be 10,000 characters or fewer.");
      return;
    }

    let parsed: URL;
    try { parsed = new URL(downloadUrl.trim()); }
    catch { setError("Enter a direct HTTPS URL to the signed APK file."); return; }
    if (parsed.protocol !== "https:" || !parsed.hostname || parsed.username || parsed.password || !parsed.pathname.toLowerCase().endsWith(".apk")) {
      setError("The release asset must be a direct HTTPS .apk URL without embedded credentials.");
      return;
    }

    setBusy(true);
    const { error: saveError } = await supabase.from("mobile_app_releases").upsert({
      id: true,
      version: cleanVersion,
      version_code: code,
      minimum_version_code: minimum,
      download_url: downloadUrl.trim(),
      release_notes: notes.trim(),
      published: true,
      updated_by: userId,
      updated_at: new Date().toISOString(),
    }, { onConflict: "id" });
    setBusy(false);
    if (saveError) {
      setError(saveError.message);
      return;
    }
    setNotice("Android release published. Compatible app builds will detect it on launch or when reopened.");
    await load();
  }

  if (!allowed) return null;

  return (
    <section className="admin-compose" aria-label="Android app release publishing">
      <div>
        <div><UploadCloud size={18}/><h3>Android Auto-Update Release</h3></div>
        <span className="admin-section-label">Super Admin only</span>
      </div>
      <p>Publish the signed APK metadata here. AthleteN mobile checks the live release record and shows the update to devices below the published version. Upload/build the APK first; this panel does not sign or build the binary.</p>
      <div className="admin-section-head" style={{marginBottom:0}}>
        <div>
          <span className="admin-section-label">CURRENT RELEASE</span>
          <h3>{current?.published ? `Version ${current.version} · Build ${current.version_code}` : current ? `Version ${current.version} · Unpublished` : "No release published"}</h3>
          <p>{current?.published ? "Visible to supported Android app builds." : "No published release is currently being served to Android users."}</p>
        </div>
        <div className="admin-permission"><span className={current?.published ? "ok" : "limited"}>{current?.published ? "Published" : "Not live"}</span></div>
      </div>
      {loading ? <div className="admin-loading"><span/></div> : (
        <>
          <div className="admin-form-grid">
            <label>VERSION NAME
              <input value={version} onChange={event=>setVersion(event.target.value)} placeholder="1.0.4" autoComplete="off"/>
            </label>
            <label>ANDROID VERSION CODE
              <input type="number" min="1" step="1" value={versionCode} onChange={event=>setVersionCode(event.target.value)} placeholder="5"/>
            </label>
            <label>MINIMUM SUPPORTED VERSION CODE
              <input type="number" min="1" step="1" value={minimumVersionCode} onChange={event=>setMinimumVersionCode(event.target.value)} placeholder="4"/>
            </label>
            <label>DIRECT SIGNED APK URL
              <input type="url" value={downloadUrl} onChange={event=>setDownloadUrl(event.target.value)} placeholder="https://downloads.example.com/athleten.apk" autoCapitalize="none"/>
            </label>
          </div>
          <label>RELEASE NOTES
            <textarea rows={4} value={notes} onChange={event=>setNotes(event.target.value)} maxLength={10000} placeholder="Summarise what changed in this release."/>
          </label>
          <div className="admin-foot">
            <span>Release notes: {notes.length}/10,000</span>
            {current?.updated_at ? <span>Last published: {new Date(current.updated_at).toLocaleString()}</span> : <span>First release has not been published</span>}
          </div>
          <div className="inline-actions">
            <button type="button" className="btn primary" disabled={busy || loading || !version.trim() || !versionCode.trim() || !minimumVersionCode.trim() || !downloadUrl.trim()} onClick={()=>void publish()}>
              <UploadCloud size={15}/>{busy ? "Publishing…" : "Publish Android Update"}
            </button>
            <button type="button" className="btn" disabled={busy || loading} onClick={()=>void load()}>
              <RefreshCw size={15}/> Refresh release
            </button>
          </div>
        </>
      )}
      {error ? <div className="admin-alert error"><AlertTriangle size={16}/><span>{error}</span></div> : null}
      {notice ? <div className="admin-alert success"><ShieldCheck size={16}/><span>{notice}</span></div> : null}
      <div className="admin-action-box">
        <h4>Release rules</h4>
        <p>Use the same Android package name and signing key for every APK update, and increase versionCode on every new binary. Android will ask each user to approve the system installer; a normal app cannot silently replace itself.</p>
        <p>Compatible JavaScript-only changes can use a separate Expo OTA release path after that service is configured in the native app build.</p>
      </div>
    </section>
  );
}
