import { createHash } from "node:crypto";
import { createClient } from "@supabase/supabase-js";

const TOURNAMENT_WORDS = /(taekwondo|tournament|championship|championships|open|cup|games|kyorugi|poomsae|registration|weigh[- ]?in|draw|fixture|entry|medal|cadet|junior|senior|rules|scoring|PSS|protector|venue|schedule|fee|accommodation|transport|results?|competition|state|national)/i;
const IG_PATHS_TO_IGNORE = new Set(["p","reel","reels","explore","accounts","direct","about","legal","privacy","terms","challenge","stories"]);
const MAX_RELATED_ACCOUNTS = 8;
const MAX_RELATED_POSTS = 30;

function json(payload, status = 200) { return Response.json(payload, { status }); }
const MAX_SCAN_MS = 110000;
const MAX_PROFILE_ACCOUNTS = 8;

async function fetchBounded(url, options = {}, timeoutMs = 7000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), Math.max(500, timeoutMs));
  try {
    return await fetch(url, { ...options, signal: controller.signal, redirect: "follow" });
  } finally {
    clearTimeout(timer);
  }
}
function env(name) { return Netlify.env.get(name); }

function authClient(token) {
  const url = env("SUPABASE_URL") || env("VITE_SUPABASE_URL");
  const key = env("SUPABASE_ANON_KEY") || env("VITE_SUPABASE_ANON_KEY");
  if (!url || !key) throw new Error("SUPABASE_PUBLIC_CONFIG_MISSING");
  return createClient(url, key, { global: { headers: { Authorization: `Bearer ${token}` } }, auth: { persistSession: false, autoRefreshToken: false } });
}
function serverSupabase() {
  const url = env("SUPABASE_URL") || env("VITE_SUPABASE_URL");
  const key = env("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !key) throw new Error("SUPABASE_SERVER_CONFIG_MISSING");
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}

function decode(value = "") {
  return value
    .replace(/\\u0026/g, "&").replace(/\\u003d/g, "=").replace(/\\u0025/g, "%")
    .replace(/&nbsp;/gi, " ").replace(/&amp;/gi, "&").replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'").replace(/&#x27;/gi, "'")
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16)))
    .replace(/\\n/g, " ").replace(/\\r/g, " ");
}

function clean(value = "") {
  return decode(String(value)).replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
}

