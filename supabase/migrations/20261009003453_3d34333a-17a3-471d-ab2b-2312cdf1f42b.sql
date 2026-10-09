CREATE OR REPLACE FUNCTION public.m3_selftest()
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public, pg_temp AS $$
DECLARE r jsonb := '{}'; v_id uuid; v_u uuid; v_org uuid := '514be2cb-54ba-435b-a4cb-505baf0d0a47'; v_t uuid;
  ok boolean; v_s text; st public.ai_job_status;
  PROCEDURE_DUMMY int;
BEGIN
  PERFORM assert_service_context();
  SELECT id INTO v_u FROM users WHERE email = 'uat-owner@aibinu.test';
  SELECT id INTO v_t FROM ai_prompt_templates WHERE job_type='generate_questions' AND state='active';
  BEGIN
    -- checksum determinism
    r := r || jsonb_build_object('checksum_deterministic',
      ai_prompt_checksum('a','b','{"x":1}') = ai_prompt_checksum('a','b','{"x": 1}')
      AND ai_prompt_checksum('ab','','{}') <> ai_prompt_checksum('a','b','{}'),
      'checksum_matches_rows', (SELECT bool_and(checksum = ai_prompt_checksum(system_prompt,user_template,output_schema)) FROM ai_prompt_templates));
    -- draft insert + edit
    INSERT INTO ai_prompt_templates(job_type,version,system_prompt,user_template,output_schema,agent_code)
      VALUES ('generate_questions',900,'s','u','{}','question_bank') RETURNING id INTO v_id;
    UPDATE ai_prompt_templates SET system_prompt='s2' WHERE id=v_id;
    r := r || jsonb_build_object('draft_editable_and_checksum_refresh',
      (SELECT checksum = ai_prompt_checksum('s2','u','{}') AND NOT is_active FROM ai_prompt_templates WHERE id=v_id));
    BEGIN UPDATE ai_prompt_templates SET is_active=true WHERE id=v_id; r:=r||'{"is_active_write_rejected":false}';
    EXCEPTION WHEN OTHERS THEN r:=r||jsonb_build_object('is_active_write_rejected', SQLERRM LIKE 'prompt_is_active_readonly%'); END;
    BEGIN UPDATE ai_prompt_templates SET state='active' WHERE id=v_id; r:=r||'{"activation_needs_approval":false}';
    EXCEPTION WHEN OTHERS THEN r:=r||jsonb_build_object('activation_needs_approval', SQLERRM LIKE 'prompt_activation_requires_approval%'); END;
    BEGIN UPDATE ai_prompt_templates SET state='retired' WHERE id=v_id; r:=r||'{"draft_to_retired_rejected":false}';
    EXCEPTION WHEN OTHERS THEN r:=r||jsonb_build_object('draft_to_retired_rejected', SQLERRM LIKE 'prompt_invalid_transition%'); END;
    BEGIN UPDATE ai_prompt_templates SET state='active',approved_by=v_u,effective_from=now() WHERE id=v_id; r:=r||'{"one_active_enforced":false}';
    EXCEPTION WHEN unique_violation THEN r:=r||'{"one_active_enforced":true}'; END;
    BEGIN INSERT INTO ai_prompt_templates(job_type,version,system_prompt,user_template,output_schema,agent_code)
      VALUES ('generate_questions',901,'s','u','{}','lesson_note'); r:=r||'{"agent_mismatch_rejected":false}';
    EXCEPTION WHEN OTHERS THEN r:=r||jsonb_build_object('agent_mismatch_rejected', SQLERRM LIKE 'prompt_agent_mismatch%'); END;
    BEGIN INSERT INTO ai_prompt_templates(job_type,version,system_prompt,user_template,output_schema,agent_code)
      VALUES ('generate_questions',1,'s','u','{}','question_bank'); r:=r||'{"version_unique":false}';
    EXCEPTION WHEN unique_violation THEN r:=r||'{"version_unique":true}'; END;
    -- full lifecycle: retire current active, activate draft, retire is terminal
    UPDATE ai_prompt_templates SET state='retired' WHERE id=v_t;
    UPDATE ai_prompt_templates SET state='active',approved_by=v_u,effective_from=now() WHERE id=v_id;
    r := r || jsonb_build_object('lifecycle_active_retired',
      (SELECT state='retired' AND NOT is_active AND retired_at IS NOT NULL FROM ai_prompt_templates WHERE id=v_t)
      AND (SELECT state='active' AND is_active FROM ai_prompt_templates WHERE id=v_id),
      'claim_compat_reads_new_active', (SELECT id FROM ai_prompt_templates WHERE job_type='generate_questions' AND is_active)=v_id);
    BEGIN UPDATE ai_prompt_templates SET state='active' WHERE id=v_t; r:=r||'{"retired_terminal":false}';
    EXCEPTION WHEN OTHERS THEN r:=r||jsonb_build_object('retired_terminal', SQLERRM LIKE 'prompt_invalid_transition%'); END;
    BEGIN UPDATE ai_prompt_templates SET user_template='x' WHERE id=v_id; r:=r||'{"active_content_frozen":false}';
    EXCEPTION WHEN OTHERS THEN r:=r||jsonb_build_object('active_content_frozen', SQLERRM LIKE 'prompt_immutable%'); END;
    BEGIN UPDATE ai_prompt_templates SET system_prompt='x' WHERE id=v_t; r:=r||'{"retired_content_frozen":false}';
    EXCEPTION WHEN OTHERS THEN r:=r||jsonb_build_object('retired_content_frozen', SQLERRM LIKE 'prompt_immutable%'); END;
    UPDATE ai_prompt_templates SET notes='m3 test' WHERE id=v_t;
    r := r || jsonb_build_object('notes_editable_nondraft', (SELECT notes='m3 test' FROM ai_prompt_templates WHERE id=v_t));
    -- referenced template undeletable
    INSERT INTO ai_jobs(organisation_id,type,input,requested_by,status,prompt_template_id)
      VALUES (v_org,'generate_questions','{}',v_u,'succeeded',v_id);
    BEGIN DELETE FROM ai_prompt_templates WHERE id=v_id; r:=r||'{"referenced_undeletable":false}';
    EXCEPTION WHEN foreign_key_violation THEN r:=r||'{"referenced_undeletable":true}'; END;
    -- C3 idempotency
    FOREACH st IN ARRAY ARRAY['failed','cancelled','expired','rejected']::ai_job_status[] LOOP
      INSERT INTO ai_jobs(organisation_id,type,input,requested_by,status,idempotency_key) VALUES (v_org,'generate_note','{}',v_u,st,'m3k-'||st);
      INSERT INTO ai_jobs(organisation_id,type,input,requested_by,status,idempotency_key) VALUES (v_org,'generate_note','{}',v_u,'queued','m3k-'||st);
      r := r || jsonb_build_object('retry_after_'||st, true,
        'lookup_after_'||st||'_finds_new_only', (SELECT count(*)=1 FROM ai_jobs WHERE organisation_id=v_org AND idempotency_key='m3k-'||st AND status <> ALL (ai_reusable_key_statuses())));
    END LOOP;
    FOREACH st IN ARRAY ARRAY['awaiting_approval','queued','running','succeeded']::ai_job_status[] LOOP
      INSERT INTO ai_jobs(organisation_id,type,input,requested_by,status,idempotency_key) VALUES (v_org,'generate_note','{}',v_u,st,'m3d-'||st);
      BEGIN INSERT INTO ai_jobs(organisation_id,type,input,requested_by,status,idempotency_key) VALUES (v_org,'generate_note','{}',v_u,'queued','m3d-'||st);
        r:=r||jsonb_build_object('dedupe_'||st,false);
      EXCEPTION WHEN unique_violation THEN r:=r||jsonb_build_object('dedupe_'||st,true); END;
    END LOOP;
    r := r || jsonb_build_object('index_predicate_matches_function',
      (SELECT pg_get_indexdef('public.uq_ai_job_idem'::regclass) LIKE '%failed%cancelled%expired%rejected%')
      AND ai_reusable_key_statuses() = ARRAY['failed','cancelled','expired','rejected']::ai_job_status[],
      'enqueue_uses_function', (SELECT prosrc LIKE '%status <> ALL (ai_reusable_key_statuses())%' FROM pg_proc WHERE proname='enqueue_ai_job'));
    RAISE EXCEPTION 'm3_rollback';
  EXCEPTION WHEN raise_exception THEN IF SQLERRM <> 'm3_rollback' THEN RAISE; END IF;
  END;
  RETURN r;
END $$;
REVOKE ALL ON FUNCTION public.m3_selftest() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.m3_selftest() TO service_role;