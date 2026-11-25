-- AthleteN notification system reliability and event coverage.
-- Candidate migration: reconcile the complete migration ledger and replay in isolated staging
-- before applying to production. No live production database is changed by this file.

-- Give attendance alerts a stable source record so clients can open the exact attendance entry.
ALTER TABLE public.notifications
  ADD COLUMN IF NOT EXISTS attendance_record_id uuid;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'notifications_attendance_record_id_fkey'
      AND conrelid = 'public.notifications'::regclass
  ) THEN
    ALTER TABLE public.notifications
      ADD CONSTRAINT notifications_attendance_record_id_fkey
      FOREIGN KEY (attendance_record_id)
      REFERENCES public.attendance_records(id)
      ON DELETE SET NULL;
  END IF;
END;
$$;

CREATE INDEX IF NOT EXISTS notifications_attendance_record_id_idx
  ON public.notifications(attendance_record_id)
  WHERE attendance_record_id IS NOT NULL;

-- Keep the notification linked to the precise attendance change.
CREATE OR REPLACE FUNCTION public.athleten_notify_attendance_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_status text;
BEGIN
  IF TG_OP = 'UPDATE' AND NEW.status IS NOT DISTINCT FROM OLD.status THEN
    RETURN NEW;
  END IF;

  v_status := coalesce(nullif(btrim(NEW.status), ''), 'updated');

  INSERT INTO public.notifications (
    user_id,
    title,
    body,
    notification_type,
    action_route,
    attendance_record_id,
    created_at,
    updated_at
  )
  VALUES (
    NEW.user_id,
    'Training attendance updated',
    'Your coach marked your attendance: ' || replace(v_status, '_', ' ') || '.',
    'training',
    '/attendance',
    NEW.id,
    now(),
    now()
  );

  RETURN NEW;
END;
$function$;

REVOKE ALL ON FUNCTION public.athleten_notify_attendance_change()
  FROM PUBLIC, anon, authenticated;

-- Training cancellation already creates a training-category alert. Do not create a
-- second message-category alert for the companion group-chat announcement.
CREATE OR REPLACE FUNCTION public.create_message_delivery_records()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
BEGIN
  INSERT INTO public.message_receipts(message_id, user_id)
  SELECT NEW.id, cm.user_id
  FROM public.conversation_members cm
  WHERE cm.conversation_id = NEW.conversation_id
    AND cm.user_id <> NEW.sender_id
  ON CONFLICT (message_id, user_id) DO NOTHING;

  IF coalesce(NEW.message_type, '') <> 'training_schedule' THEN
    INSERT INTO public.notifications(
      user_id, title, body, notification_type, action_route, message_id
    )
    SELECT
      cm.user_id,
      'New message',
      CASE
        WHEN nullif(btrim(NEW.body), '') IS NOT NULL
          THEN 'Open AthleteN to view your new message.'
        ELSE 'You received an attachment in AthleteN.'
      END,
      'message',
      '/messages',
      NEW.id
    FROM public.conversation_members cm
    LEFT JOIN public.notification_preferences np ON np.user_id = cm.user_id
    WHERE cm.conversation_id = NEW.conversation_id
      AND cm.user_id <> NEW.sender_id
      AND coalesce(np.messages, true) = true;
  END IF;

  RETURN NEW;
END;
$function$;

REVOKE ALL ON FUNCTION public.create_message_delivery_records()
  FROM PUBLIC, anon, authenticated;

-- Achievement notifications are generated from server-assigned badge records only.
CREATE OR REPLACE FUNCTION public.notify_athlete_badge_awarded()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
BEGIN
  INSERT INTO public.notifications(
    user_id, title, body, notification_type, action_route
  )
  VALUES (
    NEW.user_id,
    'Achievement unlocked',
    'You earned the ' || coalesce(nullif(btrim(NEW.badge_label), ''), 'AthleteN') || ' badge.',
    'achievement',
    '/badges'
  );
  RETURN NEW;
END;
$function$;

REVOKE ALL ON FUNCTION public.notify_athlete_badge_awarded()
  FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS athlete_badge_notification ON public.athlete_badges;
