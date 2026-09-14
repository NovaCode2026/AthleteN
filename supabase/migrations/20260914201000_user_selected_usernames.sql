drop trigger if exists profiles_username_trigger on public.profiles;
create or replace function public.generate_profile_username() returns trigger language plpgsql set search_path=public as $$
begin
  if new.username is null or btrim(new.username)='' then new.username:=null;
  else new.username:=lower(btrim(new.username)); end if;
  if new.username is not null and new.username !~ '^[a-z0-9][a-z0-9_.-]{2,29}$' then raise exception 'Username must be 3-30 characters and use only lowercase letters, numbers, dot, underscore, or hyphen.'; end if;
  return new;
end;
$$;
