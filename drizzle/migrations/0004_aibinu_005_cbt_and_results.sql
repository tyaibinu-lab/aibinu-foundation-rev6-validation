-- =====================================================================
-- Aibinu FlexiPrep: Migration 005
-- CBT and assessment: exams, eligibility, attempts, responses, scoring,
-- results, and student-safe delivery functions
-- Requires: 001-004
-- =====================================================================

BEGIN;
SELECT public.migration_begin('005', '004');   -- Revision 6 (M5)

-- ---------------------------------------------------------------------
-- 1. Enums
-- ---------------------------------------------------------------------
CREATE TYPE exam_kind      AS ENUM ('test', 'exam', 'practice', 'mock');
CREATE TYPE exam_status    AS ENUM ('draft', 'published', 'closed', 'archived');
CREATE TYPE attempt_status AS ENUM ('in_progress', 'submitted', 'auto_submitted', 'voided');
CREATE TYPE marking_state  AS ENUM ('pending', 'auto', 'marked');
CREATE TYPE release_policy AS ENUM ('manual', 'immediate', 'after_close');
CREATE TYPE attempt_policy AS ENUM ('best', 'latest', 'first');   -- which attempt counts as official

-- ---------------------------------------------------------------------
-- 2. Permissions
-- ---------------------------------------------------------------------
-- Revision 6 (C1/C5): permission seed removed; the catalogue and role mappings live in 001.

-- Revision 6 (C1/C5): permission seed removed; the catalogue and role mappings live in 001.

-- ---------------------------------------------------------------------
-- 3. Tables
-- ---------------------------------------------------------------------
CREATE TABLE exams (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organisation_id       uuid NOT NULL REFERENCES organisations(id) ON DELETE CASCADE,
  title                 text NOT NULL,
  kind                  exam_kind NOT NULL DEFAULT 'test',
  subject_id            uuid,
  academic_session_id   uuid,                 -- used to find each student's class for ranking
  blueprint_id          uuid,
  instructions          text,
  status                exam_status NOT NULL DEFAULT 'draft',
  opens_at              timestamptz NOT NULL,
  closes_at             timestamptz NOT NULL,
  duration_min          integer NOT NULL CHECK (duration_min > 0),
  hard_close            boolean NOT NULL DEFAULT true,   -- true: nobody works past closes_at
  attempts_allowed      integer NOT NULL DEFAULT 1 CHECK (attempts_allowed >= 1),
  attempt_policy        attempt_policy NOT NULL DEFAULT 'best',
  shuffle_questions     boolean NOT NULL DEFAULT false,
  shuffle_options       boolean NOT NULL DEFAULT false,
  pass_mark_pct         numeric(5,2) NOT NULL DEFAULT 50 CHECK (pass_mark_pct BETWEEN 0 AND 100),
  release_policy        release_policy NOT NULL DEFAULT 'manual',
  allow_review          boolean NOT NULL DEFAULT false,   -- may students see answers after release?
  requires_fees_cleared boolean NOT NULL DEFAULT false,   -- hooks into finance (migration 006)
  total_marks           numeric(7,2) NOT NULL DEFAULT 0,  -- maintained automatically
  created_by            uuid REFERENCES users(id),
  created_at            timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz NOT NULL DEFAULT now(),
  deleted_at            timestamptz,
  UNIQUE (id, organisation_id),
  CHECK (closes_at > opens_at),
  FOREIGN KEY (subject_id, organisation_id)          REFERENCES subjects(id, organisation_id),
  FOREIGN KEY (academic_session_id, organisation_id) REFERENCES academic_sessions(id, organisation_id),
  FOREIGN KEY (blueprint_id, organisation_id)        REFERENCES assessment_blueprints(id, organisation_id)
);
CREATE INDEX idx_exams_window ON exams(organisation_id, status, opens_at, closes_at);
CREATE TRIGGER trg_exams_updated BEFORE UPDATE ON exams
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- Each exam question points at an exact, frozen question version.
CREATE TABLE exam_questions (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organisation_id     uuid NOT NULL REFERENCES organisations(id) ON DELETE CASCADE,
  exam_id             uuid NOT NULL,
  question_version_id uuid NOT NULL,
  topic_id            uuid,                   -- copied from the question, for analytics
  position            integer NOT NULL DEFAULT 0,
  marks               numeric(5,2) CHECK (marks IS NULL OR marks > 0),   -- defaults to the version's marks
  created_at          timestamptz NOT NULL DEFAULT now(),
  UNIQUE (id, organisation_id),
  UNIQUE (exam_id, question_version_id),
  FOREIGN KEY (exam_id, organisation_id)             REFERENCES exams(id, organisation_id) ON DELETE CASCADE,
  FOREIGN KEY (question_version_id, organisation_id) REFERENCES question_versions(id, organisation_id)
);
CREATE INDEX idx_eq_exam ON exam_questions(exam_id, position);

-- Who may sit the exam: whole classes, individual students, or explicit blocks.
CREATE TABLE exam_eligibility (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organisation_id uuid NOT NULL REFERENCES organisations(id) ON DELETE CASCADE,
  exam_id         uuid NOT NULL,
  class_id        uuid,
  student_id      uuid,
  is_blocked      boolean NOT NULL DEFAULT false,
  reason          text,
  extra_time_min  integer NOT NULL DEFAULT 0 CHECK (extra_time_min >= 0),
  extra_attempts  integer NOT NULL DEFAULT 0 CHECK (extra_attempts >= 0),
  created_by      uuid REFERENCES users(id),
  created_at      timestamptz NOT NULL DEFAULT now(),
  CHECK (num_nonnulls(class_id, student_id) = 1),
  CHECK (NOT is_blocked OR student_id IS NOT NULL),
  CHECK (student_id IS NOT NULL OR (extra_time_min = 0 AND extra_attempts = 0)),
  FOREIGN KEY (exam_id, organisation_id)    REFERENCES exams(id, organisation_id) ON DELETE CASCADE,
  FOREIGN KEY (class_id, organisation_id)   REFERENCES classes(id, organisation_id) ON DELETE CASCADE,
  FOREIGN KEY (student_id, organisation_id) REFERENCES students(id, organisation_id) ON DELETE CASCADE
);
CREATE UNIQUE INDEX uq_eligibility_class   ON exam_eligibility(exam_id, class_id)   WHERE class_id IS NOT NULL;
CREATE UNIQUE INDEX uq_eligibility_student ON exam_eligibility(exam_id, student_id) WHERE student_id IS NOT NULL;

CREATE TABLE attempts (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organisation_id uuid NOT NULL REFERENCES organisations(id) ON DELETE CASCADE,
  exam_id         uuid NOT NULL,
  student_id      uuid NOT NULL,
  attempt_no      integer NOT NULL,
  status          attempt_status NOT NULL DEFAULT 'in_progress',
  started_at      timestamptz NOT NULL DEFAULT now(),
  deadline_at     timestamptz NOT NULL,           -- the server-side time limit
  submitted_at    timestamptz,
  layout          jsonb NOT NULL DEFAULT '{}'::jsonb,   -- this student's question and option order
  ip_address      inet,
  device          text,
  void_reason     text,
  UNIQUE (id, organisation_id),
  UNIQUE (exam_id, student_id, attempt_no),
  FOREIGN KEY (exam_id, organisation_id)    REFERENCES exams(id, organisation_id),
  FOREIGN KEY (student_id, organisation_id) REFERENCES students(id, organisation_id)
);
-- A student can have only one open attempt per exam.
CREATE UNIQUE INDEX uq_one_open_attempt ON attempts(exam_id, student_id) WHERE status = 'in_progress';
CREATE INDEX idx_attempts_student ON attempts(student_id, started_at DESC);
CREATE INDEX idx_attempts_open ON attempts(deadline_at) WHERE status = 'in_progress';

