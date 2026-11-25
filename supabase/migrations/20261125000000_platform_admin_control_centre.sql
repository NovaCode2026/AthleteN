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
  if exists (
    select 1 from public.platform_account_access_controls c
    where c.user_id=p_user_id
      and c.status in ('restricted','suspended')
      and (c.expires_at is null or c.expires_at>pg_catalog.now())
  ) then return '{}'::text[]; end if;

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
      return array['verification.read','verification.review','verification.athlete.manage','audit.read']::text[];
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
  if (select auth.uid()) is null then raise exception 'Authentication required'; end if;
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
  if (select auth.uid()) is null then raise exception 'Authentication required'; end if;
  if not (private.platform_admin_has_permission('platform.read')
       or private.platform_admin_has_permission('analytics.read')
       or private.platform_admin_has_permission('billing.read')
       or private.platform_admin_has_permission('verification.read')
       or private.platform_admin_has_permission('support.read')) then
    raise exception 'Platform overview permission required';
  end if;

  return jsonb_build_object(
    'users', case when private.platform_admin_has_permission('platform.read') or private.platform_admin_has_permission('analytics.read') then (select count(*) from public.profiles) else null end,
    'athletes', case when private.platform_admin_has_permission('platform.read') or private.platform_admin_has_permission('analytics.read') then (select count(*) from public.profiles where role='athlete') else null end,
    'coaches', case when private.platform_admin_has_permission('platform.read') or private.platform_admin_has_permission('analytics.read') then (select count(*) from public.profiles where role='coach') else null end,
    'academies', case when private.platform_admin_has_permission('platform.read') or private.platform_admin_has_permission('analytics.read') then (select count(*) from public.academies) else null end,
    'admins', case when private.platform_admin_has_permission('platform.roles.manage') then (select count(*) from public.profiles where role in ('support_admin','admin','super_admin')) else null end,
    'pending_student_verifications', case when private.platform_admin_has_permission('verification.read') then (select count(*) from public.student_verifications where status='pending') else null end,
    'active_subscriptions', case when private.platform_admin_has_permission('billing.read') then (select count(*) from public.subscriptions where status='active') else null end,
    'open_support_tickets', case when private.platform_admin_has_permission('support.read') then (select count(*) from public.support_tickets where status in ('new','open','in_progress')) else null end,
    'restricted_accounts', case when private.platform_admin_has_permission('account.manage') or private.platform_admin_has_permission('security.read') then (select count(*) from public.platform_account_access_controls where status in ('restricted','suspended') and (expires_at is null or expires_at > pg_catalog.now())) else null end,
    'verified_athletes', case when private.platform_admin_has_permission('platform.read') or private.platform_admin_has_permission('analytics.read') then (select count(*) from public.profiles where role='athlete' and verified_athlete=true) else null end,
    'verified_coaches', case when private.platform_admin_has_permission('platform.read') or private.platform_admin_has_permission('analytics.read') then (select count(*) from auth.users u join public.profiles p on p.user_id=u.id where p.role='coach' and u.email_confirmed_at is not null) else null end,
    'verified_academies', case when private.platform_admin_has_permission('platform.read') or private.platform_admin_has_permission('analytics.read') then (select count(*) from public.academies a where a.status='active' and a.setup_completed=true and a.contact_email_verified_at is not null) else null end
  );
end;
$function$;

create or replace function public.get_student_verification_queue()
returns table (
  id uuid,
  user_id uuid,
  full_name text,
  username text,
  document_type text,
  file_path text,
  status text,
  created_at timestamptz
)
language plpgsql
stable
security definer
set search_path = ''
as $function$
begin
  if (select auth.uid()) is null then raise exception 'Authentication required'; end if;
  if not private.platform_admin_has_permission('verification.read') then
    raise exception 'Verification review permission required';
  end if;
  return query
  select sv.id,sv.user_id,p.full_name,p.username,sv.document_type,sv.file_path,sv.status,sv.created_at
  from public.student_verifications sv
  join public.profiles p on p.user_id=sv.user_id and p.role='athlete'
  where sv.status='pending'
  order by sv.created_at asc
  limit 100;
end;
$function$;

