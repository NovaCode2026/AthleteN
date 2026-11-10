-- Keep More mandatory across web and mobile navigation preferences.
create or replace function public.set_my_navigation_preferences(p_item_ids text[])
returns text[] language plpgsql security invoker set search_path=public as $$
declare v_ids text[];
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  if p_item_ids is null then raise exception 'Navigation cannot be empty'; end if;
  select coalesce(array_agg(x order by ord), array[]::text[]) into v_ids
  from (
    select distinct on (x) x, ord
    from unnest(p_item_ids) with ordinality as u(x,ord)
    where x is not null and length(trim(x))>0 and x <> 'explore'
    order by x,ord
  ) d;
  v_ids := v_ids[1:least(cardinality(v_ids),5)];
  v_ids := array_append(v_ids,'explore');
  insert into public.user_navigation_preferences(user_id,item_ids) values(auth.uid(),v_ids)
  on conflict(user_id) do update set item_ids=excluded.item_ids,updated_at=now();
  return v_ids;
end;
$$;
revoke all on function public.set_my_navigation_preferences(text[]) from public,anon;
grant execute on function public.set_my_navigation_preferences(text[]) to authenticated;
