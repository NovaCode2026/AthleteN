-- Tighten exposed messaging RPCs and coach actions.
-- All RPCs retain authenticated-only execution. Existing caller/ownership checks remain.
create or replace function public.search_messaging_users(p_query text)
returns table(user_id uuid, username text, full_name text, account_code text, academy text, role text, profile_image_path text)
language sql
security definer
set search_path to 'public'
as $function$
  select p.user_id,p.username,p.full_name,p.account_code,p.academy,p.role,p.profile_image_path
  from public.profiles p
  where auth.uid() is not null
    and public.is_age_approved(auth.uid())
    and length(btrim(coalesce(p_query,''))) between 2 and 40
    and p.user_id <> auth.uid()
    and p.username is not null
    and public.is_age_approved(p.user_id)
    and not exists (
      select 1 from public.user_blocks b
      where (b.blocker_user_id=auth.uid() and b.blocked_user_id=p.user_id)
         or (b.blocker_user_id=p.user_id and b.blocked_user_id=auth.uid())
    )
    and (
      lower(p.username) like lower('%'||left(btrim(p_query),40)||'%')
      or lower(coalesce(p.full_name,'')) like lower('%'||left(btrim(p_query),40)||'%')
      or lower(coalesce(p.account_code,'')) like lower('%'||left(btrim(p_query),40)||'%')
    )
  order by
    case when lower(p.username)=lower(btrim(p_query)) then 0
         when lower(coalesce(p.account_code,''))=lower(btrim(p_query)) then 1
         else 2 end,
    p.username
  limit 20;
$function$;

create or replace function public.create_direct_conversation_by_user(p_recipient_id uuid)
returns uuid language plpgsql security definer set search_path to 'public'
as $function$
declare v_user uuid := auth.uid(); v_conversation uuid;
begin
  if v_user is null then raise exception 'Authentication required'; end if;
  if not public.is_age_approved(v_user) then raise exception 'Age approval required before starting conversations'; end if;
  if p_recipient_id is null or p_recipient_id=v_user then raise exception 'Invalid recipient'; end if;
  if not exists(select 1 from public.profiles where user_id=p_recipient_id) then raise exception 'Recipient not found'; end if;
  if not public.is_age_approved(p_recipient_id) then raise exception 'Recipient is not available for messaging'; end if;
  if exists(select 1 from public.user_blocks b where
    (b.blocker_user_id=v_user and b.blocked_user_id=p_recipient_id) or
    (b.blocker_user_id=p_recipient_id and b.blocked_user_id=v_user))
  then raise exception 'Messaging is unavailable between these accounts.'; end if;
  select c.id into v_conversation from public.conversations c
  join public.conversation_members m1 on m1.conversation_id=c.id and m1.user_id=v_user
  join public.conversation_members m2 on m2.conversation_id=c.id and m2.user_id=p_recipient_id
  where c.kind='direct' group by c.id having count(*)=2 limit 1;
  if v_conversation is not null then return v_conversation; end if;
  insert into public.conversations(kind,created_by) values('direct',v_user) returning id into v_conversation;
  insert into public.conversation_members(conversation_id,user_id) values(v_conversation,v_user),(v_conversation,p_recipient_id);
  return v_conversation;
end; $function$;

create or replace function public.create_direct_conversation(p_recipient_email text)
returns uuid language plpgsql security definer set search_path to 'public','auth'
as $function$
declare caller uuid := auth.uid(); recipient uuid; existing_id uuid; conversation_id uuid;
begin
  if caller is null then raise exception 'Authentication required'; end if;
  if not public.is_age_approved(caller) then raise exception 'Age approval required before starting conversations'; end if;
  if p_recipient_email is null or length(trim(p_recipient_email)) not between 3 and 320 then raise exception 'A valid recipient email is required'; end if;
  select id into recipient from auth.users where lower(email)=lower(trim(p_recipient_email)) limit 1;
  if recipient is null then raise exception 'Recipient account not found'; end if;
  if recipient=caller then raise exception 'You cannot message yourself'; end if;
  if not public.is_age_approved(recipient) then raise exception 'Recipient is not available for messaging'; end if;
  if exists(select 1 from public.user_blocks b where
    (b.blocker_user_id=caller and b.blocked_user_id=recipient) or
    (b.blocker_user_id=recipient and b.blocked_user_id=caller))
  then raise exception 'Messaging is unavailable between these accounts.'; end if;
  select c.id into existing_id from public.conversations c
  where c.kind='direct'
    and exists(select 1 from public.conversation_members cm where cm.conversation_id=c.id and cm.user_id=caller)
    and exists(select 1 from public.conversation_members cm where cm.conversation_id=c.id and cm.user_id=recipient)
    and (select count(*) from public.conversation_members cm where cm.conversation_id=c.id)=2
  limit 1;
  if existing_id is not null then return existing_id; end if;
  insert into public.conversations(kind,created_by) values('direct',caller) returning id into conversation_id;
  insert into public.conversation_members(conversation_id,user_id) values(conversation_id,caller),(conversation_id,recipient);
  return conversation_id;
