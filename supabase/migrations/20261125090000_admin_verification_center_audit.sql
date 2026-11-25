-- Admin verification center: audited Student proof decisions and private proof review access.
-- This migration deliberately leaves age/guardian approval records on their existing workflow.

create or replace function public.admin_review_student_verification(
  p_verification_id uuid,
  p_status text,
  p_reviewer_notes text default null
)
returns public.student_verifications
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_row public.student_verifications;
  v_notes text := nullif(btrim(coalesce(p_reviewer_notes, '')), '');
begin
  if auth.uid() is null or not private.is_platform_admin() then
    raise exception 'Administrator access required';
  end if;

  if p_verification_id is null then
    raise exception 'VERIFICATION_ID_REQUIRED';
  end if;

  if p_status not in ('approved', 'rejected') then
    raise exception 'INVALID_VERIFICATION_DECISION';
  end if;

  if v_notes is not null and length(v_notes) > 1000 then
    raise exception 'REVIEW_NOTE_TOO_LONG';
  end if;

  select *
    into v_row
  from public.student_verifications
  where id = p_verification_id
  for update;

  if not found then
    raise exception 'VERIFICATION_REQUEST_NOT_FOUND';
  end if;

  if v_row.status <> 'pending' then
    raise exception 'VERIFICATION_REQUEST_ALREADY_REVIEWED';
  end if;

  if p_status = 'approved' and nullif(btrim(coalesce(v_row.file_path, '')), '') is null then
    raise exception 'VERIFICATION_PROOF_REQUIRED';
  end if;

  if p_status = 'rejected' and v_notes is null then
    raise exception 'REJECTION_NOTE_REQUIRED';
  end if;

  update public.student_verifications
  set status = p_status,
      reviewer_notes = v_notes,
      reviewed_by = auth.uid(),
      reviewed_at = now(),
      updated_at = now()
  where id = p_verification_id
  returning * into v_row;

  insert into public.audit_logs (
    actor_user_id, action, entity_table, entity_id, metadata
  )
  values (
    auth.uid(),
    case when p_status = 'approved' then 'student_verification.approved' else 'student_verification.rejected' end,
    'student_verifications',
    v_row.id,
    jsonb_build_object(
      'subject_user_id', v_row.user_id,
      'document_type', v_row.document_type,
      'status', p_status,
      'review_note_present', v_notes is not null
    )
  );

  return v_row;
end;
$function$;

revoke all on function public.admin_review_student_verification(uuid, text, text) from public, anon;
grant execute on function public.admin_review_student_verification(uuid, text, text) to authenticated;

drop policy if exists "Platform admins can read verification proofs" on storage.objects;
create policy "Platform admins can read verification proofs"
  on storage.objects
  for select
  to authenticated
  using (
    bucket_id = 'verification-proofs'
    and (select private.is_platform_admin())
  );

create index if not exists idx_student_verifications_review_queue
  on public.student_verifications(status, created_at desc);
