import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const sql=readFileSync(new URL('../supabase/migrations/20261127010000_academy_application_approval_workflow.sql',import.meta.url),'utf8');

test('Academy application workflow is pending-by-default and tenant scoped',()=>{
  assert.match(sql,/status text NOT NULL DEFAULT 'pending'/);
  assert.match(sql,/academy_id uuid NOT NULL REFERENCES public\.academies/);
  assert.match(sql,/athlete_user_id uuid NOT NULL REFERENCES auth\.users/);
  assert.match(sql,/UNIQUE INDEX IF NOT EXISTS academy_application_one_pending_per_athlete|CREATE UNIQUE INDEX IF NOT EXISTS academy_application_one_pending_per_athlete/);
  assert.match(sql,/academy_apply_to_join/);
  assert.match(sql,/academy_review_application/);
  assert.match(sql,/academy_withdraw_application/);
});

test('only Academy Admin may accept/reject and acceptance activates membership',()=>{
  assert.match(sql,/private\.user_is_approved_academy_admin\(v_req\.academy_id\)/);
  assert.match(sql,/p_decision NOT IN \('accepted','rejected'\)/);
  assert.match(sql,/INSERT INTO public\.academy_memberships/);
  assert.match(sql,/UPDATE public\.profiles SET academy_id=v_req\.academy_id/);
  assert.match(sql,/reviewed_by=v_user,reviewed_at=now/);
});

test('application rows are private to applicant and Academy Admin; client writes are RPC-only',()=>{
  assert.match(sql,/ALTER TABLE public\.academy_application_requests ENABLE ROW LEVEL SECURITY/);
  assert.match(sql,/REVOKE ALL ON public\.academy_application_requests FROM PUBLIC,anon,authenticated/);
  assert.match(sql,/USING \(athlete_user_id=auth\.uid\(\) OR private\.user_is_approved_academy_admin\(academy_id\)\)/);
  assert.match(sql,/REVOKE ALL ON FUNCTION public\.academy_review_application/);
  assert.match(sql,/REVOKE ALL ON FUNCTION public\.academy_apply_to_join/);
});
