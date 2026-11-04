alter table public.competition_checklists
  add column if not exists tournament_id uuid
  references public.tournaments(id) on delete cascade;

create index if not exists idx_competition_checklists_tournament_user
  on public.competition_checklists (tournament_id, user_id);
