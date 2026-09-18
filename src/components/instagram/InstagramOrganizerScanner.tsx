import { useEffect, useMemo, useState } from "react";
import { CalendarDays, ExternalLink, FileText, Globe, Instagram, Loader2, MapPin, RefreshCw, ShieldCheck } from "lucide-react";
import { supabase } from "../../lib/supabase";
import "../../styles/tournament-scanner.css";

type SourceType = "website" | "instagram";
type Props = { accessToken?: string; setToast: (toast: { type: "success" | "error" | "warning"; message: string } | null) => void };
type DetailSection = { title: string; content: string; source_url?: string };
type ScanDetails = { description?: string | null; fields?: Record<string, string>; headings?: string[]; sections?: DetailSection[]; key_highlights?: string[]; pages_scanned?: number; source_pages?: string[]; pdfs?: Array<{ href: string; label: string }> };
type ScanRow = { id: string; source_url: string; tournament_name?: string | null; tournament_date?: string | null; venue?: string | null; registration_deadline?: string | null; weigh_in_information?: string | null; categories?: string | null; notices?: string | null; schedules_results?: string | null; pdfs?: Array<{ href: string; label: string }> | null; details?: ScanDetails | null; status?: string | null; detected_changes?: string | null; last_checked_at?: string | null; next_check_at?: string | null };
type InstagramPost = { id: string; caption?: string; timestamp?: string | null; permalink?: string | null; media_type?: string | null; media_product_type?: string | null };
type InstagramResult = { organizer?: { username?: string; name?: string | null; biography?: string | null; followers_count?: number | null }; relevant_posts?: InstagramPost[]; other_posts?: InstagramPost[]; related_accounts?: Array<{ username: string; url: string; relevant?: boolean; title?: string | null; posts?: InstagramPost[] }>; posts_scanned?: number; scan_limit?: number; more_posts_available?: boolean; scan?: ScanRow };
type InstagramInput = { kind: "profile" | "post" | "reel"; username?: string; url: string };

