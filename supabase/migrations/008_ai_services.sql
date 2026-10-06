-- =====================================================================
-- Aibinu FlexiPrep: Migration 008
-- AI services: job queue, prompt templates, review-gated content
-- generation, AI student reviews, diagnosis explanations, parent-report
-- comments, recommendations, usage and budget controls
-- Requires: 001-007
--
-- Design rules:
--   1. The database never calls an AI model. A worker (your API or a
--      background job) claims jobs, calls the model, and hands back JSON.
--   2. AI output NEVER publishes itself. Generated questions and notes land
--      as drafts (source = 'ai', created_by = NULL) in the normal review
--      pipeline, so the teacher who asked for them can review them.
--   3. Student names and IDs are never sent to the model.
--   4. Every output is stored (ai_content) and every job is costed.
-- =====================================================================

BEGIN;
SELECT public.migration_begin('008', '007');   -- Revision 6 (M5)

-- ---------------------------------------------------------------------
-- 1. Enums and permissions
-- ---------------------------------------------------------------------
CREATE TYPE ai_job_type AS ENUM ('generate_questions', 'generate_note', 'review_student',
                                 'explain_diagnosis', 'report_comment');
CREATE TYPE ai_job_status AS ENUM ('queued', 'running', 'succeeded', 'failed', 'cancelled');
CREATE TYPE ai_content_kind AS ENUM ('question_draft', 'note_draft', 'student_review',
                                     'diagnosis_narrative', 'report_comment');
CREATE TYPE ai_content_status AS ENUM ('draft_created', 'applied', 'invalid', 'duplicate', 'discarded');
CREATE TYPE ai_review_state AS ENUM ('pending_review', 'accepted', 'discarded');
CREATE TYPE recommendation_kind AS ENUM ('note', 'practice_exam');
CREATE TYPE recommendation_source AS ENUM ('rule', 'ai');

-- Revision 6 (C1/C5): permission seed removed; the catalogue and role mappings live in 001.

-- Revision 6 (C1/C5): permission seed removed; the catalogue and role mappings live in 001.

-- Revision 6 (C1/C5): permission seed removed; the catalogue and role mappings live in 001.

-- ---------------------------------------------------------------------
-- 2. Tables
-- ---------------------------------------------------------------------

-- Platform-level prompts, versioned, so you can improve them without redeploying.
-- Not tenant data; only the worker functions read them.
CREATE TABLE ai_prompt_templates (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  job_type      ai_job_type NOT NULL,
  version       integer NOT NULL,
  system_prompt text NOT NULL,
  user_template text NOT NULL,       -- the worker replaces {{input}} and {{context}} with JSON
  output_schema jsonb NOT NULL,      -- what the model must return
  is_active     boolean NOT NULL DEFAULT false,
  notes         text,
  created_at    timestamptz NOT NULL DEFAULT now(),
  UNIQUE (job_type, version)
);
CREATE UNIQUE INDEX uq_active_template ON ai_prompt_templates(job_type) WHERE is_active;

CREATE TABLE ai_jobs (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organisation_id uuid NOT NULL REFERENCES organisations(id) ON DELETE CASCADE,
  type            ai_job_type NOT NULL,
  status          ai_job_status NOT NULL DEFAULT 'queued',
  priority        smallint NOT NULL DEFAULT 5 CHECK (priority BETWEEN 1 AND 9),   -- 1 = first
  input           jsonb NOT NULL,
  target_type     text,
  target_id       uuid,
  student_id      uuid,                          -- set for student-related jobs (drives visibility)
  idempotency_key text,
  requested_by    uuid DEFAULT current_user_id() REFERENCES users(id),
  attempts        integer NOT NULL DEFAULT 0,
  max_attempts    integer NOT NULL DEFAULT 3,
  run_after       timestamptz NOT NULL DEFAULT now(),
  locked_by       text,
  locked_until    timestamptz,
  model           text,
  input_tokens    integer,
  output_tokens   integer,
  cost_usd_micros bigint NOT NULL DEFAULT 0,     -- 1,000,000 = US$1
  error           text,
  result_summary  jsonb,
  created_at      timestamptz NOT NULL DEFAULT now(),
  started_at      timestamptz,
  finished_at     timestamptz,
  UNIQUE (id, organisation_id),
  FOREIGN KEY (student_id, organisation_id) REFERENCES students(id, organisation_id) ON DELETE CASCADE
);
CREATE INDEX idx_ai_jobs_queue ON ai_jobs(priority, created_at) WHERE status = 'queued';
CREATE INDEX idx_ai_jobs_org   ON ai_jobs(organisation_id, created_at DESC);
-- A repeated request returns the existing job, unless that one failed or was cancelled.
CREATE UNIQUE INDEX uq_ai_job_idem ON ai_jobs(organisation_id, idempotency_key)
  WHERE idempotency_key IS NOT NULL AND status NOT IN ('failed', 'cancelled');

-- Every output the model produced, kept for audit and for measuring quality.
CREATE TABLE ai_content (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organisation_id uuid NOT NULL REFERENCES organisations(id) ON DELETE CASCADE,
  job_id          uuid NOT NULL,
  kind            ai_content_kind NOT NULL,
  status          ai_content_status NOT NULL,
  student_id      uuid,
  payload         jsonb NOT NULL,
  target_type     text,                          -- 'question_version', 'note_version', 'diagnosis', 'parent_report'
  target_id       uuid,
  error           text,
  created_at      timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (job_id, organisation_id) REFERENCES ai_jobs(id, organisation_id) ON DELETE CASCADE
);
CREATE INDEX idx_ai_content_job    ON ai_content(job_id);
CREATE INDEX idx_ai_content_target ON ai_content(target_type, target_id);

