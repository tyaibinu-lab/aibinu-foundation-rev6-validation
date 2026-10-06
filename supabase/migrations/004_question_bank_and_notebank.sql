-- =====================================================================
-- Aibinu FlexiPrep: Migration 004
-- Question bank and NoteBank: versioned content, peer review,
-- publication, search
-- Requires: 001, 002, 003
-- =====================================================================

BEGIN;
SELECT public.migration_begin('004', '003');   -- Revision 6 (M5)

-- ---------------------------------------------------------------------
-- 0. Patch for anyone who already ran 001-003 with FORCE ROW LEVEL SECURITY
-- FORCE makes RLS apply to the table owner too, which would block the
-- SECURITY DEFINER helper functions (they run as the owner). Your API
-- connects as a member of authenticated, so FORCE is not needed.
-- Safe to run even if FORCE was never set.
-- ---------------------------------------------------------------------
DO $$
DECLARE t text;
BEGIN
  FOR t IN SELECT tablename FROM pg_tables WHERE schemaname = 'public' AND rowsecurity
  LOOP
    EXECUTE format('ALTER TABLE %I NO FORCE ROW LEVEL SECURITY', t);
  END LOOP;
END $$;

-- ---------------------------------------------------------------------
-- 1. Stable topic identity across syllabus versions
-- topic_key stays the same when a topic is copied into a new curriculum
-- version. Mastery and analytics should group by topic_key. When you copy
-- a topic to a new version, copy its topic_key too.
-- ---------------------------------------------------------------------
ALTER TABLE curriculum_topics ADD COLUMN topic_key uuid NOT NULL DEFAULT gen_random_uuid();
CREATE UNIQUE INDEX uq_topic_key_per_version ON curriculum_topics(version_id, topic_key);
CREATE INDEX idx_topics_key ON curriculum_topics(organisation_id, topic_key);

-- ---------------------------------------------------------------------
-- 2. Enums
-- ---------------------------------------------------------------------
CREATE TYPE content_status     AS ENUM ('draft', 'in_review', 'approved', 'published', 'archived');
CREATE TYPE content_source     AS ENUM ('manual', 'ai', 'imported', 'adopted');
CREATE TYPE content_visibility AS ENUM ('private', 'organisation', 'shared');  -- 'shared' is used by the shared library later
CREATE TYPE review_decision    AS ENUM ('approved', 'changes_requested', 'rejected');
CREATE TYPE question_type      AS ENUM ('mcq', 'multi_select', 'true_false', 'fill_blank', 'short_answer', 'theory');

-- ---------------------------------------------------------------------
-- 3. Permissions
-- teacher gets review rights (authors can never review their own work).
-- ---------------------------------------------------------------------
-- Revision 6 (C1/C5): permission seed removed; the catalogue and role mappings live in 001.

-- Revision 6 (C1/C5): permission seed removed; the catalogue and role mappings live in 001.

-- Revision 6 (C1/C5): permission seed removed; the catalogue and role mappings live in 001.

-- ---------------------------------------------------------------------
-- 4. Question bank tables
-- ---------------------------------------------------------------------
CREATE TABLE questions (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organisation_id    uuid NOT NULL REFERENCES organisations(id) ON DELETE CASCADE,
  topic_id           uuid NOT NULL,
  type               question_type NOT NULL,
  status             content_status NOT NULL DEFAULT 'draft',
  source             content_source NOT NULL DEFAULT 'manual',
  current_version_id uuid,               -- the live (published) version; FK added below
  created_by         uuid REFERENCES users(id),
  created_at         timestamptz NOT NULL DEFAULT now(),
  updated_at         timestamptz NOT NULL DEFAULT now(),
  deleted_at         timestamptz,
  UNIQUE (id, organisation_id),
  FOREIGN KEY (topic_id, organisation_id) REFERENCES curriculum_topics(id, organisation_id)
);
CREATE INDEX idx_questions_topic  ON questions(organisation_id, topic_id) WHERE deleted_at IS NULL;
CREATE INDEX idx_questions_status ON questions(organisation_id, status);

CREATE TABLE question_versions (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organisation_id   uuid NOT NULL REFERENCES organisations(id) ON DELETE CASCADE,
  question_id       uuid NOT NULL,
  version_no        integer,                       -- filled automatically
  status            content_status NOT NULL DEFAULT 'draft',
  stem              text NOT NULL,                 -- the question text (markdown; LaTeX allowed)
  stem_media        jsonb NOT NULL DEFAULT '[]'::jsonb,   -- images, diagrams
  options           jsonb,                         -- [{"key":"A","text":"...","is_correct":true}, ...]
  answer_key        jsonb,                         -- for fill_blank / short_answer / theory marking scheme
  explanation       text,
  marks             numeric(5,2) NOT NULL DEFAULT 1 CHECK (marks > 0),
  difficulty        difficulty_level NOT NULL DEFAULT 'medium',
  cognitive_level   cognitive_level NOT NULL DEFAULT 'understand',
  estimated_seconds integer CHECK (estimated_seconds IS NULL OR estimated_seconds > 0),
  created_by        uuid REFERENCES users(id),
  created_at        timestamptz NOT NULL DEFAULT now(),
  search_vector     tsvector GENERATED ALWAYS AS (
                      to_tsvector('english'::regconfig,
                                  coalesce(stem, '') || ' ' || coalesce(explanation, ''))
                    ) STORED,
  UNIQUE (id, organisation_id),
  UNIQUE (question_id, version_no),
  FOREIGN KEY (question_id, organisation_id)
    REFERENCES questions(id, organisation_id) ON DELETE CASCADE
);
-- Revision 6 (L4): idx_qv_question removed; UNIQUE (question_id, version_no) already serves it.
CREATE INDEX idx_qv_search   ON question_versions USING gin(search_vector);

