import { createHash } from "node:crypto";
import { createClient } from "@supabase/supabase-js";

const planIntervals = { free: 12, student: 6, pro: 3, champion: 1, academy: 0.5 };
const maxDiscoveredPages = 30;
const relevantLinkPattern = /(tournament|championship|open|notice|circular|announcement|schedule|result|fixture|draw|weigh|registration|entry|pdf|rules|equipment|accommodation|transport|venue|fee|category|eligibility|contact|scoring|system)/i;
const infoPatterns = {
  registration_deadline: [/(?:registration|entry)\s+(?:deadline|closes?|closing|last\s+date)\s*[:\-]?\s*([^.;|]{4,180})/i, /(?:last\s+date|deadline)\s*[:\-]\s*([^.;|]{4,180})/i],
  weigh_in: [/(?:weigh[\s-]?in|weight\s*check)\s*[:\-]?\s*([^.;|]{4,300})/i],
  check_in: [/(?:check[\s-]?in|reporting)\s*[:\-]?\s*([^.;|]{4,300})/i],
  competition_system: [/(?:competition|scoring|electronic\s+scoring)\s+system\s*[:\-]?\s*([^.;|]{4,260})/i, /((?:daedo|dae\s*do|kpn[p]?|kpn\s*p|protector\s*(?:and|&)\s*scoring\s*system|PSS|electronic\s+body\s+protector)[^.;|]{0,220})/i],
  scoring_system: [/(?:scoring|score)\s+system\s*[:\-]?\s*([^.;|]{4,260})/i, /((?:PSS|electronic\s+scoring|electronic\s+protector)[^.;|]{0,220})/i],
  rules: [/(?:rules?|rule\s*book|regulations?)\s*[:\-]?\s*([^.;|]{4,360})/i],
  equipment: [/(?:equipment|protective\s+equipment|protector|gear)\s*[:\-]?\s*([^.;|]{4,360})/i],
  eligibility: [/(?:eligibility|eligible|participation|who\s+can\s+participate)\s*[:\-]?\s*([^.;|]{4,360})/i],
  age_groups: [/(?:age\s+groups?|age\s+category|cadet|junior|senior)\s*[:\-]?\s*([^.;|]{4,360})/i],
  weight_categories: [/(?:weight\s+categories?|weight\s+classes?|divisions?)\s*[:\-]?\s*([^.;|]{4,420})/i],
  categories: [/(?:categories|events|classes|divisions)\s*[:\-]?\s*([^.;|]{4,420})/i],
  fees: [/(?:entry|registration|participation)\s+fee(?:s)?\s*[:\-]?\s*([^.;|]{2,220})/i, /(?:fee|fees)\s*[:\-]?\s*([^.;|]{2,220})/i],
  schedule: [/(?:schedule|programme|program|time\s*table|timetable)\s*[:\-]?\s*([^.;|]{4,420})/i],
  results: [/(?:results?|fixtures?|draws?)\s*[:\-]?\s*([^.;|]{4,420})/i],
  accommodation: [/(?:accommodation|hotel|lodging)\s*[:\-]?\s*([^.;|]{4,360})/i],
  transport: [/(?:transport|transportation|pickup|pick\s*up|travel)\s*[:\-]?\s*([^.;|]{4,360})/i],
  medical: [/(?:medical|doctor|first\s+aid|health\s+check)\s*[:\-]?\s*([^.;|]{4,360})/i],
  organizer: [/(?:organizer|organiser|organised\s+by|promoted\s+by|hosted\s+by)\s*[:\-]?\s*([^.;|]{4,260})/i],
  contact: [/(?:contact|helpline|phone|email|e-?mail)\s*[:\-]?\s*([^.;|]{4,360})/i],
  important_notices: [/(?:important\s+(?:notice|information)|notice|announcement|circular)\s*[:\-]?\s*([^.;|]{4,420})/i]
};

function json(payload, status = 200) { return Response.json(payload, { status }); }

function createUserSupabaseClient(accessToken) {
  const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
  const supabaseAnonKey = process.env.VITE_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY;
  if (!supabaseUrl || !supabaseAnonKey) throw new Error("SUPABASE_PUBLIC_CONFIG_MISSING");
  return createClient(supabaseUrl, supabaseAnonKey, { global: { headers: { Authorization: `Bearer ${accessToken}` } }, auth: { persistSession: false, autoRefreshToken: false } });
}

