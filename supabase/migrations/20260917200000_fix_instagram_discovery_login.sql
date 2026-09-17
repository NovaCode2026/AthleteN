-- Move the organizer-scanning connection to the current Instagram Login flow.
-- The previous implementation used Facebook/Page Business Discovery fields,
-- including a required Facebook user id. The current flow stores an Instagram
-- authorization token instead, so that legacy column must be nullable.

alter table public.instagram_discovery_connections
  alter column facebook_user_id drop not null;

comment on column public.instagram_discovery_connections.facebook_user_id is
  'Legacy Facebook Login identifier; nullable for current Instagram Login connections.';
