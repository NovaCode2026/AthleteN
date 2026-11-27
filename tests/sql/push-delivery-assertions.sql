\set ON_ERROR_STOP on

CREATE TRIGGER notifications_push_after_insert
AFTER INSERT ON public.notifications
FOR EACH ROW EXECUTE FUNCTION public.dispatch_notification_push();

INSERT INTO public.notifications(user_id,title,body,notification_type,action_route,message_id)
VALUES (
 '10000000-0000-4000-8000-000000000002',
 'New message',
 'Open AthleteN to view your new message.',
 'message',
 '/messages',
 '20000000-0000-4000-8000-000000000001'
);

DO $$
DECLARE v_count integer; v_generic_count integer;
BEGIN
  SELECT count(*) INTO v_count FROM public.push_delivery_attempts;
  IF v_count <> 2 THEN RAISE EXCEPTION 'Expected two per-device push attempts, got %', v_count; END IF;
  SELECT count(*) INTO v_generic_count
  FROM net.http_request_records
  WHERE body->>'body' = 'Open AthleteN to view your new message.';
  IF v_generic_count <> 2 THEN RAISE EXCEPTION 'Message preview preference was not respected'; END IF;
END
$$;

INSERT INTO net._http_response(id,status_code,content)
SELECT
  p.pg_net_request_id,
  200,
  CASE
    WHEN r.body->>'to' LIKE '%TEST_VALID_0001%'
      THEN '{"data":[{"status":"ok","id":"ticket-valid-0001"}]}'
    ELSE '{"data":[{"status":"error","message":"device is no longer registered","details":{"error":"DeviceNotRegistered"}}]}'
  END
FROM public.push_delivery_attempts p
JOIN net.http_request_records r ON r.id = p.pg_net_request_id;

SET ROLE service_role;
SELECT public.process_expo_push_ticket_responses(100);
DO $$
DECLARE v_ticketed integer; v_ticket_errors integer;
BEGIN
  SELECT count(*) INTO v_ticketed FROM public.push_delivery_attempts WHERE delivery_status='ticketed';
  SELECT count(*) INTO v_ticket_errors FROM public.push_delivery_attempts WHERE delivery_status='ticket_error';
  IF v_ticketed <> 1 OR v_ticket_errors <> 1 THEN
    RAISE EXCEPTION 'Ticket responses were not recorded; ticketed %, ticket errors %', v_ticketed, v_ticket_errors;
  END IF;
END
$$;

UPDATE public.push_delivery_attempts
SET ticket_received_at=now()-interval '16 minutes'
WHERE expo_ticket_id='ticket-valid-0001';
SELECT * FROM public.get_expo_push_receipt_batch(100);
SELECT public.record_expo_push_receipt_results(
  '[{"ticket_id":"ticket-valid-0001","status":"ok","message":"","error_code":""}]'::jsonb
);

DO $$
DECLARE v_status text;
BEGIN
  SELECT delivery_status INTO v_status
  FROM public.push_delivery_attempts
  WHERE expo_ticket_id='ticket-valid-0001';
  IF v_status <> 'handed_off' THEN RAISE EXCEPTION 'Successful receipt was not recorded as handed_off'; END IF;
END
$$;
RESET ROLE;

DO $$
DECLARE v_tokens integer; v_invalid_status text;
BEGIN
  SELECT count(*) INTO v_tokens FROM public.device_push_tokens;
  SELECT delivery_status INTO v_invalid_status
  FROM public.push_delivery_attempts
  WHERE delivery_status='ticket_error';
  IF v_tokens <> 1 THEN RAISE EXCEPTION 'DeviceNotRegistered token was not removed'; END IF;
  IF v_invalid_status <> 'ticket_error' THEN RAISE EXCEPTION 'Ticket error details were not retained'; END IF;
END
$$;
