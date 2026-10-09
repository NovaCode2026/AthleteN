-- Normalize profile taxonomy values before existing CHECK constraints run.
-- Keeps validation strict while allowing mobile clients to send display-case values.
create or replace function public.normalize_profile_taxonomy_values()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.sport is not null then
    new.sport := lower(trim(new.sport));
  end if;
  if new.discipline is not null then
    new.discipline := lower(trim(new.discipline));
  end if;
  return new;
end;
$$;

drop trigger if exists normalize_profile_taxonomy_values on public.profiles;
create trigger normalize_profile_taxonomy_values
before insert or update of sport, discipline on public.profiles
for each row
execute function public.normalize_profile_taxonomy_values();

revoke all on function public.normalize_profile_taxonomy_values() from public, anon, authenticated;