CREATE TRIGGER athlete_badge_notification
  AFTER INSERT ON public.athlete_badges
  FOR EACH ROW
  EXECUTE FUNCTION public.notify_athlete_badge_awarded();

-- Student verification decisions are private system notifications to the submitting athlete.
CREATE OR REPLACE FUNCTION public.notify_student_verification_decision()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_title text;
  v_body text;
BEGIN
  IF NEW.status NOT IN ('approved', 'rejected') THEN
    RETURN NEW;
  END IF;
  IF TG_OP = 'UPDATE' AND NEW.status IS NOT DISTINCT FROM OLD.status THEN
    RETURN NEW;
  END IF;

  IF NEW.status = 'approved' THEN
    v_title := 'Student verification approved';
    v_body := 'Your student verification was approved. Student-plan eligibility is now available.';
  ELSE
    v_title := 'Student verification needs attention';
    v_body := 'Your student verification was not approved. Review the verification page for next steps.';
  END IF;

  INSERT INTO public.notifications(
    user_id, title, body, notification_type, action_route
  )
  VALUES (NEW.user_id, v_title, v_body, 'system', '/plans');

  RETURN NEW;
END;
$function$;

REVOKE ALL ON FUNCTION public.notify_student_verification_decision()
  FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS student_verification_notification ON public.student_verifications;
CREATE TRIGGER student_verification_notification
  AFTER INSERT OR UPDATE OF status ON public.student_verifications
  FOR EACH ROW
  EXECUTE FUNCTION public.notify_student_verification_decision();

-- Notify both sides after a Coach–athlete connection becomes active.
CREATE OR REPLACE FUNCTION public.notify_coach_athlete_link_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
BEGIN
  IF NEW.status <> 'active' THEN
    RETURN NEW;
  END IF;
  IF TG_OP = 'UPDATE' AND OLD.status = 'active' THEN
    RETURN NEW;
  END IF;
  IF NEW.coach_user_id = NEW.athlete_user_id THEN
    RETURN NEW;
  END IF;

  INSERT INTO public.notifications(
    user_id, title, body, notification_type, action_route
  )
  VALUES (
    NEW.athlete_user_id,
    'Coach connection active',
    'Your Coach connection is now active in AthleteN.',
    'coach_academy',
    '/team'
  );

  INSERT INTO public.notifications(
    user_id, title, body, notification_type, action_route
  )
  VALUES (
    NEW.coach_user_id,
    'Athlete connection active',
    'An athlete connection is now active in your Coach workspace.',
    'coach_academy',
    '/coach-athletes'
  );

  RETURN NEW;
END;
$function$;

REVOKE ALL ON FUNCTION public.notify_coach_athlete_link_change()
  FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS coach_athlete_link_notification ON public.coach_athlete_links;
CREATE TRIGGER coach_athlete_link_notification
  AFTER INSERT OR UPDATE OF status ON public.coach_athlete_links
  FOR EACH ROW
  EXECUTE FUNCTION public.notify_coach_athlete_link_change();

-- Notify an invited or newly activated Academy member once per status transition.
CREATE OR REPLACE FUNCTION public.notify_academy_membership_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_academy_name text;
  v_title text;
  v_body text;
BEGIN
  IF NEW.status NOT IN ('invited', 'active') THEN
    RETURN NEW;
  END IF;
  IF TG_OP = 'UPDATE' AND NEW.status IS NOT DISTINCT FROM OLD.status THEN
    RETURN NEW;
  END IF;

  SELECT a.name
  INTO v_academy_name
  FROM public.academies a
  WHERE a.id = NEW.academy_id;

  IF NEW.status = 'invited' THEN
    v_title := 'Academy invitation';
    v_body := 'You have been invited to join ' || coalesce(nullif(btrim(v_academy_name), ''), 'an AthleteN academy') || '.';
  ELSE
    v_title := 'Academy membership active';
    v_body := 'Your membership in ' || coalesce(nullif(btrim(v_academy_name), ''), 'your AthleteN academy') || ' is now active.';
  END IF;

  INSERT INTO public.notifications(
    user_id, title, body, notification_type, action_route
  )
  VALUES (NEW.user_id, v_title, v_body, 'academy', '/academy');

  RETURN NEW;