function decodeEntities(value) {
  return value.replace(/&nbsp;/gi, " ").replace(/&amp;/gi, "&").replace(/&quot;/gi, '"').replace(/&#39;/gi, "'").replace(/&#x27;/gi, "'");
}

function normalizeText(html) {
  return decodeEntities(html.replace(/<script[\s\S]*?<\/script>/gi, " ").replace(/<style[\s\S]*?<\/style>/gi, " ").replace(/<noscript[\s\S]*?<\/noscript>/gi, " ").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim());
}

function firstMatch(text, patterns) {
  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match?.[1]) return match[1].trim().replace(/\s+/g, " ").slice(0, 500);
  }
  return null;
}

function extractDate(value) {
  if (!value) return null;
  const cleaned = value.trim();
  const parsed = new Date(cleaned);
  if (!Number.isNaN(parsed.getTime())) return parsed.toISOString().slice(0, 10);
  const match = cleaned.match(/(\d{1,2})[\/-](\d{1,2})[\/-](\d{4})/);
  if (match) return `${match[3]}-${match[2].padStart(2, "0")}-${match[1].padStart(2, "0")}`;
  return null;
}

function extractMeta(html, property) {
  const pattern = new RegExp(`<meta[^>]+(?:property|name)=["']${property}["'][^>]+content=["']([^"']+)["'][^>]*>`, "i");
  return html.match(pattern)?.[1]?.trim() || null;
}

function extractPdfLinks(html, baseUrl) {
  const links = [];
  const pattern = /<a[^>]+href=["']([^"']+\.pdf(?:\?[^"']*)?)["'][^>]*>([\s\S]*?)<\/a>/gi;
  for (const match of html.matchAll(pattern)) {
    try { links.push({ href: new URL(match[1], baseUrl).toString(), label: normalizeText(match[2]).slice(0, 160) || "PDF notice" }); } catch {}
  }
  return links.slice(0, 30);
}

function extractRelevantLinks(html, baseUrl) {
  const links = [];
  const pattern = /<a[^>]+href=["']([^"'#]+)["'][^>]*>([\s\S]*?)<\/a>/gi;
  for (const match of html.matchAll(pattern)) {
    try {
      const url = new URL(match[1], baseUrl);
      if (!["http:", "https:"].includes(url.protocol) || url.origin !== new URL(baseUrl).origin) continue;
      const label = normalizeText(match[2]).slice(0, 200);
      if (!relevantLinkPattern.test(`${url.pathname} ${label}`)) continue;
      url.hash = "";
      links.push(url.toString());
    } catch {}
  }
  return [...new Set(links)];
}

function extractSitemapLinks(xml, baseUrl) {
  const links = [];
  for (const match of xml.matchAll(/<loc>\s*([^<]+)\s*<\/loc>/gi)) {
    try {
      const url = new URL(match[1].trim(), baseUrl);
      if (["http:", "https:"].includes(url.protocol) && url.origin === new URL(baseUrl).origin && relevantLinkPattern.test(`${url.pathname} ${url.search}`)) links.push(url.toString());
    } catch {}
  }
  return [...new Set(links)];
}

function extractSections(html) {
  const sections = [];
  const pattern = /<(h[1-6])[^>]*>([\s\S]*?)<\/\1>/gi;
  const headings = [...html.matchAll(pattern)];
  for (let i = 0; i < headings.length; i += 1) {
    const title = normalizeText(headings[i][2]);
    if (!title) continue;
    const start = headings[i].index + headings[i][0].length;
    const end = headings[i + 1]?.index ?? Math.min(html.length, start + 9000);
    const body = normalizeText(html.slice(start, end));
    if (body) sections.push({ title: title.slice(0, 160), content: body.slice(0, 1200) });
  }
  return sections.slice(0, 40);
}

function snippetsForKeywords(text) {
  const keywords = ["system", "scoring", "PSS", "protector", "weigh", "registration", "schedule", "rules", "equipment", "category", "eligibility", "fee", "accommodation", "transport", "medical", "contact", "notice", "announcement"];
  const snippets = [];
  for (const keyword of keywords) {
    const index = text.toLowerCase().indexOf(keyword.toLowerCase());
    if (index < 0) continue;
    snippets.push(`${keyword}: ${text.slice(Math.max(0, index - 140), Math.min(text.length, index + 420))}`.trim());
  }
  return [...new Set(snippets)].slice(0, 20);
}