-- Answer formats (jsonb):
--   mcq / true_false / multi_select:  {"selected": ["B"]} or {"selected": ["A","C"]}
--   fill_blank / short_answer / theory: {"text": "..."}
CREATE TABLE responses (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organisation_id  uuid NOT NULL REFERENCES organisations(id) ON DELETE CASCADE,
  attempt_id       uuid NOT NULL,
  exam_question_id uuid NOT NULL,
  exam_id          uuid NOT NULL,
  student_id       uuid NOT NULL,
  topic_id         uuid,
  answer           jsonb,
  answered_at      timestamptz,
  time_spent_s     integer CHECK (time_spent_s IS NULL OR time_spent_s >= 0),
  flagged          boolean NOT NULL DEFAULT false,
  is_correct       boolean,
  marks_awarded    numeric(6,2) CHECK (marks_awarded IS NULL OR marks_awarded >= 0),
  marking_status   marking_state NOT NULL DEFAULT 'pending',
  marked_by        uuid REFERENCES users(id),
  marked_at        timestamptz,
  feedback         text,
  UNIQUE (attempt_id, exam_question_id),
  FOREIGN KEY (attempt_id, organisation_id)       REFERENCES attempts(id, organisation_id) ON DELETE CASCADE,
  FOREIGN KEY (exam_question_id, organisation_id) REFERENCES exam_questions(id, organisation_id),
  FOREIGN KEY (exam_id, organisation_id)          REFERENCES exams(id, organisation_id),
  FOREIGN KEY (student_id, organisation_id)       REFERENCES students(id, organisation_id)
);
CREATE INDEX idx_responses_pending ON responses(exam_id) WHERE marking_status = 'pending';
CREATE INDEX idx_responses_student_topic ON responses(student_id, topic_id);

CREATE TABLE results (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organisation_id  uuid NOT NULL REFERENCES organisations(id) ON DELETE CASCADE,
  attempt_id       uuid NOT NULL UNIQUE,
  exam_id          uuid NOT NULL,
  student_id       uuid NOT NULL,
  class_id         uuid,
  score            numeric(7,2) NOT NULL,
  total_marks      numeric(7,2) NOT NULL,
  percentage       numeric(5,2) NOT NULL,
  grade            text,
  passed           boolean,
  marking_complete boolean NOT NULL DEFAULT false,
  position_in_class integer,
  released_at      timestamptz,
  computed_at      timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (attempt_id, organisation_id) REFERENCES attempts(id, organisation_id) ON DELETE CASCADE,
  FOREIGN KEY (exam_id, organisation_id)    REFERENCES exams(id, organisation_id),
  FOREIGN KEY (student_id, organisation_id) REFERENCES students(id, organisation_id)
);
CREATE INDEX idx_results_exam    ON results(exam_id);
CREATE INDEX idx_results_student ON results(student_id, computed_at DESC);

-- One official result per student per exam, following the exam's attempt policy.
-- (Defined here because SQL-language functions below reference it. Postgres 15+ for security_invoker.)
CREATE VIEW exam_final_results WITH (security_invoker = true) AS
SELECT DISTINCT ON (r.exam_id, r.student_id)
       r.id, r.organisation_id, r.exam_id, r.student_id, r.class_id, r.attempt_id, a.attempt_no,
       r.score, r.total_marks, r.percentage, r.grade, r.passed, r.marking_complete,
       r.released_at, r.position_in_class
FROM results r
JOIN attempts a ON a.id = r.attempt_id
JOIN exams e ON e.id = r.exam_id
WHERE a.status IN ('submitted', 'auto_submitted')
ORDER BY r.exam_id, r.student_id,
         (CASE WHEN e.attempt_policy = 'best'  THEN r.percentage END) DESC NULLS LAST,
         (CASE WHEN e.attempt_policy = 'first' THEN a.attempt_no  END) ASC  NULLS LAST,
         a.attempt_no DESC;

-- ---------------------------------------------------------------------
-- 4. Integrity triggers
-- ---------------------------------------------------------------------

-- Exam questions: only while the exam is a draft; only published versions;
-- one version per question; marks and topic filled in automatically.
CREATE OR REPLACE FUNCTION exam_questions_guard() RETURNS trigger AS $$
DECLARE
  v_exam   uuid;
  v_status exam_status;
BEGIN
  IF TG_OP = 'DELETE' THEN v_exam := OLD.exam_id; ELSE v_exam := NEW.exam_id; END IF;
  SELECT status INTO v_status FROM exams WHERE id = v_exam;
  IF v_status <> 'draft' THEN
    RAISE EXCEPTION 'Questions can only be changed while the exam is a draft (status: %)', v_status;
  END IF;
  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public, pg_temp;
CREATE TRIGGER trg_eq_guard BEFORE INSERT OR UPDATE OR DELETE ON exam_questions
  FOR EACH ROW EXECUTE FUNCTION exam_questions_guard();

CREATE OR REPLACE FUNCTION exam_questions_prepare() RETURNS trigger AS $$
DECLARE
  v record;
BEGIN
  SELECT v2.status, v2.marks, v2.question_id, q.topic_id INTO v
  FROM question_versions v2
  JOIN questions q ON q.id = v2.question_id
  WHERE v2.id = NEW.question_version_id AND v2.organisation_id = NEW.organisation_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Question version not found'; END IF;
  IF v.status <> 'published' THEN
    RAISE EXCEPTION 'Only published question versions can be added to an exam (status: %)', v.status;
  END IF;
  IF EXISTS (SELECT 1 FROM exam_questions eq
             JOIN question_versions qv ON qv.id = eq.question_version_id
             WHERE eq.exam_id = NEW.exam_id AND qv.question_id = v.question_id) THEN
    RAISE EXCEPTION 'This question is already in the exam';
  END IF;
  NEW.topic_id := v.topic_id;
  NEW.marks    := COALESCE(NEW.marks, v.marks);
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public, pg_temp;
CREATE TRIGGER trg_eq_prepare BEFORE INSERT ON exam_questions
  FOR EACH ROW EXECUTE FUNCTION exam_questions_prepare();

-- Keep exams.total_marks in step with its questions.
CREATE OR REPLACE FUNCTION exam_total_marks_sync() RETURNS trigger AS $$
DECLARE v_exam uuid;
BEGIN
  IF TG_OP = 'DELETE' THEN v_exam := OLD.exam_id; ELSE v_exam := NEW.exam_id; END IF;
  UPDATE exams SET total_marks = (SELECT COALESCE(SUM(marks), 0) FROM exam_questions WHERE exam_id = v_exam)
  WHERE id = v_exam;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public, pg_temp;
CREATE TRIGGER trg_eq_total AFTER INSERT OR UPDATE OR DELETE ON exam_questions
  FOR EACH ROW EXECUTE FUNCTION exam_total_marks_sync();

-- Once students have sat an exam, its rules cannot change under them.
CREATE OR REPLACE FUNCTION exams_protect_rules() RETURNS trigger AS $$
BEGIN
  -- Status moves only through publish_exam(), close_exam() and run_cbt_maintenance(), which
  -- check questions, eligibility and open attempts first. Revision 6: enforced by
  -- trg_exams_client_guard (client roles) instead of a client-settable session flag.
  IF OLD.status <> 'draft' AND NEW.status = 'draft' THEN
    RAISE EXCEPTION 'A published exam cannot go back to draft';
  END IF;
  IF OLD.status <> 'draft' AND EXISTS (SELECT 1 FROM attempts WHERE exam_id = OLD.id)
     AND (OLD.duration_min, OLD.attempts_allowed, OLD.attempt_policy, OLD.shuffle_questions,
          OLD.shuffle_options, OLD.pass_mark_pct)
         IS DISTINCT FROM
         (NEW.duration_min, NEW.attempts_allowed, NEW.attempt_policy, NEW.shuffle_questions,
          NEW.shuffle_options, NEW.pass_mark_pct) THEN
    RAISE EXCEPTION 'Exam rules cannot change after students have started attempts';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public, pg_temp;
CREATE TRIGGER trg_exams_protect BEFORE UPDATE ON exams
  FOR EACH ROW EXECUTE FUNCTION exams_protect_rules();