-- AI-written review of one student, for the teacher only.
CREATE TABLE ai_diagnostics (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organisation_id uuid NOT NULL REFERENCES organisations(id) ON DELETE CASCADE,
  student_id      uuid NOT NULL,
  job_id          uuid NOT NULL,
  summary         text NOT NULL,
  findings        jsonb NOT NULL,                -- strengths, concerns, recommended actions
  model           text,
  review_state    ai_review_state NOT NULL DEFAULT 'pending_review',
  reviewed_by     uuid REFERENCES users(id),
  reviewed_at     timestamptz,
  created_at      timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (student_id, organisation_id) REFERENCES students(id, organisation_id) ON DELETE CASCADE,
  FOREIGN KEY (job_id, organisation_id)     REFERENCES ai_jobs(id, organisation_id) ON DELETE CASCADE
);
CREATE INDEX idx_ai_diag_student ON ai_diagnostics(student_id, created_at DESC);

-- "Study this next". Built from RELEASED mastery only, so it is safe to show students.
CREATE TABLE ai_recommendations (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organisation_id uuid NOT NULL REFERENCES organisations(id) ON DELETE CASCADE,
  student_id      uuid NOT NULL,
  kind            recommendation_kind NOT NULL,
  topic_key       uuid NOT NULL,
  note_id         uuid,
  exam_id         uuid,
  title           text NOT NULL,
  reason          text NOT NULL,
  priority        integer NOT NULL DEFAULT 5,
  source          recommendation_source NOT NULL DEFAULT 'rule',
  is_active       boolean NOT NULL DEFAULT true,
  shown_at        timestamptz,
  clicked_at      timestamptz,
  dismissed_at    timestamptz,
  created_at      timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (student_id, organisation_id) REFERENCES students(id, organisation_id) ON DELETE CASCADE,
  FOREIGN KEY (note_id, organisation_id)    REFERENCES notes(id, organisation_id) ON DELETE CASCADE,
  FOREIGN KEY (exam_id, organisation_id)    REFERENCES exams(id, organisation_id) ON DELETE CASCADE,
  CHECK ((kind = 'note' AND note_id IS NOT NULL) OR (kind = 'practice_exam' AND exam_id IS NOT NULL))
);
CREATE UNIQUE INDEX uq_rec_note ON ai_recommendations(student_id, note_id) WHERE is_active AND note_id IS NOT NULL;
CREATE UNIQUE INDEX uq_rec_exam ON ai_recommendations(student_id, exam_id) WHERE is_active AND exam_id IS NOT NULL;
CREATE INDEX idx_rec_student ON ai_recommendations(student_id, is_active, priority);

CREATE TABLE ai_usage_daily (
  organisation_id uuid NOT NULL REFERENCES organisations(id) ON DELETE CASCADE,
  day             date NOT NULL,
  jobs            integer NOT NULL DEFAULT 0,
  input_tokens    bigint NOT NULL DEFAULT 0,
  output_tokens   bigint NOT NULL DEFAULT 0,
  cost_usd_micros bigint NOT NULL DEFAULT 0,
  PRIMARY KEY (organisation_id, day)
);

-- ---------------------------------------------------------------------
-- 3. Seed prompts (version 1). Improve them by inserting version 2 and
--    switching is_active; the worker always uses the active one.
-- ---------------------------------------------------------------------
INSERT INTO ai_prompt_templates (job_type, version, is_active, system_prompt, user_template, output_schema, notes) VALUES
('generate_questions', 1, true,
$p$You write exam-style questions for Nigerian senior secondary school students preparing for WAEC, NECO and UTME.
Rules:
- Write ORIGINAL questions. Never reproduce past-paper or textbook questions.
- Match the requested topic, question type, difficulty and cognitive level. Use SI units and, where natural, Nigerian context.
- Multiple choice (mcq): exactly one correct option, keys A, B, C, D, with distractors based on common misconceptions.
- true_false: two options, A = True and B = False, exactly one correct.
- multi_select: keys A-E, one or more correct options.
- fill_blank and short_answer: give answer_key as an array of acceptable answers.
- theory: give answer_key as {"points": ["marking point", ...]}.
- Always include a clear explanation of the correct answer in one to three sentences.
- Respond with JSON only, matching the schema. No commentary.$p$,
$p$Write {{input.count}} question(s).
Request: {{input}}
Curriculum context: {{context}}$p$,
'{"type":"object","required":["questions"],"properties":{"questions":{"type":"array","items":{"type":"object","required":["stem","explanation"],"properties":{"stem":{"type":"string"},"type":{"type":"string"},"options":{"type":"array","items":{"type":"object","required":["key","text","is_correct"],"properties":{"key":{"type":"string"},"text":{"type":"string"},"is_correct":{"type":"boolean"}}}},"answer_key":{},"explanation":{"type":"string"},"difficulty":{"type":"string"},"cognitive_level":{"type":"string"},"marks":{"type":"number"}}}}}}'::jsonb,
'Initial version'),

('generate_note', 1, true,
$p$You write clear, accurate revision notes for Nigerian senior secondary school students (WAEC, NECO, UTME).
Rules:
- Cover the topic and its learning outcomes at the right level. Be accurate; do not guess.
- Use markdown with short headings, short paragraphs, key terms in bold, and formulas in LaTeX where needed.
- Include one or two worked examples, a short "common mistakes" section, and three quick-check questions with answers at the end.
- Write in your own words. Do not copy from textbooks.
- Respond with JSON only, matching the schema. No commentary.$p$,
$p$Write a revision note.
Request: {{input}}
Curriculum context: {{context}}$p$,
'{"type":"object","required":["title","body"],"properties":{"title":{"type":"string"},"summary":{"type":"string"},"body":{"type":"string"},"reading_minutes":{"type":"integer"}}}'::jsonb,
'Initial version'),

('review_student', 1, true,
$p$You assist a secondary school teacher. Using ONLY the data provided, write a concise review of one student's learning.
Rules:
- Do not invent facts. If evidence is thin, say so.
- Do not speculate about learning disabilities, health, family or character.
- Refer to the student as "the student". Give practical, specific teaching suggestions.
- Respond with JSON only, matching the schema. No commentary.$p$,
$p$Student data (anonymised): {{context}}$p$,
'{"type":"object","required":["summary","strengths","concerns","recommended_actions"],"properties":{"summary":{"type":"string"},"strengths":{"type":"array","items":{"type":"string"}},"concerns":{"type":"array","items":{"type":"string"}},"recommended_actions":{"type":"array","items":{"type":"string"}}}}'::jsonb,
'Initial version'),

