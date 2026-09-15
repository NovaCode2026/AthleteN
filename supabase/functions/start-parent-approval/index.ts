import { withSupabase } from 'npm:@supabase/server@^1'
import { createClient } from 'npm:@supabase/supabase-js@2'

const corsHeaders = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type' }
const json = (data: unknown, status = 200) => new Response(JSON.stringify(data), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
function randomToken() { const bytes = new Uint8Array(32); crypto.getRandomValues(bytes); return Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('') }
async function sha256(value: string) { const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value)); return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('') }

function getApprovalSiteUrl(req: Request) {
  const origin = req.headers.get('origin')?.trim().replace(/\/$/, '') || ''
  try {
    const url = new URL(origin)
    if (url.protocol === 'http:' && (url.hostname === 'localhost' || url.hostname === '127.0.0.1')) return origin
  } catch {
    // Fall back to the configured production URL.
  }
  return (Deno.env.get('ATHLETEN_PUBLIC_URL') || Deno.env.get('SITE_URL') || '').replace(/\/$/, '')
}

export default {
  fetch: withSupabase({ auth: 'user' }, async (req, ctx) => {
    if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
    if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405)
    try {
      const body = await req.json() as { date_of_birth?: string; parent_email?: string; full_name?: string }
      const dateOfBirth = body.date_of_birth?.trim(); const parentEmail = body.parent_email?.trim().toLowerCase()
      if (!dateOfBirth) return json({ error: 'Date of birth is required.' }, 400)
      const { data: recorded, error: recordError } = await ctx.supabase.rpc('record_age_profile', { p_date_of_birth: dateOfBirth, p_parent_email: parentEmail || null })
      if (recordError) return json({ error: recordError.message }, 400)
      const status = recorded?.[0]?.status as string | undefined; const ageYears = Number(recorded?.[0]?.age_years ?? -1)
      if (status !== 'pending' || ageYears >= 18) return json({ status: 'not_required', age_years: ageYears })
      if (!parentEmail) return json({ error: 'A parent or guardian email is required for users under 18.' }, 400)
      if (parentEmail === (ctx.userClaims?.email || '').toLowerCase()) return json({ error: 'Parent or guardian email must be different from the account email.' }, 400)

      const secretKey = JSON.parse(Deno.env.get('SUPABASE_SECRET_KEYS') || '{}')['default']
      if (!secretKey) return json({ error: 'Server security configuration is incomplete.' }, 500)
      const admin = createClient(Deno.env.get('SUPABASE_URL')!, secretKey, { auth: { autoRefreshToken: false, persistSession: false } })
      const token = randomToken(); const tokenHash = await sha256(token); const expiresAt = new Date(Date.now() + 72 * 60 * 60 * 1000).toISOString()
      const { error: updateError } = await admin.from('age_verifications').update({ token_hash: tokenHash, token_expires_at: expiresAt, status: 'pending', approved_at: null, rejected_at: null, updated_at: new Date().toISOString() }).eq('user_id', ctx.userClaims!.sub)
      if (updateError) return json({ error: 'Parent approval request could not be created.' }, 500)

      const resendKey = Deno.env.get('RESEND_API_KEY')
      const from = Deno.env.get('PARENT_APPROVAL_FROM') || 'onboarding@resend.dev'
      const siteUrl = getApprovalSiteUrl(req)
      if (!resendKey || !siteUrl) return json({ error: 'Parent approval email service is not configured yet. Set RESEND_API_KEY and ATHLETEN_PUBLIC_URL.' }, 503)
      const approvalUrl = `${siteUrl}/parent-approval?token=${encodeURIComponent(token)}`; const athleteName = String(body.full_name || 'your athlete').replace(/[<>]/g, '')
      const response = await fetch('https://api.resend.com/emails', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${resendKey}` }, body: JSON.stringify({ from, to: [parentEmail], subject: `Parent/guardian approval for ${athleteName} on AthleteN`, html: `<div style="font-family:Arial,sans-serif;max-width:620px;margin:auto;line-height:1.5"><h2>AthleteN parent/guardian approval</h2><p>${athleteName} is registering for AthleteN and has indicated they are under 18.</p><p>A parent or guardian must approve access before the account can enter the athlete dashboard.</p><p><a href="${approvalUrl}" style="display:inline-block;padding:12px 18px;background:#111827;color:#fff;text-decoration:none;border-radius:8px">Review and approve account</a></p><p>This approval link expires in 72 hours. If you did not expect this request, you can ignore this email.</p></div>`, text: `AthleteN parent/guardian approval\n\n${athleteName} is registering for AthleteN and has indicated they are under 18. A parent or guardian must approve access before the account can enter the athlete dashboard.\n\nApprove: ${approvalUrl}\n\nThis link expires in 72 hours.` }) })
      if (!response.ok) return json({ error: 'The parent approval email could not be sent. Please try again.' }, 502)
      return json({ status: 'pending', age_years: ageYears, expires_at: expiresAt })
    } catch (error) { console.error(error); return json({ error: error instanceof Error ? error.message : 'Parent approval could not be started.' }, 500) }
  }),
}
