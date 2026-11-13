-- REVIEW DRAFT ONLY — NOT A DEPLOYABLE MIGRATION.
-- Generate a real timestamped migration only after migration-history reconciliation:
--   supabase migration new finance_role_and_age_authorization_hardening
-- Copy, review and test this SQL on the local non-billable Supabase stack first.
-- Never apply directly to production from this draft.

-- This RPC has no current Web/Mobile caller and lets any authenticated user
-- enroll themselves into a Coach or Academy Admin product role. Role assignment
-- must remain in the verified/admin-controlled role workflow until there is a
-- separately approved product-role enrollment design.
revoke all on function public.switch_my_product_role(text) from public, anon, authenticated;

-- A finance account row is not proof of an authorized Coach/Academy account.
-- Gate transaction reads/writes on the signed-in user's age approval and their
-- current verified product role/academy membership, not only owner_user_id.
create or replace function public.can_manage_finance_account(account uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $function$
  select
    auth.uid() is not null
    and public.is_age_approved(auth.uid())
    and exists (
      select 1
      from public.finance_accounts f
      where f.id = account
        and (
          (
            f.owner_type = 'coach'
            and f.owner_user_id = auth.uid()
            and exists (
              select 1
              from public.profiles p
              where p.user_id = auth.uid()
                and p.role = 'coach'
            )
          )
          or (
            f.owner_type = 'academy'
            and exists (
              select 1
              from public.profiles p
              where p.user_id = auth.uid()
                and p.role = 'academy_admin'
            )
            and (
              exists (
                select 1
                from public.academy_memberships am
                where am.academy_id = f.academy_id
                  and am.user_id = auth.uid()
                  and am.role = 'academy_admin'
                  and am.status = 'active'
              )
              or exists (
                select 1
                from public.academies a
                where a.id = f.academy_id
                  and a.owner_user_id = auth.uid()
              )
            )
          )
          or public.is_platform_admin()
        )
    );
$function$;

-- The helper is called by authenticated RLS policies. Keep its required
-- authenticated EXECUTE permission, but do not expose it to anon/PUBLIC.
revoke all on function public.can_manage_finance_account(uuid) from public, anon;
grant execute on function public.can_manage_finance_account(uuid) to authenticated;

drop policy if exists "finance accounts owner" on public.finance_accounts;
create policy "finance accounts owner"
on public.finance_accounts
for all
to authenticated
using (
  public.is_age_approved(auth.uid())
  and (
    (
      owner_type = 'coach'
      and owner_user_id = auth.uid()
      and exists (
        select 1 from public.profiles p
        where p.user_id = auth.uid() and p.role = 'coach'
      )
    )
    or (
      owner_type = 'academy'
      and exists (
        select 1 from public.profiles p
        where p.user_id = auth.uid() and p.role = 'academy_admin'
      )
      and (
        exists (
          select 1 from public.academy_memberships am
          where am.academy_id = finance_accounts.academy_id
            and am.user_id = auth.uid()
            and am.role = 'academy_admin'
            and am.status = 'active'
        )
        or exists (
          select 1 from public.academies a
          where a.id = finance_accounts.academy_id
            and a.owner_user_id = auth.uid()
        )
      )
    )
    or public.is_platform_admin()
  )
)
with check (
  public.is_age_approved(auth.uid())
  and (
    (
      owner_type = 'coach'
      and owner_user_id = auth.uid()
      and exists (
        select 1 from public.profiles p
        where p.user_id = auth.uid() and p.role = 'coach'
      )
    )
    or (
      owner_type = 'academy'
      and exists (
        select 1 from public.profiles p
        where p.user_id = auth.uid() and p.role = 'academy_admin'
      )
      and (
        exists (
          select 1 from public.academy_memberships am
          where am.academy_id = finance_accounts.academy_id
            and am.user_id = auth.uid()
            and am.role = 'academy_admin'
            and am.status = 'active'
        )
        or exists (
          select 1 from public.academies a
          where a.id = finance_accounts.academy_id
            and a.owner_user_id = auth.uid()
        )
      )
    )
    or public.is_platform_admin()
  )
);

-- The existing finance-transactions policy delegates both USING and WITH CHECK
-- to can_manage_finance_account, so it now inherits the role/age gate.
drop policy if exists "finance transactions owner" on public.finance_transactions;
create policy "finance transactions owner"
on public.finance_transactions
for all
to authenticated
using (public.can_manage_finance_account(account_id))
with check (public.can_manage_finance_account(account_id));

-- The RPC itself is retained for legitimate coach accounts but now enforces
-- the same age and role requirements even when called outside the UI.
create or replace function public.get_or_create_my_coach_finance_account()
returns uuid
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_uid uuid := auth.uid();
  v_role text;
  v_id uuid;
begin
  if v_uid is null then
    raise exception 'Authentication required';
  end if;

  if not public.is_age_approved(v_uid) then
    raise exception 'Account approval is required before using Coach Finance';
  end if;

  select p.role
    into v_role
    from public.profiles p
   where p.user_id = v_uid;

  if v_role is distinct from 'coach' then
    raise exception 'Only approved Coach accounts can use Coach Finance';
  end if;

  select f.id
    into v_id
    from public.finance_accounts f
   where f.owner_type = 'coach'
     and f.owner_user_id = v_uid
   order by f.created_at asc
   limit 1;

  if v_id is null then
    insert into public.finance_accounts(owner_user_id, owner_type, name, currency)
    values (v_uid, 'coach', 'Coach Finance', 'INR')
    returning id into v_id;
  end if;

  return v_id;
end;
$function$;

revoke all on function public.get_or_create_my_coach_finance_account() from public, anon;
grant execute on function public.get_or_create_my_coach_finance_account() to authenticated;
