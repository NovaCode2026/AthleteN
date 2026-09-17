import { randomBytes } from "node:crypto";
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

export default async function handler(request) {
  if (request.method !== "GET") return json({ error: "Method not allowed." }, 405);
  const user = await authenticate(request);
  if (!user) return json({ error: "Please sign in before connecting Instagram." }, 401);

  const appId = env("INSTAGRAM_APP_ID");
  const redirectUri = env("INSTAGRAM_DISCOVERY_REDIRECT_URI") || "https://athleten.netlify.app/.netlify/functions/instagram-discovery-callback";
  if (!appId || !redirectUri) return json({ error: "Instagram organizer scanning is not configured on the server." }, 503);

  try {
    const supabase = serverSupabase();
    await supabase.from("instagram_discovery_oauth_states").delete().eq("user_id", user.id);
    const state = randomBytes(32).toString("hex");
    const { error } = await supabase.from("instagram_discovery_oauth_states").insert({
      state,
      user_id: user.id,
      expires_at: new Date(Date.now() + 10 * 60 * 1000).toISOString()
    });
    if (error) return json({ error: "Unable to start Instagram authorization." }, 503);

    // Use the same current Instagram Login flow as the regular Instagram connection.
    // Do not send the legacy Facebook/Page/Business Discovery scopes that caused the
    // Invalid Scopes error in the previous implementation.
    const scopes = [
      "instagram_business_basic",
      "instagram_business_manage_comments",
      "instagram_business_manage_messages"
    ].join(",");
    const authorizeUrl = new URL("https://www.instagram.com/oauth/authorize");
    authorizeUrl.searchParams.set("client_id", appId);
    authorizeUrl.searchParams.set("redirect_uri", redirectUri);
    authorizeUrl.searchParams.set("response_type", "code");
    authorizeUrl.searchParams.set("scope", scopes);
    authorizeUrl.searchParams.set("state", state);
    return json({ authorizeUrl: authorizeUrl.toString() });
  } catch (error) {
    console.error("instagram-discovery-connect", error);
    return json({ error: "Unable to start Instagram authorization." }, 503);
  }
}
