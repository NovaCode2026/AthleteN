-- Athlete-owned quest check-ins and private competition travel planning.
-- These records are personal workspace data. They are never shared with coaches,
-- academies, leaderboard participants or advertising providers.

CREATE TABLE IF NOT EXISTS public.athlete_quest_completions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  quest_key text NOT NULL,
  period_key text NOT NULL,
  completed_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT athlete_quest_completions_key_check CHECK (
    quest_key IN (
      'daily-plan-check',
      'daily-reflection',
      'weekly-goal-review',
      'weekly-readiness-check',
      'monthly-season-review'
    )
  ),
  CONSTRAINT athlete_quest_completions_period_check CHECK (
    period_key ~ '^[0-9]{4}-([0-9]{2}-[0-9]{2}|W[0-9]{2}|[0-9]{2})$'
  ),
  CONSTRAINT athlete_quest_completions_unique UNIQUE (user_id, quest_key, period_key)
);

CREATE INDEX IF NOT EXISTS athlete_quest_completions_user_period_idx
  ON public.athlete_quest_completions(user_id, period_key);

ALTER TABLE public.athlete_quest_completions ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.athlete_quest_completions FROM PUBLIC, anon;
GRANT SELECT, INSERT, DELETE ON TABLE public.athlete_quest_completions TO authenticated;

DROP POLICY IF EXISTS "Athletes read their own quest completions" ON public.athlete_quest_completions;
CREATE POLICY "Athletes read their own quest completions"
ON public.athlete_quest_completions
FOR SELECT TO authenticated
USING (user_id = (SELECT auth.uid()));

DROP POLICY IF EXISTS "Athletes complete their own quests" ON public.athlete_quest_completions;
CREATE POLICY "Athletes complete their own quests"
ON public.athlete_quest_completions
FOR INSERT TO authenticated
WITH CHECK (user_id = (SELECT auth.uid()));

DROP POLICY IF EXISTS "Athletes undo their own quest completions" ON public.athlete_quest_completions;
CREATE POLICY "Athletes undo their own quest completions"
ON public.athlete_quest_completions
FOR DELETE TO authenticated
USING (user_id = (SELECT auth.uid()));

CREATE TABLE IF NOT EXISTS public.athlete_away_plans (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  event_name text NOT NULL,
  event_date date,
  venue text,
  departure_date date,
  return_date date,
  packing_items jsonb NOT NULL DEFAULT '[]'::jsonb,
  itinerary_items jsonb NOT NULL DEFAULT '[]'::jsonb,
  notes text,
  status text NOT NULL DEFAULT 'planning',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT athlete_away_plans_event_name_length CHECK (
    char_length(btrim(event_name)) BETWEEN 2 AND 120
  ),
  CONSTRAINT athlete_away_plans_venue_length CHECK (
    venue IS NULL OR char_length(venue) <= 180
  ),
  CONSTRAINT athlete_away_plans_notes_length CHECK (
    notes IS NULL OR char_length(notes) <= 1200
  ),
  CONSTRAINT athlete_away_plans_date_order CHECK (
    departure_date IS NULL OR return_date IS NULL OR departure_date <= return_date
  ),
  CONSTRAINT athlete_away_plans_packing_array CHECK (
    jsonb_typeof(packing_items) = 'array' AND jsonb_array_length(packing_items) <= 40
  ),
  CONSTRAINT athlete_away_plans_itinerary_array CHECK (
    jsonb_typeof(itinerary_items) = 'array' AND jsonb_array_length(itinerary_items) <= 40
  ),
  CONSTRAINT athlete_away_plans_status_check CHECK (
    status IN ('planning', 'ready', 'completed')
  )
);

CREATE INDEX IF NOT EXISTS athlete_away_plans_user_event_idx
  ON public.athlete_away_plans(user_id, event_date);

ALTER TABLE public.athlete_away_plans ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.athlete_away_plans FROM PUBLIC, anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.athlete_away_plans TO authenticated;

DROP POLICY IF EXISTS "Athletes read their own away plans" ON public.athlete_away_plans;
CREATE POLICY "Athletes read their own away plans"
ON public.athlete_away_plans
FOR SELECT TO authenticated
USING (user_id = (SELECT auth.uid()));

DROP POLICY IF EXISTS "Athletes create their own away plans" ON public.athlete_away_plans;
CREATE POLICY "Athletes create their own away plans"
ON public.athlete_away_plans
FOR INSERT TO authenticated
WITH CHECK (user_id = (SELECT auth.uid()));

DROP POLICY IF EXISTS "Athletes update their own away plans" ON public.athlete_away_plans;
CREATE POLICY "Athletes update their own away plans"
ON public.athlete_away_plans
FOR UPDATE TO authenticated
USING (user_id = (SELECT auth.uid()))
WITH CHECK (user_id = (SELECT auth.uid()));

DROP POLICY IF EXISTS "Athletes delete their own away plans" ON public.athlete_away_plans;
CREATE POLICY "Athletes delete their own away plans"
ON public.athlete_away_plans
FOR DELETE TO authenticated
USING (user_id = (SELECT auth.uid()));

COMMENT ON TABLE public.athlete_quest_completions IS
  'Private, non-monetary athlete quest check-ins. Missed quests do not modify training streaks or leaderboard scores.';
COMMENT ON TABLE public.athlete_away_plans IS
  'Private athlete travel planning records with no live location tracking or coach/academy sharing.';
