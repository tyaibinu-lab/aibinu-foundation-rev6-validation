CREATE OR REPLACE FUNCTION public.ai_max_batch(p_agent text, p_org uuid DEFAULT NULL)
RETURNS smallint
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'pg_catalog', 'public', 'pg_temp'
AS $function$
  SELECT LEAST(20,
               COALESCE((SELECT a.max_batch::integer FROM ai_agents a WHERE a.code = p_agent), 20),
               COALESCE((SELECT NULLIF(p.fair_use ->> 'max_batch', '')::integer
                           FROM ai_org_plans op JOIN ai_plans p ON p.code = op.plan_code
                          WHERE op.organisation_id = COALESCE(p_org, current_org_id())
                            AND op.effective_from <= now() AND (op.effective_to IS NULL OR op.effective_to > now())
                          ORDER BY op.effective_from DESC LIMIT 1), 20))::smallint;
$function$;

CREATE OR REPLACE FUNCTION public.ai_jobs_terminal_guard()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'pg_catalog', 'public', 'pg_temp'
AS $function$
BEGIN
  IF OLD.status IN ('succeeded','failed','cancelled','expired','rejected') AND NEW.status IS DISTINCT FROM OLD.status THEN
    RAISE EXCEPTION 'invalid_state' USING ERRCODE = 'P0001', DETAIL = 'terminal job status cannot change';
  END IF;
  RETURN NEW;
END $function$;
CREATE TRIGGER ai_jobs_terminal_guard BEFORE UPDATE OF status ON public.ai_jobs
  FOR EACH ROW EXECUTE FUNCTION public.ai_jobs_terminal_guard();

CREATE OR REPLACE FUNCTION public.build_ai_context(j ai_jobs)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'pg_temp'
AS $function$
DECLARE
  v_ctx jsonb;
  v_sid uuid;
