-- Keep web and native messaging in sync without polling.
-- Supabase Realtime only delivers database changes for tables in this publication.
do $$
declare
  t text;
begin
  foreach t in array array['messages','conversation_members','conversations','messaging_hidden_conversations'] loop
    if to_regclass('public.' || t) is not null
      and not exists (
        select 1 from pg_publication_tables
        where pubname = 'supabase_realtime'
          and schemaname = 'public'
          and tablename = t
      ) then
      execute format('alter publication supabase_realtime add table public.%I', t);
    end if;
  end loop;
end $$;
