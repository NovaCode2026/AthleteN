\set ON_ERROR_STOP on

ALTER TABLE public.academy_coach_seats ADD COLUMN IF NOT EXISTS deactivated_at timestamptz;

CREATE TABLE public.coach_athlete_links (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  coach_user_id uuid NOT NULL REFERENCES auth.users(id),
  athlete_user_id uuid NOT NULL REFERENCES auth.users(id),
  academy_id uuid NOT NULL REFERENCES public.academies(id),
  status text NOT NULL CHECK (status IN ('pending','active','suspended','ended')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (coach_user_id,athlete_user_id,academy_id)
);

CREATE TABLE public.training_groups (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  coach_user_id uuid NOT NULL REFERENCES auth.users(id),
  name text NOT NULL,
  active boolean NOT NULL DEFAULT true
);

CREATE TABLE public.training_group_members (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id uuid NOT NULL REFERENCES public.training_groups(id) ON DELETE CASCADE,
  athlete_user_id uuid NOT NULL REFERENCES auth.users(id),
  status text NOT NULL DEFAULT 'active',
  UNIQUE(group_id,athlete_user_id)
);

CREATE TABLE public.calendar_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id),
  title text NOT NULL,
  event_type text NOT NULL,
  event_date timestamptz NOT NULL
);

CREATE TABLE public.attendance_records (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id),
  academy_id uuid REFERENCES public.academies(id),
  status text NOT NULL,
  attended_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id),
  title text NOT NULL,
  body text NOT NULL DEFAULT '',
  notification_type text NOT NULL,
  action_route text,
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
  system boolean NOT NULL DEFAULT true
);

INSERT INTO auth.users(id,email,email_confirmed_at) VALUES
 ('00000000-0000-0000-0000-000000000016','guardian@example.test','2026-11-01T00:00:00Z');

INSERT INTO public.academies(id,owner_user_id,name,city,state,country,status,setup_completed)
VALUES ('10000000-0000-0000-0000-000000000001',
        '00000000-0000-0000-0000-000000000013',
        'Suite Test Academy','Noida','Uttar Pradesh','India','active',true);

INSERT INTO public.academy_memberships(academy_id,user_id,role,status,joined_at)
VALUES
 ('10000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000013','academy_admin','active',now()),
 ('10000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000011','athlete','active',now()),
 ('10000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000012','coach','active',now()),
 ('10000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000015','coach','active',now());

INSERT INTO public.academy_coach_seats(academy_id,coach_user_id,seat_type,activation_fee,monthly_fee,status)
VALUES
 ('10000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000013','included',0,0,'active'),
 ('10000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000012','included',0,0,'active');

INSERT INTO public.coach_athlete_links(coach_user_id,athlete_user_id,academy_id,status)
VALUES ('00000000-0000-0000-0000-000000000012',
        '00000000-0000-0000-0000-000000000011',
        '10000000-0000-0000-0000-000000000001','active');

INSERT INTO public.training_groups(coach_user_id,name,active)
VALUES ('00000000-0000-0000-0000-000000000012','Kyorugi Group',true);
INSERT INTO public.training_group_members(group_id,athlete_user_id,status)
SELECT id,'00000000-0000-0000-0000-000000000011','active'
FROM public.training_groups WHERE name='Kyorugi Group';

INSERT INTO public.attendance_records(user_id,academy_id,status,attended_at)
VALUES ('00000000-0000-0000-0000-000000000011',
        '10000000-0000-0000-0000-000000000001','present',now()-interval '2 days');

INSERT INTO public.calendar_events(user_id,title,event_type,event_date)
VALUES
 ('00000000-0000-0000-0000-000000000011','Competition','competition',now()+interval '3 days'),
 ('00000000-0000-0000-0000-000000000011','Private health event','medical',now()+interval '4 days'),
 ('00000000-0000-0000-0000-000000000011','Recovery day','recovery',now()+interval '5 days');

INSERT INTO public.notification_preferences(user_id)
SELECT id FROM auth.users;