ALTER TABLE questions
  ADD CONSTRAINT fk_questions_current_version
  FOREIGN KEY (current_version_id, organisation_id)
  REFERENCES question_versions(id, organisation_id)
  DEFERRABLE INITIALLY DEFERRED;

CREATE TABLE question_reviews (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organisation_id     uuid NOT NULL REFERENCES organisations(id) ON DELETE CASCADE,
  question_version_id uuid NOT NULL,
  reviewer_id         uuid NOT NULL REFERENCES users(id),
  decision            review_decision NOT NULL,
  comments            text,
  reviewed_at         timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (question_version_id, organisation_id)
    REFERENCES question_versions(id, organisation_id) ON DELETE CASCADE
);
CREATE INDEX idx_qr_version ON question_reviews(question_version_id);

CREATE TABLE question_publications (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organisation_id     uuid NOT NULL REFERENCES organisations(id) ON DELETE CASCADE,
  question_id         uuid NOT NULL,
  question_version_id uuid NOT NULL,
  visibility          content_visibility NOT NULL DEFAULT 'organisation',
  published_by        uuid REFERENCES users(id),
  published_at        timestamptz NOT NULL DEFAULT now(),
  unpublished_at      timestamptz,
  FOREIGN KEY (question_id, organisation_id)         REFERENCES questions(id, organisation_id) ON DELETE CASCADE,
  FOREIGN KEY (question_version_id, organisation_id) REFERENCES question_versions(id, organisation_id) ON DELETE CASCADE
);
-- One live publication per question.
CREATE UNIQUE INDEX uq_one_live_question_publication
  ON question_publications(question_id) WHERE unpublished_at IS NULL;

-- ---------------------------------------------------------------------
-- 5. NoteBank tables
-- ---------------------------------------------------------------------
CREATE TABLE notes (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organisation_id    uuid NOT NULL REFERENCES organisations(id) ON DELETE CASCADE,
  topic_id           uuid NOT NULL,
  title              text NOT NULL,
  status             content_status NOT NULL DEFAULT 'draft',
  source             content_source NOT NULL DEFAULT 'manual',
  current_version_id uuid,
  created_by         uuid REFERENCES users(id),
  created_at         timestamptz NOT NULL DEFAULT now(),
  updated_at         timestamptz NOT NULL DEFAULT now(),
  deleted_at         timestamptz,
  UNIQUE (id, organisation_id),
  FOREIGN KEY (topic_id, organisation_id) REFERENCES curriculum_topics(id, organisation_id)
);
CREATE INDEX idx_notes_topic ON notes(organisation_id, topic_id) WHERE deleted_at IS NULL;

CREATE TABLE note_versions (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organisation_id uuid NOT NULL REFERENCES organisations(id) ON DELETE CASCADE,
  note_id         uuid NOT NULL,
  version_no      integer,
  status          content_status NOT NULL DEFAULT 'draft',
  body            text NOT NULL,                   -- markdown / rich text
  summary         text,
  media           jsonb NOT NULL DEFAULT '[]'::jsonb,
  reading_minutes integer CHECK (reading_minutes IS NULL OR reading_minutes > 0),
  created_by      uuid REFERENCES users(id),
  created_at      timestamptz NOT NULL DEFAULT now(),
  search_vector   tsvector GENERATED ALWAYS AS (
                    to_tsvector('english'::regconfig,
                                coalesce(summary, '') || ' ' || coalesce(body, ''))
                  ) STORED,
  UNIQUE (id, organisation_id),
  UNIQUE (note_id, version_no),
  FOREIGN KEY (note_id, organisation_id)
    REFERENCES notes(id, organisation_id) ON DELETE CASCADE
);
-- Revision 6 (L4): idx_nv_note removed; UNIQUE (note_id, version_no) already serves it.
CREATE INDEX idx_nv_search ON note_versions USING gin(search_vector);

ALTER TABLE notes
  ADD CONSTRAINT fk_notes_current_version
  FOREIGN KEY (current_version_id, organisation_id)
  REFERENCES note_versions(id, organisation_id)
  DEFERRABLE INITIALLY DEFERRED;

