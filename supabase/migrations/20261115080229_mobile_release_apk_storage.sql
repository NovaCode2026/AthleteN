insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'mobile-release-apks',
  'mobile-release-apks',
  true,
  52428800,
  array['application/vnd.android.package-archive']::text[]
)
on conflict (id) do update
set
  name = excluded.name,
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "mobile release apks super admin insert" on storage.objects;
create policy "mobile release apks super admin insert"
on storage.objects
for insert
to authenticated
with check (
  bucket_id = 'mobile-release-apks'
  and exists (
    select 1
    from public.profiles p
    where p.user_id = (select auth.uid())
      and p.role = 'super_admin'
  )
);

drop policy if exists "mobile release apks super admin delete" on storage.objects;
create policy "mobile release apks super admin delete"
on storage.objects
for delete
to authenticated
using (
  bucket_id = 'mobile-release-apks'
  and exists (
    select 1
    from public.profiles p
    where p.user_id = (select auth.uid())
      and p.role = 'super_admin'
  )
);