BEGIN
  IF j.type IN ('generate_questions', 'generate_note') THEN
    SELECT jsonb_build_object(
      'subject', sub.name, 'curriculum', c.name, 'exam_body', c.exam_body,
      'class_level', t.class_level, 'term', t.term, 'unit', u.title,
      'topic', t.title, 'topic_code', t.code,
      'learning_outcomes', (SELECT COALESCE(jsonb_agg(lo.statement ORDER BY lo.code), '[]'::jsonb)
                            FROM curriculum_outcomes co JOIN learning_outcomes lo ON lo.id = co.outcome_id
                            WHERE co.topic_id = t.id),
      'prerequisites', (SELECT COALESCE(jsonb_agg(ch.topic_title ORDER BY ch.depth), '[]'::jsonb)
                        FROM topic_prerequisite_chain(t.id) ch),
      'sample_questions', (SELECT COALESCE(jsonb_agg(x.stem), '[]'::jsonb)
                           FROM (SELECT qv.stem
                                 FROM questions q
                                 JOIN question_versions qv ON qv.id = q.current_version_id
                                 JOIN curriculum_topics qt ON qt.id = q.topic_id
                                 WHERE qt.topic_key = t.topic_key
                                   AND q.organisation_id = t.organisation_id
                                   AND q.status = 'published'
                                   AND q.deleted_at IS NULL
                                   AND NOT EXISTS (
                                         SELECT 1
                                         FROM exam_questions eq
                                         JOIN question_versions eqv ON eqv.id = eq.question_version_id
                                         JOIN exams e              ON e.id  = eq.exam_id
                                         WHERE eqv.question_id = q.id
                                           AND e.organisation_id = q.organisation_id
                                           AND e.deleted_at IS NULL
                                           AND e.status = 'published'
                                           AND (e.closes_at IS NULL OR e.closes_at > now()))
                                 ORDER BY random() LIMIT 3) x))
    INTO v_ctx
    FROM curriculum_topics t
    JOIN curriculum_units u     ON u.id = t.unit_id
    JOIN curriculum_versions cv ON cv.id = t.version_id
    JOIN curricula c            ON c.id = cv.curriculum_id
    JOIN subjects sub           ON sub.id = c.subject_id
    WHERE t.id = (j.input ->> 'topic_id')::uuid AND t.organisation_id = j.organisation_id;

  ELSIF j.type = 'review_student' THEN
    v_sid := j.student_id;
    SELECT jsonb_build_object(
      'weakest_topics', (SELECT COALESCE(jsonb_agg(jsonb_build_object('topic', w.title, 'subject', w.subject,
                           'mastery_percent', round(w.m * 100), 'level', w.level)), '[]'::jsonb)
                         FROM (SELECT t.title, sub.name AS subject, tm.mastery_score AS m, tm.level
                               FROM topic_mastery tm
                               LEFT JOIN curriculum_topics t ON t.id = tm.topic_id_latest
                               LEFT JOIN subjects sub ON sub.id = tm.subject_id
                               WHERE tm.student_id = v_sid AND tm.confidence >= 0.25
                               ORDER BY tm.mastery_score ASC LIMIT 8) w),
      'strongest_topics', (SELECT COALESCE(jsonb_agg(jsonb_build_object('topic', w.title, 'subject', w.subject,
                             'mastery_percent', round(w.m * 100))), '[]'::jsonb)
                           FROM (SELECT t.title, sub.name AS subject, tm.mastery_score AS m
                                 FROM topic_mastery tm
                                 LEFT JOIN curriculum_topics t ON t.id = tm.topic_id_latest
                                 LEFT JOIN subjects sub ON sub.id = tm.subject_id
                                 WHERE tm.student_id = v_sid AND tm.confidence >= 0.25
                                 ORDER BY tm.mastery_score DESC LIMIT 3) w),
      'recent_assessments', (SELECT COALESCE(jsonb_agg(jsonb_build_object('type', a.exam_kind,
                               'percentage', a.percentage, 'date', a.occurred_at::date) ORDER BY a.occurred_at DESC), '[]'::jsonb)
                             FROM (SELECT * FROM assessment_events
                                   WHERE student_id = v_sid AND NOT voided
                                   ORDER BY occurred_at DESC LIMIT 8) a),
      'open_diagnoses', (SELECT COALESCE(jsonb_agg(jsonb_build_object('kind', d.kind, 'severity', d.severity,
                           'finding', d.finding)), '[]'::jsonb)
                         FROM diagnoses d WHERE d.student_id = v_sid AND d.status = 'open'),
      'support_tasks', (SELECT COALESCE(jsonb_agg(jsonb_build_object('type', i.type, 'status', i.status)), '[]'::jsonb)
                        FROM interventions i WHERE i.student_id = v_sid AND i.status <> 'cancelled'))
    INTO v_ctx;

  ELSIF j.type = 'explain_diagnosis' THEN
    SELECT jsonb_build_object(
      'kind', d.kind, 'severity', d.severity, 'finding', d.finding, 'evidence', d.evidence,
      'topic', (SELECT t.title FROM curriculum_topics t WHERE t.topic_key = d.topic_key
                AND t.organisation_id = d.organisation_id ORDER BY t.created_at DESC LIMIT 1),
      'root_topic', (SELECT t.title FROM curriculum_topics t WHERE t.topic_key = d.root_topic_key
                     AND t.organisation_id = d.organisation_id ORDER BY t.created_at DESC LIMIT 1),
      'suggested_support', (SELECT COALESCE(jsonb_agg(i.title), '[]'::jsonb)
                            FROM interventions i WHERE i.diagnosis_id = d.id AND i.status <> 'cancelled'))
    INTO v_ctx
    FROM diagnoses d
    WHERE d.id = j.target_id AND d.organisation_id = j.organisation_id;

  ELSIF j.type = 'report_comment' THEN
    SELECT jsonb_build_object('student_label', '[Student]',
                              'period', pr.content -> 'period',
                              'assessments', pr.content -> 'assessments',
                              'average_percentage', pr.content -> 'average_percentage',
                              'strengths', pr.content -> 'strengths',
                              'focus_areas', pr.content -> 'focus_areas',
                              'support_tasks', pr.content -> 'support_tasks')
    INTO v_ctx
    FROM parent_reports pr
    WHERE pr.id = j.target_id AND pr.organisation_id = j.organisation_id;
  END IF;

  RETURN COALESCE(v_ctx, '{}'::jsonb);
END;
$function$;