create or replace function public.search_platform_accounts(p_query text,p_limit integer default 20)
returns table (
  user_id uuid,
  full_name text,
  username text,
  role text,
  plan_id text,
  created_at timestamptz
)
language plpgsql
stable
security definer
set search_path = ''
as $function$
declare v_query text;
begin
  if (select auth.uid()) is null then raise exception 'Authentication required'; end if;
  if not private.platform_admin_has_permission('account.manage') then
    raise exception 'Account management permission required';
  end if;
  v_query:=left(replace(replace(btrim(coalesce(p_query,'')),'%',''),'_',''),80);
  if char_length(v_query)<2 then raise exception 'Enter at least two search characters'; end if;
  return query
  select p.user_id,p.full_name,p.username,p.role,p.plan_id,p.created_at
  from public.profiles p
  where p.full_name ilike '%'||v_query||'%'
     or coalesce(p.username,'') ilike '%'||v_query||'%'
     or p.user_id::text like v_query||'%'
  order by p.created_at desc
  limit greatest(1,least(coalesce(p_limit,20),30));
end;
$function$;

create or replace function public.search_athlete_verification_reviews(
  p_query text,
  p_limit integer default 20
)
returns table (
  user_id uuid,
  full_name text,
  username text,
  verified_athlete boolean,
  created_at timestamptz
)
language plpgsql
stable
security definer
set search_path = ''
as $function$
declare
  v_query text;
begin
  if (select auth.uid()) is null then raise exception 'Authentication required'; end if;
  if not private.platform_admin_has_permission('verification.read') then
    raise exception 'Athlete verification read permission required';
  end if;
  v_query:=left(replace(replace(btrim(coalesce(p_query,'')),'%',''),'_',''),80);
  if char_length(v_query)<2 then raise exception 'Enter at least two characters to search Athlete accounts'; end if;

  return query
  select p.user_id,p.full_name,p.username,p.verified_athlete,p.created_at
  from public.profiles p
  where p.role='athlete'
    and (p.full_name ilike '%'||v_query||'%'
      or coalesce(p.username,'') ilike '%'||v_query||'%'
      or p.user_id::text like v_query||'%')
  order by p.verified_athlete asc,p.created_at desc
  limit greatest(1,least(coalesce(p_limit,20),30));
end;
$function$;

