\set ON_ERROR_STOP on
CREATE EXTENSION IF NOT EXISTS pgcrypto;
DO $$ BEGIN CREATE ROLE anon NOLOGIN; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE ROLE authenticated NOLOGIN; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE ROLE service_role NOLOGIN BYPASSRLS; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
CREATE SCHEMA IF NOT EXISTS auth;
CREATE SCHEMA IF NOT EXISTS private;
GRANT USAGE ON SCHEMA auth TO authenticated, service_role;

CREATE OR REPLACE FUNCTION auth.uid()
RETURNS uuid LANGUAGE sql STABLE
AS $ SELECT nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $;
-- Match Supabase's baseline auth helper grants for the authenticated test role.
GRANT USAGE ON SCHEMA auth TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION auth.uid() TO authenticated, service_role;

CREATE TABLE public.profiles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid UNIQUE NOT NULL,
  full_name text NOT NULL DEFAULT 'Test Athlete',
  date_of_birth date,
  role text NOT NULL DEFAULT 'athlete',
  plan_id text NOT NULL DEFAULT 'free',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.age_verifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid UNIQUE NOT NULL,
  date_of_birth date NOT NULL,
  parent_email text,
  status text NOT NULL,
  token_hash text,
  token_expires_at timestamptz,
  approved_at timestamptz,
  rejected_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.age_verifications ENABLE ROW LEVEL SECURITY;
CREATE POLICY "users can read own age verification" ON public.age_verifications
  FOR SELECT TO authenticated USING (user_id = (SELECT auth.uid()));
CREATE POLICY "users can create own age verification" ON public.age_verifications
  FOR INSERT TO authenticated WITH CHECK (user_id = (SELECT auth.uid()));
CREATE POLICY "users can update own age verification" ON public.age_verifications
  FOR UPDATE TO authenticated USING (user_id = (SELECT auth.uid()))
  WITH CHECK (user_id = (SELECT auth.uid()));
CREATE POLICY "super admin full access" ON public.age_verifications
  FOR ALL TO authenticated USING (false) WITH CHECK (false);

CREATE OR REPLACE FUNCTION private.is_super_admin()
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=''
AS $$ SELECT false $$;
GRANT USAGE ON SCHEMA private TO authenticated;
GRANT EXECUTE ON FUNCTION private.is_super_admin() TO authenticated;

CREATE OR REPLACE FUNCTION public.prepare_parent_approval(text)
RETURNS text LANGUAGE sql AS $$ SELECT 'unsafe-token-stub'::text $$;

CREATE OR REPLACE FUNCTION public.is_age_approved(p_user_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=''
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.age_verifications a
    WHERE a.user_id = p_user_id AND a.status IN ('approved','not_required')
  )
$$;

CREATE OR REPLACE FUNCTION public.is_platform_admin()
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=''
AS $$ SELECT false $$;

CREATE TABLE public.academies (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_user_id uuid NOT NULL,
  name text NOT NULL,
  status text NOT NULL DEFAULT 'active'
);
CREATE TABLE public.academy_memberships (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  academy_id uuid NOT NULL REFERENCES public.academies(id),
  user_id uuid NOT NULL,
  role text NOT NULL,
  status text NOT NULL
);
CREATE TABLE public.finance_accounts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_user_id uuid,
  academy_id uuid,
  owner_type text NOT NULL,
  name text NOT NULL,
  currency text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE public.finance_transactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id uuid NOT NULL REFERENCES public.finance_accounts(id),
  user_id uuid NOT NULL,
  type text NOT NULL,
  amount numeric NOT NULL,
  category text NOT NULL,
  transaction_date date NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.finance_accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.finance_transactions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "finance accounts owner" ON public.finance_accounts
  FOR ALL TO authenticated
  USING (owner_type='coach' AND owner_user_id=(SELECT auth.uid()))
  WITH CHECK (owner_type='coach' AND owner_user_id=(SELECT auth.uid()));
CREATE POLICY "finance transactions owner" ON public.finance_transactions
  FOR ALL TO authenticated
  USING (false) WITH CHECK (false);

CREATE OR REPLACE FUNCTION public.can_manage_finance_account(account uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=''
AS $$ SELECT false $$;

CREATE OR REPLACE FUNCTION public.get_or_create_my_coach_finance_account()
RETURNS uuid LANGUAGE sql SECURITY DEFINER SET search_path=''
AS $$ SELECT NULL::uuid $$;

CREATE OR REPLACE FUNCTION public.switch_my_product_role(text)
RETURNS jsonb LANGUAGE sql SECURITY DEFINER SET search_path=''
AS $$ SELECT '{}'::jsonb $$;

GRANT USAGE ON SCHEMA public TO anon, authenticated, service_role;
GRANT SELECT, INSERT, UPDATE ON public.profiles TO authenticated;
GRANT SELECT, INSERT, UPDATE ON public.age_verifications TO authenticated;
GRANT ALL ON public.age_verifications TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.finance_accounts, public.finance_transactions TO authenticated;
GRANT SELECT ON public.academies, public.academy_memberships TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_age_approved(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_platform_admin() TO authenticated;
GRANT EXECUTE ON FUNCTION public.can_manage_finance_account(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_or_create_my_coach_finance_account() TO authenticated;
GRANT EXECUTE ON FUNCTION public.switch_my_product_role(text) TO authenticated;
