-- =====================================================================
-- Aibinu FlexiPrep: Migration 007
-- CAS / Academic Intelligence: learning evidence, topic mastery, trends,
-- diagnosis, interventions, reassessment, parent reports
-- Requires: 001-006
--
-- How it works (all automatic, driven by triggers on the CBT tables):
--   marked response  -> response_events   (one learning fact per answer)
--   scored attempt   -> assessment_events (one per attempt)
--   new evidence     -> topic_mastery     (weighted, time-decayed score per topic)
--                    -> mastery_snapshots (history, for trends)
--                    -> diagnoses         (weak topic / prerequisite gap / declining)
--                    -> interventions     (suggested notes, practice, teacher action)
--   later evidence   -> reassessments     (did the intervention work?)
-- =====================================================================

BEGIN;
SELECT public.migration_begin('007', '006');   -- Revision 6 (M5)

-- ---------------------------------------------------------------------
-- 1. Enums and permissions
-- ---------------------------------------------------------------------
CREATE TYPE diagnosis_kind      AS ENUM ('weak_topic', 'prerequisite_gap', 'declining');
CREATE TYPE diagnosis_status    AS ENUM ('open', 'resolved', 'superseded', 'dismissed');
CREATE TYPE severity_level      AS ENUM ('low', 'medium', 'high');
CREATE TYPE diagnosis_source    AS ENUM ('rule', 'ai');
CREATE TYPE intervention_type   AS ENUM ('note', 'practice', 'teacher_action', 'parent_message', 'remedial_class');
CREATE TYPE intervention_status AS ENUM ('suggested', 'assigned', 'in_progress', 'completed', 'cancelled');
CREATE TYPE reassessment_outcome AS ENUM ('improved', 'unchanged', 'declined');
CREATE TYPE report_status       AS ENUM ('draft', 'approved', 'sent');

-- Revision 6 (C1/C5): permission seed removed; the catalogue and role mappings live in 001.

-- Revision 6 (C1/C5): permission seed removed; the catalogue and role mappings live in 001.

-- ---------------------------------------------------------------------
-- 2. Tables
-- Mastery is tracked by topic_key (stable across syllabus versions), not topic_id.
-- ---------------------------------------------------------------------

-- One row per attempt: the "an assessment happened" fact.
CREATE TABLE assessment_events (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organisation_id  uuid NOT NULL REFERENCES organisations(id) ON DELETE CASCADE,
  student_id       uuid NOT NULL,
  attempt_id       uuid NOT NULL UNIQUE,
  exam_id          uuid NOT NULL,
  subject_id       uuid,
  exam_kind        exam_kind NOT NULL,
  class_id         uuid,
  score            numeric(7,2) NOT NULL,
  total_marks      numeric(7,2) NOT NULL,
  percentage       numeric(5,2) NOT NULL,
  marking_complete boolean NOT NULL DEFAULT false,
  occurred_at      timestamptz NOT NULL,
  released_at      timestamptz,                 -- copied from results; families see data only after this
  voided           boolean NOT NULL DEFAULT false,
  updated_at       timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (student_id, organisation_id) REFERENCES students(id, organisation_id) ON DELETE CASCADE,
  FOREIGN KEY (attempt_id, organisation_id) REFERENCES attempts(id, organisation_id) ON DELETE CASCADE
);
CREATE INDEX idx_ae_student ON assessment_events(student_id, occurred_at DESC);

-- One row per marked answer: the smallest unit of learning evidence.
-- Re-marking a response updates its row; voiding an attempt switches is_current off.
CREATE TABLE response_events (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organisation_id uuid NOT NULL REFERENCES organisations(id) ON DELETE CASCADE,
  student_id      uuid NOT NULL,
  attempt_id      uuid NOT NULL,
  response_id     uuid NOT NULL UNIQUE REFERENCES responses(id) ON DELETE CASCADE,
  exam_id         uuid NOT NULL,
  question_id     uuid,
  topic_id        uuid NOT NULL,
  topic_key       uuid NOT NULL,
  marks_possible  numeric(6,2) NOT NULL CHECK (marks_possible > 0),
  marks_awarded   numeric(6,2) NOT NULL CHECK (marks_awarded >= 0),
  fraction        numeric(5,4) NOT NULL CHECK (fraction BETWEEN 0 AND 1),   -- partial credit counts
  correct         boolean NOT NULL,
  difficulty      difficulty_level,
  cognitive_level cognitive_level,
  time_spent_s    integer,
  kind_weight     numeric(3,2) NOT NULL DEFAULT 1.0,   -- exam 1.2, test/mock 1.0, practice 0.6
  occurred_at     timestamptz NOT NULL,
  is_current      boolean NOT NULL DEFAULT true,
  updated_at      timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (student_id, organisation_id) REFERENCES students(id, organisation_id) ON DELETE CASCADE,
  FOREIGN KEY (attempt_id, organisation_id) REFERENCES attempts(id, organisation_id) ON DELETE CASCADE
);
CREATE INDEX idx_re_student_topic ON response_events(student_id, topic_key) WHERE is_current;
CREATE INDEX idx_re_attempt       ON response_events(attempt_id);

-- Current standing per student per topic. Two sets of numbers:
--   mastery_*     : all evidence (staff only)
--   released_*    : only results already released to families
CREATE TABLE topic_mastery (
  organisation_id      uuid NOT NULL REFERENCES organisations(id) ON DELETE CASCADE,
  student_id           uuid NOT NULL,
  topic_key            uuid NOT NULL,
  topic_id_latest      uuid,
  subject_id           uuid,
  mastery_score        numeric(5,4) NOT NULL,        -- 0 to 1
  confidence           numeric(4,3) NOT NULL,        -- 0 to 1, grows with evidence
  evidence_n           integer NOT NULL,
  level                text NOT NULL,
  released_mastery     numeric(5,4),
  released_confidence  numeric(4,3),
  released_evidence_n  integer NOT NULL DEFAULT 0,
  first_assessed_at    timestamptz,
  last_assessed_at     timestamptz,
  updated_at           timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (student_id, topic_key),
  FOREIGN KEY (student_id, organisation_id) REFERENCES students(id, organisation_id) ON DELETE CASCADE
);
CREATE INDEX idx_tm_topic ON topic_mastery(organisation_id, topic_key);

-- History, for trends.
CREATE TABLE mastery_snapshots (
  id               bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  organisation_id  uuid NOT NULL REFERENCES organisations(id) ON DELETE CASCADE,
  student_id       uuid NOT NULL,
  topic_key        uuid NOT NULL,
  mastery_score    numeric(5,4) NOT NULL,
  released_mastery numeric(5,4),
  confidence       numeric(4,3) NOT NULL,
  evidence_n       integer NOT NULL,
  taken_at         timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (student_id, organisation_id) REFERENCES students(id, organisation_id) ON DELETE CASCADE
);
CREATE INDEX idx_ms_student_topic ON mastery_snapshots(student_id, topic_key, taken_at DESC);

CREATE TABLE diagnoses (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organisation_id uuid NOT NULL REFERENCES organisations(id) ON DELETE CASCADE,
  student_id      uuid NOT NULL,
  topic_key       uuid NOT NULL,               -- where the student is struggling
  root_topic_key  uuid,                        -- the prerequisite gap behind it, if found
  kind            diagnosis_kind NOT NULL,
  severity        severity_level NOT NULL,
  finding         text NOT NULL,
  narrative       text,                        -- optional AI-written explanation (migration 008)
  evidence        jsonb NOT NULL DEFAULT '{}'::jsonb,
  generated_by    diagnosis_source NOT NULL DEFAULT 'rule',
  status          diagnosis_status NOT NULL DEFAULT 'open',
  dismissed_by    uuid REFERENCES users(id),
  dismissed_reason text,
  dismissed_at    timestamptz,
  resolved_at     timestamptz,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  UNIQUE (id, organisation_id),
  FOREIGN KEY (student_id, organisation_id) REFERENCES students(id, organisation_id) ON DELETE CASCADE
);
CREATE UNIQUE INDEX uq_open_diagnosis ON diagnoses(student_id, topic_key, kind) WHERE status = 'open';
CREATE INDEX idx_diag_open ON diagnoses(organisation_id, severity) WHERE status = 'open';