-- Revision 6: a client (anon/authenticated) statement can never change status or total_marks.
-- The WHEN clause is evaluated as the role running the statement, so SECURITY DEFINER workflow
-- functions (publish_exam, close_exam, run_cbt_maintenance, the total_marks trigger) pass.
CREATE OR REPLACE FUNCTION exams_client_guard() RETURNS trigger AS $$
BEGIN
  IF NEW.status IS DISTINCT FROM OLD.status THEN
    RAISE EXCEPTION 'Use publish_exam() or close_exam() to change an exam''s status';
  END IF;
  IF NEW.total_marks IS DISTINCT FROM OLD.total_marks THEN
    RAISE EXCEPTION 'total_marks is maintained automatically';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = pg_catalog, public, pg_temp;
CREATE TRIGGER trg_exams_client_guard BEFORE UPDATE ON exams
  FOR EACH ROW WHEN (current_user IN ('anon', 'authenticated'))
  EXECUTE FUNCTION exams_client_guard();

-- ---------------------------------------------------------------------
-- 5. Helper functions
-- ---------------------------------------------------------------------

-- The student record for the current user in the current organisation.
CREATE OR REPLACE FUNCTION current_student_id() RETURNS uuid AS $$
  SELECT s.id FROM students s
  WHERE s.organisation_id = current_org_id() AND s.user_id = current_user_id()
  LIMIT 1;
$$ LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog, public, pg_temp;

-- Placeholder; migration 006 (finance) replaces this with a real balance check.
CREATE OR REPLACE FUNCTION fees_cleared(p_student_id uuid) RETURNS boolean AS $$
  SELECT true;
$$ LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog, public, pg_temp;

-- The student themselves, or a linked parent.
CREATE OR REPLACE FUNCTION is_self_or_parent(p_student_id uuid) RETURNS boolean AS $$
  SELECT EXISTS (SELECT 1 FROM students s
                 WHERE s.id = p_student_id AND s.organisation_id = current_org_id()
                   AND s.user_id = current_user_id())
      OR EXISTS (SELECT 1 FROM student_parents sp
                 JOIN parents p ON p.id = sp.parent_id AND p.organisation_id = sp.organisation_id
                 WHERE sp.student_id = p_student_id AND sp.organisation_id = current_org_id()
                   AND p.user_id = current_user_id());
$$ LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog, public, pg_temp;

-- Staff who may see a student's attempts and results:
-- result.read_all, or a teacher who is the student's form teacher or subject teacher.
CREATE OR REPLACE FUNCTION staff_can_view_results(p_student_id uuid) RETURNS boolean AS $$
  SELECT has_permission('result.read_all')
      OR (has_permission('result.read_class') AND EXISTS (
            SELECT 1
            FROM teachers t
            JOIN classes c ON c.organisation_id = t.organisation_id
            JOIN enrolments e ON e.class_id = c.id AND e.organisation_id = c.organisation_id
            WHERE t.user_id = current_user_id()
              AND t.organisation_id = current_org_id()
              AND e.student_id = p_student_id
              AND e.status = 'active'
              AND (c.form_teacher_id = t.id
                   OR EXISTS (SELECT 1 FROM class_subjects cs
                              WHERE cs.class_id = c.id AND cs.teacher_id = t.id))));
$$ LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog, public, pg_temp;

-- May this student sit this exam right now (ignoring the time window)?
CREATE OR REPLACE FUNCTION is_eligible(p_exam_id uuid, p_student_id uuid) RETURNS boolean AS $$
DECLARE
  v_ex exams%ROWTYPE;
BEGIN
  IF p_student_id IS NULL THEN RETURN false; END IF;
  -- Revision 6 (M4): the organisation comes from the exam itself. In a signed-in request it must
  -- also be the caller's validated organisation; trusted backend jobs pass explicit ids.
  SELECT * INTO v_ex FROM exams WHERE id = p_exam_id;
  IF NOT FOUND OR v_ex.status = 'draft' THEN RETURN false; END IF;
  IF current_user_id() IS NOT NULL AND v_ex.organisation_id IS DISTINCT FROM current_org_id() THEN
    RETURN false;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM students s WHERE s.id = p_student_id AND s.organisation_id = v_ex.organisation_id) THEN
    RETURN false;
  END IF;

  IF EXISTS (SELECT 1 FROM exam_eligibility el
             WHERE el.exam_id = p_exam_id AND el.student_id = p_student_id AND el.is_blocked) THEN
    RETURN false;
  END IF;
  IF v_ex.requires_fees_cleared AND NOT fees_cleared(p_student_id) THEN
    RETURN false;
  END IF;

  RETURN EXISTS (SELECT 1 FROM exam_eligibility el
                 WHERE el.exam_id = p_exam_id AND el.student_id = p_student_id AND NOT el.is_blocked)
      OR EXISTS (SELECT 1 FROM exam_eligibility el
                 JOIN enrolments en ON en.class_id = el.class_id AND en.organisation_id = el.organisation_id
                 WHERE el.exam_id = p_exam_id AND el.class_id IS NOT NULL AND NOT el.is_blocked
                   AND en.student_id = p_student_id AND en.status = 'active');
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = pg_catalog, public, pg_temp;

-- Grade lookup. Uses the organisation's 'grading_scale' setting if present:
--   [{"min":75,"grade":"A1"},{"min":70,"grade":"B2"}, ...]
-- otherwise a WAEC-style default.
CREATE OR REPLACE FUNCTION grade_for(p_pct numeric, p_org uuid) RETURNS text AS $$
DECLARE
  v_scale jsonb;
  v_grade text;
BEGIN
  SELECT value INTO v_scale FROM organisation_settings
  WHERE organisation_id = p_org AND key = 'grading_scale';
  IF v_scale IS NULL OR jsonb_typeof(v_scale) <> 'array' THEN
    v_scale := '[{"min":75,"grade":"A1"},{"min":70,"grade":"B2"},{"min":65,"grade":"B3"},
                 {"min":60,"grade":"C4"},{"min":55,"grade":"C5"},{"min":50,"grade":"C6"},
                 {"min":45,"grade":"D7"},{"min":40,"grade":"E8"},{"min":0,"grade":"F9"}]'::jsonb;
  END IF;
  SELECT e ->> 'grade' INTO v_grade
  FROM jsonb_array_elements(v_scale) e
  WHERE (e ->> 'min')::numeric <= p_pct
  ORDER BY (e ->> 'min')::numeric DESC
  LIMIT 1;
  RETURN v_grade;
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = pg_catalog, public, pg_temp;

-- Text answer matching for fill_blank / short_answer.
-- answer_key may be: ["a","b"]  or  {"accepted":["a","b"],"case_sensitive":false}  or  "a"
-- Comparison ignores extra spaces (and case unless case_sensitive is true).
CREATE OR REPLACE FUNCTION answer_matches(p_text text, p_key jsonb) RETURNS boolean AS $$
DECLARE
  v_case boolean := false;
  v_list jsonb;
  v_norm text;
  v_item text;
BEGIN
  IF p_key IS NULL THEN RETURN false; END IF;
  IF jsonb_typeof(p_key) = 'object' THEN
    v_case := COALESCE((p_key ->> 'case_sensitive')::boolean, false);
    v_list := p_key -> 'accepted';
  ELSIF jsonb_typeof(p_key) = 'array' THEN
    v_list := p_key;
  ELSIF jsonb_typeof(p_key) = 'string' THEN
    v_list := jsonb_build_array(p_key);
  ELSE
    RETURN false;
  END IF;
  IF v_list IS NULL OR jsonb_typeof(v_list) <> 'array' THEN RETURN false; END IF;

  v_norm := regexp_replace(btrim(p_text), '\s+', ' ', 'g');
  IF NOT v_case THEN v_norm := lower(v_norm); END IF;

  FOR v_item IN SELECT jsonb_array_elements_text(v_list) LOOP
    v_item := regexp_replace(btrim(v_item), '\s+', ' ', 'g');
    IF NOT v_case THEN v_item := lower(v_item); END IF;
    IF v_item = v_norm THEN RETURN true; END IF;
  END LOOP;
  RETURN false;
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- ---------------------------------------------------------------------
-- 6. Scoring (internal: called by submit, marking and the maintenance job)
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION score_attempt(p_attempt_id uuid) RETURNS void AS $$
DECLARE
  v_att     attempts%ROWTYPE;
  v_ex      exams%ROWTYPE;
  rec       record;
  v_given   text[];
  v_correct text[];
  v_txt     text;
  v_ok      boolean;
  v_score   numeric;
  v_total   numeric;
  v_pending integer;
  v_pct     numeric;
  v_class   uuid;
