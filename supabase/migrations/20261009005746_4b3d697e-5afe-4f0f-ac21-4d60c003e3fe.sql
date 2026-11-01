CREATE TABLE public.m4_test_results (k text PRIMARY KEY, v boolean NOT NULL, d text);
REVOKE ALL ON public.m4_test_results FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.m4_test_results TO service_role;
ALTER TABLE public.m4_test_results ENABLE ROW LEVEL SECURITY;
CREATE POLICY m4_test_results_svc ON public.m4_test_results FOR SELECT TO service_role USING (true);

DO $$
DECLARE
  A uuid := '514be2cb-54ba-435b-a4cb-505baf0d0a47'; B uuid := 'c2a5dfec-dde2-4b9c-8dec-f560562cfa81';
  OWN uuid := 'ebdc7c53-f95c-426b-b7df-8d671dc0d72c'; TB uuid := '21686610-0b2c-4c23-9390-8af207afe763';
  J1 uuid := '2daf3b9a-1d61-43e5-a6a4-8dc27855b98c'; J2 uuid := '1f52f5d9-7f4c-4f9b-9347-47ddf45efffe';
  res jsonb := '{}'; n int; bal record;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.organisations WHERE id = A) THEN
    RAISE NOTICE 'fixture organisation absent; skipping embedded self-test';
    RETURN;
  END IF;
  BEGIN
    -- fixtures (as postgres)
    INSERT INTO ai_credit_transactions(organisation_id,kind,amount,actor_type,reason_code,period_month) VALUES (A,'grant',100,'system','monthly_grant','2026-10-01');
    INSERT INTO ai_credit_transactions(organisation_id,kind,amount,job_id,user_id,actor_type,reason_code) VALUES
      (A,'reserve',30,J1,OWN,'system','job_reserve'),(A,'settle',20,J1,OWN,'worker','job_settle'),(A,'release',10,J1,OWN,'worker','job_release');
    INSERT INTO ai_credit_transactions(organisation_id,kind,amount,actor_id,actor_type,reason_code,external_ref) VALUES (A,'adjust',5,OWN,'user','adjust_credit','m4-ref-1');
    INSERT INTO ai_credit_transactions(organisation_id,kind,amount,user_id,actor_type,reason_code) VALUES (A,'grant',7,TB,'system','test_grant');
    INSERT INTO ai_credit_transactions(organisation_id,kind,amount,actor_type,reason_code,period_month) VALUES (B,'grant',50,'system','monthly_grant','2026-10-01');

    SELECT * INTO bal FROM ai_credit_balance WHERE organisation_id=A;
    res := res || jsonb_build_object('balance_formula_orgA', bal.available=85 AND bal.consumed=20 AND bal.held=0);

    -- constraints
    BEGIN INSERT INTO ai_credit_transactions(organisation_id,kind,amount,actor_type,reason_code) VALUES (A,'grant',0,'system','x_bad'); res:=res||'{"amount_positive":false}'; EXCEPTION WHEN check_violation THEN res:=res||'{"amount_positive":true}'; END;
    BEGIN INSERT INTO ai_credit_transactions(organisation_id,kind,amount,actor_type,reason_code) VALUES (A,'reserve',1,'system','job_reserve'); res:=res||'{"reserve_needs_job":false}'; EXCEPTION WHEN check_violation THEN res:=res||'{"reserve_needs_job":true}'; END;
    BEGIN INSERT INTO ai_credit_transactions(organisation_id,kind,amount,job_id,actor_type,reason_code) VALUES (A,'grant',1,J2,'system','test_grant'); res:=res||'{"grant_rejects_job":false}'; EXCEPTION WHEN check_violation THEN res:=res||'{"grant_rejects_job":true}'; END;
    BEGIN INSERT INTO ai_credit_transactions(organisation_id,kind,amount,actor_type,reason_code,external_ref) VALUES (A,'adjust',1,'system','adjust_credit','m4-ref-2'); res:=res||'{"adjust_needs_actor":false}'; EXCEPTION WHEN check_violation THEN res:=res||'{"adjust_needs_actor":true}'; END;
    BEGIN INSERT INTO ai_credit_transactions(organisation_id,kind,amount,actor_id,actor_type,reason_code) VALUES (A,'adjust',1,OWN,'user','other_reason'); res:=res||'{"adjust_reason_restricted":false}'; EXCEPTION WHEN check_violation THEN res:=res||'{"adjust_reason_restricted":true}'; END;
    BEGIN INSERT INTO ai_credit_transactions(organisation_id,kind,amount,actor_type,reason_code) VALUES (A,'grant',1,'system','Bad-Code'); res:=res||'{"reason_code_regex":false}'; EXCEPTION WHEN check_violation THEN res:=res||'{"reason_code_regex":true}'; END;
    BEGIN INSERT INTO ai_credit_transactions(organisation_id,kind,amount,actor_type,reason_code,note) VALUES (A,'grant',1,'system','test_grant',repeat('x',501)); res:=res||'{"note_length":false}'; EXCEPTION WHEN check_violation THEN res:=res||'{"note_length":true}'; END;
    BEGIN INSERT INTO ai_credit_transactions(organisation_id,kind,amount,job_id,actor_type,reason_code) VALUES (A,'reserve',1,'00000000-0000-0000-0000-000000000001','system','job_reserve'); res:=res||'{"job_fk":false}'; EXCEPTION WHEN foreign_key_violation THEN res:=res||'{"job_fk":true}'; END;
    -- duplicates
    BEGIN INSERT INTO ai_credit_transactions(organisation_id,kind,amount,job_id,actor_type,reason_code) VALUES (A,'reserve',5,J1,'system','job_reserve'); res:=res||'{"dup_reserve_rejected":false}'; EXCEPTION WHEN unique_violation THEN res:=res||'{"dup_reserve_rejected":true}'; END;
    BEGIN INSERT INTO ai_credit_transactions(organisation_id,kind,amount,actor_type,reason_code,period_month) VALUES (A,'grant',100,'system','monthly_grant','2026-10-01'); res:=res||'{"dup_monthly_grant_rejected":false}'; EXCEPTION WHEN unique_violation THEN res:=res||'{"dup_monthly_grant_rejected":true}'; END;
    BEGIN INSERT INTO ai_credit_transactions(organisation_id,kind,amount,actor_id,actor_type,reason_code,external_ref) VALUES (A,'adjust',5,OWN,'user','adjust_credit','m4-ref-1'); res:=res||'{"dup_adjust_ref_rejected":false}'; EXCEPTION WHEN unique_violation THEN res:=res||'{"dup_adjust_ref_rejected":true}'; END;
    INSERT INTO ai_credit_transactions(organisation_id,kind,amount,job_id,actor_type,reason_code) VALUES (A,'reserve',5,J2,'system','job_reserve');
    res := res || '{"reserve_other_job_ok":true}';

    -- append-only as table owner
    BEGIN UPDATE ai_credit_transactions SET amount=1; res:=res||'{"owner_update_blocked":false}'; EXCEPTION WHEN raise_exception THEN res:=res||'{"owner_update_blocked":true}'; END;
    BEGIN DELETE FROM ai_credit_transactions; res:=res||'{"owner_delete_blocked":false}'; EXCEPTION WHEN raise_exception THEN res:=res||'{"owner_delete_blocked":true}'; END;
    BEGIN TRUNCATE ai_credit_transactions; res:=res||'{"owner_truncate_blocked":false}'; EXCEPTION WHEN raise_exception THEN res:=res||'{"owner_truncate_blocked":true}'; END;

    -- service_role
    SET LOCAL ROLE service_role;
    BEGIN INSERT INTO ai_credit_transactions(organisation_id,kind,amount,actor_type,reason_code) VALUES (B,'grant',1,'service_role','test_grant'); res:=res||'{"svc_insert_ok":true}'; EXCEPTION WHEN OTHERS THEN res:=res||jsonb_build_object('svc_insert_ok',false,'svc_insert_err',SQLERRM); END;
    BEGIN UPDATE ai_credit_transactions SET amount=1; res:=res||'{"svc_update_denied":false}'; EXCEPTION WHEN insufficient_privilege OR raise_exception THEN res:=res||'{"svc_update_denied":true}'; END;
    BEGIN DELETE FROM ai_credit_transactions; res:=res||'{"svc_delete_denied":false}'; EXCEPTION WHEN insufficient_privilege OR raise_exception THEN res:=res||'{"svc_delete_denied":true}'; END;
    BEGIN TRUNCATE ai_credit_transactions; res:=res||'{"svc_truncate_denied":false}'; EXCEPTION WHEN insufficient_privilege OR raise_exception THEN res:=res||'{"svc_truncate_denied":true}'; END;
    RESET ROLE;

    -- anon
    SET LOCAL ROLE anon;
    BEGIN PERFORM 1 FROM ai_credit_transactions; res:=res||'{"anon_select_denied":false}'; EXCEPTION WHEN insufficient_privilege THEN res:=res||'{"anon_select_denied":true}'; END;
    BEGIN PERFORM 1 FROM ai_credit_balance; res:=res||'{"anon_view_denied":false}'; EXCEPTION WHEN insufficient_privilege THEN res:=res||'{"anon_view_denied":true}'; END;
    BEGIN INSERT INTO ai_credit_transactions(organisation_id,kind,amount,actor_type,reason_code) VALUES (A,'grant',1,'user','test_grant'); res:=res||'{"anon_insert_denied":false}'; EXCEPTION WHEN insufficient_privilege THEN res:=res||'{"anon_insert_denied":true}'; END;
    RESET ROLE;

    -- authenticated: owner in Org A
    PERFORM set_config('request.jwt.claims', json_build_object('sub',OWN,'role','authenticated')::text, true);
    PERFORM set_config('request.headers', json_build_object('x-organisation-id',A)::text, true);
    SET LOCAL ROLE authenticated;
    res := res || jsonb_build_object('owner_has_ai_manage', has_permission('ai.manage'));
    SELECT count(*) INTO n FROM ai_credit_transactions; res := res || jsonb_build_object('owner_sees_orgA_only', n=7 AND NOT EXISTS(SELECT 1 FROM ai_credit_transactions WHERE organisation_id<>A), 'owner_rows', n);
    SELECT * INTO bal FROM ai_credit_balance; res := res || jsonb_build_object('owner_view_orgA', bal.organisation_id=A AND bal.available=80 AND bal.consumed=20 AND bal.held=5, 'owner_view_rows', (SELECT count(*) FROM ai_credit_balance));
    BEGIN INSERT INTO ai_credit_transactions(organisation_id,kind,amount,actor_type,reason_code) VALUES (A,'grant',1,'user','test_grant'); res:=res||'{"auth_insert_denied":false}'; EXCEPTION WHEN insufficient_privilege THEN res:=res||'{"auth_insert_denied":true}'; END;
    BEGIN UPDATE ai_credit_transactions SET amount=1; res:=res||'{"auth_update_denied":false}'; EXCEPTION WHEN insufficient_privilege THEN res:=res||'{"auth_update_denied":true}'; END;
    BEGIN DELETE FROM ai_credit_transactions; res:=res||'{"auth_delete_denied":false}'; EXCEPTION WHEN insufficient_privilege THEN res:=res||'{"auth_delete_denied":true}'; END;
    RESET ROLE;
    -- forged Org B header
    PERFORM set_config('request.headers', json_build_object('x-organisation-id',B)::text, true);
    SET LOCAL ROLE authenticated;
    SELECT count(*) INTO n FROM ai_credit_transactions; res := res || jsonb_build_object('forged_orgB_zero', n=0, 'forged_view_zero', (SELECT count(*) FROM ai_credit_balance)=0);
    RESET ROLE;
    -- missing header
    PERFORM set_config('request.headers', '{}', true);
    SET LOCAL ROLE authenticated;
    SELECT count(*) INTO n FROM ai_credit_transactions; res := res || jsonb_build_object('missing_org_zero', n=0);
    RESET ROLE;
    -- Teacher B in Org A
    PERFORM set_config('request.jwt.claims', json_build_object('sub',TB,'role','authenticated')::text, true);
    PERFORM set_config('request.headers', json_build_object('x-organisation-id',A)::text, true);
    SET LOCAL ROLE authenticated;
    res := res || jsonb_build_object('teacherb_has_ai_manage', has_permission('ai.manage'));
    SELECT count(*) INTO n FROM ai_credit_transactions;
    res := res || jsonb_build_object('teacherb_own_rows_only', n=1 AND NOT EXISTS(SELECT 1 FROM ai_credit_transactions WHERE user_id IS DISTINCT FROM TB),
      'teacherb_view_own', (SELECT available=7 FROM ai_credit_balance));
    RESET ROLE;

    RAISE EXCEPTION 'm4_rollback';
  EXCEPTION WHEN raise_exception THEN
    IF SQLERRM <> 'm4_rollback' THEN RAISE; END IF;
  END;
  INSERT INTO public.m4_test_results(k,v,d)
    SELECT key, CASE WHEN jsonb_typeof(value)='boolean' THEN value::text::boolean ELSE true END, value::text FROM jsonb_each(res);
  INSERT INTO public.m4_test_results VALUES ('ledger_empty_after_rollback', (SELECT count(*)=0 FROM ai_credit_transactions), NULL);
END $$;