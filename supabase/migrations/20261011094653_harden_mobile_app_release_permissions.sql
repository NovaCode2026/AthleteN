-- Keep release metadata public-readable only through RLS, and restrict writes
-- to authenticated Super Admins. The table contains a single current release.
revoke all privileges on table public.mobile_app_releases from public, anon, authenticated;
grant select on table public.mobile_app_releases to anon, authenticated;
grant insert, update on table public.mobile_app_releases to authenticated;

drop policy if exists "super admins delete mobile releases" on public.mobile_app_releases;
drop policy if exists "super admins publish mobile releases" on public.mobile_app_releases;
drop policy if exists "super admins update mobile releases" on public.mobile_app_releases;

create policy "super admins publish mobile releases"
  on public.mobile_app_releases
  for insert
  to authenticated
  with check (
    exists (
      select 1
      from public.profiles p
      where p.user_id = auth.uid()
        and p.role = 'super_admin'
    )
    and updated_by = auth.uid()
  );

create policy "super admins update mobile releases"
  on public.mobile_app_releases
  for update
  to authenticated
  using (
    exists (
      select 1
      from public.profiles p
      where p.user_id = auth.uid()
        and p.role = 'super_admin'
    )
  )
  with check (
    exists (
      select 1
      from public.profiles p
      where p.user_id = auth.uid()
        and p.role = 'super_admin'
    )
    and updated_by = auth.uid()
  );

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.mobile_app_releases'::regclass
      and conname = 'mobile_app_releases_minimum_not_above_release'
  ) then
    alter table public.mobile_app_releases
      add constraint mobile_app_releases_minimum_not_above_release
      check (minimum_version_code <= version_code);
  end if;

  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.mobile_app_releases'::regclass
      and conname = 'mobile_app_releases_version_format'
  ) then
    alter table public.mobile_app_releases
      add constraint mobile_app_releases_version_format
      check (version ~ '^[0-9]+\\.[0-9]+\\.[0-9]+([+-][0-9A-Za-z.-]+)?$');
  end if;

  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.mobile_app_releases'::regclass
      and conname = 'mobile_app_releases_notes_length'
  ) then
    alter table public.mobile_app_releases
      add constraint mobile_app_releases_notes_length
      check (char_length(release_notes) <= 10000);
  end if;
end
$$;
