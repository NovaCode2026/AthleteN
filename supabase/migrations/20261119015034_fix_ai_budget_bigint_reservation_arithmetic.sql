-- Keep bigint arithmetic type-safe when decrementing held monthly budget.
create or replace function public.settle_athleten_ai_budget(
 p_reservation_id uuid,p_actual_cost_paise integer
) returns boolean language plpgsql security definer set search_path=''
as $$
declare v public.athleten_ai_budget_reservations%rowtype;
begin
 if coalesce(auth.role(),'')<>'service_role' then raise exception 'Service role required'; end if;
 if p_reservation_id is null or p_actual_cost_paise is null or p_actual_cost_paise<0 then
  raise exception 'Valid reservation and non-negative cost required';
 end if;
 select * into v from public.athleten_ai_budget_reservations where id=p_reservation_id for update;
 if not found then return false; end if;
 if v.status='settled' then return v.actual_cost_paise=p_actual_cost_paise; end if;
 if v.status<>'reserved' then return false; end if;
 update public.athleten_ai_budget_monthly
 set reserved_paise=greatest(0::bigint,reserved_paise-v.reserved_paise),
     spent_paise=spent_paise+p_actual_cost_paise,updated_at=pg_catalog.now()
 where usage_month=v.usage_month;
 update public.athleten_ai_budget_reservations
 set status='settled',actual_cost_paise=p_actual_cost_paise,settled_at=pg_catalog.now()
 where id=p_reservation_id;
 return true;
end;
$$;
