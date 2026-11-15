-- Founder-only release drafts, publish RPC and immutable release history.
-- Existing mobile_app_releases remains the single public "current release" row
-- consumed by Android clients. Drafts never replace the live row.

-- Keep anonymous update checks working before login. The previous shared
-- SELECT policy queried profiles for anon, but anon has no SELECT on profiles.
-- Split the policy so anonymous clients can read published metadata only.
drop policy if exists "published mobile release is readable" on public.mobile_app_releases;
drop policy if exists "anon can read published mobile release" on public.mobile_app_releases;
drop policy if exists "authenticated can read published release or super admin" on public.mobile_app_releases;

create policy "anon can read published mobile release"
  on public.mobile_app_releases for select to anon
  using (published = true);

create policy "authenticated can read published release or super admin"
  on public.mobile_app_releases for select to authenticated
  using (
    published = true
    or exists (
      select 1 from public.profiles p
      where p.user_id = auth.uid() and p.role = 'super_admin'
    )
  );


-- Public download bucket for signed Android APKs. Upload/delete are
-- restricted to Super Admins; public access is intentionally read-only.
insert into storage.buckets (
  id, name, public, file_size_limit, allowed_mime_types
) values (
  'athleten-mobile-releases',
  'athleten-mobile-releases',
  true,
  157286400,
  array['application/vnd.android.package-archive']::text[]
)
on conflict (id) do nothing;

drop policy if exists "Super admins upload AthleteN release APKs" on storage.objects;
create policy "Super admins upload AthleteN release APKs"
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'athleten-mobile-releases'
    and exists (
      select 1 from public.profiles p
      where p.user_id = auth.uid() and p.role = 'super_admin'
    )
  );

drop policy if exists "Super admins delete AthleteN release APKs" on storage.objects;
create policy "Super admins delete AthleteN release APKs"
  on storage.objects for delete to authenticated
  using (
    bucket_id = 'athleten-mobile-releases'
    and exists (
      select 1 from public.profiles p
      where p.user_id = auth.uid() and p.role = 'super_admin'
    )
  );


create table if not exists public.mobile_app_release_drafts (
  id boolean primary key default true check (id = true),
  version text not null,
  version_code integer not null check (version_code > 0),
  minimum_version_code integer not null default 1 check (minimum_version_code > 0),
  download_url text not null default '',
  release_notes text not null default '',
  updated_by uuid references auth.users(id) on delete set null,
  updated_at timestamptz not null default now(),
  constraint mobile_app_release_drafts_minimum_not_above_release
    check (minimum_version_code <= version_code),
  constraint mobile_app_release_drafts_version_format
    check (version ~ '^[0-9]+\.[0-9]+\.[0-9]+([+-][0-9A-Za-z.-]+)?$'),
  constraint mobile_app_release_drafts_url
    check (download_url = '' or download_url ~ '^https://'),
  constraint mobile_app_release_drafts_notes_length
    check (char_length(release_notes) <= 10000)
);

alter table public.mobile_app_release_drafts enable row level security;
revoke all on table public.mobile_app_release_drafts from public, anon, authenticated;
grant select, insert, update, delete on table public.mobile_app_release_drafts to authenticated;

drop policy if exists "super admins read mobile release drafts" on public.mobile_app_release_drafts;
create policy "super admins read mobile release drafts"
  on public.mobile_app_release_drafts for select to authenticated
  using (exists (
    select 1 from public.profiles p
    where p.user_id = auth.uid() and p.role = 'super_admin'
  ));

drop policy if exists "super admins save mobile release drafts" on public.mobile_app_release_drafts;
create policy "super admins save mobile release drafts"
  on public.mobile_app_release_drafts for insert to authenticated
  with check (
    exists (
      select 1 from public.profiles p
      where p.user_id = auth.uid() and p.role = 'super_admin'
    )
    and updated_by = auth.uid()
  );

drop policy if exists "super admins update mobile release drafts" on public.mobile_app_release_drafts;
create policy "super admins update mobile release drafts"
  on public.mobile_app_release_drafts for update to authenticated
  using (exists (
    select 1 from public.profiles p
    where p.user_id = auth.uid() and p.role = 'super_admin'
  ))
  with check (
    exists (
      select 1 from public.profiles p
      where p.user_id = auth.uid() and p.role = 'super_admin'
    )
    and updated_by = auth.uid()
  );

drop policy if exists "super admins delete mobile release drafts" on public.mobile_app_release_drafts;
create policy "super admins delete mobile release drafts"
  on public.mobile_app_release_drafts for delete to authenticated
  using (exists (
    select 1 from public.profiles p
    where p.user_id = auth.uid() and p.role = 'super_admin'
  ));

