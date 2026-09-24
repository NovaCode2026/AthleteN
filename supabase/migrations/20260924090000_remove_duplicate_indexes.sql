-- Remove redundant duplicate indexes detected by Supabase advisor.
drop index if exists public.subscription_usage_user_month_uidx;
drop index if exists public.training_group_members_unique_active;