CREATE TABLE interventions (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organisation_id  uuid NOT NULL REFERENCES organisations(id) ON DELETE CASCADE,
  student_id       uuid NOT NULL,
  diagnosis_id     uuid,
  target_topic_key uuid NOT NULL,
  type             intervention_type NOT NULL,
  title            text NOT NULL,
  description      text,
  target_note_id   uuid,
  status           intervention_status NOT NULL DEFAULT 'suggested',
  assigned_to      uuid REFERENCES users(id),      -- the teacher responsible
  assigned_by      uuid REFERENCES users(id),
  due_on           date,
  baseline_mastery numeric(5,4),                   -- mastery when it was assigned
  assigned_at      timestamptz,
  completed_at     timestamptz,
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now(),
  UNIQUE (id, organisation_id),
  FOREIGN KEY (student_id, organisation_id)    REFERENCES students(id, organisation_id) ON DELETE CASCADE,
  FOREIGN KEY (diagnosis_id, organisation_id)  REFERENCES diagnoses(id, organisation_id) ON DELETE SET NULL (diagnosis_id),
  FOREIGN KEY (target_note_id, organisation_id) REFERENCES notes(id, organisation_id) ON DELETE SET NULL (target_note_id)
);
CREATE INDEX idx_interventions_student ON interventions(student_id, status);
CREATE INDEX idx_interventions_topic   ON interventions(student_id, target_topic_key) WHERE status = 'completed';

-- Did it work? One row per completed intervention, created when new evidence arrives.
CREATE TABLE reassessments (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organisation_id  uuid NOT NULL REFERENCES organisations(id) ON DELETE CASCADE,
  student_id       uuid NOT NULL,
  intervention_id  uuid NOT NULL UNIQUE,
  topic_key        uuid NOT NULL,
  baseline_mastery numeric(5,4),
  result_mastery   numeric(5,4) NOT NULL,
  delta            numeric(5,4),
  outcome          reassessment_outcome NOT NULL,
  assessed_at      timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (student_id, organisation_id)      REFERENCES students(id, organisation_id) ON DELETE CASCADE,
  FOREIGN KEY (intervention_id, organisation_id) REFERENCES interventions(id, organisation_id) ON DELETE CASCADE
);

-- Periodic report to a parent. Drafted by the system, checked by a teacher, then sent.
CREATE TABLE parent_reports (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organisation_id uuid NOT NULL REFERENCES organisations(id) ON DELETE CASCADE,
  student_id      uuid NOT NULL,
  period_start    date NOT NULL,
  period_end      date NOT NULL,
  title           text NOT NULL,
  content         jsonb NOT NULL,              -- built only from results already released
  status          report_status NOT NULL DEFAULT 'draft',
  created_by      uuid DEFAULT current_user_id() REFERENCES users(id),
  approved_by     uuid REFERENCES users(id),
  approved_at     timestamptz,
  sent_via        text,                        -- 'whatsapp', 'sms', 'email', 'print'
  sent_at         timestamptz,
  created_at      timestamptz NOT NULL DEFAULT now(),
  UNIQUE (student_id, period_start, period_end),
  CHECK (period_end >= period_start),
  FOREIGN KEY (student_id, organisation_id) REFERENCES students(id, organisation_id) ON DELETE CASCADE
);

DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['diagnoses', 'interventions']
  LOOP
    EXECUTE format('CREATE TRIGGER trg_%s_updated BEFORE UPDATE ON %I
                    FOR EACH ROW EXECUTE FUNCTION set_updated_at()', t, t);
  END LOOP;
END $$;

-- ---------------------------------------------------------------------
-- 3. Calculation core (internal; not callable by the app role)
-- ---------------------------------------------------------------------

-- Levels. Thresholds match the default weak cut-off of 0.50.
CREATE OR REPLACE FUNCTION mastery_level(p_score numeric, p_conf numeric) RETURNS text AS $$
  SELECT CASE WHEN p_score IS NULL OR COALESCE(p_conf, 0) < 0.25 THEN 'insufficient_data'
              WHEN p_score < 0.50 THEN 'weak'
              WHEN p_score < 0.65 THEN 'developing'
              WHEN p_score < 0.80 THEN 'proficient'
              ELSE 'mastered' END;
$$ LANGUAGE sql IMMUTABLE;

-- Turn a marked response into a learning fact.
CREATE OR REPLACE FUNCTION upsert_response_event(p_response_id uuid) RETURNS void AS $$
DECLARE
  r   responses%ROWTYPE;
  att attempts%ROWTYPE;
  eq  exam_questions%ROWTYPE;
  qv  question_versions%ROWTYPE;
  ex  exams%ROWTYPE;
  v_key   uuid;
  v_max   numeric;
  v_w     numeric;
BEGIN
  SELECT * INTO r FROM responses WHERE id = p_response_id;
  IF NOT FOUND OR r.marks_awarded IS NULL OR r.marking_status = 'pending' OR r.topic_id IS NULL THEN RETURN; END IF;

  SELECT * INTO att FROM attempts WHERE id = r.attempt_id;
  IF att.status IN ('in_progress', 'voided') THEN RETURN; END IF;

  SELECT * INTO eq FROM exam_questions WHERE id = r.exam_question_id;
  SELECT * INTO qv FROM question_versions WHERE id = eq.question_version_id;
  SELECT * INTO ex FROM exams WHERE id = r.exam_id;
  SELECT topic_key INTO v_key FROM curriculum_topics WHERE id = r.topic_id;
  v_max := COALESCE(eq.marks, qv.marks);
  IF v_key IS NULL OR COALESCE(v_max, 0) <= 0 THEN RETURN; END IF;

  v_w := CASE ex.kind WHEN 'practice' THEN 0.6 WHEN 'exam' THEN 1.2 ELSE 1.0 END;

  INSERT INTO response_events
    (organisation_id, student_id, attempt_id, response_id, exam_id, question_id, topic_id, topic_key,
     marks_possible, marks_awarded, fraction, correct, difficulty, cognitive_level, time_spent_s,
     kind_weight, occurred_at, is_current)
  VALUES (r.organisation_id, r.student_id, r.attempt_id, r.id, r.exam_id, qv.question_id, r.topic_id, v_key,
          v_max, LEAST(r.marks_awarded, v_max), LEAST(1, round(r.marks_awarded / v_max, 4)),
          COALESCE(r.is_correct, r.marks_awarded >= v_max), qv.difficulty, qv.cognitive_level, r.time_spent_s,
          v_w, COALESCE(att.submitted_at, r.answered_at, now()), true)
  ON CONFLICT (response_id) DO UPDATE
    SET marks_awarded = EXCLUDED.marks_awarded,
        fraction      = EXCLUDED.fraction,
        correct       = EXCLUDED.correct,
        is_current    = true,
        updated_at    = now();
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public, pg_temp;

CREATE OR REPLACE FUNCTION upsert_assessment_event(p_result_id uuid) RETURNS void AS $$
DECLARE
  r   results%ROWTYPE;
  att attempts%ROWTYPE;
  ex  exams%ROWTYPE;
BEGIN
  SELECT * INTO r FROM results WHERE id = p_result_id;
  IF NOT FOUND THEN RETURN; END IF;
  SELECT * INTO att FROM attempts WHERE id = r.attempt_id;
  SELECT * INTO ex  FROM exams WHERE id = r.exam_id;

  INSERT INTO assessment_events
    (organisation_id, student_id, attempt_id, exam_id, subject_id, exam_kind, class_id,
     score, total_marks, percentage, marking_complete, occurred_at, released_at, voided)
  VALUES (r.organisation_id, r.student_id, r.attempt_id, r.exam_id, ex.subject_id, ex.kind, r.class_id,
          r.score, r.total_marks, r.percentage, r.marking_complete,
          COALESCE(att.submitted_at, r.computed_at), r.released_at, att.status = 'voided')
  ON CONFLICT (attempt_id) DO UPDATE
    SET score = EXCLUDED.score, total_marks = EXCLUDED.total_marks, percentage = EXCLUDED.percentage,
        marking_complete = EXCLUDED.marking_complete, class_id = EXCLUDED.class_id,
        released_at = EXCLUDED.released_at, voided = EXCLUDED.voided, updated_at = now();
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public, pg_temp;

-- Mastery = weighted average of answer fractions, where each answer's weight is
--   difficulty (easy 0.8, medium 1.0, hard 1.3)
--   x exam type (exam 1.2, test/mock 1.0, practice 0.6)
--   x recency (halves every 45 days; setting 'mastery_half_life_days')
-- Confidence = 1 - exp(-total_weight / 4): roughly four solid answers to be "fairly sure".
CREATE OR REPLACE FUNCTION recompute_topic_mastery(p_student_id uuid, p_topic_key uuid) RETURNS void AS $$
DECLARE
  v_org   uuid;
  v_half  numeric;
  v_m numeric; v_w numeric; v_n integer; v_first timestamptz; v_last timestamptz; v_topic uuid;
  v_rm numeric; v_rw numeric; v_rn integer;
  v_conf numeric; v_rconf numeric; v_subject uuid;
BEGIN
  SELECT organisation_id INTO v_org FROM students WHERE id = p_student_id;
  IF NOT FOUND THEN RETURN; END IF;
  v_half := GREATEST(COALESCE((org_setting(v_org, 'mastery_half_life_days', '45'::jsonb) #>> '{}')::numeric, 45), 1);

  SELECT SUM(wt * fraction) / NULLIF(SUM(wt), 0),
         SUM(wt), COUNT(*), MIN(occurred_at), MAX(occurred_at),
         (array_agg(topic_id ORDER BY occurred_at DESC))[1],
         SUM(wt * fraction) FILTER (WHERE rel) / NULLIF(SUM(wt) FILTER (WHERE rel), 0),
         SUM(wt) FILTER (WHERE rel),
         COUNT(*) FILTER (WHERE rel)
  INTO v_m, v_w, v_n, v_first, v_last, v_topic, v_rm, v_rw, v_rn
  FROM (
    SELECT re.fraction, re.topic_id, re.occurred_at, (ae.released_at IS NOT NULL) AS rel,
           (CASE re.difficulty WHEN 'easy' THEN 0.8 WHEN 'hard' THEN 1.3 ELSE 1.0 END)
           * re.kind_weight
           * power(0.5, GREATEST(extract(epoch FROM (now() - re.occurred_at)) / 86400.0, 0) / v_half) AS wt
    FROM response_events re
    JOIN assessment_events ae ON ae.attempt_id = re.attempt_id AND NOT ae.voided
    WHERE re.student_id = p_student_id AND re.topic_key = p_topic_key AND re.is_current
  ) x;

  IF COALESCE(v_n, 0) = 0 THEN
    DELETE FROM topic_mastery WHERE student_id = p_student_id AND topic_key = p_topic_key;
    PERFORM run_diagnosis(p_student_id, p_topic_key);
    RETURN;
  END IF;

  v_m     := round(v_m, 4);
  v_conf  := round(1 - exp(-v_w / 4.0), 3);
  v_rm    := round(v_rm, 4);
  v_rconf := CASE WHEN v_rw IS NULL THEN NULL ELSE round(1 - exp(-v_rw / 4.0), 3) END;

  SELECT c.subject_id INTO v_subject
  FROM curriculum_topics t
  JOIN curriculum_versions cv ON cv.id = t.version_id
  JOIN curricula c ON c.id = cv.curriculum_id
  WHERE t.id = v_topic;

  INSERT INTO topic_mastery
    (organisation_id, student_id, topic_key, topic_id_latest, subject_id, mastery_score, confidence,
     evidence_n, level, released_mastery, released_confidence, released_evidence_n,
     first_assessed_at, last_assessed_at, updated_at)
  VALUES (v_org, p_student_id, p_topic_key, v_topic, v_subject, v_m, v_conf,
          v_n, mastery_level(v_m, v_conf), v_rm, v_rconf, COALESCE(v_rn, 0),
          v_first, v_last, now())
  ON CONFLICT (student_id, topic_key) DO UPDATE
    SET topic_id_latest = EXCLUDED.topic_id_latest, subject_id = EXCLUDED.subject_id,
        mastery_score = EXCLUDED.mastery_score, confidence = EXCLUDED.confidence,
        evidence_n = EXCLUDED.evidence_n, level = EXCLUDED.level,
        released_mastery = EXCLUDED.released_mastery, released_confidence = EXCLUDED.released_confidence,
        released_evidence_n = EXCLUDED.released_evidence_n,
        first_assessed_at = EXCLUDED.first_assessed_at, last_assessed_at = EXCLUDED.last_assessed_at,
        updated_at = now();

  -- keep history, but only when something actually changed
  INSERT INTO mastery_snapshots (organisation_id, student_id, topic_key, mastery_score, released_mastery, confidence, evidence_n)
  SELECT v_org, p_student_id, p_topic_key, v_m, v_rm, v_conf, v_n
  WHERE NOT EXISTS (
    SELECT 1 FROM (SELECT mastery_score, released_mastery FROM mastery_snapshots
                   WHERE student_id = p_student_id AND topic_key = p_topic_key
                   ORDER BY taken_at DESC, id DESC LIMIT 1) prev_snap
    WHERE prev_snap.mastery_score = v_m AND prev_snap.released_mastery IS NOT DISTINCT FROM v_rm);

  PERFORM run_diagnosis(p_student_id, p_topic_key);
  PERFORM record_reassessments(p_student_id, p_topic_key);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public, pg_temp;

CREATE OR REPLACE FUNCTION refresh_mastery_for_attempt(p_attempt_id uuid) RETURNS void AS $$
DECLARE r record;
BEGIN
  FOR r IN SELECT DISTINCT student_id, topic_key FROM response_events WHERE attempt_id = p_attempt_id LOOP
    PERFORM recompute_topic_mastery(r.student_id, r.topic_key);
  END LOOP;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public, pg_temp;

-- ---------------------------------------------------------------------
-- 4. Diagnosis and intervention rules (rule-based and explainable)
-- ---------------------------------------------------------------------

-- Suggest the next steps for a new diagnosis: revise the note, practise, and for
-- serious cases a teacher review. Targets the root gap when there is one.
CREATE OR REPLACE FUNCTION suggest_interventions(p_diagnosis_id uuid) RETURNS void AS $$
DECLARE
  d       diagnoses%ROWTYPE;
  v_key   uuid;
  v_title text;
  v_note  uuid;
BEGIN
  SELECT * INTO d FROM diagnoses WHERE id = p_diagnosis_id;
  IF NOT FOUND THEN RETURN; END IF;
  v_key := COALESCE(d.root_topic_key, d.topic_key);

  SELECT title INTO v_title FROM curriculum_topics
  WHERE topic_key = v_key AND organisation_id = d.organisation_id
  ORDER BY created_at DESC LIMIT 1;
  v_title := COALESCE(v_title, 'this topic');

  SELECT n.id INTO v_note
  FROM notes n JOIN curriculum_topics t ON t.id = n.topic_id
  WHERE t.topic_key = v_key AND n.organisation_id = d.organisation_id
    AND n.status = 'published' AND n.deleted_at IS NULL
  ORDER BY n.updated_at DESC LIMIT 1;

  IF v_note IS NOT NULL THEN
    INSERT INTO interventions (organisation_id, student_id, diagnosis_id, target_topic_key, type, title, target_note_id)
    VALUES (d.organisation_id, d.student_id, d.id, v_key, 'note', 'Revise: ' || v_title, v_note);
  END IF;

  INSERT INTO interventions (organisation_id, student_id, diagnosis_id, target_topic_key, type, title, description)
  VALUES (d.organisation_id, d.student_id, d.id, v_key, 'practice', 'Practice questions: ' || v_title,
          'Short practice set on ' || v_title || ', then re-check with a quiz.');

  IF d.severity = 'high' THEN
    INSERT INTO interventions (organisation_id, student_id, diagnosis_id, target_topic_key, type, title, description)
    VALUES (d.organisation_id, d.student_id, d.id, v_key, 'teacher_action', 'One-to-one review: ' || v_title,
            'Mastery is very low; a short teacher-led review is recommended.');
  END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public, pg_temp;

-- Rules, in order:
--   1. mastery recovered (weak threshold + 0.15) -> close open diagnoses for the topic,
--      and any prerequisite-gap diagnoses that pointed at it.
--   2. too little evidence (confidence < 0.25)  -> do nothing.
--   3. mastery below the weak threshold (default 0.50, setting 'cas_weak_threshold'):
--        a weak PREREQUISITE (via the curriculum prerequisite graph) -> prerequisite_gap
--        otherwise                                                    -> weak_topic
--   4. not weak but falling 0.15+ over the last three snapshots, mastery < 0.70 -> declining
-- A diagnosis a teacher dismissed is not re-raised for 30 days.
CREATE OR REPLACE FUNCTION run_diagnosis(p_student_id uuid, p_topic_key uuid) RETURNS void AS $$
DECLARE
  tm        topic_mastery%ROWTYPE;
  v_weak    numeric;
  v_recover numeric;
  v_title   text;
  root      record;
  v_root_found boolean := false;
  v_kind    diagnosis_kind;
  v_sev     severity_level;
  v_finding text;
  v_evidence jsonb;
  v_root_key uuid;
  v_hist    numeric[];
  v_diag    uuid;
BEGIN
  SELECT * INTO tm FROM topic_mastery WHERE student_id = p_student_id AND topic_key = p_topic_key;
  IF NOT FOUND THEN
    UPDATE diagnoses SET status = 'superseded', resolved_at = now()
    WHERE student_id = p_student_id AND topic_key = p_topic_key AND status = 'open';
    RETURN;
  END IF;

  v_weak    := COALESCE((org_setting(tm.organisation_id, 'cas_weak_threshold', '0.5'::jsonb) #>> '{}')::numeric, 0.5);
  v_recover := LEAST(v_weak + 0.15, 0.95);

  IF tm.confidence >= 0.25 AND tm.mastery_score >= v_recover THEN
    UPDATE diagnoses SET status = 'resolved', resolved_at = now()
    WHERE student_id = p_student_id AND status = 'open'
      AND (topic_key = p_topic_key OR root_topic_key = p_topic_key);
  END IF;

  IF tm.confidence < 0.25 THEN RETURN; END IF;

  SELECT title INTO v_title FROM curriculum_topics WHERE id = tm.topic_id_latest;
  v_title := COALESCE(v_title, 'this topic');

  IF tm.mastery_score < v_weak THEN
    SELECT pt.topic_key AS topic_key, pt.title AS title, pm.mastery_score AS mastery
    INTO root
    FROM topic_prerequisite_chain(tm.topic_id_latest) ch
    JOIN curriculum_topics pt ON pt.id = ch.topic_id
    JOIN topic_mastery pm ON pm.student_id = p_student_id AND pm.topic_key = pt.topic_key
    WHERE pm.confidence >= 0.25 AND pm.mastery_score < v_weak AND ch.strength >= 2
    ORDER BY ch.depth DESC, pm.mastery_score ASC
    LIMIT 1;
    v_root_found := FOUND;

    v_sev := CASE WHEN tm.mastery_score < 0.30 THEN 'high'
                  WHEN tm.mastery_score < 0.42 THEN 'medium'
                  ELSE 'low' END;
    v_evidence := jsonb_build_object('mastery', tm.mastery_score, 'confidence', tm.confidence,
                                     'answers_counted', tm.evidence_n);

    IF v_root_found THEN
      v_kind := 'prerequisite_gap';
      v_root_key := root.topic_key;
      v_finding := format('Struggling with "%s" (%s%%). The likely gap is the prerequisite "%s" (%s%%).',
                          v_title, round(tm.mastery_score * 100), root.title, round(root.mastery * 100));
      v_evidence := v_evidence || jsonb_build_object('root_topic', root.title, 'root_mastery', root.mastery);
    ELSE
      v_kind := 'weak_topic';
      v_root_key := NULL;
      v_finding := format('Weak in "%s": %s%% across %s answers.',
                          v_title, round(tm.mastery_score * 100), tm.evidence_n);
    END IF;

  ELSE
    SELECT array_agg(h.mastery_score ORDER BY h.taken_at DESC, h.id DESC) INTO v_hist
    FROM (SELECT id, taken_at, mastery_score FROM mastery_snapshots
          WHERE student_id = p_student_id AND topic_key = p_topic_key
          ORDER BY taken_at DESC, id DESC LIMIT 3) h;
    IF COALESCE(array_length(v_hist, 1), 0) = 3 AND v_hist[1] - v_hist[3] <= -0.15 AND tm.mastery_score < 0.70 THEN
      v_kind := 'declining';
      v_sev := 'medium';
      v_root_key := NULL;
      v_finding := format('"%s" is slipping: down from %s%% to %s%% over the last three assessments.',
                          v_title, round(v_hist[3] * 100), round(v_hist[1] * 100));
      v_evidence := jsonb_build_object('mastery', tm.mastery_score, 'previous', v_hist[3]);
    ELSE
      RETURN;
    END IF;
  END IF;

  -- update the open diagnosis of this kind, or raise a new one
  UPDATE diagnoses
  SET severity = v_sev, finding = v_finding, evidence = v_evidence, root_topic_key = v_root_key
  WHERE student_id = p_student_id AND topic_key = p_topic_key AND kind = v_kind AND status = 'open'
  RETURNING id INTO v_diag;

  IF v_diag IS NULL THEN
    IF EXISTS (SELECT 1 FROM diagnoses
               WHERE student_id = p_student_id AND topic_key = p_topic_key AND kind = v_kind
                 AND status = 'dismissed' AND dismissed_at > now() - interval '30 days') THEN
      RETURN;
    END IF;
    UPDATE diagnoses SET status = 'superseded', resolved_at = now()
    WHERE student_id = p_student_id AND topic_key = p_topic_key AND status = 'open' AND kind <> v_kind;

    INSERT INTO diagnoses (organisation_id, student_id, topic_key, root_topic_key, kind, severity, finding, evidence)
    VALUES (tm.organisation_id, p_student_id, p_topic_key, v_root_key, v_kind, v_sev, v_finding, v_evidence)
    RETURNING id INTO v_diag;
    PERFORM suggest_interventions(v_diag);
  END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public, pg_temp;

-- Close the loop: when new evidence arrives after a completed intervention,
-- record whether mastery moved (+/-0.10 counts as a real change).
CREATE OR REPLACE FUNCTION record_reassessments(p_student_id uuid, p_topic_key uuid) RETURNS void AS $$
DECLARE
  i  record;
  tm topic_mastery%ROWTYPE;
  v_base numeric;
  v_delta numeric;
BEGIN
  SELECT * INTO tm FROM topic_mastery WHERE student_id = p_student_id AND topic_key = p_topic_key;
  IF NOT FOUND THEN RETURN; END IF;

  FOR i IN
    SELECT iv.id, iv.organisation_id, iv.baseline_mastery, dg.evidence
    FROM interventions iv
    LEFT JOIN diagnoses dg ON dg.id = iv.diagnosis_id
    WHERE iv.student_id = p_student_id AND iv.target_topic_key = p_topic_key
      AND iv.status = 'completed'
      AND NOT EXISTS (SELECT 1 FROM reassessments r WHERE r.intervention_id = iv.id)
      AND EXISTS (SELECT 1 FROM response_events re
                  WHERE re.student_id = p_student_id AND re.topic_key = p_topic_key
                    AND re.is_current AND re.occurred_at > iv.completed_at)
  LOOP
    v_base  := COALESCE(i.baseline_mastery, (i.evidence ->> 'mastery')::numeric);
    v_delta := CASE WHEN v_base IS NULL THEN NULL ELSE round(tm.mastery_score - v_base, 4) END;
    INSERT INTO reassessments (organisation_id, student_id, intervention_id, topic_key,
                               baseline_mastery, result_mastery, delta, outcome)
    VALUES (i.organisation_id, p_student_id, i.id, p_topic_key, v_base, tm.mastery_score, v_delta,
            CASE WHEN v_delta IS NULL OR abs(v_delta) < 0.10 THEN 'unchanged'
                 WHEN v_delta > 0 THEN 'improved' ELSE 'declined' END::reassessment_outcome);
  END LOOP;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public, pg_temp;

-- ---------------------------------------------------------------------
-- 5. Triggers on the CBT tables
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION cas_on_response() RETURNS trigger AS $$
BEGIN
  PERFORM upsert_response_event(NEW.id);
  RETURN NULL;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public, pg_temp;

CREATE TRIGGER trg_responses_cas
  AFTER INSERT OR UPDATE OF marks_awarded, marking_status ON responses
  FOR EACH ROW WHEN (NEW.marking_status <> 'pending' AND NEW.marks_awarded IS NOT NULL)
  EXECUTE FUNCTION cas_on_response();

CREATE OR REPLACE FUNCTION cas_on_result() RETURNS trigger AS $$
BEGIN
  PERFORM upsert_assessment_event(NEW.id);
  PERFORM refresh_mastery_for_attempt(NEW.attempt_id);
  RETURN NULL;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public, pg_temp;

CREATE TRIGGER trg_results_cas_ins
  AFTER INSERT ON results
  FOR EACH ROW EXECUTE FUNCTION cas_on_result();

CREATE TRIGGER trg_results_cas_upd
  AFTER UPDATE ON results
  FOR EACH ROW WHEN (OLD.score IS DISTINCT FROM NEW.score
                     OR OLD.marking_complete IS DISTINCT FROM NEW.marking_complete
                     OR OLD.released_at IS DISTINCT FROM NEW.released_at)
  EXECUTE FUNCTION cas_on_result();

-- A voided attempt stops counting as evidence.
CREATE OR REPLACE FUNCTION cas_on_attempt_voided() RETURNS trigger AS $$
BEGIN
  UPDATE assessment_events SET voided = true, updated_at = now() WHERE attempt_id = NEW.id;
  UPDATE response_events SET is_current = false, updated_at = now() WHERE attempt_id = NEW.id;
  PERFORM refresh_mastery_for_attempt(NEW.id);
  RETURN NULL;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public, pg_temp;

CREATE TRIGGER trg_attempts_cas_void
  AFTER UPDATE OF status ON attempts
  FOR EACH ROW WHEN (NEW.status = 'voided' AND OLD.status IS DISTINCT FROM 'voided')
  EXECUTE FUNCTION cas_on_attempt_voided();

-- ---------------------------------------------------------------------
-- 6. Teacher workflow functions
-- All check cas.manage and that the teacher may see this student's results
-- (their own classes, or result.read_all).
-- ---------------------------------------------------------------------

CREATE OR REPLACE FUNCTION assign_intervention(
  p_intervention_id uuid, p_due_on date DEFAULT NULL, p_assignee uuid DEFAULT NULL
) RETURNS void AS $$
DECLARE
  i interventions%ROWTYPE;
  v_base numeric;
BEGIN
  IF NOT has_permission('cas.manage') THEN RAISE EXCEPTION 'Permission denied: cas.manage required'; END IF;
  SELECT * INTO i FROM interventions WHERE id = p_intervention_id AND organisation_id = current_org_id() FOR UPDATE;
  IF NOT FOUND OR NOT staff_can_view_results(i.student_id) THEN RAISE EXCEPTION 'Intervention not found'; END IF;
  IF i.status <> 'suggested' THEN RAISE EXCEPTION 'Only suggested interventions can be assigned (status: %)', i.status; END IF;

  SELECT mastery_score INTO v_base FROM topic_mastery
  WHERE student_id = i.student_id AND topic_key = i.target_topic_key;

  UPDATE interventions
  SET status = 'assigned', due_on = p_due_on, assigned_to = COALESCE(p_assignee, current_user_id()),
      assigned_by = current_user_id(), assigned_at = now(), baseline_mastery = v_base
  WHERE id = i.id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public, pg_temp;

-- Teacher-created intervention, assigned straight away.
CREATE OR REPLACE FUNCTION add_intervention(
  p_student_id uuid, p_topic_key uuid, p_type intervention_type, p_title text,
  p_description text DEFAULT NULL, p_note_id uuid DEFAULT NULL, p_due_on date DEFAULT NULL
) RETURNS uuid AS $$
DECLARE
  v_base numeric;
  v_id uuid;
BEGIN
  IF NOT has_permission('cas.manage') THEN RAISE EXCEPTION 'Permission denied: cas.manage required'; END IF;
  IF NOT staff_can_view_results(p_student_id) THEN RAISE EXCEPTION 'Permission denied for this student'; END IF;
  IF p_title IS NULL OR btrim(p_title) = '' THEN RAISE EXCEPTION 'A title is required'; END IF;

  SELECT mastery_score INTO v_base FROM topic_mastery WHERE student_id = p_student_id AND topic_key = p_topic_key;
  INSERT INTO interventions (organisation_id, student_id, target_topic_key, type, title, description,
                             target_note_id, status, assigned_to, assigned_by, assigned_at, due_on, baseline_mastery)
  VALUES (current_org_id(), p_student_id, p_topic_key, p_type, p_title, p_description,
          p_note_id, 'assigned', current_user_id(), current_user_id(), now(), p_due_on, v_base)
  RETURNING id INTO v_id;
  RETURN v_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public, pg_temp;

CREATE OR REPLACE FUNCTION set_intervention_status(p_intervention_id uuid, p_status intervention_status) RETURNS void AS $$
DECLARE
  i interventions%ROWTYPE;
BEGIN
  IF NOT has_permission('cas.manage') THEN RAISE EXCEPTION 'Permission denied: cas.manage required'; END IF;
  SELECT * INTO i FROM interventions WHERE id = p_intervention_id AND organisation_id = current_org_id() FOR UPDATE;
  IF NOT FOUND OR NOT staff_can_view_results(i.student_id) THEN RAISE EXCEPTION 'Intervention not found'; END IF;
  IF p_status = 'suggested' THEN RAISE EXCEPTION 'Use assign_intervention() to assign a suggestion'; END IF;

  UPDATE interventions
  SET status = p_status,
      completed_at = CASE WHEN p_status = 'completed' THEN now() ELSE completed_at END
  WHERE id = i.id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public, pg_temp;

-- The student (or a parent) ticks off an assigned note or practice task.
CREATE OR REPLACE FUNCTION mark_intervention_done(p_intervention_id uuid) RETURNS void AS $$
DECLARE
  i interventions%ROWTYPE;
BEGIN
  SELECT * INTO i FROM interventions WHERE id = p_intervention_id AND organisation_id = current_org_id() FOR UPDATE;
  IF NOT FOUND OR NOT is_self_or_parent(i.student_id) THEN RAISE EXCEPTION 'Task not found'; END IF;
  IF i.type NOT IN ('note', 'practice') THEN RAISE EXCEPTION 'Only reading and practice tasks can be ticked off here'; END IF;
  IF i.status NOT IN ('assigned', 'in_progress') THEN RAISE EXCEPTION 'This task is not currently assigned'; END IF;
  UPDATE interventions SET status = 'completed', completed_at = now() WHERE id = i.id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public, pg_temp;

CREATE OR REPLACE FUNCTION dismiss_diagnosis(p_diagnosis_id uuid, p_reason text) RETURNS void AS $$
DECLARE
  d diagnoses%ROWTYPE;
BEGIN
  IF NOT has_permission('cas.manage') THEN RAISE EXCEPTION 'Permission denied: cas.manage required'; END IF;
  IF p_reason IS NULL OR btrim(p_reason) = '' THEN RAISE EXCEPTION 'A reason is required'; END IF;
  SELECT * INTO d FROM diagnoses WHERE id = p_diagnosis_id AND organisation_id = current_org_id() FOR UPDATE;
  IF NOT FOUND OR NOT staff_can_view_results(d.student_id) OR d.status <> 'open' THEN
    RAISE EXCEPTION 'Open diagnosis not found';
  END IF;
  UPDATE diagnoses
  SET status = 'dismissed', dismissed_by = current_user_id(), dismissed_reason = p_reason, dismissed_at = now()
  WHERE id = d.id;
  UPDATE interventions SET status = 'cancelled' WHERE diagnosis_id = d.id AND status = 'suggested';
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public, pg_temp;

-- Recalculate mastery from the stored evidence (use after changing weights or settings).
-- One student, or everyone in the organisation (administrators only).
CREATE OR REPLACE FUNCTION rebuild_mastery(p_student_id uuid DEFAULT NULL) RETURNS integer AS $$
DECLARE
  r record;
  n integer := 0;
BEGIN
  IF NOT (has_permission('cas.manage') AND has_permission('result.read_all')) THEN
    RAISE EXCEPTION 'Permission denied: administrators only';
  END IF;
  FOR r IN SELECT DISTINCT re.student_id, re.topic_key FROM response_events re
           WHERE re.organisation_id = current_org_id()
             AND (p_student_id IS NULL OR re.student_id = p_student_id)
  LOOP
    PERFORM recompute_topic_mastery(r.student_id, r.topic_key);
    n := n + 1;
  END LOOP;
  RETURN n;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public, pg_temp;

-- ---------------------------------------------------------------------
-- 7. Dashboards
-- One function for three audiences:
--   student  : own data, released results only
--   parent   : a linked child, released results only
--   teacher  : full view for students they may see, plus open diagnoses
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION learning_dashboard(p_student_id uuid DEFAULT NULL) RETURNS jsonb AS $$
DECLARE
  v_sid   uuid;
  v_staff boolean := false;
  v_topics jsonb; v_subjects jsonb; v_recent jsonb; v_interv jsonb; v_diag jsonb;
  v_student jsonb;
BEGIN
  IF p_student_id IS NULL THEN
    v_sid := current_student_id();
    IF v_sid IS NULL THEN RAISE EXCEPTION 'No student record is linked to this account'; END IF;
  ELSE
    v_sid := p_student_id;
    v_staff := staff_can_view_results(v_sid);
    IF NOT v_staff AND NOT is_self_or_parent(v_sid) THEN RAISE EXCEPTION 'Not allowed'; END IF;
  END IF;

  SELECT jsonb_build_object('id', s.id, 'name', s.full_name, 'admission_no', s.admission_no)
  INTO v_student FROM students s WHERE s.id = v_sid AND s.organisation_id = current_org_id();
  IF v_student IS NULL THEN RAISE EXCEPTION 'Student not found'; END IF;

  -- topics, weakest first
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
           'topic_key', x.topic_key, 'topic', x.topic, 'subject', x.subject,
           'mastery', x.m, 'confidence', x.c, 'level', mastery_level(x.m, x.c),
           'previous', x.prev, 'change', CASE WHEN x.prev IS NULL THEN NULL ELSE round(x.m - x.prev, 4) END,
           'last_assessed_at', x.last_assessed_at) ORDER BY x.m ASC), '[]'::jsonb)
  INTO v_topics
  FROM (
    SELECT tm.topic_key, t.title AS topic, s.name AS subject,
           CASE WHEN v_staff THEN tm.mastery_score ELSE tm.released_mastery END AS m,
           CASE WHEN v_staff THEN tm.confidence    ELSE tm.released_confidence END AS c,
           tm.last_assessed_at,
           (SELECT CASE WHEN v_staff THEN ms.mastery_score ELSE ms.released_mastery END
            FROM mastery_snapshots ms
            WHERE ms.student_id = tm.student_id AND ms.topic_key = tm.topic_key
              AND (v_staff OR ms.released_mastery IS NOT NULL)
            ORDER BY ms.taken_at DESC, ms.id DESC OFFSET 1 LIMIT 1) AS prev
    FROM topic_mastery tm
    LEFT JOIN curriculum_topics t ON t.id = tm.topic_id_latest
    LEFT JOIN subjects s ON s.id = tm.subject_id
    WHERE tm.student_id = v_sid AND (v_staff OR tm.released_mastery IS NOT NULL)
  ) x;

  -- subject roll-up (topics with enough evidence only)
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
           'subject', y.subject, 'average_mastery', y.avg_m, 'topics', y.n, 'weak_topics', y.weak)
           ORDER BY y.subject), '[]'::jsonb)
  INTO v_subjects
  FROM (
    SELECT COALESCE(s.name, 'Other') AS subject,
           round(avg(CASE WHEN v_staff THEN tm.mastery_score ELSE tm.released_mastery END), 3) AS avg_m,
           count(*) AS n,
           count(*) FILTER (WHERE (CASE WHEN v_staff THEN tm.mastery_score ELSE tm.released_mastery END) < 0.50) AS weak
    FROM topic_mastery tm
    LEFT JOIN subjects s ON s.id = tm.subject_id
    WHERE tm.student_id = v_sid AND (v_staff OR tm.released_mastery IS NOT NULL)
      AND COALESCE(CASE WHEN v_staff THEN tm.confidence ELSE tm.released_confidence END, 0) >= 0.25
    GROUP BY COALESCE(s.name, 'Other')
  ) y;

  -- recent assessments
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
           'exam', ex.title, 'kind', ae.exam_kind, 'percentage', ae.percentage, 'grade', r.grade,
           'marking_complete', ae.marking_complete, 'date', ae.occurred_at) ORDER BY ae.occurred_at DESC), '[]'::jsonb)
  INTO v_recent
  FROM (SELECT * FROM assessment_events
        WHERE student_id = v_sid AND NOT voided AND (v_staff OR released_at IS NOT NULL)
        ORDER BY occurred_at DESC LIMIT 8) ae
  JOIN exams ex ON ex.id = ae.exam_id
  LEFT JOIN results r ON r.attempt_id = ae.attempt_id;

  -- tasks
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
           'id', i.id, 'type', i.type, 'title', i.title, 'status', i.status, 'due_on', i.due_on,
           'note_id', i.target_note_id) ORDER BY i.created_at DESC), '[]'::jsonb)
  INTO v_interv
  FROM interventions i
  WHERE i.student_id = v_sid
    AND ((v_staff AND i.status <> 'cancelled')
         OR (NOT v_staff AND i.status IN ('assigned', 'in_progress', 'completed')));

  -- open diagnoses: staff only
  IF v_staff THEN
    SELECT COALESCE(jsonb_agg(jsonb_build_object(
             'id', d.id, 'kind', d.kind, 'severity', d.severity, 'finding', d.finding, 'raised_at', d.created_at)
             ORDER BY d.severity DESC, d.created_at DESC), '[]'::jsonb)
    INTO v_diag
    FROM diagnoses d WHERE d.student_id = v_sid AND d.status = 'open';
  ELSE
    v_diag := '[]'::jsonb;
  END IF;

  RETURN jsonb_build_object(
    'student', v_student,
    'view', CASE WHEN v_staff THEN 'staff' ELSE 'family' END,
    'generated_at', now(),
    'subjects', v_subjects,
    'topics', v_topics,
    'recent_assessments', v_recent,
    'tasks', v_interv,
    'open_diagnoses', v_diag);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public, pg_temp;