END;
$function$;

REVOKE ALL ON FUNCTION public.notify_academy_membership_change()
  FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS academy_membership_notification ON public.academy_memberships;
CREATE TRIGGER academy_membership_notification
  AFTER INSERT OR UPDATE OF status ON public.academy_memberships
  FOR EACH ROW
  EXECUTE FUNCTION public.notify_academy_membership_change();

-- Only announce actual plan/status changes; unchanged webhook retries remain quiet.
CREATE OR REPLACE FUNCTION public.notify_subscription_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_plan text;
  v_title text;
  v_body text;
BEGIN
  IF coalesce(NEW.plan_id, 'free') = 'free' THEN
    RETURN NEW;
  END IF;
  IF TG_OP = 'UPDATE'
     AND NEW.plan_id IS NOT DISTINCT FROM OLD.plan_id
     AND NEW.status IS NOT DISTINCT FROM OLD.status THEN
    RETURN NEW;
  END IF;

  v_plan := initcap(replace(coalesce(NEW.plan_id, 'AthleteN'), '_', ' '));
  v_title := CASE
    WHEN NEW.status = 'past_due' THEN 'Subscription payment needs attention'
    WHEN NEW.status IN ('cancelled', 'canceled') THEN 'Subscription cancelled'
    ELSE 'Subscription updated'
  END;
  v_body := 'Your ' || v_plan || ' subscription status is ' || replace(coalesce(NEW.status, 'updated'), '_', ' ') || '.';

  INSERT INTO public.notifications(
    user_id, title, body, notification_type, action_route
  )
  VALUES (NEW.user_id, v_title, v_body, 'system', '/plans');

  RETURN NEW;
END;
$function$;

REVOKE ALL ON FUNCTION public.notify_subscription_change()
  FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS subscription_notification ON public.subscriptions;
CREATE TRIGGER subscription_notification
  AFTER INSERT OR UPDATE OF plan_id, status ON public.subscriptions
  FOR EACH ROW
  EXECUTE FUNCTION public.notify_subscription_change();

-- Improve delivery state: distinguish permanent failures and bounded, retryable send errors.
ALTER TABLE public.push_delivery_attempts
  ADD COLUMN IF NOT EXISTS send_attempt_count integer NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS next_attempt_at timestamptz NOT NULL DEFAULT now(),
  ADD COLUMN IF NOT EXISTS last_attempt_at timestamptz NOT NULL DEFAULT now(),
  ADD COLUMN IF NOT EXISTS last_http_status integer;

ALTER TABLE public.push_delivery_attempts
  DROP CONSTRAINT IF EXISTS push_delivery_attempts_delivery_status_check;

ALTER TABLE public.push_delivery_attempts
  ADD CONSTRAINT push_delivery_attempts_delivery_status_check
  CHECK (delivery_status IN (
    'queued',
    'enqueue_error',
    'request_error',
    'ticket_error',
    'ticketed',
    'handed_off',
    'receipt_error',
    'receipt_unavailable',
    'failed'
  ));

ALTER TABLE public.push_delivery_attempts
  DROP CONSTRAINT IF EXISTS push_delivery_attempts_send_attempt_count_check;

ALTER TABLE public.push_delivery_attempts
  ADD CONSTRAINT push_delivery_attempts_send_attempt_count_check
  CHECK (send_attempt_count BETWEEN 1 AND 5);

CREATE INDEX IF NOT EXISTS push_delivery_attempts_retry_idx
  ON public.push_delivery_attempts(next_attempt_at, created_at)
  WHERE delivery_status IN ('enqueue_error', 'request_error');

CREATE TABLE IF NOT EXISTS public.push_receipt_poll_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  pg_net_request_id bigint NOT NULL UNIQUE,
  ticket_ids text[] NOT NULL,
  poll_status text NOT NULL DEFAULT 'queued'
    CHECK (poll_status IN ('queued', 'processed', 'failed')),
  error_message text,
  created_at timestamptz NOT NULL DEFAULT now(),
  processed_at timestamptz
);

