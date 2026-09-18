import { createHash } from "node:crypto";
import { createClient } from "@supabase/supabase-js";

const TOURNAMENT_WORDS = /(taekwondo|tournament|championship|championships|open|cup|games|kyorugi|poomsae|registration|weigh[- ]?in|draw|fixture|entry|medal|cadet|junior|senior|rules|scoring|PSS|protector|venue|schedule|fee|accommodation|transport|results?|competition|state|national)/i;
const IG_PATHS_TO_IGNORE = new Set(["p","reel","reels","explore","accounts","direct","about","legal","privacy","terms","challenge","stories"]);
const MAX_RELATED_ACCOUNTS = 8;
const MAX_RELATED_POSTS = 30;

function json(payload, status = 200) { return Response.json(payload, { status }); }
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
    .replace(/\\n/g, " ").replace(/\\r/g, " ");
}

function clean(value = "") {
  return decode(String(value)).replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
}

function meta(html, key) {
  const a = new RegExp(`<meta[^>]+(?:property|name)=[\"']${key.replace(/[.*+?^${}()|[\\]\\\\]/g, "\\$&")}[\"'][^>]+content=[\"']([^\"']+)[\"'][^>]*>`, "i");
  const b = new RegExp(`<meta[^>]+content=[\"']([^\"']+)[\"'][^>]+(?:property|name)=[\"']${key.replace(/[.*+?^${}()|[\\]\\\\]/g, "\\$&")}[\"'][^>]*>`, "i");
  return clean(html.match(a)?.[1] || html.match(b)?.[1] || "");
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

function extractCaption(html) {
  const candidates = [
    meta(html, "og:description"),
    meta(html, "description"),
    first(html, [/"edge_media_to_caption"\s*:\s*\{\s*"edges"\s*:\s*\[\s*\{\s*"node"\s*:\s*\{\s*"text"\s*:\s*"((?:\\\\.|[^"])*)"/i]),
    first(html, [/"caption"\s*:\s*\{\s*"text"\s*:\s*"((?:\\\\.|[^"])*)"/i]),
    first(html, [/"caption"\s*:\s*"((?:\\\\.|[^"])*)"/i]),
    first(html, [/"text"\s*:\s*"((?:\\\\.|[^"])*)"/i])
  ];
  const useful = candidates.map(clean).filter(Boolean);
  return useful.find((v) => TOURNAMENT_WORDS.test(v)) || useful.sort((p, q) => q.length - p.length)[0] || "";
}

function extractTitle(html, caption) {
  const title = meta(html, "og:title") || first(html, [/<title[^>]*>([\s\S]*?)<\/title>/i]);
  const fromInstagram = title.replace(/\s+on Instagram:?.*$/i, "").trim();
  if (fromInstagram && !/^(Instagram|Log in|Sign up)/i.test(fromInstagram)) return fromInstagram.slice(0, 180);
  const line = caption.split(/\n|\r|[.!?]/).map((x) => x.trim()).find((x) => TOURNAMENT_WORDS.test(x));
  return (line || "").slice(0, 180);
}

function extractDate(text, html) {
  const iso = first(html, [/"taken_at_timestamp"\s*:\s*(\d{9,12})/i, /"timestamp"\s*:\s*"([^"]+)"/i]);
  if (iso && /^\d{9,12}$/.test(iso)) return new Date(Number(iso) * 1000).toISOString().slice(0, 10);
  const patterns = [
    /(?:date|dates?|event|held|on)\s*[:\-]?\s*([A-Za-z]{3,12}\s+\d{1,2}(?:st|nd|rd|th)?(?:\s*[-–]\s*[A-Za-z]{3,12}\s+\d{1,2}(?:st|nd|rd|th)?)?\s*,?\s*\d{4})/i,
    /\b(\d{1,2}\s+[A-Za-z]{3,12}\s+\d{4})\b/i,
    /\b(\d{1,2}[/-]\d{1,2}[/-]\d{4})\b/
  ];
  return first(text, patterns);
}

function field(text, patterns) { return first(text, patterns).slice(0, 500); }

function extractFacts(caption, title, sourceUrl) {
  const text = clean(`${title} ${caption}`);
  const date = extractDate(text, "");
  const organizer = field(text, [/(?:organizer|organiser|organized by|organised by|hosted by|promoted by)\s*[:\-]?\s*([^.;|\n]{3,180})/i]);
  const venue = field(text, [/(?:venue|location|host venue|held at|at)\s*[:\-]?\s*([^.;|\n]{3,180})/i]);
  const registration = field(text, [/(?:registration|entry)\s+(?:deadline|closes?|closing|last date)\s*[:\-]?\s*([^.;|\n]{3,180})/i, /(?:deadline|last date)\s*[:\-]?\s*([^.;|\n]{3,180})/i]);
  const fees = field(text, [/(?:registration|entry|participation)\s+fee[s]?\s*[:\-]?\s*([^.;|\n]{2,120})/i, /(?:fee|fees)\s*[:\-]?\s*([^.;|\n]{2,120})/i]);
  const categories = field(text, [/(?:age|weight|category|categories|division|divisions|cadet|junior|senior)[^.;|\n]{0,360}/i]);
  const contact = field(text, [/(?:contact|helpline|phone|email|e-?mail)\s*[:\-]?\s*([^.;|\n]{4,220})/i]);
  const registrationLink = (text.match(/https?:\/\/[^\s)]+/i) || [])[0] || "";
  return {
    tournament_name: title || "",
    tournament_date: date || "",
    venue: venue || "",
    registration_deadline: registration || "",
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
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/140 Safari/537.36",
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
      candidates.push({ url: `https://api.instagram.com/oembed/?url=${encoded}`, kind: "oembed" });
      candidates.push({ url: `https://www.instagram.com/api/v1/oembed/?url=${encoded}`, kind: "oembed" });
    }
  } catch {}

  let lastStatus = 0;
  for (const candidate of candidates) {
    try {
      const response = await fetch(candidate.url, { redirect: "follow", headers });
      lastStatus = response.status;
      if (!response.ok) continue;

      const contentType = response.headers.get("content-type") || "";
      if (candidate.kind === "oembed" || /json/i.test(contentType)) {
        const data = await response.json().catch(() => null);
        const title = clean(data?.title || "");
        const author = clean(data?.author_name || "");
        const embed = clean(data?.html || "");
        if (!title && !author && !embed) continue;
        const escaped = (value) => String(value || "")
          .replace(/&/g, "&amp;")
          .replace(/"/g, "&quot;")
          .replace(/</g, "&lt;")
          .replace(/>/g, "&gt;");
        const syntheticHtml = [
          `<meta property="og:title" content="${escaped(title || author)}">`,
          `<meta property="og:description" content="${escaped(title)}">`,
          `<meta name="description" content="${escaped(title)}">`,
          embed
        ].join(" ");
        if (TOURNAMENT_WORDS.test(title) || TOURNAMENT_WORDS.test(embed)) {
          return { html: syntheticHtml, finalUrl: url };
        }
        continue;
      }

      const html = await response.text();
      const candidateCaption = extractCaption(html);
      const candidateTitle = extractTitle(html, candidateCaption);
      const visible = clean(`${candidateTitle} ${candidateCaption}`);

      // Instagram can return a successful HTTP response containing only a
      // login/challenge shell. Do not stop there; continue to the embed/oEmbed
      // fallbacks so a public tournament caption can still be recovered.
      if (TOURNAMENT_WORDS.test(visible)) {
        return { html, finalUrl: response.url || candidate.url };
      }
    } catch {}
  }

  throw new Error(`INSTAGRAM_HTTP_${lastStatus || 502}`);
}

async function scanPublicSource(sourceUrl) {
  const root = await fetchInstagram(sourceUrl);
  const caption = extractCaption(root.html);
  const title = extractTitle(root.html, caption);
  const facts = extractFacts(caption, title, root.finalUrl);
  const accounts = instagramAccounts(root.html, root.finalUrl, caption);
  const relatedPosts = mediaFromHtml(root.html, root.finalUrl);
  const accountResults = [];
  for (const username of accounts.slice(0, MAX_RELATED_ACCOUNTS)) {
    if (username === accounts[0] && !caption.includes("@")) continue;
    try {
      const profileUrl = `https://www.instagram.com/${username}/`;
      const page = await fetchInstagram(profileUrl);
      const profileCaption = extractCaption(page.html);
      const profileTitle = extractTitle(page.html, profileCaption);
      const profilePosts = mediaFromHtml(page.html, profileUrl);
      accountResults.push({ username, url: profileUrl, posts: profilePosts.slice(0, 10), relevant: profilePosts.length > 0, title: profileTitle || null });
      for (const post of profilePosts) relatedPosts.push(post);
    } catch {}
  }
  const uniquePosts = [...new Map(relatedPosts.map((p) => [p.id, p])).values()].filter((p) => TOURNAMENT_WORDS.test(p.caption)).slice(0, MAX_RELATED_POSTS);
  const allText = [title, caption, ...uniquePosts.map((p) => p.caption)].join("\n");
  const allFacts = extractFacts(caption, title, root.finalUrl);
  if (!allFacts.tournament_name || !TOURNAMENT_WORDS.test(allText)) throw new Error("NO_TOURNAMENT_CONTENT");
  const hash = createHash("sha256").update(allText).digest("hex");
  return {
    scan: {
      source_url: root.finalUrl,
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
        description: caption || null,
        fields: {
          organizer: allFacts.organizer,
          fees: allFacts.fees,
          contact: allFacts.contact,
          registration_link: allFacts.registration_link,
          discovered_accounts: accountResults.map((a) => `@${a.username}`).join(", "),
          relevant_posts_found: String(uniquePosts.length)
        },
        headings: [],
        sections: uniquePosts.map((p) => ({ title: "Relevant Instagram post/reel", content: p.caption, source_url: p.permalink })),
        key_highlights: uniquePosts.map((p) => p.caption.slice(0, 500)),
        pages_scanned: 1 + accountResults.length,
        source_pages: [root.finalUrl, ...accountResults.map((a) => a.url)],
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
    if (saveError) console.error("instagram-tournament-scan save", saveError);
    if (saved) result.scan = saved;
    return json(result);
  } catch (error) {
    console.error("instagram-tournament-scan", error?.message || error);
    const isNoContent = error?.message === "NO_TOURNAMENT_CONTENT";
    const code = isNoContent ? "IG-SCAN-204" : "IG-SCAN-502";
    const message = isNoContent
      ? "No tournament-related content was accessible in this Instagram source."
      : "Instagram content could not be read from this source. Instagram may require login or block automated access.";
    return json({
      error: `${message} Error code: ${code}. Contact NovaCode at novacode.create@gmail.com, send a message in AthleteN, or use Problem/Feedback.`
    }, 502);
  }
}
