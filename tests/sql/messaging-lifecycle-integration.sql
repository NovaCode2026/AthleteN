\set ON_ERROR_STOP on

DO $$ BEGIN CREATE ROLE anon NOLOGIN; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE ROLE authenticated NOLOGIN; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE ROLE service_role NOLOGIN BYPASSRLS; EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE SCHEMA auth;
CREATE TABLE auth.users (id uuid PRIMARY KEY);
CREATE FUNCTION auth.uid()
RETURNS uuid LANGUAGE sql STABLE
AS $$ SELECT nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;

CREATE SCHEMA storage;
CREATE TABLE storage.buckets (
  id text PRIMARY KEY,
  name text NOT NULL,
  public boolean NOT NULL DEFAULT false,
  file_size_limit bigint,
  allowed_mime_types text[]
);
CREATE TABLE storage.objects (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  bucket_id text NOT NULL,
  name text NOT NULL
);
ALTER TABLE storage.objects ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.conversations (
  id uuid PRIMARY KEY,
  kind text NOT NULL,
  created_by uuid NOT NULL REFERENCES auth.users(id)
);
CREATE TABLE public.conversation_members (
  conversation_id uuid NOT NULL REFERENCES public.conversations(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id),
  is_admin boolean NOT NULL DEFAULT false,
  PRIMARY KEY (conversation_id, user_id)
);
CREATE TABLE public.messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id uuid NOT NULL REFERENCES public.conversations(id) ON DELETE CASCADE,
  sender_id uuid NOT NULL REFERENCES auth.users(id),
  body text NOT NULL DEFAULT '',
  message_type text NOT NULL DEFAULT 'normal',
  created_at timestamptz NOT NULL DEFAULT now(),
  edited_at timestamptz,
  deleted_for_everyone_at timestamptz,
  attachment_path text,
  attachment_name text,
  attachment_type text,
  attachment_size bigint
);
ALTER TABLE public.messages ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.support_tickets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id uuid REFERENCES public.conversations(id),
  status text NOT NULL DEFAULT 'open'
);
CREATE FUNCTION public.is_platform_admin()
RETURNS boolean LANGUAGE sql STABLE AS $$ SELECT false $$;
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

GRANT USAGE ON SCHEMA auth, storage TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION auth.uid() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.is_age_approved(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.is_conversation_member(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.is_platform_admin() TO authenticated, service_role;
GRANT SELECT ON public.messages, public.conversation_members, public.conversations TO authenticated;

INSERT INTO auth.users (id) VALUES
  ('10000000-0000-4000-8000-000000000001'),
  ('10000000-0000-4000-8000-000000000002'),
  ('10000000-0000-4000-8000-000000000003');
INSERT INTO public.conversations (id, kind, created_by) VALUES
  ('20000000-0000-4000-8000-000000000001', 'direct', '10000000-0000-4000-8000-000000000001'),
  ('20000000-0000-4000-8000-000000000002', 'group', '10000000-0000-4000-8000-000000000001');
INSERT INTO public.conversation_members (conversation_id, user_id, is_admin) VALUES
  ('20000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000001',false),
  ('20000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000002',false),
  ('20000000-0000-4000-8000-000000000002','10000000-0000-4000-8000-000000000001',true),
  ('20000000-0000-4000-8000-000000000002','10000000-0000-4000-8000-000000000002',true),
  ('20000000-0000-4000-8000-000000000002','10000000-0000-4000-8000-000000000003',false);
