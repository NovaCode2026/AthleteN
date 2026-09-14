-- Payment activation is a server/webhook operation; never expose it through the public API roles.
revoke all on function public.activate_paid_subscription(uuid,text,text,text,text,timestamptz) from public, anon, authenticated;
grant execute on function public.activate_paid_subscription(uuid,text,text,text,text,timestamptz) to service_role;

-- Checkout preflight is safe for the signed-in client because the function verifies auth.uid() = p_user_id.
revoke all on function public.can_start_paid_checkout(uuid,text) from public, anon;
grant execute on function public.can_start_paid_checkout(uuid,text) to authenticated;

-- Cover the remaining payment-order foreign key.
create index if not exists payment_orders_verification_id_idx on public.payment_orders(verification_id);

-- Avoid per-row auth.uid() re-evaluation in payment-order RLS.
drop policy if exists "payment_orders_select_own" on public.payment_orders;
create policy "payment_orders_select_own" on public.payment_orders
  for select to authenticated
  using ((select auth.uid()) = user_id);

drop policy if exists "payment_orders_insert_own" on public.payment_orders;
create policy "payment_orders_insert_own" on public.payment_orders
  for insert to authenticated
  with check ((select auth.uid()) = user_id);
