-- Record provider-scheduled cancellation without prematurely removing current access.
-- Apply only after the migration-history reconciliation/replay gate passes.
ALTER TABLE public.subscriptions
  ADD COLUMN IF NOT EXISTS cancel_at_period_end boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.subscriptions.cancel_at_period_end IS
  'True when the customer requested provider-managed cancellation at the end of the paid billing period.';
