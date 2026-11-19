drop policy if exists "age approval required" on public.hydration_logs;
create policy "age approval required" on public.hydration_logs
as restrictive for all to authenticated
using (public.can_view_athlete(user_id) or public.is_platform_admin())
with check (public.can_view_athlete(user_id) or public.is_platform_admin());

drop policy if exists "age approval required" on public.kyorugi_bouts;
create policy "age approval required" on public.kyorugi_bouts
as restrictive for all to authenticated
using (public.can_view_athlete(user_id) or public.is_platform_admin())
with check (public.can_view_athlete(user_id) or public.is_platform_admin());

drop policy if exists "age approval required" on public.kyorugi_training_metrics;
create policy "age approval required" on public.kyorugi_training_metrics
as restrictive for all to authenticated
using (public.can_view_athlete(user_id) or public.is_platform_admin())
with check (public.can_view_athlete(user_id) or public.is_platform_admin());

drop policy if exists "age approval required" on public.nutrition_logs;
create policy "age approval required" on public.nutrition_logs
as restrictive for all to authenticated
using (public.can_view_athlete(user_id) or public.is_platform_admin())
with check (public.can_view_athlete(user_id) or public.is_platform_admin());

drop policy if exists "age approval required" on public.poomsae_performances;
create policy "age approval required" on public.poomsae_performances
as restrictive for all to authenticated
using (public.can_view_athlete(user_id) or public.is_platform_admin())
with check (public.can_view_athlete(user_id) or public.is_platform_admin());

drop policy if exists "age approval required" on public.poomsae_training_metrics;
create policy "age approval required" on public.poomsae_training_metrics
as restrictive for all to authenticated
using (public.can_view_athlete(user_id) or public.is_platform_admin())
with check (public.can_view_athlete(user_id) or public.is_platform_admin());

drop policy if exists "age approval required" on public.taekwondo_belt_history;
create policy "age approval required" on public.taekwondo_belt_history
as restrictive for all to authenticated
using (public.can_view_athlete(athlete_user_id) or public.is_platform_admin())
with check (public.can_view_athlete(athlete_user_id) or public.is_platform_admin());

drop policy if exists "age approval required" on public.taekwondo_training_logs;
create policy "age approval required" on public.taekwondo_training_logs
as restrictive for all to authenticated
using (public.can_view_athlete(user_id) or public.is_platform_admin())
with check (public.can_view_athlete(user_id) or public.is_platform_admin());

drop policy if exists "age approval required" on public.taekwondo_weight_category_decisions;
create policy "age approval required" on public.taekwondo_weight_category_decisions
as restrictive for all to authenticated
using (public.can_view_athlete(athlete_user_id) or public.is_platform_admin())
with check (public.can_view_athlete(athlete_user_id) or public.is_platform_admin());