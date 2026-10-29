-- Add indexes for foreign-key columns that lack a usable leading-column index.
-- Additive only: no row data or authorization policies are changed.
do $$
declare r record; idx_name text;
begin
  for r in
    select ns.nspname as schema_name,
           tbl.relname as table_name,
           string_agg(quote_ident(att.attname), ', ' order by key_col.ord) as columns_sql,
           string_agg(att.attname, '_' order by key_col.ord) as columns_name,
           array_agg(att.attnum order by key_col.ord) as attnums
    from pg_constraint con
    join pg_class tbl on tbl.oid = con.conrelid
    join pg_namespace ns on ns.oid = tbl.relnamespace
    cross join lateral unnest(con.conkey) with ordinality as key_col(attnum, ord)
    join pg_attribute att on att.attrelid = tbl.oid and att.attnum = key_col.attnum
    where con.contype = 'f' and ns.nspname = 'public'
    group by ns.nspname, tbl.relname, con.conname, tbl.oid, con.conkey
    having not exists (
      select 1
      from pg_index ix
      where ix.indrelid = tbl.oid and ix.indisvalid and ix.indisready
        and ix.indpred is null and ix.indexprs is null
        and (
          select array_agg(ix.indkey[pos]::smallint order by pos)
          from generate_series(0, cardinality(con.conkey)-1) pos
        ) = con.conkey
    )
  loop
    idx_name := left('idx_' || r.table_name || '_' || r.columns_name || '_fk', 63);
    execute format('create index if not exists %I on %I.%I (%s)',idx_name,r.schema_name,r.table_name,r.columns_sql);
  end loop;
end $$;