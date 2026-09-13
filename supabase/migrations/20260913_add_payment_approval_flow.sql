create table if not exists public.payment_orders (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  plan_id text not null check (plan_id in ('student','pro','champion')),
  provider text not null check (provider in ('razorpay','stripe','cashfree')),
  amount_minor integer not null check (amount_minor >= 0),
  currency text not null default 'INR',
  status text not null default 'awaiting_payment' check (status in ('awaiting_payment','pending','paid','failed','cancelled','refunded')),
  verification_id uuid references public.student_verifications(id) on delete set null,
  provider_order_id text,
  provider_payment_id text,
  provider_customer_id text,
  provider_subscription_id text,
  checkout_url text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  paid_at timestamptz
);

create unique index if not exists payment_orders_provider_order_uidx on public.payment_orders(provider, provider_order_id) where provider_order_id is not null;
create index if not exists payment_orders_user_idx on public.payment_orders(user_id, created_at desc);
create index if not exists payment_orders_status_idx on public.payment_orders(status, created_at desc);

alter table public.payment_orders enable row level security;
create policy "payment_orders_select_own" on public.payment_orders for select using (auth.uid() = user_id);
create policy "payment_orders_insert_own" on public.payment_orders for insert with check (auth.uid() = user_id);

create or replace function public.activate_paid_subscription(
  p_user_id uuid,
  p_plan_id text,
  p_provider text,
  p_provider_customer_id text default null,
  p_provider_subscription_id text default null,
  p_current_period_end timestamptz default null
)
returns public.subscriptions
language plpgsql
security definer
set search_path = public
as $$
declare result public.subscriptions;
begin
  if not exists (select 1 from public.student_verifications where user_id = p_user_id and status = 'approved') then
    raise exception 'STUDENT_NOT_VERIFIED';
  end if;
  insert into public.subscriptions (user_id, plan_id, provider, provider_customer_id, provider_subscription_id, status, current_period_end)
  values (p_user_id, p_plan_id, p_provider, p_provider_customer_id, p_provider_subscription_id, 'active', p_current_period_end)
  on conflict (user_id) do update set plan_id=excluded.plan_id, provider=excluded.provider, provider_customer_id=excluded.provider_customer_id, provider_subscription_id=excluded.provider_subscription_id, status='active', current_period_end=excluded.current_period_end, updated_at=now()
  returning * into result;
  update public.profiles set plan_id=p_plan_id, updated_at=now() where user_id=p_user_id;
  return result;
end;
$$;
revoke all on function public.activate_paid_subscription(uuid,text,text,text,text,timestamptz) from public;
