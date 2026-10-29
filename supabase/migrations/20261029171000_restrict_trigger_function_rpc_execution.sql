-- Trigger functions are invoked by PostgreSQL triggers, not as client RPCs.
-- Remove direct API execution while preserving their trigger behavior.
revoke execute on function public.announce_training_cancellation() from public, anon, authenticated;
revoke execute on function public.ensure_training_group_conversation() from public, anon, authenticated;