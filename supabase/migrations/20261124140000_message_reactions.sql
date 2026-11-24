-- Lightweight, conversation-scoped message reactions.
-- Candidate only: do not apply to production until migration history is reconciled
-- and this migration is replayed and role-tested in an isolated staging database.

create table if not exists public.message_reactions (
  message_id uuid not null references public.messages(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  reaction text not null check (reaction in ('👍','❤️','😂','😮','😢','🙏')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint message_reactions_pkey primary key (message_id, user_id)
);

create index if not exists message_reactions_user_message_idx
  on public.message_reactions(user_id, message_id);

alter table public.message_reactions enable row level security;

drop policy if exists "Conversation members can read message reactions" on public.message_reactions;
create policy "Conversation members can read message reactions"
  on public.message_reactions
  for select to authenticated
  using (
    public.is_age_approved((select auth.uid()))
    and exists (
      select 1
      from public.messages m
      where m.id = message_reactions.message_id
        and public.is_conversation_member(m.conversation_id)
    )
  );

drop policy if exists "Members can add their own message reactions" on public.message_reactions;
create policy "Members can add their own message reactions"
  on public.message_reactions
  for insert to authenticated
  with check (
    user_id = (select auth.uid())
    and public.is_age_approved((select auth.uid()))
    and exists (
      select 1
      from public.messages m
      where m.id = message_reactions.message_id
        and m.deleted_for_everyone_at is null
        and public.is_conversation_member(m.conversation_id)
    )
  );

drop policy if exists "Users can update their own message reactions" on public.message_reactions;
create policy "Users can update their own message reactions"
  on public.message_reactions
  for update to authenticated
  using (
    user_id = (select auth.uid())
    and public.is_age_approved((select auth.uid()))
    and exists (
      select 1
      from public.messages m
      where m.id = message_reactions.message_id
        and m.deleted_for_everyone_at is null
        and public.is_conversation_member(m.conversation_id)
    )
  )
  with check (
    user_id = (select auth.uid())
    and public.is_age_approved((select auth.uid()))
    and exists (
      select 1
      from public.messages m
      where m.id = message_reactions.message_id
        and m.deleted_for_everyone_at is null
        and public.is_conversation_member(m.conversation_id)
    )
  );

drop policy if exists "Users can remove their own message reactions" on public.message_reactions;
create policy "Users can remove their own message reactions"
  on public.message_reactions
  for delete to authenticated
  using (
    user_id = (select auth.uid())
    and public.is_age_approved((select auth.uid()))
    and exists (
      select 1
      from public.messages m
      where m.id = message_reactions.message_id
        and public.is_conversation_member(m.conversation_id)
    )
  );

revoke all on public.message_reactions from public, anon;
grant select, insert, update, delete on public.message_reactions to authenticated;

comment on table public.message_reactions is
  'At most one allowed emoji reaction per authenticated conversation member per message.';
