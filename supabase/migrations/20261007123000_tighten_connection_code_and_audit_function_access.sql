drop policy if exists "connection codes owner" on public.connection_codes;
create policy "connection codes owner" on public.connection_codes
for all to authenticated
using (owner_user_id=auth.uid() or private.is_platform_admin())
with check (owner_user_id=auth.uid() or private.is_platform_admin());

revoke all on function public.audit_athlete_record_change() from anon,authenticated;