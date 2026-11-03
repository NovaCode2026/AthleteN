do $migration$
declare
  policy_row record;
  using_expression text;
  check_expression text;
  alter_statement text;
  changed_count integer := 0;
begin
  for policy_row in
    select
      pol.polname,
      pol.polrelid,
      pg_get_expr(pol.polqual, pol.polrelid) as using_expression,
      pg_get_expr(pol.polwithcheck, pol.polrelid) as check_expression
    from pg_policy pol
    join pg_class c on c.oid = pol.polrelid
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public'
      and (
        (
          coalesce(pg_get_expr(pol.polqual, pol.polrelid), '') ~* 'auth\.uid\(\)'
          and coalesce(pg_get_expr(pol.polqual, pol.polrelid), '') !~* 'SELECT auth\.uid\(\)'
        )
        or
        (
          coalesce(pg_get_expr(pol.polwithcheck, pol.polrelid), '') ~* 'auth\.uid\(\)'
          and coalesce(pg_get_expr(pol.polwithcheck, pol.polrelid), '') !~* 'SELECT auth\.uid\(\)'
        )
      )
  loop
    using_expression := policy_row.using_expression;
    check_expression := policy_row.check_expression;

    if using_expression is not null
       and using_expression ~* 'auth\.uid\(\)'
       and using_expression !~* 'SELECT auth\.uid\(\)' then
      using_expression := replace(
        using_expression,
        'auth.uid()',
        '( SELECT auth.uid() AS uid)'
      );
    end if;

    if check_expression is not null
       and check_expression ~* 'auth\.uid\(\)'
       and check_expression !~* 'SELECT auth\.uid\(\)' then
      check_expression := replace(
        check_expression,
        'auth.uid()',
        '( SELECT auth.uid() AS uid)'
      );
    end if;

    alter_statement := format(
      'ALTER POLICY %I ON %s',
      policy_row.polname,
      policy_row.polrelid::regclass
    );

    if using_expression is not null then
      alter_statement := alter_statement || format(' USING (%s)', using_expression);
    end if;

    if check_expression is not null then
      alter_statement := alter_statement || format(' WITH CHECK (%s)', check_expression);
    end if;

    execute alter_statement;
    changed_count := changed_count + 1;
  end loop;

  if changed_count <> 30 then
    raise exception 'Expected to optimize 30 policies, optimized %; rolling back migration', changed_count;
  end if;
end;
$migration$;
