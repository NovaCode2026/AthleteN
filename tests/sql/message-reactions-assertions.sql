\set ON_ERROR_STOP on

SET ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','10000000-0000-4000-8000-000000000001',false);

DO $$
DECLARE v_count integer; v_changed integer;
BEGIN
  INSERT INTO public.message_reactions(message_id,user_id,reaction)
  VALUES ('30000000-0000-4000-8000-000000000001',auth.uid(),'👍');

  SELECT count(*) INTO v_count
  FROM public.message_reactions
  WHERE message_id='30000000-0000-4000-8000-000000000001';
  IF v_count <> 1 THEN RAISE EXCEPTION 'Member could not read own conversation reaction'; END IF;

  BEGIN
    INSERT INTO public.message_reactions(message_id,user_id,reaction)
    VALUES ('30000000-0000-4000-8000-000000000002',auth.uid(),'❤️');
    RAISE EXCEPTION 'Non-member reaction was accepted';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;

  BEGIN
    INSERT INTO public.message_reactions(message_id,user_id,reaction)
    VALUES ('30000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000002','❤️');
    RAISE EXCEPTION 'A user inserted a reaction for another user';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;

  BEGIN
    INSERT INTO public.message_reactions(message_id,user_id,reaction)
    VALUES ('30000000-0000-4000-8000-000000000001',auth.uid(),'🔥');
    RAISE EXCEPTION 'An unsupported reaction was accepted';
  EXCEPTION WHEN check_violation THEN NULL;
  END;

  BEGIN
    INSERT INTO public.message_reactions(message_id,user_id,reaction)
    VALUES ('30000000-0000-4000-8000-000000000001',auth.uid(),'👍');
    RAISE EXCEPTION 'Duplicate reaction rows were accepted';
  EXCEPTION WHEN unique_violation THEN NULL;
  END;

  UPDATE public.message_reactions
  SET reaction='❤️'
  WHERE message_id='30000000-0000-4000-8000-000000000001'
    AND user_id=auth.uid();
  GET DIAGNOSTICS v_changed = ROW_COUNT;
  IF v_changed <> 1 THEN RAISE EXCEPTION 'Member could not update own reaction'; END IF;

  BEGIN
    INSERT INTO public.message_reactions(message_id,user_id,reaction)
    VALUES ('30000000-0000-4000-8000-000000000003',auth.uid(),'😂');
    RAISE EXCEPTION 'Reaction to a deleted message was accepted';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;

  PERFORM set_config('request.jwt.claim.sub','10000000-0000-4000-8000-000000000002',false);
  SELECT count(*) INTO v_count
  FROM public.message_reactions
  WHERE message_id='30000000-0000-4000-8000-000000000001';
  IF v_count <> 1 THEN RAISE EXCEPTION 'Conversation peer could not read reaction'; END IF;
  DELETE FROM public.message_reactions
  WHERE message_id='30000000-0000-4000-8000-000000000001'
    AND user_id='10000000-0000-4000-8000-000000000001';
  GET DIAGNOSTICS v_changed = ROW_COUNT;
  IF v_changed <> 0 THEN RAISE EXCEPTION 'Conversation peer deleted another user reaction'; END IF;

  PERFORM set_config('request.jwt.claim.sub','10000000-0000-4000-8000-000000000003',false);
  SELECT count(*) INTO v_count
  FROM public.message_reactions
  WHERE message_id='30000000-0000-4000-8000-000000000001';
  IF v_count <> 0 THEN RAISE EXCEPTION 'Non-member read a private conversation reaction'; END IF;
END
$$;

RESET ROLE;
