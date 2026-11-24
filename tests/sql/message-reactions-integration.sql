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
GRANT EXECUTE ON FUNCTION public.is_age_approved(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_conversation_member(uuid) TO authenticated;

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