('explain_diagnosis', 1, true,
$p$You help a teacher understand why a student is struggling. Explain the diagnosis in plain language in three to five sentences, using only the data provided. Mention the likely prerequisite gap if there is one and suggest the first thing to try. Do not invent facts. Respond with JSON only, matching the schema.$p$,
$p$Diagnosis data: {{context}}$p$,
'{"type":"object","required":["narrative"],"properties":{"narrative":{"type":"string"}}}'::jsonb,
'Initial version'),

('report_comment', 1, true,
$p$You draft a short comment for a school progress report to a parent. Write three to four warm, honest sentences.
Rules:
- Refer to the child only as [Student] (the school will replace it).
- Mention one real strength and one focus area from the data, and one practical way to help at home.
- Do not compare the child with other students, do not mention other children, and do not promise grades.
- Respond with JSON only, matching the schema.$p$,
$p$Report data: {{context}}$p$,
'{"type":"object","required":["comment"],"properties":{"comment":{"type":"string"}}}'::jsonb,
'Initial version');

-- ---------------------------------------------------------------------
-- 4. Internal helpers
-- ---------------------------------------------------------------------

-- Everything the model is allowed to know for a job. No names, no IDs of people.
CREATE OR REPLACE FUNCTION build_ai_context(j ai_jobs) RETURNS jsonb AS $$
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
                                 WHERE qt.topic_key = t.topic_key AND q.status = 'published'
                                   AND q.organisation_id = t.organisation_id
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
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public, pg_temp;

CREATE OR REPLACE FUNCTION record_ai_usage(p_org uuid, p_usage jsonb) RETURNS void AS $$
  INSERT INTO ai_usage_daily (organisation_id, day, jobs, input_tokens, output_tokens, cost_usd_micros)
  VALUES (p_org, current_date, 1,
          GREATEST(COALESCE((p_usage ->> 'input_tokens')::bigint, 0), 0),
          GREATEST(COALESCE((p_usage ->> 'output_tokens')::bigint, 0), 0),
          GREATEST(COALESCE((p_usage ->> 'cost_usd_micros')::bigint, 0), 0))
  ON CONFLICT (organisation_id, day) DO UPDATE
    SET jobs            = ai_usage_daily.jobs + 1,
        input_tokens    = ai_usage_daily.input_tokens  + EXCLUDED.input_tokens,
        output_tokens   = ai_usage_daily.output_tokens + EXCLUDED.output_tokens,
        cost_usd_micros = ai_usage_daily.cost_usd_micros + EXCLUDED.cost_usd_micros;
$$ LANGUAGE sql SECURITY DEFINER SET search_path = pg_catalog, public, pg_temp;

-- Queue a job after checking the on/off switch, daily limit, monthly budget
-- and the user's own queue. Settings (organisation_settings), all optional:
--   ai_enabled (true), ai_daily_job_limit (100), ai_monthly_budget_usd_micros (none)
CREATE OR REPLACE FUNCTION enqueue_ai_job(
  p_type ai_job_type, p_input jsonb, p_target_type text, p_target_id uuid,
  p_student_id uuid, p_idempotency_key text, p_priority smallint DEFAULT 5
) RETURNS uuid AS $$
DECLARE
  v_org     uuid := current_org_id();
  v_limit   integer;
  v_budget  bigint;
  v_id      uuid;
