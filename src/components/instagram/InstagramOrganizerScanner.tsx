import { useEffect, useMemo, useState } from "react";
import { CalendarDays, ExternalLink, FileText, Globe, Instagram, Loader2, MapPin, RefreshCw, ShieldCheck } from "lucide-react";
import { supabase } from "../../lib/supabase";
import "../../styles/tournament-scanner.css";

type SourceType = "website" | "instagram";
type Props = { accessToken?: string; setToast: (toast: { type: "success" | "error" | "warning"; message: string } | null) => void };
type DetailSection = { title: string; content: string; source_url?: string };
type ScanDetails = { description?: string | null; fields?: Record<string, string>; important_facts?: Record<string, string>; headings?: string[]; sections?: DetailSection[]; key_highlights?: string[]; pages_scanned?: number; source_pages?: string[]; pdfs?: Array<{ href: string; label: string }>; conflicts?: Array<{ field: string; candidates: Array<{ value: string; source_url?: string }> }> };
type ScanRow = { id: string; source_url: string; tournament_name?: string | null; tournament_date?: string | null; venue?: string | null; registration_deadline?: string | null; weigh_in_information?: string | null; categories?: string | null; notices?: string | null; schedules_results?: string | null; pdfs?: Array<{ href: string; label: string }> | null; details?: ScanDetails | null; status?: string | null; detected_changes?: string | null; last_checked_at?: string | null; next_check_at?: string | null };
type InstagramPost = { id: string; caption?: string; timestamp?: string | null; permalink?: string | null; media_type?: string | null; media_product_type?: string | null };
type InstagramResult = { organizer?: { username?: string; name?: string | null; biography?: string | null; followers_count?: number | null }; relevant_posts?: InstagramPost[]; other_posts?: InstagramPost[]; related_accounts?: Array<{ username: string; url: string; relevant?: boolean; title?: string | null; posts?: InstagramPost[] }>; posts_scanned?: number; scan_limit?: number; more_posts_available?: boolean; scan?: ScanRow };
type InstagramInput = { kind: "post" | "reel"; url: string };

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
    return null;
  } catch {
    return null;
  }
}

