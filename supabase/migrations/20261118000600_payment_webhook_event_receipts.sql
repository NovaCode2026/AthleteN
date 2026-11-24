-- Private, durable idempotency inbox for signed payment-provider webhooks.
-- Keeps duplicate deliveries from applying the same business transition twice.
-- Production application remains blocked until the migration history is reconciled.

CREATE TABLE IF NOT EXISTS private.payment_webhook_receipts (
  provider text NOT NULL CHECK (provider IN ('razorpay', 'stripe', 'cashfree')),
  provider_event_id text NOT NULL CHECK (length(btrim(provider_event_id)) BETWEEN 1 AND 255),
  event_type text NOT NULL CHECK (length(btrim(event_type)) BETWEEN 1 AND 120),
  status text NOT NULL DEFAULT 'processing'
    CHECK (status IN ('processing', 'processed', 'failed')),
  attempts integer NOT NULL DEFAULT 1 CHECK (attempts >= 1),
  locked_until timestamptz NOT NULL DEFAULT (pg_catalog.now() + interval '5 minutes'),
  last_error_code text,
  created_at timestamptz NOT NULL DEFAULT pg_catalog.now(),
  updated_at timestamptz NOT NULL DEFAULT pg_catalog.now(),
  processed_at timestamptz,
  PRIMARY KEY (provider, provider_event_id)
);

ALTER TABLE private.payment_webhook_receipts ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE private.payment_webhook_receipts FROM PUBLIC, anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION public.claim_payment_webhook_event(
  p_provider text,
  p_provider_event_id text,
  p_event_type text
)
RETURNS TABLE (claimed boolean, already_processed boolean, retry_after timestamptz)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_status text;
  v_locked_until timestamptz;
  v_now timestamptz := pg_catalog.now();
BEGIN
  IF p_provider IS NULL OR p_provider NOT IN ('razorpay', 'stripe', 'cashfree') THEN
    RAISE EXCEPTION 'INVALID_WEBHOOK_PROVIDER';
  END IF;
  IF p_provider_event_id IS NULL OR length(btrim(p_provider_event_id)) NOT BETWEEN 1 AND 255 THEN
    RAISE EXCEPTION 'INVALID_WEBHOOK_EVENT_ID';
  END IF;
  IF p_event_type IS NULL OR length(btrim(p_event_type)) NOT BETWEEN 1 AND 120 THEN
    RAISE EXCEPTION 'INVALID_WEBHOOK_EVENT_TYPE';
  END IF;

  INSERT INTO private.payment_webhook_receipts (
    provider, provider_event_id, event_type, status, attempts, locked_until
  )
  VALUES (
    p_provider, p_provider_event_id, p_event_type, 'processing', 1, v_now + interval '5 minutes'
  )
  ON CONFLICT (provider, provider_event_id) DO NOTHING;

  IF FOUND THEN
    RETURN QUERY SELECT true, false, NULL::timestamptz;
    RETURN;
  END IF;

  SELECT r.status, r.locked_until
    INTO v_status, v_locked_until
    FROM private.payment_webhook_receipts r
   WHERE r.provider = p_provider
     AND r.provider_event_id = p_provider_event_id
   FOR UPDATE;

  IF v_status = 'processed' THEN
    RETURN QUERY SELECT false, true, NULL::timestamptz;
    RETURN;
  END IF;

  IF v_status = 'processing' AND v_locked_until > v_now THEN
    RETURN QUERY SELECT false, false, v_locked_until;
    RETURN;
  END IF;

  UPDATE private.payment_webhook_receipts r
     SET status = 'processing',
         event_type = p_event_type,
         attempts = r.attempts + 1,
         locked_until = v_now + interval '5 minutes',
         last_error_code = NULL,
         updated_at = v_now
   WHERE r.provider = p_provider
     AND r.provider_event_id = p_provider_event_id;

  RETURN QUERY SELECT true, false, NULL::timestamptz;
END;
$function$;

CREATE OR REPLACE FUNCTION public.complete_payment_webhook_event(
  p_provider text,
  p_provider_event_id text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
BEGIN
  UPDATE private.payment_webhook_receipts r
     SET status = 'processed',
         processed_at = pg_catalog.now(),
         updated_at = pg_catalog.now(),
         locked_until = pg_catalog.now()
   WHERE r.provider = p_provider
     AND r.provider_event_id = p_provider_event_id
     AND r.status = 'processing';

  IF NOT FOUND THEN
    RAISE EXCEPTION 'WEBHOOK_EVENT_CLAIM_NOT_FOUND';
  END IF;
END;
$function$;

CREATE OR REPLACE FUNCTION public.fail_payment_webhook_event(
  p_provider text,
  p_provider_event_id text,
  p_error_code text DEFAULT 'WEBHOOK_PROCESSING_FAILED'
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
BEGIN
  UPDATE private.payment_webhook_receipts r
     SET status = 'failed',
         last_error_code = pg_catalog.left(COALESCE(p_error_code, 'WEBHOOK_PROCESSING_FAILED'), 120),
         updated_at = pg_catalog.now(),
         locked_until = pg_catalog.now()
   WHERE r.provider = p_provider
     AND r.provider_event_id = p_provider_event_id
     AND r.status = 'processing';
END;
$function$;

REVOKE ALL ON FUNCTION public.claim_payment_webhook_event(text, text, text)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.complete_payment_webhook_event(text, text)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.fail_payment_webhook_event(text, text, text)
  FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.claim_payment_webhook_event(text, text, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.complete_payment_webhook_event(text, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.fail_payment_webhook_event(text, text, text) TO service_role;