CREATE TABLE note_reviews (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organisation_id uuid NOT NULL REFERENCES organisations(id) ON DELETE CASCADE,
  note_version_id uuid NOT NULL,
  reviewer_id     uuid NOT NULL REFERENCES users(id),
  decision        review_decision NOT NULL,
  comments        text,
  reviewed_at     timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (note_version_id, organisation_id)
    REFERENCES note_versions(id, organisation_id) ON DELETE CASCADE
);
CREATE INDEX idx_nr_version ON note_reviews(note_version_id);

CREATE TABLE note_publications (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organisation_id uuid NOT NULL REFERENCES organisations(id) ON DELETE CASCADE,
  note_id         uuid NOT NULL,
  note_version_id uuid NOT NULL,
  visibility      content_visibility NOT NULL DEFAULT 'organisation',
  published_by    uuid REFERENCES users(id),
  published_at    timestamptz NOT NULL DEFAULT now(),
  unpublished_at  timestamptz,
  FOREIGN KEY (note_id, organisation_id)         REFERENCES notes(id, organisation_id) ON DELETE CASCADE,
  FOREIGN KEY (note_version_id, organisation_id) REFERENCES note_versions(id, organisation_id) ON DELETE CASCADE
);
CREATE UNIQUE INDEX uq_one_live_note_publication
  ON note_publications(note_id) WHERE unpublished_at IS NULL;

-- Reading activity: feeds recommendations and engagement reports.
CREATE TABLE note_views (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organisation_id uuid NOT NULL REFERENCES organisations(id) ON DELETE CASCADE,
  note_id         uuid NOT NULL,
  student_id      uuid NOT NULL,
  viewed_at       timestamptz NOT NULL DEFAULT now(),
  duration_s      integer CHECK (duration_s IS NULL OR duration_s >= 0),
  FOREIGN KEY (note_id, organisation_id)    REFERENCES notes(id, organisation_id) ON DELETE CASCADE,
  FOREIGN KEY (student_id, organisation_id) REFERENCES students(id, organisation_id) ON DELETE CASCADE
);
CREATE INDEX idx_note_views_student ON note_views(student_id, viewed_at DESC);
CREATE INDEX idx_note_views_note    ON note_views(note_id);

-- updated_at triggers
CREATE TRIGGER trg_questions_updated BEFORE UPDATE ON questions
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trg_notes_updated BEFORE UPDATE ON notes
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ---------------------------------------------------------------------
-- 6. Integrity triggers
-- ---------------------------------------------------------------------

-- Auto-number versions.
CREATE OR REPLACE FUNCTION assign_question_version_no() RETURNS trigger AS $$
BEGIN
  IF NEW.version_no IS NULL THEN
    SELECT COALESCE(MAX(version_no), 0) + 1 INTO NEW.version_no
    FROM question_versions WHERE question_id = NEW.question_id;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
CREATE TRIGGER trg_qv_version_no BEFORE INSERT ON question_versions
  FOR EACH ROW EXECUTE FUNCTION assign_question_version_no();

CREATE OR REPLACE FUNCTION assign_note_version_no() RETURNS trigger AS $$
BEGIN
  IF NEW.version_no IS NULL THEN
    SELECT COALESCE(MAX(version_no), 0) + 1 INTO NEW.version_no
    FROM note_versions WHERE note_id = NEW.note_id;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
CREATE TRIGGER trg_nv_version_no BEFORE INSERT ON note_versions
  FOR EACH ROW EXECUTE FUNCTION assign_note_version_no();

-- Content is editable only while a version is a draft.
-- (Status can still change through the review and publish functions.)
CREATE OR REPLACE FUNCTION lock_question_version_content() RETURNS trigger AS $$
BEGIN
  IF OLD.status <> 'draft' AND (
       (OLD.stem, OLD.stem_media, OLD.options, OLD.answer_key, OLD.explanation,
        OLD.marks, OLD.difficulty, OLD.cognitive_level)
       IS DISTINCT FROM
       (NEW.stem, NEW.stem_media, NEW.options, NEW.answer_key, NEW.explanation,
        NEW.marks, NEW.difficulty, NEW.cognitive_level)) THEN
    RAISE EXCEPTION 'Question version % is % and cannot be edited; create a new version', OLD.id, OLD.status;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
CREATE TRIGGER trg_qv_lock BEFORE UPDATE ON question_versions
  FOR EACH ROW EXECUTE FUNCTION lock_question_version_content();

CREATE OR REPLACE FUNCTION lock_note_version_content() RETURNS trigger AS $$
BEGIN
  IF OLD.status <> 'draft' AND
     (OLD.body, OLD.summary, OLD.media) IS DISTINCT FROM (NEW.body, NEW.summary, NEW.media) THEN
    RAISE EXCEPTION 'Note version % is % and cannot be edited; create a new version', OLD.id, OLD.status;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
CREATE TRIGGER trg_nv_lock BEFORE UPDATE ON note_versions
  FOR EACH ROW EXECUTE FUNCTION lock_note_version_content();

