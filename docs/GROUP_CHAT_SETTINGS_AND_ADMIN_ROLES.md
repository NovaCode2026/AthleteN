# AthleteN group ownership, admins and group settings

## Intended group model

Every group has one creator/owner. The creator is always a group admin and is the only person who can appoint or remove other group admins. Group admins can manage the group permissions. Appointed admins are ordinary group participants for other purposes; admin status is scoped to that conversation and does not change the user's AthleteN account role.

The settings mirror the common WhatsApp-style controls:

| Setting | Default | Meaning |
|---|---|---|
| Who can add members? | Admins | When enabled, only the owner and appointed group admins can invite people. When disabled, any group member can add people. |
| Who can edit group info? | Admins | When enabled, only admins can edit the group name and description. When disabled, any group member can edit those fields. |
| Who can send messages? | All members | When enabled, only admins can post messages. When disabled, all group members can post. |

The group creator can promote or demote members from the Group Settings panel. Admins can change the permission settings, but cannot appoint or remove other admins. The creator cannot be demoted.

## Mobile client

The mobile and web messaging screens now include:
- Group Settings panel with the member/admin list.
- Creator-only Make Admin / Remove Admin actions.
- Permission controls for adding members, editing group information and sending messages.
- Group name and description editing.
- Add Members access based on the group's current permission setting rather than creator-only UI logic.
- A disabled composer for non-admins when the group is set to admin-only messages.

The existing recent-contact and name / username / account-ID member picker remains the selection flow when a member is allowed to add people. Both clients now support a square group photo at creation and from Group Settings, a group description, creator/member metadata, and signed photo display in the conversation list and active-chat header. Mobile uses the already-installed Expo image picker; the web app uses a file picker. Accepted formats are JPEG, PNG and WebP, with a 5 MB limit.

Group photos are stored in a private `group-avatars` bucket. Group members can read them through signed URLs. Upload, replacement and removal are governed by the same group-info permission: when group-info editing is restricted, only the creator and appointed admins can change the photo. The group-admin/profile migration was applied to the connected production database on 2026-11-14 (ledger version `20261114162145`), and the Storage path qualification fix was applied as `20261114162529`. The pending label remains only as a compatibility fallback for stale clients or environments that have not received the schema.

## Database enforcement

The applied migration is `supabase/migrations/20261114162145_group_admin_permissions_and_settings.sql`; its avatar-policy correction is `supabase/migrations/20261114162529_fix_group_avatar_storage_policy_path_scope.sql`. It adds `conversation_members.is_admin`, the three group permission columns, creator backfill and creator-admin trigger, plus the RPCs:
- `set_group_member_admin`
- `update_group_settings`
- `update_group_info`
- `update_group_avatar`
- updated `add_group_member_by_user` / `add_group_member_by_email`

The migration also creates the private `group-avatars` bucket and member/admin-scoped Storage policies.

Message INSERT RLS is updated so the admin-only sending rule is enforced by PostgreSQL, not just the mobile composer. The prior message body/attachment validation remains in the policy. The RPCs enforce authenticated callers, age approval, group membership, group ownership/admin status and block checks as appropriate.

## Production verification and remaining QA

The connected production database was checked on 2026-11-14. Migration ledger versions `20261114162145` (`group_admin_permissions_and_settings`) and `20261114162529` (`fix_group_avatar_storage_policy_path_scope`) are applied. A direct schema query confirmed all five group-profile/permission columns on `conversations`, `conversation_members.is_admin`, the private `group-avatars` bucket, the four group profile/admin RPCs, and four group-avatar Storage policies.

The live message INSERT policy enforces the admin-only posting setting at the database boundary and retains the separate age-approval policy. The group management RPCs are executable by `authenticated`, not `anon`; the functions perform caller, age-approval, membership and role checks in their bodies. Supabase's security advisor still reports broader project-level warnings, including authenticated-executable SECURITY DEFINER functions and the pre-existing `pg_net` extension in `public`; those notices need a separate project-wide review and are not proof of a group-chat bypass.

The **GROUP SETTINGS UPDATE PENDING** label remains as a compatibility fallback for stale clients or environments that do not have the new schema. Production database objects are present, but the negative authorization cases, photo upload/remove flow, group creation and membership changes still require end-to-end verification with test accounts on both web and physical mobile devices. Do not treat source-level regression checks as a substitute for that QA.
