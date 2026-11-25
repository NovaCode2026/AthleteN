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
RETURNS bigint LANGUAGE plpgsql
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
  full_name text,
  role text DEFAULT 'athlete'
);
CREATE TABLE public.messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  sender_id uuid NOT NULL REFERENCES auth.users(id),
  conversation_id uuid NOT NULL,
  body text NOT NULL DEFAULT '',
  message_type text NOT NULL DEFAULT 'text'
);
CREATE TABLE public.conversation_members (
  conversation_id uuid NOT NULL,
  user_id uuid NOT NULL REFERENCES auth.users(id),
  PRIMARY KEY(conversation_id,user_id)
);
CREATE TABLE public.message_receipts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  message_id uuid NOT NULL REFERENCES public.messages(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id),
  UNIQUE(message_id,user_id)
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
  training boolean NOT NULL DEFAULT true,
  competitions boolean NOT NULL DEFAULT true,
  messages boolean NOT NULL DEFAULT true,
  coach_academy boolean NOT NULL DEFAULT true,
  achievements boolean NOT NULL DEFAULT true,
  system boolean NOT NULL DEFAULT true,
  message_preview boolean NOT NULL DEFAULT false,
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE public.notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  title text NOT NULL,
  body text,
  notification_type text,
  action_route text,
  message_id uuid REFERENCES public.messages(id) ON DELETE SET NULL,
  announcement_id uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  read_at timestamptz
);
CREATE TABLE public.attendance_records (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id),
  training_session_id uuid,
  attended_at timestamptz,
  status text NOT NULL DEFAULT 'present',
  notes text
);
CREATE TABLE public.training_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id),
  title text NOT NULL,
  session_date date
);
CREATE TABLE public.athlete_badges (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id),
  badge_key text NOT NULL,
  badge_label text NOT NULL,
  awarded_by uuid,
  permanent boolean NOT NULL DEFAULT false,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb
);
CREATE TABLE public.student_verifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id),
  status text NOT NULL DEFAULT 'pending',
  reviewed_by uuid,
  reviewed_at timestamptz
);
CREATE TABLE public.coach_athlete_links (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  coach_user_id uuid NOT NULL REFERENCES auth.users(id),
  athlete_user_id uuid NOT NULL REFERENCES auth.users(id),
  status text NOT NULL DEFAULT 'pending'
);
CREATE TABLE public.academies (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL
);
CREATE TABLE public.academy_memberships (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  academy_id uuid NOT NULL REFERENCES public.academies(id),
  user_id uuid NOT NULL REFERENCES auth.users(id),
  role text NOT NULL DEFAULT 'athlete',
  status text NOT NULL DEFAULT 'invited'
);
CREATE TABLE public.subscriptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id),
  plan_id text NOT NULL DEFAULT 'free',
  status text NOT NULL DEFAULT 'active'
);
CREATE TABLE public.tournaments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id),
  name text NOT NULL,
  starts_at date,
  status text DEFAULT 'planned',
  result text
);
CREATE TABLE public.training_groups (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  coach_user_id uuid NOT NULL REFERENCES auth.users(id),
  conversation_id uuid
);
CREATE TABLE public.training_group_members (
  group_id uuid NOT NULL REFERENCES public.training_groups(id),
  athlete_user_id uuid NOT NULL REFERENCES auth.users(id),
  status text NOT NULL DEFAULT 'active',
  PRIMARY KEY(group_id,athlete_user_id)
);
CREATE TABLE public.training_group_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id uuid NOT NULL REFERENCES public.training_groups(id),
  session_date date NOT NULL,
  start_time time,
  title text NOT NULL,
  status text NOT NULL DEFAULT 'scheduled',
  venue text,
  notes text,
  training_type text NOT NULL DEFAULT 'regular',
  locked boolean NOT NULL DEFAULT false
);

INSERT INTO auth.users(id) VALUES
 ('10000000-0000-4000-8000-000000000001'),
 ('10000000-0000-4000-8000-000000000002'),
 ('10000000-0000-4000-8000-000000000003');
INSERT INTO public.profiles(user_id,full_name,role) VALUES
 ('10000000-0000-4000-8000-000000000001','Athlete One','athlete'),
 ('10000000-0000-4000-8000-000000000002','Coach Two','coach'),
 ('10000000-0000-4000-8000-000000000003','Athlete Three','athlete');

INSERT INTO public.device_push_tokens(user_id,token,platform) VALUES
 ('10000000-0000-4000-8000-000000000001','ExponentPushToken[TEST_ATHLETE_0001]','android'),
 ('10000000-0000-4000-8000-000000000002','ExponentPushToken[TEST_COACH_0002]','ios');

INSERT INTO public.notification_preferences(user_id) VALUES
 ('10000000-0000-4000-8000-000000000001'),
 ('10000000-0000-4000-8000-000000000002'),
 ('10000000-0000-4000-8000-000000000003');

INSERT INTO public.conversation_members(conversation_id,user_id) VALUES
 ('30000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000001'),
 ('30000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000002');

INSERT INTO public.training_groups(id,name,coach_user_id,conversation_id) VALUES
 ('40000000-0000-4000-8000-000000000001','Cadet Kyorugi','10000000-0000-4000-8000-000000000002','30000000-0000-4000-8000-000000000001');
INSERT INTO public.training_group_members(group_id,athlete_user_id,status) VALUES
 ('40000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000001','active');
INSERT INTO public.academies(id,name) VALUES
 ('50000000-0000-4000-8000-000000000001','Nova Taekwondo Academy');