-- Validate answer options against the question type.
CREATE OR REPLACE FUNCTION validate_question_version() RETURNS trigger AS $$
DECLARE
  qtype   question_type;
  n_opts  integer;
  n_right integer;
BEGIN
  SELECT type INTO qtype FROM questions WHERE id = NEW.question_id;

  IF qtype IN ('mcq', 'multi_select', 'true_false') THEN
    IF NEW.options IS NULL OR jsonb_typeof(NEW.options) <> 'array' THEN
      RAISE EXCEPTION 'Options must be a JSON array for % questions', qtype;
    END IF;
    n_opts  := jsonb_array_length(NEW.options);
    SELECT COUNT(*) INTO n_right
    FROM jsonb_array_elements(NEW.options) o
    WHERE COALESCE((o ->> 'is_correct')::boolean, false);

    IF qtype = 'true_false' AND n_opts <> 2 THEN
      RAISE EXCEPTION 'True/false questions need exactly 2 options';
    END IF;
    IF qtype IN ('mcq', 'multi_select') AND n_opts < 2 THEN
      RAISE EXCEPTION 'Multiple-choice questions need at least 2 options';
    END IF;
    IF qtype IN ('mcq', 'true_false') AND n_right <> 1 THEN
      RAISE EXCEPTION '% questions need exactly one correct option (found %)', qtype, n_right;
    END IF;
    IF qtype = 'multi_select' AND n_right < 1 THEN
      RAISE EXCEPTION 'Multi-select questions need at least one correct option';
    END IF;

  ELSIF qtype IN ('fill_blank', 'short_answer') THEN
    IF NEW.answer_key IS NULL OR NEW.answer_key IN ('null'::jsonb, '[]'::jsonb, '{}'::jsonb) THEN
      RAISE EXCEPTION '% questions need an answer_key', qtype;
    END IF;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
CREATE TRIGGER trg_qv_validate BEFORE INSERT OR UPDATE ON question_versions
  FOR EACH ROW EXECUTE FUNCTION validate_question_version();

-- Reviews: only in_review versions, and never by the author.
CREATE OR REPLACE FUNCTION validate_question_review() RETURNS trigger AS $$
DECLARE v record;
BEGIN
  SELECT status, created_by INTO v
  FROM question_versions
  WHERE id = NEW.question_version_id AND organisation_id = NEW.organisation_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Question version not found'; END IF;
  IF v.status <> 'in_review' THEN
    RAISE EXCEPTION 'Only versions that are in review can be reviewed (status: %)', v.status;
  END IF;
  IF v.created_by = NEW.reviewer_id THEN
    RAISE EXCEPTION 'Authors cannot review their own work';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public, pg_temp;
CREATE TRIGGER trg_qr_validate BEFORE INSERT ON question_reviews
  FOR EACH ROW EXECUTE FUNCTION validate_question_review();

CREATE OR REPLACE FUNCTION apply_question_review() RETURNS trigger AS $$
BEGIN
  UPDATE question_versions SET status = CASE NEW.decision
      WHEN 'approved'          THEN 'approved'::content_status
      WHEN 'changes_requested' THEN 'draft'::content_status
      ELSE 'archived'::content_status END
  WHERE id = NEW.question_version_id;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public, pg_temp;
CREATE TRIGGER trg_qr_apply AFTER INSERT ON question_reviews
  FOR EACH ROW EXECUTE FUNCTION apply_question_review();

CREATE OR REPLACE FUNCTION validate_note_review() RETURNS trigger AS $$
DECLARE v record;
BEGIN
  SELECT status, created_by INTO v
  FROM note_versions
  WHERE id = NEW.note_version_id AND organisation_id = NEW.organisation_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Note version not found'; END IF;
  IF v.status <> 'in_review' THEN
    RAISE EXCEPTION 'Only versions that are in review can be reviewed (status: %)', v.status;
  END IF;
  IF v.created_by = NEW.reviewer_id THEN
    RAISE EXCEPTION 'Authors cannot review their own work';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public, pg_temp;
CREATE TRIGGER trg_nr_validate BEFORE INSERT ON note_reviews
  FOR EACH ROW EXECUTE FUNCTION validate_note_review();

CREATE OR REPLACE FUNCTION apply_note_review() RETURNS trigger AS $$
BEGIN
  UPDATE note_versions SET status = CASE NEW.decision
      WHEN 'approved'          THEN 'approved'::content_status
      WHEN 'changes_requested' THEN 'draft'::content_status
      ELSE 'archived'::content_status END
  WHERE id = NEW.note_version_id;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public, pg_temp;
CREATE TRIGGER trg_nr_apply AFTER INSERT ON note_reviews
  FOR EACH ROW EXECUTE FUNCTION apply_note_review();

-- ---------------------------------------------------------------------
-- 7. Workflow functions (the API calls these; they enforce permissions)
-- ---------------------------------------------------------------------

