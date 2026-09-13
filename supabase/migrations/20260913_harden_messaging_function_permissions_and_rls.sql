-- Restrict SECURITY DEFINER RPCs to the roles that actually need them.
revoke all on function public.create_direct_conversation(text) from public, anon;
grant execute on function public.create_direct_conversation(text) to authenticated;

revoke all on function public.create_group_conversation(text) from public, anon;
grant execute on function public.create_group_conversation(text) to authenticated;

revoke all on function public.add_group_member_by_email(uuid, text) from public, anon;
grant execute on function public.add_group_member_by_email(uuid, text) to authenticated;

revoke all on function public.cleanup_expired_instagram_oauth_states() from public, anon, authenticated;
grant execute on function public.cleanup_expired_instagram_oauth_states() to service_role;

revoke all on function public.cleanup_expired_instagram_discovery_oauth_states() from public, anon, authenticated;
grant execute on function public.cleanup_expired_instagram_discovery_oauth_states() to service_role;

-- Make messaging RLS policies explicitly authenticated-only and avoid per-row auth.uid() re-evaluation.
drop policy if exists "members can read membership" on public.conversation_members;
create policy "members can read membership"
  on public.conversation_members as permissive for select to authenticated
  using (
    user_id = (select auth.uid())
    or exists (
      select 1 from public.conversation_members own
      where own.conversation_id = conversation_members.conversation_id
        and own.user_id = (select auth.uid())
    )
  );

drop policy if exists "conversation creators can create conversations" on public.conversations;
create policy "conversation creators can create conversations"
  on public.conversations as permissive for insert to authenticated
  with check (created_by = (select auth.uid()));

drop policy if exists "conversation creators can update groups" on public.conversations;
create policy "conversation creators can update groups"
  on public.conversations as permissive for update to authenticated
  using (created_by = (select auth.uid()))
  with check (created_by = (select auth.uid()));

drop policy if exists "conversation members can read conversations" on public.conversations;
create policy "conversation members can read conversations"
  on public.conversations as permissive for select to authenticated
  using (
    exists (
      select 1 from public.conversation_members cm
      where cm.conversation_id = conversations.id
        and cm.user_id = (select auth.uid())
    )
  );

drop policy if exists "members can read messages" on public.messages;
create policy "members can read messages"
  on public.messages as permissive for select to authenticated
  using (
    exists (
      select 1 from public.conversation_members cm
      where cm.conversation_id = messages.conversation_id
        and cm.user_id = (select auth.uid())
    )
  );

drop policy if exists "members can send their own messages" on public.messages;
create policy "members can send their own messages"
  on public.messages as permissive for insert to authenticated
  with check (
    sender_id = (select auth.uid())
    and exists (
      select 1 from public.conversation_members cm
      where cm.conversation_id = messages.conversation_id
        and cm.user_id = (select auth.uid())
    )
  );

drop policy if exists "senders can delete their own messages" on public.messages;
create policy "senders can delete their own messages"
  on public.messages as permissive for delete to authenticated
  using (sender_id = (select auth.uid()));
