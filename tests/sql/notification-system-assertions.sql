\set ON_ERROR_STOP on

CREATE TRIGGER notifications_push_after_insert
AFTER INSERT ON public.notifications
FOR EACH ROW EXECUTE FUNCTION public.dispatch_notification_push();

CREATE TRIGGER messages_create_delivery_records
AFTER INSERT ON public.messages
FOR EACH ROW EXECUTE FUNCTION public.create_message_delivery_records();

-- Attendance insert and status changes each create an alert linked to the exact source.
INSERT INTO public.attendance_records(id,user_id,status,attended_at,notes) VALUES
 ('70000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000001','present',now(),'On time');
UPDATE public.attendance_records SET status='late' WHERE id='70000000-0000-4000-8000-000000000001';
UPDATE public.attendance_records SET status='late',notes='No change expected' WHERE id='70000000-0000-4000-8000-000000000001';

-- New and rescheduled group sessions notify active members; cancellation uses its own trigger.
INSERT INTO public.training_group_sessions(id,group_id,session_date,start_time,title,status,venue) VALUES
 ('71000000-0000-4000-8000-000000000001','40000000-0000-4000-8000-000000000001',current_date+1,'17:30','Evening practice','scheduled','Dojo A');
UPDATE public.training_group_sessions SET session_date=current_date+2,venue='Dojo B'
WHERE id='71000000-0000-4000-8000-000000000001';
UPDATE public.training_group_sessions SET notes='Coach notes only'
WHERE id='71000000-0000-4000-8000-000000000001';

-- Athlete-authored tournament edits do not notify the same athlete; Coach updates do.
SELECT set_config('request.jwt.claim.sub','10000000-0000-4000-8000-000000000001',false);
INSERT INTO public.tournaments(id,user_id,name,starts_at,status) VALUES
 ('72000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000001','District Open',current_date+30,'planned');
SELECT set_config('request.jwt.claim.sub','10000000-0000-4000-8000-000000000002',false);
UPDATE public.tournaments SET result='Silver',status='completed'
WHERE id='72000000-0000-4000-8000-000000000001';
SELECT set_config('request.jwt.claim.sub','',false);

-- Student verification sends only the final decision.
INSERT INTO public.student_verifications(id,user_id,status) VALUES
 ('73000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000001','pending');
UPDATE public.student_verifications SET status='approved',reviewed_at=now()
WHERE id='73000000-0000-4000-8000-000000000001';

-- Coach link transition notifies both sides once, not while pending.
INSERT INTO public.coach_athlete_links(id,coach_user_id,athlete_user_id,status) VALUES
 ('74000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000002','10000000-0000-4000-8000-000000000001','pending');
UPDATE public.coach_athlete_links SET status='active'
WHERE id='74000000-0000-4000-8000-000000000001';

-- Academy invitation and activation are separate actionable transitions.
INSERT INTO public.academy_memberships(id,academy_id,user_id,role,status) VALUES
 ('75000000-0000-4000-8000-000000000001','50000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000003','athlete','invited');
UPDATE public.academy_memberships SET status='active'
WHERE id='75000000-0000-4000-8000-000000000001';

-- Free subscriptions are quiet; a real paid-plan activation is announced.
INSERT INTO public.subscriptions(id,user_id,plan_id,status) VALUES
 ('76000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000001','free','active');
UPDATE public.subscriptions SET plan_id='student',status='active'
WHERE id='76000000-0000-4000-8000-000000000001';

INSERT INTO public.athlete_badges(user_id,badge_key,badge_label)
VALUES ('10000000-0000-4000-8000-000000000001','first_session','First Session');

-- The training_schedule companion message does not create a duplicate message-category alert.
INSERT INTO public.messages(id,sender_id,conversation_id,body,message_type) VALUES
 ('77000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000002','30000000-0000-4000-8000-000000000001','Training cancelled','training_schedule'),
 ('77000000-0000-4000-8000-000000000002','10000000-0000-4000-8000-000000000001','30000000-0000-4000-8000-000000000001','Technique review is ready','text');

DO $$
DECLARE
  v_count integer;
  v_badge integer;
  v_message integer;
  v_duplicate integer;
  v_competition integer;
