\set ON_ERROR_STOP on

-- Fixture users: one approved athlete, one minor with pending approval.
INSERT INTO public.profiles(user_id,full_name,date_of_birth,role)
VALUES
 ('00000000-0000-0000-0000-000000000001','Approved athlete','2000-01-01','athlete'),
 ('00000000-0000-0000-0000-000000000002','Pending minor Coach','2012-01-01','coach'),
 ('00000000-0000-0000-0000-000000000004','Other approved Coach','1998-01-01','coach'),
 ('00000000-0000-0000-0000-000000000005','Approved Academy Admin','1997-01-01','academy_admin'),
 ('00000000-0000-0000-0000-000000000006','Approved linked Athlete','2005-04-05','athlete');

INSERT INTO public.age_verifications(user_id,date_of_birth,parent_email,status,token_hash,token_expires_at)
VALUES
 ('00000000-0000-0000-0000-000000000001','2000-01-01',NULL,'approved','hash-approved',now()+interval '1 day'),
 ('00000000-0000-0000-0000-000000000002','2012-01-01','guardian@example.test','pending','hash-pending',now()+interval '1 day'),
 ('00000000-0000-0000-0000-000000000003','2010-02-03','guardian3@example.test','pending','hash-mismatch',now()+interval '1 day'),
 ('00000000-0000-0000-0000-000000000004','1998-01-01',NULL,'approved','hash-coach-4',now()+interval '1 day'),
 ('00000000-0000-0000-0000-000000000005','1997-01-01',NULL,'approved','hash-academy-5',now()+interval '1 day'),
 ('00000000-0000-0000-0000-000000000006','2005-04-05',NULL,'approved','hash-athlete-6',now()+interval '1 day');

INSERT INTO public.coach_athlete_links(coach_user_id,athlete_user_id,status)
VALUES
 ('00000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000002','active'),
 ('00000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000006','active'),
 ('00000000-0000-0000-0000-000000000002','00000000-0000-0000-0000-000000000006','active');

INSERT INTO public.hydration_logs(user_id,payload) VALUES
 ('00000000-0000-0000-0000-000000000002','pending-athlete hydration'),
 ('00000000-0000-0000-0000-000000000006','approved-athlete hydration');
INSERT INTO public.kyorugi_bouts(user_id,payload) VALUES
 ('00000000-0000-0000-0000-000000000002','pending-athlete bout'),
 ('00000000-0000-0000-0000-000000000006','approved-athlete bout');
INSERT INTO public.kyorugi_training_metrics(user_id,payload) VALUES
 ('00000000-0000-0000-0000-000000000002','pending-athlete kyorugi metric'),
 ('00000000-0000-0000-0000-000000000006','approved-athlete kyorugi metric');
INSERT INTO public.nutrition_logs(user_id,payload) VALUES
 ('00000000-0000-0000-0000-000000000002','pending-athlete nutrition'),
 ('00000000-0000-0000-0000-000000000006','approved-athlete nutrition');
INSERT INTO public.poomsae_performances(user_id,payload) VALUES
 ('00000000-0000-0000-0000-000000000002','pending-athlete poomsae'),
 ('00000000-0000-0000-0000-000000000006','approved-athlete poomsae');
INSERT INTO public.poomsae_training_metrics(user_id,payload) VALUES
 ('00000000-0000-0000-0000-000000000002','pending-athlete poomsae metric'),
 ('00000000-0000-0000-0000-000000000006','approved-athlete poomsae metric');
INSERT INTO public.taekwondo_belt_history(athlete_user_id,payload) VALUES
 ('00000000-0000-0000-0000-000000000002','pending-athlete belt'),
 ('00000000-0000-0000-0000-000000000006','approved-athlete belt');
INSERT INTO public.taekwondo_training_logs(user_id,payload) VALUES
 ('00000000-0000-0000-0000-000000000002','pending-athlete taekwondo log'),
 ('00000000-0000-0000-0000-000000000006','approved-athlete taekwondo log');
INSERT INTO public.taekwondo_weight_category_decisions(athlete_user_id,payload) VALUES
 ('00000000-0000-0000-0000-000000000002','pending-athlete weight category'),
 ('00000000-0000-0000-0000-000000000006','approved-athlete weight category');

