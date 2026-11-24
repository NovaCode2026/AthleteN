-- AthleteN Academy Management Suite
-- Additive candidate migration. Reconcile migration history and replay in isolated
-- staging before production. No payment provider, email sender, or live push gateway
-- is configured by this migration.

create schema if not exists private;

-- Staff access is granted as explicit capabilities, not by changing the core
-- academy_memberships role values. This avoids silently promoting a Coach.
create table if not exists public.academy_staff_assignments (
  id uuid primary key default gen_random_uuid(),
  academy_id uuid not null references public.academies(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role_key text not null check (role_key in ('manager','operations','finance','communications')),
  permissions text[] not null default '{}',
  assigned_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (academy_id,user_id),
  check (permissions <@ array[
    'fees.manage','coaches.manage','attendance.manage','transfers.review',
    'announcements.publish','guardians.manage','reports.export','seats.manage',
    'members.manage','audit.read','notifications.manage'
  ]::text[])
);

create or replace function private.user_has_academy_permission(p_academy_id uuid,p_permission text)
returns boolean language sql stable security definer set search_path=''
as $function$
  select
    private.user_is_approved_academy_admin(p_academy_id)
    or exists (
      select 1
      from public.academy_staff_assignments s
      join public.academy_memberships m
        on m.academy_id=s.academy_id and m.user_id=s.user_id
      where s.academy_id=p_academy_id
        and s.user_id=(select auth.uid())
        and m.status='active'
        and m.role in ('coach','academy_admin')
        and s.permissions @> array[p_permission]::text[]
    );
$function$;
revoke all on function private.user_has_academy_permission(uuid,text) from public,anon;
grant execute on function private.user_has_academy_permission(uuid,text) to authenticated;

-- 1. Fee management. Payment rows are manual records only; no gateway settlement
-- or payment verification is claimed by this feature.
create table if not exists public.academy_fee_invoices (
  id uuid primary key default gen_random_uuid(),
  academy_id uuid not null references public.academies(id) on delete cascade,
  athlete_user_id uuid not null references auth.users(id) on delete cascade,
  title text not null check (length(btrim(title)) between 2 and 120),
  description text,
  amount numeric(12,2) not null check (amount > 0 and amount <= 10000000),
  due_date date,
  status text not null default 'issued'
    check (status in ('draft','issued','part_paid','paid','overdue','cancelled')),
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists academy_fee_invoices_academy_due_idx
  on public.academy_fee_invoices(academy_id,due_date,status);
create index if not exists academy_fee_invoices_athlete_idx
  on public.academy_fee_invoices(athlete_user_id,created_at desc);

create table if not exists public.academy_fee_payments (
  id uuid primary key default gen_random_uuid(),
  academy_id uuid not null references public.academies(id) on delete cascade,
  invoice_id uuid not null references public.academy_fee_invoices(id) on delete cascade,
  amount numeric(12,2) not null check (amount > 0 and amount <= 10000000),
  method text not null check (method in ('cash','bank_transfer','upi_manual','other')),
  reference text,
  received_by uuid not null references auth.users(id),
  received_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);
create index if not exists academy_fee_payments_invoice_idx
  on public.academy_fee_payments(invoice_id,received_at desc);

create or replace function private.user_can_view_academy_invoice(p_invoice_id uuid)
returns boolean language sql stable security definer set search_path=''
as $function$
  select exists (
    select 1 from public.academy_fee_invoices i
    where i.id=p_invoice_id
      and (
        i.athlete_user_id=(select auth.uid())
        or private.user_has_academy_permission(i.academy_id,'fees.manage')
        or exists (
          select 1 from public.coach_athlete_links l
          where l.academy_id=i.academy_id
            and l.athlete_user_id=i.athlete_user_id
            and l.coach_user_id=(select auth.uid())
            and l.status='active'
        )
      )
  );
$function$;
revoke all on function private.user_can_view_academy_invoice(uuid) from public,anon;
grant execute on function private.user_can_view_academy_invoice(uuid) to authenticated;

create or replace function public.academy_create_fee_invoice(
  p_academy_id uuid,p_athlete_user_id uuid,p_title text,p_amount numeric,
  p_due_date date default null,p_description text default null
) returns uuid language plpgsql security definer set search_path=''
as $function$
declare v_id uuid;
begin
  if auth.uid() is null or not private.user_has_academy_permission(p_academy_id,'fees.manage') then
    raise exception 'Academy fee-management permission required';
  end if;
  if not exists(select 1 from public.academy_memberships m
    where m.academy_id=p_academy_id and m.user_id=p_athlete_user_id
      and m.role='athlete' and m.status='active') then
    raise exception 'Athlete must be an active member of this Academy';
  end if;
  if p_title is null or length(btrim(p_title)) not between 2 and 120
     or p_amount is null or p_amount<=0 or p_amount>10000000
     or length(coalesce(p_description,''))>1000 then
    raise exception 'Invalid fee invoice details';
  end if;
  insert into public.academy_fee_invoices(academy_id,athlete_user_id,title,description,amount,due_date,status,created_by)
  values(p_academy_id,p_athlete_user_id,btrim(p_title),nullif(btrim(coalesce(p_description,'')),''),p_amount,p_due_date,'issued',auth.uid())
  returning id into v_id;
  return v_id;
end;
$function$;
revoke all on function public.academy_create_fee_invoice(uuid,uuid,text,numeric,date,text) from public,anon;
grant execute on function public.academy_create_fee_invoice(uuid,uuid,text,numeric,date,text) to authenticated;

create or replace function public.academy_record_fee_payment(
  p_invoice_id uuid,p_amount numeric,p_method text,p_reference text default null
) returns uuid language plpgsql security definer set search_path=''
as $function$
declare v_invoice public.academy_fee_invoices%rowtype; v_paid numeric(12,2); v_id uuid;
begin
  select * into v_invoice from public.academy_fee_invoices where id=p_invoice_id for update;
  if not found then raise exception 'Invoice not found'; end if;
  if not private.user_has_academy_permission(v_invoice.academy_id,'fees.manage') then
    raise exception 'Academy fee-management permission required';
  end if;
  if v_invoice.status='cancelled' or v_invoice.status='draft' then
    raise exception 'This invoice cannot accept a payment';
  end if;
  if p_amount is null or p_amount<=0 or p_amount>v_invoice.amount
    or p_method not in ('cash','bank_transfer','upi_manual','other')
    or length(coalesce(p_reference,''))>160 then
    raise exception 'Invalid payment details';
  end if;
  select coalesce(sum(amount),0) into v_paid
    from public.academy_fee_payments where invoice_id=p_invoice_id;
  if v_paid+p_amount>v_invoice.amount then raise exception 'Payment exceeds invoice balance'; end if;
  insert into public.academy_fee_payments(academy_id,invoice_id,amount,method,reference,received_by)
  values(v_invoice.academy_id,p_invoice_id,p_amount,p_method,nullif(btrim(coalesce(p_reference,'')),''),auth.uid())
  returning id into v_id;
  v_paid:=v_paid+p_amount;
  update public.academy_fee_invoices
    set status=case when v_paid>=amount then 'paid' else 'part_paid' end,updated_at=now()
    where id=p_invoice_id;
  return v_id;
end;
$function$;
revoke all on function public.academy_record_fee_payment(uuid,numeric,text,text) from public,anon;
grant execute on function public.academy_record_fee_payment(uuid,numeric,text,text) to authenticated;

-- 2. Coach attendance and availability.
create table if not exists public.academy_coach_attendance (
  id uuid primary key default gen_random_uuid(),
  academy_id uuid not null references public.academies(id) on delete cascade,
  coach_user_id uuid not null references auth.users(id) on delete cascade,
  attendance_date date not null,
  status text not null check (status in ('present','absent','late','leave')),
  note text,
  recorded_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (academy_id,coach_user_id,attendance_date)
);
create table if not exists public.academy_coach_availability (
  id uuid primary key default gen_random_uuid(),
  academy_id uuid not null references public.academies(id) on delete cascade,
  coach_user_id uuid not null references auth.users(id) on delete cascade,
  weekday smallint not null check (weekday between 0 and 6),
  starts_at time not null,
  ends_at time not null,
  availability_type text not null default 'available' check (availability_type in ('available','unavailable')),
  note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (ends_at > starts_at),
  unique (academy_id,coach_user_id,weekday,starts_at,ends_at)
);
create index if not exists academy_coach_attendance_date_idx on public.academy_coach_attendance(academy_id,attendance_date desc);

-- 3. Athlete-requested Coach transfers. Both Coaches and the Academy must approve.
create table if not exists public.academy_athlete_transfer_requests (
  id uuid primary key default gen_random_uuid(),
  academy_id uuid not null references public.academies(id) on delete cascade,
  athlete_user_id uuid not null references auth.users(id) on delete cascade,
  from_coach_user_id uuid not null references auth.users(id),
  to_coach_user_id uuid not null references auth.users(id),
  reason text,
  status text not null default 'pending_current_coach'
    check (status in ('pending_current_coach','pending_target_coach','pending_academy_review','approved','rejected','withdrawn')),
  current_coach_reviewed_at timestamptz,
  target_coach_reviewed_at timestamptz,
  academy_reviewed_at timestamptz,
  reviewed_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (from_coach_user_id<>to_coach_user_id)
);
create index if not exists academy_transfer_queue_idx on public.academy_athlete_transfer_requests(academy_id,status,created_at desc);

create or replace function public.academy_request_athlete_transfer(
  p_academy_id uuid,p_to_coach_user_id uuid,p_reason text default null
) returns uuid language plpgsql security definer set search_path=''
as $function$
declare v_old_coach uuid; v_id uuid;
begin
  if auth.uid() is null or length(coalesce(p_reason,''))>500 then raise exception 'Invalid transfer request'; end if;
  if not exists(select 1 from public.academy_memberships m where m.academy_id=p_academy_id
      and m.user_id=auth.uid() and m.role='athlete' and m.status='active') then
    raise exception 'Only an active Academy athlete can request a transfer';
  end if;
  if not exists(select 1 from public.academy_memberships m where m.academy_id=p_academy_id
      and m.user_id=p_to_coach_user_id and m.role='coach' and m.status='active') then
    raise exception 'Target must be an active Coach in this Academy';
  end if;
  select l.coach_user_id into v_old_coach from public.coach_athlete_links l
    where l.academy_id=p_academy_id and l.athlete_user_id=auth.uid() and l.status='active'
    order by l.created_at desc limit 1;
  if v_old_coach is null then raise exception 'No active Coach relationship was found'; end if;
  if v_old_coach=p_to_coach_user_id then raise exception 'Choose a different Coach'; end if;
  if exists(select 1 from public.academy_athlete_transfer_requests r
    where r.academy_id=p_academy_id and r.athlete_user_id=auth.uid()
      and r.status in ('pending_current_coach','pending_target_coach','pending_academy_review')) then
    raise exception 'An active transfer request already exists';
  end if;
  insert into public.academy_athlete_transfer_requests(academy_id,athlete_user_id,from_coach_user_id,to_coach_user_id,reason)
  values(p_academy_id,auth.uid(),v_old_coach,p_to_coach_user_id,nullif(btrim(coalesce(p_reason,'')),'')) returning id into v_id;
  return v_id;
end;
$function$;
revoke all on function public.academy_request_athlete_transfer(uuid,uuid,text) from public,anon;
grant execute on function public.academy_request_athlete_transfer(uuid,uuid,text) to authenticated;

create or replace function public.academy_review_athlete_transfer(
  p_request_id uuid,p_action text
) returns text language plpgsql security definer set search_path=''
as $function$
declare v public.academy_athlete_transfer_requests%rowtype;
begin
  select * into v from public.academy_athlete_transfer_requests where id=p_request_id for update;
  if not found then raise exception 'Transfer request not found'; end if;
  if p_action not in ('release','accept','approve','reject','withdraw') then raise exception 'Invalid transfer action'; end if;

  if p_action='withdraw' then
    if auth.uid()<>v.athlete_user_id or v.status not in ('pending_current_coach','pending_target_coach','pending_academy_review') then
      raise exception 'Only the requesting athlete can withdraw this request';
    end if;
    update public.academy_athlete_transfer_requests set status='withdrawn',updated_at=now() where id=v.id;
    return 'withdrawn';
  elsif p_action='release' then
    if auth.uid()<>v.from_coach_user_id or v.status<>'pending_current_coach' then raise exception 'Current Coach review required'; end if;
    update public.academy_athlete_transfer_requests set status='pending_target_coach',current_coach_reviewed_at=now(),updated_at=now() where id=v.id;
    return 'pending_target_coach';
  elsif p_action='accept' then
    if auth.uid()<>v.to_coach_user_id or v.status<>'pending_target_coach' then raise exception 'Target Coach acceptance required'; end if;
    update public.academy_athlete_transfer_requests set status='pending_academy_review',target_coach_reviewed_at=now(),updated_at=now() where id=v.id;
    return 'pending_academy_review';
  elsif p_action='approve' then
    if not private.user_has_academy_permission(v.academy_id,'transfers.review') or v.status<>'pending_academy_review' then
      raise exception 'Academy transfer-review permission required';
    end if;
    update public.coach_athlete_links set status='ended',updated_at=now()
      where academy_id=v.academy_id and athlete_user_id=v.athlete_user_id
        and coach_user_id=v.from_coach_user_id and status='active';
    insert into public.coach_athlete_links(coach_user_id,athlete_user_id,academy_id,status)
      values(v.to_coach_user_id,v.athlete_user_id,v.academy_id,'active')
      on conflict (coach_user_id,athlete_user_id,academy_id)
      do update set status='active',updated_at=now();
    update public.academy_athlete_transfer_requests set status='approved',academy_reviewed_at=now(),reviewed_by=auth.uid(),updated_at=now() where id=v.id;
    return 'approved';
  else
    if v.status='pending_current_coach' and auth.uid()=v.from_coach_user_id then
      update public.academy_athlete_transfer_requests set status='rejected',current_coach_reviewed_at=now(),reviewed_by=auth.uid(),updated_at=now() where id=v.id;
    elsif v.status='pending_target_coach' and auth.uid()=v.to_coach_user_id then
      update public.academy_athlete_transfer_requests set status='rejected',target_coach_reviewed_at=now(),reviewed_by=auth.uid(),updated_at=now() where id=v.id;
    elsif v.status='pending_academy_review' and private.user_has_academy_permission(v.academy_id,'transfers.review') then
      update public.academy_athlete_transfer_requests set status='rejected',academy_reviewed_at=now(),reviewed_by=auth.uid(),updated_at=now() where id=v.id;
    else raise exception 'You cannot reject this transfer at its current stage';
    end if;
    return 'rejected';
  end if;
end;
$function$;
revoke all on function public.academy_review_athlete_transfer(uuid,text) from public,anon;
grant execute on function public.academy_review_athlete_transfer(uuid,text) to authenticated;

-- 4. Academy-only announcements. Existing global announcements remain separate.
create table if not exists public.academy_announcements (
  id uuid primary key default gen_random_uuid(),
  academy_id uuid not null references public.academies(id) on delete cascade,
  group_id uuid references public.training_groups(id) on delete set null,
  audience text not null default 'all' check (audience in ('all','athletes','coaches')),
  title text not null check (length(btrim(title)) between 2 and 120),
  body text not null check (length(btrim(body)) between 2 and 3000),
  created_by uuid not null references auth.users(id),
  published_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists academy_announcements_feed_idx on public.academy_announcements(academy_id,published_at desc);

create or replace function public.academy_publish_announcement(
  p_academy_id uuid,p_title text,p_body text,p_audience text default 'all',p_group_id uuid default null
) returns uuid language plpgsql security definer set search_path=''
as $function$
declare v_id uuid; v_group_name text;
begin
  if auth.uid() is null or not private.user_has_academy_permission(p_academy_id,'announcements.publish') then
    raise exception 'Academy announcement permission required';
  end if;
  if p_title is null or length(btrim(p_title)) not between 2 and 120
     or p_body is null or length(btrim(p_body)) not between 2 and 3000
     or p_audience not in ('all','athletes','coaches') then
    raise exception 'Invalid announcement content or audience';
  end if;
  if p_group_id is not null and not exists(
    select 1 from public.training_groups g
    join public.academy_memberships m on m.academy_id=p_academy_id and m.user_id=g.coach_user_id
    where g.id=p_group_id and m.role='coach' and m.status='active'
  ) then raise exception 'Group must belong to an active Academy Coach'; end if;
  insert into public.academy_announcements(academy_id,group_id,audience,title,body,created_by,published_at)
    values(p_academy_id,p_group_id,p_audience,btrim(p_title),btrim(p_body),auth.uid(),now())
    returning id into v_id;

  insert into public.notifications(user_id,title,body,notification_type,action_route,created_at,updated_at)
  select m.user_id,btrim(p_title),left(btrim(p_body),240),'announcement','/notifications',now(),now()
    from public.academy_memberships m
    left join public.notification_preferences np on np.user_id=m.user_id
    where m.academy_id=p_academy_id and m.status='active'
      and coalesce(np.coach_academy,true)=true
      and (p_audience='all' or (p_audience='athletes' and m.role='athlete') or (p_audience='coaches' and m.role='coach'))
      and (
        p_group_id is null
        or exists(select 1 from public.training_group_members gm where gm.group_id=p_group_id and gm.athlete_user_id=m.user_id)
      );
  return v_id;
end;
$function$;
revoke all on function public.academy_publish_announcement(uuid,text,text,text,uuid) from public,anon;
grant execute on function public.academy_publish_announcement(uuid,text,text,text,uuid) to authenticated;

-- 5. Guardian portal. Guardian accounts must already exist. Guardian acceptance
-- and athlete approval are both required, and athlete-selected scopes are limited
-- to safe, non-medical summaries.
create table if not exists public.academy_guardian_links (
  id uuid primary key default gen_random_uuid(),
  academy_id uuid not null references public.academies(id) on delete cascade,
  athlete_user_id uuid not null references auth.users(id) on delete cascade,
  guardian_user_id uuid not null references auth.users(id) on delete cascade,
  relationship text not null check (relationship in ('parent','legal_guardian','caregiver')),
  scopes text[] not null default '{}',
  status text not null default 'pending_guardian' check (status in ('pending_guardian','pending_athlete','active','revoked','rejected')),
  initiated_by uuid not null references auth.users(id),
  guardian_accepted_at timestamptz,
  athlete_approved_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (academy_id,athlete_user_id,guardian_user_id),
  check (scopes <@ array['announcements','calendar','attendance_summary','fee_status']::text[])
);

create or replace function public.academy_create_guardian_link(
  p_academy_id uuid,p_athlete_user_id uuid,p_guardian_user_id uuid,p_relationship text
) returns uuid language plpgsql security definer set search_path=''
as $function$
declare v_id uuid;
begin
  if auth.uid() is null or not private.user_has_academy_permission(p_academy_id,'guardians.manage') then
    raise exception 'Academy guardian-management permission required';
  end if;
  if p_guardian_user_id=p_athlete_user_id or p_relationship not in ('parent','legal_guardian','caregiver')
    or not exists(select 1 from public.academy_memberships m where m.academy_id=p_academy_id
      and m.user_id=p_athlete_user_id and m.role='athlete' and m.status='active') then
    raise exception 'Invalid athlete or guardian link';
  end if;
  insert into public.academy_guardian_links(academy_id,athlete_user_id,guardian_user_id,relationship,initiated_by)
  values(p_academy_id,p_athlete_user_id,p_guardian_user_id,p_relationship,auth.uid())
  on conflict(academy_id,athlete_user_id,guardian_user_id)
  do update set status='pending_guardian',scopes='{}',guardian_accepted_at=null,athlete_approved_at=null,updated_at=now()
  returning id into v_id;
  return v_id;
end;
$function$;
revoke all on function public.academy_create_guardian_link(uuid,uuid,uuid,text) from public,anon;
grant execute on function public.academy_create_guardian_link(uuid,uuid,uuid,text) to authenticated;

create or replace function public.academy_accept_guardian_link(p_link_id uuid)
returns boolean language plpgsql security definer set search_path=''
as $function$
begin
  update public.academy_guardian_links set status='pending_athlete',guardian_accepted_at=now(),updated_at=now()
    where id=p_link_id and guardian_user_id=auth.uid() and status='pending_guardian';
  if not found then raise exception 'Guardian invitation is unavailable'; end if;
  return true;
end;
$function$;
revoke all on function public.academy_accept_guardian_link(uuid) from public,anon;
grant execute on function public.academy_accept_guardian_link(uuid) to authenticated;

create or replace function public.academy_approve_guardian_link(p_link_id uuid,p_scopes text[])
returns boolean language plpgsql security definer set search_path=''
as $function$
declare v_allowed text[]:=array['announcements','calendar','attendance_summary','fee_status']::text[];
begin
  if p_scopes is null or not (p_scopes <@ v_allowed) then raise exception 'Invalid guardian access scopes'; end if;
  update public.academy_guardian_links set status='active',scopes=p_scopes,athlete_approved_at=now(),updated_at=now()
    where id=p_link_id and athlete_user_id=auth.uid() and status='pending_athlete' and guardian_accepted_at is not null;
  if not found then raise exception 'Athlete approval is unavailable'; end if;
  return true;
end;
$function$;
revoke all on function public.academy_approve_guardian_link(uuid,text[]) from public,anon;
grant execute on function public.academy_approve_guardian_link(uuid,text[]) to authenticated;

create or replace function public.academy_guardian_portal_summary(p_link_id uuid)
returns jsonb language plpgsql stable security definer set search_path=''
as $function$
declare v public.academy_guardian_links%rowtype; v_result jsonb:='{}'::jsonb;
begin
  select * into v from public.academy_guardian_links where id=p_link_id and guardian_user_id=auth.uid() and status='active';
  if not found then raise exception 'Active guardian approval required'; end if;
  if 'announcements'=any(v.scopes) then
    v_result:=v_result||jsonb_build_object('announcements',coalesce((
      select jsonb_agg(jsonb_build_object('title',a.title,'body',a.body,'published_at',a.published_at) order by a.published_at desc)
      from public.academy_announcements a where a.academy_id=v.academy_id and a.published_at is not null
    ),'[]'::jsonb));
  end if;
  if 'calendar'=any(v.scopes) then
    v_result:=v_result||jsonb_build_object('calendar',coalesce((
      select jsonb_agg(jsonb_build_object('title',e.title,'event_type',e.event_type,'event_date',e.event_date) order by e.event_date)
      from public.calendar_events e where e.user_id=v.athlete_user_id and e.event_date>=now() and e.event_type not in ('medical','recovery')
    ),'[]'::jsonb));
  end if;
  if 'attendance_summary'=any(v.scopes) then
    v_result:=v_result||jsonb_build_object('attendance',jsonb_build_object(
      'present_90d',(select count(*) from public.attendance_records a where a.user_id=v.athlete_user_id and a.academy_id=v.academy_id and a.status in ('present','late') and a.attended_at>=now()-interval '90 days'),
      'marked_90d',(select count(*) from public.attendance_records a where a.user_id=v.athlete_user_id and a.academy_id=v.academy_id and a.attended_at>=now()-interval '90 days')
    ));
  end if;
  if 'fee_status'=any(v.scopes) then
    v_result:=v_result||jsonb_build_object('fees',coalesce((
      select jsonb_agg(jsonb_build_object('title',i.title,'amount',i.amount,'status',i.status,'due_date',i.due_date) order by i.due_date)
      from public.academy_fee_invoices i where i.athlete_user_id=v.athlete_user_id and i.academy_id=v.academy_id and i.status<>'cancelled'
    ),'[]'::jsonb));
  end if;
  return v_result;
end;
$function$;
revoke all on function public.academy_guardian_portal_summary(uuid) from public,anon;
grant execute on function public.academy_guardian_portal_summary(uuid) to authenticated;

-- 6. Report export audit. Actual CSV/PDF rendering is performed by the client
-- from data it is already authorized to read; this table records the export event.
create table if not exists public.academy_report_exports (
  id uuid primary key default gen_random_uuid(),
  academy_id uuid not null references public.academies(id) on delete cascade,
  report_type text not null check (report_type in ('athletes','coaches','attendance','competitions','finance','fees','achievements')),
  format text not null check (format in ('csv','json')),
  filters jsonb not null default '{}'::jsonb check (jsonb_typeof(filters)='object'),
  exported_by uuid not null references auth.users(id),
  created_at timestamptz not null default now()
);

create or replace function public.academy_record_report_export(p_academy_id uuid,p_report_type text,p_format text,p_filters jsonb default '{}'::jsonb)
returns uuid language plpgsql security definer set search_path=''
as $function$
declare v_id uuid;
begin
  if auth.uid() is null or not private.user_has_academy_permission(p_academy_id,'reports.export') then
    raise exception 'Academy report-export permission required';
  end if;
  if p_report_type not in ('athletes','coaches','attendance','competitions','finance','fees','achievements')
    or p_format not in ('csv','json') or jsonb_typeof(coalesce(p_filters,'{}'::jsonb))<>'object' then
    raise exception 'Invalid report export request';
  end if;
  insert into public.academy_report_exports(academy_id,report_type,format,filters,exported_by)
  values(p_academy_id,p_report_type,p_format,coalesce(p_filters,'{}'::jsonb),auth.uid())
  returning id into v_id;
  return v_id;
end;
$function$;
revoke all on function public.academy_record_report_export(uuid,text,text,jsonb) from public,anon;
grant execute on function public.academy_record_report_export(uuid,text,text,jsonb) to authenticated;

-- 7. Coach seat request / approval lifecycle. Paid seats remain payment_pending
-- until a verified payment-provider webhook activates them.
create table if not exists public.academy_seat_requests (
  id uuid primary key default gen_random_uuid(),
  academy_id uuid not null references public.academies(id) on delete cascade,
  coach_user_id uuid not null references auth.users(id) on delete cascade,
  request_type text not null default 'additional' check (request_type in ('additional','remove')),
  status text not null default 'pending' check (status in ('pending','payment_pending','active','rejected','cancelled')),
  decided_by uuid references auth.users(id),
  decided_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists academy_seat_requests_idx on public.academy_seat_requests(academy_id,status,created_at desc);

create or replace function public.academy_request_coach_seat(p_academy_id uuid,p_request_type text default 'additional')
returns uuid language plpgsql security definer set search_path=''
as $function$
declare v_id uuid;
begin
  if auth.uid() is null or p_request_type not in ('additional','remove')
    or not exists(select 1 from public.academy_memberships m where m.academy_id=p_academy_id
       and m.user_id=auth.uid() and m.role='coach' and m.status='active') then
    raise exception 'Active Academy Coach required';
  end if;
  if exists(select 1 from public.academy_seat_requests r where r.academy_id=p_academy_id and r.coach_user_id=auth.uid() and r.status in ('pending','payment_pending')) then
    raise exception 'A seat request is already open';
  end if;
  insert into public.academy_seat_requests(academy_id,coach_user_id,request_type)
  values(p_academy_id,auth.uid(),p_request_type) returning id into v_id;
  return v_id;
end;
$function$;
revoke all on function public.academy_request_coach_seat(uuid,text) from public,anon;
grant execute on function public.academy_request_coach_seat(uuid,text) to authenticated;

create or replace function public.academy_review_coach_seat_request(p_request_id uuid,p_approve boolean)
returns text language plpgsql security definer set search_path=''
as $function$
declare v public.academy_seat_requests%rowtype; v_included integer;
begin
  select * into v from public.academy_seat_requests where id=p_request_id for update;
  if not found or not private.user_has_academy_permission(v.academy_id,'seats.manage') then
    raise exception 'Academy seat-management permission required';
  end if;
  if v.status<>'pending' then raise exception 'Seat request has already been processed'; end if;
  if not p_approve then
    update public.academy_seat_requests set status='rejected',decided_by=auth.uid(),decided_at=now(),updated_at=now() where id=v.id;
    return 'rejected';
  end if;
  if v.request_type='remove' then
    if exists(select 1 from public.coach_athlete_links
      where academy_id=v.academy_id and coach_user_id=v.coach_user_id and status='active')
      or exists(select 1 from public.training_groups
      where coach_user_id=v.coach_user_id and active=true) then
      raise exception 'Reassign active athletes and training groups before removing this Coach seat';
    end if;
    update public.academy_coach_seats set status='canceled',deactivated_at=now(),updated_at=now()
      where academy_id=v.academy_id and coach_user_id=v.coach_user_id and status='active';
    update public.academy_memberships set status='suspended',updated_at=now()
      where academy_id=v.academy_id and user_id=v.coach_user_id and role='coach' and status='active';
    update public.academy_seat_requests set status='cancelled',decided_by=auth.uid(),decided_at=now(),updated_at=now() where id=v.id;
    return 'cancelled';
  end if;
  select count(*) into v_included from public.academy_coach_seats
    where academy_id=v.academy_id and seat_type='included' and status='active';
  if v_included<2 then
    insert into public.academy_coach_seats(academy_id,coach_user_id,seat_type,activation_fee,monthly_fee,status)
    values(v.academy_id,v.coach_user_id,'included',0,0,'active')
    on conflict(academy_id,coach_user_id) do update set status='active',updated_at=now(),deactivated_at=null;
    update public.academy_seat_requests set status='active',decided_by=auth.uid(),decided_at=now(),updated_at=now() where id=v.id;
    return 'active';
  end if;
  update public.academy_seat_requests set status='payment_pending',decided_by=auth.uid(),decided_at=now(),updated_at=now() where id=v.id;
  return 'payment_pending';
end;
$function$;
revoke all on function public.academy_review_coach_seat_request(uuid,boolean) from public,anon;
grant execute on function public.academy_review_coach_seat_request(uuid,boolean) to authenticated;

-- 8. Per-user Academy notification preferences.
create table if not exists public.academy_notification_preferences (
  academy_id uuid not null references public.academies(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  announcements boolean not null default true,
  fees boolean not null default true,
  transfers boolean not null default true,
  seat_updates boolean not null default true,
  reports boolean not null default true,
  updated_at timestamptz not null default now(),
  primary key(academy_id,user_id)
);

-- Central in-app alert fan-out. Each event checks Academy membership, the
-- per-Academy preference and AthleteN's existing Coach/Academy notification toggle.
create or replace function private.enqueue_academy_notification(
  p_academy_id uuid,p_user_id uuid,p_title text,p_body text,p_category text
) returns void language plpgsql security definer set search_path=''
as $function$
declare v_category_enabled boolean; v_global_enabled boolean;
begin
  if p_academy_id is null or p_user_id is null or not exists(
    select 1 from public.academy_memberships m
    where m.academy_id=p_academy_id and m.user_id=p_user_id and m.status='active'
  ) then return; end if;
  select
    case p_category
      when 'fees' then coalesce(ap.fees,true)
      when 'transfers' then coalesce(ap.transfers,true)
      when 'seat_updates' then coalesce(ap.seat_updates,true)
      when 'reports' then coalesce(ap.reports,true)
      when 'announcements' then coalesce(ap.announcements,true)
      else true
    end,
    coalesce(np.coach_academy,true)
  into v_category_enabled,v_global_enabled
  from (select 1) seed
  left join public.academy_notification_preferences ap
    on ap.academy_id=p_academy_id and ap.user_id=p_user_id
  left join public.notification_preferences np on np.user_id=p_user_id;
  if coalesce(v_category_enabled,true) and coalesce(v_global_enabled,true) then
    insert into public.notifications(user_id,title,body,notification_type,action_route,created_at,updated_at)
    values(p_user_id,left(coalesce(p_title,'Academy update'),120),left(coalesce(p_body,''),240),
      'coach_academy','/notifications',now(),now());
  end if;
end;
$function$;
revoke all on function private.enqueue_academy_notification(uuid,uuid,text,text,text) from public,anon,authenticated;

create or replace function public.academy_management_notify_event()
returns trigger language plpgsql security definer set search_path=''
as $function$
declare
  v_row jsonb;
  v_old jsonb;
  v_academy uuid;
  v_status text;
  v_old_status text;
  v_user uuid;
  v_invoice public.academy_fee_invoices%rowtype;
  v_payment_total numeric(12,2);
  r record;
begin
  if tg_op='DELETE' then v_row:=to_jsonb(old); else v_row:=to_jsonb(new); end if;
  v_academy:=nullif(v_row->>'academy_id','')::uuid;

  if tg_table_name='academy_fee_invoices' and tg_op='INSERT' then
    perform private.enqueue_academy_notification(v_academy,(v_row->>'athlete_user_id')::uuid,
      'New Academy fee invoice',coalesce(v_row->>'title','Academy fee')||' · ₹'||coalesce(v_row->>'amount','0')||
      case when v_row->>'due_date' is not null then ' · Due '||v_row->>'due_date' else '' end,'fees');

  elsif tg_table_name='academy_fee_payments' and tg_op='INSERT' then
    select * into v_invoice from public.academy_fee_invoices where id=(v_row->>'invoice_id')::uuid;
    select coalesce(sum(amount),0) into v_payment_total from public.academy_fee_payments where invoice_id=v_invoice.id;
    perform private.enqueue_academy_notification(v_invoice.academy_id,v_invoice.athlete_user_id,
      'Academy fee payment recorded','Recorded '+('₹'||(v_row->>'amount'))||' · Total received ₹'||v_payment_total,'fees');

  elsif tg_table_name='academy_athlete_transfer_requests' then
    v_status:=v_row->>'status';
    if tg_op='UPDATE' then v_old:=to_jsonb(old); v_old_status:=v_old->>'status'; end if;
    if tg_op='INSERT' or v_status is distinct from v_old_status then
      if v_status='pending_current_coach' then
        perform private.enqueue_academy_notification(v_academy,(v_row->>'from_coach_user_id')::uuid,
          'Athlete Coach transfer requested','An athlete requested a change of Coach. Review the transfer request.','transfers');
      elsif v_status='pending_target_coach' then
        perform private.enqueue_academy_notification(v_academy,(v_row->>'to_coach_user_id')::uuid,
          'Coach transfer awaiting acceptance','An athlete transfer has been released by the current Coach.','transfers');
      elsif v_status='pending_academy_review' then
        for r in select m.user_id from public.academy_memberships m
          where m.academy_id=v_academy and m.role='academy_admin' and m.status='active'
        loop
          perform private.enqueue_academy_notification(v_academy,r.user_id,
            'Athlete transfer needs Academy review','Both Coaches have reviewed the transfer. Academy review is next.','transfers');
        end loop;
        for r in select a.user_id from public.academy_staff_assignments a
          join public.academy_memberships m on m.academy_id=a.academy_id and m.user_id=a.user_id and m.status='active'
          where a.academy_id=v_academy and a.permissions @> array['transfers.review']::text[]
        loop
          perform private.enqueue_academy_notification(v_academy,r.user_id,
            'Athlete transfer needs Academy review','Both Coaches have reviewed the transfer. Academy review is next.','transfers');
        end loop;
      elsif v_status in ('approved','rejected','withdrawn') then
        perform private.enqueue_academy_notification(v_academy,(v_row->>'athlete_user_id')::uuid,
          'Athlete transfer updated','Your Coach transfer request is now '||replace(v_status,'_',' ')||'.','transfers');
        perform private.enqueue_academy_notification(v_academy,(v_row->>'from_coach_user_id')::uuid,
          'Athlete transfer updated','A Coach transfer request is now '||replace(v_status,'_',' ')||'.','transfers');
        perform private.enqueue_academy_notification(v_academy,(v_row->>'to_coach_user_id')::uuid,
          'Athlete transfer updated','A Coach transfer request is now '||replace(v_status,'_',' ')||'.','transfers');
      end if;
    end if;

  elsif tg_table_name='academy_seat_requests' then
    v_status:=v_row->>'status';
    if tg_op='UPDATE' then v_old:=to_jsonb(old); v_old_status:=v_old->>'status'; end if;
    if tg_op='INSERT' then
      for r in select m.user_id from public.academy_memberships m
        where m.academy_id=v_academy and m.role='academy_admin' and m.status='active'
      loop
        perform private.enqueue_academy_notification(v_academy,r.user_id,
          'Coach seat request','A Coach submitted a seat request for Academy review.','seat_updates');
      end loop;
    elsif v_status is distinct from v_old_status then
      perform private.enqueue_academy_notification(v_academy,(v_row->>'coach_user_id')::uuid,
        'Coach seat request updated','Your Coach seat request is now '||replace(v_status,'_',' ')||'.','seat_updates');
    end if;

  elsif tg_table_name='academy_staff_assignments' then
    v_user:=coalesce(nullif(v_row->>'user_id','')::uuid,nullif(to_jsonb(old)->>'user_id','')::uuid);
    if v_user is not null then
      perform private.enqueue_academy_notification(v_academy,v_user,
        'Academy staff permissions updated','Your Academy staff permissions were changed. Review your current access.','seat_updates');
    end if;
  end if;

  if tg_op='DELETE' then return old; else return new; end if;
end;
$function$;
revoke all on function public.academy_management_notify_event() from public,anon,authenticated;

drop trigger if exists academy_fee_invoice_notify on public.academy_fee_invoices;
create trigger academy_fee_invoice_notify after insert on public.academy_fee_invoices
for each row execute function public.academy_management_notify_event();
drop trigger if exists academy_fee_payment_notify on public.academy_fee_payments;
create trigger academy_fee_payment_notify after insert on public.academy_fee_payments
for each row execute function public.academy_management_notify_event();
drop trigger if exists academy_transfer_notify on public.academy_athlete_transfer_requests;
create trigger academy_transfer_notify after insert or update of status on public.academy_athlete_transfer_requests
for each row execute function public.academy_management_notify_event();
drop trigger if exists academy_seat_request_notify on public.academy_seat_requests;
create trigger academy_seat_request_notify after insert or update of status on public.academy_seat_requests
for each row execute function public.academy_management_notify_event();
drop trigger if exists academy_staff_assignment_notify on public.academy_staff_assignments;
create trigger academy_staff_assignment_notify after insert or update or delete on public.academy_staff_assignments
for each row execute function public.academy_management_notify_event();

-- Apply the per-Academy announcement preference at fan-out time. Missing
-- preferences default to enabled; the account-wide coach_academy switch still
-- remains respected.
create or replace function public.academy_publish_announcement(
  p_academy_id uuid,p_title text,p_body text,p_audience text default 'all',p_group_id uuid default null
) returns uuid language plpgsql security definer set search_path=''
as $function$
declare v_id uuid;
begin
  if auth.uid() is null or not private.user_has_academy_permission(p_academy_id,'announcements.publish') then
    raise exception 'Academy announcement permission required';
  end if;
  if p_title is null or length(btrim(p_title)) not between 2 and 120
     or p_body is null or length(btrim(p_body)) not between 2 and 3000
     or p_audience not in ('all','athletes','coaches') then
    raise exception 'Invalid announcement content or audience';
  end if;
  if p_group_id is not null and not exists(
    select 1 from public.training_groups g
    join public.academy_memberships m on m.academy_id=p_academy_id and m.user_id=g.coach_user_id
    where g.id=p_group_id and m.role='coach' and m.status='active'
  ) then raise exception 'Group must belong to an active Academy Coach'; end if;
  insert into public.academy_announcements(academy_id,group_id,audience,title,body,created_by,published_at)
    values(p_academy_id,p_group_id,p_audience,btrim(p_title),btrim(p_body),auth.uid(),now())
    returning id into v_id;
  insert into public.notifications(user_id,title,body,notification_type,action_route,created_at,updated_at)
  select m.user_id,btrim(p_title),left(btrim(p_body),240),'announcement','/notifications',now(),now()
    from public.academy_memberships m
    left join public.notification_preferences np on np.user_id=m.user_id
    left join public.academy_notification_preferences anp on anp.academy_id=p_academy_id and anp.user_id=m.user_id
    where m.academy_id=p_academy_id and m.status='active'
      and coalesce(np.coach_academy,true)=true
      and coalesce(anp.announcements,true)=true
      and (p_audience='all' or (p_audience='athletes' and m.role='athlete') or (p_audience='coaches' and m.role='coach'))
      and (
        p_group_id is null
        or exists(select 1 from public.training_group_members gm where gm.group_id=p_group_id and gm.athlete_user_id=m.user_id and gm.status='active')
      );
  return v_id;
end;
$function$;
revoke all on function public.academy_publish_announcement(uuid,text,text,text,uuid) from public,anon;
grant execute on function public.academy_publish_announcement(uuid,text,text,text,uuid) to authenticated;

-- 9. Explicit Academy permissions and 10. append-only audit trail.
create table if not exists public.academy_audit_log (
  id uuid primary key default gen_random_uuid(),
  academy_id uuid not null references public.academies(id) on delete cascade,
  actor_user_id uuid references auth.users(id) on delete set null,
  action text not null,
  entity_type text not null,
  entity_id uuid,
  changed_fields text[] not null default '{}',
  created_at timestamptz not null default now()
);
create index if not exists academy_audit_log_recent_idx on public.academy_audit_log(academy_id,created_at desc);

create or replace function public.academy_set_staff_assignment(
  p_academy_id uuid,p_user_id uuid,p_role_key text,p_permissions text[]
) returns uuid language plpgsql security definer set search_path=''
as $function$
declare v_id uuid; v_allowed text[]:=array[
  'fees.manage','coaches.manage','attendance.manage','transfers.review',
  'announcements.publish','guardians.manage','reports.export','seats.manage',
  'members.manage','audit.read','notifications.manage'
]::text[];
begin
  if auth.uid() is null or not private.user_is_approved_academy_admin(p_academy_id) then
    raise exception 'Academy Admin permission required';
  end if;
  if p_role_key not in ('manager','operations','finance','communications')
     or p_permissions is null or not (p_permissions <@ v_allowed)
     or not exists(select 1 from public.academy_memberships m where m.academy_id=p_academy_id
       and m.user_id=p_user_id and m.role='coach' and m.status='active') then
    raise exception 'Only an active Academy Coach can be assigned a staff permission set';
  end if;
  insert into public.academy_staff_assignments(academy_id,user_id,role_key,permissions,assigned_by)
  values(p_academy_id,p_user_id,p_role_key,p_permissions,auth.uid())
  on conflict(academy_id,user_id) do update set role_key=excluded.role_key,permissions=excluded.permissions,assigned_by=excluded.assigned_by,updated_at=now()
  returning id into v_id;
  return v_id;
end;
$function$;
revoke all on function public.academy_set_staff_assignment(uuid,uuid,text,text[]) from public,anon;
grant execute on function public.academy_set_staff_assignment(uuid,uuid,text,text[]) to authenticated;

create or replace function public.academy_remove_staff_assignment(p_academy_id uuid,p_user_id uuid)
returns boolean language plpgsql security definer set search_path=''
as $function$
begin
  if auth.uid() is null or not private.user_is_approved_academy_admin(p_academy_id) then raise exception 'Academy Admin permission required'; end if;
  delete from public.academy_staff_assignments where academy_id=p_academy_id and user_id=p_user_id;
  return found;
end;
$function$;
revoke all on function public.academy_remove_staff_assignment(uuid,uuid) from public,anon;
grant execute on function public.academy_remove_staff_assignment(uuid,uuid) to authenticated;

create or replace function public.academy_audit_sensitive_change()
returns trigger language plpgsql security definer set search_path=''
as $function$
declare v_new jsonb; v_old jsonb; v_source jsonb; v_academy uuid; v_id uuid; v_fields text[];
begin
  if tg_op='DELETE' then v_source:=to_jsonb(old); else v_source:=to_jsonb(new); end if;
  v_academy:=nullif(v_source->>'academy_id','')::uuid;
  v_id:=nullif(v_source->>'id','')::uuid;
  if tg_op='INSERT' then
    select coalesce(array_agg(k),'{}'::text[]) into v_fields from jsonb_object_keys(v_source) k;
  elsif tg_op='DELETE' then
    select coalesce(array_agg(k),'{}'::text[]) into v_fields from jsonb_object_keys(to_jsonb(old)) k;
  else
    v_old:=to_jsonb(old); v_new:=to_jsonb(new);
    select coalesce(array_agg(n.key),'{}'::text[]) into v_fields
    from jsonb_each(v_new) n
    where n.value is distinct from v_old->n.key;
  end if;
  insert into public.academy_audit_log(academy_id,actor_user_id,action,entity_type,entity_id,changed_fields)
  values(v_academy,auth.uid(),lower(tg_op),tg_table_name,v_id,v_fields);
  if tg_op='DELETE' then return old; else return new; end if;
end;
$function$;
revoke all on function public.academy_audit_sensitive_change() from public,anon,authenticated;

do $triggers$
declare t text;
begin
  foreach t in array array[
    'academy_fee_invoices','academy_fee_payments','academy_coach_attendance',
    'academy_coach_availability','academy_athlete_transfer_requests',
    'academy_announcements','academy_guardian_links','academy_seat_requests',
    'academy_staff_assignments'
  ] loop
    execute format('drop trigger if exists academy_audit_%I on public.%I',t,t);
    execute format('create trigger academy_audit_%I after insert or update or delete on public.%I for each row execute function public.academy_audit_sensitive_change()',t,t);
  end loop;
end;
$triggers$;

-- Enable RLS and keep client access narrow. Writes to money, transfers, announcements,
-- guardian state, seat state and staff permissions go through validated RPCs.
alter table public.academy_staff_assignments enable row level security;
alter table public.academy_fee_invoices enable row level security;
alter table public.academy_fee_payments enable row level security;
alter table public.academy_coach_attendance enable row level security;
alter table public.academy_coach_availability enable row level security;
alter table public.academy_athlete_transfer_requests enable row level security;
alter table public.academy_announcements enable row level security;
alter table public.academy_guardian_links enable row level security;
alter table public.academy_report_exports enable row level security;
alter table public.academy_seat_requests enable row level security;
alter table public.academy_notification_preferences enable row level security;
alter table public.academy_audit_log enable row level security;

revoke all on public.academy_staff_assignments,public.academy_fee_invoices,public.academy_fee_payments,
  public.academy_coach_attendance,public.academy_coach_availability,
  public.academy_athlete_transfer_requests,public.academy_announcements,
  public.academy_guardian_links,public.academy_report_exports,public.academy_seat_requests,
  public.academy_notification_preferences,public.academy_audit_log from public,anon,authenticated;
grant select on public.academy_staff_assignments,public.academy_fee_invoices,public.academy_fee_payments,
  public.academy_coach_attendance,public.academy_coach_availability,
  public.academy_athlete_transfer_requests,public.academy_announcements,
  public.academy_guardian_links,public.academy_report_exports,public.academy_seat_requests,
  public.academy_notification_preferences,public.academy_audit_log to authenticated;
grant insert,update on public.academy_coach_attendance,public.academy_coach_availability,public.academy_notification_preferences to authenticated;

drop policy if exists academy_staff_assignments_read on public.academy_staff_assignments;
create policy academy_staff_assignments_read on public.academy_staff_assignments for select to authenticated
using (user_id=auth.uid() or private.user_is_approved_academy_admin(academy_id));
drop policy if exists academy_fee_invoices_read on public.academy_fee_invoices;
create policy academy_fee_invoices_read on public.academy_fee_invoices for select to authenticated
using (athlete_user_id=auth.uid() or private.user_has_academy_permission(academy_id,'fees.manage')
  or exists(select 1 from public.coach_athlete_links l where l.academy_id=academy_fee_invoices.academy_id and l.athlete_user_id=academy_fee_invoices.athlete_user_id and l.coach_user_id=auth.uid() and l.status='active'));
drop policy if exists academy_fee_payments_read on public.academy_fee_payments;
create policy academy_fee_payments_read on public.academy_fee_payments for select to authenticated
using (private.user_can_view_academy_invoice(invoice_id));
drop policy if exists academy_coach_attendance_read on public.academy_coach_attendance;
create policy academy_coach_attendance_read on public.academy_coach_attendance for select to authenticated
using (coach_user_id=auth.uid() or private.user_has_academy_permission(academy_id,'attendance.manage'));
drop policy if exists academy_coach_attendance_insert on public.academy_coach_attendance;
create policy academy_coach_attendance_insert on public.academy_coach_attendance for insert to authenticated
with check (
  recorded_by=auth.uid()
  and exists(select 1 from public.academy_memberships m where m.academy_id=academy_coach_attendance.academy_id and m.user_id=academy_coach_attendance.coach_user_id and m.role='coach' and m.status='active')
  and (
    (coach_user_id=auth.uid() and recorded_by=auth.uid())
    or private.user_has_academy_permission(academy_id,'attendance.manage')
  )
);
drop policy if exists academy_coach_attendance_update on public.academy_coach_attendance;
create policy academy_coach_attendance_update on public.academy_coach_attendance for update to authenticated
using (coach_user_id=auth.uid() or private.user_has_academy_permission(academy_id,'attendance.manage'))
with check (
  exists(select 1 from public.academy_memberships m where m.academy_id=academy_coach_attendance.academy_id and m.user_id=academy_coach_attendance.coach_user_id and m.role='coach' and m.status='active')
  and (coach_user_id=auth.uid() or private.user_has_academy_permission(academy_id,'attendance.manage'))
);
drop policy if exists academy_coach_availability_read on public.academy_coach_availability;
create policy academy_coach_availability_read on public.academy_coach_availability for select to authenticated
using (coach_user_id=auth.uid() or private.user_has_academy_permission(academy_id,'coaches.manage'));
drop policy if exists academy_coach_availability_write on public.academy_coach_availability;
create policy academy_coach_availability_write on public.academy_coach_availability for all to authenticated
using ((coach_user_id=auth.uid() and exists(select 1 from public.academy_memberships m where m.academy_id=academy_coach_availability.academy_id and m.user_id=auth.uid() and m.role='coach' and m.status='active')) or private.user_has_academy_permission(academy_id,'coaches.manage'))
with check ((coach_user_id=auth.uid() and exists(select 1 from public.academy_memberships m where m.academy_id=academy_coach_availability.academy_id and m.user_id=auth.uid() and m.role='coach' and m.status='active')) or private.user_has_academy_permission(academy_id,'coaches.manage'));
drop policy if exists academy_transfers_read on public.academy_athlete_transfer_requests;
create policy academy_transfers_read on public.academy_athlete_transfer_requests for select to authenticated
using (athlete_user_id=auth.uid() or from_coach_user_id=auth.uid() or to_coach_user_id=auth.uid()
  or private.user_has_academy_permission(academy_id,'transfers.review'));
drop policy if exists academy_announcements_read on public.academy_announcements;
create policy academy_announcements_read on public.academy_announcements for select to authenticated
using (private.user_is_approved_academy_admin(academy_id)
  or exists(select 1 from public.academy_memberships m where m.academy_id=academy_announcements.academy_id and m.user_id=auth.uid() and m.status='active')
  or exists(select 1 from public.academy_guardian_links g where g.academy_id=academy_announcements.academy_id and g.guardian_user_id=auth.uid() and g.status='active' and 'announcements'=any(g.scopes)));
drop policy if exists academy_guardian_links_read on public.academy_guardian_links;
create policy academy_guardian_links_read on public.academy_guardian_links for select to authenticated
using (guardian_user_id=auth.uid() or athlete_user_id=auth.uid() or private.user_has_academy_permission(academy_id,'guardians.manage'));
drop policy if exists academy_reports_read on public.academy_report_exports;
create policy academy_reports_read on public.academy_report_exports for select to authenticated
using (exported_by=auth.uid() or private.user_has_academy_permission(academy_id,'reports.export'));
drop policy if exists academy_seat_requests_read on public.academy_seat_requests;
create policy academy_seat_requests_read on public.academy_seat_requests for select to authenticated
using (coach_user_id=auth.uid() or private.user_has_academy_permission(academy_id,'seats.manage'));
drop policy if exists academy_notification_preferences_read on public.academy_notification_preferences;
create policy academy_notification_preferences_read on public.academy_notification_preferences for select to authenticated
using (user_id=auth.uid() or private.user_is_approved_academy_admin(academy_id));
drop policy if exists academy_notification_preferences_write on public.academy_notification_preferences;
create policy academy_notification_preferences_write on public.academy_notification_preferences for all to authenticated
using (user_id=auth.uid() and exists(
  select 1 from public.academy_memberships m where m.academy_id=academy_notification_preferences.academy_id and m.user_id=auth.uid() and m.status='active'
))
with check (user_id=auth.uid() and exists(
  select 1 from public.academy_memberships m where m.academy_id=academy_notification_preferences.academy_id and m.user_id=auth.uid() and m.status='active'
));
drop policy if exists academy_audit_log_read on public.academy_audit_log;
create policy academy_audit_log_read on public.academy_audit_log for select to authenticated
using (private.user_has_academy_permission(academy_id,'audit.read'));
grant insert,update on public.academy_coach_attendance,public.academy_coach_availability,public.academy_notification_preferences to authenticated;

-- There are intentionally no direct INSERT/UPDATE/DELETE policies for the audit log.
