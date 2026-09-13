create policy "Users can manage own training sessions"
on public.training_sessions
for all
to authenticated
using (user_id = (select auth.uid()))
with check (user_id = (select auth.uid()));

create policy "Users can manage own tournaments"
on public.tournaments
for all
to authenticated
using (user_id = (select auth.uid()))
with check (user_id = (select auth.uid()));

create policy "Users can manage own medals"
on public.medals
for all
to authenticated
using (user_id = (select auth.uid()))
with check (user_id = (select auth.uid()));
