-- Keep Taekwondo domain records in sync between Web and Mobile.
-- Realtime is only delivered for tables included in supabase_realtime.
do $$
declare
  t text;
begin
  foreach t in array array[
    'taekwondo_training_logs',
    'taekwondo_kyorugi_bouts',
    'taekwondo_poomsae_performances',
    'student_verifications',
    'subscription_usage',
    'athlete_seasons',
    'competition_journals',
    'fight_iq_entries',
    'technique_progress',
    'athlete_challenges',
    'personal_records',
    'athlete_milestones',
    'athlete_timeline_events'
  ] loop
    if to_regclass('public.' || t) is not null
      and not exists (
        select 1
        from pg_publication_tables
        where pubname = 'supabase_realtime'
          and schemaname = 'public'
          and tablename = t
      ) then
      execute format('alter publication supabase_realtime add table public.%I', t);
    end if;
  end loop;
end $$;
