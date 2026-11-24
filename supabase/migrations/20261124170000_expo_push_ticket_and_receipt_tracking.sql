-- Durable Expo push ticket/receipt tracking and invalid-device-token cleanup.
-- Candidate migration only. Reconcile migration history and replay in isolated staging.
-- Push payloads retain the existing generic-by-default lock-screen privacy policy.

CREATE TABLE IF NOT EXISTS public.push_delivery_attempts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  notification_id uuid NOT NULL REFERENCES public.notifications(id) ON DELETE CASCADE,
  recipient_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  device_push_token_id uuid REFERENCES public.device_push_tokens(id) ON DELETE SET NULL,
  pg_net_request_id bigint UNIQUE,
  expo_ticket_id text UNIQUE,
  delivery_status text NOT NULL DEFAULT 'queued'
    CHECK (delivery_status IN (
      'queued',
      'enqueue_error',
      'request_error',
      'ticket_error',
      'ticketed',
      'handed_off',
      'receipt_error',
      'receipt_unavailable'
    )),
  ticket_status text,
  ticket_error_code text,
  ticket_error_message text,
  receipt_status text,
  receipt_error_code text,
  receipt_error_message text,
  ticket_received_at timestamptz,
  receipt_last_checked_at timestamptz,
  receipt_received_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS push_delivery_attempts_notification_device_uidx
  ON public.push_delivery_attempts(notification_id, device_push_token_id)
  WHERE device_push_token_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS push_delivery_attempts_net_pending_idx
  ON public.push_delivery_attempts(created_at)
  WHERE delivery_status = 'queued' AND pg_net_request_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS push_delivery_attempts_receipt_pending_idx
  ON public.push_delivery_attempts(ticket_received_at)
  WHERE delivery_status = 'ticketed';

ALTER TABLE public.push_delivery_attempts ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.push_delivery_attempts FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.push_delivery_attempts TO service_role;

-- Keep the original message-preview opt-in behavior, but store the pg_net request
-- identifier for each registered Expo token so a service worker can inspect it.
CREATE OR REPLACE FUNCTION public.dispatch_notification_push()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  token_row record;
  push_body jsonb;
  v_sender_name text;
  v_message_body text;
  v_conversation_id uuid;
  v_preview_enabled boolean := false;
  v_title text;
  v_body text;
  v_attempt_id uuid;
  v_request_id bigint;
BEGIN
  IF NEW.notification_type = 'message' AND NEW.message_id IS NOT NULL THEN
    SELECT
      coalesce(nullif(btrim(p.full_name), ''), 'AthleteN member'),
      m.body,
      m.conversation_id,
      coalesce(np.message_preview, false)
    INTO v_sender_name, v_message_body, v_conversation_id, v_preview_enabled
    FROM public.messages m
    LEFT JOIN public.profiles p ON p.user_id = m.sender_id
    LEFT JOIN public.notification_preferences np ON np.user_id = NEW.user_id
    WHERE m.id = NEW.message_id;

    v_title := CASE WHEN v_preview_enabled
      THEN 'New message from ' || coalesce(v_sender_name, 'AthleteN member')
      ELSE 'New message'
    END;
    v_body := CASE
      WHEN v_preview_enabled AND nullif(btrim(v_message_body), '') IS NOT NULL THEN v_message_body
      WHEN v_preview_enabled THEN 'You received an attachment.'
      ELSE 'Open AthleteN to view your new message.'
    END;
  ELSE
    v_title := coalesce(NEW.title, 'AthleteN');
    v_body := coalesce(NEW.body, '');
  END IF;

  FOR token_row IN
    SELECT dpt.id, dpt.token
    FROM public.device_push_tokens dpt
    WHERE dpt.user_id = NEW.user_id
      AND (
        dpt.token LIKE 'ExponentPushToken[%'
        OR dpt.token LIKE 'ExpoPushToken[%'
      )
  LOOP
    v_attempt_id := NULL;
    BEGIN
      INSERT INTO public.push_delivery_attempts (
        notification_id, recipient_user_id, device_push_token_id, delivery_status
      )
      VALUES (NEW.id, NEW.user_id, token_row.id, 'queued')
      ON CONFLICT (notification_id, device_push_token_id)
        WHERE device_push_token_id IS NOT NULL
      DO NOTHING
      RETURNING id INTO v_attempt_id;

      IF v_attempt_id IS NULL THEN
        CONTINUE;
      END IF;

      push_body := jsonb_build_object(
        'to', token_row.token,
        'title', v_title,
        'body', v_body,
        'sound', 'default',
        'priority', 'high',
        'channelId', 'athleten-default-v2',
        'data', jsonb_build_object(
          'notificationId', NEW.id::text,
          'notificationType', coalesce(NEW.notification_type, 'general'),
          'messageId', NEW.message_id::text,
          'conversationId', v_conversation_id::text,
          'route', coalesce(NEW.action_route, '/notifications')
        )
      );

      v_request_id := net.http_post(
        url := 'https://exp.host/--/api/v2/push/send',
        body := push_body,
        headers := '{"Content-Type":"application/json"}'::jsonb,
        timeout_milliseconds := 5000
      );

      UPDATE public.push_delivery_attempts
      SET pg_net_request_id = v_request_id,
          updated_at = now()
      WHERE id = v_attempt_id;
    EXCEPTION WHEN OTHERS THEN
      IF v_attempt_id IS NOT NULL THEN
        UPDATE public.push_delivery_attempts
        SET delivery_status = 'enqueue_error',
            ticket_error_message = left(SQLERRM, 500),
            updated_at = now()
        WHERE id = v_attempt_id;
      END IF;
      RAISE WARNING 'AthleteN push enqueue failed for notification % (SQLSTATE %)',
        NEW.id, SQLSTATE;
    END;
  END LOOP;

  RETURN NEW;