-- ---------------------------------------------------------------------
-- 8. Parent reports
-- Built only from released results and released mastery, so a report can
-- never reveal a mark the family has not been given yet.
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION build_report_content(p_student_id uuid, p_from date, p_to date) RETURNS jsonb AS $$
DECLARE
  v_assess jsonb; v_avg numeric; v_strong jsonb; v_focus jsonb; v_tasks jsonb;
BEGIN
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
           'exam', ex.title, 'kind', ae.exam_kind, 'percentage', ae.percentage,
           'grade', r.grade, 'date', ae.occurred_at::date) ORDER BY ae.occurred_at), '[]'::jsonb),
         round(avg(ae.percentage), 1)
  INTO v_assess, v_avg
  FROM assessment_events ae
  JOIN exams ex ON ex.id = ae.exam_id
  LEFT JOIN results r ON r.attempt_id = ae.attempt_id
  WHERE ae.student_id = p_student_id AND NOT ae.voided AND ae.released_at IS NOT NULL
    AND ae.occurred_at::date BETWEEN p_from AND p_to;

  SELECT COALESCE(jsonb_agg(jsonb_build_object('topic', q.title, 'mastery', q.released_mastery)), '[]'::jsonb)
  INTO v_strong
  FROM (SELECT t.title, tm.released_mastery
        FROM topic_mastery tm JOIN curriculum_topics t ON t.id = tm.topic_id_latest
        WHERE tm.student_id = p_student_id AND tm.released_mastery >= 0.75 AND tm.released_confidence >= 0.4
        ORDER BY tm.released_mastery DESC LIMIT 3) q;

  SELECT COALESCE(jsonb_agg(jsonb_build_object('topic', q.title, 'mastery', q.released_mastery)), '[]'::jsonb)
  INTO v_focus
  FROM (SELECT t.title, tm.released_mastery
        FROM topic_mastery tm JOIN curriculum_topics t ON t.id = tm.topic_id_latest
        WHERE tm.student_id = p_student_id AND tm.released_mastery < 0.60 AND tm.released_confidence >= 0.25
        ORDER BY tm.released_mastery ASC LIMIT 3) q;

  SELECT COALESCE(jsonb_agg(jsonb_build_object('title', i.title, 'status', i.status)), '[]'::jsonb)
  INTO v_tasks
  FROM interventions i
  WHERE i.student_id = p_student_id AND i.status IN ('assigned', 'in_progress', 'completed')
    AND COALESCE(i.assigned_at, i.created_at)::date <= p_to
    AND COALESCE(i.completed_at, now())::date >= p_from;

  RETURN jsonb_build_object(
    'period', jsonb_build_object('from', p_from, 'to', p_to),
    'assessments', v_assess, 'average_percentage', v_avg,
    'strengths', v_strong, 'focus_areas', v_focus, 'support_tasks', v_tasks,
    'teacher_comment', NULL);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public, pg_temp;

