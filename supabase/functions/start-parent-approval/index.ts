import { withSupabase } from 'npm:@supabase/server@^1'
import { createClient } from 'npm:@supabase/supabase-js@2'

const corsHeaders = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type' }
const json = (data: unknown, status = 200) => new Response(JSON.stringify(data), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
function randomToken() { const bytes = new Uint8Array(32); crypto.getRandomValues(bytes); return Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('') }
async function sha256(value: string) { const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value)); return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('') }

function escapeHtml(value: string) {
  return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;')
}

function parentApprovalEmail(athleteName: string, approvalUrl: string) {
  const safeName = escapeHtml(athleteName)
  const safeUrl = escapeHtml(approvalUrl)
  const subject = `Please review a parent/guardian approval request for AthleteN`
  const html = `<!doctype html>
<html lang="en">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f3f6fb;font-family:Arial,Helvetica,sans-serif;color:#17243b">
  <div style="display:none;max-height:0;overflow:hidden;opacity:0">Review the parent or guardian approval request for an AthleteN account.</div>
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#f3f6fb;padding:28px 12px">
    <tr><td align="center">
      <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:600px;background:#ffffff;border:1px solid #e0e7f0;border-radius:18px;overflow:hidden">
        <tr><td style="background:#071a33;padding:24px 30px">
          <p style="margin:0;color:#65e6c2;font-size:12px;font-weight:700;letter-spacing:2px">ATHLETEN</p>
          <h1 style="margin:8px 0 0;color:#ffffff;font-size:24px;line-height:1.25">Parent / guardian approval</h1>
          <p style="margin:8px 0 0;color:#c8d6e8;font-size:13px">Train Smarter. Compete Stronger.</p>
        </td></tr>
        <tr><td style="padding:30px">
          <p style="margin:0 0 16px;font-size:16px;line-height:1.6">Hello,</p>
          <p style="margin:0 0 16px;font-size:15px;line-height:1.7"><strong>${safeName}</strong> has requested to create or activate an AthleteN account and has indicated that they are under 18.</p>
          <p style="margin:0 0 22px;font-size:15px;line-height:1.7">Please review this request. The athlete workspace will remain locked until the parent/guardian approval step is completed.</p>
          <table role="presentation" cellspacing="0" cellpadding="0" style="margin:0 0 22px"><tr><td bgcolor="#087f8c" style="border-radius:10px">
            <a href="${safeUrl}" style="display:inline-block;padding:14px 20px;color:#ffffff;text-decoration:none;font-size:14px;font-weight:700;border-radius:10px">Review approval request</a>
          </td></tr></table>
          <p style="margin:0 0 12px;font-size:13px;line-height:1.7;color:#526176">For your security, this one-time link expires in 72 hours. If the button does not work, copy this address into your browser:</p>
          <p style="margin:0 0 22px;word-break:break-all;font-size:12px;line-height:1.6"><a href="${safeUrl}" style="color:#087f8c">${safeUrl}</a></p>
          <div style="padding:14px 16px;background:#f3f6fb;border-radius:10px">
            <p style="margin:0;font-size:13px;line-height:1.7;color:#526176"><strong>Didn't expect this?</strong> If you are not this athlete's parent or lawful guardian, or you did not expect this request, do not approve it. You can safely ignore this email.</p>
          </div>
          <p style="margin:24px 0 0;font-size:13px;line-height:1.7;color:#526176">This email is an account-safety request from AthleteN. Completing this step records the approval action for this account; please review the request carefully before continuing.</p>
        </td></tr>
        <tr><td style="padding:18px 30px;background:#f8fafc;border-top:1px solid #e0e7f0">
          <p style="margin:0;font-size:11px;line-height:1.6;color:#718096">AthleteN · The Athlete Operating System</p>
          <p style="margin:5px 0 0;font-size:11px;line-height:1.6;color:#718096">If you did not request this, no action is needed.</p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`
  const text = `ATHLETEN — Parent / guardian approval

Hello,

${athleteName} has requested to create or activate an AthleteN account and has indicated that they are under 18.

Please review this request. The athlete workspace remains locked until the parent/guardian approval step is completed.

Review approval request: ${approvalUrl}

This one-time link expires in 72 hours.

If you are not this athlete's parent or lawful guardian, or you did not expect this request, do not approve it. You can safely ignore this email.

AthleteN — The Athlete Operating System`
  return { subject, html, text }
}

function getApprovalSiteUrl(req: Request) {
  const origin = req.headers.get('origin')?.trim().replace(/\/$/, '') || ''
  try {
    const url = new URL(origin)
    if (url.protocol === 'http:' && (url.hostname === 'localhost' || url.hostname === '127.0.0.1')) return origin
  } catch {
    // Fall back to the configured production URL.
  }
  return (Deno.env.get('ATHLETEN_PUBLIC_URL') || Deno.env.get('SITE_URL') || 'https://athleten.netlify.app').replace(/\/$/, '')
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
      const email = parentApprovalEmail(athleteName, approvalUrl)
      const response = await fetch('https://api.resend.com/emails', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${resendKey}` }, body: JSON.stringify({ from, to: [parentEmail], ...email }) })
      if (!response.ok) return json({ error: 'The parent approval email could not be sent. Please try again.' }, 502)
      return json({ status: 'pending', age_years: ageYears, expires_at: expiresAt })
    } catch (error) { console.error(error); return json({ error: error instanceof Error ? error.message : 'Parent approval could not be started.' }, 500) }
  }),
}
