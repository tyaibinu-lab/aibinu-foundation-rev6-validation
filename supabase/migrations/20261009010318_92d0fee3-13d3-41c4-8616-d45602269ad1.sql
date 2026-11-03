DO $$
DECLARE A uuid := '514be2cb-54ba-435b-a4cb-505baf0d0a47'; OWN uuid := 'ebdc7c53-f95c-426b-b7df-8d671dc0d72c';
  TB uuid := '21686610-0b2c-4c23-9390-8af207afe763'; J1 uuid := '2daf3b9a-1d61-43e5-a6a4-8dc27855b98c'; J2 uuid := '1f52f5d9-7f4c-4f9b-9347-47ddf45efffe';
  s1 text; s2 text; s3 text;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.organisations WHERE id = A) THEN
    RAISE NOTICE 'fixture organisation absent; skipping embedded self-test';
    RETURN;
  END IF;
  BEGIN
    INSERT INTO ai_credit_transactions(organisation_id,kind,amount,actor_type,reason_code,period_month) VALUES (A,'grant',100,'system','monthly_grant','2026-10-01');
    INSERT INTO ai_credit_transactions(organisation_id,kind,amount,job_id,user_id,actor_type,reason_code) VALUES
      (A,'reserve',30,J1,OWN,'system','job_reserve'),(A,'settle',20,J1,OWN,'worker','job_settle'),(A,'release',10,J1,OWN,'worker','job_release');
    INSERT INTO ai_credit_transactions(organisation_id,kind,amount,actor_id,actor_type,reason_code,external_ref) VALUES (A,'adjust',5,OWN,'user','adjust_credit','r1'),(A,'adjust',3,OWN,'user','adjust_debit','r2');
    INSERT INTO ai_credit_transactions(organisation_id,kind,amount,actor_type,reason_code,period_month) VALUES (A,'expire',4,'system','monthly_expire','2026-09-01');
    -- expected: 100+5-3-4-30+10 = 78 available, consumed 20, held 0
    SELECT available||'/'||consumed||'/'||held INTO s1 FROM ai_credit_balance WHERE organisation_id=A;
    INSERT INTO ai_credit_transactions(organisation_id,kind,amount,job_id,user_id,actor_type,reason_code) VALUES (A,'reserve',6,J2,OWN,'system','job_reserve');
    -- expected: 72/20/6
    SELECT available||'/'||consumed||'/'||held INTO s2 FROM ai_credit_balance WHERE organisation_id=A;
    INSERT INTO ai_credit_transactions(organisation_id,kind,amount,job_id,user_id,actor_type,reason_code) VALUES (A,'refund',2,J1,OWN,'user','job_refund');
    -- expected: 74/20/6
    SELECT available||'/'||consumed||'/'||held INTO s3 FROM ai_credit_balance WHERE organisation_id=A;
    RAISE EXCEPTION 'm4_rollback';
  EXCEPTION WHEN raise_exception THEN IF SQLERRM <> 'm4_rollback' THEN RAISE; END IF; END;
  INSERT INTO m4_test_results VALUES
    ('balance_after_settle_release', s1='78/20/0', s1),
    ('balance_with_open_hold', s2='72/20/6', s2),
    ('balance_after_refund', s3='74/20/6', s3),
    ('ledger_empty_after_recheck', (SELECT count(*)=0 FROM ai_credit_transactions), NULL);
END $$;