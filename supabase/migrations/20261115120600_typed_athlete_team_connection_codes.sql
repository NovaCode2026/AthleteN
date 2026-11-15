-- Let web users choose Coach code or Academy code explicitly.
-- The original one-argument RPC remains in place for already-released mobile builds.

create or replace function public.connect_athlete_by_code_typed(
  p_code text,
  p_expected_type text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_owner_type text;
begin
  if auth.uid() is null then
    raise exception 'Authentication required';
  end if;

  if p_expected_type not in ('coach', 'academy') then
    raise exception 'Choose Coach code or Academy code';
  end if;

  if p_code is null or length(btrim(p_code)) not between 4 and 30 then
    raise exception 'A valid connection code is required';
  end if;

  select cc.owner_type into v_owner_type
  from public.connection_codes cc
  where cc.active = true
    and lower(btrim(cc.code)) = lower(btrim(p_code))
  limit 1;

  if not found then
    raise exception 'Connection code not found';
  end if;

  if v_owner_type is distinct from p_expected_type then
    raise exception 'This code is not a % code. Choose the matching connection type.', p_expected_type;
  end if;

  return public.connect_athlete_by_code(p_code);
end;
$function$;

revoke all on function public.connect_athlete_by_code_typed(text, text) from public, anon;
grant execute on function public.connect_athlete_by_code_typed(text, text) to authenticated;
