-- The legacy "age approval required" policy was created as PERMISSIVE.
-- PostgreSQL combines permissive policies with OR, so the age check alone
-- accidentally granted all rows/operations on every affected table to any
-- age-approved authenticated user. Recreate the same gate as RESTRICTIVE:
-- this ANDs age approval with each table's ownership/participant/admin policy.

do $migration$
declare
  v_table record;
  v_policy_exists boolean;
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

-- Fail closed if a future schema migration creates the legacy gate again
-- as a permissive policy. This is a verification query only; the static
-- regression suite independently enforces the intended migration pattern.