BEGIN
  IF NOT has_permission('ai.use') THEN RAISE EXCEPTION 'Permission denied: ai.use required'; END IF;
  IF NOT COALESCE((org_setting(v_org, 'ai_enabled', 'true'::jsonb) #>> '{}')::boolean, true) THEN
    RAISE EXCEPTION 'AI features are turned off for this organisation';
  END IF;

  IF p_idempotency_key IS NOT NULL THEN
    SELECT id INTO v_id FROM ai_jobs
    WHERE organisation_id = v_org AND idempotency_key = p_idempotency_key
      AND status NOT IN ('failed', 'cancelled');
    IF FOUND THEN RETURN v_id; END IF;
  END IF;

  v_limit := COALESCE((org_setting(v_org, 'ai_daily_job_limit', '100'::jsonb) #>> '{}')::integer, 100);
  IF (SELECT COUNT(*) FROM ai_jobs WHERE organisation_id = v_org
        AND created_at >= date_trunc('day', now()) AND status <> 'cancelled') >= v_limit THEN
    RAISE EXCEPTION 'Daily AI limit reached (% jobs). Try again tomorrow.', v_limit;
  END IF;

  v_budget := (org_setting(v_org, 'ai_monthly_budget_usd_micros', 'null'::jsonb) #>> '{}')::bigint;
  IF v_budget IS NOT NULL AND
     (SELECT COALESCE(SUM(cost_usd_micros), 0) FROM ai_usage_daily
      WHERE organisation_id = v_org AND day >= date_trunc('month', current_date)::date) >= v_budget THEN
    RAISE EXCEPTION 'The monthly AI budget has been reached';
  END IF;

  IF (SELECT COUNT(*) FROM ai_jobs WHERE organisation_id = v_org AND requested_by = current_user_id()
        AND status IN ('queued', 'running')) >= 10 THEN
    RAISE EXCEPTION 'You already have 10 AI jobs waiting; let some finish first';
  END IF;

  INSERT INTO ai_jobs (organisation_id, type, input, target_type, target_id, student_id,
                       idempotency_key, priority)
  VALUES (v_org, p_type, p_input, p_target_type, p_target_id, p_student_id,
          p_idempotency_key, p_priority)
  RETURNING id INTO v_id;
  RETURN v_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public, pg_temp;

-- ---------------------------------------------------------------------
-- 5. Teacher-facing requests (each returns a job id; poll ai_jobs for the result)
-- ---------------------------------------------------------------------

CREATE OR REPLACE FUNCTION request_ai_questions(
  p_topic_id uuid, p_count integer DEFAULT 5, p_type question_type DEFAULT 'mcq',
  p_difficulty difficulty_level DEFAULT 'medium', p_cognitive cognitive_level DEFAULT 'apply',
  p_instructions text DEFAULT NULL, p_idempotency_key text DEFAULT NULL
) RETURNS uuid AS $$
BEGIN
  IF NOT has_permission('academic.questions.write') THEN RAISE EXCEPTION 'Permission denied: academic.questions.write required'; END IF;
  IF p_count < 1 OR p_count > 20 THEN RAISE EXCEPTION 'Ask for between 1 and 20 questions at a time'; END IF;
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
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public, pg_temp;

CREATE OR REPLACE FUNCTION request_ai_note(
  p_topic_id uuid, p_style text DEFAULT 'exam_focused',
  p_instructions text DEFAULT NULL, p_idempotency_key text DEFAULT NULL
) RETURNS uuid AS $$
BEGIN
  IF NOT has_permission('academic.notes.write') THEN RAISE EXCEPTION 'Permission denied: academic.notes.write required'; END IF;
  IF length(COALESCE(p_instructions, '')) > 1000 THEN RAISE EXCEPTION 'Instructions are too long (1000 characters max)'; END IF;
  IF NOT EXISTS (SELECT 1 FROM curriculum_topics WHERE id = p_topic_id AND organisation_id = current_org_id()) THEN
    RAISE EXCEPTION 'Topic not found';
  END IF;
  RETURN enqueue_ai_job('generate_note',
    jsonb_build_object('topic_id', p_topic_id, 'style', COALESCE(NULLIF(btrim(p_style), ''), 'exam_focused'),
                       'instructions', NULLIF(btrim(p_instructions), '')),
    'topic', p_topic_id, NULL, p_idempotency_key);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public, pg_temp;

CREATE OR REPLACE FUNCTION request_ai_student_review(p_student_id uuid, p_idempotency_key text DEFAULT NULL) RETURNS uuid AS $$
BEGIN
  IF NOT has_permission('cas.manage') THEN RAISE EXCEPTION 'Permission denied: cas.manage required'; END IF;
  IF NOT staff_can_view_results(p_student_id) THEN RAISE EXCEPTION 'Permission denied for this student'; END IF;
  RETURN enqueue_ai_job('review_student', jsonb_build_object('purpose', 'teacher_review'),
                        'student', p_student_id, p_student_id, p_idempotency_key);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public, pg_temp;

CREATE OR REPLACE FUNCTION request_ai_diagnosis_explanation(p_diagnosis_id uuid) RETURNS uuid AS $$
DECLARE
  d diagnoses%ROWTYPE;
BEGIN
  IF NOT has_permission('cas.manage') THEN RAISE EXCEPTION 'Permission denied: cas.manage required'; END IF;
  SELECT * INTO d FROM diagnoses WHERE id = p_diagnosis_id AND organisation_id = current_org_id();
  IF NOT FOUND OR NOT staff_can_view_results(d.student_id) THEN RAISE EXCEPTION 'Diagnosis not found'; END IF;
  IF d.status <> 'open' THEN RAISE EXCEPTION 'Only open diagnoses can be explained'; END IF;
  RETURN enqueue_ai_job('explain_diagnosis', jsonb_build_object('diagnosis_id', d.id),
                        'diagnosis', d.id, d.student_id, 'explain:' || d.id::text || ':' || d.updated_at::text);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public, pg_temp;

CREATE OR REPLACE FUNCTION request_ai_report_comment(p_report_id uuid) RETURNS uuid AS $$
DECLARE
  pr parent_reports%ROWTYPE;
BEGIN
  IF NOT has_permission('cas.manage') THEN RAISE EXCEPTION 'Permission denied: cas.manage required'; END IF;
  SELECT * INTO pr FROM parent_reports WHERE id = p_report_id AND organisation_id = current_org_id();
  IF NOT FOUND OR NOT staff_can_view_results(pr.student_id) THEN RAISE EXCEPTION 'Report not found'; END IF;
  IF pr.status <> 'draft' THEN RAISE EXCEPTION 'Comments can only be drafted for reports that are still drafts'; END IF;
  RETURN enqueue_ai_job('report_comment', jsonb_build_object('report_id', pr.id),
                        'parent_report', pr.id, pr.student_id, 'comment:' || pr.id::text);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public, pg_temp;

CREATE OR REPLACE FUNCTION cancel_ai_job(p_job_id uuid) RETURNS void AS $$
BEGIN
  UPDATE ai_jobs SET status = 'cancelled', finished_at = now()
  WHERE id = p_job_id AND organisation_id = current_org_id() AND status = 'queued'
    AND (requested_by = current_user_id() OR has_permission('ai.manage'));
  IF NOT FOUND THEN RAISE EXCEPTION 'Only queued jobs that you requested can be cancelled'; END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public, pg_temp;

-- Accept or discard an AI student review after reading it.
CREATE OR REPLACE FUNCTION review_ai_diagnostic(p_id uuid, p_accept boolean) RETURNS void AS $$
DECLARE
  a ai_diagnostics%ROWTYPE;
BEGIN
  IF NOT has_permission('cas.manage') THEN RAISE EXCEPTION 'Permission denied: cas.manage required'; END IF;
  SELECT * INTO a FROM ai_diagnostics WHERE id = p_id AND organisation_id = current_org_id() FOR UPDATE;
  IF NOT FOUND OR NOT staff_can_view_results(a.student_id) THEN RAISE EXCEPTION 'Review not found'; END IF;
  UPDATE ai_diagnostics
  SET review_state = CASE WHEN p_accept THEN 'accepted' ELSE 'discarded' END::ai_review_state,
      reviewed_by = current_user_id(), reviewed_at = now()
  WHERE id = a.id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public, pg_temp;

-- ---------------------------------------------------------------------
-- 6. Worker functions (run under the service_role role)
-- Worker loop:
--   job := claim_ai_job('worker-1')            -- null = nothing to do
--   call the model with job.template + job.context + job.input
--   success -> complete_ai_job(job_id, model_json, {model, input_tokens, output_tokens, cost_usd_micros})
--   error   -> fail_ai_job(job_id, 'message', true)
-- ---------------------------------------------------------------------

CREATE OR REPLACE FUNCTION claim_ai_job(p_worker text, p_lease_seconds integer DEFAULT 300) RETURNS jsonb AS $$
DECLARE
  j ai_jobs%ROWTYPE;
  t ai_prompt_templates%ROWTYPE;
BEGIN
  PERFORM assert_service_context();   -- Revision 6 (H4): AI worker (service_role) only
  UPDATE ai_jobs
  SET status = 'running', attempts = attempts + 1, locked_by = p_worker,
      locked_until = now() + make_interval(secs => GREATEST(p_lease_seconds, 30)),
      started_at = COALESCE(started_at, now())
  WHERE id = (SELECT id FROM ai_jobs
              WHERE status = 'queued' AND run_after <= now()
              ORDER BY priority, created_at
              FOR UPDATE SKIP LOCKED LIMIT 1)
  RETURNING * INTO j;
  IF NOT FOUND THEN RETURN NULL; END IF;
  INSERT INTO audit_events (organisation_id, action, entity_type, entity_id, after_state, actor_type, source)
  VALUES (j.organisation_id, 'ai.job.claimed', 'ai_job', j.id::text,
          jsonb_build_object('type', j.type, 'attempt', j.attempts, 'worker', left(p_worker, 100)), 'worker', 'ai-job-worker');

  SELECT * INTO t FROM ai_prompt_templates WHERE job_type = j.type AND is_active;
  IF NOT FOUND THEN
    UPDATE ai_jobs SET status = 'failed', error = 'No active prompt template', finished_at = now(),
                       locked_by = NULL, locked_until = NULL
    WHERE id = j.id;
    RETURN NULL;
  END IF;

  RETURN jsonb_build_object(
    'job_id', j.id, 'organisation_id', j.organisation_id, 'type', j.type, 'attempt', j.attempts,
    'input', j.input, 'context', build_ai_context(j),
    'template', jsonb_build_object('version', t.version, 'system', t.system_prompt,
                                   'user_template', t.user_template, 'output_schema', t.output_schema));
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public, pg_temp;

CREATE OR REPLACE FUNCTION fail_ai_job(p_job_id uuid, p_error text, p_retry boolean DEFAULT true,
                                       p_usage jsonb DEFAULT '{}'::jsonb) RETURNS void AS $$
DECLARE
  j ai_jobs%ROWTYPE;
BEGIN
  PERFORM assert_service_context();   -- Revision 6 (H4)
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
    UPDATE ai_jobs
    SET status = 'queued', error = left(p_error, 500), locked_by = NULL, locked_until = NULL,
        run_after = now() + make_interval(mins => j.attempts * j.attempts)     -- 1, 4, 9 minutes
    WHERE id = j.id;
  ELSE
    UPDATE ai_jobs
    SET status = 'failed', error = left(p_error, 500), finished_at = now(),
        locked_by = NULL, locked_until = NULL
    WHERE id = j.id;
  END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public, pg_temp;

-- Turn the model's JSON into drafts. Each item is checked on its own; a bad one
-- is recorded as 'invalid' and never blocks the good ones. Questions pass through
-- the same validation as human-written ones (e.g. exactly one correct option).
CREATE OR REPLACE FUNCTION complete_ai_job(p_job_id uuid, p_outputs jsonb, p_usage jsonb DEFAULT '{}'::jsonb)
RETURNS jsonb AS $$
DECLARE
  j      ai_jobs%ROWTYPE;
  it     jsonb;
  v_q uuid; v_qv uuid; v_n uuid; v_nv uuid;
  v_stem text; v_type question_type; v_dup boolean;
  v_title text; v_body text; v_text text; v_words integer;
  n_ok integer := 0; n_bad integer := 0; n_dup integer := 0;
  v_summary jsonb;
BEGIN
  PERFORM assert_service_context();   -- Revision 6 (H4)
  SELECT * INTO j FROM ai_jobs WHERE id = p_job_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Job not found'; END IF;
  IF j.status <> 'running' THEN RAISE EXCEPTION 'Job is not running (status: %)', j.status; END IF;
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
                  j.requested_by)   -- Revision 6: the requester is the accountable author (no self-approval)
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

  ELSIF j.type = 'review_student' THEN
    v_text := btrim(COALESCE(p_outputs ->> 'summary', ''));
    IF length(v_text) < 20 OR length(v_text) > 4000 THEN RAISE EXCEPTION 'Summary is missing or the wrong length'; END IF;
    INSERT INTO ai_diagnostics (organisation_id, student_id, job_id, summary, findings, model)
    VALUES (j.organisation_id, j.student_id, j.id, v_text, p_outputs - 'summary', p_usage ->> 'model');
    INSERT INTO ai_content (organisation_id, job_id, kind, status, student_id, payload, target_type, target_id)
    VALUES (j.organisation_id, j.id, 'student_review', 'draft_created', j.student_id, p_outputs, 'student', j.student_id);
    v_summary := jsonb_build_object('created', 1);

  ELSIF j.type = 'explain_diagnosis' THEN
    v_text := btrim(COALESCE(p_outputs ->> 'narrative', ''));
    IF length(v_text) < 20 OR length(v_text) > 3000 THEN RAISE EXCEPTION 'Narrative is missing or the wrong length'; END IF;
    UPDATE diagnoses SET narrative = v_text WHERE id = j.target_id AND organisation_id = j.organisation_id;
    INSERT INTO ai_content (organisation_id, job_id, kind, status, student_id, payload, target_type, target_id)
    VALUES (j.organisation_id, j.id, 'diagnosis_narrative', 'applied', j.student_id,
            jsonb_build_object('narrative', v_text), 'diagnosis', j.target_id);
    v_summary := jsonb_build_object('applied', 1);

  ELSIF j.type = 'report_comment' THEN
    v_text := btrim(COALESCE(p_outputs ->> 'comment', ''));
    IF length(v_text) < 20 OR length(v_text) > 1500 THEN RAISE EXCEPTION 'Comment is missing or the wrong length'; END IF;
    -- Held as a suggestion for the teacher. It reaches parents only if the teacher
    -- copies it into the report content when approving.
    INSERT INTO ai_content (organisation_id, job_id, kind, status, student_id, payload, target_type, target_id)
    VALUES (j.organisation_id, j.id, 'report_comment',
            CASE WHEN EXISTS (SELECT 1 FROM parent_reports WHERE id = j.target_id AND status = 'draft')
                 THEN 'draft_created' ELSE 'discarded' END::ai_content_status,
            j.student_id, jsonb_build_object('comment', v_text), 'parent_report', j.target_id);
    v_summary := jsonb_build_object('created', 1);
  END IF;

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
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public, pg_temp;

-- Run every minute: re-queue jobs whose worker vanished, and expire jobs stuck in the queue.
CREATE OR REPLACE FUNCTION run_ai_maintenance() RETURNS jsonb AS $$
DECLARE
  n_requeued integer; n_failed integer; n_expired integer;
BEGIN
  PERFORM assert_service_context();   -- Revision 6 (H4)
  UPDATE ai_jobs SET status = 'queued', locked_by = NULL, locked_until = NULL, run_after = now()
  WHERE status = 'running' AND locked_until < now() AND attempts < max_attempts;
  GET DIAGNOSTICS n_requeued = ROW_COUNT;

  UPDATE ai_jobs SET status = 'failed', error = 'Worker stopped responding', finished_at = now(),
                     locked_by = NULL, locked_until = NULL
  WHERE status = 'running' AND locked_until < now() AND attempts >= max_attempts;
  GET DIAGNOSTICS n_failed = ROW_COUNT;

  UPDATE ai_jobs SET status = 'failed', error = 'Expired in the queue', finished_at = now()
  WHERE status = 'queued' AND created_at < now() - interval '24 hours';
  GET DIAGNOSTICS n_expired = ROW_COUNT;

  RETURN jsonb_build_object('requeued', n_requeued, 'failed', n_failed, 'expired', n_expired);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public, pg_temp;

-- ---------------------------------------------------------------------
-- 7. Recommendations (rule-based, no AI cost)
-- Uses RELEASED mastery only: the weakest topics get a published note they have
-- not read lately, and an open practice exam they may sit.
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION refresh_recommendations(p_student_id uuid) RETURNS integer AS $$
DECLARE
  v_org uuid;
  r record;
  v_note record;
  v_exam record;
  v_pri integer := 0;
  n integer := 0;
BEGIN
  SELECT organisation_id INTO v_org FROM students WHERE id = p_student_id;
  IF NOT FOUND THEN RETURN 0; END IF;
  -- Revision 6 (M4): no session context is set; is_eligible() derives the organisation from the
  -- exam and checks it against the student, so this works for students and for backend jobs.

  UPDATE ai_recommendations SET is_active = false WHERE student_id = p_student_id AND is_active;

  FOR r IN
    SELECT tm.topic_key, tm.released_mastery AS m, t.title
    FROM topic_mastery tm
    LEFT JOIN curriculum_topics t ON t.id = tm.topic_id_latest
    WHERE tm.student_id = p_student_id AND tm.released_mastery < 0.65 AND tm.released_confidence >= 0.25
    ORDER BY tm.released_mastery ASC LIMIT 5
  LOOP
    v_pri := v_pri + 1;

    SELECT nn.id, nn.title INTO v_note
    FROM notes nn JOIN curriculum_topics ct ON ct.id = nn.topic_id
    WHERE ct.topic_key = r.topic_key AND nn.organisation_id = v_org
      AND nn.status = 'published' AND nn.deleted_at IS NULL
      AND NOT EXISTS (SELECT 1 FROM note_views nv WHERE nv.note_id = nn.id AND nv.student_id = p_student_id
                      AND nv.viewed_at > now() - interval '14 days')
      AND NOT EXISTS (SELECT 1 FROM ai_recommendations ar WHERE ar.student_id = p_student_id AND ar.note_id = nn.id
                      AND ar.dismissed_at > now() - interval '14 days')
    ORDER BY nn.updated_at DESC LIMIT 1;
    IF FOUND THEN
      INSERT INTO ai_recommendations (organisation_id, student_id, kind, topic_key, note_id, title, reason, priority)
      VALUES (v_org, p_student_id, 'note', r.topic_key, v_note.id, v_note.title,
              format('Your score in "%s" is %s%%. Reading this will help.', COALESCE(r.title, 'this topic'), round(r.m * 100)),
              v_pri);
      n := n + 1;
    END IF;

    SELECT e.id, e.title INTO v_exam
    FROM exams e
    WHERE e.organisation_id = v_org AND e.kind = 'practice' AND e.status = 'published' AND e.deleted_at IS NULL
      AND now() BETWEEN e.opens_at AND e.closes_at
      AND EXISTS (SELECT 1 FROM exam_questions eq JOIN curriculum_topics et ON et.id = eq.topic_id
                  WHERE eq.exam_id = e.id AND et.topic_key = r.topic_key)
      AND NOT EXISTS (SELECT 1 FROM ai_recommendations ar WHERE ar.student_id = p_student_id AND ar.exam_id = e.id
                      AND ar.dismissed_at > now() - interval '14 days')
      AND is_eligible(e.id, p_student_id)
    ORDER BY e.closes_at LIMIT 1;
    IF FOUND THEN
      INSERT INTO ai_recommendations (organisation_id, student_id, kind, topic_key, exam_id, title, reason, priority)
      VALUES (v_org, p_student_id, 'practice_exam', r.topic_key, v_exam.id, v_exam.title,
              format('Practise "%s" to bring your score up from %s%%.', COALESCE(r.title, 'this topic'), round(r.m * 100)),
              v_pri)
      ON CONFLICT DO NOTHING;
      n := n + 1;
    END IF;
  END LOOP;
  RETURN n;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public, pg_temp;

-- Student: refresh and read my suggestions.
CREATE OR REPLACE FUNCTION my_recommendations(p_refresh boolean DEFAULT true) RETURNS jsonb AS $$
DECLARE
  v_sid uuid := current_student_id();
BEGIN
  IF v_sid IS NULL THEN RAISE EXCEPTION 'No student record is linked to this account'; END IF;
  IF p_refresh AND NOT EXISTS (SELECT 1 FROM ai_recommendations
                               WHERE student_id = v_sid AND is_active AND created_at > now() - interval '1 day') THEN
    PERFORM refresh_recommendations(v_sid);
  END IF;
  RETURN (SELECT COALESCE(jsonb_agg(jsonb_build_object(
                   'id', r.id, 'kind', r.kind, 'title', r.title, 'reason', r.reason,
                   'note_id', r.note_id, 'exam_id', r.exam_id) ORDER BY r.priority, r.created_at), '[]'::jsonb)
          FROM ai_recommendations r
          WHERE r.student_id = v_sid AND r.is_active AND r.dismissed_at IS NULL);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public, pg_temp;

CREATE OR REPLACE FUNCTION record_recommendation_event(p_id uuid, p_event text) RETURNS void AS $$
DECLARE
  r ai_recommendations%ROWTYPE;
BEGIN
  SELECT * INTO r FROM ai_recommendations WHERE id = p_id AND organisation_id = current_org_id();
  IF NOT FOUND OR NOT is_self_or_parent(r.student_id) THEN RAISE EXCEPTION 'Recommendation not found'; END IF;
  IF p_event NOT IN ('shown', 'clicked', 'dismissed') THEN RAISE EXCEPTION 'Unknown event: %', p_event; END IF;
  UPDATE ai_recommendations SET
    shown_at     = CASE WHEN p_event = 'shown'     THEN COALESCE(shown_at, now())   ELSE shown_at END,
    clicked_at   = CASE WHEN p_event = 'clicked'   THEN COALESCE(clicked_at, now()) ELSE clicked_at END,
    dismissed_at = CASE WHEN p_event = 'dismissed' THEN COALESCE(dismissed_at, now()) ELSE dismissed_at END,
    is_active    = CASE WHEN p_event = 'dismissed' THEN false ELSE is_active END
  WHERE id = r.id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public, pg_temp;

-- Nightly: refresh suggestions for students whose mastery changed recently.
CREATE OR REPLACE FUNCTION refresh_all_recommendations(p_limit integer DEFAULT 500) RETURNS integer AS $$
DECLARE
  r record;
  n integer := 0;
BEGIN
  PERFORM assert_service_context();   -- Revision 6 (H4)
  FOR r IN SELECT DISTINCT tm.student_id FROM topic_mastery tm
           WHERE tm.updated_at > now() - interval '2 days'
           LIMIT p_limit
  LOOP
    PERFORM refresh_recommendations(r.student_id);
    n := n + 1;
  END LOOP;
  RETURN n;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public, pg_temp;

-- ---------------------------------------------------------------------
-- 8. Roles and grants
-- ---------------------------------------------------------------------
-- Supabase service_role is reserved for trusted AI worker execution.

GRANT SELECT ON ai_jobs, ai_content, ai_diagnostics, ai_recommendations, ai_usage_daily TO authenticated;

DO $$
DECLARE f record;
BEGIN
  FOR f IN SELECT p.oid::regprocedure AS sig FROM pg_proc p
           JOIN pg_namespace n ON n.oid = p.pronamespace
           WHERE n.nspname = 'public' AND p.proname = ANY (ARRAY[
             'build_ai_context','record_ai_usage','enqueue_ai_job','request_ai_questions','request_ai_note',
             'request_ai_student_review','request_ai_diagnosis_explanation','request_ai_report_comment',
             'cancel_ai_job','review_ai_diagnostic','claim_ai_job','fail_ai_job','complete_ai_job',
             'run_ai_maintenance','refresh_recommendations','my_recommendations',
             'record_recommendation_event','refresh_all_recommendations'])
  LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC', f.sig);
  END LOOP;

  FOR f IN SELECT p.oid::regprocedure AS sig FROM pg_proc p
           JOIN pg_namespace n ON n.oid = p.pronamespace
           WHERE n.nspname = 'public' AND p.proname = ANY (ARRAY[
             'request_ai_questions','request_ai_note','request_ai_student_review',
             'request_ai_diagnosis_explanation','request_ai_report_comment','cancel_ai_job',
             'review_ai_diagnostic','my_recommendations','record_recommendation_event'])
  LOOP
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO authenticated', f.sig);
  END LOOP;

  FOR f IN SELECT p.oid::regprocedure AS sig FROM pg_proc p
           JOIN pg_namespace n ON n.oid = p.pronamespace
           WHERE n.nspname = 'public' AND p.proname = ANY (ARRAY[
             'claim_ai_job','complete_ai_job','fail_ai_job','run_ai_maintenance','refresh_all_recommendations'])
  LOOP
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO service_role', f.sig);
  END LOOP;
END $$;

-- ---------------------------------------------------------------------
-- 9. Row-level security
-- ---------------------------------------------------------------------
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['ai_jobs','ai_content','ai_diagnostics','ai_recommendations','ai_usage_daily','ai_prompt_templates']
  LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
  END LOOP;
END $$;
-- ai_prompt_templates: no client policy; the trusted worker reads it through claim_ai_job().

CREATE POLICY ai_jobs_read ON ai_jobs FOR SELECT TO authenticated
  USING (organisation_id = (SELECT current_org_id())
         AND (requested_by = (SELECT current_user_id()) OR (SELECT has_permission('ai.manage'))));

CREATE POLICY ai_content_read ON ai_content FOR SELECT TO authenticated
  USING (organisation_id = (SELECT current_org_id()) AND (SELECT has_permission('ai.use'))
         AND (student_id IS NULL OR staff_can_view_results(student_id)));

CREATE POLICY ai_diagnostics_read ON ai_diagnostics FOR SELECT TO authenticated
  USING (organisation_id = (SELECT current_org_id()) AND (SELECT has_permission('ai.use'))
         AND staff_can_view_results(student_id));

CREATE POLICY ai_recommendations_read ON ai_recommendations FOR SELECT TO authenticated
  USING (organisation_id = (SELECT current_org_id())
         AND (staff_can_view_results(student_id) OR is_self_or_parent(student_id)));

CREATE POLICY ai_usage_read ON ai_usage_daily FOR SELECT TO authenticated
  USING (organisation_id = (SELECT current_org_id()) AND (SELECT has_permission('ai.manage')));

-- ---------------------------------------------------------------------
-- 10. Views (Postgres 15+ for security_invoker)
-- ---------------------------------------------------------------------

-- This month's spend by job type, for administrators.
CREATE VIEW ai_usage_this_month WITH (security_invoker = true) AS
SELECT j.organisation_id, j.type,
       count(*)                       AS jobs,
       count(*) FILTER (WHERE j.status = 'failed') AS failed,
       COALESCE(sum(j.input_tokens), 0)  AS input_tokens,
       COALESCE(sum(j.output_tokens), 0) AS output_tokens,
       round(COALESCE(sum(j.cost_usd_micros), 0) / 1000000.0, 4) AS cost_usd
FROM ai_jobs j
WHERE j.created_at >= date_trunc('month', now())
GROUP BY j.organisation_id, j.type;

-- Is the AI worth it? What share of generated drafts do your reviewers keep?
CREATE VIEW ai_review_outcomes WITH (security_invoker = true) AS
SELECT s.organisation_id, s.kind, s.model,
       count(*) FILTER (WHERE s.cstatus = 'draft_created')                      AS generated,
       count(*) FILTER (WHERE s.cstatus IN ('invalid', 'duplicate'))            AS rejected_by_checks,
       count(*) FILTER (WHERE s.vstatus IN ('approved', 'published'))           AS kept_by_reviewers,
       count(*) FILTER (WHERE s.vstatus = 'archived')                           AS rejected_by_reviewers,
       count(*) FILTER (WHERE s.vstatus IN ('draft', 'in_review'))              AS awaiting_review
FROM (
  SELECT ac.organisation_id, ac.kind, j.model, ac.status AS cstatus, v.status::text AS vstatus
  FROM ai_content ac
  JOIN ai_jobs j ON j.id = ac.job_id
  LEFT JOIN question_versions v ON ac.target_type = 'question_version' AND v.id = ac.target_id
  WHERE ac.kind = 'question_draft'
  UNION ALL
  SELECT ac.organisation_id, ac.kind, j.model, ac.status, v.status::text
  FROM ai_content ac
  JOIN ai_jobs j ON j.id = ac.job_id
  LEFT JOIN note_versions v ON ac.target_type = 'note_version' AND v.id = ac.target_id
  WHERE ac.kind = 'note_draft'
) s
GROUP BY s.organisation_id, s.kind, s.model;

-- A teacher's own AI drafts waiting for review.
CREATE VIEW my_ai_drafts WITH (security_invoker = true) AS
SELECT ac.organisation_id, ac.id AS ai_content_id, ac.kind, ac.status, ac.target_type, ac.target_id,
       ac.created_at, j.requested_by
FROM ai_content ac
JOIN ai_jobs j ON j.id = ac.job_id
WHERE ac.status = 'draft_created' AND j.requested_by = current_user_id();

GRANT SELECT ON ai_usage_this_month, ai_review_outcomes, my_ai_drafts TO authenticated;

INSERT INTO public.schema_migrations (version, description) VALUES ('008', 'AI services (rev 6)');

COMMIT;

-- =====================================================================
-- Notes
-- 1. The worker is a small service (Node, a Supabase Edge Function, a
--    cron-triggered serverless function). It loops: claim_ai_job() ->
--    call the model with template.system and the user_template filled
--    with input and context -> parse JSON -> complete_ai_job(). Keep the
--    model API key in that service's secrets, never in the database.
--    Ask the model for JSON that matches template.output_schema, and
--    pass real token counts and cost so budgets work.
-- 2. Reviewing AI drafts: generated questions and notes are ordinary
--    drafts (source = 'ai'). Submit them with submit_question_version() /
--    submit_note_version(), review and publish as usual. They have no
--    human author, so the teacher who requested them CAN review them,
--    which also solves the "solo organisation" review problem.
-- 3. Privacy: build_ai_context() sends topic data, mastery numbers and
--    diagnosis text only. Never names, admission numbers, contacts or
--    IDs. The parent-comment prompt uses the token [Student]; replace it
--    in the app. Schools can switch AI off with organisation_settings
--    key ai_enabled = false. Tell parents in your privacy notice that AI
--    is used to draft materials and comments for teacher review.
-- 4. Cost control: ai_daily_job_limit (100) and
--    ai_monthly_budget_usd_micros (no limit by default) are enforced
--    when jobs are queued. When migration 009 adds platform billing,
--    "AI credits" will plug in as an entitlement.
-- 5. Scheduling: call run_ai_maintenance() every minute and
--    refresh_all_recommendations() nightly (both as service_role).
-- 6. Not included yet: a student-facing AI tutor (chat). It needs its own
--    safety design (age-appropriate answers, curriculum grounding, logging
--    and parental visibility) and is better as a separate migration.
-- 7. Prompt changes: insert version 2 of a template and set is_active
--    on it (turn the old one off first; only one is active per type).
--    ai_review_outcomes lets you compare how reviewers treat each model.
-- =====================================================================
