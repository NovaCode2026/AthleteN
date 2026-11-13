# Connected-Team Age Approval Access Findings — 2026-11-13

## Production finding

A read-only catalog and policy audit found that the connected-team authorization layer does not consistently require age approval for both sides of a coach-athlete relationship.

The live `public.can_view_athlete(uuid)` helper checks self access, platform-admin access, active coach-athlete links, and Academy membership, but it does not check `public.is_age_approved(auth.uid())` or `public.is_age_approved(target_user_id)`.

The live `private.user_can_manage_athlete(uuid)` helper checks direct active links and active Academy memberships, but it likewise does not check age approval for the caller or target athlete.

The catalog shows nine public athlete-data tables that have a permissive `connected team read athlete` SELECT policy and **no restrictive age-approval policy**:

- `hydration_logs`
- `kyorugi_bouts`
- `kyorugi_training_metrics`
- `nutrition_logs`
- `poomsae_performances`
- `poomsae_training_metrics`
- `taekwondo_belt_history`
- `taekwondo_training_logs`
- `taekwondo_weight_category_decisions`

The `profiles` table also has connected-team SELECT policies without a restrictive age policy. Its own-profile SELECT path must remain available for onboarding, so the candidate remediation gates linked-profile helper access rather than locking users out of their own onboarding profile.

Other connected-team tables do have a restrictive policy named `age approval required`. That restrictive policy gates the authenticated caller, but the table helper still needs to ensure the *target athlete* is approved. The candidate helper changes do this for all connected-team reads and management operations that use the shared helper.

This is a database-boundary gap derived from live function definitions, grants, and RLS policy metadata. No unauthorized row read was demonstrated with a real production account, and no production data or schema was changed.

## Candidate remediation in this branch

`supabase/security/age_gated_coach_access_hardening.sql` is a review-only SQL draft. It:

1. Replaces `public.can_view_athlete` so both the signed-in caller and target athlete must have an approved or `not_required` age state before connected-team visibility is granted. Platform-admin access remains available through the existing admin helper.
2. Replaces `private.user_can_manage_athlete` with the same two-sided approval gate before direct-link or Academy-based management access is granted.
3. Adds restrictive age-approval policies to the nine athlete-data tables listed above. The policies gate both caller and row owner and preserve the explicit platform-admin support path.
4. Retains the existing permissive ownership/connected-team policies; the new restrictive policies AND with those existing policies rather than replacing their intended relationship rules.

The draft deliberately does not add a blanket age restriction to `profiles`, because the account needs to read its own profile during age verification and onboarding.

## Test coverage

The PostgreSQL 17 integration harness adds these scenarios:

- Approved coach linked to a pending athlete cannot read that athlete's Taekwondo, Kyorugi, Poomsae, hydration, or nutrition rows.
- Approved coach can still view and manage an approved linked athlete.
- Pending coach cannot use an existing relationship to read an approved athlete.
- Pending coach cannot read their own connected-team data before age approval.

The test harness applies this SQL draft only to an isolated disposable PostgreSQL database. It does not apply it to the live Supabase project.

## Release implications

Treat this as an additional security release gate. Do not deploy this SQL or any changed Edge Function to production until the full Supabase migration history has been reconciled and the candidate has been tested on the real local Supabase schema. Do not use `migration repair` or create placeholder migrations to work around the migration drift.