CREATE OR REPLACE FUNCTION draft_parent_report(p_student_id uuid, p_from date, p_to date, p_title text DEFAULT NULL) RETURNS uuid AS $$
DECLARE
  v_name text;
  v_id uuid;
BEGIN
  IF NOT has_permission('cas.manage') THEN RAISE EXCEPTION 'Permission denied: cas.manage required'; END IF;
  IF NOT staff_can_view_results(p_student_id) THEN RAISE EXCEPTION 'Permission denied for this student'; END IF;
  SELECT full_name INTO v_name FROM students WHERE id = p_student_id AND organisation_id = current_org_id();
  IF NOT FOUND THEN RAISE EXCEPTION 'Student not found'; END IF;

  INSERT INTO parent_reports (organisation_id, student_id, period_start, period_end, title, content)
  VALUES (current_org_id(), p_student_id, p_from, p_to,
          COALESCE(p_title, 'Progress report: ' || v_name),
          build_report_content(p_student_id, p_from, p_to))
  ON CONFLICT (student_id, period_start, period_end) DO NOTHING
  RETURNING id INTO v_id;
  RETURN v_id;              -- NULL if a report for that period already exists
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public, pg_temp;

-- Draft reports for a whole class at once (skips students who already have one).
CREATE OR REPLACE FUNCTION draft_parent_reports_for_class(p_class_id uuid, p_from date, p_to date) RETURNS integer AS $$
DECLARE
  r record;
  n integer := 0;
