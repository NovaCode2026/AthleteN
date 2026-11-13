-- Align new-sale AI quotas and retain legacy Student access.
create or replace function public.athleten_plan_ai_limit(p_plan_id text)
returns integer language sql immutable set search_path=pg_catalog as $$
 select case p_plan_id when 'student' then 50 when 'pro' then 50 when 'elite' then 200
 when 'coach' then 750 when 'academy' then 1000 else 0 end;
$$;
