\set ON_ERROR_STOP on
CREATE EXTENSION IF NOT EXISTS pgcrypto;
DO $$ BEGIN CREATE ROLE anon NOLOGIN; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE ROLE authenticated NOLOGIN; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
CREATE SCHEMA IF NOT EXISTS auth;
CREATE SCHEMA IF NOT EXISTS private;
GRANT USAGE ON SCHEMA public, auth, private TO authenticated;
CREATE OR REPLACE FUNCTION auth.uid()
RETURNS uuid LANGUAGE sql STABLE
AS $function$ SELECT nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $function$;
GRANT EXECUTE ON FUNCTION auth.uid() TO authenticated;

CREATE TABLE public.profiles (
  user_id uuid PRIMARY KEY, role text NOT NULL, academy_id uuid,
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE public.academies (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), owner_user_id uuid NOT NULL,
  name text NOT NULL, city text, state text, country text,
  status text NOT NULL DEFAULT 'active', setup_completed boolean NOT NULL DEFAULT false,
  setup_completed_at timestamptz, contact_email text, contact_phone text,
  contact_email_verified_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE public.academy_memberships (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  academy_id uuid NOT NULL REFERENCES public.academies(id) ON DELETE CASCADE,
  user_id uuid NOT NULL, role text NOT NULL, status text NOT NULL,
  joined_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (academy_id, user_id)
);
CREATE TABLE public.academy_coach_seats (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  academy_id uuid NOT NULL REFERENCES public.academies(id) ON DELETE CASCADE,
  coach_user_id uuid NOT NULL, seat_type text NOT NULL,
  activation_fee numeric(10,2) NOT NULL DEFAULT 0, monthly_fee numeric(10,2) NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'active', activated_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (academy_id, coach_user_id)
);
CREATE TABLE public.subscriptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), user_id uuid NOT NULL,
  plan_id text NOT NULL, status text NOT NULL
);
CREATE OR REPLACE FUNCTION public.is_platform_admin()
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = ''
AS $function$ SELECT false $function$;

ALTER TABLE public.academies ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.academy_memberships ENABLE ROW LEVEL SECURITY;
CREATE POLICY "academies owner read" ON public.academies
  FOR SELECT TO authenticated USING (owner_user_id = (SELECT auth.uid()));
CREATE POLICY "academies owner insert" ON public.academies
  FOR INSERT TO authenticated WITH CHECK (owner_user_id = (SELECT auth.uid()));
CREATE POLICY "academies owner update" ON public.academies
  FOR UPDATE TO authenticated USING (owner_user_id = (SELECT auth.uid()))
  WITH CHECK (owner_user_id = (SELECT auth.uid()));
CREATE POLICY "academy memberships participant read" ON public.academy_memberships
  FOR SELECT TO authenticated USING (user_id = (SELECT auth.uid()));
CREATE POLICY "academy memberships admin write" ON public.academy_memberships
  FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Academy owners can bootstrap own admin membership" ON public.academy_memberships
  FOR INSERT TO authenticated WITH CHECK (user_id = (SELECT auth.uid()));

GRANT SELECT, INSERT, UPDATE, DELETE ON public.profiles TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.academies TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.academy_memberships TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.academy_coach_seats TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.subscriptions TO authenticated;

INSERT INTO public.profiles(user_id, role) VALUES
 ('00000000-0000-0000-0000-000000000011', 'athlete'),
 ('00000000-0000-0000-0000-000000000012', 'coach'),
 ('00000000-0000-0000-0000-000000000013', 'academy_admin'),
 ('00000000-0000-0000-0000-000000000014', 'academy_admin'),
 ('00000000-0000-0000-0000-000000000015', 'coach');
