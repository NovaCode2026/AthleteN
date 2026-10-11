create table if not exists public.mobile_app_releases (
  id boolean primary key default true check (id = true),
  version text not null,
  version_code integer not null check (version_code > 0),
  minimum_version_code integer not null default 1 check (minimum_version_code > 0),
  download_url text not null,
  release_notes text not null default '',
  published boolean not null default false,
  updated_by uuid references auth.users(id) on delete set null,
  updated_at timestamptz not null default now(),
  constraint mobile_app_releases_https_url check (download_url ~ '^https://')
);

alter table public.mobile_app_releases enable row level security;

drop policy if exists "published mobile release is readable" on public.mobile_app_releases;
create policy "published mobile release is readable"
  on public.mobile_app_releases for select
  to anon, authenticated
  using (
    published = true
    or exists (
      select 1 from public.profiles p
      where p.user_id = auth.uid() and p.role = 'super_admin'
    )
  );

drop policy if exists "super admins publish mobile releases" on public.mobile_app_releases;
create policy "super admins publish mobile releases"
  on public.mobile_app_releases for insert
  to authenticated
  with check (
    exists (
      select 1 from public.profiles p
      where p.user_id = auth.uid() and p.role = 'super_admin'
    )
    and updated_by = auth.uid()
  );

drop policy if exists "super admins update mobile releases" on public.mobile_app_releases;
create policy "super admins update mobile releases"
  on public.mobile_app_releases for update
  to authenticated
  using (
    exists (
      select 1 from public.profiles p
      where p.user_id = auth.uid() and p.role = 'super_admin'
    )
  )
  with check (
    exists (
      select 1 from public.profiles p
      where p.user_id = auth.uid() and p.role = 'super_admin'
    )
    and updated_by = auth.uid()
  );

drop policy if exists "super admins delete mobile releases" on public.mobile_app_releases;
create policy "super admins delete mobile releases"
  on public.mobile_app_releases for delete
  to authenticated
  using (
    exists (
      select 1 from public.profiles p
      where p.user_id = auth.uid() and p.role = 'super_admin'
    )
  );

grant select on public.mobile_app_releases to anon, authenticated;
grant insert, update, delete on public.mobile_app_releases to authenticated;