end; $function$;

create or replace function public.add_group_member_by_user(p_conversation_id uuid,p_user_id uuid)
returns void language plpgsql security definer set search_path to 'public'
as $function$
declare v_user uuid := auth.uid();
begin
  if v_user is null then raise exception 'Authentication required'; end if;
  if p_conversation_id is null or p_user_id is null then raise exception 'Conversation and member are required'; end if;
  if not public.is_age_approved(v_user) then raise exception 'Age approval required before using messaging'; end if;
  if not exists(select 1 from public.conversations where id=p_conversation_id and kind='group' and created_by=v_user)
  then raise exception 'Only the group creator can add members'; end if;
  if not exists(select 1 from public.profiles where user_id=p_user_id) then raise exception 'User not found'; end if;
  if not public.is_age_approved(p_user_id) then raise exception 'Member is not available for messaging'; end if;
  if exists(select 1 from public.user_blocks b where
    (b.blocker_user_id=v_user and b.blocked_user_id=p_user_id) or
    (b.blocker_user_id=p_user_id and b.blocked_user_id=v_user))
  then raise exception 'Messaging is unavailable between these accounts.'; end if;
  insert into public.conversation_members(conversation_id,user_id) values(p_conversation_id,p_user_id) on conflict do nothing;
end; $function$;

create or replace function public.add_group_member_by_email(p_conversation_id uuid,p_email text)
returns void language plpgsql security definer set search_path to 'public','auth'
as $function$
declare caller uuid := auth.uid(); member uuid; creator uuid;
begin
  if caller is null then raise exception 'Authentication required'; end if;
  if p_conversation_id is null or p_email is null or length(trim(p_email)) not between 3 and 320
  then raise exception 'Conversation and valid member email are required'; end if;
  if not public.is_age_approved(caller) then raise exception 'Age approval required before using messaging'; end if;
  select created_by into creator from public.conversations where id=p_conversation_id and kind='group';
  if creator is null or creator<>caller then raise exception 'Only the group creator can add members'; end if;
  select id into member from auth.users where lower(email)=lower(trim(p_email)) limit 1;
  if member is null then raise exception 'Member account not found'; end if;
  if not public.is_age_approved(member) then raise exception 'Member is not available for messaging'; end if;
  if exists(select 1 from public.user_blocks b where
    (b.blocker_user_id=caller and b.blocked_user_id=member) or
    (b.blocker_user_id=member and b.blocked_user_id=caller))
  then raise exception 'Messaging is unavailable between these accounts.'; end if;
  insert into public.conversation_members(conversation_id,user_id) values(p_conversation_id,member) on conflict do nothing;
end; $function$;

create or replace function public.hide_my_conversation(p_conversation_id uuid)
returns void language plpgsql security definer set search_path to 'public'
as $function$
declare v_user uuid := auth.uid();
begin
  if v_user is null then raise exception 'Authentication required'; end if;
  if p_conversation_id is null then raise exception 'Conversation is required'; end if;
  if not exists(select 1 from public.conversation_members where conversation_id=p_conversation_id and user_id=v_user)
  then raise exception 'Conversation not found'; end if;
  insert into public.messaging_hidden_conversations(user_id,conversation_id) values(v_user,p_conversation_id)
  on conflict(user_id,conversation_id) do update set hidden_at=now();
end; $function$;

