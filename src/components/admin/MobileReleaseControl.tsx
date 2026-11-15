import { useEffect, useState, type ChangeEvent } from "react";
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
const APK_BUCKET = "mobile-release-apks";
const APK_MIME_TYPE = "application/vnd.android.package-archive";
const MAX_APK_SIZE_BYTES = 50 * 1024 * 1024;

function errorMessage(error: unknown, fallback: string) {
  return error instanceof Error && error.message ? error.message : fallback;
}

export default function MobileReleaseControl({ role, userId }: Props) {
  const allowed = role === "super_admin";
  const [current, setCurrent] = useState<ReleaseRow | null>(null);
  const [version, setVersion] = useState("1.0.4");
  const [versionCode, setVersionCode] = useState("5");
  const [minimumVersionCode, setMinimumVersionCode] = useState("4");
  const [downloadUrl, setDownloadUrl] = useState("");
  const [notes, setNotes] = useState("");
  const [apkFile, setApkFile] = useState<File | null>(null);
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
      setVersion("1.0.4");
      setVersionCode("5");
      setMinimumVersionCode("4");
      setDownloadUrl("");
      setNotes("");
    }
    setLoading(false);
  }

  useEffect(() => { void load(); }, [allowed]);

  function selectApk(event: ChangeEvent<HTMLInputElement>) {
    const file = event.currentTarget.files?.[0] ?? null;
    setError("");
    if (!file) {
      setApkFile(null);
      return;
    }
    if (!file.name.toLowerCase().endsWith(".apk")) {
      setApkFile(null);
      event.currentTarget.value = "";
      setError("Select an Android .apk file.");
      return;
    }
    if (file.size <= 0 || file.size > MAX_APK_SIZE_BYTES) {
      setApkFile(null);
      event.currentTarget.value = "";
      setError("The APK must be larger than 0 bytes and no larger than 50 MB.");
      return;
    }
    const mime = file.type.toLowerCase();
    if (mime && mime !== APK_MIME_TYPE && mime !== "application/octet-stream") {
      setApkFile(null);
      event.currentTarget.value = "";
      setError("The selected file is not recognised as an Android APK.");
      return;
    }
    setApkFile(file);
    setDownloadUrl("");
  }

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

    if (!apkFile && !downloadUrl.trim()) {
      setError("Upload the signed APK or enter its direct HTTPS download URL.");
      return;
    }
    if (apkFile && (apkFile.size <= 0 || apkFile.size > MAX_APK_SIZE_BYTES || !apkFile.name.toLowerCase().endsWith(".apk"))) {
      setError("The selected APK is invalid or exceeds the 50 MB upload limit.");
      return;
    }

    let releaseDownloadUrl = downloadUrl.trim();
    if (!apkFile) {
      let directUrl: URL;
      try { directUrl = new URL(releaseDownloadUrl); }
      catch { setError("Enter a direct HTTPS URL to the signed APK file."); return; }
      if (directUrl.protocol !== "https:" || !directUrl.hostname || directUrl.username || directUrl.password || !directUrl.pathname.toLowerCase().endsWith(".apk")) {
        setError("The release asset must be a direct HTTPS .apk URL without embedded credentials.");
        return;
      }
      if (current?.published && code > current.version_code && releaseDownloadUrl === current.download_url) {
        setError("This is still the previous release's APK link. Upload the new APK or enter a new direct link.");
        return;
      }
    }

    setBusy(true);
    let uploadedPath: string | null = null;
    try {
      if (apkFile) {
        const safeVersion = cleanVersion.replace(/[^0-9A-Za-z.-]/g, "-");
        const filePath = `${code}/${Date.now()}-AthleteN-${safeVersion}.apk`;
        const { error: uploadError } = await supabase.storage
          .from(APK_BUCKET)
          .upload(filePath, apkFile, {
            cacheControl: "31536000",
            contentType: APK_MIME_TYPE,
            upsert: false,
          });
        if (uploadError) throw uploadError;
        uploadedPath = filePath;
        const { data: publicAsset } = supabase.storage.from(APK_BUCKET).getPublicUrl(filePath);
        releaseDownloadUrl = publicAsset.publicUrl;
      }

      const parsed = new URL(releaseDownloadUrl);
      if (parsed.protocol !== "https:" || !parsed.hostname || parsed.username || parsed.password || !parsed.pathname.toLowerCase().endsWith(".apk")) {
        throw new Error("The resolved release asset is not a valid direct HTTPS .apk URL.");
      }

      const { error: saveError } = await supabase.from("mobile_app_releases").upsert({
        id: true,
        version: cleanVersion,
        version_code: code,
        minimum_version_code: minimum,
        download_url: releaseDownloadUrl,
        release_notes: notes.trim(),
        published: true,
        updated_by: userId,
        updated_at: new Date().toISOString(),
      }, { onConflict: "id" });
      if (saveError) throw saveError;

      setDownloadUrl(releaseDownloadUrl);
      setApkFile(null);
      setNotice(`Android version ${cleanVersion} · build ${code} is published. Compatible Android devices will detect it on their next update check.`);
      await load();
    } catch (publishError) {
      if (uploadedPath) {
        const { error: cleanupError } = await supabase.storage.from(APK_BUCKET).remove([uploadedPath]);
        const baseMessage = errorMessage(publishError, "The Android release could not be published.");
        setError(cleanupError
          ? `${baseMessage} The uploaded file could not be removed automatically; contact support before retrying.`
          : baseMessage);
      } else {
        setError(errorMessage(publishError, "The Android release could not be published."));
      }
    } finally {
      setBusy(false);
    }
  }

  if (!allowed) return null;

  return (
    <section className="admin-compose" aria-label="Android app release publishing">
      <div>
        <div><UploadCloud size={18}/><h3>Android Auto-Update Release</h3></div>
        <span className="admin-section-label">Super Admin only</span>
      </div>
      <p>Build a signed APK first, then upload it here and publish. AthleteN stores the APK for direct downloads and notifies Android builds below the published version. You can also use an existing direct HTTPS APK URL.</p>
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
          </div>
          <label>UPLOAD SIGNED APK (MAX 50 MB)
            <input
              key={apkFile?.name ?? "apk-file-empty"}
              type="file"
              accept=".apk,application/vnd.android.package-archive,application/octet-stream"
              onChange={selectApk}
              disabled={busy || loading}
            />
          </label>
          {apkFile ? <div className="admin-foot"><span>Selected: {apkFile.name}</span><span>{(apkFile.size / (1024 * 1024)).toFixed(2)} MB</span></div> : null}
          <label>OR DIRECT SIGNED APK URL
            <input type="url" value={downloadUrl} onChange={event=>setDownloadUrl(event.target.value)} placeholder="https://downloads.example.com/athleten.apk" autoCapitalize="none" disabled={Boolean(apkFile) || busy}/>
          </label>
          <label>RELEASE NOTES
            <textarea rows={4} value={notes} onChange={event=>setNotes(event.target.value)} maxLength={10000} placeholder="Summarise what changed in this release."/>
          </label>
          <div className="admin-foot">
            <span>Release notes: {notes.length}/10,000</span>
            {current?.updated_at ? <span>Last published: {new Date(current.updated_at).toLocaleString()}</span> : <span>First release has not been published</span>}
          </div>
          <div className="inline-actions">
            <button type="button" className="btn primary" disabled={busy || loading || !version.trim() || !versionCode.trim() || !minimumVersionCode.trim() || (!apkFile && !downloadUrl.trim())} onClick={()=>void publish()}>
              <UploadCloud size={15}/>{busy ? (apkFile ? "Uploading & publishing…" : "Publishing…") : "Publish Android Update"}
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
        <p>Uploaded APKs are publicly downloadable, but Storage only permits Super Admin accounts to upload or delete them. The upload limit is 50 MB. Use the same Android package name and signing key for every APK update, and increase versionCode on every new binary.</p>
        <p>Android will ask each user to approve the system installer; a normal app cannot silently replace itself. JavaScript-only changes need the separate Expo OTA service, which is not configured in the current native build.</p>
      </div>
    </section>
  );
}
