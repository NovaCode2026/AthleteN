-- Private, per-account history for AI match and monthly reports.
create table if not exists public.ai_intelligence_reports (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  report_type text not null check (report_type in ('match','monthly')),
  subject_role text not null check (subject_role in ('athlete','coach','academy_admin')),
  title text not null,
  period_start date,
  period_end date,
  input_snapshot jsonb not null default '{}'::jsonb,
  content text not null,
  created_at timestamptz not null default now()
);

create index if not exists ai_intelligence_reports_user_created_idx
  on public.ai_intelligence_reports(user_id, created_at desc);

alter table public.ai_intelligence_reports enable row level security;
revoke all on public.ai_intelligence_reports from anon;
grant select, insert, delete on public.ai_intelligence_reports to authenticated;

drop policy if exists "AI reports are readable by their owner" on public.ai_intelligence_reports;
create policy "AI reports are readable by their owner"
  on public.ai_intelligence_reports for select to authenticated
  using ((select auth.uid()) = user_id);

drop policy if exists "AI reports can be created by their owner" on public.ai_intelligence_reports;
create policy "AI reports can be created by their owner"
  on public.ai_intelligence_reports for insert to authenticated
  with check ((select auth.uid()) = user_id);

drop policy if exists "AI reports can be deleted by their owner" on public.ai_intelligence_reports;
create policy "AI reports can be deleted by their owner"
  on public.ai_intelligence_reports for delete to authenticated
  using ((select auth.uid()) = user_id);