-- A legacy minor row must not retain the old not_required bypass state.
UPDATE public.age_verifications
SET status='not_required',approved_at=now(),token_hash='legacy-token',token_expires_at=now()+interval '1 day'
WHERE user_id='00000000-0000-0000-0000-000000000002';

-- An ordinary authenticated user cannot rewrite or clear their profile DOB.
SET ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000001',false);
DO $block$
DECLARE blocked boolean := false;
BEGIN
  BEGIN
    UPDATE public.profiles SET date_of_birth='1999-01-01'
    WHERE user_id='00000000-0000-0000-0000-000000000001';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM LIKE '%Date of birth is locked%' THEN blocked := true; ELSE RAISE; END IF;
  END;
  IF NOT blocked THEN RAISE EXCEPTION 'DOB rewrite was not blocked'; END IF;
END;
$block$;
DO $block$
DECLARE blocked boolean := false;
BEGIN
  BEGIN
    UPDATE public.profiles SET date_of_birth=NULL
    WHERE user_id='00000000-0000-0000-0000-000000000001';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM LIKE '%Date of birth is locked%' THEN blocked := true; ELSE RAISE; END IF;
  END;
  IF NOT blocked THEN RAISE EXCEPTION 'DOB clearing was not blocked'; END IF;
END;
$block$;

-- Same-DOB resubmission preserves guardian approval; conflicting DOB is rejected.
DO $block$
DECLARE result_status text;
        blocked boolean := false;
BEGIN
  SELECT status INTO result_status
  FROM public.record_age_profile('2000-01-01'::date,'');
  IF result_status <> 'approved' THEN RAISE EXCEPTION 'Same-DOB resubmission changed approved state'; END IF;
  BEGIN
    PERFORM * FROM public.record_age_profile('1999-01-01'::date,'');
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM LIKE '%Date of birth is locked%' THEN blocked := true; ELSE RAISE; END IF;
  END;
  IF NOT blocked THEN RAISE EXCEPTION 'Conflicting DOB was not rejected'; END IF;
END;
$block$;

-- A legacy minor not_required row is returned to pending and its old token is cleared.
SELECT set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000002',false);
DO $block$
DECLARE result_status text;
BEGIN
  SELECT status INTO result_status
  FROM public.record_age_profile('2012-01-01'::date,'guardian@example.test');
  IF result_status <> 'pending' THEN
    RAISE EXCEPTION 'Legacy minor not_required state was not returned to pending';
  END IF;
END;
$block$;
RESET ROLE;
SET ROLE postgres;
DO $block$
DECLARE token_value text;
        expiry_value timestamptz;
        approved_value timestamptz;
BEGIN
  SELECT token_hash,token_expires_at,approved_at
    INTO token_value,expiry_value,approved_value
    FROM public.age_verifications
   WHERE user_id='00000000-0000-0000-0000-000000000002';
  IF token_value IS NOT NULL OR expiry_value IS NOT NULL OR approved_value IS NOT NULL THEN
    RAISE EXCEPTION 'Legacy minor approval token or timestamp was not cleared';
  END IF;
END;
$block$;
SET ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000001',false);

-- Profile insert cannot disagree with an existing age-verification DOB.
SELECT set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000003',false);
DO $block$
DECLARE blocked boolean := false;
BEGIN
  BEGIN
    INSERT INTO public.profiles(user_id,full_name,date_of_birth,role)
    VALUES(auth.uid(),'Mismatched DOB','2011-02-03','athlete');
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM LIKE '%must match the existing age-verification record%' THEN blocked := true; ELSE RAISE; END IF;
  END;
  IF NOT blocked THEN RAISE EXCEPTION 'Mismatched profile DOB insert was not blocked'; END IF;
END;
$block$;
SELECT set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000001',false);

-- Authenticated clients cannot mutate age verification or read token_hash.
DO $block$
DECLARE blocked boolean := false;
BEGIN
  BEGIN
    UPDATE public.age_verifications SET status='approved'
    WHERE user_id='00000000-0000-0000-0000-000000000001';
  EXCEPTION WHEN insufficient_privilege THEN blocked := true;
  END;
  IF NOT blocked THEN RAISE EXCEPTION 'Direct age approval mutation was not blocked'; END IF;