BEGIN
  SELECT * INTO v_att FROM attempts WHERE id = p_attempt_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Attempt not found'; END IF;
  IF v_att.status = 'in_progress' THEN
    RAISE EXCEPTION 'An attempt must be submitted before it is scored';
  END IF;
  SELECT * INTO v_ex FROM exams WHERE id = v_att.exam_id;

  -- Make sure every exam question has a response row (unanswered ones score zero).
  INSERT INTO responses (organisation_id, attempt_id, exam_question_id, exam_id, student_id, topic_id)
  SELECT v_att.organisation_id, v_att.id, eq.id, eq.exam_id, v_att.student_id, eq.topic_id
  FROM exam_questions eq
  WHERE eq.exam_id = v_att.exam_id
  ON CONFLICT (attempt_id, exam_question_id) DO NOTHING;

  -- Auto-mark what can be auto-marked. Manually marked rows are never touched.
  FOR rec IN
    SELECT r.id AS response_id, r.answer, eq.marks, q.type, v.options, v.answer_key
    FROM responses r
    JOIN exam_questions eq ON eq.id = r.exam_question_id
    JOIN question_versions v ON v.id = eq.question_version_id
    JOIN questions q ON q.id = v.question_id
    WHERE r.attempt_id = p_attempt_id AND r.marking_status = 'pending'
  LOOP
    v_ok := NULL;

    IF rec.type IN ('mcq', 'multi_select', 'true_false') THEN
      IF jsonb_typeof(rec.answer -> 'selected') = 'array' THEN
        v_given := ARRAY(SELECT s FROM jsonb_array_elements_text(rec.answer -> 'selected') s ORDER BY s);
      ELSE
        v_given := ARRAY[]::text[];
      END IF;
      IF cardinality(v_given) = 0 THEN
        v_ok := false;
      ELSE
        v_correct := ARRAY(SELECT o ->> 'key' FROM jsonb_array_elements(rec.options) o
                           WHERE COALESCE((o ->> 'is_correct')::boolean, false) ORDER BY o ->> 'key');
        v_ok := (v_given = v_correct);      -- all-or-nothing, including multi-select
      END IF;

    ELSE
      v_txt := btrim(COALESCE(rec.answer ->> 'text', ''));
      IF v_txt = '' THEN
        v_ok := false;                       -- blank answers score zero
      ELSIF rec.type IN ('fill_blank', 'short_answer') THEN
        v_ok := answer_matches(v_txt, rec.answer_key);
        IF NOT v_ok AND rec.type = 'short_answer' THEN
          v_ok := NULL;                      -- a non-match may still deserve marks: leave for a teacher
        END IF;
      END IF;                                -- theory answers stay NULL: teacher marks them
    END IF;

    IF v_ok IS NOT NULL THEN
      UPDATE responses
      SET is_correct = v_ok,
          marks_awarded = CASE WHEN v_ok THEN rec.marks ELSE 0 END,
          marking_status = 'auto'
      WHERE id = rec.response_id;
    END IF;
  END LOOP;

  -- Totals.
  SELECT COALESCE(SUM(marks_awarded), 0), COUNT(*) FILTER (WHERE marking_status = 'pending')
  INTO v_score, v_pending
  FROM responses WHERE attempt_id = p_attempt_id;

  SELECT COALESCE(SUM(marks), 0) INTO v_total FROM exam_questions WHERE exam_id = v_att.exam_id;
  v_pct := CASE WHEN v_total > 0 THEN round(100 * v_score / v_total, 2) ELSE 0 END;

  SELECT e.class_id INTO v_class
  FROM enrolments e
  WHERE e.student_id = v_att.student_id AND e.status = 'active'
    AND (v_ex.academic_session_id IS NULL OR e.academic_session_id = v_ex.academic_session_id)
  ORDER BY e.enrolled_on DESC
  LIMIT 1;

  INSERT INTO results (organisation_id, attempt_id, exam_id, student_id, class_id,
                       score, total_marks, percentage, grade, passed, marking_complete)
  VALUES (v_att.organisation_id, v_att.id, v_att.exam_id, v_att.student_id, v_class,
          v_score, v_total, v_pct, grade_for(v_pct, v_att.organisation_id),
          v_pct >= v_ex.pass_mark_pct, v_pending = 0)
  ON CONFLICT (attempt_id) DO UPDATE
    SET score = EXCLUDED.score, total_marks = EXCLUDED.total_marks,
        percentage = EXCLUDED.percentage, grade = EXCLUDED.grade,
        passed = EXCLUDED.passed, marking_complete = EXCLUDED.marking_complete,
        class_id = EXCLUDED.class_id, computed_at = now();

  IF v_ex.release_policy = 'immediate' AND v_pending = 0 THEN
    UPDATE results SET released_at = COALESCE(released_at, now()) WHERE attempt_id = p_attempt_id;
  END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public, pg_temp;

CREATE OR REPLACE FUNCTION finalize_attempt(p_attempt_id uuid, p_status attempt_status) RETURNS void AS $$
BEGIN
  UPDATE attempts
  SET status = p_status,
      submitted_at = CASE WHEN p_status = 'auto_submitted' THEN LEAST(now(), deadline_at) ELSE now() END
  WHERE id = p_attempt_id AND status = 'in_progress';
  IF FOUND THEN
    PERFORM score_attempt(p_attempt_id);
  END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public, pg_temp;

-- ---------------------------------------------------------------------
-- 7. Teacher-side functions
-- ---------------------------------------------------------------------

-- Fill a draft exam from its blueprint by picking random published questions.
-- Returns, per blueprint line, how many questions were requested and found.
CREATE OR REPLACE FUNCTION generate_exam_from_blueprint(p_exam_id uuid)
RETURNS TABLE (out_topic_id uuid, out_requested integer, out_found integer) AS $$
DECLARE
  v_ex   exams%ROWTYPE;
  v_item record;
  v_key  uuid;
  v_base integer;
  v_n    integer;
BEGIN
  IF NOT has_permission('exam.create') THEN
    RAISE EXCEPTION 'Permission denied: exam.create required';
  END IF;
  SELECT * INTO v_ex FROM exams e WHERE e.id = p_exam_id AND e.organisation_id = current_org_id();
  IF NOT FOUND THEN RAISE EXCEPTION 'Exam not found'; END IF;
  IF v_ex.status <> 'draft' THEN RAISE EXCEPTION 'Only draft exams can be generated'; END IF;
  IF v_ex.blueprint_id IS NULL THEN RAISE EXCEPTION 'This exam has no blueprint'; END IF;

  FOR v_item IN
    SELECT * FROM assessment_blueprint_items bi
    WHERE bi.blueprint_id = v_ex.blueprint_id
    ORDER BY bi.position, bi.created_at
  LOOP
    SELECT t.topic_key INTO v_key FROM curriculum_topics t WHERE t.id = v_item.topic_id;
    SELECT COALESCE(MAX(eq.position), 0) INTO v_base FROM exam_questions eq WHERE eq.exam_id = p_exam_id;

    INSERT INTO exam_questions (organisation_id, exam_id, question_version_id, position, marks)
    SELECT v_ex.organisation_id, p_exam_id, pick.version_id,
           v_base + row_number() OVER (), v_item.marks_per_question
    FROM (
      SELECT v.id AS version_id
      FROM questions q
      JOIN curriculum_topics t ON t.id = q.topic_id AND t.organisation_id = q.organisation_id
      JOIN question_versions v ON v.id = q.current_version_id
      WHERE q.organisation_id = v_ex.organisation_id
        AND q.status = 'published' AND q.deleted_at IS NULL
        AND t.topic_key = v_key
        AND (v_item.difficulty IS NULL OR v.difficulty = v_item.difficulty)
        AND (v_item.cognitive_level IS NULL OR v.cognitive_level = v_item.cognitive_level)
        AND NOT EXISTS (SELECT 1 FROM exam_questions x
                        JOIN question_versions xv ON xv.id = x.question_version_id
                        WHERE x.exam_id = p_exam_id AND xv.question_id = q.id)
      ORDER BY random()
      LIMIT v_item.question_count
    ) pick;
    GET DIAGNOSTICS v_n = ROW_COUNT;

    out_topic_id := v_item.topic_id;
    out_requested := v_item.question_count;
    out_found := v_n;
    RETURN NEXT;
  END LOOP;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION publish_exam(p_exam_id uuid) RETURNS void AS $$
