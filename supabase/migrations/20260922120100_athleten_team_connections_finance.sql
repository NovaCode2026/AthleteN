-- AthleteN team connections, unique Coach/Academy codes, finance, and support-linked message privacy.
create table if not exists public.connection_codes(id uuid primary key default gen_random_uuid(),code text not null,owner_user_id uuid,owner_type text not null check(owner_type in ('coach','academy')),academy_id uuid,active boolean not null default true,created_at timestamptz not null default now(),updated_at timestamptz not null default now());
create unique index if not exists connection_codes_code_lower_unique on public.connection_codes(lower(code));
create unique index if not exists connection_codes_coach_unique on public.connection_codes(owner_user_id) where owner_type='coach' and active;
create unique index if not exists connection_codes_academy_unique on public.connection_codes(academy_id) where owner_type='academy';
alter table public.connection_codes enable row level security;
create or replace function public.set_connection_code(p_code text) returns jsonb language plpgsql security definer set search_path=public as $$
declare uid uuid:=auth.uid(); r text; a uuid; n text:=upper(trim(p_code)); eid uuid;
begin
 select role,academy_id into r,a from public.profiles where user_id=uid;
 if n !~ '^[A-Z0-9][A-Z0-9._-]{3,29}$' then raise exception 'Invalid code format'; end if;
 if r='coach' then
  if exists(select 1 from public.connection_codes where lower(code)=lower(n) and active and owner_user_id<>uid) then raise exception 'That code is already taken'; end if;
  select id into eid from public.connection_codes where owner_user_id=uid and owner_type='coach' and active limit 1;
  if eid is null then insert into public.connection_codes(code,owner_user_id,owner_type) values(n,uid,'coach'); else update public.connection_codes set code=n,updated_at=now() where id=eid; end if;
  return jsonb_build_object('code',n,'type','coach');
 elsif r='academy_admin' and a is not null then
  if exists(select 1 from public.connection_codes where lower(code)=lower(n) and active and academy_id<>a) then raise exception 'That code is already taken'; end if;
  select id into eid from public.connection_codes where academy_id=a and owner_type='academy' and active limit 1;
  if eid is null then insert into public.connection_codes(code,owner_user_id,owner_type,academy_id) values(n,uid,'academy',a); else update public.connection_codes set code=n,updated_at=now() where id=eid; end if;
  return jsonb_build_object('code',n,'type','academy');
 end if;
 raise exception 'Only Coach or Academy accounts can create a connection code';
end; $$;
create or replace function public.connect_athlete_by_code(p_code text) returns jsonb language plpgsql security definer set search_path=public as $$
declare uid uuid:=auth.uid(); c record;
begin
 if (select role from public.profiles where user_id=uid) <> 'athlete' then raise exception 'Only athletes can connect by code'; end if;
 select * into c from public.connection_codes where active and lower(code)=lower(trim(p_code)) limit 1;
 if not found then raise exception 'Connection code not found'; end if;
 if c.owner_type='coach' then
  insert into public.coach_athlete_links(coach_user_id,athlete_user_id,academy_id,status) values(c.owner_user_id,uid,c.academy_id,'active') on conflict do nothing;
  update public.profiles set coach_user_id=c.owner_user_id,coach=(select full_name from public.profiles where user_id=c.owner_user_id),academy_id=coalesce(c.academy_id,academy_id) where user_id=uid;
 else
  insert into public.academy_memberships(academy_id,user_id,role,status,joined_at) values(c.academy_id,uid,'athlete','active',now()) on conflict do nothing;
  update public.profiles set academy_id=c.academy_id,academy=(select name from public.academies where id=c.academy_id) where user_id=uid;
 end if;
 return jsonb_build_object('type',c.owner_type,'owner_user_id',c.owner_user_id,'academy_id',c.academy_id);