-- Author sends a draft for review.
CREATE OR REPLACE FUNCTION submit_question_version(p_version_id uuid) RETURNS void AS $$
BEGIN
  IF NOT has_permission('academic.questions.write') THEN
    RAISE EXCEPTION 'Permission denied: academic.questions.write required';
  END IF;
  UPDATE question_versions SET status = 'in_review'
  WHERE id = p_version_id AND organisation_id = current_org_id() AND status = 'draft';
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Version not found or not a draft';
  END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public, pg_temp;

CREATE OR REPLACE FUNCTION submit_note_version(p_version_id uuid) RETURNS void AS $$
BEGIN
  IF NOT has_permission('academic.notes.write') THEN
    RAISE EXCEPTION 'Permission denied: academic.notes.write required';
  END IF;
  UPDATE note_versions SET status = 'in_review'
  WHERE id = p_version_id AND organisation_id = current_org_id() AND status = 'draft';
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Version not found or not a draft';
  END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public, pg_temp;

-- Publish an approved version. The previous live version is archived.
CREATE OR REPLACE FUNCTION publish_question_version(
  p_version_id uuid,
  p_visibility content_visibility DEFAULT 'organisation'
) RETURNS void AS $$
DECLARE v record;
BEGIN
  IF NOT has_permission('academic.questions.publish') THEN
    RAISE EXCEPTION 'Permission denied: academic.questions.publish required';
  END IF;
  SELECT id, question_id, status INTO v
  FROM question_versions
  WHERE id = p_version_id AND organisation_id = current_org_id();
  IF NOT FOUND THEN RAISE EXCEPTION 'Version not found'; END IF;
  IF v.status <> 'approved' THEN
    RAISE EXCEPTION 'Only approved versions can be published (status: %)', v.status;
  END IF;

  UPDATE question_versions SET status = 'archived'
  WHERE question_id = v.question_id AND status = 'published';
  UPDATE question_publications SET unpublished_at = now()
  WHERE question_id = v.question_id AND unpublished_at IS NULL;

  UPDATE question_versions SET status = 'published' WHERE id = v.id;
  UPDATE questions SET current_version_id = v.id, status = 'published'
  WHERE id = v.question_id;
  INSERT INTO question_publications
    (organisation_id, question_id, question_version_id, visibility, published_by)
  VALUES (current_org_id(), v.question_id, v.id, p_visibility, current_user_id());
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public, pg_temp;

CREATE OR REPLACE FUNCTION publish_note_version(
  p_version_id uuid,
  p_visibility content_visibility DEFAULT 'organisation'
) RETURNS void AS $$
DECLARE v record;
BEGIN
  IF NOT has_permission('academic.notes.publish') THEN
    RAISE EXCEPTION 'Permission denied: academic.notes.publish required';
  END IF;
  SELECT id, note_id, status INTO v
  FROM note_versions
  WHERE id = p_version_id AND organisation_id = current_org_id();
  IF NOT FOUND THEN RAISE EXCEPTION 'Version not found'; END IF;
  IF v.status <> 'approved' THEN
    RAISE EXCEPTION 'Only approved versions can be published (status: %)', v.status;
  END IF;

  UPDATE note_versions SET status = 'archived'
  WHERE note_id = v.note_id AND status = 'published';
  UPDATE note_publications SET unpublished_at = now()
  WHERE note_id = v.note_id AND unpublished_at IS NULL;

  UPDATE note_versions SET status = 'published' WHERE id = v.id;
  UPDATE notes SET current_version_id = v.id, status = 'published'
  WHERE id = v.note_id;
  INSERT INTO note_publications
    (organisation_id, note_id, note_version_id, visibility, published_by)
  VALUES (current_org_id(), v.note_id, v.id, p_visibility, current_user_id());
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public, pg_temp;

-- Take content offline.
CREATE OR REPLACE FUNCTION unpublish_question(p_question_id uuid) RETURNS void AS $$
BEGIN
  IF NOT has_permission('academic.questions.publish') THEN
    RAISE EXCEPTION 'Permission denied: academic.questions.publish required';
  END IF;
  UPDATE question_publications SET unpublished_at = now()
  WHERE question_id = p_question_id AND organisation_id = current_org_id() AND unpublished_at IS NULL;
  UPDATE question_versions SET status = 'archived'
  WHERE question_id = p_question_id AND organisation_id = current_org_id() AND status = 'published';
  UPDATE questions SET status = 'archived'
  WHERE id = p_question_id AND organisation_id = current_org_id();
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public, pg_temp;

CREATE OR REPLACE FUNCTION unpublish_note(p_note_id uuid) RETURNS void AS $$
BEGIN
  IF NOT has_permission('academic.notes.publish') THEN
    RAISE EXCEPTION 'Permission denied: academic.notes.publish required';
  END IF;
  UPDATE note_publications SET unpublished_at = now()
  WHERE note_id = p_note_id AND organisation_id = current_org_id() AND unpublished_at IS NULL;
  UPDATE note_versions SET status = 'archived'
  WHERE note_id = p_note_id AND organisation_id = current_org_id() AND status = 'published';
  UPDATE notes SET status = 'archived'
  WHERE id = p_note_id AND organisation_id = current_org_id();
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public, pg_temp;

