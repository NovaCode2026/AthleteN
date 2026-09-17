const VERIFY_TOKEN = process.env.INSTAGRAM_WEBHOOK_VERIFY_TOKEN;

export default async function handler(request) {
  const url = new URL(request.url);

  if (request.method === "GET") {
    const mode = url.searchParams.get("hub.mode");
    const token = url.searchParams.get("hub.verify_token");
    const challenge = url.searchParams.get("hub.challenge");

    if (mode === "subscribe" && VERIFY_TOKEN && token === VERIFY_TOKEN) {
      return new Response(challenge || "", { status: 200 });
    }

    return new Response("Forbidden", { status: 403 });
  }

  if (request.method === "POST") {
    try {
      const body = await request.json();
      console.log("Instagram webhook event:", JSON.stringify(body));
      return new Response("EVENT_RECEIVED", { status: 200 });
    } catch {
      return new Response("Invalid JSON", { status: 400 });
    }
  }

  return new Response("Method Not Allowed", {
    status: 405,
    headers: { Allow: "GET, POST" },
  });
}
