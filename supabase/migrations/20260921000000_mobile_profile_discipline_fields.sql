alter table public.profiles
  add column if not exists gender text,
  add column if not exists sport text,
  add column if not exists club text,
  add column if not exists discipline text check (discipline is null or discipline in ('Kyorugi','Poomsae'));
