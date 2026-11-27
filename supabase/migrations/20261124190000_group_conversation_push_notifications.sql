-- Group native push alerts by conversation without exposing message contents.
-- Expo maps collapseId to Android FCM collapse_key and iOS apns-collapse-id;
-- tag replaces an already displayed Android notification and threadId groups
-- related iOS notifications in Notification Center.
-- Candidate migration only; apply after the documented staging replay.

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
  v_conversation_group text;
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
    v_conversation_group := CASE
      WHEN v_conversation_id IS NOT NULL THEN 'athleten-conversation-' || v_conversation_id::text
      ELSE NULL
    END;
  ELSE
    v_title := coalesce(NEW.title, 'AthleteN');
    v_body := coalesce(NEW.body, '');
    v_conversation_group := NULL;
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
        'collapseId', v_conversation_group,
        'tag', v_conversation_group,
        'threadId', v_conversation_group,
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

COMMENT ON FUNCTION public.dispatch_notification_push() IS
  'Dispatches privacy-aware Expo push messages and groups message alerts by conversation using collapse, tag, and thread identifiers.';

