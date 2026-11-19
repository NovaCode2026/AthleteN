create table if not exists public.athleten_ai_budget_monthly(
 usage_month date primary key,
 budget_paise integer not null check(budget_paise>0),
 reserved_paise bigint not null default 0 check(reserved_paise>=0),
 spent_paise bigint not null default 0 check(spent_paise>=0),
 updated_at timestamptz not null default now(),
 constraint athleten_ai_budget_month_start check(extract(day from usage_month)=1)
);
create table if not exists public.athleten_ai_budget_reservations(
 id uuid primary key default pg_catalog.gen_random_uuid(),
 usage_month date not null references public.athleten_ai_budget_monthly(usage_month) on delete restrict,
 reserved_paise integer not null check(reserved_paise>0),
 actual_cost_paise integer,
 status text not null default 'reserved' check(status in('reserved','settled','released')),
 created_at timestamptz not null default now(),
 settled_at timestamptz
);
create index if not exists athleten_ai_budget_reservations_month_status_idx
 on public.athleten_ai_budget_reservations(usage_month,status);
alter table public.athleten_ai_budget_monthly enable row level security;
alter table public.athleten_ai_budget_reservations enable row level security;
revoke all on table public.athleten_ai_budget_monthly from public,anon,authenticated,service_role;
revoke all on table public.athleten_ai_budget_reservations from public,anon,authenticated,service_role;
create or replace function public.reserve_athleten_ai_budget(
 p_usage_month date,p_monthly_budget_paise integer,p_reserve_paise integer
) returns uuid language plpgsql security definer set search_path=''
as $$
declare v public.athleten_ai_budget_monthly%rowtype; v_id uuid;
 v_current date:=pg_catalog.date_trunc('month',pg_catalog.now() at time zone 'UTC')::date;
begin
 if coalesce(auth.role(),'')<>'service_role' then raise exception 'Service role required'; end if;
 if p_usage_month is distinct from v_current then raise exception 'Only current UTC month can be reserved'; end if;
 if p_monthly_budget_paise is null or p_monthly_budget_paise<=0 or p_reserve_paise is null or p_reserve_paise<=0 then
  raise exception 'Positive budget and reservation required';
 end if;
 insert into public.athleten_ai_budget_monthly(usage_month,budget_paise)
 values(p_usage_month,p_monthly_budget_paise)
 on conflict(usage_month) do update set budget_paise=excluded.budget_paise,updated_at=pg_catalog.now();
 select * into v from public.athleten_ai_budget_monthly where usage_month=p_usage_month for update;
 if v.spent_paise+v.reserved_paise+p_reserve_paise>v.budget_paise then return null; end if;
 insert into public.athleten_ai_budget_reservations(usage_month,reserved_paise)
 values(p_usage_month,p_reserve_paise) returning id into v_id;
 update public.athleten_ai_budget_monthly
 set reserved_paise=reserved_paise+p_reserve_paise,updated_at=pg_catalog.now()
 where usage_month=p_usage_month;
 return v_id;
end;
$$;
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
 set reserved_paise=pg_catalog.greatest(0,reserved_paise-v.reserved_paise),
     spent_paise=spent_paise+p_actual_cost_paise,updated_at=pg_catalog.now()
 where usage_month=v.usage_month;
 update public.athleten_ai_budget_reservations
 set status='settled',actual_cost_paise=p_actual_cost_paise,settled_at=pg_catalog.now()
 where id=p_reservation_id;
 return true;
end;
$$;
create or replace function public.release_athleten_ai_budget(p_reservation_id uuid)
returns boolean language plpgsql security definer set search_path=''
as $$
declare v public.athleten_ai_budget_reservations%rowtype;
begin
 if coalesce(auth.role(),'')<>'service_role' then raise exception 'Service role required'; end if;
 if p_reservation_id is null then return false; end if;
 select * into v from public.athleten_ai_budget_reservations where id=p_reservation_id for update;
 if not found then return false; end if;
 if v.status='released' then return true; end if;
 if v.status<>'reserved' then return false; end if;
 update public.athleten_ai_budget_monthly
 set reserved_paise=pg_catalog.greatest(0,reserved_paise-v.reserved_paise),updated_at=pg_catalog.now()
 where usage_month=v.usage_month;
 update public.athleten_ai_budget_reservations
 set status='released',settled_at=pg_catalog.now()
 where id=p_reservation_id;
 return true;
end;
$$;
revoke all on function public.reserve_athleten_ai_budget(date,integer,integer) from public,anon,authenticated;
revoke all on function public.settle_athleten_ai_budget(uuid,integer) from public,anon,authenticated;
revoke all on function public.release_athleten_ai_budget(uuid) from public,anon,authenticated;
grant execute on function public.reserve_athleten_ai_budget(date,integer,integer) to service_role;
grant execute on function public.settle_athleten_ai_budget(uuid,integer) to service_role;
grant execute on function public.release_athleten_ai_budget(uuid) to service_role;