DECLARE
  v_ex exams%ROWTYPE;
BEGIN
  IF NOT has_permission('exam.create') THEN
    RAISE EXCEPTION 'Permission denied: exam.create required';
  END IF;
  SELECT * INTO v_ex FROM exams WHERE id = p_exam_id AND organisation_id = current_org_id();
  IF NOT FOUND THEN RAISE EXCEPTION 'Exam not found'; END IF;
  IF v_ex.status <> 'draft' THEN RAISE EXCEPTION 'Exam is already %', v_ex.status; END IF;
  IF NOT EXISTS (SELECT 1 FROM exam_questions WHERE exam_id = p_exam_id) THEN
    RAISE EXCEPTION 'Add questions before publishing';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM exam_eligibility WHERE exam_id = p_exam_id AND NOT is_blocked) THEN
    RAISE EXCEPTION 'Assign the exam to at least one class or student before publishing';
  END IF;
  IF v_ex.closes_at <= now() THEN
    RAISE EXCEPTION 'The closing time is already in the past';
  END IF;
  UPDATE exams SET status = 'published' WHERE id = p_exam_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public, pg_temp;

-- Close an exam now. Open attempts are submitted automatically.
CREATE OR REPLACE FUNCTION close_exam(p_exam_id uuid) RETURNS void AS $$
DECLARE
  v_att uuid;
BEGIN
  IF NOT has_permission('exam.create') THEN
    RAISE EXCEPTION 'Permission denied: exam.create required';
  END IF;
  PERFORM 1 FROM exams WHERE id = p_exam_id AND organisation_id = current_org_id() AND status = 'published';
  IF NOT FOUND THEN RAISE EXCEPTION 'Published exam not found'; END IF;
  FOR v_att IN SELECT id FROM attempts WHERE exam_id = p_exam_id AND status = 'in_progress' LOOP
    PERFORM finalize_attempt(v_att, 'auto_submitted');
  END LOOP;
  UPDATE exams SET status = 'closed' WHERE id = p_exam_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public, pg_temp;

-- Cancel a student's attempt (power cut, device fault) so they can retake it.
CREATE OR REPLACE FUNCTION void_attempt(p_attempt_id uuid, p_reason text) RETURNS void AS $$
DECLARE
  v_student uuid;
BEGIN
  IF NOT has_permission('exam.create') THEN
    RAISE EXCEPTION 'Permission denied: exam.create required';
  END IF;
  SELECT student_id INTO v_student FROM attempts
  WHERE id = p_attempt_id AND organisation_id = current_org_id();
  IF NOT FOUND THEN RAISE EXCEPTION 'Attempt not found'; END IF;
  IF NOT staff_can_view_results(v_student) THEN
    RAISE EXCEPTION 'Permission denied for this student';
  END IF;
  UPDATE attempts SET status = 'voided', void_reason = p_reason WHERE id = p_attempt_id;
  DELETE FROM results WHERE attempt_id = p_attempt_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public, pg_temp;

-- Teacher marks a response (theory answers, or overrides an auto-mark).
CREATE OR REPLACE FUNCTION mark_response(p_response_id uuid, p_marks numeric, p_feedback text DEFAULT NULL)
RETURNS void AS $$
DECLARE
  v_r   record;
  v_max numeric;
BEGIN
  IF NOT has_permission('result.mark') THEN
    RAISE EXCEPTION 'Permission denied: result.mark required';
  END IF;
  SELECT r.attempt_id, r.student_id, r.exam_question_id, a.status AS attempt_status
  INTO v_r
  FROM responses r JOIN attempts a ON a.id = r.attempt_id
  WHERE r.id = p_response_id AND r.organisation_id = current_org_id();
  IF NOT FOUND THEN RAISE EXCEPTION 'Response not found'; END IF;
  IF NOT staff_can_view_results(v_r.student_id) THEN
    RAISE EXCEPTION 'Permission denied for this student';
  END IF;
  IF v_r.attempt_status = 'in_progress' THEN
    RAISE EXCEPTION 'Cannot mark while the attempt is still in progress';
  END IF;

  SELECT marks INTO v_max FROM exam_questions WHERE id = v_r.exam_question_id;
  IF p_marks < 0 OR p_marks > v_max THEN
    RAISE EXCEPTION 'Marks must be between 0 and %', v_max;
  END IF;

  UPDATE responses
  SET marks_awarded = p_marks, is_correct = (p_marks >= v_max),
      marking_status = 'marked', marked_by = current_user_id(), marked_at = now(),
      feedback = p_feedback
  WHERE id = p_response_id;

  PERFORM score_attempt(v_r.attempt_id);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public, pg_temp;

-- Release results and compute class positions from each student's official attempt.
CREATE OR REPLACE FUNCTION release_results_internal(p_exam_id uuid, p_force boolean) RETURNS integer AS $$
DECLARE
  v_pending integer;
  v_n       integer;
BEGIN
  SELECT COUNT(*) INTO v_pending FROM results WHERE exam_id = p_exam_id AND NOT marking_complete;
  IF v_pending > 0 AND NOT p_force THEN
    RAISE EXCEPTION '% result(s) still need marking; mark them or release with force', v_pending;
  END IF;

  UPDATE results SET released_at = now() WHERE exam_id = p_exam_id AND released_at IS NULL;
  GET DIAGNOSTICS v_n = ROW_COUNT;

  UPDATE results SET position_in_class = NULL WHERE exam_id = p_exam_id;
  WITH ranked AS (
    SELECT f.id, rank() OVER (PARTITION BY f.class_id ORDER BY f.percentage DESC) AS pos
    FROM exam_final_results f
    WHERE f.exam_id = p_exam_id AND f.class_id IS NOT NULL
  )
  UPDATE results r SET position_in_class = ranked.pos
  FROM ranked WHERE r.id = ranked.id;

  RETURN v_n;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public, pg_temp;

CREATE OR REPLACE FUNCTION release_results(p_exam_id uuid, p_force boolean DEFAULT false) RETURNS integer AS $$
BEGIN
  IF NOT has_permission('result.release') THEN
    RAISE EXCEPTION 'Permission denied: result.release required';
  END IF;
  PERFORM 1 FROM exams WHERE id = p_exam_id AND organisation_id = current_org_id();
  IF NOT FOUND THEN RAISE EXCEPTION 'Exam not found'; END IF;
  RETURN release_results_internal(p_exam_id, p_force);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public, pg_temp;