create table if not exists public.mobile_app_release_history (
  id uuid primary key default gen_random_uuid(),
  action text not null check (action in ('draft_saved', 'published')),
  version text not null,
  version_code integer not null,
  minimum_version_code integer not null,
  download_url text not null,
  release_notes text not null default '',
  published boolean not null default false,
  actor_id uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);

alter table public.mobile_app_release_history enable row level security;
revoke all on table public.mobile_app_release_history from public, anon, authenticated;
grant select on table public.mobile_app_release_history to authenticated;

drop policy if exists "super admins read mobile release history" on public.mobile_app_release_history;
create policy "super admins read mobile release history"
  on public.mobile_app_release_history for select to authenticated
  using (exists (
    select 1 from public.profiles p
    where p.user_id = auth.uid() and p.role = 'super_admin'
  ));

create or replace function public.record_mobile_app_release_draft()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  insert into public.mobile_app_release_history (
    action, version, version_code, minimum_version_code, download_url,
    release_notes, published, actor_id
  ) values (
    'draft_saved', new.version, new.version_code, new.minimum_version_code,
    new.download_url, new.release_notes, false, coalesce(auth.uid(), new.updated_by)
  );
  return new;
end;
$$;

revoke all on function public.record_mobile_app_release_draft() from public, anon, authenticated;

drop trigger if exists record_mobile_app_release_draft on public.mobile_app_release_drafts;
create trigger record_mobile_app_release_draft
  after insert or update on public.mobile_app_release_drafts
  for each row execute function public.record_mobile_app_release_draft();

create or replace function public.record_mobile_app_release_publish()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  insert into public.mobile_app_release_history (
    action, version, version_code, minimum_version_code, download_url,
    release_notes, published, actor_id
  ) values (
    'published', new.version, new.version_code, new.minimum_version_code,
    new.download_url, new.release_notes, new.published, coalesce(auth.uid(), new.updated_by)
  );
  return new;
end;
$$;

revoke all on function public.record_mobile_app_release_publish() from public, anon, authenticated;

drop trigger if exists record_mobile_app_release_publish on public.mobile_app_releases;
create trigger record_mobile_app_release_publish
  after insert or update on public.mobile_app_releases
  for each row when (new.published = true)
  execute function public.record_mobile_app_release_publish();

create or replace function public.publish_mobile_app_release(
  p_version text,
  p_version_code integer,
  p_minimum_version_code integer,
  p_download_url text,
  p_release_notes text
)
returns public.mobile_app_releases
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  current_code integer;
  result_row public.mobile_app_releases%rowtype;
begin
  if auth.uid() is null or not exists (
    select 1 from public.profiles p
    where p.user_id = auth.uid() and p.role = 'super_admin'
  ) then
    raise exception 'Only a Super Admin can publish mobile app releases.'
      using errcode = '42501';
  end if;

  if p_version is null or p_version !~ '^[0-9]+\.[0-9]+\.[0-9]+([+-][0-9A-Za-z.-]+)?$' then
    raise exception 'Invalid release version name.';
  end if;
  if p_version_code is null or p_version_code <= 0 or
     p_minimum_version_code is null or p_minimum_version_code <= 0 or
     p_minimum_version_code > p_version_code then
    raise exception 'Invalid Android versionCode or minimum supported versionCode.';
  end if;
  if p_download_url is null or p_download_url !~ '^https://[^[:space:]]+\.apk([?#][^[:space:]]*)?$' then
    raise exception 'The release asset must be a direct HTTPS URL ending in .apk.';
  end if;
  if char_length(coalesce(p_release_notes, '')) > 10000 then
    raise exception 'Release notes must be 10,000 characters or fewer.';
  end if;

  select r.version_code into current_code
  from public.mobile_app_releases r
  where r.id = true and r.published = true
  for update;

  if current_code is not null and p_version_code <= current_code then
    raise exception 'Android versionCode must be greater than the currently published release (%).', current_code;
  end if;

  insert into public.mobile_app_releases (
    id, version, version_code, minimum_version_code, download_url,
    release_notes, published, updated_by, updated_at
  ) values (
    true, p_version, p_version_code, p_minimum_version_code,
    p_download_url, coalesce(p_release_notes, ''), true, auth.uid(), now()
  )
  on conflict (id) do update set
    version = excluded.version,
    version_code = excluded.version_code,
    minimum_version_code = excluded.minimum_version_code,
    download_url = excluded.download_url,
    release_notes = excluded.release_notes,
    published = true,
    updated_by = auth.uid(),
    updated_at = now()
  returning * into result_row;

  delete from public.mobile_app_release_drafts where id = true;
  return result_row;
end;
$$;

revoke all on function public.publish_mobile_app_release(text, integer, integer, text, text)
  from public, anon, authenticated;
grant execute on function public.publish_mobile_app_release(text, integer, integer, text, text)
  to authenticated;