END;
$block$;
DO $block$
DECLARE blocked boolean := false;
BEGIN
  BEGIN
    INSERT INTO public.age_verifications(user_id,date_of_birth,status)
    VALUES(auth.uid(),'2000-01-01','approved');
  EXCEPTION WHEN insufficient_privilege THEN blocked := true;
  END;
  IF NOT blocked THEN RAISE EXCEPTION 'Direct age-verification insert was not blocked'; END IF;
END;
$block$;
DO $block$
DECLARE blocked boolean := false;
BEGIN
  BEGIN
    PERFORM token_hash FROM public.age_verifications
    WHERE user_id='00000000-0000-0000-0000-000000000001';
  EXCEPTION WHEN insufficient_privilege THEN blocked := true;
  END;
  IF NOT blocked THEN RAISE EXCEPTION 'token_hash column read was not blocked'; END IF;
END;
$block$;

-- Athlete cannot create a Coach finance account for themselves.
DO $block$
DECLARE blocked boolean := false;
BEGIN
  BEGIN
    INSERT INTO public.finance_accounts(owner_user_id,owner_type,name,currency)
    VALUES(auth.uid(),'coach','Unauthorized Coach Finance','INR');
  EXCEPTION WHEN insufficient_privilege THEN blocked := true;
  END;
  IF NOT blocked THEN RAISE EXCEPTION 'Athlete self-enrolled into Coach finance'; END IF;
END;
$block$;

RESET ROLE;
SET ROLE postgres;

-- A verified Coach with age approval can create and manage their own finance account.
UPDATE public.profiles SET role='coach' WHERE user_id='00000000-0000-0000-0000-000000000001';
SET ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000001',false);
INSERT INTO public.finance_accounts(id,owner_user_id,owner_type,name,currency)
VALUES('10000000-0000-0000-0000-000000000001',auth.uid(),'coach','Authorized Coach Finance','INR');
RESET ROLE;
SET ROLE postgres;
INSERT INTO public.finance_accounts(id,owner_user_id,owner_type,name,currency)
VALUES('10000000-0000-0000-0000-000000000004','00000000-0000-0000-0000-000000000004','coach','Other Coach Finance','INR');
SET ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000001',false);
DO $block$
DECLARE account_id uuid;
BEGIN
  SELECT id INTO account_id FROM public.finance_accounts WHERE owner_user_id=auth.uid() AND owner_type='coach';
  IF account_id IS NULL THEN RAISE EXCEPTION 'Authorized Coach could not see own finance account'; END IF;
  INSERT INTO public.finance_transactions(account_id,user_id,type,amount,category,transaction_date)
  VALUES(account_id,auth.uid(),'income',100,'test',current_date);
  IF EXISTS (SELECT 1 FROM public.finance_accounts WHERE id='10000000-0000-0000-0000-000000000004') THEN
    RAISE EXCEPTION 'Coach can see another Coach finance account';
  END IF;
  BEGIN
    INSERT INTO public.finance_transactions(account_id,user_id,type,amount,category,transaction_date)
    VALUES('10000000-0000-0000-0000-000000000004',auth.uid(),'income',1,'test',current_date);
    RAISE EXCEPTION 'Cross-account finance transaction insert unexpectedly succeeded';
  EXCEPTION WHEN insufficient_privilege THEN
    NULL;
  END;
END;
$block$;

-- Academy Finance requires both an approved account and a verified Academy Admin role.
RESET ROLE;
SET ROLE postgres;
INSERT INTO public.academies(id,owner_user_id,name,status)
VALUES
 ('20000000-0000-0000-0000-000000000004','00000000-0000-0000-0000-000000000004','Unauthorized Coach Academy','active'),
 ('20000000-0000-0000-0000-000000000005','00000000-0000-0000-0000-000000000005','Authorized Academy','active');
INSERT INTO public.academy_memberships(academy_id,user_id,role,status)
VALUES('20000000-0000-0000-0000-000000000005','00000000-0000-0000-0000-000000000005','academy_admin','active');
INSERT INTO public.finance_accounts(id,owner_user_id,academy_id,owner_type,name,currency)
VALUES
 ('20000000-0000-0000-0000-000000000004','00000000-0000-0000-0000-000000000004','20000000-0000-0000-0000-000000000004','academy','Unauthorized Academy Finance','INR');
SET ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000004',false);
DO $block$
DECLARE visible_count integer;
        blocked boolean := false;