BEGIN
  IF NOT has_permission('cas.manage') THEN RAISE EXCEPTION 'Permission denied: cas.manage required'; END IF;
  IF NOT EXISTS (SELECT 1 FROM classes WHERE id = p_class_id AND organisation_id = current_org_id()) THEN
    RAISE EXCEPTION 'Class not found';
  END IF;
  FOR r IN SELECT e.student_id FROM enrolments e
           WHERE e.class_id = p_class_id AND e.organisation_id = current_org_id() AND e.status = 'active'
  LOOP
    IF staff_can_view_results(r.student_id) AND draft_parent_report(r.student_id, p_from, p_to) IS NOT NULL THEN
      n := n + 1;
    END IF;
  END LOOP;
  RETURN n;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public, pg_temp;

-- Teacher checks the draft, optionally edits the content (e.g. adds a comment), and approves.
CREATE OR REPLACE FUNCTION approve_parent_report(p_report_id uuid, p_content jsonb DEFAULT NULL) RETURNS void AS $$
DECLARE
  pr parent_reports%ROWTYPE;
BEGIN
  IF NOT has_permission('cas.manage') THEN RAISE EXCEPTION 'Permission denied: cas.manage required'; END IF;
  SELECT * INTO pr FROM parent_reports WHERE id = p_report_id AND organisation_id = current_org_id() FOR UPDATE;
  IF NOT FOUND OR NOT staff_can_view_results(pr.student_id) THEN RAISE EXCEPTION 'Report not found'; END IF;
  IF pr.status <> 'draft' THEN RAISE EXCEPTION 'Only drafts can be approved'; END IF;
  UPDATE parent_reports
  SET status = 'approved', approved_by = current_user_id(), approved_at = now(),
      content = COALESCE(p_content, content)
  WHERE id = pr.id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public, pg_temp;