create or replace function public.unblock_messaging_user(p_user_id uuid)
returns void language plpgsql security definer set search_path to 'public'
as $function$
declare v_user uuid := auth.uid();
begin
  if v_user is null then raise exception 'Authentication required'; end if;
  if p_user_id is null or p_user_id=v_user then raise exception 'Invalid user'; end if;
  delete from public.user_blocks where blocker_user_id=v_user and blocked_user_id=p_user_id;
end; $function$;

create or replace function public.cancel_coach_training_session(p_session_id uuid,p_reason text default null)
returns void language plpgsql security definer set search_path to 'public'
as $function$
declare v_user uuid := auth.uid(); v_coach uuid;
begin
  if v_user is null then raise exception 'Authentication required'; end if;
  if p_session_id is null then raise exception 'Training session is required'; end if;
  select g.coach_user_id into v_coach from public.training_group_sessions s
  join public.training_groups g on g.id=s.group_id where s.id=p_session_id;
  if v_coach is null or v_coach<>v_user then raise exception 'Coach access required'; end if;
  update public.training_group_sessions set status='cancelled',notes=nullif(trim(p_reason),''),updated_at=now()
  where id=p_session_id and status<>'cancelled';
end; $function$;

create or replace function public.cancel_coach_training_date(p_date date,p_group_id uuid default null,p_reason text default 'Academy holiday')
returns integer language plpgsql security definer set search_path to 'public'
as $function$
declare v_user uuid := auth.uid(); v_count integer;
begin
  if v_user is null then raise exception 'Authentication required'; end if;
  if p_date is null then raise exception 'Training date is required'; end if;
  update public.training_group_sessions s set status='cancelled',notes=nullif(trim(p_reason),''),updated_at=now()
  from public.training_groups g
  where s.group_id=g.id and g.coach_user_id=v_user and s.session_date=p_date and s.status<>'cancelled'
    and (p_group_id is null or s.group_id=p_group_id);
  get diagnostics v_count=row_count; return v_count;
end; $function$;

create or replace function public.create_coach_extra_training(p_group_id uuid,p_session_date date,p_start_time time,p_duration_minutes integer,p_training_type text,p_title text,p_focus text default null,p_venue text default null,p_notes text default null)
returns uuid language plpgsql security definer set search_path to 'public'
as $function$
declare v_user uuid := auth.uid(); v_id uuid;
begin
  if v_user is null then raise exception 'Authentication required'; end if;
  if p_group_id is null or p_session_date is null or p_start_time is null then raise exception 'Group, date and start time are required'; end if;
  if p_duration_minutes is null or p_duration_minutes not between 15 and 360 then raise exception 'Session duration must be between 15 and 360 minutes'; end if;
  if p_title is null or length(trim(p_title)) not between 1 and 120 then raise exception 'Session title must be between 1 and 120 characters'; end if;
  if not exists(select 1 from public.training_groups where id=p_group_id and coach_user_id=v_user) then raise exception 'Coach access required'; end if;
  insert into public.training_group_sessions(group_id,session_date,start_time,title,status,training_type,venue,notes)
  values(p_group_id,p_session_date,p_start_time,trim(p_title),'scheduled',coalesce(nullif(trim(p_training_type),''),'other'),nullif(trim(p_venue),''),nullif(trim(p_notes),'')) returning id into v_id;
  return v_id;
end; $function$;

create or replace function public.publish_announcement(p_title text,p_body text)
returns uuid language plpgsql security definer set search_path to ''
as $function$
declare v_id uuid; v_uid uuid := auth.uid(); v_title text := btrim(coalesce(p_title,'')); v_body text := btrim(coalesce(p_body,''));
begin
  if v_uid is null then raise exception 'Authentication required'; end if;
  if not private.is_platform_admin() then raise exception 'admin access required'; end if;
  if length(v_title) not between 1 and 160 then raise exception 'Announcement title must be between 1 and 160 characters'; end if;
  if length(v_body) not between 1 and 5000 then raise exception 'Announcement body must be between 1 and 5000 characters'; end if;
  insert into public.announcements(title,body,audience,published_at,created_by)
  values(v_title,v_body,'all',now(),v_uid) returning id into v_id;
  insert into public.notifications(user_id,title,body,notification_type,announcement_id,action_route)
  select p.user_id,v_title,v_body,'announcement',v_id,'/notifications'
  from public.profiles p where p.user_id is not null and public.is_age_approved(p.user_id);
  return v_id;
end; $function$;