-- ---------------------------------------------------------------------
-- 8. Student-side functions (students never touch the tables directly,
--    so answer keys and other students' data stay out of reach)
-- ---------------------------------------------------------------------

-- Exams the current student can start right now.
CREATE OR REPLACE FUNCTION available_exams()
RETURNS TABLE (exam_id uuid, title text, kind exam_kind, subject_name text,
               opens_at timestamptz, closes_at timestamptz, duration_min integer,
               attempts_allowed integer, attempts_used integer, open_attempt_id uuid)
AS $$
  SELECT e.id, e.title, e.kind, s.name, e.opens_at, e.closes_at, e.duration_min,
         e.attempts_allowed + COALESCE((SELECT el.extra_attempts FROM exam_eligibility el
                                        WHERE el.exam_id = e.id AND el.student_id = current_student_id()
                                          AND NOT el.is_blocked), 0),
         (SELECT COUNT(*)::integer FROM attempts a
          WHERE a.exam_id = e.id AND a.student_id = current_student_id() AND a.status <> 'voided'),
         (SELECT a.id FROM attempts a
          WHERE a.exam_id = e.id AND a.student_id = current_student_id()
            AND a.status = 'in_progress' AND a.deadline_at > now())
  FROM exams e
  LEFT JOIN subjects s ON s.id = e.subject_id AND s.organisation_id = e.organisation_id
  WHERE e.organisation_id = current_org_id()
    AND has_permission('exam.take')
    AND e.status = 'published'
    AND now() BETWEEN e.opens_at AND e.closes_at
    AND is_eligible(e.id, current_student_id())
  ORDER BY e.closes_at;
$$ LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog, public, pg_temp;

-- Start (or resume) an attempt. Returns the attempt id.
CREATE OR REPLACE FUNCTION start_attempt(p_exam_id uuid, p_ip inet DEFAULT NULL, p_device text DEFAULT NULL)
RETURNS uuid AS $$
DECLARE
  v_student uuid := current_student_id();
  v_ex      exams%ROWTYPE;
  v_open    attempts%ROWTYPE;
  v_used    integer;
  v_extra_t integer := 0;
  v_extra_a integer := 0;
  v_deadline timestamptz;
  v_layout  jsonb;
  v_id      uuid;
BEGIN
  IF v_student IS NULL THEN RAISE EXCEPTION 'No student record for this user'; END IF;
  IF NOT has_permission('exam.take') THEN RAISE EXCEPTION 'Permission denied: exam.take required'; END IF;

  SELECT * INTO v_ex FROM exams
  WHERE id = p_exam_id AND organisation_id = current_org_id() AND status = 'published';
  IF NOT FOUND THEN RAISE EXCEPTION 'Exam not available'; END IF;
  IF now() < v_ex.opens_at THEN RAISE EXCEPTION 'This exam has not opened yet'; END IF;
  IF now() > v_ex.closes_at THEN RAISE EXCEPTION 'This exam has closed'; END IF;
  IF NOT is_eligible(p_exam_id, v_student) THEN RAISE EXCEPTION 'You are not eligible for this exam'; END IF;

  -- Resume an open attempt, or close it if its time ran out.
  SELECT * INTO v_open FROM attempts
  WHERE exam_id = p_exam_id AND student_id = v_student AND status = 'in_progress';
  IF FOUND THEN
    IF v_open.deadline_at > now() THEN RETURN v_open.id; END IF;
    PERFORM finalize_attempt(v_open.id, 'auto_submitted');
  END IF;

  SELECT COALESCE(el.extra_time_min, 0), COALESCE(el.extra_attempts, 0)
  INTO v_extra_t, v_extra_a
  FROM exam_eligibility el
  WHERE el.exam_id = p_exam_id AND el.student_id = v_student AND NOT el.is_blocked;
  v_extra_t := COALESCE(v_extra_t, 0);
  v_extra_a := COALESCE(v_extra_a, 0);

  SELECT COUNT(*) INTO v_used FROM attempts
  WHERE exam_id = p_exam_id AND student_id = v_student AND status <> 'voided';
  IF v_used >= v_ex.attempts_allowed + v_extra_a THEN
    RAISE EXCEPTION 'No attempts left for this exam';
  END IF;

  v_deadline := now() + make_interval(mins => v_ex.duration_min + v_extra_t);
  IF v_ex.hard_close THEN v_deadline := LEAST(v_deadline, v_ex.closes_at); END IF;

  -- This student's own question order and option order.
  SELECT jsonb_build_object(
    'questions',
      (SELECT jsonb_agg(eq.id ORDER BY (CASE WHEN v_ex.shuffle_questions THEN random() ELSE eq.position::float8 END))
       FROM exam_questions eq WHERE eq.exam_id = p_exam_id),
    'options',
      COALESCE((SELECT jsonb_object_agg(x.eq_id::text, x.opt_keys)
                FROM (SELECT eq.id AS eq_id,
                             (SELECT jsonb_agg(o.value ->> 'key'
                                     ORDER BY (CASE WHEN v_ex.shuffle_options AND q.type IN ('mcq', 'multi_select')
                                                    THEN random() ELSE o.ord::float8 END))
                              FROM jsonb_array_elements(v.options) WITH ORDINALITY AS o(value, ord)) AS opt_keys
                      FROM exam_questions eq
                      JOIN question_versions v ON v.id = eq.question_version_id
                      JOIN questions q ON q.id = v.question_id
                      WHERE eq.exam_id = p_exam_id AND v.options IS NOT NULL) x), '{}'::jsonb))
  INTO v_layout;

  INSERT INTO attempts (organisation_id, exam_id, student_id, attempt_no, deadline_at, layout, ip_address, device)
  VALUES (v_ex.organisation_id, p_exam_id, v_student,
          (SELECT COALESCE(MAX(attempt_no), 0) + 1 FROM attempts WHERE exam_id = p_exam_id AND student_id = v_student),
          v_deadline, v_layout, p_ip, p_device)
  RETURNING id INTO v_id;
  RETURN v_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public, pg_temp;

-- The paper the student sees: questions in their order, options without answers,
-- plus any answers already saved (so a refresh or reconnect loses nothing).
CREATE OR REPLACE FUNCTION get_attempt_paper(p_attempt_id uuid) RETURNS jsonb AS $$
DECLARE
  v_att attempts%ROWTYPE;
BEGIN
  SELECT * INTO v_att FROM attempts
  WHERE id = p_attempt_id AND organisation_id = current_org_id() AND student_id = current_student_id();
  IF NOT FOUND THEN RAISE EXCEPTION 'Attempt not found'; END IF;

  IF v_att.status = 'in_progress' AND now() > v_att.deadline_at THEN
    PERFORM finalize_attempt(v_att.id, 'auto_submitted');
    RETURN jsonb_build_object('status', 'auto_submitted');
  END IF;
  IF v_att.status <> 'in_progress' THEN
    RETURN jsonb_build_object('status', v_att.status);
  END IF;

  RETURN jsonb_build_object(
    'status', 'in_progress',
    'attempt_id', v_att.id,
    'deadline_at', v_att.deadline_at,
    'server_now', now(),
    'exam', (SELECT jsonb_build_object('title', e.title, 'instructions', e.instructions,
                                       'duration_min', e.duration_min, 'total_marks', e.total_marks)
             FROM exams e WHERE e.id = v_att.exam_id),
    'questions', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
               'exam_question_id', eq.id,
               'position', lo.ord,
               'type', q.type,
               'stem', v.stem,
               'stem_media', v.stem_media,
               'marks', eq.marks,
               'options', CASE WHEN v.options IS NULL THEN NULL ELSE
                 (SELECT jsonb_agg(o.value - 'is_correct' ORDER BY k.ord)
                  FROM jsonb_array_elements_text(v_att.layout -> 'options' -> (eq.id::text)) WITH ORDINALITY AS k(opt_key, ord)
                  JOIN jsonb_array_elements(v.options) AS o(value) ON o.value ->> 'key' = k.opt_key)
               END) ORDER BY lo.ord)
      FROM jsonb_array_elements_text(v_att.layout -> 'questions') WITH ORDINALITY AS lo(eq_id, ord)
      JOIN exam_questions eq ON eq.id = lo.eq_id::uuid
      JOIN question_versions v ON v.id = eq.question_version_id
      JOIN questions q ON q.id = v.question_id), '[]'::jsonb),
    'answers', COALESCE((SELECT jsonb_object_agg(r.exam_question_id::text, r.answer)
                         FROM responses r WHERE r.attempt_id = v_att.id AND r.answer IS NOT NULL), '{}'::jsonb)
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public, pg_temp;

-- Save one answer. Returns 'saved' or 'expired' (time ran out; attempt is closed and scored).
CREATE OR REPLACE FUNCTION save_response(
  p_attempt_id uuid, p_exam_question_id uuid, p_answer jsonb,
  p_time_spent_s integer DEFAULT NULL, p_flagged boolean DEFAULT false
) RETURNS text AS $$
DECLARE
  v_att attempts%ROWTYPE;
  v_eq  exam_questions%ROWTYPE;
