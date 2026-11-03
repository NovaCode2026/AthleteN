create or replace function public.save_my_dashboard_widgets(p_widget_keys text[])
returns void
language plpgsql
security invoker
set search_path = ''
as $function$
declare
  widget_count integer := coalesce(array_length(p_widget_keys, 1), 0);
  distinct_count integer;
begin
  if auth.uid() is null then
    raise exception 'Authentication required';
  end if;

  if widget_count < 1 or widget_count > 8 then
    raise exception 'Choose between 1 and 8 dashboard panels';
  end if;

  if exists (
    select 1
    from unnest(p_widget_keys) as requested(widget_key)
    where requested.widget_key not in (
      'readiness', 'today', 'timeline', 'actions',
      'training', 'medals', 'usage', 'weight'
    )
  ) then
    raise exception 'Unknown dashboard panel';
  end if;

  select count(distinct requested.widget_key)
    into distinct_count
    from unnest(p_widget_keys) as requested(widget_key);

  if distinct_count <> widget_count then
    raise exception 'Dashboard panels cannot be duplicated';
  end if;

  delete from public.dashboard_widgets
   where user_id = auth.uid();

  insert into public.dashboard_widgets(user_id, widget_key, position, updated_at)
  select auth.uid(), requested.widget_key, requested.position::integer - 1, now()
  from unnest(p_widget_keys) with ordinality
       as requested(widget_key, position);
end;
$function$;

revoke all on function public.save_my_dashboard_widgets(text[]) from public, anon;
grant execute on function public.save_my_dashboard_widgets(text[]) to authenticated;
