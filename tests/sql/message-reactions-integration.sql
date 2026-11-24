\\set ON_ERROR_STOP on

DO $$ BEGIN CREATE ROLE anon NOLOGIN; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE ROLE authenticated NOLOGIN; EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE SCHEMA auth;
CREATE TABLE auth.users (id uuid PRIMARY KEY);
CREATE FUNCTION auth.uid()
RETURNS uuid LANGUAGE sql STABLE
AS $$ SELECT nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
GRANT USAGE ON SCHEMA auth TO authenticated;
GRANT EXECUTE ON FUNCTION auth.uid() TO authenticated;

CREATE TABLE public.conversations (
  id uuid PRIMARY KEY
);
CREATE TABLE public.conversation_members (
  conversation_id uuid NOT NULL REFERENCES public.conversations(id),
  user_id uuid NOT NULL REFERENCES auth.users(id),
  PRIMARY KEY (conversation_id,user_id)
);
CREATE TABLE public.messages (
  id uuid PRIMARY KEY,
  conversation_id uuid NOT NULL REFERENCES public.conversations(id),
  sender_id uuid NOT NULL REFERENCES auth.users(id),
  deleted_for_everyone_at timestamptz
);
GRANT SELECT ON public.messages TO authenticated;

CREATE FUNCTION public.is_age_approved(p_user_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = ''
AS $$ SELECT p_user_id IS NOT NULL $$;
CREATE FUNCTION public.is_conversation_member(p_conversation_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = ''
AS $$ SELECT EXISTS (
  SELECT 1 FROM public.conversation_members cm
  WHERE cm.conversation_id = p_conversation_id
    AND cm.user_id = auth.uid()
) $$;

INSERT INTO auth.users (id) VALUES
  ('10000000-0000-4000-8000-000000000001'),
  ('10000000-0000-4000-8000-000000000002'),
  ('10000000-0000-4000-8000-000000000003');
INSERT INTO public.conversations (id) VALUES
  ('20000000-0000-4000-8000-000000000001'),
  ('20000000-0000-4000-8000-000000000002');
INSERT INTO public.conversation_members (conversation_id,user_id) VALUES
  ('20000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000001'),
  ('20000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000002'),
  ('20000000-0000-4000-8000-000000000002','10000000-0000-4000-8000-000000000003');
INSERT INTO public.messages (id,conversation_id,sender_id,deleted_for_everyone_at) VALUES
  ('30000000-0000-4000-8000-000000000001','20000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000002',null),
  ('30000000-0000-4000-8000-000000000002','20000000-0000-4000-8000-000000000002','10000000-0000-4000-8000-000000000003',null),
  ('30000000-0000-4000-8000-000000000003','20000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000002',now());

GRANT EXECUTE ON FUNCTION public.is_age_approved(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_conversation_member(uuid) TO authenticated;

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
