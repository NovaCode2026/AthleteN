-- Keep privileged SECURITY DEFINER RPCs unavailable to anonymous clients.
-- Authenticated clients remain able to call these functions; each function
-- performs its own authorization checks.
revoke execute on function public.announce_training_cancellation() from anon;
revoke execute on function public.can_manage_finance_account(uuid) from anon;
revoke execute on function public.cancel_coach_training_date(date, uuid, text) from anon;
revoke execute on function public.cancel_coach_training_session(uuid, text) from anon;
revoke execute on function public.coach_add_athlete_by_account_code(text) from anon;
revoke execute on function public.connect_coach_to_academy_by_code(text) from anon;
revoke execute on function public.create_coach_extra_training(uuid, date, time, integer, text, text, text, text, text) from anon;
revoke execute on function public.create_coach_training_group(text, text, text[], time, integer, uuid[]) from anon;
revoke execute on function public.ensure_training_group_conversation() from anon;
revoke execute on function public.get_or_create_my_coach_finance_account() from anon;
revoke execute on function public.record_ai_usage(uuid, integer, integer, integer) from anon;
revoke execute on function public.regenerate_my_account_code() from anon;
revoke execute on function public.search_messaging_users(text) from anon;
revoke execute on function public.set_my_account_code(text) from anon;
revoke execute on function public.sync_training_group_chat_member() from anon;
revoke execute on function public.update_coach_training_session(uuid, time, integer, text, text, text) from anon;