function parseInstagramInput(value: string): InstagramInput | null {
  const trimmed = value.trim();
  if (!trimmed) return null;
  try {
    const url = new URL(trimmed.includes("://") ? trimmed : `https://instagram.com/${trimmed.replace(/^@/, "")}`);
    const host = url.hostname.toLowerCase();
    if (host !== "instagram.com" && !host.endsWith(".instagram.com")) return null;
    const parts = url.pathname.split("/").filter(Boolean);
    if (!parts.length) return null;
    const first = parts[0].toLowerCase();
    if (first === "p" && parts[1]) return { kind: "post", url: `https://www.instagram.com/p/${parts[1]}/` };
    if ((first === "reel" || first === "reels") && parts[1]) return { kind: "reel", url: `https://www.instagram.com/reel/${parts[1]}/` };
    const username = parts[0].replace(/^@/, "");
    return username ? { kind: "profile", username, url: `https://www.instagram.com/${username}/` } : null;
  } catch {
    const username = trimmed.replace(/^@/, "").split(/[/?#]/)[0];
    return username ? { kind: "profile", username, url: `https://www.instagram.com/${username}/` } : null;
  }
}

function formatDate(value?: string | null) {
  if (!value) return "—";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString();
}
function labelize(value: string) { return value.replace(/_/g, " ").replace(/\b\w/g, (letter) => letter.toUpperCase()); }
async function readError(response: Response, fallback: string) { const payload = await response.json().catch(() => ({})); return typeof payload?.error === "string" && payload.error.trim() ? payload.error : fallback; }

export default function InstagramOrganizerScanner({ accessToken, setToast }: Props) {
  const [sourceType, setSourceType] = useState<SourceType>("website");
  const [source, setSource] = useState("");
  const [scanning, setScanning] = useState(false);
  const [scans, setScans] = useState<ScanRow[]>([]);
  const [selectedScan, setSelectedScan] = useState<ScanRow | null>(null);
  const [instagramResult, setInstagramResult] = useState<InstagramResult | null>(null);

  async function loadScans() {
    if (!accessToken) return;
    const { data: userData } = await supabase.auth.getUser(accessToken);
    const userId = userData.user?.id;
    if (!userId) return;
    const { data, error } = await supabase.from("tournament_scans").select("id,source_url,tournament_name,tournament_date,venue,registration_deadline,weigh_in_information,categories,notices,schedules_results,pdfs,details,status,detected_changes,last_checked_at,next_check_at").eq("user_id", userId).order("last_checked_at", { ascending: false }).limit(20);
    if (!error) {
      const rows = (data || []) as ScanRow[];
      setScans(rows);
      setSelectedScan((current) => current ? rows.find((row) => row.id === current.id) || current : rows[0] || null);
    }
  }
  useEffect(() => { void loadScans(); }, [accessToken]);

  async function scanWebsite(url: string) {
    const response = await fetch("/.netlify/functions/tournament-scan", { method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${accessToken}` }, body: JSON.stringify({ sourceUrl: url }) });
    if (!response.ok) throw new Error(await readError(response, "Website tournament scan failed."));
    return response.json();
  }

  async function scanInstagram(value: string) {
    const input = parseInstagramInput(value);
    if (!input) throw new Error("Enter an Instagram profile, post, or reel URL.");
    const response = await fetch("/.netlify/functions/instagram-tournament-scan", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${accessToken}` },
      body: JSON.stringify({ sourceUrl: input.url })
    });
    const payload = await response.json().catch(() => ({})) as InstagramResult & { error?: string };
    if (!response.ok) throw new Error(payload.error || "Instagram tournament scan failed.");
    setInstagramResult(payload);
    return payload;
  }

  async function scan(event: React.FormEvent) {
    event.preventDefault();
    if (!accessToken) { setToast({ type: "error", message: "Please sign in again before scanning." }); return; }
    if (!source.trim()) { setToast({ type: "warning", message: "Enter a source link first." }); return; }
    setScanning(true);
    try {
      if (sourceType === "website") {
        const payload = await scanWebsite(source.trim());
        setInstagramResult(null);
        if (payload?.scan) setSelectedScan(payload.scan as ScanRow);
        setToast({ type: "success", message: "Tournament scan completed. Full available tournament intelligence was extracted." });
      } else {
        const input = parseInstagramInput(source);
        const result = await scanInstagram(source.trim());
        if (result?.scan) setSelectedScan(result.scan as ScanRow);
        setToast({ type: "success", message: "Instagram tournament scan completed. Only tournament-related information was retained." });
      }
      setSource("");
      await loadScans();
    } catch (error) { setToast({ type: "error", message: error instanceof Error ? error.message : "Tournament scan failed." }); }
    finally { setScanning(false); }
  }

  const details = selectedScan?.details;
  const fields = details?.fields || {};
  const primaryFields = useMemo(() => Object.entries(fields).filter(([key]) => !["description"].includes(key)), [fields]);
  const pdfs = selectedScan?.pdfs?.length ? selectedScan.pdfs : details?.pdfs || [];
  const sections = details?.sections || [];
  const sourcePages = details?.source_pages || [];
  const relevantPosts = instagramResult?.relevant_posts || [];
  const otherPosts = instagramResult?.other_posts || [];

  return <div className="feature-page tournament-scanner">
    <div className="page-heading">
      <div><p className="eyebrow">Tournament intelligence</p><h2>Tournament Scanner</h2><p>Scan tournament websites, notices, schedules, results and linked documents, or inspect an Instagram organizer source.</p></div>
    </div>

    <section className="card panel">
      <div className="scanner-source-picker" role="tablist" aria-label="Tournament source type">
        <button type="button" className={`source-option ${sourceType === "website" ? "active" : ""}`} onClick={() => setSourceType("website")} aria-selected={sourceType === "website"}><Globe size={20}/><span><strong>Website</strong><small>Tournament site, notice, schedule or PDF</small></span></button>
        <button type="button" className={`source-option ${sourceType === "instagram" ? "active" : ""}`} onClick={() => setSourceType("instagram")} aria-selected={sourceType === "instagram"}><Instagram size={20}/><span><strong>Instagram</strong><small>Profile, post, reel or @username</small></span></button>
      </div>
      <form className="scan-form" onSubmit={(event) => void scan(event)}><input value={source} onChange={(event) => setSource(event.target.value)} placeholder={sourceType === "website" ? "https://example.com/tournament" : "https://instagram.com/organizer or /p/... or /reel/..."} aria-label="Tournament scan source" required/><button className="btn primary" type="submit" disabled={scanning}>{scanning ? <Loader2 className="spin" size={16}/> : <RefreshCw size={16}/>} {scanning ? "Scanning..." : "Scan"}</button></form>
      {sourceType === "website" ? <p className="scanner-help"><Globe size={16}/> The scanner follows relevant same-site pages, notices, schedules, results, rules, equipment, registration pages and linked PDFs.</p> : <p className="scanner-help"><ShieldCheck size={16}/> The scanner automatically follows accessible tournament-related accounts and posts/reels it can discover from the source. Unrelated Instagram content is filtered out.</p>}
    </section>

    {instagramResult?.related_accounts && <section className="card panel">
      <div className="panel-head"><div><p className="eyebrow">Automatic discovery</p><h3>Related tournament sources</h3><p>AthleteN followed accessible accounts and tournament-related posts/reels discovered from the scanned source.</p></div></div>
      <div className="details-list">{instagramResult.related_accounts.map((account) => <div className="detail-row" key={account.username}><b>@{account.username}</b><span>{account.title || "Relevant tournament content discovered."} {account.url && <a href={account.url} target="_blank" rel="noreferrer">Open source <ExternalLink size={12}/></a>}</span></div>)}</div>
    </section>}

    {selectedScan && <>
      <section className="card panel">
        <div className="panel-head"><div><p className="eyebrow">Latest intelligence</p><h3>{selectedScan.tournament_name || "Tournament source"}</h3><p>{details?.description || "Information extracted from the source and relevant pages."}</p></div><span className={`status ${selectedScan.status === "blocked" ? "blocked" : ""}`}>{selectedScan.status || "checked"}</span></div>
        <div className="scan-summary">
          <div className="summary-item"><CalendarDays size={16}/><span>Date</span><strong>{selectedScan.tournament_date || "Not found"}</strong></div>
          <div className="summary-item"><MapPin size={16}/><span>Venue</span><strong>{selectedScan.venue || "Not found"}</strong></div>
          <div className="summary-item"><CalendarDays size={16}/><span>Registration</span><strong>{selectedScan.registration_deadline || "Not found"}</strong></div>
          <div className="summary-item"><Globe size={16}/><span>Pages scanned</span><strong>{details?.pages_scanned ?? 0}</strong></div>
        </div>
      </section>

      <section className="card panel"><div className="panel-head"><div><h3>All available tournament information</h3><p>The scanner keeps structured facts plus the relevant headings and sections it found, so important updates such as scoring/competition systems are not reduced to only date and venue.</p></div></div>
        {primaryFields.length > 0 ? <div className="details-list">{primaryFields.map(([key, value]) => <div className="detail-row" key={key}><b>{labelize(key)}</b><span>{value}</span></div>)}</div> : <div className="empty-state"><strong>No labeled fields were detected.</strong><p>Open the source pages below to inspect what the scanner could access.</p></div>}
      </section>

      {(selectedScan.weigh_in_information || selectedScan.categories || selectedScan.notices || selectedScan.schedules_results) && <section className="info-grid">
        {selectedScan.weigh_in_information && <article className="info-card"><h4>Weigh-in / weight check</h4><p>{selectedScan.weigh_in_information}</p></article>}
        {selectedScan.categories && <article className="info-card"><h4>Categories / divisions</h4><p>{selectedScan.categories}</p></article>}
        {selectedScan.schedules_results && <article className="info-card"><h4>Schedule / results</h4><p>{selectedScan.schedules_results}</p></article>}
        {selectedScan.notices && <article className="info-card"><h4>Notices</h4><p>{selectedScan.notices}</p></article>}
      </section>}

      {sections.length > 0 && <section className="card panel"><h3>Source sections discovered</h3><div className="details-list">{sections.map((section, index) => <div className="detail-row" key={`${section.title}-${index}`}><b>{section.title}</b><span>{section.content}{section.source_url ? `\n${section.source_url}` : ""}</span></div>)}</div></section>}

      {details?.key_highlights?.length ? <section className="card panel"><h3>Key source highlights</h3><div className="details-list">{details.key_highlights.map((highlight, index) => <div className="detail-row" key={`${highlight}-${index}`}><b>Detected</b><span>{highlight}</span></div>)}</div></section> : null}

      {pdfs.length > 0 && <section className="card panel"><h3>Official documents / PDFs found</h3><div className="source-list">{pdfs.map((pdf) => <a className="source-link" key={pdf.href} href={pdf.href} target="_blank" rel="noreferrer"><FileText size={15}/><span>{pdf.label || pdf.href}</span><ExternalLink size={13}/></a>)}</div><p>PDF links are preserved as source documents. If a PDF requires a protected viewer or blocks server retrieval, AthleteN keeps the official document link rather than inventing extracted content.</p></section>}

      {sourcePages.length > 0 && <section className="card panel"><h3>Pages actually scanned</h3><div className="source-list">{sourcePages.map((url) => <a className="source-link" key={url} href={url} target="_blank" rel="noreferrer"><Globe size={15}/><span>{url}</span><ExternalLink size={13}/></a>)}</div></section>}

      <section className="card panel"><h3>Scan status</h3><p><strong>Last checked:</strong> {formatDate(selectedScan.last_checked_at)}</p><p><strong>Next check:</strong> {formatDate(selectedScan.next_check_at)}</p><p><strong>Change detection:</strong> {selectedScan.detected_changes || "No change information returned."}</p><p><strong>Source:</strong> {selectedScan.source_url}</p></section>
    </>}

    <section className="card panel scan-results"><div className="panel-head"><div><h3>Saved scans</h3><p>Select a previous scan to reopen its full extracted intelligence.</p></div></div>{!scans.length ? <div className="empty-state"><strong>No tournament scans yet.</strong><p>Choose a source above and run your first scan.</p></div> : <div className="scan-table-wrap"><table><thead><tr><th>Source</th><th>Tournament</th><th>Date</th><th>Venue</th><th>Last checked</th><th>Status</th><th>Details</th></tr></thead><tbody>{scans.map((scanRow) => <tr key={scanRow.id}><td className="source-cell">{scanRow.source_url}</td><td>{scanRow.tournament_name || "—"}</td><td>{scanRow.tournament_date || "—"}</td><td>{scanRow.venue || "—"}</td><td>{formatDate(scanRow.last_checked_at)}</td><td><span className={`status ${scanRow.status === "blocked" ? "blocked" : ""}`}>{scanRow.status || "—"}</span></td><td><button className="plain" type="button" onClick={() => setSelectedScan(scanRow)}>Open intelligence</button></td></tr>)}</tbody></table></div>}</section>
  </div>;
}