CREATE OR REPLACE FUNCTION public.request_ai_questions(p_topic_id uuid, p_count integer DEFAULT 5, p_type question_type DEFAULT 'mcq'::question_type, p_difficulty difficulty_level DEFAULT 'medium'::difficulty_level, p_cognitive cognitive_level DEFAULT 'apply'::cognitive_level, p_instructions text DEFAULT NULL::text, p_idempotency_key text DEFAULT NULL::text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'pg_temp'
AS $function$
DECLARE v_cap integer;
BEGIN
  IF NOT has_permission('academic.questions.write') THEN RAISE EXCEPTION 'Permission denied: academic.questions.write required'; END IF;
  v_cap := ai_max_batch((SELECT a.code FROM ai_agents a WHERE 'generate_questions'::ai_job_type = ANY (a.job_types) ORDER BY a.code LIMIT 1));
  IF p_count IS NULL OR p_count < 1 OR p_count > v_cap THEN RAISE EXCEPTION 'Ask for between 1 and % questions at a time', v_cap; END IF;
  IF length(COALESCE(p_instructions, '')) > 1000 THEN RAISE EXCEPTION 'Instructions are too long (1000 characters max)'; END IF;
  IF NOT EXISTS (SELECT 1 FROM curriculum_topics WHERE id = p_topic_id AND organisation_id = current_org_id()) THEN
    RAISE EXCEPTION 'Topic not found';
  END IF;
  RETURN enqueue_ai_job('generate_questions',
    jsonb_build_object('topic_id', p_topic_id, 'count', p_count, 'type', p_type,
                       'difficulty', p_difficulty, 'cognitive_level', p_cognitive,
                       'instructions', NULLIF(btrim(p_instructions), '')),
    'topic', p_topic_id, NULL, p_idempotency_key);
END;
$function$;

CREATE OR REPLACE FUNCTION public.enqueue_ai_job(p_type ai_job_type, p_input jsonb, p_target_type text, p_target_id uuid, p_student_id uuid, p_idempotency_key text, p_priority smallint DEFAULT 5)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'pg_temp'
AS $function$
DECLARE
  v_org uuid := current_org_id(); v_uid uuid := current_user_id();
  v_limit integer; v_budget bigint; v_id uuid;
  a ai_agents%ROWTYPE; pl ai_plans%ROWTYPE; v_override integer;
  v_model text; v_prompt uuid; v_role text; v_units integer; v_est integer; v_thr integer; v_status ai_job_status;
  v_cap integer; v_count integer;
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

  SELECT * INTO a FROM ai_agents WHERE p_type = ANY (job_types) AND enabled ORDER BY code LIMIT 1;
  IF NOT FOUND THEN RAISE EXCEPTION 'agent_disabled' USING ERRCODE = 'P0001'; END IF;
  SELECT p.* INTO pl FROM ai_org_plans op JOIN ai_plans p ON p.code = op.plan_code
   WHERE op.organisation_id = v_org AND op.effective_from <= now() AND (op.effective_to IS NULL OR op.effective_to > now()) AND p.active
   ORDER BY op.effective_from DESC LIMIT 1;
  IF NOT FOUND THEN RAISE EXCEPTION 'ai_disabled' USING ERRCODE = 'P0001', DETAIL = 'No AI plan'; END IF;
  SELECT op.approval_threshold_override INTO v_override FROM ai_org_plans op
   WHERE op.organisation_id = v_org AND op.plan_code = pl.code AND op.effective_from <= now() AND (op.effective_to IS NULL OR op.effective_to > now())
   ORDER BY op.effective_from DESC LIMIT 1;
  IF NOT (a.code = ANY (pl.allowed_agents)) THEN RAISE EXCEPTION 'agent_disabled' USING ERRCODE = 'P0001'; END IF;

  IF p_type = 'generate_questions' THEN
    v_cap := ai_max_batch(a.code, v_org);
    v_count := CASE WHEN jsonb_typeof(p_input -> 'count') = 'number' THEN (p_input ->> 'count')::numeric::integer END;
    IF v_count IS NULL OR v_count < 1 OR v_count > v_cap THEN
      RAISE EXCEPTION 'batch_cap_exceeded' USING ERRCODE = 'P0001', DETAIL = format('count must be between 1 and %s', v_cap);
    END IF;
  END IF;

  SELECT m.id INTO v_model FROM ai_model_registry m
   WHERE m.id IN (a.default_model_id, a.fallback_model_id) AND m.state = 'enabled' AND m.id = ANY (pl.allowed_models)
   ORDER BY (m.id = a.default_model_id) DESC LIMIT 1;
  IF v_model IS NULL THEN RAISE EXCEPTION 'model_unavailable' USING ERRCODE = 'P0001'; END IF;

  SELECT id INTO v_prompt FROM ai_prompt_templates WHERE job_type = p_type AND state = 'active' LIMIT 1;
  IF v_prompt IS NULL THEN RAISE EXCEPTION 'no_active_prompt' USING ERRCODE = 'P0001'; END IF;

  PERFORM ai_credit_lock(v_org);

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

  v_units := CASE WHEN p_type = 'generate_questions' THEN v_count ELSE 1 END;
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
    PERFORM ai_credit_reserve(v_id, v_est);
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

CREATE OR REPLACE FUNCTION public.claim_ai_job(p_worker text, p_lease_seconds integer DEFAULT 300)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'pg_temp'
AS $function$
DECLARE
  j ai_jobs%ROWTYPE; t ai_prompt_templates%ROWTYPE; r record; v_global boolean := ai_global_enabled();
  v_cap integer; v_found boolean := false;
BEGIN
  PERFORM assert_service_context();
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

  FOR r IN SELECT q.id, q.organisation_id FROM ai_jobs q
            WHERE q.status = 'queued' AND q.run_after <= now()
            ORDER BY q.priority, q.created_at
            LIMIT 20 FOR UPDATE OF q SKIP LOCKED LOOP
    PERFORM ai_credit_lock(r.organisation_id);
    IF (SELECT COUNT(*) FROM ai_jobs x WHERE x.organisation_id = r.organisation_id AND x.status = 'running')
       < COALESCE((SELECT p.max_concurrent_jobs FROM ai_org_plans op JOIN ai_plans p ON p.code = op.plan_code
                    WHERE op.organisation_id = r.organisation_id AND op.effective_from <= now()
                      AND (op.effective_to IS NULL OR op.effective_to > now())
                    ORDER BY op.effective_from DESC LIMIT 1), 2147483647) THEN
      UPDATE ai_jobs
      SET status = 'running', attempts = attempts + 1, locked_by = p_worker,
          locked_until = now() + make_interval(secs => LEAST(GREATEST(p_lease_seconds, 30), timeout_seconds)),
          started_at = COALESCE(started_at, now())
      WHERE id = r.id
      RETURNING * INTO j;
      v_found := true;
      EXIT;
    END IF;
  END LOOP;
  IF NOT v_found THEN RETURN NULL; END IF;
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

  v_cap := CASE WHEN j.type = 'generate_questions'
                THEN LEAST(COALESCE((j.input ->> 'count')::numeric::integer, 20), ai_max_batch(j.agent_code, j.organisation_id))
                ELSE 1 END;

  RETURN jsonb_build_object(
    'job_id', j.id, 'organisation_id', j.organisation_id, 'type', j.type, 'attempt', j.attempts,
    'agent_code', j.agent_code, 'model_id', j.model_id, 'prompt_template_id', t.id, 'lease_until', j.locked_until,
    'max_batch', v_cap,
    'input', j.input, 'context', build_ai_context(j),
    'template', jsonb_build_object('version', t.version, 'system', t.system_prompt,
                                   'user_template', t.user_template, 'output_schema', t.output_schema));
END;
$function$;

CREATE OR REPLACE FUNCTION public.complete_ai_job(p_job_id uuid, p_outputs jsonb, p_usage jsonb DEFAULT '{}'::jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'pg_temp'
AS $function$
DECLARE
  j      ai_jobs%ROWTYPE;
  it     jsonb;
  v_q uuid; v_qv uuid; v_n uuid; v_nv uuid;
  v_stem text; v_type question_type; v_dup boolean;
  v_title text; v_body text; v_text text; v_words integer;
  n_ok integer := 0; n_bad integer := 0; n_dup integer := 0;
  v_summary jsonb; v_delivered integer; v_actual integer := 0; v_cap integer; v_n_items integer;
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
    v_cap := LEAST(COALESCE((j.input ->> 'count')::numeric::integer, 20), ai_max_batch(j.agent_code, j.organisation_id));
    v_n_items := CASE WHEN jsonb_typeof(p_outputs -> 'questions') = 'array' THEN jsonb_array_length(p_outputs -> 'questions') ELSE 0 END;
    IF v_n_items > v_cap THEN
      v_summary := jsonb_build_object('error', 'batch_cap_exceeded', 'received', v_n_items, 'max_batch', v_cap);
      UPDATE ai_jobs SET status = 'failed', error = 'batch_cap_exceeded', finished_at = now(),
                         locked_by = NULL, locked_until = NULL, result_summary = v_summary
       WHERE id = j.id;
      PERFORM ai_credit_release(j.id, 'invalid_output');
      INSERT INTO audit_events (organisation_id, action, entity_type, entity_id, after_state, actor_type, source)
      VALUES (j.organisation_id, 'ai.job.failed', 'ai_job', j.id::text, v_summary, 'worker', 'ai-job-worker');
      RETURN v_summary;
    END IF;
    FOR it IN
      SELECT e.val FROM jsonb_array_elements(
        CASE WHEN jsonb_typeof(p_outputs -> 'questions') = 'array' THEN p_outputs -> 'questions' ELSE '[]'::jsonb END
      ) AS e(val)
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
    INSERT INTO ai_content (organisation_id, job_id, kind, status, student_id, payload, target_type, target_id)
    VALUES (j.organisation_id, j.id, 'diagnosis_narrative', 'draft_created', j.student_id,
            jsonb_build_object('narrative', v_text), 'diagnosis', j.target_id);
    v_summary := jsonb_build_object('created', 1);
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

CREATE OR REPLACE FUNCTION public.review_ai_diagnosis_narrative(p_content_id uuid, p_accept boolean, p_edited_text text DEFAULT NULL)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'pg_catalog', 'public', 'pg_temp'
AS $function$
DECLARE c ai_content%ROWTYPE; d diagnoses%ROWTYPE; v_text text; v_action text;
BEGIN
  IF NOT has_permission('cas.manage') THEN RAISE EXCEPTION 'Permission denied: cas.manage required'; END IF;
  IF p_accept IS NULL THEN RAISE EXCEPTION 'Decision required'; END IF;
  SELECT * INTO c FROM ai_content
   WHERE id = p_content_id AND organisation_id = current_org_id() AND kind = 'diagnosis_narrative' AND target_type = 'diagnosis'
   FOR UPDATE;
  IF NOT FOUND OR c.student_id IS NULL OR NOT staff_can_view_results(c.student_id) THEN RAISE EXCEPTION 'Suggestion not found'; END IF;
  IF c.status <> 'draft_created' THEN RAISE EXCEPTION 'invalid_state' USING ERRCODE = 'P0001', DETAIL = c.status::text; END IF;
  SELECT * INTO d FROM diagnoses WHERE id = c.target_id AND organisation_id = c.organisation_id FOR UPDATE;

  IF NOT FOUND OR d.status <> 'open' THEN
    UPDATE ai_content SET status = 'discarded', error = 'diagnosis_not_open' WHERE id = c.id;
    v_action := 'ai.diagnosis_narrative.discarded';
  ELSIF p_accept THEN
    v_text := btrim(COALESCE(NULLIF(btrim(p_edited_text), ''), c.payload ->> 'narrative', ''));
    IF length(v_text) < 20 OR length(v_text) > 3000 THEN RAISE EXCEPTION 'Narrative must be 20 to 3000 characters'; END IF;
    UPDATE diagnoses SET narrative = v_text WHERE id = d.id;
    UPDATE ai_content SET status = 'applied' WHERE id = c.id;
    v_action := 'ai.diagnosis_narrative.applied';
  ELSE
    UPDATE ai_content SET status = 'discarded' WHERE id = c.id;
    v_action := 'ai.diagnosis_narrative.discarded';
  END IF;

  INSERT INTO audit_events (organisation_id, actor_user_id, action, entity_type, entity_id, after_state, actor_type, source)
  VALUES (c.organisation_id, current_user_id(), v_action, 'ai_content', c.id::text,
          jsonb_build_object('diagnosis_id', c.target_id, 'job_id', c.job_id,
                             'edited', p_accept AND NULLIF(btrim(p_edited_text), '') IS NOT NULL), 'user', 'db');
END $function$;

REVOKE ALL ON FUNCTION public.ai_max_batch(text,uuid) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.ai_jobs_terminal_guard() FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.review_ai_diagnosis_narrative(uuid,boolean,text) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.review_ai_diagnosis_narrative(uuid,boolean,text) TO authenticated;

DO $$
DECLARE d text := pg_get_functiondef('public.security_expected_client_functions()'::regprocedure);
        a text := '''review_ai_diagnostic(uuid,boolean)'',';
BEGIN
  IF (length(d) - length(replace(d, a, ''))) / length(a) <> 1 THEN RAISE EXCEPTION 'allow-list anchor not found exactly once'; END IF;
  EXECUTE replace(d, a, E'''review_ai_diagnostic(uuid,boolean)'',\n    ''review_ai_diagnosis_narrative(uuid,boolean,text)'',');
END $$;

INSERT INTO public.schema_migrations (version, description)
VALUES ('011-m6b', 'Gate 11C M6b: F1 narrative review, F2 live-exam stem exclusion, F3 batch cap, terminal guard, race-safe claim');