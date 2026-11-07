-- The legacy "age approval required" policy was created as PERMISSIVE.
-- PostgreSQL combines permissive policies with OR, so the age check alone
-- accidentally granted all rows/operations on every affected table to any
-- age-approved authenticated user. Recreate the same gate as RESTRICTIVE:
-- this ANDs age approval with each table's ownership/participant/admin policy.

do $migration$
declare
  v_table record;
begin
  for v_table in
    select distinct tablename
    from pg_policies
    where schemaname = 'public'
      and policyname = 'age approval required'
    order by tablename
  loop
    execute format(
      'drop policy %I on %I.%I',
      'age approval required',
      'public',
      v_table.tablename
    );

    execute format(
      'create policy %I on %I.%I as restrictive for all to authenticated using ((select public.is_age_approved((select auth.uid()))) or (select private.is_platform_admin())) with check ((select public.is_age_approved((select auth.uid()))) or (select private.is_platform_admin()))',
      'age approval required',
      'public',
      v_table.tablename
    );
  end loop;
end;
$migration$;

do $verification$
begin
  if exists (
    select 1
    from pg_policy p
    join pg_class c on c.oid = p.polrelid
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public'
      and p.polname = 'age approval required'
      and p.polpermissive
  ) then
    raise exception 'A public age approval policy is still permissive';
  end if;
end;
$verification$;
