create extension if not exists pgcrypto;

create table if not exists public.age_verifications (
  id uuid primary key default gen_random_uuid(), user_id uuid not null unique references auth.users(id) on delete cascade,
  date_of_birth date not null, parent_email text,
  status text not null default 'not_required' check (status in ('not_required','pending','approved','rejected')),
  token_hash text, token_expires_at timestamptz, approved_at timestamptz, rejected_at timestamptz,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  constraint age_verifications_parent_email_check check (status in ('not_required','approved','rejected') or parent_email ~* '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$')
);
create index if not exists age_verifications_status_idx on public.age_verifications(status);
create index if not exists age_verifications_token_hash_idx on public.age_verifications(token_hash) where token_hash is not null;
alter table public.age_verifications enable row level security;
create policy "users can read own age verification" on public.age_verifications for select to authenticated using ((select auth.uid()) = user_id);
create policy "users can create own age verification" on public.age_verifications for insert to authenticated with check ((select auth.uid()) = user_id);
create policy "users can update own age verification" on public.age_verifications for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);

create table if not exists public.reserved_usernames (username text primary key, reason text, created_at timestamptz not null default now());
alter table public.reserved_usernames enable row level security;
create policy "authenticated can read reserved usernames" on public.reserved_usernames for select to authenticated using (true);
insert into public.reserved_usernames(username,reason) values ('novacode.admin','Official NovaCode support account') on conflict (username) do update set reason=excluded.reason;

create or replace function public.prevent_reserved_username() returns trigger language plpgsql security definer set search_path=public as $$
begin
  if new.username is not null and exists(select 1 from public.reserved_usernames where username=lower(btrim(new.username))) then
    if not exists(select 1 from public.profiles where user_id=new.user_id and role in ('admin','super_admin')) then raise exception 'This username is reserved for an official account.'; end if;
  end if;
  return new;
end; $$;
revoke all on function public.prevent_reserved_username() from public;
grant execute on function public.prevent_reserved_username() to authenticated;
drop trigger if exists profiles_reserved_username_guard on public.profiles;
create trigger profiles_reserved_username_guard before insert or update of username on public.profiles for each row execute function public.prevent_reserved_username();

create table if not exists public.user_blocks (
  blocker_user_id uuid not null references auth.users(id) on delete cascade,
  blocked_user_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(), primary key(blocker_user_id,blocked_user_id), constraint user_blocks_not_self check(blocker_user_id<>blocked_user_id)
);
alter table public.user_blocks enable row level security;
create policy "users can read own blocks" on public.user_blocks for select to authenticated using ((select auth.uid())=blocker_user_id);
create policy "users can create own blocks" on public.user_blocks for insert to authenticated with check ((select auth.uid())=blocker_user_id);
create policy "users can delete own blocks" on public.user_blocks for delete to authenticated using ((select auth.uid())=blocker_user_id);

