\set ON_ERROR_STOP on

-- Fixture users: one approved athlete, one minor with pending approval.
INSERT INTO public.profiles(user_id,full_name,date_of_birth,role)
VALUES
 ('00000000-0000-0000-0000-000000000001','Approved athlete','2000-01-01','athlete'),
 ('00000000-0000-0000-0000-000000000002','Pending minor','2012-01-01','athlete');

INSERT INTO public.age_verifications(user_id,date_of_birth,parent_email,status,token_hash,token_expires_at)
VALUES
 ('00000000-0000-0000-0000-000000000001','2000-01-01',NULL,'approved','hash-approved',now()+interval '1 day'),
 ('00000000-0000-0000-0000-000000000002','2012-01-01','guardian@example.test','pending','hash-pending',now()+interval '1 day');

-- An ordinary authenticated user cannot rewrite or clear their profile DOB.
SET ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000001',false);
DO $$
DECLARE blocked boolean := false;
BEGIN
  BEGIN
    UPDATE public.profiles SET date_of_birth='1999-01-01'
    WHERE user_id='00000000-0000-0000-0000-000000000001';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM LIKE '%Date of birth is locked%' THEN blocked := true; ELSE RAISE; END IF;
  END;
  IF NOT blocked THEN RAISE EXCEPTION 'DOB rewrite was not blocked'; END IF;
END $$;
DO $$
DECLARE blocked boolean := false;
BEGIN
  BEGIN
    UPDATE public.profiles SET date_of_birth=NULL
    WHERE user_id='00000000-0000-0000-0000-000000000001';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM LIKE '%Date of birth is locked%' THEN blocked := true; ELSE RAISE; END IF;
  END;
  IF NOT blocked THEN RAISE EXCEPTION 'DOB clearing was not blocked'; END IF;
END $$;

-- Same-DOB resubmission preserves guardian approval; conflicting DOB is rejected.
DO $$
DECLARE result_status text;
DECLARE blocked boolean := false;
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
END $$;

-- Authenticated clients cannot mutate age verification or read token_hash.
DO $$
DECLARE blocked boolean := false;
BEGIN
  BEGIN
    UPDATE public.age_verifications SET status='approved'
    WHERE user_id='00000000-0000-0000-0000-000000000001';
  EXCEPTION WHEN insufficient_privilege THEN blocked := true;
  END;
  IF NOT blocked THEN RAISE EXCEPTION 'Direct age approval mutation was not blocked'; END IF;
END $$;
DO $$
DECLARE blocked boolean := false;
BEGIN
  BEGIN
    PERFORM token_hash FROM public.age_verifications
    WHERE user_id='00000000-0000-0000-0000-000000000001';
  EXCEPTION WHEN insufficient_privilege THEN blocked := true;
  END;
  IF NOT blocked THEN RAISE EXCEPTION 'token_hash column read was not blocked'; END IF;
END $$;

-- Athlete cannot create a Coach finance account for themselves.
DO $$
DECLARE blocked boolean := false;
BEGIN
  BEGIN
    INSERT INTO public.finance_accounts(owner_user_id,owner_type,name,currency)
    VALUES(auth.uid(),'coach','Unauthorized Coach Finance','INR');
  EXCEPTION WHEN insufficient_privilege THEN blocked := true;
  END;
  IF NOT blocked THEN RAISE EXCEPTION 'Athlete self-enrolled into Coach finance'; END IF;
END $$;

RESET ROLE;

-- A verified Coach with age approval can create and manage their own finance account.
UPDATE public.profiles SET role='coach' WHERE user_id='00000000-0000-0000-0000-000000000001';
SET ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000001',false);
INSERT INTO public.finance_accounts(owner_user_id,owner_type,name,currency)
VALUES(auth.uid(),'coach','Authorized Coach Finance','INR');
DO $$
DECLARE account_id uuid;
BEGIN
  SELECT id INTO account_id FROM public.finance_accounts WHERE owner_user_id=auth.uid() AND owner_type='coach';
  IF account_id IS NULL THEN RAISE EXCEPTION 'Authorized Coach could not see own finance account'; END IF;
  INSERT INTO public.finance_transactions(account_id,user_id,type,amount,category,transaction_date)
  VALUES(account_id,auth.uid(),'income',100,'test',current_date);
END $$;

-- Pending guardian approval blocks finance visibility and writes.
RESET ROLE;
UPDATE public.age_verifications SET status='pending',approved_at=NULL
WHERE user_id='00000000-0000-0000-0000-000000000001';
SET ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000001',false);
DO $$
DECLARE visible_count integer;
DECLARE blocked boolean := false;
BEGIN
  SELECT count(*) INTO visible_count FROM public.finance_accounts WHERE owner_user_id=auth.uid();
  IF visible_count <> 0 THEN RAISE EXCEPTION 'Age-pending Coach can still read finance account'; END IF;
  BEGIN
    INSERT INTO public.finance_transactions(account_id,user_id,type,amount,category,transaction_date)
    SELECT id,auth.uid(),'income',1,'test',current_date FROM public.finance_accounts
    WHERE owner_user_id=auth.uid();
  EXCEPTION WHEN insufficient_privilege THEN blocked := true;
  END;
  IF NOT blocked THEN RAISE EXCEPTION 'Age-pending Coach finance write was not blocked'; END IF;
END $$;

-- Self-service role elevation RPC is unavailable to authenticated clients.
DO $$
BEGIN
  IF has_function_privilege('authenticated','public.switch_my_product_role(text)','EXECUTE') THEN
    RAISE EXCEPTION 'Authenticated role can still call switch_my_product_role';
  END IF;
END $$;

RESET ROLE;