ALTER TABLE public.push_receipt_poll_requests ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.push_receipt_poll_requests FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.push_receipt_poll_requests TO service_role;

-- One push request is one token, so Expo may return data as either a single object
-- or a one-element array. Handle both forms.
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
  v_data jsonb;
  v_ticket jsonb;
  v_error_code text;
  v_error_message text;
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
        OR p.last_attempt_at < now() - interval '15 minutes'
      )
    ORDER BY p.last_attempt_at
    LIMIT v_limit
    FOR UPDATE OF p SKIP LOCKED
  LOOP
    IF v_attempt.status_code IS NULL AND v_attempt.error_msg IS NULL THEN
      UPDATE public.push_delivery_attempts
      SET delivery_status = CASE WHEN send_attempt_count >= 5 THEN 'failed' ELSE 'request_error' END,
          ticket_error_message = 'No pg_net response was available within 15 minutes',
          next_attempt_at = now() + interval '1 minute',
          updated_at = now()
      WHERE id = v_attempt.id;
      v_processed := v_processed + 1;
      CONTINUE;
    END IF;

    IF v_attempt.error_msg IS NOT NULL
       OR v_attempt.status_code = 429
       OR v_attempt.status_code >= 500 THEN
      UPDATE public.push_delivery_attempts
      SET delivery_status = CASE WHEN send_attempt_count >= 5 THEN 'failed' ELSE 'request_error' END,
          last_http_status = v_attempt.status_code,
          ticket_error_message = left(coalesce(v_attempt.error_msg, 'Expo push service temporarily unavailable'), 500),
          next_attempt_at = now() + interval '1 minute',
          updated_at = now()
      WHERE id = v_attempt.id;
      v_processed := v_processed + 1;
      CONTINUE;
    END IF;

    IF v_attempt.status_code IS NULL
       OR v_attempt.status_code < 200
       OR v_attempt.status_code >= 300 THEN
      UPDATE public.push_delivery_attempts
      SET delivery_status = 'ticket_error',
          last_http_status = v_attempt.status_code,
          ticket_status = 'error',
          ticket_error_message = left(coalesce(v_attempt.error_msg, 'Expo rejected the push request'), 500),
          updated_at = now()
      WHERE id = v_attempt.id;
      v_processed := v_processed + 1;
      CONTINUE;
    END IF;

    BEGIN
      v_response := coalesce(v_attempt.content, '{}')::jsonb;
      v_data := v_response->'data';
      IF jsonb_typeof(v_data) = 'array' THEN
        v_ticket := v_data->0;
      ELSIF jsonb_typeof(v_data) = 'object' THEN
        v_ticket := v_data;
      ELSE
        v_ticket := NULL;
      END IF;
    EXCEPTION WHEN OTHERS THEN
      v_ticket := NULL;
      v_response := '{}'::jsonb;
    END;

    IF coalesce(v_ticket->>'status', '') = 'ok'
       AND nullif(v_ticket->>'id', '') IS NOT NULL THEN
      UPDATE public.push_delivery_attempts
      SET delivery_status = 'ticketed',
          last_http_status = v_attempt.status_code,
          ticket_status = 'ok',
          expo_ticket_id = v_ticket->>'id',
          ticket_received_at = now(),
          ticket_error_code = NULL,
          ticket_error_message = NULL,
          updated_at = now()
      WHERE id = v_attempt.id;
    ELSE
      v_error_code := coalesce(
        nullif(v_ticket->'details'->>'error', ''),
        nullif(v_response->'errors'->0->>'code', '')
      );
      v_error_message := coalesce(
        nullif(v_ticket->>'message', ''),
        nullif(v_response->'errors'->0->>'message', ''),
        'Expo rejected the push ticket'
      );

      UPDATE public.push_delivery_attempts
      SET delivery_status = CASE
            WHEN v_error_code IN ('TOO_MANY_REQUESTS', 'SERVER_ERROR')
                 AND send_attempt_count < 5 THEN 'request_error'
            WHEN v_error_code IN ('TOO_MANY_REQUESTS', 'SERVER_ERROR') THEN 'failed'
            ELSE 'ticket_error'
          END,
          last_http_status = v_attempt.status_code,
          ticket_status = coalesce(v_ticket->>'status', 'error'),
          ticket_error_code = v_error_code,
          ticket_error_message = left(v_error_message, 500),
          next_attempt_at = now() + interval '1 minute',
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