create table if not exists public.message_reports (
  id uuid primary key default gen_random_uuid(), reporter_user_id uuid not null references auth.users(id) on delete cascade,
  reported_user_id uuid references auth.users(id) on delete set null, conversation_id uuid references public.conversations(id) on delete set null,
  message_id uuid references public.messages(id) on delete set null, reason text not null check(reason in ('spam','harassment','inappropriate','safety','other')),
  details text, status text not null default 'open' check(status in ('open','reviewing','resolved','dismissed')), created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create index if not exists message_reports_reporter_idx on public.message_reports(reporter_user_id,created_at desc);
create index if not exists message_reports_status_idx on public.message_reports(status,created_at desc);
alter table public.message_reports enable row level security;
create policy "users can create own message reports" on public.message_reports for insert to authenticated with check ((select auth.uid())=reporter_user_id);
create policy "users can read own message reports" on public.message_reports for select to authenticated using ((select auth.uid())=reporter_user_id);
create policy "admins can read message reports" on public.message_reports for select to authenticated using ((select private.is_platform_admin()));

create or replace function public.search_messaging_users(p_query text) returns table(user_id uuid,username text,full_name text,academy text,role text) language sql security definer set search_path=public as $$
select p.user_id,p.username,p.full_name,p.academy,p.role from public.profiles p where p.user_id<>(select auth.uid()) and p.username is not null and lower(p.username) like lower('%'||left(btrim(p_query),40)||'%') and not exists(select 1 from public.user_blocks b where (b.blocker_user_id=(select auth.uid()) and b.blocked_user_id=p.user_id) or (b.blocker_user_id=p.user_id and b.blocked_user_id=(select auth.uid()))) order by case when lower(p.username)=lower(btrim(p_query)) then 0 else 1 end,p.username limit 20; $$;

create or replace function public.create_direct_conversation_by_user(p_recipient_id uuid) returns uuid language plpgsql security definer set search_path=public as $$
declare v_user uuid:=auth.uid(); v_conversation uuid;
begin
 if v_user is null then raise exception 'Authentication required'; end if;
 if p_recipient_id is null or p_recipient_id=v_user then raise exception 'Invalid recipient'; end if;
 if exists(select 1 from public.user_blocks b where (b.blocker_user_id=v_user and b.blocked_user_id=p_recipient_id) or (b.blocker_user_id=p_recipient_id and b.blocked_user_id=v_user)) then raise exception 'Messaging is unavailable between these accounts.'; end if;
 if not exists(select 1 from public.profiles where user_id=p_recipient_id) then raise exception 'Recipient not found'; end if;
 select c.id into v_conversation from public.conversations c join public.conversation_members m1 on m1.conversation_id=c.id and m1.user_id=v_user join public.conversation_members m2 on m2.conversation_id=c.id and m2.user_id=p_recipient_id where c.kind='direct' group by c.id having count(*)=2 limit 1;
 if v_conversation is not null then return v_conversation; end if;
 insert into public.conversations(kind,created_by) values('direct',v_user) returning id into v_conversation;
 insert into public.conversation_members(conversation_id,user_id) values(v_conversation,v_user),(v_conversation,p_recipient_id);
 return v_conversation;
end; $$;

create or replace function public.get_age_verification_status() returns table(date_of_birth date,parent_email text,status text,token_expires_at timestamptz,approved_at timestamptz) language sql security definer stable set search_path=public as $$ select a.date_of_birth,a.parent_email,a.status,a.token_expires_at,a.approved_at from public.age_verifications a where a.user_id=(select auth.uid()); $$;
revoke all on function public.get_age_verification_status() from public,anon;
grant execute on function public.get_age_verification_status() to authenticated;

create or replace function public.record_age_profile(p_date_of_birth date,p_parent_email text) returns table(status text,age_years integer) language plpgsql security definer set search_path=public as $$
declare v_age integer; v_status text; v_parent text:=lower(btrim(coalesce(p_parent_email,'')));
begin
 if auth.uid() is null then raise exception 'Authentication required'; end if;
 if p_date_of_birth is null or p_date_of_birth>current_date then raise exception 'A valid date of birth is required.'; end if;
 v_age:=extract(year from age(current_date,p_date_of_birth)); if v_age<0 or v_age>120 then raise exception 'Date of birth is outside the supported range.'; end if;
 if v_age<18 then if v_parent!~* '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$' then raise exception 'A parent or guardian email is required for users under 18.'; end if; v_status:='pending'; else v_parent:=null; v_status:='not_required'; end if;
 insert into public.age_verifications(user_id,date_of_birth,parent_email,status,token_hash,token_expires_at,approved_at,rejected_at,updated_at) values(auth.uid(),p_date_of_birth,nullif(v_parent,''),v_status,null,null,case when v_status='not_required' then now() else null end,null,now()) on conflict(user_id) do update set date_of_birth=excluded.date_of_birth,parent_email=excluded.parent_email,status=excluded.status,token_hash=null,token_expires_at=null,approved_at=excluded.approved_at,rejected_at=null,updated_at=now();
 return query select v_status,v_age;
end; $$;
revoke all on function public.record_age_profile(date,text) from public,anon;
grant execute on function public.record_age_profile(date,text) to authenticated;

create or replace function public.is_age_approved(p_user_id uuid) returns boolean language sql security definer stable set search_path=public as $$ select exists(select 1 from public.age_verifications a where a.user_id=p_user_id and a.status in ('approved','not_required')); $$;
revoke all on function public.is_age_approved(uuid) from public,anon;
grant execute on function public.is_age_approved(uuid) to authenticated;

insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types) values('avatars','avatars',false,2097152,array['image/jpeg','image/png','image/webp']) on conflict(id) do update set public=false,file_size_limit=2097152,allowed_mime_types=array['image/jpeg','image/png','image/webp'];
create policy "avatars owner read" on storage.objects for select to authenticated using(bucket_id='avatars' and (storage.foldername(name))[1]=(select auth.uid())::text);
create policy "avatars owner insert" on storage.objects for insert to authenticated with check(bucket_id='avatars' and (storage.foldername(name))[1]=(select auth.uid())::text);
create policy "avatars owner update" on storage.objects for update to authenticated using(bucket_id='avatars' and (storage.foldername(name))[1]=(select auth.uid())::text) with check(bucket_id='avatars' and (storage.foldername(name))[1]=(select auth.uid())::text);
create policy "avatars owner delete" on storage.objects for delete to authenticated using(bucket_id='avatars' and (storage.foldername(name))[1]=(select auth.uid())::text);

DO $$ declare t text; begin foreach t in array array['academies','academy_memberships','ai_usage_events','announcements','athlete_badges','attendance_records','audit_logs','calendar_events','certificates','competition_checklists','conversation_members','conversations','documents','feature_flags','feedback_items','goals','injuries','instagram_connections','instagram_discovery_connections','instagram_discovery_oauth_states','instagram_oauth_states','matches','medals','messages','notifications','payment_events','payment_orders','referrals','roadmap_items','roadmap_votes','student_verifications','subscription_usage','subscriptions','support_tickets','tournament_scans','tournaments','training_plans','training_sessions','weight_logs'] loop execute format('create policy %I on public.%I as restrictive for all to authenticated using ((select public.is_age_approved((select auth.uid()))) or (select private.is_platform_admin())) with check ((select public.is_age_approved((select auth.uid()))) or (select private.is_platform_admin()))','age approval required',t); end loop; end $$;