-- Search published notes. Runs with the caller's permissions, so RLS applies.
CREATE OR REPLACE FUNCTION search_notes(p_query text, p_topic_id uuid DEFAULT NULL)
RETURNS TABLE (note_id uuid, title text, topic_id uuid, rank real, snippet text)
AS $$
  SELECT n.id, n.title, n.topic_id,
         ts_rank(nv.search_vector, q.tsq) AS rank,
         ts_headline('english', coalesce(nv.summary, nv.body), q.tsq,
                     'MaxWords=30, MinWords=10')
  FROM note_versions nv
  JOIN notes n ON n.id = nv.note_id
  CROSS JOIN LATERAL (SELECT websearch_to_tsquery('english', p_query) AS tsq) q
  WHERE nv.status = 'published'
    AND n.deleted_at IS NULL
    AND nv.search_vector @@ q.tsq
    AND (p_topic_id IS NULL OR n.topic_id = p_topic_id)
  ORDER BY rank DESC
  LIMIT 25;
$$ LANGUAGE sql STABLE;

-- ---------------------------------------------------------------------
-- 8. Grants
-- ---------------------------------------------------------------------
-- Column-level grants close a review bypass: authors may write CONTENT, never status, the
-- live-version pointer or ownership. Status moves only through the submit / review / publish
-- functions, which run as the owner.
GRANT SELECT, DELETE ON questions, question_versions, notes, note_versions TO authenticated;
GRANT INSERT (organisation_id, topic_id, type, source, created_by) ON questions TO authenticated;
GRANT UPDATE (topic_id, deleted_at)                                ON questions TO authenticated;
GRANT INSERT (organisation_id, question_id, stem, stem_media, options, answer_key, explanation,
              marks, difficulty, cognitive_level, estimated_seconds, created_by) ON question_versions TO authenticated;
GRANT UPDATE (stem, stem_media, options, answer_key, explanation, marks, difficulty,
              cognitive_level, estimated_seconds)                  ON question_versions TO authenticated;
GRANT INSERT (organisation_id, topic_id, title, source, created_by) ON notes TO authenticated;
GRANT UPDATE (title, topic_id, deleted_at)                          ON notes TO authenticated;
GRANT INSERT (organisation_id, note_id, body, summary, media, reading_minutes, created_by) ON note_versions TO authenticated;
GRANT UPDATE (body, summary, media, reading_minutes)                ON note_versions TO authenticated;
GRANT SELECT, INSERT ON question_reviews, note_reviews, note_views TO authenticated;   -- reviews are append-only
GRANT SELECT ON question_publications, note_publications TO authenticated;             -- written only by publish functions

REVOKE ALL ON FUNCTION
  submit_question_version(uuid), submit_note_version(uuid),
  publish_question_version(uuid, content_visibility), publish_note_version(uuid, content_visibility),
  unpublish_question(uuid), unpublish_note(uuid)
FROM PUBLIC;
GRANT EXECUTE ON FUNCTION
  submit_question_version(uuid), submit_note_version(uuid),
  publish_question_version(uuid, content_visibility), publish_note_version(uuid, content_visibility),
  unpublish_question(uuid), unpublish_note(uuid), search_notes(text, uuid)
TO authenticated;

-- ---------------------------------------------------------------------
-- 9. Row-level security
-- Questions hold answer keys, so they are staff-only. Students receive
-- exam questions through the CBT delivery layer (migration 005), which
-- strips answers. Students can read published notes only.
-- ---------------------------------------------------------------------
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['questions','question_versions','question_reviews','question_publications',
                           'notes','note_versions','note_reviews','note_publications','note_views']
  LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
  END LOOP;
END $$;

-- Questions
CREATE POLICY questions_read ON questions FOR SELECT TO authenticated
  USING (organisation_id = (SELECT current_org_id())
         AND ((SELECT has_permission('academic.questions.read')) OR (SELECT has_permission('academic.questions.write'))
              OR (SELECT has_permission('academic.questions.review')) OR (SELECT has_permission('academic.questions.approve'))
              OR (SELECT has_permission('academic.questions.publish'))));
-- created_by must be the real author, so "authors cannot review their own work" holds.
CREATE POLICY questions_insert ON questions FOR INSERT TO authenticated
  WITH CHECK (organisation_id = (SELECT current_org_id()) AND (SELECT has_permission('academic.questions.write'))
              AND created_by = (SELECT current_user_id()));
-- Revision 6: only unpublished questions may be edited or soft-deleted directly; taking live
-- content offline goes through unpublish_question() (academic.questions.publish).
CREATE POLICY questions_update ON questions FOR UPDATE TO authenticated
  USING (organisation_id = (SELECT current_org_id()) AND (SELECT has_permission('academic.questions.write')) AND status = 'draft')
  WITH CHECK (organisation_id = (SELECT current_org_id()));
