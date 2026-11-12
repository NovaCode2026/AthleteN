-- REVIEWED DRAFT ONLY — NOT A DEPLOYABLE MIGRATION.
-- Before use, create a real timestamped file with:
--   supabase migration new age_verification_authorization_hardening
-- Then copy this SQL into that generated file and test with the local Supabase stack.
-- Do not apply directly to production while migration history is drifting.

-- Remove all client-side write paths. The service_role server workflow retains its
-- existing privileges and is the only application path that writes these fields.
drop policy if exists "users can create own age verification" on public.age_verifications;
drop policy if exists "users can update own age verification" on public.age_verifications;
drop policy if exists "super admin full access" on public.age_verifications;
drop policy if exists "super admin can read age verifications" on public.age_verifications;

create policy "super admin can read age verifications"
  on public.age_verifications
  for select
  to authenticated
  using (private.is_super_admin());

revoke all on table public.age_verifications from public, anon, authenticated;
grant select (
  id,
  user_id,
  date_of_birth,
  parent_email,
  status,
  token_expires_at,
  approved_at,
  rejected_at,
  created_at,
  updated_at
) on table public.age_verifications to authenticated;

-- Lock profiles.date_of_birth after initial entry as well. This covers direct
-- profile table updates and all clients, not only the age-verification screen.
create or replace function public.prevent_profile_dob_rewrite()
returns trigger
language plpgsql
set search_path = ''
as $function$
begin
  -- Only the trusted database owner and service_role may perform a DOB
  -- correction. Do not use a custom GUC here: client roles can set custom GUCs.
  if current_user not in ('postgres', 'service_role') then
    if tg_op = 'UPDATE' then
      if old.date_of_birth is not null
         and new.date_of_birth is distinct from old.date_of_birth then
        raise exception 'Date of birth is locked after first submission. Contact support to request a correction.';
      end if;
    end if;

    if new.date_of_birth is not null then
      if exists (
        select 1
          from public.age_verifications a
         where a.user_id = new.user_id
           and a.date_of_birth is distinct from new.date_of_birth
      ) then
        raise exception 'Profile date of birth must match the existing age-verification record.';
      end if;
    end if;
  end if;
  return new;
end;
$function$;

drop trigger if exists prevent_profile_dob_rewrite on public.profiles;
create trigger prevent_profile_dob_rewrite
  before update of date_of_birth on public.profiles
  for each row execute function public.prevent_profile_dob_rewrite();

drop trigger if exists prevent_profile_dob_mismatch_insert on public.profiles;
create trigger prevent_profile_dob_mismatch_insert
  before insert on public.profiles
  for each row execute function public.prevent_profile_dob_rewrite();

-- Record the DOB once. Repeating the same DOB is idempotent and preserves the
-- current approval state; a different DOB requires the separate audited support
-- correction process and cannot reset a guardian decision.
create or replace function public.record_age_profile(
  p_date_of_birth date,
  p_parent_email text
)
returns table(status text, age_years integer)
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_user_id uuid := auth.uid();
  v_age integer;
  v_status text;
  v_existing_dob date;
  v_profile_dob date;
  v_parent_email text := lower(btrim(coalesce(p_parent_email, '')));
begin
  if v_user_id is null then
    raise exception 'Authentication required';
  end if;

  if p_date_of_birth is null or p_date_of_birth > current_date then
    raise exception 'A valid date of birth is required.';
  end if;

  v_age := extract(year from age(current_date, p_date_of_birth));
  if v_age < 0 or v_age > 120 then
    raise exception 'Date of birth is outside the supported range.';
  end if;

  select p.date_of_birth
    into v_profile_dob
    from public.profiles p
   where p.user_id = v_user_id
   for update;

  if v_profile_dob is null then
    raise exception 'Complete your profile date of birth before age verification.';
  end if;

  if v_profile_dob is distinct from p_date_of_birth then
    raise exception 'Date of birth is locked after first submission. Contact support to request a correction.';
  end if;
  if v_age < 18 then
    if v_parent_email !~* '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$' then
      raise exception 'A valid parent or guardian email is required for users under 18.';
    end if;
    v_status := 'pending';
  else
    v_parent_email := '';
    v_status := 'not_required';
  end if;

  insert into public.age_verifications(
    user_id,
    date_of_birth,
    parent_email,
    status,
    token_hash,
    token_expires_at,
    approved_at,
    rejected_at,
    updated_at
  )
  values (
    v_user_id,
    p_date_of_birth,
    nullif(v_parent_email, ''),
    v_status,
    null,
    null,
    case when v_status = 'not_required' then now() else null end,
    null,
    now()
  )
  on conflict (user_id) do nothing;

  if not found then
    select a.date_of_birth, a.status
      into v_existing_dob, v_status
      from public.age_verifications a
     where a.user_id = v_user_id
     for update;

    if v_existing_dob is distinct from p_date_of_birth then
      raise exception 'Date of birth is locked after first submission. Contact support to request a correction.';
    end if;

    -- A minor must never retain a bypass state of not_required. This can
    -- occur in legacy rows created before DOB immutability was enforced.
    -- Require a valid parent email above, then return the account to the
    -- server-controlled pending workflow without carrying forward any token.
    if v_age < 18 and v_status = 'not_required' then
      update public.age_verifications
         set status = 'pending',
             parent_email = nullif(v_parent_email, ''),
             token_hash = null,
             token_expires_at = null,
             approved_at = null,
             rejected_at = null,
             updated_at = now()
       where user_id = v_user_id;
      v_status := 'pending';
    end if;

    -- A user who reaches 18 using the immutable recorded DOB no longer needs
    -- guardian approval. This transition is server-owned and does not accept
    -- a caller-supplied approval state.
    if v_age >= 18 and v_status in ('pending', 'rejected') then
      update public.age_verifications
         set status = 'not_required',
             parent_email = null,
             token_hash = null,
             token_expires_at = null,
             approved_at = now(),
             rejected_at = null,
             updated_at = now()
       where user_id = v_user_id;
      v_status := 'not_required';
    end if;

    return query select v_status, v_age;
    return;
  end if;

  return query select v_status, v_age;
end;
$function$;

revoke all on function public.record_age_profile(date, text) from public, anon;
grant execute on function public.record_age_profile(date, text) to authenticated;

-- This legacy RPC returns the raw guardian token to its caller. The current
-- Edge Function creates and emails the token using service_role, so clients
-- must not be able to call this RPC.
revoke all on function public.prepare_parent_approval(text) from public, anon, authenticated;
