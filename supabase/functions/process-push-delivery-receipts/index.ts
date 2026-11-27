import { createClient } from 'npm:@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'content-type, x-worker-secret',
}
const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })

function getServiceKey() {
  const direct = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
  if (direct) return direct
  try {
    const keys = JSON.parse(Deno.env.get('SUPABASE_SECRET_KEYS') || '{}')
    return typeof keys.default === 'string' ? keys.default : null
  } catch {
    return null
  }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405)

  const expectedSecret = Deno.env.get('PUSH_DELIVERY_WORKER_SECRET')
  const suppliedSecret = req.headers.get('x-worker-secret')
  if (!expectedSecret || !suppliedSecret || suppliedSecret !== expectedSecret) {
    return json({ error: 'Unauthorized' }, 401)
  }

  const serviceKey = getServiceKey()
  const supabaseUrl = Deno.env.get('SUPABASE_URL')
  if (!serviceKey || !supabaseUrl) {
    return json({ error: 'Server push-worker configuration is incomplete' }, 500)
  }

  try {
    const admin = createClient(supabaseUrl, serviceKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    })

    const { data: ticketsProcessed, error: ticketError } = await admin.rpc(
      'process_expo_push_ticket_responses',
      { p_batch_size: 200 },
    )
    if (ticketError) throw ticketError

    const { data: dueReceipts, error: receiptQueueError } = await admin.rpc(
      'get_expo_push_receipt_batch',
      { p_batch_size: 100 },
    )
    if (receiptQueueError) throw receiptQueueError

    const tickets = (dueReceipts || []) as Array<{ attempt_id: string; ticket_id: string }>
    let receiptsUpdated = 0
    let receiptIdsMissing = 0

    if (tickets.length > 0) {
      const ticketIds = [...new Set(tickets.map((ticket) => ticket.ticket_id).filter(Boolean))]
      const response = await fetch('https://exp.host/--/api/v2/push/getReceipts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids: ticketIds }),
      })

      if (!response.ok) {
        // The database already recorded a check attempt. It will be eligible
        // for another check after 15 minutes; no token is removed on HTTP errors.
        return json({
          tickets_processed: Number(ticketsProcessed || 0),
          receipts_requested: ticketIds.length,
          receipts_updated: 0,
          retryable_provider_error: true,
        }, 502)
      }

      const payload = await response.json() as {
        data?: Record<string, { status?: string; message?: string; details?: { error?: string } }>
        errors?: Array<{ code?: string; message?: string }>
      }

      const receiptData = payload.data || {}
      const results = Object.entries(receiptData).map(([ticketId, receipt]) => ({
        ticket_id: ticketId,
        status: receipt.status || 'error',
        message: receipt.message || '',
        error_code: receipt.details?.error || '',
      }))

      if (results.length > 0) {
        const { data: updated, error: persistError } = await admin.rpc(
          'record_expo_push_receipt_results',
          { p_results: results },
        )
        if (persistError) throw persistError
        receiptsUpdated = Number(updated || 0)
      }
      receiptIdsMissing = Math.max(ticketIds.length - results.length, 0)
    }

    return json({
      tickets_processed: Number(ticketsProcessed || 0),
      receipts_requested: tickets.length,
      receipts_updated: receiptsUpdated,
      receipts_not_ready_yet: receiptIdsMissing,
    })
  } catch (error) {
    console.error('Expo push delivery processing failed', error)
    return json({ error: 'Push delivery processing failed' }, 500)
  }
})
