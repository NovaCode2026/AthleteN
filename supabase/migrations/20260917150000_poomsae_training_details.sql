-- Store the actual Poomsae and category for practice sessions.
-- Existing Kyorugi training rows remain unchanged.

alter table public.taekwondo_training_logs
  add column if not exists poomsae_name text,
  add column if not exists category text;

create index if not exists idx_tkd_training_poomsae
  on public.taekwondo_training_logs(user_id, discipline, poomsae_name);