BEGIN
  SELECT * INTO v_att FROM attempts
  WHERE id = p_attempt_id AND organisation_id = current_org_id() AND student_id = current_student_id();
  IF NOT FOUND THEN RAISE EXCEPTION 'Attempt not found'; END IF;
  IF v_att.status <> 'in_progress' THEN RETURN 'expired'; END IF;

  -- Five seconds of grace for network delay.
  IF now() > v_att.deadline_at + interval '5 seconds' THEN
    PERFORM finalize_attempt(v_att.id, 'auto_submitted');
    RETURN 'expired';
  END IF;

  SELECT * INTO v_eq FROM exam_questions WHERE id = p_exam_question_id AND exam_id = v_att.exam_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Question does not belong to this exam'; END IF;
  IF p_answer IS NOT NULL AND (jsonb_typeof(p_answer) <> 'object' OR octet_length(p_answer::text) > 20000) THEN
    RAISE EXCEPTION 'Invalid answer format';
  END IF;

  INSERT INTO responses (organisation_id, attempt_id, exam_question_id, exam_id, student_id, topic_id,
                         answer, answered_at, time_spent_s, flagged)
  VALUES (v_att.organisation_id, v_att.id, v_eq.id, v_att.exam_id, v_att.student_id, v_eq.topic_id,
          p_answer, now(), p_time_spent_s, COALESCE(p_flagged, false))
  ON CONFLICT (attempt_id, exam_question_id) DO UPDATE
    SET answer = EXCLUDED.answer,
        answered_at = now(),
        time_spent_s = COALESCE(EXCLUDED.time_spent_s, responses.time_spent_s),
        flagged = EXCLUDED.flagged;
  RETURN 'saved';
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public, pg_temp;

-- Submit. Returns status and, only if the exam releases results immediately, the result.
CREATE OR REPLACE FUNCTION submit_attempt(p_attempt_id uuid) RETURNS jsonb AS $$
DECLARE
  v_att attempts%ROWTYPE;
  v_res record;
BEGIN
  SELECT * INTO v_att FROM attempts
  WHERE id = p_attempt_id AND organisation_id = current_org_id() AND student_id = current_student_id();
  IF NOT FOUND THEN RAISE EXCEPTION 'Attempt not found'; END IF;

  IF v_att.status = 'in_progress' THEN
    IF now() > v_att.deadline_at + interval '5 seconds' THEN
      PERFORM finalize_attempt(v_att.id, 'auto_submitted');
    ELSE
      PERFORM finalize_attempt(v_att.id, 'submitted');
    END IF;
  END IF;

  SELECT status INTO v_att.status FROM attempts WHERE id = p_attempt_id;
  SELECT score, total_marks, percentage, grade, passed INTO v_res
  FROM results WHERE attempt_id = p_attempt_id AND released_at IS NOT NULL;

  RETURN jsonb_build_object('status', v_att.status,
                            'result', CASE WHEN v_res IS NULL THEN NULL ELSE to_jsonb(v_res) END);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public, pg_temp;

-- Released results for a student. Students, linked parents and permitted staff can call it.
CREATE OR REPLACE FUNCTION results_for_student(p_student_id uuid)
RETURNS TABLE (exam_id uuid, exam_title text, kind exam_kind, attempt_no integer, score numeric,
               total_marks numeric, percentage numeric, grade text, passed boolean,
               position_in_class integer, released_at timestamptz, is_official boolean)
AS $$
  SELECT r.exam_id, e.title, e.kind, a.attempt_no, r.score, r.total_marks, r.percentage, r.grade,
         r.passed, r.position_in_class, r.released_at,
         (f.attempt_id IS NOT NULL)
  FROM results r
  JOIN exams e ON e.id = r.exam_id
  JOIN attempts a ON a.id = r.attempt_id
  LEFT JOIN exam_final_results f ON f.attempt_id = r.attempt_id
  WHERE r.student_id = p_student_id
    AND r.organisation_id = current_org_id()
    AND r.released_at IS NOT NULL
    AND (is_self_or_parent(p_student_id) OR staff_can_view_results(p_student_id))
  ORDER BY r.released_at DESC;
$$ LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog, public, pg_temp;

-- Answer review after release, only if the exam allows it.
CREATE OR REPLACE FUNCTION my_attempt_review(p_attempt_id uuid) RETURNS jsonb AS $$
DECLARE
  v_att attempts%ROWTYPE;
BEGIN
  SELECT * INTO v_att FROM attempts
  WHERE id = p_attempt_id AND organisation_id = current_org_id() AND student_id = current_student_id();
  IF NOT FOUND THEN RAISE EXCEPTION 'Attempt not found'; END IF;
  IF NOT EXISTS (SELECT 1 FROM exams WHERE id = v_att.exam_id AND allow_review) THEN
    RAISE EXCEPTION 'Answer review is not enabled for this exam';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM results WHERE attempt_id = p_attempt_id AND released_at IS NOT NULL) THEN
    RAISE EXCEPTION 'Results have not been released yet';
  END IF;

  RETURN COALESCE((
    SELECT jsonb_agg(jsonb_build_object(
             'position', eq.position, 'type', q.type, 'stem', v.stem, 'stem_media', v.stem_media,
             'options', v.options, 'your_answer', r.answer, 'is_correct', r.is_correct,
             'marks_awarded', r.marks_awarded, 'marks', eq.marks,
             'explanation', v.explanation, 'feedback', r.feedback) ORDER BY eq.position)
    FROM responses r
    JOIN exam_questions eq ON eq.id = r.exam_question_id
    JOIN question_versions v ON v.id = eq.question_version_id
    JOIN questions q ON q.id = v.question_id
    WHERE r.attempt_id = p_attempt_id), '[]'::jsonb);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public, pg_temp;

-- ---------------------------------------------------------------------
-- 9. Background job (run every minute by a scheduler as the database owner
--    or a service role; NOT granted to authenticated)
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION run_cbt_maintenance() RETURNS jsonb AS $$
DECLARE
  v_att      uuid;
  v_exam     uuid;
  v_expired  integer := 0;
  v_closed   integer := 0;
  v_released integer := 0;
BEGIN
  PERFORM assert_service_context();   -- Revision 6 (H4): scheduler / service_role only
  -- 1. Auto-submit attempts whose time has run out.
  FOR v_att IN SELECT id FROM attempts WHERE status = 'in_progress' AND deadline_at < now() - interval '10 seconds' LOOP
    PERFORM finalize_attempt(v_att, 'auto_submitted');
    v_expired := v_expired + 1;
  END LOOP;

  -- 2. Close published exams that are past their closing time with nobody still sitting.
  UPDATE exams e SET status = 'closed'
  WHERE e.status = 'published' AND e.closes_at < now()
    AND NOT EXISTS (SELECT 1 FROM attempts a WHERE a.exam_id = e.id AND a.status = 'in_progress');
  GET DIAGNOSTICS v_closed = ROW_COUNT;

  -- 3. Release "after_close" exams once everything is marked.
  FOR v_exam IN
    SELECT e.id FROM exams e
    WHERE e.status = 'closed' AND e.release_policy = 'after_close'
      AND EXISTS (SELECT 1 FROM results r WHERE r.exam_id = e.id AND r.released_at IS NULL)
      AND NOT EXISTS (SELECT 1 FROM results r WHERE r.exam_id = e.id AND NOT r.marking_complete)
  LOOP
    PERFORM release_results_internal(v_exam, false);
    v_released := v_released + 1;
  END LOOP;

  RETURN jsonb_build_object('attempts_auto_submitted', v_expired, 'exams_closed', v_closed,
                            'exams_released', v_released);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public, pg_temp;

-- ---------------------------------------------------------------------
-- 10. Views (Postgres 15+ for security_invoker)
-- ---------------------------------------------------------------------

