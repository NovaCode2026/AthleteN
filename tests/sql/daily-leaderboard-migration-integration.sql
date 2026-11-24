\\set ON_ERROR_STOP on

insert into auth.users (id) values
  ('10000000-0000-4000-8000-000000000001'),
  ('10000000-0000-4000-8000-000000000002'),
  ('10000000-0000-4000-8000-000000000003');

insert into public.profiles (user_id) values
  ('10000000-0000-4000-8000-000000000001'),
  ('10000000-0000-4000-8000-000000000002'),
  ('10000000-0000-4000-8000-000000000003');

do $$
declare
  v_opt_in boolean;
  v_alias text;
begin
  select leaderboard_opt_in, leaderboard_display_name
    into v_opt_in, v_alias
  from public.profiles
  where user_id = '10000000-0000-4000-8000-000000000001';

  if v_opt_in is distinct from false or v_alias is not null then
    raise exception 'New profiles must be opted out by default';
  end if;

  update public.profiles
  set leaderboard_opt_in = true, leaderboard_display_name = 'AthleteOne'
  where user_id = '10000000-0000-4000-8000-000000000001';

  begin
    update public.profiles
    set leaderboard_opt_in = true, leaderboard_display_name = 'athleteone'
    where user_id = '10000000-0000-4000-8000-000000000002';
    raise exception 'Duplicate case-insensitive aliases were accepted';
  exception when unique_violation then
    null;
  end;

  begin
    update public.profiles
    set leaderboard_opt_in = true, leaderboard_display_name = 'A$'
    where user_id = '10000000-0000-4000-8000-000000000002';
    raise exception 'Invalid alias characters were accepted';
  exception when check_violation then
    null;
  end;

  begin
    update public.profiles
    set leaderboard_opt_in = true, leaderboard_display_name = null
    where user_id = '10000000-0000-4000-8000-000000000002';
    raise exception 'Opt-in without an alias was accepted';
  exception when check_violation then
    null;
  end;

  update public.profiles
  set leaderboard_opt_in = false, leaderboard_display_name = null
  where user_id = '10000000-0000-4000-8000-000000000002';
end
$$;
