-- Website Super Admin release publishing: keep drafts separate from the live Android release.
alter table public.mobile_app_releases
  add column if not exists storage_path text;

create table if not exists public.mobile_app_release_drafts (
  id boolean primary key default true check (id = true),
  version text not null,
  version_code integer not null check (version_code > 0),
  minimum_version_code integer not null default 1 check (minimum_version_code > 0),
  download_url text not null,
  storage_path text not null,
  release_notes text not null default '',
  updated_by uuid references auth.users(id) on delete set null,
  updated_at timestamptz not null default now(),
  constraint mobile_app_release_drafts_https_url check (download_url ~ '^https://'),
  constraint mobile_app_release_drafts_minimum_not_above_release check (minimum_version_code <= version_code),
  constraint mobile_app_release_drafts_version_format check (version ~ '^[0-9]+\\.[0-9]+\\.[0-9]+([+-][0-9A-Za-z.-]+)?$'),
  constraint mobile_app_release_drafts_notes_length check (char_length(release_notes) <= 10000)
);

alter table public.mobile_app_release_drafts enable row level security;
revoke all privileges on table public.mobile_app_release_drafts from public, anon, authenticated;
grant select, insert, update, delete on table public.mobile_app_release_drafts to authenticated;

drop policy if exists "Super Admins manage Android release drafts" on public.mobile_app_release_drafts;
create policy "Super Admins manage Android release drafts"
  on public.mobile_app_release_drafts
  for all
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

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'athleten-mobile-releases',
  'athleten-mobile-releases',
  true,
  262144000,
  array['application/vnd.android.package-archive', 'application/octet-stream']
)
on conflict (id) do update
set public = excluded.public,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "Super Admins upload AthleteN Android releases" on storage.objects;
create policy "Super Admins upload AthleteN Android releases"
  on storage.objects
  for insert
  to authenticated
  with check (
    bucket_id = 'athleten-mobile-releases'
    and exists (
      select 1 from public.profiles p
      where p.user_id = auth.uid() and p.role = 'super_admin'
    )
  );

drop policy if exists "Super Admins delete AthleteN Android releases" on storage.objects;
create policy "Super Admins delete AthleteN Android releases"
  on storage.objects
  for delete
  to authenticated
  using (
    bucket_id = 'athleten-mobile-releases'
    and exists (
      select 1 from public.profiles p
      where p.user_id = auth.uid() and p.role = 'super_admin'
    )
  );
