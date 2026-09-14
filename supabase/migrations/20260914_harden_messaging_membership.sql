-- Membership writes must go through the SECURITY DEFINER conversation helpers.
drop policy if exists "users can join conversations through secure functions" on public.conversation_members;

-- Keep the messaging RPC surface authenticated-only.
revoke all on function public.search_messaging_users(text) from public, anon;
grant execute on function public.search_messaging_users(text) to authenticated;
revoke all on function public.create_direct_conversation_by_user(uuid) from public, anon;
grant execute on function public.create_direct_conversation_by_user(uuid) to authenticated;
revoke all on function public.add_group_member_by_user(uuid, uuid) from public, anon;
grant execute on function public.add_group_member_by_user(uuid, uuid) to authenticated;
