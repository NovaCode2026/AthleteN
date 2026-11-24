\set ON_ERROR_STOP on

DO $$ BEGIN CREATE ROLE anon NOLOGIN; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE ROLE authenticated NOLOGIN; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE ROLE service_role NOLOGIN BYPASSRLS; EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE SCHEMA auth;
CREATE TABLE auth.users (id uuid PRIMARY KEY);
CREATE FUNCTION auth.uid()
RETURNS uuid LANGUAGE sql STABLE
AS $$ SELECT nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;

CREATE SCHEMA net;
CREATE SEQUENCE net.request_id_seq;
CREATE TABLE net.http_request_records (
  id bigint PRIMARY KEY,
  url text NOT NULL,
  body jsonb NOT NULL
);
CREATE TABLE net._http_response (
  id bigint PRIMARY KEY,
  status_code integer,
  content text,
  error_msg text,
  created timestamptz NOT NULL DEFAULT now()
);
CREATE FUNCTION net.http_post(
  url text,
  body jsonb DEFAULT '{}'::jsonb,
  params jsonb DEFAULT '{}'::jsonb,
  headers jsonb DEFAULT '{"Content-Type":"application/json"}'::jsonb,
  timeout_milliseconds integer DEFAULT 2000
)
RETURNS bigint
LANGUAGE plpgsql
AS $$
DECLARE v_id bigint;
BEGIN
  v_id := nextval('net.request_id_seq');
  INSERT INTO net.http_request_records(id,url,body) VALUES(v_id,url,body);
  RETURN v_id;
END
$$;

CREATE TABLE public.profiles (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id),
  full_name text
);
CREATE TABLE public.messages (
  id uuid PRIMARY KEY,
  sender_id uuid NOT NULL REFERENCES auth.users(id),
  conversation_id uuid NOT NULL,
  body text NOT NULL DEFAULT ''
);
CREATE TABLE public.device_push_tokens (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  token text NOT NULL UNIQUE,
  platform text NOT NULL CHECK(platform IN ('android','ios','web')),
  app_version text,
  last_seen_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE public.notification_preferences (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id),
  message_preview boolean NOT NULL DEFAULT false
);
CREATE TABLE public.notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  title text,
  body text,
  notification_type text,
  action_route text,
  message_id uuid REFERENCES public.messages(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

INSERT INTO auth.users(id) VALUES
 ('10000000-0000-4000-8000-000000000001'),
 ('10000000-0000-4000-8000-000000000002');
INSERT INTO public.profiles(user_id,full_name) VALUES
 ('10000000-0000-4000-8000-000000000001','Sender Athlete'),
 ('10000000-0000-4000-8000-000000000002','Receiver Athlete');
INSERT INTO public.messages(id,sender_id,conversation_id,body) VALUES
 ('20000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000001','30000000-0000-4000-8000-000000000001','Private training update');
INSERT INTO public.device_push_tokens(id,user_id,token,platform) VALUES
 ('40000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000002','ExponentPushToken[TEST_VALID_0001]','android'),
 ('40000000-0000-4000-8000-000000000002','10000000-0000-4000-8000-000000000002','ExponentPushToken[TEST_INVALID_0002]','ios');
INSERT INTO public.notification_preferences(user_id,message_preview) VALUES
 ('10000000-0000-4000-8000-000000000002',false);
