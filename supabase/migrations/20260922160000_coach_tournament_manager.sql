alter table public.tournaments add column if not exists coach_user_id uuid references auth.users(id) on delete set null;
create index if not exists tournaments_coach_user_id_idx on public.tournaments(coach_user_id);
drop policy if exists "Coaches can manage linked athlete tournaments" on public.tournaments;
create policy "Coaches can manage linked athlete tournaments" on public.tournaments for all
using (coach_user_id = auth.uid() and private.user_can_manage_athlete(user_id))
with check (coach_user_id = auth.uid() and private.user_can_manage_athlete(user_id));