# AthleteN Admin Control Center & Verification

## Included in this change

- A dedicated Student proof review queue on web and Android.
- Status filtering for pending, approved and rejected requests.
- Private proof-file access for platform administrators through five-minute signed URLs.
- Approval is blocked when no proof file is attached.
- Rejection requires a reviewer note (maximum 1,000 characters); the note is stored on the request and shown in the athlete's verification history.
- All decisions are performed by one database RPC. The function checks the caller's platform-admin role, locks the request, accepts only pending requests, and writes an audit-log entry in the same transaction.
- The generic mobile Admin CRUD screen now routes Student verification records to the dedicated queue rather than permitting raw edits.
- The Admin dashboard links to the existing weight-verification review route.

## Authorization boundaries

- Student proof submission remains Athlete-only.
- Student verification review is available to Support Admin, Admin and Super Admin, matching the database platform-admin helper.
- Coach and Academy accounts continue to use their existing role and workspace verification lifecycle; this change does not create a duplicate Coach or Academy application workflow.
- Weight verification continues to use the existing Coach / Academy review RPC.
- Age verification remains guardian-controlled. The generic admin editor continues to expose age-verification records as read-only and does not allow platform admins to override parent approval.

## Database change

Apply `20261125090000_admin_verification_center_audit.sql` only after the repository's existing Supabase migration-history drift has been reconciled and the ordered migration chain has been validated on a disposable local database. The migration adds:

- `public.admin_review_student_verification(uuid,text,text)`
- A SELECT-only Storage policy for `verification-proofs` granted to platform admins.
- An index for the Student verification review queue.

The RPC is granted to authenticated users but enforces `private.is_platform_admin()` internally. It is not a service-role-only function because the caller identity is required for reviewer attribution and authorization.

## Required acceptance checks

- Student can upload proof and sees Pending.
- Non-admin cannot open the admin verification route or call the review RPC successfully.
- Support Admin, Admin and Super Admin can open the private proof file.
- Coach and Academy accounts cannot submit Student proof.
- Admin cannot approve a request without an attached proof file.
- Rejection without a reviewer note is rejected by both client validation and the database.
- Concurrent or repeated decisions cannot process the same request twice.
- Approval / rejection creates one audit-log entry with actor, request ID, subject account ID, document type and decision.
- Athlete sees the latest status and reviewer note after refresh.
- Guardian age approval remains unchanged.
- Existing Coach / Academy and weight-verification workflows remain unchanged.

## Deployment status

This repository change is a candidate implementation. The SQL migration has not been applied to production, and no live verification files or user records have been accessed or changed by this implementation task. Run the ordered local Supabase migration suite, web tests/build, Android lint/Expo Doctor and signed-in device acceptance before deploying.