BEGIN
  SELECT count(*) INTO v_count
  FROM public.notifications
  WHERE notification_type='training'
    AND attendance_record_id='70000000-0000-4000-8000-000000000001';
  IF v_count <> 2 THEN RAISE EXCEPTION 'Expected two attendance-linked status alerts, got %',v_count; END IF;

  SELECT count(*) INTO v_count
  FROM public.notifications
  WHERE title IN ('New training session','Training session updated')
    AND user_id='10000000-0000-4000-8000-000000000001';
  IF v_count <> 2 THEN RAISE EXCEPTION 'Expected new and rescheduled training alerts, got %',v_count; END IF;

  SELECT count(*) INTO v_competition
  FROM public.notifications
  WHERE notification_type='competition'
    AND user_id='10000000-0000-4000-8000-000000000001';
  IF v_competition <> 1 THEN RAISE EXCEPTION 'Expected one Coach-authored competition alert, got %',v_competition; END IF;

  SELECT count(*) INTO v_count FROM public.notifications
  WHERE title='Student verification approved'
    AND user_id='10000000-0000-4000-8000-000000000001';
  IF v_count <> 1 THEN RAISE EXCEPTION 'Student verification result alert missing'; END IF;

  SELECT count(*) INTO v_count FROM public.notifications
  WHERE title IN ('Coach connection active','Athlete connection active');
  IF v_count <> 2 THEN RAISE EXCEPTION 'Expected two-sided Coach connection alerts, got %',v_count; END IF;

  SELECT count(*) INTO v_count FROM public.notifications
  WHERE title IN ('Academy invitation','Academy membership active')
    AND user_id='10000000-0000-4000-8000-000000000003';
  IF v_count <> 2 THEN RAISE EXCEPTION 'Expected Academy invitation and activation alerts, got %',v_count; END IF;

  SELECT count(*) INTO v_count FROM public.notifications
  WHERE title='Subscription updated'
    AND user_id='10000000-0000-4000-8000-000000000001';
  IF v_count <> 1 THEN RAISE EXCEPTION 'Paid subscription activation alert missing'; END IF;

  SELECT count(*) INTO v_badge FROM public.notifications
  WHERE title='Achievement unlocked'
    AND user_id='10000000-0000-4000-8000-000000000001';
  IF v_badge <> 1 THEN RAISE EXCEPTION 'Badge award alert missing'; END IF;

  SELECT count(*) INTO v_message FROM public.notifications
  WHERE notification_type='message'
    AND message_id='77000000-0000-4000-8000-000000000002';
  IF v_message <> 1 THEN RAISE EXCEPTION 'Normal message alert missing'; END IF;

  SELECT count(*) INTO v_duplicate FROM public.notifications
  WHERE notification_type='message'
    AND message_id='77000000-0000-4000-8000-000000000001';
  IF v_duplicate <> 0 THEN RAISE EXCEPTION 'Training cancellation created a duplicate message alert'; END IF;
END
$$;

-- Each event is durable in the inbox and independently enqueues per-device delivery attempts.
DO $$
DECLARE v_count integer;
BEGIN
  SELECT count(*) INTO v_count
  FROM public.push_delivery_attempts p
  JOIN public.notifications n ON n.id=p.notification_id
  WHERE n.user_id='10000000-0000-4000-8000-000000000001';
  IF v_count <> 9 THEN RAISE EXCEPTION 'Expected exactly nine durable athlete-device delivery attempts, got %',v_count; END IF;
END
$$;

-- Exercise both Expo response shapes and permanent token retirement.
DO $$
DECLARE
  v_object_request bigint;
  v_array_request bigint;
  v_invalid_request bigint;
  v_processed integer;
BEGIN
  SELECT pg_net_request_id INTO v_object_request
  FROM public.push_delivery_attempts
  WHERE device_push_token_id='60000000-0000-4000-8000-000000000001'
    AND delivery_status='queued'
  ORDER BY created_at,id LIMIT 1;

  SELECT pg_net_request_id INTO v_array_request
  FROM public.push_delivery_attempts
  WHERE device_push_token_id='60000000-0000-4000-8000-000000000002'
    AND delivery_status='queued'
  ORDER BY created_at,id LIMIT 1;

  SELECT pg_net_request_id INTO v_invalid_request
  FROM public.push_delivery_attempts
  WHERE device_push_token_id='60000000-0000-4000-8000-000000000002'
    AND delivery_status='queued'
    AND pg_net_request_id<>v_array_request
  ORDER BY created_at,id LIMIT 1;

  IF v_object_request IS NULL OR v_array_request IS NULL OR v_invalid_request IS NULL THEN
    RAISE EXCEPTION 'Push integration fixture did not create enough per-device attempts';
  END IF;

  INSERT INTO net._http_response(id,status_code,content) VALUES
    (v_object_request,200,'{"data":{"status":"ok","id":"ticket-object-001"}}'),
    (v_array_request,200,'{"data":[{"status":"ok","id":"ticket-array-002"}]}'),
    (v_invalid_request,200,'{"data":{"status":"error","message":"Device no longer registered","details":{"error":"DeviceNotRegistered"}}}');

  v_processed := public.process_expo_push_ticket_responses(100);

  IF v_processed < 3 THEN RAISE EXCEPTION 'Expected three Expo ticket responses to be processed, got %',v_processed; END IF;
