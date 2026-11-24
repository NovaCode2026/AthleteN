import { createClient } from 'npm:@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'content-type, x-cleanup-secret',
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

  const expectedSecret = Deno.env.get('MESSAGE_ATTACHMENT_CLEANUP_SECRET')
  const suppliedSecret = req.headers.get('x-cleanup-secret')
  if (!expectedSecret || !suppliedSecret || suppliedSecret !== expectedSecret) {
    return json({ error: 'Unauthorized' }, 401)
  }

  const serviceKey = getServiceKey()
  const supabaseUrl = Deno.env.get('SUPABASE_URL')
  if (!serviceKey || !supabaseUrl) {
    return json({ error: 'Server cleanup configuration is incomplete' }, 500)
  }

  try {
    const admin = createClient(supabaseUrl, serviceKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    })

    const { data: expiredDeleted, error: expiryError } = await admin.rpc(
      'cleanup_expired_messages',
      { p_batch_size: 500 },
    )
    if (expiryError) throw expiryError

    const { data: pending, error: queueError } = await admin
      .from('messaging_attachment_cleanup_queue')
      .select('id, object_path')
      .is('completed_at', null)
      .order('requested_at', { ascending: true })
      .limit(100)
    if (queueError) throw queueError

    let removed = 0
    let failed = 0
    for (const item of pending || []) {
      const attemptedAt = new Date().toISOString()
      const { error: removeError } = await admin.storage
        .from('message-attachments')
        .remove([item.object_path])

      if (removeError) {
        failed += 1
        await admin.rpc('record_messaging_attachment_cleanup_failure', {
          p_queue_id: item.id,
          p_error: String(removeError.message || 'Storage removal failed').slice(0, 500),
        })
        continue
      }

      const { error: completeError } = await admin
        .from('messaging_attachment_cleanup_queue')
        .update({
          completed_at: attemptedAt,
          last_attempt_at: attemptedAt,
          last_error: null,
        })
        .eq('id', item.id)
        .is('completed_at', null)
      if (completeError) {
        failed += 1
        continue
      }
      removed += 1
    }

    return json({
      expired_messages_deleted: Number(expiredDeleted || 0),
      attachment_objects_removed: removed,
      attachment_removals_failed: failed,
      remaining_batch_size: pending?.length || 0,
    })
  } catch (error) {
    console.error('Message attachment cleanup failed', error)
    return json({ error: 'Message attachment cleanup failed' }, 500)
  }
})
