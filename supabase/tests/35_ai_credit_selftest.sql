-- 35_ai_credit_selftest.sql — AI Governance M4 credit-ledger self-test.
-- R0 (F-01): relocated from migrations 20261009005746 and 20261009010318,
-- which are now no-ops. Run AFTER the full migration chain, as the database
-- owner (postgres), against a DISPOSABLE database only:
--   psql -X -v ON_ERROR_STOP=1 -d rev6_disposable_<name> -f supabase/tests/35_ai_credit_selftest.sql
-- Self-contained: creates its own synthetic orgs/users/jobs (reserved
-- 00000000-0000-0000-0000-000000035xxx ids), never reads existing records,
-- and ROLLs BACK everything at the end. Fails (non-zero exit) on any false check.
\set ON_ERROR_STOP on
BEGIN;

DO $$ BEGIN
  IF left(current_database(), 16) <> 'rev6_disposable_' THEN
    RAISE EXCEPTION 'refusing to run: database % is not rev6_disposable_*', current_database();
  END IF;
  IF inet_server_addr() IS NOT NULL AND NOT inet_server_addr() <<= '127.0.0.0/8'::inet
     AND inet_server_addr() <> '::1'::inet THEN
    RAISE EXCEPTION 'refusing to run: server address is not local';
  END IF;
END $$;

-- Synthetic fixtures (rolled back at end).
INSERT INTO auth.users (id, email, email_confirmed_at, raw_user_meta_data) VALUES
 ('00000000-0000-0000-0000-000000035a01','m4-owner@selftest.invalid',  now(), '{"full_name":"M4 Owner"}'),
 ('00000000-0000-0000-0000-000000035a02','m4-teacher@selftest.invalid',now(), '{"full_name":"M4 Teacher"}');
UPDATE public.users SET status='active'
 WHERE id IN ('00000000-0000-0000-0000-000000035a01','00000000-0000-0000-0000-000000035a02');
INSERT INTO public.organisations (id,name,type,slug) VALUES
 ('00000000-0000-0000-0000-000000035000','M4 Selftest A','school','m4-selftest-a'),
 ('00000000-0000-0000-0000-000000035001','M4 Selftest B','school','m4-selftest-b');
INSERT INTO public.organisation_memberships (organisation_id,user_id,role_id,status)
SELECT '00000000-0000-0000-0000-000000035000', m.u, r.id, 'active'
FROM (VALUES ('00000000-0000-0000-0000-000000035a01'::uuid,'org_owner'),
             ('00000000-0000-0000-0000-000000035a02'::uuid,'teacher')) m(u,code)
JOIN public.roles r ON r.code=m.code AND r.organisation_id IS NULL;
-- Synthetic disabled model so jobs satisfy ai_jobs_governed_chk (M6a).
INSERT INTO public.ai_model_registry (id,provider,provider_model,state,safety_classes,context_tokens)
VALUES ('m4-selftest-model','selftest','none','disabled','{staff_generation}',1000);
INSERT INTO public.ai_jobs (id,organisation_id,type,input,requested_by,status,agent_code,model_id,prompt_template_id,estimated_credits)
SELECT j.id,'00000000-0000-0000-0000-000000035000','generate_note','{}','00000000-0000-0000-0000-000000035a01','queued',
       'lesson_note','m4-selftest-model',t.id,1
FROM (VALUES ('00000000-0000-0000-0000-000000035b01'::uuid),('00000000-0000-0000-0000-000000035b02'::uuid)) j(id)
CROSS JOIN (SELECT id FROM public.ai_prompt_templates WHERE job_type='generate_note' AND state='active') t;
DO $$ BEGIN IF (SELECT count(*) FROM public.ai_jobs WHERE id IN ('00000000-0000-0000-0000-000000035b01','00000000-0000-0000-0000-000000035b02'))<>2
  THEN RAISE EXCEPTION 'fixture jobs not created'; END IF; END $$;

