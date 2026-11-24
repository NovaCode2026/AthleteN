-- Private, per-user contact presentation data.
-- This migration is additive and is not authorized for production application.
create table if not exists public.messaging_private_contacts (
  owner_user_id uuid not null references auth.users(id) on delete cascade,
  contact_user_id uuid not null references auth.users(id) on delete cascade,
  nickname text,
  personal_note text,
  relationship_label text,
  organization_label text,
  custom_labels text[] not null default '{}'::text[],
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint messaging_private_contacts_pkey primary key (owner_user_id, contact_user_id),
  constraint messaging_private_contacts_not_self check (owner_user_id <> contact_user_id),
  constraint messaging_private_contacts_nickname_length check (nickname is null or char_length(btrim(nickname)) between 1 and 60),
  constraint messaging_private_contacts_note_length check (personal_note is null or char_length(personal_note) <= 1000),
  constraint messaging_private_contacts_relationship_length check (relationship_label is null or char_length(relationship_label) <= 60),
  constraint messaging_private_contacts_organization_length check (organization_label is null or char_length(organization_label) <= 100),
  constraint messaging_private_contacts_labels_count check (cardinality(custom_labels) <= 20)
);

alter table public.messaging_private_contacts enable row level security;

revoke all on table public.messaging_private_contacts from public, anon, authenticated, service_role;
grant select, insert, update, delete on table public.messaging_private_contacts to authenticated;

drop policy if exists "users read their own private messaging contacts" on public.messaging_private_contacts;
create policy "users read their own private messaging contacts"
  on public.messaging_private_contacts
  for select to authenticated
  using (owner_user_id = (select auth.uid()));

drop policy if exists "users create their own private messaging contacts" on public.messaging_private_contacts;
create policy "users create their own private messaging contacts"
  on public.messaging_private_contacts
  for insert to authenticated
  with check (owner_user_id = (select auth.uid()));

drop policy if exists "users update their own private messaging contacts" on public.messaging_private_contacts;
create policy "users update their own private messaging contacts"
  on public.messaging_private_contacts
  for update to authenticated
  using (owner_user_id = (select auth.uid()))
  with check (owner_user_id = (select auth.uid()));

drop policy if exists "users delete their own private messaging contacts" on public.messaging_private_contacts;
create policy "users delete their own private messaging contacts"
  on public.messaging_private_contacts
  for delete to authenticated
  using (owner_user_id = (select auth.uid()));

create or replace function public.set_messaging_private_contact_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $function$
begin
  new.updated_at := now();
  return new;
end;
$function$;

revoke all on function public.set_messaging_private_contact_updated_at() from public, anon, authenticated;
drop trigger if exists messaging_private_contacts_set_updated_at on public.messaging_private_contacts;
create trigger messaging_private_contacts_set_updated_at
  before update on public.messaging_private_contacts
  for each row execute function public.set_messaging_private_contact_updated_at();

create index if not exists messaging_private_contacts_contact_idx
  on public.messaging_private_contacts (contact_user_id);
