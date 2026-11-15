\set ON_ERROR_STOP on

-- Supabase-compatible auth and Storage test fixtures on an isolated PostgreSQL service.
CREATE EXTENSION IF NOT EXISTS pgcrypto;
DO $$ BEGIN CREATE ROLE anon NOLOGIN; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE ROLE authenticated NOLOGIN; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
CREATE SCHEMA IF NOT EXISTS auth;
CREATE OR REPLACE FUNCTION auth.uid()
RETURNS uuid
LANGUAGE sql
STABLE
AS $function$
  SELECT nullif(current_setting('request.jwt.claim.sub', true), '')::uuid
$function$;
GRANT USAGE ON SCHEMA auth TO anon, authenticated;
GRANT EXECUTE ON FUNCTION auth.uid() TO anon, authenticated;

CREATE TABLE IF NOT EXISTS auth.users (
  id uuid PRIMARY KEY
);
CREATE TABLE IF NOT EXISTS public.profiles (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id),
  role text NOT NULL
);
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "test profiles read own" ON public.profiles;
CREATE POLICY "test profiles read own" ON public.profiles
  FOR SELECT TO authenticated USING (user_id = (SELECT auth.uid()));
GRANT SELECT ON public.profiles TO authenticated;

CREATE TABLE IF NOT EXISTS public.mobile_app_releases (
  id boolean PRIMARY KEY DEFAULT true CHECK (id = true),
  version text NOT NULL,
  version_code integer NOT NULL CHECK (version_code > 0),
  minimum_version_code integer NOT NULL DEFAULT 1 CHECK (minimum_version_code > 0),
  download_url text NOT NULL,
  release_notes text NOT NULL DEFAULT '',
  published boolean NOT NULL DEFAULT false,
  updated_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT mobile_app_releases_https_url CHECK (download_url ~ '^https://')
);
ALTER TABLE public.mobile_app_releases ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "published mobile release is readable" ON public.mobile_app_releases;
CREATE POLICY "published mobile release is readable"
  ON public.mobile_app_releases FOR SELECT TO anon, authenticated
  USING (
    published = true OR EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.user_id = (SELECT auth.uid()) AND p.role = 'super_admin'
    )
  );
DROP POLICY IF EXISTS "super admins publish mobile releases" ON public.mobile_app_releases;
CREATE POLICY "super admins publish mobile releases"
  ON public.mobile_app_releases FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (SELECT 1 FROM public.profiles p WHERE p.user_id = (SELECT auth.uid()) AND p.role = 'super_admin')
    AND updated_by = (SELECT auth.uid())
  );
DROP POLICY IF EXISTS "super admins update mobile releases" ON public.mobile_app_releases;
CREATE POLICY "super admins update mobile releases"
  ON public.mobile_app_releases FOR UPDATE TO authenticated
  USING (EXISTS (SELECT 1 FROM public.profiles p WHERE p.user_id = (SELECT auth.uid()) AND p.role = 'super_admin'))
  WITH CHECK (
    EXISTS (SELECT 1 FROM public.profiles p WHERE p.user_id = (SELECT auth.uid()) AND p.role = 'super_admin')
    AND updated_by = (SELECT auth.uid())
  );
GRANT SELECT ON public.mobile_app_releases TO anon, authenticated;
GRANT INSERT, UPDATE ON public.mobile_app_releases TO authenticated;

CREATE SCHEMA IF NOT EXISTS storage;
CREATE TABLE IF NOT EXISTS storage.buckets (
  id text PRIMARY KEY,
  name text NOT NULL,
  public boolean NOT NULL DEFAULT false,
  file_size_limit bigint,
  allowed_mime_types text[]
);
CREATE TABLE IF NOT EXISTS storage.objects (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  bucket_id text NOT NULL,
  name text NOT NULL
);
ALTER TABLE storage.objects ENABLE ROW LEVEL SECURITY;
GRANT USAGE ON SCHEMA storage TO authenticated;
GRANT INSERT, DELETE ON storage.objects TO authenticated;

-- Apply the exact migration added by this PR.
\ir ../../supabase/migrations/20261115090000_founder_mobile_release_control.sql

-- Seed one ordinary account and one Super Admin account.
INSERT INTO auth.users(id) VALUES
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'),
  ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb')
ON CONFLICT DO NOTHING;
INSERT INTO public.profiles(user_id, role) VALUES
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'athlete'),
  ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', 'super_admin')
ON CONFLICT (user_id) DO UPDATE SET role = EXCLUDED.role;

-- Confirm the dedicated bucket is public for binary downloads and has an APK-only cap.
DO $$
DECLARE bucket_row storage.buckets%rowtype;
BEGIN
  SELECT * INTO bucket_row FROM storage.buckets WHERE id = 'athleten-mobile-releases';
  IF NOT FOUND OR NOT bucket_row.public THEN
    RAISE EXCEPTION 'AthleteN release bucket was not created as public';
  END IF;
  IF bucket_row.file_size_limit <> 157286400 THEN
    RAISE EXCEPTION 'Unexpected APK upload size limit';
  END IF;
  IF bucket_row.allowed_mime_types <> ARRAY['application/vnd.android.package-archive']::text[] THEN
    RAISE EXCEPTION 'Release bucket does not restrict uploads to APK content';
  END IF;