function formatDate(value?: string | null) {
  if (!value) return "—";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString();
}
function labelize(value: string) { return value.replace(/_/g, " ").replace(/\b\w/g, (letter) => letter.toUpperCase()); }
async function readError(response: Response, fallback: string) {
  const raw = await response.text().catch(() => "");
  try {
    const payload = JSON.parse(raw);
    if (typeof payload?.error === "string" && payload.error.trim()) return payload.error;
  } catch {}
  const compact = raw.replace(/<[^>]+>/g, " ").replace(/\\s+/g, " ").trim().slice(0, 500);
  return compact || `${fallback} HTTP ${response.status}.`;
}

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
    if (!input) throw new Error("Paste an Instagram tournament post or reel URL.");
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
  const importantFacts = details?.important_facts || {};
  const isInstagramScan = Boolean(
    instagramResult?.scan?.source_url || /instagram\.com/i.test(selectedScan?.source_url || "")
  );
  const primaryFields = useMemo(
    () => Object.entries(fields).filter(([key, value]) => !["description"].includes(key) && String(value || "").trim()),
    [fields]
  );
  const pdfs = selectedScan?.pdfs?.length ? selectedScan.pdfs : details?.pdfs || [];
  const sections = details?.sections || [];
  const sourcePages = details?.source_pages || [];
  const relevantPosts = instagramResult?.relevant_posts || [];
  const otherPosts = instagramResult?.other_posts || [];
  const dateDisplay = details?.fields?.tournament_date_text || selectedScan?.tournament_date || "";
  const registrationDisplay = details?.fields?.registration_deadline_text || selectedScan?.registration_deadline || "";

  return <div className="feature-page tournament-scanner">
    <div className="page-heading">
      <div><p className="eyebrow">Tournament intelligence</p><h2>Tournament Scanner</h2><p>Scan tournament websites, notices, schedules, results and linked documents, or inspect an Instagram organizer source.</p></div>
    </div>

    <section className="card panel">
      <div className="scanner-source-picker" role="tablist" aria-label="Tournament source type">
        <button type="button" className={`source-option ${sourceType === "website" ? "active" : ""}`} onClick={() => setSourceType("website")} aria-selected={sourceType === "website"}><Globe size={20}/><span><strong>Website</strong><small>Tournament site, notice, schedule or PDF</small></span></button>
        <button type="button" className={`source-option ${sourceType === "instagram" ? "active" : ""}`} onClick={() => setSourceType("instagram")} aria-selected={sourceType === "instagram"}><Instagram size={20}/><span><strong>Instagram</strong><small>Public tournament post or reel</small></span></button>
      </div>
      <form className="scan-form" onSubmit={(event) => void scan(event)}><input value={source} onChange={(event) => setSource(event.target.value)} placeholder={sourceType === "website" ? "https://example.com/tournament" : "https://instagram.com/p/... or /reel/..."} aria-label="Tournament scan source" required/><button className="btn primary" type="submit" disabled={scanning}>{scanning ? <Loader2 className="spin" size={16}/> : <RefreshCw size={16}/>} {scanning ? "Scanning..." : "Scan"}</button></form>
      {sourceType === "website" ? <p className="scanner-help"><Globe size={16}/> The scanner follows relevant same-site pages, notices, schedules, results, rules, equipment, registration pages and linked PDFs.</p> : <p className="scanner-help"><ShieldCheck size={16}/> The scanner automatically follows accessible tournament-related accounts and posts/reels it can discover from the source. Unrelated Instagram content is filtered out.</p>}
    </section>

    {selectedScan && <>
      {isInstagramScan ? <section className="card panel instagram-important-result">
        <div className="panel-head">
          <div>
            <p className="eyebrow">Tournament intelligence</p>
            <h3>{importantFacts.tournament_name || "Tournament information"}</h3>
            <p>Only valuable facts supported by accessible tournament evidence are shown. Unsupported fields are omitted.</p>
          </div>
          <span className="status">{selectedScan.status || "checked"}</span>
        </div>
        <div className="scan-summary">
          {importantFacts.tournament_dates && <div className="summary-item"><CalendarDays size={16}/><span>Tournament dates</span><strong>{importantFacts.tournament_dates}</strong></div>}
          {[importantFacts.reporting_date, importantFacts.reporting_time].filter(Boolean).length > 0 && <div className="summary-item"><CalendarDays size={16}/><span>Reporting</span><strong>{[importantFacts.reporting_date, importantFacts.reporting_time].filter(Boolean).join(" • ")}</strong></div>}
          {importantFacts.venue && <div className="summary-item"><MapPin size={16}/><span>Venue</span><strong>{importantFacts.venue}</strong></div>}
          {importantFacts.sport && <div className="summary-item"><Globe size={16}/><span>Sport</span><strong>{importantFacts.sport}</strong></div>}
        </div>
        <div className="details-list important-facts-list">
          {[
            ["City / State", importantFacts.city_state],
            ["Age categories", importantFacts.age_categories],
            ["Weight categories", importantFacts.weight_categories],
            ["Registration fee", importantFacts.registration_fee],
            ["Registration deadline", importantFacts.registration_deadline],
            ["Registration link", importantFacts.registration_link],
            ["Official contact", importantFacts.official_contact],
            ["Organizer", importantFacts.organizer],
            ["Scoring / equipment", importantFacts.equipment_and_scoring],
            ["Medals / prizes", importantFacts.medals_prizes],
            ["Important highlights", importantFacts.important_highlights],
            ["Important notice", importantFacts.important_notice],
            ["Evidence conflicts", importantFacts.evidence_conflicts]
          ].filter(([, value]) => Boolean(String(value || "").trim())).map(([label, value]) => <div className="detail-row" key={label}><b>{label}</b><span>{value}</span></div>)}
        </div>
        <div className="scanner-source-proof">
          <ShieldCheck size={16}/>
          <span>Source checked: <a href={selectedScan.source_url} target="_blank" rel="noreferrer">{selectedScan.source_url}</a></span>
        </div>

        {(fields.poster_image || fields.poster_text || fields.poster_events || fields.poster_disciplines || fields.poster_sport || fields.poster_age_categories || fields.poster_weight_categories) && <section className="card panel">
          <div className="panel-head"><div><h3>Complete poster intelligence</h3><p>Only readable tournament information supported by the accessible poster is shown. OCR noise is not promoted into structured facts.</p></div></div>
          <div className="details-list">
            {[
              ["Sport", fields.poster_sport],
              ["Disciplines", fields.poster_disciplines],
              ["Events / divisions", fields.poster_events],
              ["Age categories", fields.poster_age_categories],
              ["Weight categories", fields.poster_weight_categories],
              ["Gender categories", fields.poster_gender_categories],
              ["Eligibility", fields.poster_eligibility],
              ["City", fields.poster_city],
              ["State", fields.poster_state],
              ["Country", fields.poster_country],
              ["Organizer", fields.organizer],
              ["Host", fields.poster_host],
              ["Reporting date", fields.reporting_date_text],
              ["Reporting time", fields.reporting_time],
              ["Registration", fields.poster_registration],
              ["Registration deadline", fields.poster_registration_deadline],
              ["Registration link", fields.poster_registration_link],
              ["Fees", fields.fees],
              ["Contact", fields.poster_contact],
              ["Phone", fields.poster_phone],
              ["Email", fields.poster_email],
              ["Rules", fields.poster_rules],
              ["Scoring system", fields.poster_scoring_system],
              ["Competition system", fields.poster_competition_system],
              ["Rounds", fields.poster_rounds],
              ["Equipment", fields.poster_equipment],
              ["Schedule", fields.poster_schedule],
              ["Weigh-in", fields.poster_weigh_in],
              ["Medals", fields.poster_medals],
              ["Prizes", fields.poster_prizes],
              ["Accommodation", fields.poster_accommodation],
              ["Transport", fields.poster_transport],
              ["Documents", fields.poster_documents],
              ["Notices", fields.poster_notices],
              ["Highlights", fields.poster_highlights],
              ["Hashtags", fields.poster_hashtags]
            ].filter(([, value]) => Boolean(String(value || "").trim())).map(([label, value]) => <div className="detail-row" key={label}><b>{label}</b><span>{value}</span></div>)}
          </div>
          {fields.poster_image && <p><a className="source-link" href={fields.poster_image} target="_blank" rel="noreferrer"><ExternalLink size={14}/> Open analyzed poster image</a></p>}
        </section>}
      </section> : <>
      <section className="card panel">
        <div className="panel-head"><div><p className="eyebrow">Latest intelligence</p><h3>{selectedScan.tournament_name || "Tournament source"}</h3><p>{details?.description || "Information extracted from the source and relevant pages."}</p></div><span className={`status ${selectedScan.status === "blocked" ? "blocked" : ""}`}>{selectedScan.status || "checked"}</span></div>
        <div className="scan-summary">
          {dateDisplay && <div className="summary-item"><CalendarDays size={16}/><span>Date</span><strong>{dateDisplay}</strong></div>}
          {selectedScan.venue && <div className="summary-item"><MapPin size={16}/><span>Venue</span><strong>{selectedScan.venue}</strong></div>}
          {registrationDisplay && <div className="summary-item"><CalendarDays size={16}/><span>Registration</span><strong>{registrationDisplay}</strong></div>}
          {details?.pages_scanned > 0 && <div className="summary-item"><Globe size={16}/><span>Pages scanned</span><strong>{details.pages_scanned}</strong></div>}
        </div>
      </section>

      <section className="card panel"><div className="panel-head"><div><h3>All available tournament information</h3><p>The scanner keeps structured facts plus the relevant headings and sections it found, so important updates such as scoring/competition systems are not reduced to only date and venue.</p></div></div>
        {primaryFields.length > 0 ? <div className="details-list">{primaryFields.map(([key, value]) => <div className="detail-row" key={key}><b>{labelize(key)}</b><span>{value}</span></div>)}</div> : <div className="empty-state"><strong>No labeled fields were detected.</strong><p>Open the source pages below to inspect what the scanner could access.</p></div>}
      </section>

      {details?.conflicts?.length ? <section className="card panel">
        <div className="panel-head"><div><h3>Evidence conflicts</h3><p>Conflicting values are shown instead of choosing one silently.</p></div></div>
        <div className="details-list">{details.conflicts.map((conflict, index) => <div className="detail-row" key={`${conflict.field}-${index}`}><b>{labelize(conflict.field)}</b><span>{conflict.candidates.map((candidate, candidateIndex) => <span key={`${candidate.value}-${candidateIndex}`} style={{ display: "block" }}>{candidate.value}{candidate.source_url ? ` — ${candidate.source_url}` : ""}</span>)}</span></div>)}</div>
      </section> : null}

      {(fields.raw_source_text || fields.source_caption) && <section className="card panel">
        <div className="panel-head"><div><h3>Raw source information</h3><p>AthleteN shows the text Instagram actually exposed before structured extraction. Nothing from the accessible source is intentionally hidden.</p></div></div>
        <div className="details-list">
          {fields.source_caption && <div className="detail-row"><b>Instagram caption</b><span>{fields.source_caption}</span></div>}
          {fields.raw_source_text && <div className="detail-row"><b>Accessible source text</b><span>{fields.raw_source_text}</span></div>}
          {fields.source_image_count && <div className="detail-row"><b>Images found</b><span>{fields.source_image_count}</span></div>}
          {fields.scan_elapsed_seconds && <div className="detail-row"><b>Scan time</b><span>{fields.scan_elapsed_seconds}s</span></div>}
        </div>
      </section>}

    {(fields.poster_image || fields.poster_text || fields.poster_events || fields.poster_disciplines || fields.poster_sport) && <section className="card panel">
        <div className="panel-head"><div><h3>Complete poster intelligence</h3><p>All readable tournament information extracted from the poster is shown here. Blank fields mean the source did not visibly provide that information.</p></div></div>
        <div className="details-list">
          {[
            ["Image analyzed", fields.image_analyzed],
            ["Sport", fields.poster_sport],
            ["Disciplines", fields.poster_disciplines],
            ["Events / divisions", fields.poster_events],
            ["Age categories", fields.poster_age_categories],
            ["Weight categories", fields.poster_weight_categories],
            ["Gender categories", fields.poster_gender_categories],
            ["Eligibility", fields.poster_eligibility],
            ["City", fields.poster_city],
            ["State", fields.poster_state],
            ["Country", fields.poster_country],
            ["Organizer", fields.organizer],
            ["Host", fields.poster_host],
            ["Registration", fields.poster_registration],
            ["Registration deadline", fields.poster_registration_deadline],
            ["Registration link", fields.poster_registration_link],
            ["Fees", fields.fees],
            ["Contact", fields.poster_contact],
            ["Phone", fields.poster_phone],
            ["Email", fields.poster_email],
            ["Website", fields.poster_website],
            ["Rules", fields.poster_rules],
            ["Scoring system", fields.poster_scoring_system],
            ["Competition system", fields.poster_competition_system],
            ["Rounds", fields.poster_rounds],
            ["Equipment", fields.poster_equipment],
            ["Schedule", fields.poster_schedule],
            ["Weigh-in", fields.poster_weigh_in],
            ["Medals", fields.poster_medals],
            ["Prizes", fields.poster_prizes],
            ["Accommodation", fields.poster_accommodation],
            ["Transport", fields.poster_transport],
            ["Documents", fields.poster_documents],
            ["Notices", fields.poster_notices],
            ["Highlights", fields.poster_highlights],
            ["Hashtags", fields.poster_hashtags]
          ].filter(([, value]) => value).map(([label, value]) => <div className="detail-row" key={label}><b>{label}</b><span>{value}</span></div>)}
        </div>
        {fields.poster_image && <p><a className="source-link" href={fields.poster_image} target="_blank" rel="noreferrer"><ExternalLink size={14}/> Open analyzed poster image</a></p>}
      </section>}

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

      <section className="card panel"><h3>Scan status</h3><p><strong>Last checked:</strong> {formatDate(selectedScan.last_checked_at)}</p><p><strong>Next check:</strong> {formatDate(selectedScan.next_check_at)}</p>{selectedScan.detected_changes && <p><strong>Change detection:</strong> {selectedScan.detected_changes}</p>}<p><strong>Source:</strong> {selectedScan.source_url}</p></section>
    </>}
    </>}

    <section className="card panel scan-results"><div className="panel-head"><div><h3>Saved scans</h3><p>Select a previous scan to reopen its full extracted intelligence.</p></div></div>{!scans.length ? <div className="empty-state"><strong>No tournament scans yet.</strong><p>Choose a source above and run your first scan.</p></div> : <div className="scan-table-wrap"><table><thead><tr><th>Source</th><th>Tournament</th><th>Date</th><th>Venue</th><th>Last checked</th><th>Status</th><th>Details</th></tr></thead><tbody>{scans.map((scanRow) => <tr key={scanRow.id}><td className="source-cell">{scanRow.source_url}</td><td>{scanRow.tournament_name || ""}</td><td>{scanRow.tournament_date || ""}</td><td>{scanRow.venue || ""}</td><td>{formatDate(scanRow.last_checked_at)}</td><td><span className={`status ${scanRow.status === "blocked" ? "blocked" : ""}`}>{scanRow.status || ""}</span></td><td><button className="plain" type="button" onClick={() => setSelectedScan(scanRow)}>Open intelligence</button></td></tr>)}</tbody></table></div>}</section>
  </div>;
}
