-- Explicitly document the server-only nature of OAuth state/connection internals.
drop policy if exists "users can read own instagram connection" on public.instagram_connections;
create policy "users can read own instagram connection"
  on public.instagram_connections as permissive for select to authenticated
  using (user_id = (select auth.uid()));

-- Server-only tables: explicit deny policies preserve default-deny RLS while
-- documenting that clients must never read or write these internals.
drop policy if exists "server only discovery connections" on public.instagram_discovery_connections;
create policy "server only discovery connections"
  on public.instagram_discovery_connections as restrictive for all to public
  using (false) with check (false);

drop policy if exists "server only instagram oauth states" on public.instagram_oauth_states;
create policy "server only instagram oauth states"
  on public.instagram_oauth_states as restrictive for all to public
  using (false) with check (false);

drop policy if exists "server only discovery oauth states" on public.instagram_discovery_oauth_states;
create policy "server only discovery oauth states"
  on public.instagram_discovery_oauth_states as restrictive for all to public
  using (false) with check (false);
