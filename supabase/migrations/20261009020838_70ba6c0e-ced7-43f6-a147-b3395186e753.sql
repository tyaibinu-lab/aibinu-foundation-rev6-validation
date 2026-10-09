-- Gate 11C M6a — request/worker integration with M5 credits (Gate 10 v1.1 §3, §5, §13.3–13.6; approved M6 decisions 1–4)

-- 1. Global kill switch
CREATE TABLE public.ai_platform_settings (
  id boolean PRIMARY KEY DEFAULT true CHECK (id),
  global_ai_enabled boolean NOT NULL DEFAULT false,
  updated_by uuid REFERENCES public.users(id),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.ai_platform_settings TO service_role;
ALTER TABLE public.ai_platform_settings ENABLE ROW LEVEL SECURITY;
CREATE POLICY ai_platform_settings_no_client ON public.ai_platform_settings FOR SELECT TO authenticated USING (false);
INSERT INTO public.ai_platform_settings (id) VALUES (true);

CREATE OR REPLACE FUNCTION public.ai_global_enabled() RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog, public, pg_temp
AS $$ SELECT COALESCE((SELECT global_ai_enabled FROM public.ai_platform_settings WHERE id), false); $$;

CREATE OR REPLACE FUNCTION public.ai_set_kill_switch(p_scope text, p_code text, p_enabled boolean)
RETURNS void LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = pg_catalog, public, pg_temp
AS $$
DECLARE v_uid uuid := public.current_user_id(); v_state public.ai_model_state;
BEGIN
  IF v_uid IS NULL OR NOT public.is_platform_admin() THEN RAISE EXCEPTION 'permission_denied' USING ERRCODE = '42501'; END IF;
  IF p_enabled IS NULL THEN RAISE EXCEPTION 'invalid_argument' USING ERRCODE = '22023'; END IF;
  IF p_scope = 'global' THEN
    UPDATE public.ai_platform_settings SET global_ai_enabled = p_enabled, updated_by = v_uid, updated_at = now() WHERE id;
  ELSIF p_scope = 'agent' THEN
    UPDATE public.ai_agents SET enabled = p_enabled WHERE code = p_code;
    IF NOT FOUND THEN RAISE EXCEPTION 'agent_not_found' USING ERRCODE = 'P0002'; END IF;
  ELSIF p_scope = 'model' THEN
    SELECT state INTO v_state FROM public.ai_model_registry WHERE id = p_code FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'model_not_found' USING ERRCODE = 'P0002'; END IF;
    IF v_state = 'retired' THEN RAISE EXCEPTION 'model_retired' USING ERRCODE = 'P0001'; END IF;
    UPDATE public.ai_model_registry SET state = CASE WHEN p_enabled THEN 'enabled' ELSE 'disabled' END::public.ai_model_state
     WHERE id = p_code;
  ELSE
    RAISE EXCEPTION 'invalid_scope' USING ERRCODE = '22023';
  END IF;
  INSERT INTO public.audit_events (organisation_id, actor_user_id, action, entity_type, entity_id, after_state, actor_type, source)
  VALUES (NULL, v_uid, 'ai.kill_switch.set', 'ai_' || p_scope, COALESCE(p_code, 'global'),
          jsonb_build_object('scope', p_scope, 'code', p_code, 'enabled', p_enabled), 'user', 'db');
END $$;

-- 2. Internal cost helper (same formula as frozen M5 ai_estimate_credits; org explicit; existence-only checks)
CREATE OR REPLACE FUNCTION public.ai_credit_cost_for_org(p_org uuid, p_agent text, p_model text, p_units integer)
RETURNS integer LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = pg_catalog, public, pg_temp
AS $$
DECLARE v_base int; v_mult numeric; v_plan numeric; v_fair jsonb;
BEGIN
  SELECT credit_base INTO v_base FROM public.ai_agents WHERE code = p_agent;
  IF NOT FOUND THEN RAISE EXCEPTION 'agent_not_found' USING ERRCODE = 'P0001'; END IF;
  SELECT credit_multiplier INTO v_mult FROM public.ai_model_registry WHERE id = p_model;
  IF NOT FOUND THEN RAISE EXCEPTION 'model_unavailable' USING ERRCODE = 'P0001'; END IF;
  SELECT p.fair_use INTO v_fair FROM public.ai_org_plans op JOIN public.ai_plans p ON p.code = op.plan_code
   WHERE op.organisation_id = p_org AND op.effective_from <= now()
     AND (op.effective_to IS NULL OR op.effective_to > now()) AND p.active
   ORDER BY op.effective_from DESC LIMIT 1;
  IF NOT FOUND THEN RAISE EXCEPTION 'no_ai_plan' USING ERRCODE = 'P0001'; END IF;
  v_plan := COALESCE((v_fair ->> 'credit_multiplier')::numeric, 1);
  IF v_plan <= 0 THEN RAISE EXCEPTION 'invalid_plan_multiplier' USING ERRCODE = '22023'; END IF;
  RETURN ceil(v_base + v_mult * GREATEST(COALESCE(p_units, 1), 1) * v_plan)::integer;
END $$;

-- 3. Governed-job rule (new rows only)
DO $$ BEGIN
  EXECUTE format($f$ALTER TABLE public.ai_jobs ADD CONSTRAINT ai_jobs_governed_chk
    CHECK (created_at < %L::timestamptz OR (agent_code IS NOT NULL AND model_id IS NOT NULL
           AND prompt_template_id IS NOT NULL AND estimated_credits IS NOT NULL)) NOT VALID$f$, now());
END $$;

-- 4. enqueue_ai_job (signature unchanged)
CREATE OR REPLACE FUNCTION public.enqueue_ai_job(p_type ai_job_type, p_input jsonb, p_target_type text, p_target_id uuid, p_student_id uuid, p_idempotency_key text, p_priority smallint DEFAULT 5)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public, pg_temp
AS $function$
DECLARE
  v_org uuid := current_org_id(); v_uid uuid := current_user_id();
  v_limit integer; v_budget bigint; v_id uuid;
  a ai_agents%ROWTYPE; pl ai_plans%ROWTYPE; v_override integer;
  v_model text; v_prompt uuid; v_role text; v_units integer; v_est integer; v_thr integer; v_status ai_job_status;
BEGIN
  IF NOT has_permission('ai.use') THEN RAISE EXCEPTION 'Permission denied: ai.use required'; END IF;
  IF NOT COALESCE((org_setting(v_org, 'ai_enabled', 'true'::jsonb) #>> '{}')::boolean, true) THEN
    RAISE EXCEPTION 'ai_disabled' USING ERRCODE = 'P0001', DETAIL = 'AI features are turned off for this organisation';
  END IF;

  IF p_idempotency_key IS NOT NULL THEN
    SELECT id INTO v_id FROM ai_jobs WHERE organisation_id = v_org AND idempotency_key = p_idempotency_key
      AND status <> ALL (ai_reusable_key_statuses());
    IF FOUND THEN RETURN v_id; END IF;
  END IF;

  IF NOT ai_global_enabled() THEN RAISE EXCEPTION 'ai_disabled' USING ERRCODE = 'P0001', DETAIL = 'AI is switched off platform-wide'; END IF;

  SELECT * INTO a FROM ai_agents WHERE p_type::text = ANY (job_types) AND enabled ORDER BY code LIMIT 1;
  IF NOT FOUND THEN RAISE EXCEPTION 'agent_disabled' USING ERRCODE = 'P0001'; END IF;
  SELECT p.*, op.approval_threshold_override INTO pl FROM ai_org_plans op JOIN ai_plans p ON p.code = op.plan_code
   WHERE op.organisation_id = v_org AND op.effective_from <= now() AND (op.effective_to IS NULL OR op.effective_to > now()) AND p.active
   ORDER BY op.effective_from DESC LIMIT 1;
  IF NOT FOUND THEN RAISE EXCEPTION 'ai_disabled' USING ERRCODE = 'P0001', DETAIL = 'No AI plan'; END IF;
  SELECT op.approval_threshold_override INTO v_override FROM ai_org_plans op
   WHERE op.organisation_id = v_org AND op.plan_code = pl.code AND op.effective_from <= now() AND (op.effective_to IS NULL OR op.effective_to > now())
   ORDER BY op.effective_from DESC LIMIT 1;
  IF NOT (a.code = ANY (pl.allowed_agents)) THEN RAISE EXCEPTION 'agent_disabled' USING ERRCODE = 'P0001'; END IF;

  SELECT m.id INTO v_model FROM ai_model_registry m
   WHERE m.id IN (a.default_model_id, a.fallback_model_id) AND m.state = 'enabled' AND m.id = ANY (pl.allowed_models)
   ORDER BY (m.id = a.default_model_id) DESC LIMIT 1;
  IF v_model IS NULL THEN RAISE EXCEPTION 'model_unavailable' USING ERRCODE = 'P0001'; END IF;

  SELECT id INTO v_prompt FROM ai_prompt_templates WHERE job_type = p_type AND state = 'active' LIMIT 1;
  IF v_prompt IS NULL THEN RAISE EXCEPTION 'no_active_prompt' USING ERRCODE = 'P0001'; END IF;

  PERFORM ai_credit_lock(v_org);   -- limits counted under the per-org lock (C5)

  IF p_idempotency_key IS NOT NULL THEN
    SELECT id INTO v_id FROM ai_jobs WHERE organisation_id = v_org AND idempotency_key = p_idempotency_key
      AND status <> ALL (ai_reusable_key_statuses());
    IF FOUND THEN RETURN v_id; END IF;
  END IF;

  v_limit := LEAST(COALESCE((org_setting(v_org, 'ai_daily_job_limit', '100'::jsonb) #>> '{}')::integer, 100), pl.daily_job_limit);
  IF (SELECT COUNT(*) FROM ai_jobs WHERE organisation_id = v_org AND created_at >= date_trunc('day', now())) >= v_limit THEN
    RAISE EXCEPTION 'limit_exceeded' USING ERRCODE = 'P0001', DETAIL = 'daily organisation limit';
  END IF;
  IF (SELECT COUNT(*) FROM ai_jobs WHERE organisation_id = v_org AND requested_by = v_uid
        AND created_at >= date_trunc('day', now())) >= pl.per_user_daily_jobs THEN
    RAISE EXCEPTION 'limit_exceeded' USING ERRCODE = 'P0001', DETAIL = 'daily per-user limit';
  END IF;
  IF (SELECT COUNT(*) FROM ai_jobs WHERE organisation_id = v_org AND requested_by = v_uid
        AND status IN ('awaiting_approval', 'queued', 'running')) >= 10 THEN
    RAISE EXCEPTION 'limit_exceeded' USING ERRCODE = 'P0001', DETAIL = 'per-user open jobs';
  END IF;
  v_budget := (org_setting(v_org, 'ai_monthly_budget_usd_micros', 'null'::jsonb) #>> '{}')::bigint;
  IF v_budget IS NOT NULL AND
     (SELECT COALESCE(SUM(cost_usd_micros), 0) FROM ai_usage_daily
      WHERE organisation_id = v_org AND day >= date_trunc('month', current_date)::date) >= v_budget THEN
    RAISE EXCEPTION 'limit_exceeded' USING ERRCODE = 'P0001', DETAIL = 'monthly budget';
  END IF;

  v_units := CASE WHEN p_type = 'generate_questions' THEN GREATEST(COALESCE((p_input ->> 'count')::integer, 1), 1) ELSE 1 END;
  v_est := ai_credit_cost_for_org(v_org, a.code, v_model, v_units);
  v_thr := CASE WHEN v_override IS NULL THEN pl.approval_threshold_credits
                WHEN pl.approval_threshold_credits IS NULL THEN v_override
                ELSE LEAST(v_override, pl.approval_threshold_credits) END;
  v_status := CASE WHEN v_thr IS NOT NULL AND v_est > v_thr THEN 'awaiting_approval' ELSE 'queued' END;

  SELECT r.code INTO v_role FROM organisation_memberships m JOIN roles r ON r.id = m.role_id
   WHERE m.user_id = v_uid AND m.organisation_id = v_org AND m.status = 'active' LIMIT 1;

  BEGIN
    INSERT INTO ai_jobs (organisation_id, type, status, input, target_type, target_id, student_id, idempotency_key, priority,
                         requested_by, agent_code, model_id, prompt_template_id, requester_role, source,
                         estimated_credits, approval_required)
    VALUES (v_org, p_type, v_status, p_input, p_target_type, p_target_id, p_student_id, p_idempotency_key, p_priority,
            v_uid, a.code, v_model, v_prompt, v_role, 'app', v_est, v_status = 'awaiting_approval')
    RETURNING id INTO v_id;
    PERFORM ai_credit_reserve(v_id, v_est);   -- same transaction: no job without a hold
  EXCEPTION WHEN unique_violation THEN
    SELECT id INTO v_id FROM ai_jobs WHERE organisation_id = v_org AND idempotency_key = p_idempotency_key
      AND status <> ALL (ai_reusable_key_statuses());
    IF v_id IS NULL THEN RAISE; END IF;
    RETURN v_id;
  END;
  INSERT INTO audit_events (organisation_id, actor_user_id, action, entity_type, entity_id, after_state, actor_type, source)
  VALUES (v_org, v_uid, 'ai.job.requested', 'ai_job', v_id::text,
          jsonb_build_object('type', p_type, 'agent', a.code, 'model', v_model, 'estimated_credits', v_est, 'status', v_status), 'user', 'db');
  RETURN v_id;
END;
$function$;

-- 5. approve_ai_job
CREATE OR REPLACE FUNCTION public.approve_ai_job(p_job_id uuid, p_approve boolean, p_reason text DEFAULT NULL)
RETURNS void LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = pg_catalog, public, pg_temp
AS $$
DECLARE v_org uuid := current_org_id(); v_uid uuid := current_user_id(); j ai_jobs%ROWTYPE;
BEGIN
  IF v_org IS NULL OR v_uid IS NULL OR NOT has_permission('ai.manage') THEN RAISE EXCEPTION 'permission_denied' USING ERRCODE = '42501'; END IF;
  IF p_approve IS NULL OR length(COALESCE(p_reason, '')) > 500 THEN RAISE EXCEPTION 'invalid_argument' USING ERRCODE = '22023'; END IF;
  SELECT * INTO j FROM ai_jobs WHERE id = p_job_id AND organisation_id = v_org FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'job_not_found' USING ERRCODE = 'P0002'; END IF;
  IF j.requested_by = v_uid THEN RAISE EXCEPTION 'permission_denied' USING ERRCODE = '42501', DETAIL = 'cannot approve own request'; END IF;
  IF j.status <> 'awaiting_approval' THEN RAISE EXCEPTION 'invalid_state' USING ERRCODE = 'P0001'; END IF;
  IF p_approve THEN
    UPDATE ai_jobs SET status = 'queued', approved_by = v_uid, approved_at = now(), run_after = now() WHERE id = j.id;
  ELSE
    UPDATE ai_jobs SET status = 'rejected', finished_at = now(), cancelled_by = v_uid,
                       cancel_reason = left(COALESCE(NULLIF(btrim(p_reason), ''), 'rejected'), 500) WHERE id = j.id;
    PERFORM ai_credit_release(j.id, 'job_rejected');
  END IF;
  INSERT INTO audit_events (organisation_id, actor_user_id, action, entity_type, entity_id, after_state, actor_type, source)
  VALUES (v_org, v_uid, CASE WHEN p_approve THEN 'ai.job.approved' ELSE 'ai.job.rejected' END, 'ai_job', j.id::text,
          jsonb_build_object('reason', left(p_reason, 200)), 'user', 'db');
END $$;

-- 6. cancel_ai_job(uuid, text)
DROP FUNCTION public.cancel_ai_job(uuid);
CREATE FUNCTION public.cancel_ai_job(p_job_id uuid, p_reason text DEFAULT NULL)
RETURNS void LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = pg_catalog, public, pg_temp
AS $$
DECLARE v_org uuid := current_org_id(); v_uid uuid := current_user_id(); j ai_jobs%ROWTYPE; v_mgr boolean;
BEGIN
  IF v_org IS NULL OR v_uid IS NULL THEN RAISE EXCEPTION 'permission_denied' USING ERRCODE = '42501'; END IF;
  IF length(COALESCE(p_reason, '')) > 500 THEN RAISE EXCEPTION 'invalid_argument' USING ERRCODE = '22023'; END IF;
  SELECT * INTO j FROM ai_jobs WHERE id = p_job_id AND organisation_id = v_org FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'job_not_found' USING ERRCODE = 'P0002'; END IF;
  v_mgr := has_permission('ai.manage');
  IF NOT (j.requested_by = v_uid OR v_mgr) THEN RAISE EXCEPTION 'permission_denied' USING ERRCODE = '42501'; END IF;
  IF j.status IN ('succeeded', 'failed', 'cancelled', 'expired', 'rejected') THEN RETURN; END IF;
  IF j.status = 'running' AND NOT v_mgr THEN RAISE EXCEPTION 'permission_denied' USING ERRCODE = '42501'; END IF;
  UPDATE ai_jobs SET status = 'cancelled', finished_at = now(), locked_by = NULL, locked_until = NULL,
                     cancelled_by = v_uid, cancel_reason = left(COALESCE(NULLIF(btrim(p_reason), ''), 'cancelled'), 500)
   WHERE id = j.id;
  PERFORM ai_credit_release(j.id, 'job_cancelled');
  INSERT INTO audit_events (organisation_id, actor_user_id, action, entity_type, entity_id, after_state, actor_type, source)
  VALUES (v_org, v_uid, 'ai.job.cancelled', 'ai_job', j.id::text,
          jsonb_build_object('from', j.status, 'reason', left(p_reason, 200)), 'user', 'db');
END $$;

-- 7. claim_ai_job (signature unchanged)
CREATE OR REPLACE FUNCTION public.claim_ai_job(p_worker text, p_lease_seconds integer DEFAULT 300)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public, pg_temp
AS $function$
DECLARE
  j ai_jobs%ROWTYPE; t ai_prompt_templates%ROWTYPE; r record; v_global boolean := ai_global_enabled();
BEGIN
  PERFORM assert_service_context();
  -- kill switch: cancel affected queued jobs (bounded) and release their holds
  FOR r IN SELECT q.id, q.organisation_id FROM ai_jobs q
            WHERE q.status = 'queued'
              AND (NOT v_global
                   OR EXISTS (SELECT 1 FROM ai_agents a WHERE a.code = q.agent_code AND NOT a.enabled)
                   OR EXISTS (SELECT 1 FROM ai_model_registry m WHERE m.id = q.model_id AND m.state <> 'enabled'))
            ORDER BY q.created_at LIMIT 100 FOR UPDATE OF q SKIP LOCKED LOOP
    UPDATE ai_jobs SET status = 'cancelled', cancel_reason = 'kill_switch', finished_at = now() WHERE id = r.id;
    PERFORM ai_credit_release(r.id, 'kill_switch');
    INSERT INTO audit_events (organisation_id, action, entity_type, entity_id, after_state, actor_type, source)
    VALUES (r.organisation_id, 'ai.job.cancelled', 'ai_job', r.id::text, jsonb_build_object('reason', 'kill_switch'), 'worker', 'ai-job-worker');
  END LOOP;
  IF NOT v_global THEN RETURN NULL; END IF;

  UPDATE ai_jobs
  SET status = 'running', attempts = attempts + 1, locked_by = p_worker,
      locked_until = now() + make_interval(secs => LEAST(GREATEST(p_lease_seconds, 30), timeout_seconds)),
      started_at = COALESCE(started_at, now())
  WHERE id = (SELECT q.id FROM ai_jobs q
              WHERE q.status = 'queued' AND q.run_after <= now()
                AND (SELECT COUNT(*) FROM ai_jobs x WHERE x.organisation_id = q.organisation_id AND x.status = 'running')
                    < COALESCE((SELECT p.max_concurrent_jobs FROM ai_org_plans op JOIN ai_plans p ON p.code = op.plan_code
                                WHERE op.organisation_id = q.organisation_id AND op.effective_from <= now()
                                  AND (op.effective_to IS NULL OR op.effective_to > now())
                                ORDER BY op.effective_from DESC LIMIT 1), 2147483647)
              ORDER BY q.priority, q.created_at
              FOR UPDATE OF q SKIP LOCKED LIMIT 1)
  RETURNING * INTO j;
  IF NOT FOUND THEN RETURN NULL; END IF;
  INSERT INTO audit_events (organisation_id, action, entity_type, entity_id, after_state, actor_type, source)
  VALUES (j.organisation_id, 'ai.job.claimed', 'ai_job', j.id::text,
          jsonb_build_object('type', j.type, 'attempt', j.attempts, 'worker', left(p_worker, 100)), 'worker', 'ai-job-worker');

  IF j.prompt_template_id IS NOT NULL THEN
    SELECT * INTO t FROM ai_prompt_templates WHERE id = j.prompt_template_id;
  ELSE
    SELECT * INTO t FROM ai_prompt_templates WHERE job_type = j.type AND is_active;
  END IF;
  IF NOT FOUND THEN
    UPDATE ai_jobs SET status = 'failed', error = 'no_active_prompt', finished_at = now(), locked_by = NULL, locked_until = NULL
    WHERE id = j.id;
    PERFORM ai_credit_release(j.id, 'no_active_prompt');
    RETURN NULL;
  END IF;

  RETURN jsonb_build_object(
    'job_id', j.id, 'organisation_id', j.organisation_id, 'type', j.type, 'attempt', j.attempts,
    'agent_code', j.agent_code, 'model_id', j.model_id, 'prompt_template_id', t.id, 'lease_until', j.locked_until,
    'input', j.input, 'context', build_ai_context(j),
    'template', jsonb_build_object('version', t.version, 'system', t.system_prompt,
                                   'user_template', t.user_template, 'output_schema', t.output_schema));
END;
$function$;

-- 8. complete_ai_job (signature unchanged; output handling unchanged; adds lease check + settlement)
CREATE OR REPLACE FUNCTION public.complete_ai_job(p_job_id uuid, p_outputs jsonb, p_usage jsonb DEFAULT '{}'::jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public, pg_temp
AS $function$
DECLARE
  j      ai_jobs%ROWTYPE;
  it     jsonb;
  v_q uuid; v_qv uuid; v_n uuid; v_nv uuid;
  v_stem text; v_type question_type; v_dup boolean;
  v_title text; v_body text; v_text text; v_words integer;
  n_ok integer := 0; n_bad integer := 0; n_dup integer := 0;
  v_summary jsonb; v_delivered integer; v_actual integer := 0;
BEGIN
  PERFORM assert_service_context();
  SELECT * INTO j FROM ai_jobs WHERE id = p_job_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Job not found'; END IF;
  IF j.status <> 'running' THEN RAISE EXCEPTION 'invalid_state' USING DETAIL = j.status::text; END IF;
  IF j.locked_until IS NULL OR j.locked_until < now() THEN RAISE EXCEPTION 'lease_expired'; END IF;
  IF p_outputs IS NULL OR jsonb_typeof(p_outputs) <> 'object' THEN
    RAISE EXCEPTION 'Outputs must be a JSON object';
  END IF;

  IF j.type = 'generate_questions' THEN
    FOR it IN
      SELECT e.val FROM jsonb_array_elements(
        CASE WHEN jsonb_typeof(p_outputs -> 'questions') = 'array' THEN p_outputs -> 'questions' ELSE '[]'::jsonb END
      ) WITH ORDINALITY AS e(val, ord) WHERE e.ord <= 25
    LOOP
      BEGIN
        v_stem := btrim(COALESCE(it ->> 'stem', ''));
        IF length(v_stem) < 10 OR length(v_stem) > 5000 THEN
          RAISE EXCEPTION 'Question text is missing or the wrong length';
        END IF;
        v_type := COALESCE(NULLIF(it ->> 'type', ''), j.input ->> 'type')::question_type;

        SELECT EXISTS (SELECT 1 FROM question_versions qv JOIN questions q ON q.id = qv.question_id
                       WHERE q.organisation_id = j.organisation_id
                         AND q.topic_id = (j.input ->> 'topic_id')::uuid AND q.deleted_at IS NULL
                         AND lower(btrim(qv.stem)) = lower(v_stem))
        INTO v_dup;

        IF v_dup THEN
          INSERT INTO ai_content (organisation_id, job_id, kind, status, payload, error)
          VALUES (j.organisation_id, j.id, 'question_draft', 'duplicate', it, 'This question already exists for the topic');
          n_dup := n_dup + 1;
        ELSE
          INSERT INTO questions (organisation_id, topic_id, type, status, source, created_by)
          VALUES (j.organisation_id, (j.input ->> 'topic_id')::uuid, v_type, 'draft', 'ai', j.requested_by)
          RETURNING id INTO v_q;

          INSERT INTO question_versions (organisation_id, question_id, status, stem, options, answer_key,
                                         explanation, marks, difficulty, cognitive_level, created_by)
          VALUES (j.organisation_id, v_q, 'draft', v_stem, it -> 'options', it -> 'answer_key',
                  NULLIF(btrim(it ->> 'explanation'), ''),
                  COALESCE((it ->> 'marks')::numeric, 1),
                  COALESCE(NULLIF(it ->> 'difficulty', ''), j.input ->> 'difficulty')::difficulty_level,
                  COALESCE(NULLIF(it ->> 'cognitive_level', ''), j.input ->> 'cognitive_level')::cognitive_level,
                  j.requested_by)
          RETURNING id INTO v_qv;

          INSERT INTO ai_content (organisation_id, job_id, kind, status, payload, target_type, target_id)
          VALUES (j.organisation_id, j.id, 'question_draft', 'draft_created', it, 'question_version', v_qv);
          n_ok := n_ok + 1;
        END IF;
      EXCEPTION WHEN OTHERS THEN
        INSERT INTO ai_content (organisation_id, job_id, kind, status, payload, error)
        VALUES (j.organisation_id, j.id, 'question_draft', 'invalid', it, left(SQLERRM, 300));
        n_bad := n_bad + 1;
      END;
    END LOOP;
    v_summary := jsonb_build_object('created', n_ok, 'invalid', n_bad, 'duplicates', n_dup);
    v_delivered := n_ok;

  ELSIF j.type = 'generate_note' THEN
    BEGIN
      v_title := btrim(COALESCE(p_outputs ->> 'title', ''));
      v_body  := btrim(COALESCE(p_outputs ->> 'body', ''));
      IF length(v_title) < 3 OR length(v_title) > 200 THEN RAISE EXCEPTION 'Title is missing or the wrong length'; END IF;
      IF length(v_body) < 200 OR length(v_body) > 60000 THEN RAISE EXCEPTION 'Note body is missing or the wrong length'; END IF;
      v_words := array_length(regexp_split_to_array(v_body, '\s+'), 1);

      INSERT INTO notes (organisation_id, topic_id, title, status, source, created_by)
      VALUES (j.organisation_id, (j.input ->> 'topic_id')::uuid, v_title, 'draft', 'ai', j.requested_by)
      RETURNING id INTO v_n;

      INSERT INTO note_versions (organisation_id, note_id, status, body, summary, reading_minutes, created_by)
      VALUES (j.organisation_id, v_n, 'draft', v_body,
              left(NULLIF(btrim(p_outputs ->> 'summary'), ''), 1000),
              GREATEST(1, ceil(v_words / 200.0))::integer, j.requested_by)
      RETURNING id INTO v_nv;

      INSERT INTO ai_content (organisation_id, job_id, kind, status, payload, target_type, target_id)
      VALUES (j.organisation_id, j.id, 'note_draft', 'draft_created',
              jsonb_build_object('title', v_title, 'words', v_words), 'note_version', v_nv);
      n_ok := 1;
    EXCEPTION WHEN OTHERS THEN
      INSERT INTO ai_content (organisation_id, job_id, kind, status, payload, error)
      VALUES (j.organisation_id, j.id, 'note_draft', 'invalid', p_outputs, left(SQLERRM, 300));
      n_bad := 1;
    END;
    v_summary := jsonb_build_object('created', n_ok, 'invalid', n_bad);
    v_delivered := n_ok;

  ELSIF j.type = 'review_student' THEN
    v_text := btrim(COALESCE(p_outputs ->> 'summary', ''));
    IF length(v_text) < 20 OR length(v_text) > 4000 THEN RAISE EXCEPTION 'Summary is missing or the wrong length'; END IF;
    INSERT INTO ai_diagnostics (organisation_id, student_id, job_id, summary, findings, model)
    VALUES (j.organisation_id, j.student_id, j.id, v_text, p_outputs - 'summary', p_usage ->> 'model');
    INSERT INTO ai_content (organisation_id, job_id, kind, status, student_id, payload, target_type, target_id)
    VALUES (j.organisation_id, j.id, 'student_review', 'draft_created', j.student_id, p_outputs, 'student', j.student_id);
    v_summary := jsonb_build_object('created', 1);
    v_delivered := 1;

  ELSIF j.type = 'explain_diagnosis' THEN
    v_text := btrim(COALESCE(p_outputs ->> 'narrative', ''));
    IF length(v_text) < 20 OR length(v_text) > 3000 THEN RAISE EXCEPTION 'Narrative is missing or the wrong length'; END IF;
    UPDATE diagnoses SET narrative = v_text WHERE id = j.target_id AND organisation_id = j.organisation_id;
    INSERT INTO ai_content (organisation_id, job_id, kind, status, student_id, payload, target_type, target_id)
    VALUES (j.organisation_id, j.id, 'diagnosis_narrative', 'applied', j.student_id,
            jsonb_build_object('narrative', v_text), 'diagnosis', j.target_id);
    v_summary := jsonb_build_object('applied', 1);
    v_delivered := 1;

  ELSIF j.type = 'report_comment' THEN
    v_text := btrim(COALESCE(p_outputs ->> 'comment', ''));
    IF length(v_text) < 20 OR length(v_text) > 1500 THEN RAISE EXCEPTION 'Comment is missing or the wrong length'; END IF;
    INSERT INTO ai_content (organisation_id, job_id, kind, status, student_id, payload, target_type, target_id)
    VALUES (j.organisation_id, j.id, 'report_comment',
            CASE WHEN EXISTS (SELECT 1 FROM parent_reports WHERE id = j.target_id AND status = 'draft')
                 THEN 'draft_created' ELSE 'discarded' END::ai_content_status,
            j.student_id, jsonb_build_object('comment', v_text), 'parent_report', j.target_id);
    v_summary := jsonb_build_object('created', 1);
    v_delivered := 1;
  END IF;

  -- Settlement: approved formula over valid delivered outputs, capped at the hold inside ai_credit_settle
  IF j.agent_code IS NOT NULL AND j.model_id IS NOT NULL AND COALESCE(v_delivered, 0) > 0 THEN
    v_actual := ai_credit_cost_for_org(j.organisation_id, j.agent_code, j.model_id, v_delivered);
  END IF;
  PERFORM ai_credit_settle(j.id, v_actual);
  v_summary := v_summary || jsonb_build_object('credits', (SELECT consumed_credits FROM ai_jobs WHERE id = j.id));

  PERFORM record_ai_usage(j.organisation_id, p_usage);
  UPDATE ai_jobs
  SET status = 'succeeded', finished_at = now(), locked_by = NULL, locked_until = NULL, error = NULL,
      model = p_usage ->> 'model',
      input_tokens  = GREATEST(COALESCE((p_usage ->> 'input_tokens')::integer, 0), 0),
      output_tokens = GREATEST(COALESCE((p_usage ->> 'output_tokens')::integer, 0), 0),
      cost_usd_micros = GREATEST(COALESCE((p_usage ->> 'cost_usd_micros')::bigint, 0), 0),
      result_summary = v_summary
  WHERE id = j.id;
  INSERT INTO audit_events (organisation_id, action, entity_type, entity_id, after_state, actor_type, source)
  VALUES (j.organisation_id, 'ai.job.completed', 'ai_job', j.id::text, v_summary, 'worker', 'ai-job-worker');

  RETURN v_summary;
END;
$function$;

-- 9. fail_ai_job (signature unchanged)
CREATE OR REPLACE FUNCTION public.fail_ai_job(p_job_id uuid, p_error text, p_retry boolean DEFAULT true, p_usage jsonb DEFAULT '{}'::jsonb)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public, pg_temp
AS $function$
DECLARE j ai_jobs%ROWTYPE;
BEGIN
  PERFORM assert_service_context();
  SELECT * INTO j FROM ai_jobs WHERE id = p_job_id FOR UPDATE;
  IF NOT FOUND OR j.status <> 'running' THEN RETURN; END IF;
  INSERT INTO audit_events (organisation_id, action, entity_type, entity_id, after_state, actor_type, source)
  VALUES (j.organisation_id, 'ai.job.failed', 'ai_job', j.id::text,
          jsonb_build_object('error', left(p_error, 200), 'retry', p_retry AND j.attempts < j.max_attempts),
          'worker', 'ai-job-worker');
  IF COALESCE((p_usage ->> 'cost_usd_micros')::bigint, 0) > 0 THEN
    PERFORM record_ai_usage(j.organisation_id, p_usage);
  END IF;
  IF p_retry AND j.attempts < j.max_attempts THEN
    UPDATE ai_jobs SET status = 'queued', error = left(p_error, 500), locked_by = NULL, locked_until = NULL,
        run_after = now() + make_interval(mins => j.attempts * j.attempts)
    WHERE id = j.id;                         -- hold kept; no new reserve
  ELSE
    UPDATE ai_jobs SET status = 'failed', error = left(p_error, 500), finished_at = now(), locked_by = NULL, locked_until = NULL
    WHERE id = j.id;
    PERFORM ai_credit_release(j.id, 'job_failed');
  END IF;
END;
$function$;

-- 10. run_ai_maintenance (signature unchanged)
CREATE OR REPLACE FUNCTION public.run_ai_maintenance()
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public, pg_temp
AS $function$
DECLARE r record; n_requeued integer; n_failed integer := 0; n_expired integer := 0; n_appr integer := 0; n_recon integer := 0;
BEGIN
  PERFORM assert_service_context();
  UPDATE ai_jobs SET status = 'queued', locked_by = NULL, locked_until = NULL, run_after = now()
  WHERE status = 'running' AND locked_until < now() AND attempts < max_attempts;
  GET DIAGNOSTICS n_requeued = ROW_COUNT;

  FOR r IN SELECT id FROM ai_jobs WHERE status = 'running' AND locked_until < now() AND attempts >= max_attempts
           LIMIT 500 FOR UPDATE SKIP LOCKED LOOP
    UPDATE ai_jobs SET status = 'failed', error = 'Worker stopped responding', finished_at = now(), locked_by = NULL, locked_until = NULL WHERE id = r.id;
    PERFORM ai_credit_release(r.id, 'lease_timeout'); n_failed := n_failed + 1;
  END LOOP;
  FOR r IN SELECT id FROM ai_jobs WHERE status = 'queued' AND created_at < now() - interval '24 hours'
           LIMIT 500 FOR UPDATE SKIP LOCKED LOOP
    UPDATE ai_jobs SET status = 'expired', error = 'Expired in the queue', finished_at = now() WHERE id = r.id;
    PERFORM ai_credit_release(r.id, 'queue_expired'); n_expired := n_expired + 1;
  END LOOP;
  FOR r IN SELECT id FROM ai_jobs WHERE status = 'awaiting_approval' AND created_at < now() - interval '7 days'
           LIMIT 500 FOR UPDATE SKIP LOCKED LOOP
    UPDATE ai_jobs SET status = 'expired', error = 'Approval expired', finished_at = now() WHERE id = r.id;
    PERFORM ai_credit_release(r.id, 'approval_expired'); n_appr := n_appr + 1;
  END LOOP;
  -- reconciliation sweep: terminal jobs whose hold was never closed (should be 0)
  FOR r IN SELECT j.id FROM ai_jobs j
            WHERE j.status IN ('succeeded','failed','cancelled','expired','rejected')
              AND EXISTS (SELECT 1 FROM ai_credit_transactions t WHERE t.job_id = j.id AND t.kind = 'reserve')
              AND NOT EXISTS (SELECT 1 FROM ai_credit_transactions t WHERE t.job_id = j.id AND t.kind IN ('settle','release'))
            LIMIT 500 FOR UPDATE OF j SKIP LOCKED LOOP
    PERFORM ai_credit_release(r.id, 'reconcile_release'); n_recon := n_recon + 1;
  END LOOP;
  RETURN jsonb_build_object('requeued', n_requeued, 'failed', n_failed, 'expired', n_expired,
                            'approval_expired', n_appr, 'reconciled', n_recon);
END;
$function$;

-- 11. Least privilege
REVOKE ALL ON public.ai_platform_settings FROM anon, authenticated;
DO $$
DECLARE f text;
BEGIN
  FOREACH f IN ARRAY ARRAY['ai_global_enabled()','ai_credit_cost_for_org(uuid,text,text,integer)',
                           'ai_set_kill_switch(text,text,boolean)','approve_ai_job(uuid,boolean,text)','cancel_ai_job(uuid,text)'] LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION public.%s FROM PUBLIC, anon, authenticated, service_role', f);
  END LOOP;
END $$;
GRANT EXECUTE ON FUNCTION public.ai_set_kill_switch(text,text,boolean) TO authenticated;
GRANT EXECUTE ON FUNCTION public.approve_ai_job(uuid,boolean,text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.cancel_ai_job(uuid,text) TO authenticated, service_role;

-- 12. Reviewed allow-list (text-preserving edit)
DO $$
DECLARE d text := pg_get_functiondef('public.security_expected_client_functions()'::regprocedure);
        a text := '''cancel_ai_job(uuid)'',';
BEGIN
  IF (length(d) - length(replace(d, a, ''))) / length(a) <> 1 THEN RAISE EXCEPTION 'allow-list anchor not found exactly once'; END IF;
  EXECUTE replace(d, a, E'''ai_set_kill_switch(text,text,boolean)'',\n    ''approve_ai_job(uuid,boolean,text)'',\n    ''cancel_ai_job(uuid,text)'',');
END $$;

INSERT INTO public.schema_migrations (version, description)
VALUES ('011-m6a', 'Gate 11C M6a: request/worker credit integration, kill switch (default off), approval, governed-job rule');