-- Bounded exponential retry for transient network/Expo rate-limit failures.
CREATE OR REPLACE FUNCTION public.retry_expo_push_delivery_attempts(
  p_batch_size integer DEFAULT 100
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_attempt record;
  v_sender_name text;
  v_message_body text;
  v_conversation_id uuid;
  v_preview_enabled boolean;
  v_title text;
  v_body text;
  v_group text;
  v_payload jsonb;
  v_request_id bigint;
  v_next_count integer;
  v_delay_seconds integer;
  v_processed integer := 0;
  v_limit integer := least(greatest(coalesce(p_batch_size, 100), 1), 200);
BEGIN
  UPDATE public.push_delivery_attempts p
  SET delivery_status = 'failed',
      ticket_error_message = coalesce(ticket_error_message, 'Push token is no longer registered'),
      updated_at = now()
  WHERE p.delivery_status IN ('enqueue_error', 'request_error')
    AND p.next_attempt_at <= now()
    AND p.device_push_token_id IS NULL;

  UPDATE public.push_delivery_attempts p
  SET delivery_status = 'failed',
      ticket_error_message = coalesce(ticket_error_message, 'Maximum retry attempts reached'),
      updated_at = now()
  WHERE p.delivery_status IN ('enqueue_error', 'request_error')
    AND p.next_attempt_at <= now()
    AND p.send_attempt_count >= 5;

  FOR v_attempt IN
    SELECT
      p.id,
      p.notification_id,
      p.device_push_token_id,
      p.send_attempt_count,
      dpt.token,
      n.user_id,
      n.title,
      n.body,
      n.notification_type,
      n.action_route,
      n.message_id
    FROM public.push_delivery_attempts p
    JOIN public.notifications n ON n.id = p.notification_id
    JOIN public.device_push_tokens dpt ON dpt.id = p.device_push_token_id
    WHERE p.delivery_status IN ('enqueue_error', 'request_error')
      AND p.next_attempt_at <= now()
      AND p.send_attempt_count < 5
      AND (
        dpt.token LIKE 'ExponentPushToken[%'
        OR dpt.token LIKE 'ExpoPushToken[%'
      )
    ORDER BY p.next_attempt_at, p.created_at
    LIMIT v_limit
    FOR UPDATE OF p SKIP LOCKED
  LOOP
    v_sender_name := NULL;
    v_message_body := NULL;
    v_conversation_id := NULL;
    v_preview_enabled := false;
    v_title := coalesce(v_attempt.title, 'AthleteN');
    v_body := coalesce(v_attempt.body, '');
    v_group := NULL;

    IF v_attempt.notification_type = 'message' AND v_attempt.message_id IS NOT NULL THEN
      SELECT
        coalesce(nullif(btrim(profile.full_name), ''), 'AthleteN member'),
        message.body,
        message.conversation_id,
        coalesce(preference.message_preview, false)
      INTO v_sender_name, v_message_body, v_conversation_id, v_preview_enabled
      FROM public.messages message
      LEFT JOIN public.profiles profile ON profile.user_id = message.sender_id
      LEFT JOIN public.notification_preferences preference ON preference.user_id = v_attempt.user_id
      WHERE message.id = v_attempt.message_id;

      v_title := CASE
        WHEN v_preview_enabled THEN 'New message from ' || coalesce(v_sender_name, 'AthleteN member')
        ELSE 'New message'
      END;
      v_body := CASE
        WHEN v_preview_enabled AND nullif(btrim(v_message_body), '') IS NOT NULL THEN v_message_body
        WHEN v_preview_enabled THEN 'You received an attachment.'
        ELSE 'Open AthleteN to view your new message.'
      END;
      v_group := CASE
        WHEN v_conversation_id IS NOT NULL THEN 'athleten-conversation-' || v_conversation_id::text
        ELSE NULL
      END;
    END IF;

    v_payload := jsonb_build_object(
      'to', v_attempt.token,
      'title', v_title,
      'body', v_body,
      'sound', 'default',
      'priority', 'high',
      'channelId', 'athleten-default-v2',
      'collapseId', v_group,
      'tag', v_group,
      'threadId', v_group,
      'data', jsonb_build_object(
        'notificationId', v_attempt.notification_id::text,
        'notificationType', coalesce(v_attempt.notification_type, 'general'),
        'messageId', v_attempt.message_id::text,
        'conversationId', v_conversation_id::text,
        'route', coalesce(v_attempt.action_route, '/notifications')
      )
    );

    v_next_count := v_attempt.send_attempt_count + 1;
    v_delay_seconds := least((60 * power(2, v_attempt.send_attempt_count - 1))::integer, 1800);

    BEGIN
      v_request_id := net.http_post(
        url := 'https://exp.host/--/api/v2/push/send',
        body := v_payload,
        headers := '{"Content-Type":"application/json"}'::jsonb,
        timeout_milliseconds := 5000
      );

      UPDATE public.push_delivery_attempts
      SET pg_net_request_id = v_request_id,
          delivery_status = 'queued',
          send_attempt_count = v_next_count,
          last_attempt_at = now(),
          next_attempt_at = now() + make_interval(secs => v_delay_seconds),
          last_http_status = NULL,
          ticket_status = NULL,
          ticket_error_code = NULL,
          ticket_error_message = NULL,
          updated_at = now()
      WHERE id = v_attempt.id;
    EXCEPTION WHEN OTHERS THEN
      UPDATE public.push_delivery_attempts
      SET send_attempt_count = v_next_count,
          last_attempt_at = now(),
          delivery_status = CASE WHEN v_next_count >= 5 THEN 'failed' ELSE 'enqueue_error' END,
          next_attempt_at = now() + make_interval(secs => v_delay_seconds),
          ticket_error_message = left(SQLERRM, 500),
          updated_at = now()
      WHERE id = v_attempt.id;
    END;

    v_processed := v_processed + 1;
  END LOOP;

  RETURN v_processed;
END;
$function$;

-- The receipt API returns an object keyed by ticket ID. Batch no more than 100 IDs here.
CREATE OR REPLACE FUNCTION public.enqueue_expo_push_receipt_poll()
RETURNS bigint
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_ticket_ids text[];
  v_request_id bigint;
BEGIN
  SELECT coalesce(array_agg(batch.ticket_id), ARRAY[]::text[])
  INTO v_ticket_ids
  FROM public.get_expo_push_receipt_batch(100) AS batch;

  IF coalesce(cardinality(v_ticket_ids), 0) = 0 THEN
    RETURN NULL;
  END IF;

  v_request_id := net.http_post(
    url := 'https://exp.host/--/api/v2/push/getReceipts',
    body := jsonb_build_object('ids', to_jsonb(v_ticket_ids)),
    headers := '{"Content-Type":"application/json"}'::jsonb,
    timeout_milliseconds := 5000
  );

  INSERT INTO public.push_receipt_poll_requests(pg_net_request_id, ticket_ids)
  VALUES (v_request_id, v_ticket_ids)
  ON CONFLICT (pg_net_request_id) DO NOTHING;

  RETURN v_request_id;
END;
$function$;

CREATE OR REPLACE FUNCTION public.process_expo_push_receipt_poll_responses(
  p_batch_size integer DEFAULT 100
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_poll record;
  v_response jsonb;
  v_results jsonb;
  v_updated integer;
  v_processed integer := 0;
  v_limit integer := least(greatest(coalesce(p_batch_size, 100), 1), 200);
BEGIN
  FOR v_poll IN
    SELECT
      poll.id,
      poll.pg_net_request_id,
      response.status_code,
      response.content,
      response.error_msg
    FROM public.push_receipt_poll_requests poll
    LEFT JOIN net._http_response response ON response.id = poll.pg_net_request_id
    WHERE poll.poll_status = 'queued'
      AND (
        response.id IS NOT NULL
        OR poll.created_at < now() - interval '10 minutes'
      )
    ORDER BY poll.created_at
    LIMIT v_limit
    FOR UPDATE OF poll SKIP LOCKED
  LOOP
    IF v_poll.status_code IS NULL OR v_poll.status_code < 200 OR v_poll.status_code >= 300 THEN
      UPDATE public.push_receipt_poll_requests
      SET poll_status = 'failed',
          error_message = left(coalesce(v_poll.error_msg, 'Expo receipt request failed or timed out'), 500),
          processed_at = now()
      WHERE id = v_poll.id;
      v_processed := v_processed + 1;
      CONTINUE;
    END IF;

    BEGIN
      v_response := coalesce(v_poll.content, '{}')::jsonb;
      IF jsonb_typeof(v_response->'data') = 'object' THEN
        SELECT coalesce(
          jsonb_agg(jsonb_build_object(
            'ticket_id', item.key,
            'status', coalesce(item.value->>'status', 'error'),
            'message', coalesce(item.value->>'message', ''),
            'error_code', coalesce(item.value->'details'->>'error', '')
          )),
          '[]'::jsonb
        )
        INTO v_results
        FROM jsonb_each(v_response->'data') AS item;
      ELSE
        v_results := '[]'::jsonb;
      END IF;
    EXCEPTION WHEN OTHERS THEN
      v_results := '[]'::jsonb;
    END;

    IF jsonb_array_length(v_results) > 0 THEN
      SELECT public.record_expo_push_receipt_results(v_results)
      INTO v_updated;
    ELSE
      v_updated := 0;
    END IF;

    UPDATE public.push_receipt_poll_requests
    SET poll_status = 'processed',
        error_message = NULL,
        processed_at = now()
    WHERE id = v_poll.id;

    v_processed := v_processed + 1;
  END LOOP;

  RETURN v_processed;
END;
$function$;

-- One minute cycle: ticket reconciliation, retry transient sends, process receipts,
-- then request the next receipt batch. All operations stay inside the database.
CREATE OR REPLACE FUNCTION public.run_push_delivery_cycle()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_tickets integer;
  v_retries integer;
  v_receipt_results integer;
  v_receipt_request bigint;
BEGIN
  v_tickets := public.process_expo_push_ticket_responses(200);
  v_retries := public.retry_expo_push_delivery_attempts(100);
  v_receipt_results := public.process_expo_push_receipt_poll_responses(100);
  v_receipt_request := public.enqueue_expo_push_receipt_poll();

  RETURN jsonb_build_object(
    'tickets_processed', v_tickets,
    'send_retries_queued', v_retries,
    'receipt_polls_processed', v_receipt_results,
    'receipt_request_id', v_receipt_request
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.retry_expo_push_delivery_attempts(integer)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.enqueue_expo_push_receipt_poll()
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.process_expo_push_receipt_poll_responses(integer)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.run_push_delivery_cycle()
  FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.retry_expo_push_delivery_attempts(integer) TO service_role;
GRANT EXECUTE ON FUNCTION public.enqueue_expo_push_receipt_poll() TO service_role;
GRANT EXECUTE ON FUNCTION public.process_expo_push_receipt_poll_responses(integer) TO service_role;
GRANT EXECUTE ON FUNCTION public.run_push_delivery_cycle() TO service_role;

-- Enable pg_cron where the managed database makes it available, then install one
-- idempotently named server-side job. Local Postgres test images may not ship pg_cron.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_available_extensions WHERE name = 'pg_cron') THEN
    EXECUTE 'CREATE EXTENSION IF NOT EXISTS pg_cron';
  END IF;

  IF to_regnamespace('cron') IS NOT NULL THEN
    EXECUTE $schedule$
      SELECT cron.schedule(
        'athleten-push-delivery-cycle',
        '* * * * *',
        'SELECT public.run_push_delivery_cycle();'
      )
    $schedule$;
  END IF;
END;
$$;

COMMENT ON TABLE public.push_receipt_poll_requests IS
  'Private pg_net request ledger for scheduled Expo push receipt polling.';
COMMENT ON FUNCTION public.run_push_delivery_cycle() IS
  'Scheduled server-side worker for Expo ticket processing, bounded send retries and receipt polling.';