BEGIN
  SELECT count(*) INTO visible_count FROM public.finance_accounts
   WHERE id='20000000-0000-0000-0000-000000000004';
  IF visible_count <> 0 THEN RAISE EXCEPTION 'Coach without Academy Admin role can read Academy Finance'; END IF;
  BEGIN
    INSERT INTO public.finance_accounts(owner_user_id,academy_id,owner_type,name,currency)
    VALUES(auth.uid(),'20000000-0000-0000-0000-000000000004','academy','Unauthorized Academy Finance Insert','INR');
  EXCEPTION WHEN insufficient_privilege THEN blocked := true;
  END;
  IF NOT blocked THEN RAISE EXCEPTION 'Coach without Academy Admin role can create Academy Finance'; END IF;
END;
$block$;

RESET ROLE;
SELECT set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000005',false);
SET ROLE authenticated;
DO $block$
DECLARE account_id uuid;
BEGIN
  INSERT INTO public.finance_accounts(id,owner_user_id,academy_id,owner_type,name,currency)
  VALUES('20000000-0000-0000-0000-000000000005',auth.uid(),'20000000-0000-0000-0000-000000000005','academy','Authorized Academy Finance','INR');
  SELECT id INTO account_id FROM public.finance_accounts
   WHERE id='20000000-0000-0000-0000-000000000005';
  IF account_id IS NULL THEN RAISE EXCEPTION 'Verified Academy Admin cannot read own finance account'; END IF;
  INSERT INTO public.finance_transactions(account_id,user_id,type,amount,category,transaction_date)
  VALUES(account_id,auth.uid(),'income',200,'academy-test',current_date);
END;
$block$;

RESET ROLE;
SET ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000001',false);

-- Connected-team reads and management require both the coach and athlete to be approved.
SET ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000001',false);
DO $block$
DECLARE visible_count integer;
BEGIN
  IF public.can_view_athlete('00000000-0000-0000-0000-000000000002') THEN
    RAISE EXCEPTION 'Approved coach can_view_athlete returned true for pending athlete';
  END IF;
  IF private.user_can_manage_athlete('00000000-0000-0000-0000-000000000002') THEN
    RAISE EXCEPTION 'Approved coach user_can_manage_athlete returned true for pending athlete';
  END IF;
  IF NOT public.can_view_athlete('00000000-0000-0000-0000-000000000006') THEN
    RAISE EXCEPTION 'Approved coach cannot view an approved linked athlete';
  END IF;
  IF NOT private.user_can_manage_athlete('00000000-0000-0000-0000-000000000006') THEN
    RAISE EXCEPTION 'Approved coach cannot manage an approved linked athlete';
  END IF;
  SELECT count(*) INTO visible_count FROM public.hydration_logs
   WHERE user_id='00000000-0000-0000-0000-000000000002';
  IF visible_count <> 0 THEN RAISE EXCEPTION 'Pending athlete hydration is visible to coach'; END IF;
  SELECT count(*) INTO visible_count FROM public.nutrition_logs
   WHERE user_id='00000000-0000-0000-0000-000000000002';
  IF visible_count <> 0 THEN RAISE EXCEPTION 'Pending athlete nutrition is visible to coach'; END IF;
  SELECT count(*) INTO visible_count FROM public.kyorugi_bouts
   WHERE user_id='00000000-0000-0000-0000-000000000002';
  IF visible_count <> 0 THEN RAISE EXCEPTION 'Pending athlete Kyorugi data is visible to coach'; END IF;
  SELECT count(*) INTO visible_count FROM public.kyorugi_training_metrics
   WHERE user_id='00000000-0000-0000-0000-000000000002';
  IF visible_count <> 0 THEN RAISE EXCEPTION 'Pending athlete Kyorugi metrics are visible to coach'; END IF;
  SELECT count(*) INTO visible_count FROM public.poomsae_performances
   WHERE user_id='00000000-0000-0000-0000-000000000002';
  IF visible_count <> 0 THEN RAISE EXCEPTION 'Pending athlete Poomsae data is visible to coach'; END IF;
  SELECT count(*) INTO visible_count FROM public.poomsae_training_metrics
   WHERE user_id='00000000-0000-0000-0000-000000000002';
  IF visible_count <> 0 THEN RAISE EXCEPTION 'Pending athlete Poomsae metrics are visible to coach'; END IF;
  SELECT count(*) INTO visible_count FROM public.taekwondo_belt_history
   WHERE athlete_user_id='00000000-0000-0000-0000-000000000002';
  IF visible_count <> 0 THEN RAISE EXCEPTION 'Pending athlete belt history is visible to coach'; END IF;
  SELECT count(*) INTO visible_count FROM public.taekwondo_training_logs
   WHERE user_id='00000000-0000-0000-0000-000000000002';
  IF visible_count <> 0 THEN RAISE EXCEPTION 'Pending athlete Taekwondo logs are visible to coach'; END IF;
  SELECT count(*) INTO visible_count FROM public.taekwondo_weight_category_decisions
   WHERE athlete_user_id='00000000-0000-0000-0000-000000000002';
  IF visible_count <> 0 THEN RAISE EXCEPTION 'Pending athlete weight-category decisions are visible to coach'; END IF;