CREATE POLICY questions_delete ON questions FOR DELETE TO authenticated
  USING (organisation_id = (SELECT current_org_id()) AND (SELECT has_permission('academic.questions.write')) AND status = 'draft');

CREATE POLICY qv_read ON question_versions FOR SELECT TO authenticated
  USING (organisation_id = (SELECT current_org_id())
         AND ((SELECT has_permission('academic.questions.read')) OR (SELECT has_permission('academic.questions.write'))
              OR (SELECT has_permission('academic.questions.review')) OR (SELECT has_permission('academic.questions.approve'))
              OR (SELECT has_permission('academic.questions.publish'))));
-- created_by must be the real author, so "authors cannot review their own work" holds.
CREATE POLICY qv_insert ON question_versions FOR INSERT TO authenticated
  WITH CHECK (organisation_id = (SELECT current_org_id()) AND (SELECT has_permission('academic.questions.write'))
              AND created_by = (SELECT current_user_id()));
CREATE POLICY qv_update ON question_versions FOR UPDATE TO authenticated
  USING (organisation_id = (SELECT current_org_id()) AND (SELECT has_permission('academic.questions.write')) AND status = 'draft')
  WITH CHECK (organisation_id = (SELECT current_org_id()));
CREATE POLICY qv_delete ON question_versions FOR DELETE TO authenticated
  USING (organisation_id = (SELECT current_org_id()) AND (SELECT has_permission('academic.questions.write')) AND status = 'draft');

CREATE POLICY qr_read ON question_reviews FOR SELECT TO authenticated
  USING (organisation_id = (SELECT current_org_id())
         AND ((SELECT has_permission('academic.questions.review')) OR (SELECT has_permission('academic.questions.approve'))
              OR (SELECT has_permission('academic.questions.write')) OR (SELECT has_permission('academic.questions.publish'))));
-- Revision 6: 'approved' needs academic.questions.approve; 'changes_requested'/'rejected' need
-- academic.questions.review (or approve). Self-review is blocked by trg_qr_validate.
CREATE POLICY qr_insert ON question_reviews FOR INSERT TO authenticated
  WITH CHECK (organisation_id = (SELECT current_org_id())
              AND reviewer_id = (SELECT current_user_id())
              AND CASE WHEN decision = 'approved' THEN (SELECT has_permission('academic.questions.approve'))
                       ELSE (SELECT has_permission('academic.questions.review')) OR (SELECT has_permission('academic.questions.approve')) END);

CREATE POLICY qp_read ON question_publications FOR SELECT TO authenticated
  USING (organisation_id = (SELECT current_org_id())
         AND ((SELECT has_permission('academic.questions.read')) OR (SELECT has_permission('academic.questions.write'))
              OR (SELECT has_permission('academic.questions.review')) OR (SELECT has_permission('academic.questions.publish'))));

-- Notes: staff see everything; other members see only live (published) notes.
CREATE POLICY notes_read ON notes FOR SELECT TO authenticated
  USING (organisation_id = (SELECT current_org_id())
         AND ((SELECT has_permission('academic.notes.write')) OR (SELECT has_permission('academic.notes.review'))
              OR (SELECT has_permission('academic.notes.approve')) OR (SELECT has_permission('academic.notes.publish'))
              OR (status = 'published' AND (SELECT has_permission('academic.notes.read')))));
-- created_by must be the real author, so "authors cannot review their own work" holds.
CREATE POLICY notes_insert ON notes FOR INSERT TO authenticated
  WITH CHECK (organisation_id = (SELECT current_org_id()) AND (SELECT has_permission('academic.notes.write'))
              AND created_by = (SELECT current_user_id()));
-- Revision 6: only unpublished notes may be edited or soft-deleted directly (unpublish_note() takes live notes offline).
CREATE POLICY notes_update ON notes FOR UPDATE TO authenticated
  USING (organisation_id = (SELECT current_org_id()) AND (SELECT has_permission('academic.notes.write')) AND status = 'draft')
  WITH CHECK (organisation_id = (SELECT current_org_id()));
CREATE POLICY notes_delete ON notes FOR DELETE TO authenticated
  USING (organisation_id = (SELECT current_org_id()) AND (SELECT has_permission('academic.notes.write')) AND status = 'draft');

-- Revision 6 (M7): approvers and publishers also see the queue (approved, not yet published).
CREATE POLICY nv_read ON note_versions FOR SELECT TO authenticated
  USING (organisation_id = (SELECT current_org_id())
         AND ((SELECT has_permission('academic.notes.write')) OR (SELECT has_permission('academic.notes.review'))
              OR (SELECT has_permission('academic.notes.approve')) OR (SELECT has_permission('academic.notes.publish'))
              OR (status = 'published' AND (SELECT has_permission('academic.notes.read')))));