function scanPage(html, sourceUrl) {
  const text = normalizeText(html);
  const title = extractMeta(html, "og:title") || firstMatch(html, [/<title[^>]*>([\s\S]*?)<\/title>/i]) || firstMatch(text, [/(?:tournament|championship|open)\s*[:\-]\s*([^|.]{4,160})/i]);
  const description = extractMeta(html, "og:description") || extractMeta(html, "description");
  const dateText = firstMatch(text, [/(?:date|event date|event\s*on)\s*[:\-]?\s*([A-Za-z0-9,\s/-]{6,60})/i, /(\d{1,2}\s+[A-Za-z]{3,9}\s+\d{4})/]);
  const fields = {};
  for (const [key, patterns] of Object.entries(infoPatterns)) {
    const value = firstMatch(text, patterns);
    if (value) fields[key] = value;
  }
  const headings = [...html.matchAll(/<h[1-6][^>]*>([\s\S]*?)<\/h[1-6]>/gi)].map((m) => normalizeText(m[1])).filter(Boolean).slice(0, 40);
  const links = extractRelevantLinks(html, sourceUrl).slice(0, 40);
  return {
    tournament_name: title,
    tournament_date: extractDate(dateText),
    venue: firstMatch(text, [/(?:venue|location|host\s+venue)\s*[:\-]?\s*([^.;|]{4,220})/i]),
    registration_deadline: extractDate(fields.registration_deadline),
    weigh_in_information: fields.weigh_in || null,
    categories: fields.categories || fields.weight_categories || null,
    notices: fields.important_notices || null,
    schedules_results: [fields.schedule, fields.results].filter(Boolean).join(" | ") || null,
    pdfs: extractPdfLinks(html, sourceUrl),
    details: {
      description,
      fields,
      headings,
      sections: extractSections(html),
      key_highlights: snippetsForKeywords(text),
      page_url: sourceUrl,
      links
    }
  };
}

async function fetchText(url) {
  const response = await fetch(url, { headers: { "User-Agent": "AthleteN-TournamentScanner/2.0", Accept: "text/html,text/plain,application/xml,text/xml,application/xhtml+xml" } });
  if (!response.ok) throw new Error(`HTTP_${response.status}`);
  const contentType = response.headers.get("content-type") || "";
  if (!contentType.includes("text/html") && !contentType.includes("text/plain") && !contentType.includes("xml")) throw new Error("UNSUPPORTED_CONTENT");
  return response.text();
}

function mergeDetails(pages) {
  const fields = {};
  const sections = [];
  const headings = new Set();
  const highlights = [];
  for (const page of pages) {
    Object.entries(page.extracted.details?.fields || {}).forEach(([key, value]) => { if (!fields[key]) fields[key] = value; });
    for (const section of page.extracted.details?.sections || []) sections.push({ ...section, source_url: page.url });
    for (const heading of page.extracted.details?.headings || []) headings.add(heading);
    highlights.push(...(page.extracted.details?.key_highlights || []));
  }
  return {
    fields,
    headings: [...headings].slice(0, 100),
    sections: sections.slice(0, 80),
    key_highlights: [...new Set(highlights)].slice(0, 40),
    pages_scanned: pages.length,
    source_pages: pages.map((page) => page.url).slice(0, 40)
  };
}

export async function scanSource(sourceUrl) {
  const rootHtml = await fetchText(sourceUrl);
  const parsedSource = new URL(sourceUrl);
  const discovered = new Set([parsedSource.toString()]);
  for (const link of extractRelevantLinks(rootHtml, sourceUrl)) {
    if (discovered.size >= maxDiscoveredPages) break;
    discovered.add(link);
  }
  try {
    const sitemap = await fetchText(new URL("/sitemap.xml", sourceUrl).toString());
    for (const link of extractSitemapLinks(sitemap, sourceUrl)) {
      if (discovered.size >= maxDiscoveredPages) break;
      discovered.add(link);
    }
  } catch {}
  const pages = [];
  for (const url of discovered) {
    try {
      const html = url === parsedSource.toString() ? rootHtml : await fetchText(url);
      pages.push({ url, html, extracted: scanPage(html, url) });
    } catch {}
  }
  if (!pages.length) throw new Error("SOURCE_UNAVAILABLE");
  const primary = pages[0].extracted;
  const allPdfs = pages.flatMap((page) => page.extracted.pdfs || []);
  const uniquePdfs = [...new Map(allPdfs.map((pdf) => [pdf.href, pdf])).values()].slice(0, 40);
  const allText = pages.map((page) => `${page.url}\n${normalizeText(page.html)}`).join("\n");
  const discoveredUrls = [...discovered].sort().join("\n");
  return {
    extracted: {
      ...primary,
      pdfs: uniquePdfs,
      details: { ...mergeDetails(pages), pdfs: uniquePdfs }
    },
    source_hash: createHash("sha256").update(`${discoveredUrls}\n${allText}`).digest("hex"),
    pages_scanned: pages.length,
    discovered_urls: [...discovered]
  };
}