create or replace function public.admin_set_athlete_verified(
  p_user_id uuid,
  p_verified boolean,
  p_reason text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_name text;
  v_old boolean;
begin
  if (select auth.uid()) is null
     or not private.platform_admin_has_permission('verification.athlete.manage') then
    raise exception 'Athlete verification management permission required';
  end if;
  if p_user_id is null or p_verified is null
     or p_reason is null
     or char_length(btrim(p_reason)) not between 5 and 500 then
    raise exception 'A verification decision and evidence-review reason (5–500 characters) are required';
  end if;
  select p.full_name,p.verified_athlete into v_name,v_old
  from public.profiles p
  where p.user_id=p_user_id and p.role='athlete'
  for update;
  if not found then raise exception 'Athlete account not found'; end if;

  update public.profiles
    set verified_athlete=p_verified,updated_at=pg_catalog.now()
  where user_id=p_user_id and role='athlete';

  insert into public.platform_admin_audit_log(actor_user_id,target_user_id,action,reason,metadata)
  values((select auth.uid()),p_user_id,
    case when p_verified then 'verification.athlete.verified' else 'verification.athlete.revoked' end,
    btrim(p_reason),
    jsonb_build_object('from',v_old,'to',p_verified,'athlete_name',v_name));

  insert into public.notifications(user_id,title,body,notification_type,created_at,updated_at)
  values(p_user_id,
    case when p_verified then 'Athlete profile verified' else 'Athlete verification updated' end,
    case when p_verified then 'AthleteN has verified your athlete profile.' else 'Your AthleteN athlete verification status was changed. Contact support for details.' end,
    'verification',pg_catalog.now(),pg_catalog.now());

  return jsonb_build_object('user_id',p_user_id,'verified_athlete',p_verified,'updated_at',pg_catalog.now());
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
  if (select auth.uid()) is null then raise exception 'Authentication required'; end if;
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
  if (select auth.uid()) is null then raise exception 'Authentication required'; end if;
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
  if p_status is null or p_status not in ('approved','rejected')
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
  if p_status is null or p_status not in ('active','restricted','suspended')
     or p_reason is null
     or char_length(btrim(p_reason)) not between 5 and 500 then
    raise exception 'Invalid access status or reason';
  end if;
  if p_expires_at is not null and p_expires_at<=pg_catalog.now() then
    raise exception 'An account-access expiry must be in the future';
  end if;
  if p_status='restricted' and p_expires_at is null then
    raise exception 'A temporary restriction must have an expiry';
  end if;
  if p_status<>'active' and p_expires_at is not null and p_expires_at<=pg_catalog.now() then
    raise exception 'An account restriction expiry must be in the future';
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
  if (select auth.uid()) is null then raise exception 'Authentication required'; end if;
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
language plpgsql
stable
security definer
set search_path = ''
as $function$
begin
  if (select auth.uid()) is null then raise exception 'Authentication required'; end if;
  return jsonb_build_object(
    'status',coalesce((select c.status from public.platform_account_access_controls c
       where c.user_id=(select auth.uid())
         and (c.expires_at is null or c.expires_at>pg_catalog.now())
       limit 1),'active'),
    'expires_at',(select c.expires_at from public.platform_account_access_controls c
       where c.user_id=(select auth.uid())
         and (c.expires_at is null or c.expires_at>pg_catalog.now())
       limit 1)
  );
end;
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
        'create policy platform_account_access_gate on public.%I as restrictive for all to authenticated using ((select private.platform_account_is_active()) or (select private.is_super_admin())) with check ((select private.platform_account_is_active()) or (select private.is_super_admin()))',
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

create or replace function private.audit_platform_configuration_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_actor uuid := (select auth.uid());
  v_entity_id uuid;
  v_action text;
  v_metadata jsonb;
begin
  if tg_table_name='feature_flags' then
    if tg_op='DELETE' then
      v_entity_id:=old.id;
      v_action:='platform.feature_flag.deleted';
      v_metadata:=jsonb_build_object('flag_key',old.flag_key,'enabled',old.enabled);
    else
      v_entity_id:=new.id;
      v_action:=case when tg_op='INSERT' then 'platform.feature_flag.created' else 'platform.feature_flag.updated' end;
      v_metadata:=jsonb_build_object('flag_key',new.flag_key,'enabled',new.enabled,'audience',new.audience);
    end if;
  elsif tg_table_name='announcements' then
    if tg_op='DELETE' then
      v_entity_id:=old.id;
      v_action:='platform.announcement.deleted';
      v_metadata:=jsonb_build_object('title',old.title,'audience',old.audience);
    else
      v_entity_id:=new.id;
      v_action:=case when tg_op='INSERT' then 'platform.announcement.published' else 'platform.announcement.updated' end;
      v_metadata:=jsonb_build_object('title',new.title,'audience',new.audience,'published_at',new.published_at);
    end if;
  else
    return null;
  end if;

  insert into public.platform_admin_audit_log(actor_user_id,action,reason,metadata)
  values(v_actor,v_action,'Platform configuration changed through an authorised database write.',
    v_metadata||jsonb_build_object('entity_id',v_entity_id,'table',tg_table_name));

  if tg_op='DELETE' then return old; end if;
  return new;
end;
$function$;

drop trigger if exists platform_feature_flags_audit on public.feature_flags;
create trigger platform_feature_flags_audit
after insert or update or delete on public.feature_flags
for each row execute function private.audit_platform_configuration_change();

drop trigger if exists platform_announcements_audit on public.announcements;
create trigger platform_announcements_audit
after insert or update or delete on public.announcements
for each row execute function private.audit_platform_configuration_change();

revoke all on function private.audit_platform_configuration_change() from public, anon, authenticated;

-- Scoped administrators are restricted at the database boundary. Regular users
-- retain their existing owner/team RLS paths; full Admin/Super Admin retains
-- existing platform-wide capabilities. Sensitive mutation remains RPC-only.
create or replace function private.platform_admin_resource_allowed(p_table text,p_action text)
returns boolean
language plpgsql
stable
security definer
set search_path = ''
as $function$
begin
  if not private.is_platform_admin() then return true; end if;
  if '*' = any(private.platform_admin_permissions_for((select auth.uid()))) then return true; end if;

  case p_table
    when 'student_verifications' then
      return p_action='select' and private.platform_admin_has_permission('verification.read');
    when 'age_verifications' then
      -- Guardian consent and age-approval data remains in its separate,
      -- existing workflow; the Student proof reviewer scope cannot read it.
      return false;
    when 'subscriptions','subscription_usage','account_entitlements','payment_orders','payment_events' then
      return p_action='select' and private.platform_admin_has_permission('billing.read');
    when 'support_tickets','feedback_items' then
      return (p_action='select' and private.platform_admin_has_permission('support.read'))
        or (p_action in ('insert','update') and private.platform_admin_has_permission('support.manage'));
    when 'message_reports' then
      return (p_action='select' and private.platform_admin_has_permission('message_reports.read'))
        or (p_action='update' and private.platform_admin_has_permission('message_reports.manage'));
    when 'feature_flags' then
      return p_action in ('select','update') and private.platform_admin_has_permission('flags.manage');
    when 'announcements' then
      return p_action in ('select','insert','update') and private.platform_admin_has_permission('announcements.manage');
    when 'audit_logs' then
      return p_action='select' and private.platform_admin_has_permission('audit.read');
    when 'roadmap_items','roadmap_votes','reserved_usernames' then
      return p_action='select' and private.platform_admin_has_permission('platform.read');
    else
      return false;
  end case;
end;
$function$;
revoke all on function private.platform_admin_resource_allowed(text,text) from public, anon;
grant execute on function private.platform_admin_resource_allowed(text,text) to authenticated;

do $scope_policies$
declare
  t text;
  v_tables text[] := array[
    'profiles','academies','academy_memberships','academy_coach_seats','coach_athlete_links','coach_approval_requests',
    'training_sessions','training_plans','attendance_records','tournaments','matches','medals','certificates',
    'documents','weight_logs','calendar_events','competition_checklists','injuries','goals',
    'student_verifications','age_verifications','feedback_items','roadmap_items','roadmap_votes','tournament_scans',
    'referrals','athlete_badges','ai_usage_events','subscriptions','subscription_usage','account_entitlements',
    'payment_orders','payment_events','support_tickets','conversations','conversation_members','messages',
    'message_reports','user_blocks','notifications','announcements','feature_flags','reserved_usernames','audit_logs',
    'academy_fee_invoices','academy_fee_payments','academy_coach_attendance','academy_coach_availability',
    'academy_athlete_transfer_requests','academy_announcements','academy_guardian_links','academy_report_exports',
    'academy_seat_requests','academy_staff_assignments','academy_notification_preferences'
  ];
begin
  foreach t in array v_tables loop
    if pg_catalog.to_regclass('public.'||t) is not null then
      execute pg_catalog.format('alter table public.%I enable row level security',t);
      execute pg_catalog.format('drop policy if exists platform_admin_scope_select on public.%I',t);
      execute pg_catalog.format(
        'create policy platform_admin_scope_select on public.%I as restrictive for select to authenticated using (private.platform_admin_resource_allowed(%L,''select'')%s)',
        t,t,case when t in ('profiles','notifications') then ' or user_id=(select auth.uid())' else '' end
      );
      execute pg_catalog.format('drop policy if exists platform_admin_scope_insert on public.%I',t);
      execute pg_catalog.format(
        'create policy platform_admin_scope_insert on public.%I as restrictive for insert to authenticated with check (private.platform_admin_resource_allowed(%L,''insert'')%s)',
        t,t,case when t='profiles' then ' or user_id=(select auth.uid())' else '' end
      );
      execute pg_catalog.format('drop policy if exists platform_admin_scope_update on public.%I',t);
      execute pg_catalog.format(
        'create policy platform_admin_scope_update on public.%I as restrictive for update to authenticated using (private.platform_admin_resource_allowed(%L,''update'')%s) with check (private.platform_admin_resource_allowed(%L,''update'')%s)',
        t,t,case when t in ('profiles','notifications') then ' or user_id=(select auth.uid())' else '' end,
        t,case when t in ('profiles','notifications') then ' or user_id=(select auth.uid())' else '' end
      );
      execute pg_catalog.format('drop policy if exists platform_admin_scope_delete on public.%I',t);
      execute pg_catalog.format(
        'create policy platform_admin_scope_delete on public.%I as restrictive for delete to authenticated using (private.platform_admin_resource_allowed(%L,''delete''))',
        t,t
      );
    end if;
  end loop;
end;
$scope_policies$;

create or replace function public.admin_set_user_role(p_user_id uuid,p_role text)
returns void
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_old text;
  v_name text;
  v_target_profile_id uuid;
begin
  if (select auth.uid()) is null
     or not exists(select 1 from public.profiles where user_id=(select auth.uid()) and role='super_admin')
     or not private.platform_admin_has_permission('platform.roles.manage') then
    raise exception 'Super Admin role-management permission required';
  end if;
  if p_role is null or p_role not in ('athlete','coach','academy_admin','support_admin','admin','super_admin') then
    raise exception 'Invalid role';
  end if;
  if p_user_id is null then raise exception 'Target user is required'; end if;
  if p_user_id=(select auth.uid()) and p_role<>'super_admin' then
    raise exception 'Super Admin cannot demote itself';
  end if;

  select p.role,p.full_name,p.id
    into v_old,v_name,v_target_profile_id
  from public.profiles p
  where p.user_id=p_user_id
  for update;
  if v_old is null then raise exception 'User profile not found'; end if;

  perform pg_catalog.set_config('athleten.privileged_profile_mutation','1',true);
  update public.profiles set role=p_role,updated_at=pg_catalog.now() where user_id=p_user_id;
  perform pg_catalog.set_config('athleten.privileged_profile_mutation','',true);
  if p_role not in ('admin','support_admin') then
    delete from public.platform_admin_assignments where admin_user_id=p_user_id;
  end if;

  insert into public.audit_logs(actor_user_id,action,entity_table,entity_id,metadata)
  values((select auth.uid()),'user.role_change','profiles',v_target_profile_id,
    jsonb_build_object('target_user_id',p_user_id,'target_name',v_name,'from',v_old,'to',p_role));

  insert into public.platform_admin_audit_log(actor_user_id,target_user_id,action,reason,metadata)
  values((select auth.uid()),p_user_id,'user.role_change','Super Admin changed the platform account role',
    jsonb_build_object('from',v_old,'to',p_role));

  if p_role in ('support_admin','admin','super_admin') then
    insert into public.athlete_badges(user_id,badge_key,badge_label,awarded_by,permanent,metadata)
    values(p_user_id,'administrator','Administrator',null,true,
      jsonb_build_object('system_assigned',true,'role',p_role))
    on conflict(user_id,badge_key) do update
      set permanent=true,metadata=excluded.metadata;
  end if;
end;
$function$;

revoke all on function public.admin_set_user_role(uuid,text) from public, anon;
grant execute on function public.admin_set_user_role(uuid,text) to authenticated;

-- Only the RPCs below can mutate role assignments, moderation state and reviews.
revoke all on function public.get_my_platform_admin_permissions() from public, anon;
revoke all on function public.get_platform_admin_overview() from public, anon;
revoke all on function public.get_platform_admin_assignments() from public, anon;
revoke all on function public.search_athlete_verification_reviews(text,integer) from public, anon;
revoke all on function public.admin_set_athlete_verified(uuid,boolean,text) from public, anon;
revoke all on function public.get_student_verification_queue() from public, anon;
revoke all on function public.search_platform_accounts(text,integer) from public, anon;
revoke all on function public.admin_assign_platform_role(uuid,text) from public, anon;
revoke all on function public.get_platform_admin_audit(integer) from public, anon;
revoke all on function public.admin_review_student_verification(uuid,text,text) from public, anon;
revoke all on function public.admin_set_platform_account_access(uuid,text,text,timestamptz) from public, anon;
revoke all on function public.get_platform_account_access_controls() from public, anon;
revoke all on function public.get_my_platform_account_access() from public, anon;

grant execute on function public.get_my_platform_admin_permissions() to authenticated;
grant execute on function public.get_platform_admin_overview() to authenticated;
grant execute on function public.get_platform_admin_assignments() to authenticated;
grant execute on function public.search_athlete_verification_reviews(text,integer) to authenticated;
grant execute on function public.admin_set_athlete_verified(uuid,boolean,text) to authenticated;
grant execute on function public.get_student_verification_queue() to authenticated;
grant execute on function public.search_platform_accounts(text,integer) to authenticated;
grant execute on function public.admin_assign_platform_role(uuid,text) to authenticated;
grant execute on function public.get_platform_admin_audit(integer) to authenticated;
grant execute on function public.admin_review_student_verification(uuid,text,text) to authenticated;
grant execute on function public.admin_set_platform_account_access(uuid,text,text,timestamptz) to authenticated;
grant execute on function public.get_platform_account_access_controls() to authenticated;
grant execute on function public.get_my_platform_account_access() to authenticated;

commit;
