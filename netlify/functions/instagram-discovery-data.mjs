import { createClient } from "@supabase/supabase-js";

function env(name) { return Netlify.env.get(name); }
function json(payload, status = 200) { return Response.json(payload, { status }); }
function serverSupabase() {
  const url = env("SUPABASE_URL") || env("VITE_SUPABASE_URL");
  const key = env("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !key) throw new Error("SUPABASE_SERVER_CONFIG_MISSING");
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}
async function authenticate(request) {
  const token = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  if (!token) return null;
  const url = env("SUPABASE_URL") || env("VITE_SUPABASE_URL");
  const key = env("SUPABASE_ANON_KEY") || env("VITE_SUPABASE_ANON_KEY");
  if (!url || !key) throw new Error("SUPABASE_PUBLIC_CONFIG_MISSING");
  const client = createClient(url, key, { global: { headers: { Authorization: `Bearer ${token}` } }, auth: { persistSession: false, autoRefreshToken: false } });
  const { data, error } = await client.auth.getUser(token);
  return error || !data?.user ? null : data.user;
}
function usernameFromInput(value) {
  const raw = String(value || "").trim();
  if (!raw) return null;
  try {
    const url = new URL(raw.startsWith("http") ? raw : `https://www.instagram.com/${raw.replace(/^@/, "")}/`);
    if (!/instagram\.com$/i.test(url.hostname) && !/\.instagram\.com$/i.test(url.hostname)) return null;
    const first = url.pathname.split("/").filter(Boolean)[0];
    return first ? first.replace(/^@/, "").slice(0, 80) : null;
  } catch { return raw.replace(/^@/, "").split(/[/?#]/)[0].slice(0, 80) || null; }
}
function tournamentText(post) { return `${post?.caption || ""} ${post?.username || ""}`.toLowerCase(); }
function parsePosts(media) {
  const posts = Array.isArray(media) ? media : [];
  const keywords = /(taekwondo|tournament|championship|open|cup|games|kyorugi|poomsae|registration|weigh|weigh-in|draw|fixture|entry|medal|state|national|cadet|junior|senior|rules|scoring|PSS|protector|venue|schedule|fee|accommodation|transport)/i;
  return posts.filter((post) => keywords.test(tournamentText(post))).map((post) => ({
    id: post.id,
    caption: post.caption || "",
    timestamp: post.timestamp || null,
    permalink: post.permalink || null,
    media_type: post.media_type || null,
    media_product_type: post.media_product_type || null,
    media_url: post.media_url || null
  }));
}
function normalizePost(post) {
  return {
    id: post?.id || null,
    caption: post?.caption || "",
    timestamp: post?.timestamp || null,
    permalink: post?.permalink || null,
    media_type: post?.media_type || null,
    media_product_type: post?.media_product_type || null,
    media_url: post?.media_url || null
  };
}
async function instagramGet(path, accessToken) {
  const url = new URL(`https://graph.instagram.com${path}`);
  url.searchParams.set("access_token", accessToken);
  const response = await fetch(url);
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(payload?.error?.message || `INSTAGRAM_API_${response.status}`);
    error.status = response.status;
    throw error;
  }
  return payload;
}

export default async function handler(request) {
  if (request.method !== "POST") return json({ error: "Method not allowed." }, 405);
  const user = await authenticate(request);
  if (!user) return json({ error: "Please sign in before scanning an organizer." }, 401);

  try {
    const body = await request.json().catch(() => ({}));
    const requestedUsername = usernameFromInput(body.username || body.url);
    if (!requestedUsername) return json({ error: "Enter a valid public Instagram profile URL or username." }, 400);

    const supabase = serverSupabase();
    const { data: connection, error: connectionError } = await supabase.from("instagram_discovery_connections")
      .select("instagram_user_id,access_token,token_expires_at,instagram_username")
      .eq("user_id", user.id).maybeSingle();
    if (connectionError) return json({ error: "Unable to load Instagram organizer-scanning connection." }, 503);
    if (!connection?.access_token) return json({ error: "Connect the organizer's professional Instagram account before scanning its profile." }, 403);
    if (connection.token_expires_at && new Date(connection.token_expires_at).getTime() <= Date.now()) return json({ error: "Your Instagram authorization has expired. Reconnect the organizer's Instagram account." }, 401);

    const connectedUsername = String(connection.instagram_username || "").toLowerCase();
    if (connectedUsername && connectedUsername !== requestedUsername.toLowerCase()) {
      return json({ error: `The connected Instagram account is @${connection.instagram_username}. Connect @${requestedUsername} to scan that organizer profile.` }, 409);
    }

    const fields = "user_id,username,name,biography,profile_picture_url,followers_count";
    const target = await instagramGet(`/me?fields=${fields}`, connection.access_token);
    const mediaResult = await instagramGet(`/${encodeURIComponent(connection.instagram_user_id)}/media?fields=id,caption,media_type,media_product_type,media_url,permalink,timestamp&limit=50`, connection.access_token);
    const media = Array.isArray(mediaResult?.data) ? mediaResult.data : [];
    const relevantPosts = parsePosts(media);
    const relevantIds = new Set(relevantPosts.map((post) => post.id));
    const normalizedPosts = media.map(normalizePost);
    const otherPosts = normalizedPosts.filter((post) => post.id && !relevantIds.has(post.id));

    return json({
      organizer: {
        id: target.user_id || connection.instagram_user_id,
        username: target.username || connection.instagram_username,
        name: target.name || null,
        biography: target.biography || null,
        profile_picture_url: target.profile_picture_url || null,
        followers_count: target.followers_count ?? null
      },
      posts: normalizedPosts,
      relevant_posts: relevantPosts,
      other_posts: otherPosts,
      posts_scanned: normalizedPosts.length,
      scan_limit: 50,
      more_posts_available: Boolean(mediaResult?.paging?.next),
      scanned_at: new Date().toISOString()
    });
  } catch (error) {
    console.error("instagram-discovery-data", error?.status || "", error?.message || error);
    if (error?.status === 401 || error?.status === 403) return json({ error: "Instagram denied this data request. Reconnect the professional Instagram account and verify its eligibility for the selected permissions." }, error.status);
    return json({ error: error?.message || "Instagram organizer scan failed." }, 502);
  }
}
