-- Keep fresh environments aligned with the canonical six-plan model.
update public.profiles set plan_id='coach' where plan_id='champion';
update public.subscriptions set plan_id='coach' where plan_id='champion';
update public.account_entitlements set selected_plan_id='coach', trial_plan_id=case when trial_plan_id='champion' then 'coach' else trial_plan_id end where selected_plan_id='champion' or trial_plan_id='champion';
update public.ai_usage_events set plan_id='coach' where plan_id='champion';

alter table public.profiles drop constraint if exists profiles_plan_id_check;
alter table public.profiles add constraint profiles_plan_id_check check (plan_id in ('free','student','pro','elite','coach','academy'));

alter table public.subscriptions drop constraint if exists subscriptions_plan_id_check;
alter table public.subscriptions add constraint subscriptions_plan_id_check check (plan_id in ('free','student','pro','elite','coach','academy'));

alter table public.account_entitlements drop constraint if exists account_entitlements_selected_plan_id_check;
alter table public.account_entitlements add constraint account_entitlements_selected_plan_id_check check (selected_plan_id in ('free','student','pro','elite','coach','academy'));

alter table public.account_entitlements drop constraint if exists account_entitlements_trial_plan_id_check;
alter table public.account_entitlements add constraint account_entitlements_trial_plan_id_check check (trial_plan_id is null or trial_plan_id in ('student','pro','elite','coach','academy'));

alter table public.ai_usage_events drop constraint if exists ai_usage_events_plan_id_check;
alter table public.ai_usage_events add constraint ai_usage_events_plan_id_check check (plan_id in ('free','student','pro','elite','coach','academy'));