DO $$
DECLARE
  A uuid := '00000000-0000-0000-0000-000000035000'; B uuid := '00000000-0000-0000-0000-000000035001';
  OWN uuid := '00000000-0000-0000-0000-000000035a01'; TB uuid := '00000000-0000-0000-0000-000000035a02';
  J1 uuid := '00000000-0000-0000-0000-000000035b01'; J2 uuid := '00000000-0000-0000-0000-000000035b02';
  res jsonb := '{}'; n int; bal record; s1 text; s2 text; s3 text; k text; v jsonb; bad text := '';
BEGIN
  -- ===== Part 1 (was 20261009005746): constraints, append-only, roles, RLS =====
  BEGIN
    INSERT INTO ai_credit_transactions(organisation_id,kind,amount,actor_type,reason_code,period_month) VALUES (A,'grant',100,'system','monthly_grant','2026-10-01');
    INSERT INTO ai_credit_transactions(organisation_id,kind,amount,job_id,user_id,actor_type,reason_code) VALUES
      (A,'reserve',30,J1,OWN,'system','job_reserve'),(A,'settle',20,J1,OWN,'worker','job_settle'),(A,'release',10,J1,OWN,'worker','job_release');
    INSERT INTO ai_credit_transactions(organisation_id,kind,amount,actor_id,actor_type,reason_code,external_ref) VALUES (A,'adjust',5,OWN,'user','adjust_credit','m4-ref-1');
    INSERT INTO ai_credit_transactions(organisation_id,kind,amount,user_id,actor_type,reason_code) VALUES (A,'grant',7,TB,'system','test_grant');
    INSERT INTO ai_credit_transactions(organisation_id,kind,amount,actor_type,reason_code,period_month) VALUES (B,'grant',50,'system','monthly_grant','2026-10-01');

    SELECT * INTO bal FROM ai_credit_balance WHERE organisation_id=A;
    res := res || jsonb_build_object('balance_formula_orgA', bal.available=85 AND bal.consumed=20 AND bal.held=0);

    BEGIN INSERT INTO ai_credit_transactions(organisation_id,kind,amount,actor_type,reason_code) VALUES (A,'grant',0,'system','x_bad'); res:=res||'{"amount_positive":false}'; EXCEPTION WHEN check_violation THEN res:=res||'{"amount_positive":true}'; END;
    BEGIN INSERT INTO ai_credit_transactions(organisation_id,kind,amount,actor_type,reason_code) VALUES (A,'reserve',1,'system','job_reserve'); res:=res||'{"reserve_needs_job":false}'; EXCEPTION WHEN check_violation THEN res:=res||'{"reserve_needs_job":true}'; END;
    BEGIN INSERT INTO ai_credit_transactions(organisation_id,kind,amount,job_id,actor_type,reason_code) VALUES (A,'grant',1,J2,'system','test_grant'); res:=res||'{"grant_rejects_job":false}'; EXCEPTION WHEN check_violation THEN res:=res||'{"grant_rejects_job":true}'; END;
    BEGIN INSERT INTO ai_credit_transactions(organisation_id,kind,amount,actor_type,reason_code,external_ref) VALUES (A,'adjust',1,'system','adjust_credit','m4-ref-2'); res:=res||'{"adjust_needs_actor":false}'; EXCEPTION WHEN check_violation THEN res:=res||'{"adjust_needs_actor":true}'; END;
    BEGIN INSERT INTO ai_credit_transactions(organisation_id,kind,amount,actor_id,actor_type,reason_code) VALUES (A,'adjust',1,OWN,'user','other_reason'); res:=res||'{"adjust_reason_restricted":false}'; EXCEPTION WHEN check_violation THEN res:=res||'{"adjust_reason_restricted":true}'; END;
    BEGIN INSERT INTO ai_credit_transactions(organisation_id,kind,amount,actor_type,reason_code) VALUES (A,'grant',1,'system','Bad-Code'); res:=res||'{"reason_code_regex":false}'; EXCEPTION WHEN check_violation THEN res:=res||'{"reason_code_regex":true}'; END;
    BEGIN INSERT INTO ai_credit_transactions(organisation_id,kind,amount,actor_type,reason_code,note) VALUES (A,'grant',1,'system','test_grant',repeat('x',501)); res:=res||'{"note_length":false}'; EXCEPTION WHEN check_violation THEN res:=res||'{"note_length":true}'; END;
    BEGIN INSERT INTO ai_credit_transactions(organisation_id,kind,amount,job_id,actor_type,reason_code) VALUES (A,'reserve',1,'00000000-0000-0000-0000-000000000001','system','job_reserve'); res:=res||'{"job_fk":false}'; EXCEPTION WHEN foreign_key_violation THEN res:=res||'{"job_fk":true}'; END;
    BEGIN INSERT INTO ai_credit_transactions(organisation_id,kind,amount,job_id,actor_type,reason_code) VALUES (A,'reserve',5,J1,'system','job_reserve'); res:=res||'{"dup_reserve_rejected":false}'; EXCEPTION WHEN unique_violation THEN res:=res||'{"dup_reserve_rejected":true}'; END;
    BEGIN INSERT INTO ai_credit_transactions(organisation_id,kind,amount,actor_type,reason_code,period_month) VALUES (A,'grant',100,'system','monthly_grant','2026-10-01'); res:=res||'{"dup_monthly_grant_rejected":false}'; EXCEPTION WHEN unique_violation THEN res:=res||'{"dup_monthly_grant_rejected":true}'; END;
    BEGIN INSERT INTO ai_credit_transactions(organisation_id,kind,amount,actor_id,actor_type,reason_code,external_ref) VALUES (A,'adjust',5,OWN,'user','adjust_credit','m4-ref-1'); res:=res||'{"dup_adjust_ref_rejected":false}'; EXCEPTION WHEN unique_violation THEN res:=res||'{"dup_adjust_ref_rejected":true}'; END;
    INSERT INTO ai_credit_transactions(organisation_id,kind,amount,job_id,actor_type,reason_code) VALUES (A,'reserve',5,J2,'system','job_reserve');
    res := res || '{"reserve_other_job_ok":true}';

    BEGIN UPDATE ai_credit_transactions SET amount=1; res:=res||'{"owner_update_blocked":false}'; EXCEPTION WHEN raise_exception THEN res:=res||'{"owner_update_blocked":true}'; END;
    BEGIN DELETE FROM ai_credit_transactions; res:=res||'{"owner_delete_blocked":false}'; EXCEPTION WHEN raise_exception THEN res:=res||'{"owner_delete_blocked":true}'; END;
    BEGIN TRUNCATE ai_credit_transactions; res:=res||'{"owner_truncate_blocked":false}'; EXCEPTION WHEN raise_exception THEN res:=res||'{"owner_truncate_blocked":true}'; END;

    SET LOCAL ROLE service_role;
    BEGIN INSERT INTO ai_credit_transactions(organisation_id,kind,amount,actor_type,reason_code) VALUES (B,'grant',1,'service_role','test_grant'); res:=res||'{"svc_insert_ok":true}'; EXCEPTION WHEN OTHERS THEN res:=res||jsonb_build_object('svc_insert_ok',false); END;
    BEGIN UPDATE ai_credit_transactions SET amount=1; res:=res||'{"svc_update_denied":false}'; EXCEPTION WHEN insufficient_privilege OR raise_exception THEN res:=res||'{"svc_update_denied":true}'; END;
    BEGIN DELETE FROM ai_credit_transactions; res:=res||'{"svc_delete_denied":false}'; EXCEPTION WHEN insufficient_privilege OR raise_exception THEN res:=res||'{"svc_delete_denied":true}'; END;
    BEGIN TRUNCATE ai_credit_transactions; res:=res||'{"svc_truncate_denied":false}'; EXCEPTION WHEN insufficient_privilege OR raise_exception THEN res:=res||'{"svc_truncate_denied":true}'; END;
    RESET ROLE;

    SET LOCAL ROLE anon;
    BEGIN PERFORM 1 FROM ai_credit_transactions; res:=res||'{"anon_select_denied":false}'; EXCEPTION WHEN insufficient_privilege THEN res:=res||'{"anon_select_denied":true}'; END;
    BEGIN PERFORM 1 FROM ai_credit_balance; res:=res||'{"anon_view_denied":false}'; EXCEPTION WHEN insufficient_privilege THEN res:=res||'{"anon_view_denied":true}'; END;
    BEGIN INSERT INTO ai_credit_transactions(organisation_id,kind,amount,actor_type,reason_code) VALUES (A,'grant',1,'user','test_grant'); res:=res||'{"anon_insert_denied":false}'; EXCEPTION WHEN insufficient_privilege THEN res:=res||'{"anon_insert_denied":true}'; END;
    RESET ROLE;

    PERFORM set_config('request.jwt.claims', json_build_object('sub',OWN,'role','authenticated')::text, true);
    PERFORM set_config('request.headers', json_build_object('x-organisation-id',A)::text, true);
    SET LOCAL ROLE authenticated;
    res := res || jsonb_build_object('owner_has_ai_manage', has_permission('ai.manage'));
    SELECT count(*) INTO n FROM ai_credit_transactions;
    res := res || jsonb_build_object('owner_sees_orgA_only', n=7 AND NOT EXISTS(SELECT 1 FROM ai_credit_transactions WHERE organisation_id<>A));
    SELECT * INTO bal FROM ai_credit_balance;
    res := res || jsonb_build_object('owner_view_orgA', bal.organisation_id=A AND bal.available=80 AND bal.consumed=20 AND bal.held=5,
                                     'owner_view_single_row', (SELECT count(*) FROM ai_credit_balance)=1);
    BEGIN INSERT INTO ai_credit_transactions(organisation_id,kind,amount,actor_type,reason_code) VALUES (A,'grant',1,'user','test_grant'); res:=res||'{"auth_insert_denied":false}'; EXCEPTION WHEN insufficient_privilege THEN res:=res||'{"auth_insert_denied":true}'; END;
    BEGIN UPDATE ai_credit_transactions SET amount=1; res:=res||'{"auth_update_denied":false}'; EXCEPTION WHEN insufficient_privilege THEN res:=res||'{"auth_update_denied":true}'; END;
    BEGIN DELETE FROM ai_credit_transactions; res:=res||'{"auth_delete_denied":false}'; EXCEPTION WHEN insufficient_privilege THEN res:=res||'{"auth_delete_denied":true}'; END;
    RESET ROLE;
    PERFORM set_config('request.headers', json_build_object('x-organisation-id',B)::text, true);
    SET LOCAL ROLE authenticated;
    SELECT count(*) INTO n FROM ai_credit_transactions;
    res := res || jsonb_build_object('forged_orgB_zero', n=0, 'forged_view_zero', (SELECT count(*) FROM ai_credit_balance)=0);
    RESET ROLE;
    PERFORM set_config('request.headers', '{}', true);
    SET LOCAL ROLE authenticated;
    SELECT count(*) INTO n FROM ai_credit_transactions; res := res || jsonb_build_object('missing_org_zero', n=0);
    RESET ROLE;
    PERFORM set_config('request.jwt.claims', json_build_object('sub',TB,'role','authenticated')::text, true);
    PERFORM set_config('request.headers', json_build_object('x-organisation-id',A)::text, true);
    SET LOCAL ROLE authenticated;
    res := res || jsonb_build_object('teacherb_lacks_ai_manage', NOT has_permission('ai.manage'));
    SELECT count(*) INTO n FROM ai_credit_transactions;
    res := res || jsonb_build_object('teacherb_own_rows_only', n=1 AND NOT EXISTS(SELECT 1 FROM ai_credit_transactions WHERE user_id IS DISTINCT FROM TB),
      'teacherb_view_own', (SELECT available=7 FROM ai_credit_balance));
    RESET ROLE;
    PERFORM set_config('request.jwt.claims', '', true); PERFORM set_config('request.headers', '', true);
    RAISE EXCEPTION 'm4_part1_rollback';
  EXCEPTION WHEN raise_exception THEN IF SQLERRM <> 'm4_part1_rollback' THEN RAISE; END IF;
  END;
  res := res || jsonb_build_object('ledger_empty_after_part1', (SELECT count(*)=0 FROM ai_credit_transactions WHERE organisation_id IN (A,B)));

  -- ===== Part 2 (was 20261009010318): balance arithmetic =====
  BEGIN
    INSERT INTO ai_credit_transactions(organisation_id,kind,amount,actor_type,reason_code,period_month) VALUES (A,'grant',100,'system','monthly_grant','2026-10-01');
    INSERT INTO ai_credit_transactions(organisation_id,kind,amount,job_id,user_id,actor_type,reason_code) VALUES
      (A,'reserve',30,J1,OWN,'system','job_reserve'),(A,'settle',20,J1,OWN,'worker','job_settle'),(A,'release',10,J1,OWN,'worker','job_release');
    INSERT INTO ai_credit_transactions(organisation_id,kind,amount,actor_id,actor_type,reason_code,external_ref) VALUES (A,'adjust',5,OWN,'user','adjust_credit','r1'),(A,'adjust',3,OWN,'user','adjust_debit','r2');
    INSERT INTO ai_credit_transactions(organisation_id,kind,amount,actor_type,reason_code,period_month) VALUES (A,'expire',4,'system','monthly_expire','2026-09-01');
    SELECT available||'/'||consumed||'/'||held INTO s1 FROM ai_credit_balance WHERE organisation_id=A;
    INSERT INTO ai_credit_transactions(organisation_id,kind,amount,job_id,user_id,actor_type,reason_code) VALUES (A,'reserve',6,J2,OWN,'system','job_reserve');
    SELECT available||'/'||consumed||'/'||held INTO s2 FROM ai_credit_balance WHERE organisation_id=A;
    INSERT INTO ai_credit_transactions(organisation_id,kind,amount,job_id,user_id,actor_type,reason_code) VALUES (A,'refund',2,J1,OWN,'user','job_refund');
    SELECT available||'/'||consumed||'/'||held INTO s3 FROM ai_credit_balance WHERE organisation_id=A;
    RAISE EXCEPTION 'm4_part2_rollback';
  EXCEPTION WHEN raise_exception THEN IF SQLERRM <> 'm4_part2_rollback' THEN RAISE; END IF;
  END;
  res := res || jsonb_build_object('balance_after_settle_release', s1='78/20/0', 'balance_with_open_hold', s2='72/20/6',
     'balance_after_refund', s3='74/20/6',
     'ledger_empty_after_part2', (SELECT count(*)=0 FROM ai_credit_transactions WHERE organisation_id IN (A,B)));

  FOR k, v IN SELECT * FROM jsonb_each(res) ORDER BY 1 LOOP
    RAISE NOTICE '% %', CASE WHEN v = 'true'::jsonb THEN 'PASS' ELSE 'FAIL' END, k;
    IF v <> 'true'::jsonb THEN bad := bad || k || ' '; END IF;
  END LOOP;
  RAISE NOTICE 'checks=%', (SELECT count(*) FROM jsonb_each(res));
  IF bad <> '' THEN RAISE EXCEPTION 'M4 selftest failed: %', bad; END IF;
END $$;

ROLLBACK;