END;
$function$;

REVOKE ALL ON FUNCTION public.dispatch_notification_push() FROM PUBLIC, anon, authenticated;

-- Convert completed pg_net HTTP responses into Expo tickets. A successful ticket
-- means Expo accepted the request, not that a device received the notification.
CREATE OR REPLACE FUNCTION public.process_expo_push_ticket_responses(
  p_batch_size integer DEFAULT 200
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_attempt record;
  v_response jsonb;
  v_ticket jsonb;
  v_error_code text;
  v_processed integer := 0;
  v_limit integer := least(greatest(coalesce(p_batch_size, 200), 1), 500);
BEGIN
  FOR v_attempt IN
    SELECT
      p.id,
      p.device_push_token_id,
      p.pg_net_request_id,
      r.status_code,
      r.content,
      r.error_msg
    FROM public.push_delivery_attempts p
    LEFT JOIN net._http_response r ON r.id = p.pg_net_request_id
    WHERE p.delivery_status = 'queued'
      AND p.pg_net_request_id IS NOT NULL
      AND (
        r.id IS NOT NULL
        OR p.created_at < now() - interval '15 minutes'
      )
    ORDER BY p.created_at
    LIMIT v_limit
    FOR UPDATE OF p SKIP LOCKED
  LOOP
    IF v_attempt.status_code IS NULL AND v_attempt.error_msg IS NULL THEN
      UPDATE public.push_delivery_attempts
      SET delivery_status = 'request_error',
          ticket_error_message = 'No pg_net response was available within 15 minutes',
          updated_at = now()
      WHERE id = v_attempt.id;
      v_processed := v_processed + 1;
      CONTINUE;
    END IF;

    IF v_attempt.status_code IS NULL OR v_attempt.status_code < 200 OR v_attempt.status_code >= 300 THEN
      UPDATE public.push_delivery_attempts
      SET delivery_status = 'request_error',
          ticket_error_message = left(coalesce(v_attempt.error_msg, 'Expo HTTP request failed'), 500),
          updated_at = now()
      WHERE id = v_attempt.id;
      v_processed := v_processed + 1;
      CONTINUE;
    END IF;

    BEGIN
      v_response := coalesce(v_attempt.content, '{}')::jsonb;
      v_ticket := v_response->'data'->0;
    EXCEPTION WHEN OTHERS THEN
      v_ticket := NULL;
    END;

    IF coalesce(v_ticket->>'status', '') = 'ok'
       AND nullif(v_ticket->>'id', '') IS NOT NULL THEN
      UPDATE public.push_delivery_attempts
      SET delivery_status = 'ticketed',
          ticket_status = 'ok',
          expo_ticket_id = v_ticket->>'id',
          ticket_received_at = now(),
          ticket_error_code = NULL,
          ticket_error_message = NULL,
          updated_at = now()
      WHERE id = v_attempt.id;
    ELSE
      v_error_code := nullif(v_ticket->'details'->>'error', '');
      UPDATE public.push_delivery_attempts
      SET delivery_status = 'ticket_error',
          ticket_status = coalesce(v_ticket->>'status', 'error'),
          ticket_error_code = v_error_code,
          ticket_error_message = left(coalesce(v_ticket->>'message', v_attempt.error_msg, 'Expo rejected the push ticket'), 500),
          updated_at = now()
      WHERE id = v_attempt.id;

      IF v_error_code = 'DeviceNotRegistered' AND v_attempt.device_push_token_id IS NOT NULL THEN
        DELETE FROM public.device_push_tokens
        WHERE id = v_attempt.device_push_token_id;
      END IF;
    END IF;

    v_processed := v_processed + 1;
  END LOOP;

  RETURN v_processed;
END;
$function$;

-- Claim receipts at least 15 minutes after the ticket. Missing receipts remain
-- retryable; Expo may omit them while provider handoff is still being processed.
CREATE OR REPLACE FUNCTION public.get_expo_push_receipt_batch(
  p_batch_size integer DEFAULT 100
)
RETURNS TABLE(attempt_id uuid, ticket_id text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_limit integer := least(greatest(coalesce(p_batch_size, 100), 1), 100);
BEGIN
  UPDATE public.push_delivery_attempts p
  SET delivery_status = 'receipt_unavailable',
      receipt_status = 'unavailable',
      updated_at = now()
  WHERE p.delivery_status = 'ticketed'
    AND p.ticket_received_at < now() - interval '23 hours';

  RETURN QUERY
  WITH due AS (
    SELECT p.id
    FROM public.push_delivery_attempts p
    WHERE p.delivery_status = 'ticketed'
      AND p.ticket_received_at <= now() - interval '15 minutes'
      AND (
        p.receipt_last_checked_at IS NULL
        OR p.receipt_last_checked_at <= now() - interval '15 minutes'
      )
    ORDER BY p.ticket_received_at
    LIMIT v_limit
    FOR UPDATE SKIP LOCKED
  )
  UPDATE public.push_delivery_attempts p
  SET receipt_last_checked_at = now(),
      updated_at = now()
  FROM due
  WHERE p.id = due.id
  RETURNING p.id, p.expo_ticket_id;
END;
$function$;

CREATE OR REPLACE FUNCTION public.record_expo_push_receipt_results(
  p_results jsonb
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_result jsonb;
  v_code text;
  v_attempt_id uuid;
  v_device_push_token_id uuid;
  v_changed integer := 0;
BEGIN
  IF jsonb_typeof(p_results) <> 'array' THEN
    RAISE EXCEPTION 'Receipt results must be a JSON array';
  END IF;
  IF jsonb_array_length(p_results) > 100 THEN
    RAISE EXCEPTION 'At most 100 receipt results may be processed at once';
  END IF;

  FOR v_result IN SELECT value FROM jsonb_array_elements(p_results)
  LOOP
    v_code := nullif(v_result->>'error_code', '');
    UPDATE public.push_delivery_attempts
    SET receipt_status = coalesce(v_result->>'status', 'error'),
        receipt_error_code = v_code,
        receipt_error_message = left(coalesce(v_result->>'message', ''), 500),
        delivery_status = CASE
          WHEN v_result->>'status' = 'ok' THEN 'handed_off'
          ELSE 'receipt_error'
        END,
        receipt_received_at = now(),
        updated_at = now()
    WHERE expo_ticket_id = v_result->>'ticket_id'
      AND delivery_status = 'ticketed'
    RETURNING id, device_push_token_id INTO v_attempt_id, v_device_push_token_id;

    IF FOUND THEN
      v_changed := v_changed + 1;
      IF v_code = 'DeviceNotRegistered' THEN
        DELETE FROM public.device_push_tokens
        WHERE id = v_device_push_token_id;
      END IF;
    END IF;
  END LOOP;

  RETURN v_changed;
END;
$function$;

REVOKE ALL ON FUNCTION public.process_expo_push_ticket_responses(integer) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.get_expo_push_receipt_batch(integer) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.record_expo_push_receipt_results(jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.process_expo_push_ticket_responses(integer) TO service_role;
GRANT EXECUTE ON FUNCTION public.get_expo_push_receipt_batch(integer) TO service_role;
GRANT EXECUTE ON FUNCTION public.record_expo_push_receipt_results(jsonb) TO service_role;

COMMENT ON TABLE public.push_delivery_attempts IS
  'Private service-role-only ledger of pg_net requests, Expo tickets, and Expo receipts. Handed-off means Expo reports provider acceptance, not device receipt.';
