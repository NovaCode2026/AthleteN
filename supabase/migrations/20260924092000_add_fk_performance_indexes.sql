-- Add covering indexes for foreign keys flagged by Supabase performance advisor.
create index if not exists athlete_feature_controls_set_by_idx on public.athlete_feature_controls(set_by) where set_by is not null;
create index if not exists finance_transactions_account_id_idx on public.finance_transactions(account_id);
create index if not exists support_tickets_conversation_id_idx on public.support_tickets(conversation_id) where conversation_id is not null;
create index if not exists training_group_members_athlete_user_id_idx on public.training_group_members(athlete_user_id);
create index if not exists training_groups_coach_user_id_idx on public.training_groups(coach_user_id);
create index if not exists training_groups_conversation_id_idx on public.training_groups(conversation_id) where conversation_id is not null;
