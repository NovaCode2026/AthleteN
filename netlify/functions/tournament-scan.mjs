import { createHash } from "node:crypto";
import { lookup } from "node:dns/promises";
import { isIP } from "node:net";
import { inflateSync } from "node:zlib";
import { createClient } from "@supabase/supabase-js";

const planIntervals = { free: 12, student: 6, pro: 3, elite: 2, coach: 1, academy: 0.5 };
const maxDiscoveredPages = 20;
const MAX_SCAN_MS = 45000;
const MAX_PAGE_FETCH_MS = 5500;
const MAX_PARALLEL_PAGES = 5;
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
  return String(value || "")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, '"')
    .replace(/&apos;/gi, "'")
    .replace(/&#39;/gi, "'")
    .replace(/&#x27;/gi, "'")
    .replace(/&#(\\d+);/g, (_, number) => {
      const code = Number(number);
      return code > 0 && code <= 0x10ffff ? String.fromCodePoint(code) : " ";
    })
    .replace(/&#x([0-9a-f]+);/gi, (_, number) => {
      const code = parseInt(number, 16);
      return code > 0 && code <= 0x10ffff ? String.fromCodePoint(code) : " ";
    });
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

export function extractDate(value) {
  if (!value) return null;
  const cleaned = String(value).trim();
  const toIso = (year, month, day) => {
    const date = new Date(Date.UTC(year, month - 1, day));
    if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) return null;
    return [String(year), String(month).padStart(2, "0"), String(day).padStart(2, "0")].join("-");
  };
  const iso = cleaned.match(/\b(20\d{2})-(\d{1,2})-(\d{1,2})\b/);
  if (iso) return toIso(Number(iso[1]), Number(iso[2]), Number(iso[3]));
  // Tournament posters commonly use Indian DD/MM/YYYY notation. Parse it
  // before Date.parse(), which can interpret ambiguous dates as US format.
  const numeric = cleaned.match(/\b(\d{1,2})[\/-](\d{1,2})[\/-](20\d{2})\b/);
  if (numeric) return toIso(Number(numeric[3]), Number(numeric[2]), Number(numeric[1]));
  const parsed = new Date(cleaned);
  if (!Number.isNaN(parsed.getTime())) return parsed.toISOString().slice(0, 10);
  return null;
}

function extractMeta(html, property) {
  for (const match of String(html || "").matchAll(/<meta\\b[^>]*>/gi)) {
    const tag = match[0];
    const key = tag.match(/(?:property|name)\\s*=\\s*["']([^"']+)["']/i)?.[1];
    if (String(key || "").toLowerCase() !== String(property).toLowerCase()) continue;
    const value = tag.match(/content\\s*=\\s*["']([^"']*)["']/i)?.[1];
    if (value) return decodeEntities(value).trim();
  }
  return null;
}

function extractPdfLinks(html, baseUrl) {
  const links = [];
  const pattern = /<a[^>]+href=["']([^"']+\.pdf(?:\?[^"']*)?)["'][^>]*>([\s\S]*?)<\/a>/gi;
  for (const match of html.matchAll(pattern)) {
    try { links.push({ href: new URL(match[1], baseUrl).toString(), label: normalizeText(match[2]).slice(0, 160) || "PDF notice" }); } catch {}
  }
  return links.slice(0, 30);
}