end; $$;
create or replace function public.can_view_athlete(target_user_id uuid) returns boolean language sql stable security definer set search_path=public as $$
 select target_user_id=auth.uid() or public.is_platform_admin()
 or exists(select 1 from public.coach_athlete_links l where l.athlete_user_id=target_user_id and l.coach_user_id=auth.uid() and l.status='active')
 or exists(select 1 from public.academy_memberships am join public.profiles p on p.user_id=target_user_id where am.user_id=auth.uid() and am.academy_id=p.academy_id and am.status='active' and am.role in ('coach','academy_admin'))
 or exists(select 1 from public.academies a join public.profiles p on p.academy_id=a.id where p.user_id=target_user_id and a.owner_user_id=auth.uid());
$$;
revoke execute on function public.set_connection_code(text) from public,anon; grant execute on function public.set_connection_code(text) to authenticated;
revoke execute on function public.connect_athlete_by_code(text) from public,anon; grant execute on function public.connect_athlete_by_code(text) to authenticated;
revoke execute on function public.can_view_athlete(uuid) from public,anon; grant execute on function public.can_view_athlete(uuid) to authenticated;
create table if not exists public.finance_accounts(id uuid primary key default gen_random_uuid(),owner_user_id uuid,academy_id uuid,owner_type text not null check(owner_type in ('coach','academy')),name text not null,currency text not null default 'INR',created_at timestamptz not null default now(),updated_at timestamptz not null default now());
create table if not exists public.finance_transactions(id uuid primary key default gen_random_uuid(),account_id uuid not null references public.finance_accounts(id) on delete cascade,user_id uuid not null,type text not null check(type in ('income','expense')),amount numeric(12,2) not null check(amount>=0),category text not null,description text,transaction_date date not null default current_date,created_at timestamptz not null default now(),updated_at timestamptz not null default now());
alter table public.finance_accounts enable row level security; alter table public.finance_transactions enable row level security;
create or replace function public.can_manage_finance_account(aid uuid) returns boolean language sql stable security definer set search_path=public as $$ select exists(select 1 from public.finance_accounts f where f.id=aid and ((f.owner_type='coach' and f.owner_user_id=auth.uid()) or (f.owner_type='academy' and exists(select 1 from public.academies a where a.id=f.academy_id and a.owner_user_id=auth.uid())) or public.is_platform_admin())); $$;
drop policy if exists "finance accounts owner" on public.finance_accounts; create policy "finance accounts owner" on public.finance_accounts for all to authenticated using((owner_type='coach' and owner_user_id=auth.uid()) or (owner_type='academy' and exists(select 1 from public.academies a where a.id=academy_id and a.owner_user_id=auth.uid())) or public.is_platform_admin()) with check((owner_type='coach' and owner_user_id=auth.uid()) or (owner_type='academy' and exists(select 1 from public.academies a where a.id=academy_id and a.owner_user_id=auth.uid())) or public.is_platform_admin());
drop policy if exists "finance transactions owner" on public.finance_transactions; create policy "finance transactions owner" on public.finance_transactions for all to authenticated using(public.can_manage_finance_account(account_id)) with check(public.can_manage_finance_account(account_id));
grant select,insert,update,delete on public.connection_codes,public.finance_accounts,public.finance_transactions to authenticated;
alter table public.support_tickets add column if not exists conversation_id uuid references public.conversations(id) on delete set null;
drop policy if exists "super admin full access" on public.messages; drop policy if exists "super admin full access" on public.conversations; drop policy if exists "super admin full access" on public.conversation_members;
create policy "support-linked admin message read" on public.messages for select to authenticated using(public.is_platform_admin() and exists(select 1 from public.support_tickets st where st.conversation_id=messages.conversation_id and st.status<>'closed'));
create policy "support-linked admin conversation read" on public.conversations for select to authenticated using(public.is_platform_admin() and exists(select 1 from public.support_tickets st where st.conversation_id=conversations.id and st.status<>'closed'));
create policy "support-linked admin members read" on public.conversation_members for select to authenticated using(public.is_platform_admin() and exists(select 1 from public.support_tickets st where st.conversation_id=conversation_members.conversation_id and st.status<>'closed'));
