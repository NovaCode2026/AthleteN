\set ON_ERROR_STOP on
CREATE EXTENSION IF NOT EXISTS pgcrypto;
DO $$ BEGIN CREATE ROLE anon NOLOGIN; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE ROLE authenticated NOLOGIN; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
CREATE SCHEMA IF NOT EXISTS auth;
CREATE TABLE auth.users (id uuid PRIMARY KEY);
CREATE OR REPLACE FUNCTION auth.uid()
RETURNS uuid LANGUAGE sql STABLE
AS $function$ SELECT nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $function$;
GRANT USAGE ON SCHEMA auth TO authenticated;
GRANT EXECUTE ON FUNCTION auth.uid() TO authenticated;

INSERT INTO auth.users(id) VALUES
 ('10000000-0000-4000-8000-000000000001'),
 ('20000000-0000-4000-8000-000000000002');

\ir ../../supabase/migrations/20261124220000_athlete_quest_away_mode.sql

-- Athlete A can create and read their own quest and travel plan.
SET ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', '10000000-0000-4000-8000-000000000001', false);
INSERT INTO public.athlete_quest_completions(user_id, quest_key, period_key)
VALUES ('10000000-0000-4000-8000-000000000001', 'daily-plan-check', '2026-11-24');
INSERT INTO public.athlete_away_plans(
 user_id, event_name, event_date, departure_date, return_date, packing_items, itinerary_items
) VALUES (
 '10000000-0000-4000-8000-000000000001',
 'Test Open', '2026-12-10', '2026-12-09', '2026-12-11',
 '[{"id":"kit","label":"Sport kit","packed":false}]'::jsonb,
 '[{"id":"registration","title":"Registration","time":"09:00"}]'::jsonb
);

DO $test$
DECLARE n integer;
BEGIN
 SELECT count(*) INTO n FROM public.athlete_quest_completions;
 IF n <> 1 THEN RAISE EXCEPTION 'Athlete A should read their own quest completion'; END IF;
 SELECT count(*) INTO n FROM public.athlete_away_plans;
 IF n <> 1 THEN RAISE EXCEPTION 'Athlete A should read their own away plan'; END IF;

 BEGIN
  INSERT INTO public.athlete_quest_completions(user_id, quest_key, period_key)
  VALUES ('10000000-0000-4000-8000-000000000001', 'daily-plan-check', '2026-11-24');
  RAISE EXCEPTION 'Duplicate quest completion was unexpectedly accepted';
 EXCEPTION WHEN unique_violation THEN NULL;
 END;

 BEGIN
  INSERT INTO public.athlete_away_plans(user_id, event_name, departure_date, return_date)
  VALUES ('10000000-0000-4000-8000-000000000001', 'Invalid dates', '2026-12-12', '2026-12-11');
  RAISE EXCEPTION 'Invalid travel date order was unexpectedly accepted';
 EXCEPTION WHEN check_violation THEN NULL;
 END;

 BEGIN
  INSERT INTO public.athlete_away_plans(user_id, event_name, packing_items)
  VALUES (
   '10000000-0000-4000-8000-000000000001',
   'Too many items',
   (SELECT jsonb_agg(jsonb_build_object('id', n, 'label', 'item', 'packed', false))
    FROM generate_series(1, 41) n)
  );
  RAISE EXCEPTION 'Oversized packing list was unexpectedly accepted';
 EXCEPTION WHEN check_violation THEN NULL;
 END;
END
$test$;

-- A second athlete must not read or mutate Athlete A's personal data.
SELECT set_config('request.jwt.claim.sub', '20000000-0000-4000-8000-000000000002', false);
DO $test$
DECLARE n integer; affected integer;
BEGIN
 SELECT count(*) INTO n FROM public.athlete_quest_completions;
 IF n <> 0 THEN RAISE EXCEPTION 'Quest completions leaked across athletes'; END IF;
 SELECT count(*) INTO n FROM public.athlete_away_plans;
 IF n <> 0 THEN RAISE EXCEPTION 'Away Mode plans leaked across athletes'; END IF;

 BEGIN
  INSERT INTO public.athlete_quest_completions(user_id, quest_key, period_key)
  VALUES ('10000000-0000-4000-8000-000000000001', 'daily-reflection', '2026-11-24');
  RAISE EXCEPTION 'Cross-owner quest insert was unexpectedly accepted';
 EXCEPTION WHEN insufficient_privilege THEN NULL;
 END;

 UPDATE public.athlete_away_plans
 SET status = 'ready'
 WHERE user_id = '10000000-0000-4000-8000-000000000001';
 GET DIAGNOSTICS affected = ROW_COUNT;
 IF affected <> 0 THEN RAISE EXCEPTION 'Cross-owner Away Mode update unexpectedly succeeded'; END IF;

 DELETE FROM public.athlete_quest_completions
 WHERE user_id = '10000000-0000-4000-8000-000000000001';
 GET DIAGNOSTICS affected = ROW_COUNT;
 IF affected <> 0 THEN RAISE EXCEPTION 'Cross-owner quest delete unexpectedly succeeded'; END IF;

 INSERT INTO public.athlete_quest_completions(user_id, quest_key, period_key)
 VALUES ('20000000-0000-4000-8000-000000000002', 'daily-reflection', '2026-11-24');
END
$test$;

-- Athlete A must not see Athlete B's newly inserted completion.
SELECT set_config('request.jwt.claim.sub', '10000000-0000-4000-8000-000000000001', false);
DO $test$
DECLARE n integer;
BEGIN
 SELECT count(*) INTO n FROM public.athlete_quest_completions;
 IF n <> 1 THEN RAISE EXCEPTION 'Quest completion privacy failed after second athlete insert'; END IF;
END
$test$;

RESET ROLE;
SELECT 'athlete quest and away mode integration passed' AS result;