function nextCheckIso(hours) { return new Date(Date.now() + hours * 60 * 60 * 1000).toISOString(); }

export default async function handler(request) {
  if (request.method !== "POST") return json({ error: "Method not allowed." }, 405);
  const { sourceUrl } = await request.json().catch(() => ({}));
  let parsedUrl;
  try { parsedUrl = new URL(sourceUrl); } catch { return json({ error: "Enter a valid tournament source URL." }, 400); }
  if (!["http:", "https:"].includes(parsedUrl.protocol) || parsedUrl.username || parsedUrl.password) return json({ error: "Only public http and https tournament sources can be scanned." }, 400);

  const accessToken = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  if (!accessToken) return json({ error: "Please sign in again before scanning." }, 401);
  let supabase;
  try { supabase = createUserSupabaseClient(accessToken); } catch { return json({ error: "AthleteN services are not configured for scanning." }, 503); }
  const { data: userData, error: userError } = await supabase.auth.getUser(accessToken);
  if (userError || !userData?.user) return json({ error: "Please sign in again before scanning." }, 401);
  const userId = userData.user.id;
  const { data: profile, error: profileError } = await supabase.from("profiles").select("user_id, plan_id").eq("user_id", userId).maybeSingle();
  if (profileError) return json({ error: "Unable to verify your scanner entitlement." }, 503);
  if (!profile) return json({ error: "Complete onboarding before using Tournament Scanner." }, 403);
  const { data: subscription } = await supabase.from("subscriptions").select("plan_id, status").eq("user_id", userId).in("status", ["active", "trialing"]).maybeSingle();
  const planId = subscription?.plan_id || profile.plan_id || "free";
  const intervalHours = planIntervals[planId] ?? planIntervals.free;
  const { data: existing } = await supabase.from("tournament_scans").select("last_checked_at, source_hash").eq("user_id", userId).eq("source_url", parsedUrl.toString()).maybeSingle();
  if (existing?.last_checked_at) {
    const earliest = new Date(existing.last_checked_at).getTime() + intervalHours * 60 * 60 * 1000;
    if (Date.now() < earliest) return json({ error: `This source was checked recently. Your plan allows checks every ${intervalHours === 0.5 ? "30 minutes" : `${intervalHours} hours`}.` }, 429);
  }

  let status = "checked";
  let extracted = {};
  let sourceHash;
  try {
    const result = await scanSource(parsedUrl.toString());
    extracted = result.extracted;
    sourceHash = result.source_hash;
  } catch {
    status = "blocked";
    sourceHash = createHash("sha256").update(`${parsedUrl}:${Date.now()}`).digest("hex");
    extracted = { notices: "AthleteN could not scan this source automatically. The site may block server requests, require JavaScript, or use an unsupported file type.", details: { fields: {}, pages_scanned: 0, source_pages: [], sections: [], headings: [], key_highlights: [], pdfs: [] } };
  }
  const changed = existing?.source_hash && existing.source_hash !== sourceHash ? "Source or a discovered tournament page changed since the previous check." : "No previous change detected.";
  const { data, error } = await supabase.from("tournament_scans").upsert({ user_id: userId, source_url: parsedUrl.toString(), ...extracted, source_hash: sourceHash, detected_changes: changed, status, last_checked_at: new Date().toISOString(), next_check_at: nextCheckIso(intervalHours) }, { onConflict: "user_id,source_url" }).select().single();
  if (error) return json({ error: "Tournament scan could not be saved." }, 503);
  return json({ scan: data });
}