END $$;

-- A normal athlete cannot create release drafts or upload release assets.
SELECT set_config('request.jwt.claim.sub', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', false);
SET ROLE authenticated;
DO $$
DECLARE draft_blocked boolean := false; upload_blocked boolean := false;
BEGIN
  BEGIN
    INSERT INTO public.mobile_app_release_drafts
      (id,version,version_code,minimum_version_code,download_url,release_notes,updated_by)
    VALUES (true,'1.0.5',5,1,'','',auth.uid());
  EXCEPTION WHEN insufficient_privilege THEN draft_blocked := true;
  END;
  BEGIN
    INSERT INTO storage.objects(bucket_id,name)
    VALUES ('athleten-mobile-releases','android/5/not-authorized.apk');
  EXCEPTION WHEN insufficient_privilege THEN upload_blocked := true;
  END;
  IF NOT draft_blocked THEN RAISE EXCEPTION 'An athlete was allowed to write a release draft'; END IF;
  IF NOT upload_blocked THEN RAISE EXCEPTION 'An athlete was allowed to upload a release APK'; END IF;
  IF (SELECT count(*) FROM public.mobile_app_release_history) <> 0 THEN
    RAISE EXCEPTION 'An athlete can read Super Admin release history';
  END IF;
END $$;
RESET ROLE;

-- Super Admin can upload, save a draft, and publish via the invoker RPC.
SELECT set_config('request.jwt.claim.sub', 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', false);
SET ROLE authenticated;
INSERT INTO storage.objects(bucket_id,name)
VALUES ('athleten-mobile-releases','android/5/release-test.apk');

INSERT INTO public.mobile_app_release_drafts
  (id,version,version_code,minimum_version_code,download_url,release_notes,updated_by)
VALUES (
  true,'1.0.5',5,1,
  'https://example.supabase.co/storage/v1/object/public/athleten-mobile-releases/android/5/release-test.apk',
  'Founder release integration test',auth.uid()
);

SELECT * FROM public.publish_mobile_app_release(
  '1.0.5', 5, 1,
  'https://example.supabase.co/storage/v1/object/public/athleten-mobile-releases/android/5/release-test.apk',
  'Founder release integration test'
);

DO $$
BEGIN
  IF (SELECT count(*) FROM public.mobile_app_release_history WHERE action = 'draft_saved') <> 1 THEN
    RAISE EXCEPTION 'Draft event was not recorded';
  END IF;
  IF (SELECT count(*) FROM public.mobile_app_release_history WHERE action = 'published') <> 1 THEN
    RAISE EXCEPTION 'Publish event was not recorded';
  END IF;
  IF EXISTS (SELECT 1 FROM public.mobile_app_release_drafts WHERE id = true) THEN
    RAISE EXCEPTION 'Published draft was not cleared';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.mobile_app_releases WHERE id = true AND version_code = 5 AND published = true) THEN
    RAISE EXCEPTION 'Published release is missing';
  END IF;
END $$;

-- The RPC rejects reused/lower Android versionCodes.
DO $$
DECLARE rejected boolean := false;
BEGIN
  BEGIN
    PERFORM public.publish_mobile_app_release(
      '1.0.6', 5, 1,
      'https://example.supabase.co/storage/v1/object/public/athleten-mobile-releases/android/5/release-test.apk',
      'Must be rejected'
    );
  EXCEPTION WHEN raise_exception THEN
    rejected := position('versionCode must be greater' in SQLERRM) > 0;
  END;
  IF NOT rejected THEN RAISE EXCEPTION 'The release RPC accepted a non-increasing versionCode'; END IF;
END $$;
RESET ROLE;

-- Published APK metadata is visible to anonymous app clients, but the release RPC is not.
DO $$
BEGIN
  IF has_function_privilege('anon', 'public.publish_mobile_app_release(text,integer,integer,text,text)', 'EXECUTE') THEN
    RAISE EXCEPTION 'Anonymous clients can execute the release publishing RPC';
  END IF;
  IF has_table_privilege('authenticated', 'public.mobile_app_release_history', 'INSERT') OR
     has_table_privilege('authenticated', 'public.mobile_app_release_history', 'UPDATE') OR
     has_table_privilege('authenticated', 'public.mobile_app_release_history', 'DELETE') THEN
    RAISE EXCEPTION 'Authenticated clients can alter release history directly';
  END IF;
END $$;
SET ROLE anon;
DO $$
BEGIN
  IF (SELECT count(*) FROM public.mobile_app_releases WHERE published = true) <> 1 THEN
    RAISE EXCEPTION 'Public app clients cannot read the published release';
  END IF;
END $$;
RESET ROLE;

SELECT 'Founder release-control integration checks passed' AS result;