-- created_by must be the real author, so "authors cannot review their own work" holds.
CREATE POLICY nv_insert ON note_versions FOR INSERT TO authenticated
  WITH CHECK (organisation_id = (SELECT current_org_id()) AND (SELECT has_permission('academic.notes.write'))
              AND created_by = (SELECT current_user_id()));
CREATE POLICY nv_update ON note_versions FOR UPDATE TO authenticated
  USING (organisation_id = (SELECT current_org_id()) AND (SELECT has_permission('academic.notes.write')) AND status = 'draft')
  WITH CHECK (organisation_id = (SELECT current_org_id()));
CREATE POLICY nv_delete ON note_versions FOR DELETE TO authenticated
  USING (organisation_id = (SELECT current_org_id()) AND (SELECT has_permission('academic.notes.write')) AND status = 'draft');

CREATE POLICY nr_read ON note_reviews FOR SELECT TO authenticated
  USING (organisation_id = (SELECT current_org_id())
         AND ((SELECT has_permission('academic.notes.review')) OR (SELECT has_permission('academic.notes.approve'))
              OR (SELECT has_permission('academic.notes.write')) OR (SELECT has_permission('academic.notes.publish'))));
-- Revision 6: 'approved' needs academic.notes.approve; other decisions need review (or approve).
CREATE POLICY nr_insert ON note_reviews FOR INSERT TO authenticated
  WITH CHECK (organisation_id = (SELECT current_org_id())
              AND reviewer_id = (SELECT current_user_id())
              AND CASE WHEN decision = 'approved' THEN (SELECT has_permission('academic.notes.approve'))
                       ELSE (SELECT has_permission('academic.notes.review')) OR (SELECT has_permission('academic.notes.approve')) END);

CREATE POLICY np_read ON note_publications FOR SELECT TO authenticated
  USING (organisation_id = (SELECT current_org_id())
         AND ((SELECT has_permission('academic.notes.write')) OR (SELECT has_permission('academic.notes.review'))
              OR (SELECT has_permission('academic.notes.approve')) OR (SELECT has_permission('academic.notes.publish'))));

-- Note views: a student logs and reads their own; staff with reporting can read all.
CREATE POLICY note_views_insert ON note_views FOR INSERT TO authenticated
  WITH CHECK (organisation_id = (SELECT current_org_id())
              AND EXISTS (SELECT 1 FROM students s
                          WHERE s.id = note_views.student_id
                            AND s.user_id = (SELECT current_user_id())));
CREATE POLICY note_views_read ON note_views FOR SELECT TO authenticated
  USING (organisation_id = (SELECT current_org_id())
         AND ((SELECT has_permission('report.view')) OR can_view_student(student_id)));

-- ---------------------------------------------------------------------
-- 10. Convenience views (Postgres 15+ for security_invoker)
-- ---------------------------------------------------------------------
CREATE VIEW question_current WITH (security_invoker = true) AS
SELECT q.organisation_id, q.id AS question_id, q.topic_id, q.type, q.status AS question_status,
       v.id AS version_id, v.version_no, v.status AS version_status,
       v.stem, v.options, v.marks, v.difficulty, v.cognitive_level
FROM questions q
LEFT JOIN LATERAL (
  -- live version if published, otherwise the newest version
  SELECT * FROM question_versions qv
  WHERE qv.question_id = q.id
  ORDER BY (qv.id = q.current_version_id) DESC, qv.version_no DESC
  LIMIT 1
) v ON true
WHERE q.deleted_at IS NULL;

CREATE VIEW note_current WITH (security_invoker = true) AS
SELECT n.organisation_id, n.id AS note_id, n.topic_id, n.title, n.status AS note_status,
       v.id AS version_id, v.version_no, v.status AS version_status,
       v.summary, v.reading_minutes
FROM notes n
LEFT JOIN LATERAL (
  SELECT * FROM note_versions nv
  WHERE nv.note_id = n.id
  ORDER BY (nv.id = n.current_version_id) DESC, nv.version_no DESC
  LIMIT 1
) v ON true
WHERE n.deleted_at IS NULL;

GRANT SELECT ON question_current, note_current TO authenticated;

INSERT INTO public.schema_migrations (version, description) VALUES ('004', 'question bank and notebank (rev 6)');

COMMIT;

-- =====================================================================
-- Notes
-- 1. Workflow: draft -> submit_*_version() -> in_review -> a different
--    user inserts a review -> approved -> publish_*_version() -> published.
--    "changes_requested" sends the version back to draft; "rejected"
--    archives it. Editing a published item means adding a new version.
-- 2. AI-generated content (migration 007) enters as source = 'ai' in
--    draft, so it goes through the same review gate as human work.
-- 3. If you work alone, a second reviewer is required by design. For a
--    solo organisation, add a second user (e.g. a trusted colleague) or
--    relax validate_*_review() for organisations of type 'individual'.
-- 4. Images and diagrams go in stem_media / media as references to
--    object storage (e.g. Supabase Storage or S3), not inline data.
-- 5. Shared library adoption (visibility = 'shared', source = 'adopted')
--    is added in a later migration.
-- =====================================================================
