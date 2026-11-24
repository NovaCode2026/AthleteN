import { json } from "../payment-common.mjs";

export default async function handler(request) {
  if (request.method !== "POST") return json({ error: "Method not allowed." }, 405);
  // This endpoint stays closed until the production migration adding
  // subscriptions.cancel_at_period_end has been safely reconciled and verified.
  return json({
    error: "Subscription self-service cancellation is temporarily unavailable while billing schema verification is pending."
  }, 503);
}
