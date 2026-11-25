-- AthleteN Platform Admin Control Centre.
-- Additive candidate migration: do not apply to production until migration
-- history is reconciled and the complete chain is replayed in isolated staging.

begin;

create table if not exists public.platform_admin_assignments (
  admin_user_id uuid primary key references auth.users(id) on delete cascade,
  permission_role text not null check (permission_role in ('support','verification','finance','operations')),
  assigned_by uuid references auth.users(id) on delete set null,
  assigned_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.platform_account_access_controls (
  user_id uuid primary key references auth.users(id) on delete cascade,
  status text not null check (status in ('active','restricted','suspended')),
  reason text not null check (char_length(btrim(reason)) between 5 and 500),
  expires_at timestamptz,
  changed_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint platform_account_access_expiry_check check (
    status <> 'restricted' or expires_at is not null
  )
);

create table if not exists public.platform_admin_audit_log (
  id uuid primary key default gen_random_uuid(),
  actor_user_id uuid references auth.users(id) on delete set null,
  target_user_id uuid references auth.users(id) on delete set null,
  action text not null,
  reason text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists platform_admin_audit_log_recent_idx
  on public.platform_admin_audit_log(created_at desc);
create index if not exists platform_account_access_status_idx
  on public.platform_account_access_controls(status, updated_at desc);

alter table public.platform_admin_assignments enable row level security;
alter table public.platform_account_access_controls enable row level security;
alter table public.platform_admin_audit_log enable row level security;

revoke all on public.platform_admin_assignments,
  public.platform_account_access_controls,
  public.platform_admin_audit_log from public, anon, authenticated;

-- Existing Support Admin accounts receive the least-privilege Support scope.
insert into public.platform_admin_assignments(admin_user_id, permission_role, assigned_by)
select p.user_id, 'support', null
from public.profiles p
where p.role = 'support_admin'
on conflict (admin_user_id) do nothing;

create or replace function private.platform_admin_permissions_for(p_user_id uuid)
returns text[]
language plpgsql
stable
security definer
set search_path = ''
as $function$
declare
  v_role text;
  v_scope text;
begin
  if p_user_id is null then return '{}'::text[]; end if;

  select p.role into v_role
  from public.profiles p
  where p.user_id = p_user_id;

  if v_role = 'super_admin' then return array['*']::text[]; end if;
  if v_role not in ('admin','support_admin') then return '{}'::text[]; end if;

  select a.permission_role into v_scope
  from public.platform_admin_assignments a
  where a.admin_user_id = p_user_id;

  -- Existing full Admin accounts retain their current capabilities until a
  -- Super Admin explicitly assigns a narrower permission set.
  if v_scope is null and v_role = 'admin' then return array['*']::text[]; end if;
  if v_scope is null and v_role = 'support_admin' then v_scope := 'support'; end if;

  case v_scope
    when 'support' then
      return array['support.read','support.manage','message_reports.read','message_reports.manage','audit.read']::text[];
    when 'verification' then
      return array['verification.read','verification.review','audit.read']::text[];
    when 'finance' then
      return array['billing.read','payments.read','reports.read','audit.read']::text[];
    when 'operations' then
      return array['platform.read','analytics.read','flags.manage','announcements.manage',
        'account.manage','security.read','audit.read']::text[];
    else
      return '{}'::text[];
  end case;
end;
$function$;

create or replace function private.platform_admin_has_permission(p_permission text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $function$
  select coalesce(
    '*' = any(private.platform_admin_permissions_for((select auth.uid())))
    or p_permission = any(private.platform_admin_permissions_for((select auth.uid()))),
    false
  );
$function$;

create or replace function private.platform_account_is_active()
returns boolean
language sql
stable
security definer
set search_path = ''
as $function$
  select (select auth.uid()) is not null
    and not exists (
      select 1
      from public.platform_account_access_controls c
      where c.user_id = (select auth.uid())
        and c.status in ('restricted','suspended')
        and (c.expires_at is null or c.expires_at > pg_catalog.now())
    );
$function$;

revoke all on function private.platform_admin_permissions_for(uuid) from public, anon, authenticated;
revoke all on function private.platform_admin_has_permission(text) from public, anon;
revoke all on function private.platform_account_is_active() from public, anon;
grant execute on function private.platform_admin_has_permission(text) to authenticated;
grant execute on function private.platform_account_is_active() to authenticated;

create or replace function public.get_my_platform_admin_permissions()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $function$
declare
  v_role text;
  v_scope text;
  v_permissions text[];
begin
  select p.role into v_role from public.profiles p where p.user_id = (select auth.uid());
  select a.permission_role into v_scope
  from public.platform_admin_assignments a where a.admin_user_id = (select auth.uid());
  v_permissions := private.platform_admin_permissions_for((select auth.uid()));
  return jsonb_build_object(
    'base_role', coalesce(v_role,''),
    'permission_role', coalesce(v_scope, case when v_role='admin' then 'full' when v_role='support_admin' then 'support' else 'none' end),
    'permissions', to_jsonb(v_permissions)
  );
end;
$function$;

create or replace function public.get_platform_admin_overview()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $function$
begin
  if not (private.platform_admin_has_permission('platform.read')
       or private.platform_admin_has_permission('analytics.read')
       or private.platform_admin_has_permission('billing.read')
       or private.platform_admin_has_permission('verification.read')
       or private.platform_admin_has_permission('support.read')) then
    raise exception 'Platform overview permission required';
  end if;

  return jsonb_build_object(
    'users', (select count(*) from public.profiles),
    'athletes', (select count(*) from public.profiles where role='athlete'),
    'coaches', (select count(*) from public.profiles where role='coach'),
    'academies', (select count(*) from public.academies),
    'admins', (select count(*) from public.profiles where role in ('support_admin','admin','super_admin')),
    'pending_student_verifications', (select count(*) from public.student_verifications where status='pending'),
    'active_subscriptions', (select count(*) from public.subscriptions where status='active'),
    'open_support_tickets', (select count(*) from public.support_tickets where status in ('new','open','in_progress')),
    'restricted_accounts', (select count(*) from public.platform_account_access_controls where status in ('restricted','suspended') and (expires_at is null or expires_at > pg_catalog.now()))
  );
end;
$function$;

create or replace function public.get_platform_admin_assignments()
returns table (
  admin_user_id uuid,
  full_name text,
  username text,
  base_role text,
  permission_role text,
  assigned_by uuid,
  updated_at timestamptz
)
language plpgsql
stable
security definer
set search_path = ''
as $function$
begin
  if not private.platform_admin_has_permission('platform.roles.manage') then
    raise exception 'Super Admin role-management permission required';
  end if;
  return query
  select p.user_id, p.full_name, p.username, p.role,
         a.permission_role, a.assigned_by, coalesce(a.updated_at,p.updated_at)
  from public.profiles p
  left join public.platform_admin_assignments a on a.admin_user_id=p.user_id
  where p.role in ('admin','support_admin','super_admin')
  order by case when p.role='super_admin' then 0 else 1 end, p.full_name;
end;
$function$;

create or replace function public.admin_assign_platform_role(
  p_admin_user_id uuid,
  p_permission_role text
)
returns void
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_base_role text;
begin
  if (select auth.uid()) is null
     or not private.platform_admin_has_permission('platform.roles.manage')
     or not exists(select 1 from public.profiles where user_id=(select auth.uid()) and role='super_admin') then
    raise exception 'Super Admin access required';
  end if;
  if p_admin_user_id is null or p_admin_user_id=(select auth.uid()) then
    raise exception 'Choose another administrator account';
  end if;
  select p.role into v_base_role from public.profiles p where p.user_id=p_admin_user_id for update;
  if v_base_role not in ('admin','support_admin') then
    raise exception 'Permission scopes can only be assigned to existing Admin or Support Admin accounts';
  end if;

  if p_permission_role is null or p_permission_role='full' then
    delete from public.platform_admin_assignments where admin_user_id=p_admin_user_id;
  elsif p_permission_role in ('support','verification','finance','operations') then
    insert into public.platform_admin_assignments(admin_user_id,permission_role,assigned_by)
    values(p_admin_user_id,p_permission_role,(select auth.uid()))
    on conflict(admin_user_id) do update
      set permission_role=excluded.permission_role,
          assigned_by=excluded.assigned_by,
          updated_at=pg_catalog.now();
  else
    raise exception 'Invalid platform permission scope';
  end if;

  insert into public.platform_admin_audit_log(actor_user_id,target_user_id,action,reason,metadata)
  values((select auth.uid()),p_admin_user_id,'admin.permission_scope_changed',
    'Super Admin changed the administrator permission scope',
    jsonb_build_object('permission_role',coalesce(p_permission_role,'full')));
end;
$function$;

create or replace function public.get_platform_admin_audit(p_limit integer default 30)
returns table (
  id uuid,
  actor_user_id uuid,
  target_user_id uuid,
  action text,
  reason text,
  metadata jsonb,
  created_at timestamptz
)
language plpgsql
stable
security definer
set search_path = ''
as $function$
begin
  if not private.platform_admin_has_permission('audit.read') then
    raise exception 'Audit read permission required';
  end if;
  return query
  select l.id,l.actor_user_id,l.target_user_id,l.action,l.reason,l.metadata,l.created_at
  from public.platform_admin_audit_log l
  order by l.created_at desc
  limit greatest(1,least(coalesce(p_limit,30),100));
end;
$function$;

create or replace function public.admin_review_student_verification(
  p_request_id uuid,
  p_status text,
  p_reason text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_request public.student_verifications;
begin
  if (select auth.uid()) is null
     or not private.platform_admin_has_permission('verification.review') then
    raise exception 'Student verification review permission required';
  end if;
  if p_status not in ('approved','rejected')
     or p_reason is null
     or char_length(btrim(p_reason)) not between 5 and 500 then
    raise exception 'Choose approve or reject and provide a reason of 5 to 500 characters';
  end if;

  select sv.* into v_request
  from public.student_verifications sv
  join public.profiles p on p.user_id=sv.user_id and p.role='athlete'
  where sv.id=p_request_id and sv.status='pending'
  for update of sv;

  if not found then raise exception 'Pending Athlete verification request not found'; end if;

  update public.student_verifications
    set status=p_status,
        reviewer_notes=btrim(p_reason),
        reviewed_by=(select auth.uid()),
        reviewed_at=pg_catalog.now(),
        updated_at=pg_catalog.now()
  where id=p_request_id;

  insert into public.platform_admin_audit_log(actor_user_id,target_user_id,action,reason,metadata)
  values((select auth.uid()),v_request.user_id,'verification.student.'||p_status,btrim(p_reason),
    jsonb_build_object('request_id',p_request_id,'document_type',v_request.document_type));

  insert into public.notifications(user_id,title,body,notification_type,created_at,updated_at)
  values(v_request.user_id,
    case when p_status='approved' then 'Student verification approved' else 'Student verification needs attention' end,
    case when p_status='approved' then 'Your Student proof was approved. You can continue to the Student plan checkout when available.'
         else 'Your Student proof was not approved. Review the feedback and submit updated proof.' end,
    'verification',pg_catalog.now(),pg_catalog.now());

  return jsonb_build_object('request_id',p_request_id,'status',p_status,'reviewed_at',pg_catalog.now());
end;
$function$;

create or replace function public.admin_set_platform_account_access(
  p_user_id uuid,
  p_status text,
  p_reason text,
  p_expires_at timestamptz default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_target_role text;
begin
  if (select auth.uid()) is null
     or not private.platform_admin_has_permission('account.manage') then
    raise exception 'Account-access management permission required';
  end if;
  if p_user_id is null or p_user_id=(select auth.uid()) then
    raise exception 'Administrators cannot change their own access status';
  end if;
  if p_status not in ('active','restricted','suspended')
     or p_reason is null
     or char_length(btrim(p_reason)) not between 5 and 500 then
    raise exception 'Invalid access status or reason';
  end if;
  if p_status='restricted' and (p_expires_at is null or p_expires_at<=pg_catalog.now()) then
    raise exception 'A temporary restriction must have a future expiry';
  end if;

  select p.role into v_target_role from public.profiles p where p.user_id=p_user_id for update;
  if v_target_role is null then raise exception 'Target account not found'; end if;
  if v_target_role='super_admin' then raise exception 'A Super Admin account cannot be restricted here'; end if;

  insert into public.platform_account_access_controls(user_id,status,reason,expires_at,changed_by)
  values(p_user_id,p_status,btrim(p_reason),case when p_status='active' then null else p_expires_at end,(select auth.uid()))
  on conflict(user_id) do update
    set status=excluded.status,
        reason=excluded.reason,
        expires_at=excluded.expires_at,
        changed_by=excluded.changed_by,
        updated_at=pg_catalog.now();

  insert into public.platform_admin_audit_log(actor_user_id,target_user_id,action,reason,metadata)
  values((select auth.uid()),p_user_id,'account.access.'||p_status,btrim(p_reason),
    jsonb_build_object('expires_at',case when p_status='active' then null else p_expires_at end));

  return jsonb_build_object('user_id',p_user_id,'status',p_status,'expires_at',case when p_status='active' then null else p_expires_at end);
end;
$function$;

create or replace function public.get_platform_account_access_controls()
returns table (
  user_id uuid,
  full_name text,
  username text,
  status text,
  reason text,
  expires_at timestamptz,
  changed_by uuid,
  updated_at timestamptz
)
language plpgsql
stable
security definer
set search_path = ''
as $function$
begin
  if not private.platform_admin_has_permission('account.manage') then
    raise exception 'Account-access management permission required';
  end if;
  return query
  select c.user_id,p.full_name,p.username,c.status,c.reason,c.expires_at,c.changed_by,c.updated_at
  from public.platform_account_access_controls c
  join public.profiles p on p.user_id=c.user_id
  order by c.updated_at desc
  limit 100;
end;
$function$;

create or replace function public.get_my_platform_account_access()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $function$
  select jsonb_build_object(
    'status',coalesce((select c.status from public.platform_account_access_controls c
       where c.user_id=(select auth.uid())
         and (c.expires_at is null or c.expires_at>pg_catalog.now())
       limit 1),'active'),
    'expires_at',(select c.expires_at from public.platform_account_access_controls c
       where c.user_id=(select auth.uid())
         and (c.expires_at is null or c.expires_at>pg_catalog.now())
       limit 1)
  );
$function$;

-- Restrictive RLS layer: a restricted/suspended account retains its profile and
-- support channels but cannot use the core athlete, team, messaging or billing data.
do $policies$
declare
  t text;
  v_tables text[] := array[
    'training_sessions','training_plans','attendance_records','tournaments','matches',
    'medals','certificates','documents','weight_logs','calendar_events',
    'competition_checklists','injuries','goals','student_verifications',
    'tournament_scans','subscriptions','subscription_usage','account_entitlements',
    'payment_orders','payment_events','conversations','conversation_members',
    'messages','message_reports','user_blocks','athlete_badges','ai_usage_events',
    'academies','academy_memberships','coach_athlete_links','coach_approval_requests',
    'academy_fee_invoices','academy_fee_payments','academy_athlete_transfer_requests',
    'academy_guardian_links','academy_seat_requests','academy_staff_assignments',
    'academy_announcements','academy_report_exports'
  ];
begin
  foreach t in array v_tables loop
    if pg_catalog.to_regclass('public.'||t) is not null then
      execute pg_catalog.format('alter table public.%I enable row level security',t);
      execute pg_catalog.format('drop policy if exists platform_account_access_gate on public.%I',t);
      execute pg_catalog.format(
        'create policy platform_account_access_gate on public.%I as restrictive for all to authenticated using ((select private.platform_account_is_active()) or (select private.is_platform_admin())) with check ((select private.platform_account_is_active()) or (select private.is_platform_admin()))',
        t
      );
    end if;
  end loop;
end;
$policies$;

-- Private proof files remain owner-only unless the caller has the dedicated
-- Student verification review permission.
drop policy if exists platform_verification_review_read on storage.objects;
create policy platform_verification_review_read
  on storage.objects for select to authenticated
  using (
    bucket_id='verification-proofs'
    and (select private.platform_admin_has_permission('verification.review'))
  );

-- Only the RPCs below can mutate role assignments, moderation state and reviews.
revoke all on function public.get_my_platform_admin_permissions() from public, anon;
revoke all on function public.get_platform_admin_overview() from public, anon;
revoke all on function public.get_platform_admin_assignments() from public, anon;
revoke all on function public.admin_assign_platform_role(uuid,text) from public, anon;
revoke all on function public.get_platform_admin_audit(integer) from public, anon;
revoke all on function public.admin_review_student_verification(uuid,text,text) from public, anon;
revoke all on function public.admin_set_platform_account_access(uuid,text,text,timestamptz) from public, anon;
revoke all on function public.get_platform_account_access_controls() from public, anon;
revoke all on function public.get_my_platform_account_access() from public, anon;

grant execute on function public.get_my_platform_admin_permissions() to authenticated;
grant execute on function public.get_platform_admin_overview() to authenticated;
grant execute on function public.get_platform_admin_assignments() to authenticated;
grant execute on function public.admin_assign_platform_role(uuid,text) to authenticated;
grant execute on function public.get_platform_admin_audit(integer) to authenticated;
grant execute on function public.admin_review_student_verification(uuid,text,text) to authenticated;
grant execute on function public.admin_set_platform_account_access(uuid,text,text,timestamptz) to authenticated;
grant execute on function public.get_platform_account_access_controls() to authenticated;
grant execute on function public.get_my_platform_account_access() to authenticated;

commit;