END;
$block$;

-- A pending Coach cannot use a pre-existing link to view even an approved athlete,
-- and cannot read its own connected-team tables while age approval is pending.
RESET ROLE;
SET ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000002',false);
DO $block$
DECLARE visible_count integer;
BEGIN
  IF public.can_view_athlete('00000000-0000-0000-0000-000000000006') THEN
    RAISE EXCEPTION 'Pending Coach can_view_athlete returned true';
  END IF;
  IF private.user_can_manage_athlete('00000000-0000-0000-0000-000000000006') THEN
    RAISE EXCEPTION 'Pending Coach user_can_manage_athlete returned true';
  END IF;
  SELECT count(*) INTO visible_count FROM public.hydration_logs
   WHERE user_id='00000000-0000-0000-0000-000000000002';
  IF visible_count <> 0 THEN RAISE EXCEPTION 'Pending Coach can read own hydration data before approval'; END IF;
  SELECT count(*) INTO visible_count FROM public.taekwondo_training_logs
   WHERE user_id='00000000-0000-0000-0000-000000000002';
  IF visible_count <> 0 THEN RAISE EXCEPTION 'Pending Coach can read Taekwondo logs before approval'; END IF;
END;
$block$;
RESET ROLE;
SET ROLE postgres;

-- The approved Coach RPC can only return the caller's existing account.
DO $block$
DECLARE account_id uuid;
BEGIN
  account_id := public.get_or_create_my_coach_finance_account();
  IF account_id <> '10000000-0000-0000-0000-000000000001'::uuid THEN
    RAISE EXCEPTION 'Coach finance RPC returned the wrong account';
  END IF;
END;
$block$;

-- Pending guardian approval blocks finance visibility and writes.
RESET ROLE;
SET ROLE postgres;
UPDATE public.age_verifications SET status='pending',approved_at=NULL
WHERE user_id='00000000-0000-0000-0000-000000000001';
SET ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000001',false);
DO $block$
DECLARE visible_count integer;
        blocked boolean := false;
BEGIN
  SELECT count(*) INTO visible_count FROM public.finance_accounts WHERE owner_user_id=auth.uid();
  IF visible_count <> 0 THEN RAISE EXCEPTION 'Age-pending Coach can still read finance account'; END IF;
  BEGIN
    INSERT INTO public.finance_transactions(account_id,user_id,type,amount,category,transaction_date)
    VALUES('10000000-0000-0000-0000-000000000001',auth.uid(),'income',1,'test',current_date);
  EXCEPTION WHEN insufficient_privilege THEN blocked := true;
  END;
  IF NOT blocked THEN RAISE EXCEPTION 'Age-pending Coach finance write was not blocked'; END IF;
END;
$block$;

-- Self-service role elevation RPC is unavailable to authenticated clients.
DO $block$
BEGIN
  IF has_function_privilege('authenticated','public.switch_my_product_role(text)','EXECUTE') THEN
    RAISE EXCEPTION 'Authenticated role can still call switch_my_product_role';
  END IF;
  IF has_function_privilege('authenticated','public.prepare_parent_approval(text)','EXECUTE') THEN
    RAISE EXCEPTION 'Authenticated role can still call raw guardian-token RPC';
  END IF;
END;
$block$;

RESET ROLE;
SET ROLE postgres;
