alter table private.qa_age_verification_overrides disable row level security;
revoke all on table private.qa_age_verification_overrides from anon, authenticated;
revoke execute on function public.find_athlete_by_username(text) from anon;