-- Call after the report has actually gone out (WhatsApp, SMS, email or print).
CREATE OR REPLACE FUNCTION mark_report_sent(p_report_id uuid, p_channel text) RETURNS void AS $$
DECLARE
  pr parent_reports%ROWTYPE;
BEGIN
  IF NOT has_permission('cas.manage') THEN RAISE EXCEPTION 'Permission denied: cas.manage required'; END IF;
  SELECT * INTO pr FROM parent_reports WHERE id = p_report_id AND organisation_id = current_org_id() FOR UPDATE;
  IF NOT FOUND OR NOT staff_can_view_results(pr.student_id) THEN RAISE EXCEPTION 'Report not found'; END IF;
  IF pr.status <> 'approved' THEN RAISE EXCEPTION 'A report must be approved before it is sent'; END IF;
  UPDATE parent_reports SET status = 'sent', sent_via = p_channel, sent_at = now() WHERE id = pr.id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public, pg_temp;

-- ---------------------------------------------------------------------
-- 9. Grants
-- ---------------------------------------------------------------------
GRANT SELECT ON assessment_events, response_events, topic_mastery, mastery_snapshots,
                diagnoses, interventions, reassessments, parent_reports TO authenticated;

DO $$
DECLARE f record;
BEGIN
  FOR f IN SELECT p.oid::regprocedure AS sig FROM pg_proc p
           JOIN pg_namespace n ON n.oid = p.pronamespace
           WHERE n.nspname = 'public' AND p.proname = ANY (ARRAY[
             'upsert_response_event','upsert_assessment_event','recompute_topic_mastery',
             'refresh_mastery_for_attempt','suggest_interventions','run_diagnosis','record_reassessments',
             'cas_on_response','cas_on_result','cas_on_attempt_voided','build_report_content',
             'assign_intervention','add_intervention','set_intervention_status','mark_intervention_done',
             'dismiss_diagnosis','rebuild_mastery','learning_dashboard','draft_parent_report',
             'draft_parent_reports_for_class','approve_parent_report','mark_report_sent'])
  LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC', f.sig);
  END LOOP;

  FOR f IN SELECT p.oid::regprocedure AS sig FROM pg_proc p
           JOIN pg_namespace n ON n.oid = p.pronamespace
           WHERE n.nspname = 'public' AND p.proname = ANY (ARRAY[
             'assign_intervention','add_intervention','set_intervention_status','mark_intervention_done',
             'dismiss_diagnosis','rebuild_mastery','learning_dashboard','draft_parent_report',
             'draft_parent_reports_for_class','approve_parent_report','mark_report_sent','mastery_level'])
  LOOP
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO authenticated', f.sig);
  END LOOP;
