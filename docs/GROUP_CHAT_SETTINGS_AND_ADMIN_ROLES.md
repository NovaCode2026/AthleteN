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

The existing recent-contact and name / username / account-ID member picker remains the selection flow when a member is allowed to add people. Both clients now use the same permission model and display **Group settings update pending** while the production database is still on the old schema.

## Database enforcement

The migration draft is `supabase/migrations/20261114182000_group_admin_permissions_and_settings.sql`. It adds `conversation_members.is_admin`, the three group permission columns, creator backfill and creator-admin trigger, plus the RPCs:
- `set_group_member_admin`
- `update_group_settings`
- `update_group_info`
- updated `add_group_member_by_user` / `add_group_member_by_email`

Message INSERT RLS is updated so the admin-only sending rule is enforced by PostgreSQL, not just the mobile composer. The prior message body/attachment validation remains in the policy. The RPCs enforce authenticated callers, age approval, group membership, group ownership/admin status and block checks as appropriate.

## Rollout status and migration gate

The live database was inspected on 2026-11-14. Its `conversations` and `conversation_members` tables do not yet contain the new settings or `is_admin` columns. The production migration ledger currently ends at `20261112092215`.

The repository's documented migration-history drift still exists. Do not apply this DDL blindly to production and do not create a paid staging project/branch to get around the drift. Reconcile migration history and run the negative authorization tests in a safe non-production environment before applying the migration to production.

The mobile client has a compatibility fallback for the old schema. Until the migration exists in the database, it keeps existing group conversations working and shows **GROUP SETTINGS UPDATE PENDING**. The Group Settings panel and delegated admin controls become available once the new database schema is detected. Do not describe group-admin functionality as live before the migration is applied and verified.
