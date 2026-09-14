import { createClient } from 'npm:@supabase/supabase-js@2'

const corsHeaders = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type' }
const json = (data: unknown, status = 200) => new Response(JSON.stringify(data), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
async function sha256(value: string) { const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value)); return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('') }

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405)
  try {
    const { token } = await req.json() as { token?: string }
    if (!token || !/^[a-f0-9]{64}$/.test(token)) return json({ error: 'Invalid approval link.' }, 400)
    const secretKey = JSON.parse(Deno.env.get('SUPABASE_SECRET_KEYS') || '{}')['default']
    if (!secretKey) return json({ error: 'Server security configuration is incomplete.' }, 500)
    const admin = createClient(Deno.env.get('SUPABASE_URL')!, secretKey, { auth: { autoRefreshToken: false, persistSession: false } })
    const tokenHash = await sha256(token)
    const { data: row, error: lookupError } = await admin.from('age_verifications').select('id,user_id,status,token_expires_at').eq('token_hash', tokenHash).maybeSingle()
    if (lookupError || !row) return json({ error: 'This approval link is invalid or has already been used.' }, 404)
    if (row.status === 'approved') return json({ status: 'approved', message: 'This account has already been approved.' })
    if (row.status !== 'pending') return json({ error: 'This approval request is no longer active.' }, 409)
    if (!row.token_expires_at || new Date(row.token_expires_at).getTime() < Date.now()) return json({ error: 'This approval link has expired. Ask the athlete to send a new request.' }, 410)
    const { error: updateError } = await admin.from('age_verifications').update({ status: 'approved', approved_at: new Date().toISOString(), token_hash: null, token_expires_at: null, updated_at: new Date().toISOString() }).eq('id', row.id).eq('status', 'pending')
    if (updateError) return json({ error: 'Approval could not be recorded. Please try again.' }, 500)
    return json({ status: 'approved', message: 'Parent/guardian approval recorded. The athlete can now enter AthleteN.' })
  } catch (error) { console.error(error); return json({ error: 'Approval could not be completed.' }, 500) }
})