-- Item analysis: which questions were hard, and how long did they take?
CREATE VIEW question_performance WITH (security_invoker = true) AS
SELECT eq.organisation_id, eq.exam_id, eq.id AS exam_question_id, eq.topic_id, eq.position,
       COUNT(r.id)                                   AS responses,
       COUNT(r.id) FILTER (WHERE r.answer IS NOT NULL) AS answered,
       COUNT(r.id) FILTER (WHERE r.is_correct)       AS correct,
       round(100.0 * COUNT(r.id) FILTER (WHERE r.is_correct) / NULLIF(COUNT(r.id), 0), 1) AS pct_correct,
       round(AVG(r.time_spent_s)::numeric, 1)        AS avg_time_s
FROM exam_questions eq
LEFT JOIN responses r ON r.exam_question_id = eq.id
GROUP BY eq.id;

-- ---------------------------------------------------------------------
-- 11. Grants
-- ---------------------------------------------------------------------
-- Exam status and total_marks are never written directly: status moves through publish_exam() /
-- close_exam(), and total_marks is maintained by a trigger.
GRANT SELECT, DELETE ON exams TO authenticated;
GRANT INSERT (organisation_id, title, kind, subject_id, academic_session_id, blueprint_id, instructions,
              opens_at, closes_at, duration_min, hard_close, attempts_allowed, attempt_policy,
              shuffle_questions, shuffle_options, pass_mark_pct, release_policy, allow_review,
              requires_fees_cleared, created_by) ON exams TO authenticated;
GRANT UPDATE (title, kind, subject_id, academic_session_id, blueprint_id, instructions, opens_at,
              closes_at, duration_min, hard_close, attempts_allowed, attempt_policy, shuffle_questions,
              shuffle_options, pass_mark_pct, release_policy, allow_review, requires_fees_cleared,
              deleted_at) ON exams TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON exam_questions, exam_eligibility TO authenticated;
GRANT SELECT ON attempts, responses, results TO authenticated;   -- all writes go through the functions
GRANT SELECT ON exam_final_results, question_performance TO authenticated;

REVOKE ALL ON FUNCTION
  score_attempt(uuid), finalize_attempt(uuid, attempt_status), release_results_internal(uuid, boolean),
  run_cbt_maintenance(), fees_cleared(uuid), grade_for(numeric, uuid), answer_matches(text, jsonb),
  generate_exam_from_blueprint(uuid), publish_exam(uuid), close_exam(uuid), void_attempt(uuid, text),
  mark_response(uuid, numeric, text), release_results(uuid, boolean), available_exams(),
  start_attempt(uuid, inet, text), get_attempt_paper(uuid),
  save_response(uuid, uuid, jsonb, integer, boolean), submit_attempt(uuid),
  results_for_student(uuid), my_attempt_review(uuid), current_student_id(),
  is_self_or_parent(uuid), staff_can_view_results(uuid), is_eligible(uuid, uuid)
FROM PUBLIC;

GRANT EXECUTE ON FUNCTION
  generate_exam_from_blueprint(uuid), publish_exam(uuid), close_exam(uuid), void_attempt(uuid, text),
  mark_response(uuid, numeric, text), release_results(uuid, boolean), available_exams(),
  start_attempt(uuid, inet, text), get_attempt_paper(uuid),
  save_response(uuid, uuid, jsonb, integer, boolean), submit_attempt(uuid),
  results_for_student(uuid), my_attempt_review(uuid), current_student_id(),
  is_self_or_parent(uuid), staff_can_view_results(uuid), is_eligible(uuid, uuid)
TO authenticated;

-- ---------------------------------------------------------------------
-- 12. Row-level security
-- ---------------------------------------------------------------------
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['exams','exam_questions','exam_eligibility','attempts','responses','results']
  LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
  END LOOP;
END $$;

-- Exams: staff see all; students see exams they are eligible for.
CREATE POLICY exams_read ON exams FOR SELECT TO authenticated
  USING (organisation_id = (SELECT current_org_id())
         AND ((SELECT has_permission('exam.create')) OR (SELECT has_permission('result.read_all')) OR (SELECT has_permission('result.read_class'))
              OR ((SELECT has_permission('exam.take')) AND is_eligible(id, (SELECT current_student_id())))));
CREATE POLICY exams_insert ON exams FOR INSERT TO authenticated
  WITH CHECK (organisation_id = (SELECT current_org_id()) AND (SELECT has_permission('exam.create')));
CREATE POLICY exams_update ON exams FOR UPDATE TO authenticated
  USING (organisation_id = (SELECT current_org_id()) AND (SELECT has_permission('exam.create')) AND status IN ('draft', 'published'))
  WITH CHECK (organisation_id = (SELECT current_org_id()));
CREATE POLICY exams_delete ON exams FOR DELETE TO authenticated
  USING (organisation_id = (SELECT current_org_id()) AND (SELECT has_permission('exam.create')) AND status = 'draft');

-- Exam questions and eligibility: staff only.
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['exam_questions', 'exam_eligibility']
  LOOP
    EXECUTE format(
      'CREATE POLICY %I ON %I FOR SELECT TO authenticated
         USING (organisation_id = (SELECT current_org_id())
                AND ((SELECT has_permission(''exam.create'')) OR (SELECT has_permission(''result.read_all''))
                     OR (SELECT has_permission(''result.read_class''))))', t || '_read', t);
    EXECUTE format(
      'CREATE POLICY %I ON %I FOR ALL TO authenticated
         USING (organisation_id = (SELECT current_org_id()) AND (SELECT has_permission(''exam.create'')))
         WITH CHECK (organisation_id = (SELECT current_org_id()) AND (SELECT has_permission(''exam.create'')))', t || '_write', t);
  END LOOP;
END $$;

-- Attempts: the student's own, or staff who may view that student's results.
CREATE POLICY attempts_read ON attempts FOR SELECT TO authenticated
  USING (organisation_id = (SELECT current_org_id())
         AND (student_id = (SELECT current_student_id()) OR staff_can_view_results(student_id)));

-- Responses (contain marks and correctness): staff only. Students use the functions.
CREATE POLICY responses_read ON responses FOR SELECT TO authenticated
  USING (organisation_id = (SELECT current_org_id()) AND staff_can_view_results(student_id));

-- Results: staff always; the student and linked parents once released.
CREATE POLICY results_read ON results FOR SELECT TO authenticated
  USING (organisation_id = (SELECT current_org_id())
         AND (staff_can_view_results(student_id)
              OR (released_at IS NOT NULL AND is_self_or_parent(student_id))));

INSERT INTO public.schema_migrations (version, description) VALUES ('005', 'CBT and results (rev 6)');

COMMIT;

-- =====================================================================
-- Notes
-- 1. Flow: create exam (draft) -> fill from blueprint or add questions ->
--    assign classes/students -> publish_exam() -> students see it in
--    available_exams() -> start_attempt() -> get_attempt_paper() ->
--    save_response() as they go -> submit_attempt() -> scoring runs ->
--    teachers mark theory with mark_response() -> release_results().
-- 2. Time limits are enforced by the database (deadline_at), not by the
--    browser timer. A late save returns 'expired'.
-- 3. Schedule run_cbt_maintenance() every minute (pg_cron on Supabase, or a
--    serverless cron calling it with a service connection). Without it,
--    abandoned attempts are only closed the next time someone touches them.
-- 4. Auto-marking: multiple choice, true/false and multi-select are
--    all-or-nothing. Fill-in-the-blank matches answer_key ignoring case and
--    extra spaces. A short answer that does not match stays pending for a
--    teacher. Theory answers are always marked by a teacher. Numeric
--    answers such as "9.8" vs "9.80" are not treated as equal; keep both
--    in the accepted list for Physics calculations.
-- 5. If an answer key is corrected after students have sat the exam, the
--    already-scored responses are not re-marked automatically. A regrade
--    function can be added if you need it.
-- 6. fees_cleared() is a stub that returns true. Migration 006 (finance)
--    replaces it, and exams with requires_fees_cleared = true then respect
--    outstanding balances.
-- 7. Attempt-level integrity events (tab switches, disconnects) are not
--    stored yet; CAS event tables in migration 007 can capture them.
-- 8. Offline CBT (school without internet) is not handled here. If you
--    need it, the paper would be cached and answers synced later; decide
--    that before building the student exam screen.
-- =====================================================================