export function extractRelevantLinks(html, baseUrl) {
  const links = [];
  const pattern = /<a[^>]+href=["']([^"'#]+)["'][^>]*>([\s\S]*?)<\/a>/gi;
  for (const match of html.matchAll(pattern)) {
    try {
      const url = new URL(match[1], baseUrl);
      if (!["http:", "https:"].includes(url.protocol)) continue;
      const label = normalizeText(match[2]).slice(0, 200);
      const isPdfLink = /\.pdf(?:$|[?#])/i.test(url.href) || /\bpdf\b/i.test(label);
      if (url.origin !== new URL(baseUrl).origin && !isPdfLink) continue;
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

export function extractStructuredEvent(html) {
  const candidates = [];
  const visit = (value) => {
    if (Array.isArray(value)) { value.forEach(visit); return; }
    if (!value || typeof value !== "object") return;
    if (value["@graph"]) visit(value["@graph"]);
    const types = Array.isArray(value["@type"]) ? value["@type"] : [value["@type"]];
    if (types.some((type) => /event/i.test(String(type || ""))) && (value.name || value.startDate)) candidates.push(value);
    for (const [key, child] of Object.entries(value)) {
      if (key !== "@graph" && child && typeof child === "object") visit(child);
    }
  };
  for (const match of String(html || "").matchAll(/<script\b[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)) {
    try { visit(JSON.parse(match[1].trim())); } catch {}
  }
  const event = candidates.find((item) => item.name && item.startDate) || candidates[0];
  if (!event) return null;
  const asText = (value) => {
    if (typeof value === "string" || typeof value === "number") return String(value).trim();
    if (Array.isArray(value)) return value.map(asText).filter(Boolean).join(", ");
    if (value && typeof value === "object") return asText(value.name || value.url || value["@id"] || "");
    return "";
  };
  const addressText = (value) => {
    if (!value || typeof value !== "object") return asText(value);
    return [value.name, value.streetAddress, value.addressLocality, value.addressRegion, value.postalCode, value.addressCountry]
      .map(asText).filter(Boolean).join(", ");
  };
  const location = event.location;
  const formatLocation = (item) => [asText(item?.name), addressText(item?.address)].filter(Boolean).join(", ") || addressText(item);
  const venue = Array.isArray(location)
    ? location.map(formatLocation).filter(Boolean).join("; ")
    : formatLocation(location);
  const organizer = Array.isArray(event.organizer)
    ? event.organizer.map((item) => asText(item?.name || item)).filter(Boolean).join(", ")
    : asText(event.organizer?.name || event.organizer);
  const offers = Array.isArray(event.offers) ? event.offers[0] : event.offers;
  return {
    tournament_name: asText(event.name),
    tournament_date: asText(event.startDate),
    tournament_end_date: asText(event.endDate),
    venue,
    organizer,
    description: asText(event.description),
    event_url: asText(event.url),
    registration_fee: offers?.price != null ? [asText(offers.priceCurrency), asText(offers.price)].filter(Boolean).join(" ") : "",
    registration_url: asText(offers?.url),
    registration_deadline: asText(offers?.validThrough),
    event_status: asText(event.eventStatus)
  };
}

function scanPage(html, sourceUrl) {
  const text = normalizeText(html);
  const structured = extractStructuredEvent(html);
  const title = extractMeta(html, "og:title") || firstMatch(html, [/<title[^>]*>([\s\S]*?)<\/title>/i]) || structured?.tournament_name || firstMatch(text, [/(?:tournament|championship|open)\s*[:\-]\s*([^|.]{4,160})/i]);
  const description = extractMeta(html, "og:description") || extractMeta(html, "description") || structured?.description || null;
  const dateText = firstMatch(text, [/(?:date|event date|event\s*on)\s*[:\-]?\s*([A-Za-z0-9,\s/-]{6,60})/i, /(\d{1,2}\s+[A-Za-z]{3,9}\s+\d{4})/]) || structured?.tournament_date;
  const fields = {};
  for (const [key, patterns] of Object.entries(infoPatterns)) {
    const value = firstMatch(text, patterns);
    if (value) fields[key] = value;
  }
  if (structured?.organizer && !fields.organizer) fields.organizer = structured.organizer;
  if (structured?.registration_fee && !fields.fees) fields.fees = structured.registration_fee;
  if (structured?.registration_deadline && !fields.registration_deadline) fields.registration_deadline = structured.registration_deadline;
  if (structured?.registration_url && !fields.registration_link) fields.registration_link = structured.registration_url;
  if (structured?.event_status && !fields.event_status) fields.event_status = structured.event_status;
  const headings = [...html.matchAll(/<h[1-6][^>]*>([\s\S]*?)<\/h[1-6]>/gi)].map((m) => normalizeText(m[1])).filter(Boolean).slice(0, 40);
  const links = extractRelevantLinks(html, sourceUrl).slice(0, 40);
  return {
    tournament_name: title || null,
    tournament_date: extractDate(dateText) || (structured?.tournament_date ? extractDate(structured.tournament_date) : null),
    venue: firstMatch(text, [/(?:venue|location|host\s+venue)\s*[:\-]?\s*([^.;|]{4,220})/i]) || structured?.venue || null,
    registration_deadline: extractDate(fields.registration_deadline) || (structured?.registration_deadline ? extractDate(structured.registration_deadline) : null),
    weigh_in_information: fields.weigh_in || null,
    categories: fields.categories || fields.weight_categories || null,
    notices: fields.important_notices || null,
    schedules_results: [fields.schedule, fields.results].filter(Boolean).join(" | ") || null,
    pdfs: extractPdfLinks(html, sourceUrl),
    details: {
      description,
      fields,
      structured_event: structured,
      headings,
      sections: extractSections(html),
      key_highlights: snippetsForKeywords(text),
      page_url: sourceUrl,
      links
    }
  };
}

export function extractPdfText(buffer) {
  const source = Buffer.isBuffer(buffer) ? buffer.toString("latin1") : Buffer.from(buffer).toString("latin1");
  const streams = [];
  const streamPattern = /<<(?:[\s\S]*?)>>\s*stream\r?\n/g;
  for (const match of source.matchAll(streamPattern)) {
    const dictionary = match[0].slice(0, match[0].lastIndexOf("stream"));
    const start = match.index + match[0].length;
    const end = source.indexOf("endstream", start);
    if (end < 0) continue;
    let bytes = Buffer.from(source.slice(start, end).replace(/[\r\n]+$/, ""), "latin1");
    if (/\/FlateDecode\b/.test(dictionary)) {
      try { bytes = inflateSync(bytes); } catch { continue; }
    }
    streams.push(bytes.toString("latin1"));
  }

  const decodeLiteral = (value) => value
    .replace(/\\([nrtbf()\\])/g, (_, code) => ({ n: "\n", r: "\r", t: "\t", b: "\b", f: "\f", "(": "(", ")": ")", "\\": "\\" })[code] ?? code)
    .replace(/\\([0-7]{1,3})/g, (_, octal) => String.fromCharCode(parseInt(octal, 8)));
  const decodeHex = (value) => {
    try {
      let bytes = Buffer.from(value, "hex");
      if (bytes.length >= 2 && bytes[0] === 0xfe && bytes[1] === 0xff) {
        bytes = bytes.subarray(2);
        if (bytes.length % 2 === 0) return bytes.swap16().toString("utf16le");
      }
      return bytes.toString("latin1");
    } catch { return ""; }
  };

  const extracted = [];
  for (const stream of streams) {
    for (const block of stream.matchAll(/\bBT\b([\s\S]*?)\bET\b/g)) {
      const text = block[1];
      for (const match of text.matchAll(/\(((?:\\.|[^\\)])*)\)\s*Tj/g)) extracted.push(decodeLiteral(match[1]));
      for (const match of text.matchAll(/\[((?:.|\r|\n)*?)\]\s*TJ/g)) {
        for (const part of match[1].matchAll(/\(((?:\\.|[^\\)])*)\)|<([0-9A-Fa-f]{4,})>/g)) {
          extracted.push(part[1] !== undefined ? decodeLiteral(part[1]) : decodeHex(part[2]));
        }
      }
      for (const match of text.matchAll(/<([0-9A-Fa-f]{4,})>\s*Tj/g)) extracted.push(decodeHex(match[1]));
    }
  }
  return extracted.join(" ").replace(/\s+/g, " ").trim();
}

export function isBlockedIp(address) {
  const version = isIP(address);
  if (version === 4) {
    const [a, b, c] = address.split(".").map(Number);
    return a === 0 || a === 10 || a === 127 || a >= 224 ||
      (a === 100 && b >= 64 && b <= 127) ||
      (a === 169 && b === 254) ||
      (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && (b === 168 || (b === 0 && (c === 0 || c === 2)) || (b === 88 && c === 99))) ||
      (a === 198 && (b === 18 || b === 19 || (b === 51 && c === 100))) ||
      (a === 203 && b === 0 && c === 113);
  }
  if (version === 6) {
    const ip = address.toLowerCase().split("%")[0];
    return ip === "::" || ip === "::1" || ip.startsWith("::ffff:") ||
      /^(?:fc|fd|fe[89a-f]|ff)/i.test(ip) || ip.startsWith('::') ||
      ip.startsWith("2001:db8:") || ip.startsWith("2001:10:") ||
      ip.startsWith("64:ff9b:1:");
  }
  return true;
}

export async function assertPublicHttpUrl(value) {
  let url;
  try { url = new URL(value); } catch { throw new Error("INVALID_SOURCE_URL"); }
  if (!["http:", "https:"].includes(url.protocol) || url.username || url.password) throw new Error("UNSUPPORTED_SOURCE_URL");
  const hostname = url.hostname.toLowerCase().replace(/^\[|\]$/g, "");
  if (!hostname || hostname === "localhost" || hostname.endsWith(".localhost") ||
      hostname.endsWith(".local") || hostname.endsWith(".internal") ||
      hostname.endsWith(".test") || hostname.endsWith(".invalid")) throw new Error("PRIVATE_SOURCE_BLOCKED");
  if (isIP(hostname)) {
    if (isBlockedIp(hostname)) throw new Error("PRIVATE_SOURCE_BLOCKED");
    return url;
  }
  let addresses;
  try { addresses = await lookup(hostname, { all: true, verbatim: true }); }
  catch { throw new Error("HOST_LOOKUP_FAILED"); }
  if (!addresses.length || addresses.some((entry) => isBlockedIp(entry.address))) throw new Error("PRIVATE_SOURCE_BLOCKED");
  return url;
}

async function readBoundedBody(response, maxBytes) {
  const declared = Number(response.headers.get("content-length") || 0);
  if (declared > maxBytes) throw new Error("SOURCE_TOO_LARGE");
  if (!response.body) return Buffer.alloc(0);
  const reader = response.body.getReader();
  const chunks = [];
  let total = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > maxBytes) {
        await reader.cancel().catch(() => {});
        throw new Error("SOURCE_TOO_LARGE");
      }
      chunks.push(Buffer.from(value));
    }
  } finally {
    reader.releaseLock();
  }
  return Buffer.concat(chunks, total);
}

async function fetchText(url, timeoutMs = MAX_PAGE_FETCH_MS) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    let current = url;
    let response;
    for (let redirects = 0; redirects <= 4; redirects += 1) {
      const checkedUrl = await assertPublicHttpUrl(current);
      response = await fetch(checkedUrl, {
        headers: {
          "User-Agent": "Mozilla/5.0 (Linux; Android 14; Mobile) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Mobile Safari/537.36 AthleteN-TournamentScanner/2.2",
          Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,text/plain,application/pdf,*/*;q=0.8",
          "Accept-Language": "en-IN,en;q=0.9"
        },
        signal: controller.signal,
        redirect: "manual"
      });
      if (![301, 302, 303, 307, 308].includes(response.status)) break;
      const location = response.headers.get("location");
      if (!location) throw new Error("REDIRECT_WITHOUT_LOCATION");
      if (redirects === 4) throw new Error("TOO_MANY_REDIRECTS");
      current = new URL(location, checkedUrl).toString();
    }
    if (!response || !response.ok) throw new Error(`HTTP_${response?.status || 0}`);
    const contentType = (response.headers.get("content-type") || "").toLowerCase();
    const finalUrl = new URL(current);
    const isPdf = /application\/pdf/i.test(contentType) || /\.pdf$/i.test(finalUrl.pathname);
    if (isPdf) {
      const pdfText = extractPdfText(await readBoundedBody(response, 15 * 1024 * 1024));
      if (!pdfText) throw new Error("PDF_TEXT_UNAVAILABLE");
      return pdfText;
    }
    if (!contentType.includes("text/html") && !contentType.includes("text/plain") && !contentType.includes("xml")) throw new Error("UNSUPPORTED_CONTENT");
    return new TextDecoder("utf-8").decode(await readBoundedBody(response, 5 * 1024 * 1024));
  } finally {
    clearTimeout(timer);
  }
}

function mergeDetails(pages) {
  const fields = {};
  const fieldEvidence = {};
  const conflicts = [];
  const sections = [];
  const headings = new Set();
  const highlights = [];
  const normalizeField = (value) => String(value || "").replace(/\\s+/g, " ").trim().toLowerCase();

  for (const page of pages) {
    Object.entries(page.extracted.details?.fields || {}).forEach(([key, value]) => {
      if (!value) return;
      const normalized = normalizeField(value);
      fieldEvidence[key] ||= [];
      if (!fieldEvidence[key].some((item) => item.normalized === normalized)) {
        fieldEvidence[key].push({ value: String(value).trim(), normalized, source_url: page.url });
      }
    });
    for (const section of page.extracted.details?.sections || []) sections.push({ ...section, source_url: page.url });
    for (const heading of page.extracted.details?.headings || []) headings.add(heading);
    highlights.push(...(page.extracted.details?.key_highlights || []));
  }

  for (const [key, evidence] of Object.entries(fieldEvidence)) {
    if (!evidence.length) continue;
    const counts = new Map();
    for (const item of evidence) counts.set(item.normalized, (counts.get(item.normalized) || 0) + 1);
    const ranked = [...evidence].sort((a, b) => (counts.get(b.normalized) || 0) - (counts.get(a.normalized) || 0) || b.value.length - a.value.length);
    const distinct = [...new Set(evidence.map((item) => item.normalized))];
    if (distinct.length > 1) {
      conflicts.push({
        field: key,
        candidates: evidence.slice(0, 6).map((item) => ({ value: item.value, source_url: item.source_url }))
      });
      fields[key] = "";
    } else {
      fields[key] = ranked[0].value;
    }
  }

  return {
    fields,
    field_evidence: fieldEvidence,
    conflicts,
    headings: [...headings].slice(0, 100),
    sections: sections.slice(0, 80),
    key_highlights: [...new Set(highlights)].slice(0, 40),
    pages_scanned: pages.length,
    source_pages: pages.map((page) => page.url).slice(0, 40)
  };
}

export async function scanSource(sourceUrl) {
  const startedAt = Date.now();
  const deadline = startedAt + MAX_SCAN_MS;
  const rootHtml = await fetchText(sourceUrl);
  const parsedSource = new URL(sourceUrl);
  const discovered = new Set([parsedSource.toString()]);
  for (const link of extractRelevantLinks(rootHtml, sourceUrl)) {
    if (discovered.size >= maxDiscoveredPages) break;
    discovered.add(link);
  }
  try {
    if (Date.now() < deadline - MAX_PAGE_FETCH_MS) {
      const sitemap = await fetchText(new URL("/sitemap.xml", sourceUrl).toString());
      for (const link of extractSitemapLinks(sitemap, sourceUrl)) {
        if (discovered.size >= maxDiscoveredPages) break;
        discovered.add(link);
      }
    }
  } catch {}

  const urls = [...discovered];
  const pages = [];
  for (let i = 0; i < urls.length; i += MAX_PARALLEL_PAGES) {
    if (Date.now() >= deadline - 1500) break;
    const batch = urls.slice(i, i + MAX_PARALLEL_PAGES);
    const results = await Promise.allSettled(batch.map(async (url) => {
      const html = url === parsedSource.toString() ? rootHtml : await fetchText(url);
      return { url, html, extracted: scanPage(html, url) };
    }));
    for (const result of results) {
      if (result.status === "fulfilled" && result.value) pages.push(result.value);
    }
  }

  if (!pages.length) throw new Error("SOURCE_UNAVAILABLE");
  const primary = pages.find((page) => page.url === parsedSource.toString())?.extracted || pages[0].extracted;
  const allPdfs = pages.flatMap((page) => page.extracted.pdfs || []);
  const uniquePdfs = [...new Map(allPdfs.map((pdf) => [pdf.href, pdf])).values()].slice(0, 40);
  const allText = pages.map((page) => `${page.url}\n${normalizeText(page.html)}`).join("\n");
  const discoveredUrls = [...discovered].sort().join("\n");
  const firstExtracted = (key) => {
    for (const page of pages) {
      const value = page.extracted?.[key];
      if (value !== null && value !== undefined && String(value).trim()) return value;
    }
    return null;
  };
  const mergedDetails = mergeDetails(pages);
  const structuredEvents = pages
    .filter((page) => page.extracted.details?.structured_event)
    .map((page) => ({ source_url: page.url, ...page.extracted.details.structured_event }));
  return {
    extracted: {
      ...primary,
      tournament_name: primary.tournament_name || firstExtracted("tournament_name"),
      tournament_date: primary.tournament_date || firstExtracted("tournament_date"),
      venue: primary.venue || firstExtracted("venue"),
      registration_deadline: primary.registration_deadline || firstExtracted("registration_deadline"),
      weigh_in_information: primary.weigh_in_information || firstExtracted("weigh_in_information"),
      categories: primary.categories || firstExtracted("categories"),
      notices: primary.notices || firstExtracted("notices"),
      schedules_results: primary.schedules_results || firstExtracted("schedules_results"),
      pdfs: uniquePdfs,
      details: { ...mergedDetails, structured_events: structuredEvents, pdfs: uniquePdfs }
    },
    source_hash: createHash("sha256").update(discoveredUrls + "\n" + allText).digest("hex"),
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
  const { data: activeSubscriptions } = await supabase.from("subscriptions").select("plan_id, status").eq("user_id", userId).in("status", ["active", "trialing"]);
  const subscription = (activeSubscriptions || []).slice().sort((a, b) => (planIntervals[a.plan_id] ?? planIntervals.free) - (planIntervals[b.plan_id] ?? planIntervals.free))[0];
  const planId = subscription?.plan_id || profile.plan_id || "free";
  const intervalHours = planIntervals[planId] ?? planIntervals.free;
  const { data: existing } = await supabase.from("tournament_scans").select("last_checked_at, source_hash, status").eq("user_id", userId).eq("source_url", parsedUrl.toString()).maybeSingle();
  if (existing?.last_checked_at) {
    const retryIntervalHours = existing.status === "blocked" ? 5 / 60 : intervalHours;
    const earliest = new Date(existing.last_checked_at).getTime() + retryIntervalHours * 60 * 60 * 1000;
    if (Date.now() < earliest) {
      if (existing.status === "blocked") {
        const retryMinutes = Math.max(1, Math.ceil((earliest - Date.now()) / 60000));
        return json({ error: `The last scan could not read this source. You can retry in about ${retryMinutes} minute(s).` }, 429);
      }
      return json({ error: `This source was checked recently. Your plan allows checks every ${intervalHours === 0.5 ? "30 minutes" : `${intervalHours} hours`}.` }, 429);
    }
  }

  let status = "checked";
  let extracted = {};
  let sourceHash;
  try {
    const result = await scanSource(parsedUrl.toString());
    extracted = result.extracted;
    sourceHash = result.source_hash;
  } catch (error) {
    status = "blocked";
    const failureCode = String(error?.message || "SOURCE_UNAVAILABLE").slice(0, 80);
    const failureMessage = failureCode === "PDF_TEXT_UNAVAILABLE"
      ? "The PDF did not expose selectable text. It may be a scanned image; try the official webpage or a text-based PDF."
      : failureCode === "PRIVATE_SOURCE_BLOCKED" || failureCode === "UNSUPPORTED_SOURCE_URL"
        ? "This URL points to a private, local, or unsupported destination, so AthleteN blocked it for safety. Use a public http or https tournament link."
        : failureCode === "HOST_LOOKUP_FAILED"
          ? "AthleteN could not resolve the source hostname. Check the URL and try again."
          : failureCode === "SOURCE_TOO_LARGE"
            ? "The source is larger than the scanner limit. Try a smaller official notice or a direct text-based PDF."
            : failureCode === "TOO_MANY_REDIRECTS" || failureCode === "REDIRECT_WITHOUT_LOCATION"
              ? "The source redirected too many times or returned an invalid redirect. Try the final public page URL."
              : /^HTTP_(401|403|429)$/.test(failureCode)
                ? "The source denied or rate-limited automated access. Try another public tournament page or its linked notice."
                : failureCode === "HTTP_404"
                  ? "The source page was not found. Check the link and try again."
                  : failureCode === "UNSUPPORTED_CONTENT"
                    ? "This file type is not supported yet. Try a public HTML page or a text-based PDF."
                    : failureCode === "SOURCE_UNAVAILABLE" || failureCode === "AbortError"
                      ? "The source could not be reached in time. Check your connection or try the official tournament page."
                      : "The source may require login, JavaScript, or block automated access. Try a public page or text-based PDF.";
    sourceHash = createHash("sha256").update(String(parsedUrl) + ":BLOCKED:" + failureCode).digest("hex");
    extracted = { notices: failureMessage, details: { fields: {}, scan_error_code: failureCode, pages_scanned: 0, source_pages: [], sections: [], headings: [], key_highlights: [], pdfs: [] } };
  }
  const changed = existing?.source_hash && existing.source_hash !== sourceHash ? "Source or a discovered tournament page changed since the previous check." : "No previous change detected.";
  const nextCheckHours = status === "blocked" ? 5 / 60 : intervalHours;
  const { data, error } = await supabase.from("tournament_scans").upsert({ user_id: userId, source_url: parsedUrl.toString(), ...extracted, source_hash: sourceHash, detected_changes: changed, status, last_checked_at: new Date().toISOString(), next_check_at: nextCheckIso(nextCheckHours) }, { onConflict: "user_id,source_url" }).select().single();
  if (error) return json({ error: "Tournament scan could not be saved." }, 503);
  return json({ scan: data });
}