END $$;

-- ---------------------------------------------------------------------
-- 10. Row-level security
-- Mastery, evidence and diagnoses are staff-only (a teacher sees only their own
-- classes, via staff_can_view_results). Families read through learning_dashboard(),
-- which shows released results only. Families can read their own tasks and
-- sent reports directly.
-- ---------------------------------------------------------------------
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['assessment_events','response_events','topic_mastery','mastery_snapshots',
                           'diagnoses','interventions','reassessments','parent_reports']
  LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
  END LOOP;

  FOREACH t IN ARRAY ARRAY['assessment_events','response_events','topic_mastery','mastery_snapshots',
                           'diagnoses','reassessments']
  LOOP
    EXECUTE format(
      'CREATE POLICY %I ON %I FOR SELECT TO authenticated
         USING (organisation_id = (SELECT current_org_id()) AND staff_can_view_results(student_id))',
      t || '_staff_read', t);
  END LOOP;
END $$;

CREATE POLICY interventions_read ON interventions FOR SELECT TO authenticated
  USING (organisation_id = (SELECT current_org_id())
         AND (staff_can_view_results(student_id)
              OR (status IN ('assigned', 'in_progress', 'completed') AND is_self_or_parent(student_id))));

CREATE POLICY parent_reports_read ON parent_reports FOR SELECT TO authenticated
  USING (organisation_id = (SELECT current_org_id())
         AND (staff_can_view_results(student_id)
              OR (status = 'sent' AND is_self_or_parent(student_id))));

-- ---------------------------------------------------------------------
-- 11. Views for teachers and management (Postgres 15+ for security_invoker)
-- ---------------------------------------------------------------------

-- Every student's topic standing, with names.
CREATE VIEW topic_mastery_detail WITH (security_invoker = true) AS
SELECT tm.organisation_id, tm.student_id, s.full_name AS student_name, s.admission_no,
       tm.topic_key, t.title AS topic_title, sub.name AS subject_name,
       tm.mastery_score, tm.confidence, tm.level, tm.evidence_n, tm.last_assessed_at
FROM topic_mastery tm
JOIN students s ON s.id = tm.student_id
LEFT JOIN curriculum_topics t ON t.id = tm.topic_id_latest
LEFT JOIN subjects sub ON sub.id = tm.subject_id;

-- Direction of travel per topic: latest snapshot against two snapshots earlier.
CREATE VIEW mastery_trend WITH (security_invoker = true) AS
SELECT DISTINCT ON (q.student_id, q.topic_key)
       q.organisation_id, q.student_id, q.topic_key,
       q.mastery_score AS latest, q.prev AS previous,
       round(q.mastery_score - q.prev, 4) AS delta,
       CASE WHEN q.prev IS NULL THEN 'new'
            WHEN q.mastery_score - q.prev >=  0.05 THEN 'improving'
            WHEN q.mastery_score - q.prev <= -0.05 THEN 'declining'
            ELSE 'steady' END AS direction,
       q.taken_at
FROM (
  SELECT ms.*,
         COALESCE(lag(ms.mastery_score, 2) OVER w, lag(ms.mastery_score, 1) OVER w) AS prev
  FROM mastery_snapshots ms
  WINDOW w AS (PARTITION BY ms.student_id, ms.topic_key ORDER BY ms.taken_at, ms.id)
) q
ORDER BY q.student_id, q.topic_key, q.taken_at DESC, q.id DESC;

-- Class heat-map: which topics is a whole class struggling with?
CREATE VIEW class_mastery_summary WITH (security_invoker = true) AS
SELECT e.organisation_id, e.class_id, c.name AS class_name, tm.topic_key,
       t.title AS topic_title, tm.subject_id,
       count(*) AS students_assessed,
       round(avg(tm.mastery_score), 3) AS avg_mastery,
       count(*) FILTER (WHERE tm.mastery_score < 0.50) AS students_weak
FROM enrolments e
JOIN classes c ON c.id = e.class_id
JOIN topic_mastery tm ON tm.student_id = e.student_id
LEFT JOIN curriculum_topics t ON t.id = tm.topic_id_latest
WHERE e.status = 'active' AND tm.confidence >= 0.25
GROUP BY e.organisation_id, e.class_id, c.name, tm.topic_key, t.title, tm.subject_id;

-- Teacher's to-do list of support tasks.
CREATE VIEW intervention_board WITH (security_invoker = true) AS
SELECT i.organisation_id, i.id AS intervention_id, i.student_id, s.full_name AS student_name,
       i.type, i.title, i.status, i.due_on,
       (i.due_on IS NOT NULL AND i.due_on < current_date AND i.status IN ('assigned', 'in_progress')) AS is_overdue,
       d.kind AS diagnosis_kind, d.severity
FROM interventions i
JOIN students s ON s.id = i.student_id
LEFT JOIN diagnoses d ON d.id = i.diagnosis_id
WHERE i.status IN ('suggested', 'assigned', 'in_progress');

-- Does support actually work? Outcomes by intervention type.
CREATE VIEW intervention_effectiveness WITH (security_invoker = true) AS
SELECT r.organisation_id, i.type,
       count(*)                                          AS reassessed,
       count(*) FILTER (WHERE r.outcome = 'improved')    AS improved,
       count(*) FILTER (WHERE r.outcome = 'unchanged')   AS unchanged,
       count(*) FILTER (WHERE r.outcome = 'declined')    AS declined,
       round(avg(r.delta), 3)                            AS avg_change
FROM reassessments r
JOIN interventions i ON i.id = r.intervention_id
GROUP BY r.organisation_id, i.type;

GRANT SELECT ON topic_mastery_detail, mastery_trend, class_mastery_summary,
                intervention_board, intervention_effectiveness TO authenticated;

-- ---------------------------------------------------------------------
-- 12. Backfill from any results that already exist
-- (does nothing on a fresh database)
-- ---------------------------------------------------------------------
DO $$
DECLARE r record;
BEGIN
  FOR r IN SELECT id FROM responses WHERE marking_status <> 'pending' AND marks_awarded IS NOT NULL LOOP
    PERFORM upsert_response_event(r.id);
  END LOOP;
  FOR r IN SELECT id FROM results LOOP
    PERFORM upsert_assessment_event(r.id);
  END LOOP;
  FOR r IN SELECT DISTINCT student_id, topic_key FROM response_events LOOP
    PERFORM recompute_topic_mastery(r.student_id, r.topic_key);
  END LOOP;
END $$;

INSERT INTO public.schema_migrations (version, description) VALUES ('007', 'CAS academic intelligence (rev 6)');

COMMIT;

-- =====================================================================
-- Notes
-- 1. Nothing to call for the data itself: marking a response or scoring an
--    attempt updates everything. Your screens read:
--      learning_dashboard()            student, parent and teacher dashboards
--      class_mastery_summary           class heat-map by topic
--      intervention_board              teacher to-do list
--      mastery_trend, topic_mastery_detail, intervention_effectiveness
-- 2. Families never see unreleased marks: mastery has separate "released"
--    numbers, the dashboard uses only those, and diagnoses and raw evidence
--    are staff-only.
-- 3. The maths is deliberately simple and explainable (see
--    recompute_topic_mastery). Settings you can put in organisation_settings:
--      mastery_half_life_days (45), cas_weak_threshold (0.5).
--    After changing one, run rebuild_mastery() as an administrator.
-- 4. Several attempts at the same exam all count as evidence. Practice
--    exams weigh 0.6 so they nudge the score without dominating it.
-- 5. Diagnoses are rule-based today. Migration 008 (AI services) can add a
--    plain-language 'narrative' to a diagnosis and draft the teacher comment
--    on parent reports; the columns are already here.
-- 6. Sending reports (WhatsApp/SMS/email) happens in your app layer. Call
--    mark_report_sent() afterwards. Scheduling: call
--    draft_parent_reports_for_class() from a cron job each term or month.
-- 7. Mastery confidence fades as evidence ages, but scores are only
--    recomputed when new evidence arrives or rebuild_mastery() runs.
-- =====================================================================
