import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const sql=readFileSync(new URL('../supabase/migrations/20261127000000_academy_assignment_and_self_leave.sql',import.meta.url),'utf8');

test('only approved Academy Admin can assign an athlete Coach',()=>{
  assert.match(sql,/academy_assign_athlete_coach[\s\S]*?private\.user_is_approved_academy_admin\(p_academy_id\)/);
  assert.match(sql,/m\.role='athlete' and m\.status='active'/);
  assert.match(sql,/m\.role='coach' and m\.status='active'/);
  assert.match(sql,/Academy Admin acting as Coach/);
  assert.match(sql,/UPDATE public\.coach_athlete_links[\s\S]*?status='ended'/);
  assert.match(sql,/INSERT INTO public\.coach_athlete_links[\s\S]*?status='active'/);
  assert.match(sql,/REVOKE ALL ON FUNCTION public\.academy_assign_athlete_coach/);
});

test('athlete can leave linked Academy and history is preserved rather than deleted',()=>{
  assert.match(sql,/academy_leave_self[\s\S]*?m\.role='athlete'\s+AND m\.status='active'/);
  assert.match(sql,/SET status='suspended'[\s\S]*?academy_memberships/);
  assert.match(sql,/UPDATE public\.coach_athlete_links[\s\S]*?status='ended'/);
  assert.match(sql,/SET status='withdrawn'[\s\S]*?academy_athlete_transfer_requests/);
  assert.match(sql,/SET academy_id=NULL,coach_user_id=NULL/);
  assert.doesNotMatch(sql,/DELETE FROM public\.(academy_memberships|coach_athlete_links)/i);
  assert.match(sql,/REVOKE ALL ON FUNCTION public\.academy_leave_self/);
});