END
$$;

DO $$
DECLARE v_status text; v_tokens integer;
BEGIN
  SELECT delivery_status INTO v_status FROM public.push_delivery_attempts WHERE expo_ticket_id='ticket-object-001';
  IF v_status <> 'ticketed' THEN RAISE EXCEPTION 'Object-shaped Expo ticket response was not parsed'; END IF;

  SELECT delivery_status INTO v_status FROM public.push_delivery_attempts WHERE expo_ticket_id='ticket-array-002';
  IF v_status <> 'ticketed' THEN RAISE EXCEPTION 'Array-shaped Expo ticket response was not parsed'; END IF;

  SELECT count(*) INTO v_tokens FROM public.device_push_tokens;
  IF v_tokens <> 1 THEN RAISE EXCEPTION 'DeviceNotRegistered token was not retired; token count %',v_tokens; END IF;
END
$$;

-- A transient request failure is retried with bounded exponential backoff and a new pg_net request ID.
DO $$
DECLARE
  v_attempt_id uuid;
  v_old_request bigint;
  v_new_request bigint;
  v_attempt_count integer;
  v_status text;
BEGIN
  SELECT id,pg_net_request_id INTO v_attempt_id,v_old_request
  FROM public.push_delivery_attempts
  WHERE device_push_token_id='60000000-0000-4000-8000-000000000001'
    AND delivery_status='queued'
  ORDER BY created_at,id LIMIT 1;

  UPDATE public.push_delivery_attempts
  SET delivery_status='request_error',
      next_attempt_at=now()-interval '1 second',
      send_attempt_count=1
  WHERE id=v_attempt_id;

  PERFORM public.retry_expo_push_delivery_attempts(100);

  SELECT pg_net_request_id,send_attempt_count,delivery_status
  INTO v_new_request,v_attempt_count,v_status
  FROM public.push_delivery_attempts WHERE id=v_attempt_id;

  IF v_new_request IS NULL OR v_new_request=v_old_request OR v_attempt_count<>2 OR v_status<>'queued' THEN
    RAISE EXCEPTION 'Transient push retry failed: request %, attempt %, state %',v_new_request,v_attempt_count,v_status;
  END IF;

  INSERT INTO net._http_response(id,status_code,content)
  VALUES (v_new_request,200,'{"data":{"status":"ok","id":"ticket-retry-003"}}');
  PERFORM public.process_expo_push_ticket_responses(100);
END
$$;

DO $$
DECLARE v_status text;
BEGIN
  SELECT delivery_status INTO v_status FROM public.push_delivery_attempts WHERE expo_ticket_id='ticket-retry-003';
  IF v_status <> 'ticketed' THEN RAISE EXCEPTION 'Retried push was not ticketed'; END IF;
END
$$;

-- Receipt polling is durable and turns Expo's positive receipt into provider handoff.
DO $$
DECLARE v_request bigint;
BEGIN
  UPDATE public.push_delivery_attempts
  SET ticket_received_at=now()-interval '16 minutes',
      receipt_last_checked_at=NULL
  WHERE expo_ticket_id='ticket-object-001';

  v_request := public.enqueue_expo_push_receipt_poll();

  IF v_request IS NULL THEN RAISE EXCEPTION 'Receipt poll request was not enqueued'; END IF;

  INSERT INTO net._http_response(id,status_code,content)
  VALUES (v_request,200,'{"data":{"ticket-object-001":{"status":"ok"}}}');

  PERFORM public.process_expo_push_receipt_poll_responses(100);
END
$$;

DO $$
DECLARE v_status text;
BEGIN
  SELECT delivery_status INTO v_status FROM public.push_delivery_attempts WHERE expo_ticket_id='ticket-object-001';
  IF v_status <> 'handed_off' THEN RAISE EXCEPTION 'Successful receipt was not recorded as handed_off'; END IF;
END
$$;