function meta(html, key) {
  const a = new RegExp(`<meta[^>]+(?:property|name)=[\"']${key.replace(/[.*+?^${}()|[\\]\\\\]/g, "\\$&")}[\"'][^>]+content=[\"']([^\"']+)[\"'][^>]*>`, "i");
  const b = new RegExp(`<meta[^>]+content=[\"']([^\"']+)[\"'][^>]+(?:property|name)=[\"']${key.replace(/[.*+?^${}()|[\\]\\\\]/g, "\\$&")}[\"'][^>]*>`, "i");
  return clean(html.match(a)?.[1] || html.match(b)?.[1] || "");
}function extractImageUrls(html) {
  const urls = [];
  const add = (value) => {
    const url = decode(String(value || "")).trim();
    if (!/^https?:\/\//i.test(url)) return;
    const isInstagramCdn = /(?:fbcdn\.net|cdninstagram\.com|instagram\.com)/i.test(url);
    const looksLikeImage = /\.(?:jpe?g|png|webp|gif|heic|heif)(?:[?#]|$)/i.test(url);
    if (!isInstagramCdn && !looksLikeImage) return;
    urls.push(url);
  };
  add(meta(html, "og:image"));
  add(meta(html, "twitter:image"));
  for (const m of html.matchAll(/"display_url"\s*:\s*"([^"]+)"/gi)) add(m[1]);
  for (const m of html.matchAll(/"thumbnail_url"\s*:\s*"([^"]+)"/gi)) add(m[1]);
  return unique(urls).slice(0, 3);
}

function extractJsonObject(text) {
  const cleaned = String(text || "").replace(/^```(?:json)?/i, "").replace(/```$/i, "").trim();
  const start = cleaned.indexOf("{");
  const end = cleaned.lastIndexOf("}");
  if (start < 0 || end <= start) return null;
  try { return JSON.parse(cleaned.slice(start, end + 1)); } catch { return null; }
}

async function analyzeTournamentImage(imageUrl) {
  if (!imageUrl) return { poster: null, error: "POSTER_IMAGE_URL_MISSING" };

  // IMPORTANT: Poster extraction is intentionally NOT AI-powered.
  // AthleteN uses local OCR only. No OpenAI request, API key, model, or AI
  // credit is required for the Tournament Scanner.
  try {
    const response = await fetchBounded(imageUrl, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/154 Safari/537.36",
        "Referer": "https://www.instagram.com/",
        Accept: "image/jpeg,image/png,image/webp,image/*,*/*;q=0.8"
      }
    }, 10000);

    if (!response.ok) return { poster: null, error: `POSTER_IMAGE_HTTP_${response.status}` };

    const contentType = (response.headers.get("content-type") || "image/jpeg").split(";")[0].toLowerCase();
    const buffer = Buffer.from(await response.arrayBuffer());
    console.log("instagram-tournament-ocr-image", {
      contentType,
      bytes: buffer.length,
      imageUrl: imageUrl.slice(0, 180)
    });

    if (!buffer.length || buffer.length > 12 * 1024 * 1024) {
      return { poster: null, error: `POSTER_IMAGE_SIZE_INVALID_${buffer.length}` };
    }

    // Tesseract is deterministic OCR, not an OpenAI/LLM service.
    const { createWorker } = await import("tesseract.js");
    const worker = await createWorker("eng", 1, {
      logger: (message) => {
        if (message?.status === "recognizing text" && Number.isFinite(message.progress)) {
          console.log("instagram-tournament-ocr-progress", Math.round(message.progress * 100));
        }
      }
    });

    try {
      await worker.setParameters({
        preserve_interword_spaces: "1",
        tessedit_pageseg_mode: "11"
      });

      const result = await worker.recognize(buffer);
      const text = clean(result?.data?.text || "");

      if (!text) return { poster: null, error: "POSTER_OCR_NO_TEXT" };

      const poster = {
        poster_text: text,
        tournament_name: "",
        date_text: "",
        venue: "",
        city: "",
        state: "",
        country: "",
        organizer: "",
        host: "",
        sport: "",
        disciplines: [],
        events: [],
        categories: [],
        gender_categories: [],
        age_categories: [],
        weight_categories: [],
        eligibility: "",
        registration: "",
        registration_deadline: "",
        registration_link: "",
        fees: "",
        contact: "",
        phone: "",
        email: "",
        website: "",
        rules: "",
        scoring_system: "",
        competition_system: "",
        rounds: "",
        equipment: "",
        schedule: "",
        weigh_in: "",
        medals: "",
        prizes: "",
        accommodation: "",
        transport: "",
        documents: "",
        notices: [],
        highlights: [],
        hashtags: []
      };

      // Deterministic extraction from OCR text. No guessing.
      const lines = text.split(/\n+/).map((line) => clean(line)).filter(Boolean);
      const compactText = clean(text.replace(/\s+/g, " "));

      const firstMatch = (value, patterns) => {
        for (const pattern of patterns) {
          const match = String(value || "").match(pattern);
          if (match?.[1]) return clean(match[1]);
        }
        return "";
      };

      const championshipLines = lines.filter((line) => /championship|tournament|cup|open|memorial/i.test(line) && line.length >= 8);
      poster.tournament_name = championshipLines.sort((a, b) => b.length - a.length)[0] || firstMatch(compactText, [
        /((?:SHRI|SRI)\s+[A-Z0-9 &'’-]{3,120}?(?:OPEN|CUP|CHAMPIONSHIP|TOURNAMENT)[A-Z0-9 &'’-]{0,80})/i,
        /([A-Z0-9 &'’-]{4,120}(?:CHAMPIONSHIP|TOURNAMENT|CUP|OPEN)[A-Z0-9 &'’-]{0,80})/i
      ]);

      const reportingDate = firstMatch(compactText, [
        /(?:reporting\s+(?:time|date)|reporting)\s*[:\-]?\s*(?:\d{1,2}:\d{2}\s*(?:am|pm)?\s*\(?\s*)?(\d{1,2}(?:st|nd|rd|th)?\s+(?:jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\s*,?\s*20\d{2})/i
      ]);
      poster.reporting_date_text = reportingDate || "";

      const eventDateCandidates = [
        ...lines.filter((line) => /\b\d{1,2}(?:st|nd|rd|th)?\s*(?:&|and|to|[-–])\s*\d{1,2}(?:st|nd|rd|th)?\s+(?:jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)/i.test(line)),
        ...lines.filter((line) => /\b(?:date|dates?|event dates?)\b/i.test(line))
      ];
      poster.event_date_text = eventDateCandidates[0] || firstMatch(compactText, [
        /((?:\d{1,2}(?:st|nd|rd|th)?\s*(?:and|&|to|[-–])\s*)\d{1,2}(?:st|nd|rd|th)?\s+(?:jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\s*,?\s*20\d{2})/i,
        /((?:\d{1,2}(?:st|nd|rd|th)?\s*(?:and|&|to|[-–])\s*)\d{1,2}(?:st|nd|rd|th)?\s+(?:jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*)/i
      ]) || "";

      poster.date_text = poster.event_date_text || firstMatch(compactText, [
        /((?:\d{1,2}(?:st|nd|rd|th)?\s+(?:jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\s*,?\s*20\d{2}))/i
      ]) || "";

      poster.venue = firstMatch(compactText, [
        /\bVENUE\s*[:\-]?\s*(.+?)(?=\s+(?:REPORTING|REPORTING TIME|ABOUT THE CHAMPIONSHIP|DATE|DATES|REGISTRATION|CONTACT)\b|$)/i,
        /\b(?:VENUE|LOCATION)\s*[:\-]?\s*(.+?)(?=\s+(?:REPORTING|ABOUT|REGISTRATION|CONTACT)\b|$)/i
      ]) || lines.find((line) => /\b(venue|hall|stadium|indoor|ground|complex|academy|school|university)\b/i.test(line)) || "";

      poster.city = firstMatch(poster.venue, [/,\s*([A-Z][A-Za-z .'-]{2,60})(?:,\s*[A-Z][A-Za-z .'-]{2,60})?$/i]);

      poster.registration_deadline = firstMatch(compactText, [
        /(?:registration|entry)\s+(?:last date|deadline|closes?|closing)\s*[:=-]?\s*(.{3,120}?)(?=\s+(?:fee|fees|contact|venue|about)\b|$)/i,
        /(?:last date|deadline)\s*[:=-]?\s*(.{3,120}?)(?=\s+(?:fee|fees|contact|venue|about)\b|$)/i
      ]) || lines.find((line) => /registration.*(?:last|deadline|close|before)|last date/i.test(line)) || "";

      poster.fees = firstMatch(compactText, [
        /(?:registration|entry|participation)\s+fee[s]?\s*[:=-]?\s*([^.;|]{2,120})/i,
        /(?:fee|fees)\s*[:=-]?\s*([^.;|]{2,120})/i
      ]) || lines.find((line) => /(?:fee|fees|entry|registration)\s*[:=-]?\s*[₹rs]\.?\s*\d/i.test(line)) || "";

      poster.phone = firstMatch(compactText, [/((?:\+?91[ -]?)?\d{10})\b/]) || lines.find((line) => /(?:\+?91[ -]?)?\d{10}\b/.test(line)) || "";
      poster.email = firstMatch(compactText, [/([A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,})/i]) || lines.find((line) => /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i.test(line)) || "";
      poster.registration_link = firstMatch(compactText, [/(https?:\/\/[^\s]+|www\.[^\s]+|bit\.ly\/[^\s]+|forms?\.gle\/[^\s]+)/i]) || lines.find((line) => /https?:\/\/|www\.|bit\.ly|forms?\.gle/i.test(line)) || "";
      poster.website = poster.registration_link;

      poster.events = lines.filter((line) => /kyorugi|poomsae|poomse|fresher|cadet|junior|senior|sub[- ]?junior|under[- ]?\d|\bkg\b|\b\d+\s*kg\b/i.test(line)).slice(0, 30);
      poster.categories = poster.events.slice();
      poster.highlights = lines.filter((line) => /gold|silver|bronze|medal|prize|award|contact|register|registration|weigh|draw|schedule/i.test(line)).slice(0, 30);
      poster.hashtags = [...new Set((text.match(/#[A-Za-z0-9_]+/g) || []))];

      return { poster, error: "" };
    } finally {
      await worker.terminate();
    }
  } catch (error) {
    console.error("instagram-tournament-ocr-error", error?.stack || error?.message || error);
    return { poster: null, error: `POSTER_OCR_ERROR_${error?.message || "UNKNOWN"}` };
  }
}
function first(html, patterns) {
  for (const p of patterns) {
    const m = html.match(p);
    if (m?.[1]) return clean(m[1]);
  }
  return "";
}

function unique(values) { return [...new Set(values.filter(Boolean))]; }

function instagramAccounts(html, sourceUrl, caption) {
  const found = [];
  const add = (value) => {
    const username = String(value || "").replace(/^@/, "").trim().toLowerCase();
    if (!/^[a-z0-9._]{1,30}$/.test(username) || IG_PATHS_TO_IGNORE.has(username)) return;
    found.push(username);
  };
  for (const m of caption.matchAll(/@([a-zA-Z0-9._]{1,30})/g)) add(m[1]);
  for (const m of html.matchAll(/(?:https?:\/\/)?(?:www\.)?instagram\.com\/([a-zA-Z0-9._]{1,30})(?:[/?"'\s]|$)/gi)) add(m[1]);
  try { add(new URL(sourceUrl).pathname.split("/").filter(Boolean)[0]); } catch {}
  return unique(found).slice(0, MAX_RELATED_ACCOUNTS);
}

function captionFromInstagramShell(value) {
  let text = clean(value);
  text = text.replace(/^[^:]{0,180}\s+on\s+Instagram:\s*/i, "");
  const quoted = text.match(/[“"]([^“”"]{8,500})[”"]/);
  if (quoted?.[1]) text = quoted[1];
  return text.replace(/(?:\s+on\s+Instagram).*$/i, "").trim().slice(0, 4000);
}

function extractVisibleInstagramText(html) {
  const body = html.match(/<body[^>]*>([\s\S]*?)<\/body>/i)?.[1] || html;
  return clean(body).replace(/^(?:Instagram|Log in|Sign up|Create new account)\s*/i, "").slice(0, 8000);
}

function extractCaption(html) {
  const rawCandidates = [
    meta(html, "og:description"),
    meta(html, "twitter:description"),
    meta(html, "description"),
    first(html, [/"articleBody"\s*:\s*"((?:\\.|[^"])*)"/i]),
    first(html, [/"edge_media_to_caption"\s*:\s*\{\s*"edges"\s*:\s*\[\s*\{\s*"node"\s*:\s*\{\s*"text"\s*:\s*"((?:\\.|[^"])*)"/i]),
    first(html, [/"caption"\s*:\s*\{\s*"text"\s*:\s*"((?:\\.|[^"])*)"/i]),
    first(html, [/"caption"\s*:\s*"((?:\\.|[^"])*)"/i]),
    first(html, [/"text"\s*:\s*"((?:\\.|[^"])*)"/i]),
    extractVisibleInstagramText(html)
  ];
  const useful = rawCandidates.map(captionFromInstagramShell)
    .filter((value) => value && !/^(Instagram|Log in|Sign up|Create new account)$/i.test(value));
  const tournamentCandidates = useful.filter((value) => TOURNAMENT_WORDS.test(value));
  return tournamentCandidates.sort((a,b) => b.length-a.length)[0] || "";
}

function extractTitle(html, caption) {
  const rawTitle = meta(html, "og:title") || first(html, [/<title[^>]*>([\s\S]*?)<\/title>/i]);
  const cleanedTitle = captionFromInstagramShell(rawTitle);
  const combined = clean(`${cleanedTitle} ${caption}`);
  const named = combined.match(/\b([A-Z][A-Za-z0-9&' -]{2,100}\b(?:Cup|Championships?|Open|Games|Tournament))\b/);
  return named?.[1] ? named[1].trim().slice(0, 180) : "";
}

function extractDate(text, html) {
  const iso = first(html, [/"taken_at_timestamp"\s*:\s*(\d{9,12})/i, /"timestamp"\s*:\s*"([^"]+)"/i]);
  if (iso && /^\d{9,12}$/.test(iso)) return new Date(Number(iso) * 1000).toISOString().slice(0, 10);
  const patterns = [
    /(?:date|dates?|event|held|on)\s*[:\-]?\s*([A-Za-z]{3,12}\s+\d{1,2}(?:st|nd|rd|th)?(?:\s*[-–]\s*[A-Za-z]{3,12}\s+\d{1,2}(?:st|nd|rd|th)?)?\s*,?\s*\d{4})/i,
    /\b(\d{1,2}(?:st|nd|rd|th)?\s*(?:&|and|[-–])\s*\d{1,2}(?:st|nd|rd|th)?\s+[A-Za-z]{3,12}(?:\s+\d{4})?)\b/i,
    /\b(\d{1,2}(?:st|nd|rd|th)?\s+[A-Za-z]{3,12}(?:\s+\d{4})?)\b/i,
    /\b([A-Za-z]{3,12}\s+\d{1,2}(?:st|nd|rd|th)?(?:\s*(?:&|and|[-–])\s*\d{1,2}(?:st|nd|rd|th)?)?(?:\s+\d{4})?)\b/i,
    /\b(\d{1,2}[/-]\d{1,2}[/-]\d{4})\b/
  ];
  return first(text, patterns);
}

function toDatabaseDate(value) {
  const raw = clean(value).replace(/(\d{1,2})(st|nd|rd|th)\b/gi, "$1");
  if (!raw) return "";
  const iso = raw.match(/\b(\d{4}-\d{2}-\d{2})\b/);
  if (iso?.[1]) return iso[1];

  const dayFirst = raw.match(/\b(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})\b/);
  if (dayFirst) {
    const day = Number(dayFirst[1]);
    const month = Number(dayFirst[2]);
    const year = Number(dayFirst[3]);
    if (month >= 1 && month <= 12 && day >= 1 && day <= 31) {
      const date = new Date(Date.UTC(year, month - 1, day));
      if (date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day) {
        return date.toISOString().slice(0, 10);
      }
    }
  }

  const range = raw.match(/\b(\d{1,2})(?:st|nd|rd|th)?\s*(?:&|and|[-–])\s*(\d{1,2})(?:st|nd|rd|th)?\s+([A-Za-z]{3,12})\s+(\d{4})\b/i);
  if (range) {
    const monthNames = {
      jan: 0, january: 0, feb: 1, february: 1, mar: 2, march: 2, apr: 3, april: 3,
      may: 4, jun: 5, june: 5, jul: 6, july: 6, aug: 7, august: 7, sep: 8,
      sept: 8, september: 8, oct: 9, october: 9, nov: 10, november: 10, dec: 11, december: 11
    };
    const day = Number(range[1]);
    const month = monthNames[range[3].toLowerCase()];
    const year = Number(range[4]);
    if (month !== undefined && day >= 1 && day <= 31 && year >= 2000 && year <= 2100) {
      const date = new Date(Date.UTC(year, month, day));
      if (date.getUTCFullYear() === year && date.getUTCMonth() === month && date.getUTCDate() === day) {
        return date.toISOString().slice(0, 10);
      }
    }
  }

  const monthFirst = raw.match(/\b([A-Za-z]{3,12})\s+(\d{1,2})(?:\s*,?\s*|\s+)(\d{4})\b/i);
  const dayFirstText = raw.match(/\b(\d{1,2})\s+([A-Za-z]{3,12})\s+(\d{4})\b/i);
  const match = monthFirst || dayFirstText;
  if (match) {
    const monthNames = {
      jan: 0, january: 0, feb: 1, february: 1, mar: 2, march: 2, apr: 3, april: 3,
      may: 4, jun: 5, june: 5, jul: 6, july: 6, aug: 7, august: 7, sep: 8,
      sept: 8, september: 8, oct: 9, october: 9, nov: 10, november: 10, dec: 11, december: 11
    };
    const firstPart = match[1].toLowerCase();
    const secondPart = match[2];
    const year = Number(match[3]);
    const month = monthNames[firstPart];
    const day = Number(secondPart);
    if (month !== undefined && Number.isInteger(day) && day >= 1 && day <= 31 && year >= 2000 && year <= 2100) {
      const date = new Date(Date.UTC(year, month, day));
      if (date.getUTCFullYear() === year && date.getUTCMonth() === month && date.getUTCDate() === day) {
        return date.toISOString().slice(0, 10);
      }
    }
  }

  return "";
}

function field(text, patterns) { return first(text, patterns).slice(0, 500); }

function extractFacts(caption, title, sourceUrl) {
  const text = clean(`${title} ${caption}`);
  const dateText = extractDate(text, "");
  const date = toDatabaseDate(dateText);
  const organizer = field(text, [/(?:organizer|organiser|organized by|organised by|hosted by|promoted by)\s*[:\-]?\s*([^.;|\n]{3,180})/i]);
  const venue = field(text, [/(?:venue|location|host venue|held at|taking place at|conducted at)\s*[:\-]?\s*([^.;|\n]{3,180}?)(?=\s+(?:date|dates?)\s*[-:]|\s+#|$)/i, /(?:venue|location|host venue|held at|taking place at|conducted at)\s*[:\-]?\s*([^.;|\n]{3,180})/i]);
  const locationHint = field(text, [/(?:in|at)\s+([A-Z][A-Za-z .'-]{2,80})\s+is\s+(?:ready|set)/i]);
  const registrationText = field(text, [/(?:registration|entry)\s+(?:deadline|closes?|closing|last date)\s*[:\-]?\s*([^.;|\n]{3,180})/i, /(?:deadline|last date)\s*[:\-]?\s*([^.;|\n]{3,180})/i]);
  const registration = toDatabaseDate(registrationText);
  const fees = field(text, [/(?:registration|entry|participation)\s+fee[s]?\s*[:\-]?\s*([^.;|\n]{2,120})/i, /(?:fee|fees)\s*[:\-]?\s*([^.;|\n]{2,120})/i]);
  const categories = field(text, [/(?:age|weight|category|categories|division|divisions|cadet|junior|senior)[^.;|\n]{0,360}/i]);
  const contact = field(text, [/(?:contact|helpline|phone|email|e-?mail)\s*[:\-]?\s*([^.;|\n]{4,220})/i]);
  const registrationLink = (text.match(/https?:\/\/[^\s)]+/i) || [])[0] || "";
  return {
    tournament_name: title || "",
    tournament_date: date || "",
    tournament_date_text: dateText || "",
    venue: venue || "",
    location_hint: locationHint || "",
    registration_deadline: registration || "",
    registration_deadline_text: registrationText || "",
    categories: categories || "",
    fees: fees || "",
    organizer: organizer || "",
    contact: contact || "",
    registration_link: registrationLink || "",
    source_url: sourceUrl
  };
}

function mediaFromHtml(html, fallbackUrl) {
  const posts = [];
  const seen = new Set();
  const add = (caption, permalink = "", timestamp = "") => {
    const c = clean(caption);
    if (!c || !TOURNAMENT_WORDS.test(c)) return;
    const key = `${permalink}|${c.slice(0,160)}`;
    if (seen.has(key)) return;
    seen.add(key);
    posts.push({ id: createHash("sha1").update(key).digest("hex"), caption: c.slice(0, 2000), permalink: permalink || fallbackUrl, timestamp: timestamp || null, media_product_type: /reel/i.test(permalink) ? "REELS" : "FEED" });
  };
  for (const m of html.matchAll(/"caption"\s*:\s*"((?:\\.|[^"])*)"/gi)) add(m[1]);
  for (const m of html.matchAll(/"text"\s*:\s*"((?:\\.|[^"])*)"/gi)) add(m[1]);
  for (const m of html.matchAll(/https?:\/\/www\.instagram\.com\/(?:p|reel)\/([a-zA-Z0-9_-]+)[^"\s]*/gi)) add(extractCaption(html), m[0]);
  return posts.slice(0, MAX_RELATED_POSTS);
}

async function fetchInstagram(url) {
  const headers = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/154 Safari/537.36",
    Accept: "text/html,application/xhtml+xml,application/json;q=0.9,*/*;q=0.8",
    "Accept-Language": "en-US,en;q=0.9",
    Referer: "https://www.instagram.com/"
  };

  const candidates = [{ url, kind: "html" }];
  try {
    const parsed = new URL(url);
    const match = parsed.pathname.match(/^\/(p|reel)\/([A-Za-z0-9_-]+)/i);
    if (match) {
      const permalink = `https://www.instagram.com/${match[1].toLowerCase()}/${match[2]}/`;
      const encoded = encodeURIComponent(permalink);
      candidates.push({ url: `${permalink}embed/captioned/`, kind: "html" });
      candidates.push({ url: `${permalink}embed/`, kind: "html" });
      candidates.push({ url: `${permalink}?__a=1&__d=dis`, kind: "json" });
      candidates.push({ url: `https://api.instagram.com/oembed/?url=${encoded}`, kind: "oembed" });
      candidates.push({ url: `https://www.instagram.com/api/v1/oembed/?url=${encoded}`, kind: "oembed" });
    }
  } catch {}

  let lastStatus = 0;
  const useful = [];

  for (const candidate of candidates) {
    try {
      const response = await fetchBounded(candidate.url, { headers }, 7000);
      lastStatus = response.status;
      if (!response.ok) continue;

      const contentType = response.headers.get("content-type") || "";
      if (candidate.kind === "oembed" || candidate.kind === "json" || /json/i.test(contentType)) {
        const data = await response.json().catch(() => null);
        const title = clean(data?.title || data?.graphql?.shortcode_media?.title || "");
        const author = clean(data?.author_name || data?.graphql?.shortcode_media?.owner?.username || "");
        const captionText = clean(
          data?.caption?.text ||
          data?.graphql?.shortcode_media?.edge_media_to_caption?.edges?.[0]?.node?.text ||
          data?.graphql?.xdt_shortcode_media?.edge_media_to_caption?.edges?.[0]?.node?.text ||
          ""
        );
        const embed = clean(data?.html || "");
        const imageUrl = clean(
          data?.thumbnail_url ||
          data?.display_url ||
          data?.graphql?.shortcode_media?.display_url ||
          data?.graphql?.shortcode_media?.thumbnail_src ||
          data?.graphql?.xdt_shortcode_media?.display_url ||
          ""
        );
        const escaped = (value) => String(value || "")
          .replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
        const syntheticHtml = [
          `<meta property="og:title" content="${escaped(title || author)}">`,
          `<meta property="og:description" content="${escaped(captionText || title)}">`,
          `<meta name="twitter:description" content="${escaped(captionText || title)}">`,
          `<meta name="description" content="${escaped(captionText || title)}">`,
          imageUrl ? `<meta property="og:image" content="${escaped(imageUrl)}">` : "",
          embed
        ].join(" ");
        if (captionText || title || author || embed || imageUrl) useful.push({ html: syntheticHtml, finalUrl: url });
        continue;
      }

      const html = await response.text();
      const candidateCaption = extractCaption(html);
      const candidateTitle = extractTitle(html, candidateCaption);
      const visible = clean(`${candidateTitle} ${candidateCaption}`);
      const hasTournament = TOURNAMENT_WORDS.test(visible);
      const hasImage = extractImageUrls(html).length > 0;
      const hasUsefulInstagramData = hasTournament || hasImage || /@([a-z0-9._]{1,30})/i.test(visible);
      if (hasUsefulInstagramData) useful.push({ html, finalUrl: response.url || candidate.url });
    } catch (error) {
      if (error?.name !== "AbortError") console.error("instagram-source-fetch", candidate.url, error?.message || error);
    }
  }

  if (!useful.length) throw new Error(`INSTAGRAM_HTTP_${lastStatus || 502}`);

  // Merge the successful public representations. This prevents a login shell
  // or sparse HTML response from hiding caption/image data available in an
  // embed or oEmbed representation.
  const merged = useful.slice(0, 5).map((item) => item.html).join("\n");
  const finalUrl = useful[0]?.finalUrl || url;
  return { html: merged, finalUrl };
}
async function scanPublicSource(sourceUrl) {
  const startedAt = Date.now();
  const deadline = startedAt + MAX_SCAN_MS;
  const parsedSource = new URL(sourceUrl);
  const canonicalSourceUrl = (() => {
    const parts = parsedSource.pathname.split("/").filter(Boolean);
    if ((parts[0] || "").toLowerCase() === "p" && parts[1]) return `https://www.instagram.com/p/${parts[1]}/`;
    if ((parts[0] || "").toLowerCase() === "reel" && parts[1]) return `https://www.instagram.com/reel/${parts[1]}/`;
    return parsedSource.toString();
  })();

  const root = await fetchInstagram(canonicalSourceUrl);
  const caption = extractCaption(root.html);
  const title = extractTitle(root.html, caption);
  const rawVisibleText = extractVisibleInstagramText(root.html);
  const imageUrls = extractImageUrls(root.html);

  // The source itself is always preserved. AI enhancement must never replace
  // or erase information that Instagram already exposed.
  let poster = null;
  let posterAnalysisError = "";
  let analyzedPosterImageUrl = "";

  for (const imageUrl of imageUrls.slice(0, 2)) {
    if (Date.now() >= deadline - 25000) break;
    const analysis = await analyzeTournamentImage(imageUrl);
    posterAnalysisError = analysis?.error || posterAnalysisError;
    if (analysis?.poster) {
      poster = analysis.poster;
      analyzedPosterImageUrl = imageUrl;
      break;
    }
  }

  const posterText = clean(poster?.poster_text || "");
  const posterFactsText = clean([
    poster?.tournament_name, poster?.date_text, poster?.venue, poster?.sport, poster?.organizer,
    poster?.registration, poster?.fees,
    ...(Array.isArray(poster?.disciplines) ? poster.disciplines : []),
    ...(Array.isArray(poster?.events) ? poster.events : []),
    ...(Array.isArray(poster?.categories) ? poster.categories : []),
    ...(Array.isArray(poster?.highlights) ? poster.highlights : [])
  ].filter(Boolean).join("\n"));

  const facts = extractFacts(caption, title, canonicalSourceUrl);
  if (poster?.tournament_name) facts.tournament_name = clean(poster.tournament_name);
  if (!facts.tournament_date_text && poster?.date_text) {
    facts.tournament_date_text = clean(poster.date_text);
    facts.tournament_date = toDatabaseDate(poster.date_text) || facts.tournament_date;
  }
  if (poster?.venue) facts.venue = clean(poster.venue);
  if (!facts.location_hint && poster?.city) facts.location_hint = clean(poster.city);
  if (!facts.organizer && poster?.organizer) facts.organizer = clean(poster.organizer);
  if (!facts.organizer && poster?.host) facts.organizer = clean(poster.host);
  if (poster?.fees) facts.fees = clean(poster.fees);
  if (Array.isArray(poster?.events) && poster.events.length) facts.categories = poster.events.filter(Boolean).join(", ");
  else if (Array.isArray(poster?.categories) && poster.categories.length) facts.categories = poster.categories.filter(Boolean).join(", ");
  if (!facts.tournament_name && caption) {
    const headline = caption.split(/(?:\n|[.!?])+/).map((part) => clean(part))
      .find((part) => TOURNAMENT_WORDS.test(part) && part.length >= 8 && part.length <= 180);
    if (headline) facts.tournament_name = headline;
  }

  const accounts = instagramAccounts(root.html, root.finalUrl, caption);
  const accountResults = [];
  if (!facts.organizer && accounts[0]) facts.organizer = `@${accounts[0]}`;
  const relatedPosts = mediaFromHtml(root.html, root.finalUrl);

  // Check discovered accounts in parallel instead of serially. This is the
  // "other things" pass: mentions, source account, tagged Instagram URLs and
  // accessible profile pages are inspected within the hard time budget.
  const profileTargets = accounts.slice(0, MAX_PROFILE_ACCOUNTS);
  const profileResults = await Promise.allSettled(profileTargets.map(async (username) => {
    if (Date.now() >= deadline - 10000) return null;
    const profileUrl = `https://www.instagram.com/${username}/`;
    try {
      const page = await fetchBounded(profileUrl, { headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/154 Safari/537.36",
        Accept: "text/html,application/xhtml+xml,application/json;q=0.9,*/*;q=0.8",
        "Accept-Language": "en-US,en;q=0.9",
        Referer: "https://www.instagram.com/"
      }}, 6500);
      if (!page.ok) return null;
      const html = await page.text();
      const profileCaption = extractCaption(html);
      const profileTitle = extractTitle(html, profileCaption);
      const profilePosts = mediaFromHtml(html, profileUrl);
      return { username, url: profileUrl, posts: profilePosts.slice(0, 10), relevant: profilePosts.length > 0, title: profileTitle || null };
    } catch {
      return null;
    }
  }));
  for (const result of profileResults) {
    if (result.status === "fulfilled" && result.value) {
      accountResults.push(result.value);
      relatedPosts.push(...result.value.posts);
    }
  }

  const uniquePosts = [...new Map(relatedPosts.map((p) => [p.id, p])).values()]
    .filter((p) => TOURNAMENT_WORDS.test(p.caption)).slice(0, MAX_RELATED_POSTS);

  const allText = [title, caption, rawVisibleText, posterFactsText, posterText, ...uniquePosts.map((p) => p.caption)].filter(Boolean).join("\n");
  const allFacts = extractFacts(caption, title, canonicalSourceUrl);
  if (poster?.tournament_name) allFacts.tournament_name = clean(poster.tournament_name);
  if (!allFacts.tournament_date_text && poster?.date_text) {
    allFacts.tournament_date_text = clean(poster.date_text);
    allFacts.tournament_date = toDatabaseDate(poster.date_text) || allFacts.tournament_date;
  }
  if (poster?.venue) allFacts.venue = clean(poster.venue);
  if (!allFacts.location_hint && poster?.city) allFacts.location_hint = clean(poster.city);
  if (!allFacts.organizer && poster?.organizer) allFacts.organizer = clean(poster.organizer);
  if (!allFacts.organizer && poster?.host) allFacts.organizer = clean(poster.host);
  if (poster?.fees) allFacts.fees = clean(poster.fees);
  if (Array.isArray(poster?.events) && poster.events.length) allFacts.categories = poster.events.filter(Boolean).join(", ");
  else if (Array.isArray(poster?.categories) && poster.categories.length) allFacts.categories = poster.categories.filter(Boolean).join(", ");
  if (!allFacts.tournament_name && caption) {
    const headline = caption.split(/(?:\n|[.!?])+/).map((part) => clean(part))
      .find((part) => TOURNAMENT_WORDS.test(part) && part.length >= 8 && part.length <= 180);
    if (headline) allFacts.tournament_name = headline;
  }
  if (!allFacts.organizer && accounts[0]) allFacts.organizer = `@${accounts[0]}`;
  if (!allFacts.tournament_name || !TOURNAMENT_WORDS.test(allText)) throw new Error("NO_TOURNAMENT_CONTENT");

  const hash = createHash("sha256").update(allText).digest("hex");
  return {
    scan: {
      source_url: canonicalSourceUrl,
      tournament_name: allFacts.tournament_name,
      tournament_date: allFacts.tournament_date || null,
      venue: allFacts.venue || null,
      registration_deadline: allFacts.registration_deadline || null,
      categories: allFacts.categories || null,
      notices: null,
      schedules_results: null,
      status: "checked",
      detected_changes: "New scan; compare this source again to detect content changes.",
      details: {
        description: caption || rawVisibleText || null,
        fields: {
          organizer: allFacts.organizer,
          location_hint: allFacts.location_hint,
          tournament_date_text: allFacts.tournament_date_text,
          registration_deadline_text: allFacts.registration_deadline_text,
          fees: allFacts.fees,
          contact: allFacts.contact,
          registration_link: allFacts.registration_link,
          discovered_accounts: accountResults.map((a) => `@${a.username}`).join(", "),
          relevant_posts_found: String(uniquePosts.length),
          image_analyzed: poster ? "Yes" : "No",
          poster_analysis_status: poster ? "Poster image successfully analyzed." : (posterAnalysisError || "Poster image could not be analyzed."),
          poster_image: analyzedPosterImageUrl || imageUrls[0] || "",
          poster_sport: clean(poster?.sport || ""),
          poster_disciplines: Array.isArray(poster?.disciplines) ? poster.disciplines.join(", ") : "",
          poster_events: Array.isArray(poster?.events) ? poster.events.join(", ") : "",
          poster_highlights: Array.isArray(poster?.highlights) ? poster.highlights.join(" | ") : "",
          poster_text: posterText,
          poster_city: clean(poster?.city || ""),
          poster_state: clean(poster?.state || ""),
          poster_country: clean(poster?.country || ""),
          poster_host: clean(poster?.host || ""),
          poster_age_categories: Array.isArray(poster?.age_categories) ? poster.age_categories.join(", ") : "",
          poster_weight_categories: Array.isArray(poster?.weight_categories) ? poster.weight_categories.join(", ") : "",
          poster_gender_categories: Array.isArray(poster?.gender_categories) ? poster.gender_categories.join(", ") : "",
          poster_eligibility: clean(poster?.eligibility || ""),
          poster_registration: clean(poster?.registration || ""),
          poster_registration_deadline: clean(poster?.registration_deadline || ""),
          poster_registration_link: clean(poster?.registration_link || ""),
          poster_contact: clean(poster?.contact || ""),
          poster_phone: clean(poster?.phone || ""),
          poster_email: clean(poster?.email || ""),
          poster_website: clean(poster?.website || ""),
          poster_rules: clean(poster?.rules || ""),
          poster_scoring_system: clean(poster?.scoring_system || ""),
          poster_competition_system: clean(poster?.competition_system || ""),
          poster_rounds: clean(poster?.rounds || ""),
          poster_equipment: clean(poster?.equipment || ""),
          poster_schedule: clean(poster?.schedule || ""),
          poster_weigh_in: clean(poster?.weigh_in || ""),
          poster_medals: clean(poster?.medals || ""),
          poster_prizes: clean(poster?.prizes || ""),
          poster_accommodation: clean(poster?.accommodation || ""),
          poster_transport: clean(poster?.transport || ""),
          poster_documents: clean(poster?.documents || ""),
          poster_notices: Array.isArray(poster?.notices) ? poster.notices.join(" | ") : "",
          poster_hashtags: Array.isArray(poster?.hashtags) ? poster.hashtags.join(" ") : "",
          raw_source_text: rawVisibleText || caption || "",
          source_caption: caption || "",
          source_image_count: String(imageUrls.length),
          scan_elapsed_seconds: ((Date.now() - startedAt) / 1000).toFixed(1)
        },
        headings: [],
        sections: [
          ...(rawVisibleText ? [{ title: "Source text exactly as accessible", content: rawVisibleText, source_url: canonicalSourceUrl }] : []),
          ...(caption && caption !== rawVisibleText ? [{ title: "Instagram caption", content: caption, source_url: canonicalSourceUrl }] : []),
          ...(posterText ? [{ title: "Tournament poster information", content: posterText, source_url: analyzedPosterImageUrl || imageUrls[0] || root.finalUrl }] : []),
          ...uniquePosts.map((p) => ({ title: "Relevant Instagram post/reel", content: p.caption, source_url: p.permalink }))
        ],
        key_highlights: [
          ...(Array.isArray(poster?.highlights) ? poster.highlights.filter(Boolean).map(String) : []),
          ...uniquePosts.map((p) => p.caption.slice(0, 500))
        ],
        pages_scanned: 1 + accountResults.length,
        source_pages: [canonicalSourceUrl, ...accountResults.map((a) => a.url)],
        pdfs: []
      }
    },
    related_accounts: accountResults,
    relevant_posts: uniquePosts,
    source_hash: hash
  };
}
export default async function handler(request) {
  if (request.method !== "POST") return json({ error: "Method not allowed." }, 405);
  const accessToken = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  if (!accessToken) return json({ error: "Please sign in before scanning." }, 401);
  let user;
  try {
    const client = authClient(accessToken);
    const result = await client.auth.getUser(accessToken);
    user = result.data?.user;
  } catch {}
  if (!user) return json({ error: "Please sign in again before scanning." }, 401);

  const body = await request.json().catch(() => ({}));
  const sourceUrl = String(body.sourceUrl || "").trim();
  let parsed;
  try { parsed = new URL(sourceUrl); } catch { return json({ error: "Enter a valid Instagram post, reel, or profile URL." }, 400); }
  if (!/(^|\.)instagram\.com$/i.test(parsed.hostname)) return json({ error: "Only Instagram sources are supported here." }, 400);

  try {
    const result = await scanPublicSource(sourceUrl);
    const admin = serverSupabase();
    const { data: existing } = await admin.from("tournament_scans")
      .select("source_hash,last_checked_at")
      .eq("user_id", user.id)
      .eq("source_url", result.scan.source_url)
      .maybeSingle();
    const changed = existing?.source_hash
      ? (existing.source_hash === result.source_hash
        ? "No change detected since the previous Instagram scan."
        : "NEW/CHANGED: the Instagram source or discovered tournament content changed since the previous scan.")
      : "NEW: first scan of this Instagram tournament source.";
    result.scan.detected_changes = changed;
    result.scan.last_checked_at = new Date().toISOString();
    result.scan.next_check_at = new Date(Date.now() + 12 * 60 * 60 * 1000).toISOString();
    const { data: saved, error: saveError } = await admin.from("tournament_scans").upsert({
      user_id: user.id,
      source_url: result.scan.source_url,
      tournament_name: result.scan.tournament_name || null,
      tournament_date: result.scan.tournament_date || null,
      venue: result.scan.venue || null,
      registration_deadline: result.scan.registration_deadline || null,
      categories: result.scan.categories || null,
      notices: result.scan.notices || null,
      schedules_results: result.scan.schedules_results || null,
      details: result.scan.details,
      status: result.scan.status,
      detected_changes: changed,
      source_hash: result.source_hash,
      last_checked_at: result.scan.last_checked_at,
      next_check_at: result.scan.next_check_at
    }, { onConflict: "user_id,source_url" }).select().single();
    if (saveError) {
      console.error("instagram-tournament-scan save", saveError);
      throw new Error(`SCAN-SAVE-500: The scan was completed but could not be saved. ${saveError.message || "Database save failed."}`);
    }
    if (!saved) throw new Error("SCAN-SAVE-500: The scan completed but no saved scan record was returned.");
    result.scan = saved;
    return json({ ...result, saved: true });
  } catch (error) {
    const rawMessage = String(error?.message || error || "Unknown scanner error");
    console.error("instagram-tournament-scan", rawMessage);
    console.error("instagram-tournament-scan stack", error?.stack || "no stack");
    const isNoContent = rawMessage === "NO_TOURNAMENT_CONTENT";
    const isBlocked = /^INSTAGRAM_HTTP_/.test(rawMessage);
    const isSaveError = rawMessage.startsWith("SCAN-SAVE-500:");
    const code = isSaveError ? "SCAN-SAVE-500" : isNoContent ? "IG-SCAN-204" : isBlocked ? "IG-SCAN-502" : "IG-SCAN-500";
    const message = isSaveError
      ? "The tournament scan completed, but AthleteN could not save the result."
      : isNoContent
        ? "No tournament-related content was accessible in this Instagram source."
        : isBlocked
          ? "Instagram did not provide readable public content for this source. Try a public post/reel that is viewable without login."
          : "The scanner hit an unexpected processing error. The server log contains the exact cause.";
    return json({
      error: message + " Error code: " + code + ". Contact NovaCode at novacode.create@gmail.com, send a message in AthleteN, or use Problem/Feedback."
    }, isSaveError ? 500 : isNoContent ? 204 : 502);
  }}
