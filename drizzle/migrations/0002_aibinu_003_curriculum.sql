-- =====================================================================
-- Aibinu FlexiPrep: Migration 003
-- Curriculum: curricula, versions, units, topics, learning outcomes,
-- prerequisites, assessment blueprints
-- Requires: 001_identity_and_tenancy.sql, 002_academic_management.sql
-- =====================================================================

BEGIN;
SELECT public.migration_begin('003', '002');   -- Revision 6 (M5)

-- ---------------------------------------------------------------------
-- 1. Enums
-- ---------------------------------------------------------------------
CREATE TYPE curriculum_status AS ENUM ('draft', 'published', 'archived');
CREATE TYPE cognitive_level   AS ENUM ('recall', 'understand', 'apply', 'analyse', 'evaluate');
CREATE TYPE difficulty_level  AS ENUM ('easy', 'medium', 'hard');
CREATE TYPE term_hint         AS ENUM ('first', 'second', 'third', 'any');

-- ---------------------------------------------------------------------
-- 2. New permissions
-- ---------------------------------------------------------------------
-- Revision 6 (C1/C5): permission seed removed; the catalogue and role mappings live in 001.

-- Revision 6 (C1/C5): permission seed removed; the catalogue and role mappings live in 001.

-- Revision 6 (C1/C5): permission seed removed; the catalogue and role mappings live in 001.

-- ---------------------------------------------------------------------
-- 3. Tables
-- ---------------------------------------------------------------------

-- A curriculum is a syllabus for one subject, e.g. "WAEC Physics".
CREATE TABLE curricula (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organisation_id uuid NOT NULL REFERENCES organisations(id) ON DELETE CASCADE,
  subject_id      uuid NOT NULL,
  name            text NOT NULL,
  exam_body       text NOT NULL DEFAULT 'School',   -- WAEC, NECO, UTME, GCE, School
  level           text,                              -- e.g. 'SS1-SS3'
  description     text,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  deleted_at      timestamptz,
  UNIQUE (id, organisation_id),
  UNIQUE (organisation_id, name),
  FOREIGN KEY (subject_id, organisation_id) REFERENCES subjects(id, organisation_id)
);

-- Syllabi get revised. Each revision is a version.
CREATE TABLE curriculum_versions (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organisation_id uuid NOT NULL REFERENCES organisations(id) ON DELETE CASCADE,
  curriculum_id   uuid NOT NULL,
  version_label   text NOT NULL,                     -- e.g. '2024 syllabus'
  effective_from  date,
  status          curriculum_status NOT NULL DEFAULT 'draft',
  published_at    timestamptz,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  UNIQUE (id, organisation_id),
  UNIQUE (curriculum_id, version_label),
  FOREIGN KEY (curriculum_id, organisation_id)
    REFERENCES curricula(id, organisation_id) ON DELETE CASCADE
);
-- Only one published (live) version per curriculum.
CREATE UNIQUE INDEX uq_one_published_version
  ON curriculum_versions(curriculum_id) WHERE status = 'published';

CREATE TABLE curriculum_units (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organisation_id uuid NOT NULL REFERENCES organisations(id) ON DELETE CASCADE,
  version_id      uuid NOT NULL,
  title           text NOT NULL,                     -- e.g. 'Mechanics'
  position        integer NOT NULL DEFAULT 0,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  UNIQUE (id, organisation_id),
  UNIQUE (id, version_id),
  FOREIGN KEY (version_id, organisation_id)
    REFERENCES curriculum_versions(id, organisation_id) ON DELETE CASCADE
);
CREATE INDEX idx_units_version ON curriculum_units(version_id, position);

-- Topics are the hub: questions, notes, mastery and diagnoses will all point here.
CREATE TABLE curriculum_topics (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organisation_id   uuid NOT NULL REFERENCES organisations(id) ON DELETE CASCADE,
  version_id        uuid NOT NULL,
  unit_id           uuid NOT NULL,
  code              text NOT NULL,                   -- e.g. 'PHY-SS1-MECH-03'
  title             text NOT NULL,                   -- e.g. 'Projectile motion'
  position          integer NOT NULL DEFAULT 0,
  class_level       text,                            -- 'SS1', 'SS2', 'SS3'
  term              term_hint NOT NULL DEFAULT 'any',
  suggested_periods integer CHECK (suggested_periods IS NULL OR suggested_periods > 0),
  exam_weight       numeric(5,2) CHECK (exam_weight IS NULL OR exam_weight BETWEEN 0 AND 100),
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now(),
  UNIQUE (id, organisation_id),
  UNIQUE (version_id, code),
  -- the unit must belong to the same version and organisation
  FOREIGN KEY (unit_id, version_id) REFERENCES curriculum_units(id, version_id) ON DELETE CASCADE,
  FOREIGN KEY (unit_id, organisation_id) REFERENCES curriculum_units(id, organisation_id)
);
CREATE INDEX idx_topics_unit  ON curriculum_topics(unit_id, position);
CREATE INDEX idx_topics_level ON curriculum_topics(organisation_id, class_level, term);

CREATE TABLE learning_outcomes (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organisation_id uuid NOT NULL REFERENCES organisations(id) ON DELETE CASCADE,
  code            text NOT NULL,
  statement       text NOT NULL,                     -- 'Students should be able to ...'
  cognitive_level cognitive_level NOT NULL DEFAULT 'understand',
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  UNIQUE (id, organisation_id),
  UNIQUE (organisation_id, code)
);

CREATE TABLE curriculum_outcomes (
  organisation_id uuid NOT NULL REFERENCES organisations(id) ON DELETE CASCADE,
  topic_id        uuid NOT NULL,
  outcome_id      uuid NOT NULL,
  PRIMARY KEY (topic_id, outcome_id),
  FOREIGN KEY (topic_id, organisation_id)   REFERENCES curriculum_topics(id, organisation_id) ON DELETE CASCADE,
  FOREIGN KEY (outcome_id, organisation_id) REFERENCES learning_outcomes(id, organisation_id) ON DELETE CASCADE
);

-- "To learn topic X you should already know topic Y."
-- This graph powers root-cause diagnosis in the CAS module.
CREATE TABLE curriculum_prerequisites (
  organisation_id   uuid NOT NULL REFERENCES organisations(id) ON DELETE CASCADE,
  topic_id          uuid NOT NULL,
  requires_topic_id uuid NOT NULL,
  strength          smallint NOT NULL DEFAULT 2 CHECK (strength BETWEEN 1 AND 3), -- 1 helpful, 3 essential
  PRIMARY KEY (topic_id, requires_topic_id),
  CHECK (topic_id <> requires_topic_id),
  FOREIGN KEY (topic_id, organisation_id)          REFERENCES curriculum_topics(id, organisation_id) ON DELETE CASCADE,
  FOREIGN KEY (requires_topic_id, organisation_id) REFERENCES curriculum_topics(id, organisation_id) ON DELETE CASCADE
);
CREATE INDEX idx_prereq_requires ON curriculum_prerequisites(requires_topic_id);

-- Reject prerequisite loops (A needs B, B needs C, C needs A).
CREATE OR REPLACE FUNCTION prevent_prerequisite_cycle() RETURNS trigger AS $$
BEGIN
  IF EXISTS (
    WITH RECURSIVE upstream(topic_id) AS (
      SELECT NEW.requires_topic_id
      UNION
      SELECT p.requires_topic_id
      FROM curriculum_prerequisites p
      JOIN upstream u ON p.topic_id = u.topic_id
    )
    SELECT 1 FROM upstream WHERE topic_id = NEW.topic_id
  ) THEN
    RAISE EXCEPTION 'Prerequisite cycle detected between topics % and %',
      NEW.topic_id, NEW.requires_topic_id;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_prerequisite_cycle
  BEFORE INSERT OR UPDATE ON curriculum_prerequisites
  FOR EACH ROW EXECUTE FUNCTION prevent_prerequisite_cycle();

-- Blueprint = the recipe for an exam: how many questions per topic,
-- at what difficulty and cognitive level.
CREATE TABLE assessment_blueprints (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organisation_id       uuid NOT NULL REFERENCES organisations(id) ON DELETE CASCADE,
  subject_id            uuid NOT NULL,
  curriculum_version_id uuid,
  name                  text NOT NULL,               -- e.g. 'SS2 Physics First Term Exam'
  description           text,
  total_marks           numeric(6,2) NOT NULL CHECK (total_marks > 0),
  duration_min          integer CHECK (duration_min IS NULL OR duration_min > 0),
  difficulty_mix        jsonb NOT NULL DEFAULT '{"easy":30,"medium":50,"hard":20}'::jsonb,
  status                curriculum_status NOT NULL DEFAULT 'draft',
  created_by            uuid REFERENCES users(id),
  created_at            timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz NOT NULL DEFAULT now(),
  deleted_at            timestamptz,
  UNIQUE (id, organisation_id),
  UNIQUE (organisation_id, name),
  FOREIGN KEY (subject_id, organisation_id) REFERENCES subjects(id, organisation_id),
  FOREIGN KEY (curriculum_version_id, organisation_id)
    REFERENCES curriculum_versions(id, organisation_id)
);

CREATE TABLE assessment_blueprint_items (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organisation_id    uuid NOT NULL REFERENCES organisations(id) ON DELETE CASCADE,
  blueprint_id       uuid NOT NULL,
  topic_id           uuid NOT NULL,
  question_count     integer NOT NULL CHECK (question_count > 0),
  marks_per_question numeric(5,2) NOT NULL DEFAULT 1 CHECK (marks_per_question > 0),
  difficulty         difficulty_level,               -- NULL = any
  cognitive_level    cognitive_level,                -- NULL = any
  position           integer NOT NULL DEFAULT 0,
  created_at         timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (blueprint_id, organisation_id)
    REFERENCES assessment_blueprints(id, organisation_id) ON DELETE CASCADE,
  FOREIGN KEY (topic_id, organisation_id)
    REFERENCES curriculum_topics(id, organisation_id)
);
CREATE INDEX idx_blueprint_items ON assessment_blueprint_items(blueprint_id, position);

-- updated_at triggers
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['curricula','curriculum_versions','curriculum_units',
                           'curriculum_topics','learning_outcomes','assessment_blueprints']
  LOOP
    EXECUTE format('CREATE TRIGGER trg_%s_updated BEFORE UPDATE ON %I
                    FOR EACH ROW EXECUTE FUNCTION set_updated_at()', t, t);
  END LOOP;
END $$;

-- ---------------------------------------------------------------------
-- 4. Grants
-- ---------------------------------------------------------------------
GRANT SELECT, INSERT, UPDATE, DELETE ON
  curricula, curriculum_versions, curriculum_units, curriculum_topics,
  learning_outcomes, curriculum_outcomes, curriculum_prerequisites,
  assessment_blueprints, assessment_blueprint_items
TO authenticated;

-- ---------------------------------------------------------------------
-- 5. Row-level security
-- ---------------------------------------------------------------------
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['curricula','curriculum_versions','curriculum_units',
                           'curriculum_topics','learning_outcomes','curriculum_outcomes',
                           'curriculum_prerequisites','assessment_blueprints',
                           'assessment_blueprint_items']
  LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
  END LOOP;
END $$;

-- Curriculum content: any active member can read (students see topics and outcomes);
-- curriculum.manage writes.
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['curricula','curriculum_versions','curriculum_units',
                           'curriculum_topics','learning_outcomes','curriculum_outcomes',
                           'curriculum_prerequisites']
  LOOP
    EXECUTE format(
      'CREATE POLICY %I ON %I FOR SELECT TO authenticated
         USING (organisation_id = (SELECT current_org_id()) AND (SELECT is_org_member()))',
      t || '_read', t);
    EXECUTE format(
      'CREATE POLICY %I ON %I FOR ALL TO authenticated
         USING (organisation_id = (SELECT current_org_id()) AND (SELECT has_permission(''curriculum.manage'')))
         WITH CHECK (organisation_id = (SELECT current_org_id()) AND (SELECT has_permission(''curriculum.manage'')))',
      t || '_write', t);
  END LOOP;
END $$;

-- Blueprints are staff-only: students and parents must not see how an exam is built.
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['assessment_blueprints','assessment_blueprint_items']
  LOOP
    EXECUTE format(
      'CREATE POLICY %I ON %I FOR SELECT TO authenticated
         USING (organisation_id = (SELECT current_org_id())
                AND ((SELECT has_permission(''blueprint.manage'')) OR (SELECT has_permission(''exam.create''))
                     OR (SELECT has_permission(''academic.questions.write''))))',
      t || '_read', t);
    EXECUTE format(
      'CREATE POLICY %I ON %I FOR ALL TO authenticated
         USING (organisation_id = (SELECT current_org_id()) AND (SELECT has_permission(''blueprint.manage'')))
         WITH CHECK (organisation_id = (SELECT current_org_id()) AND (SELECT has_permission(''blueprint.manage'')))',
      t || '_write', t);
  END LOOP;
END $$;

-- ---------------------------------------------------------------------
-- 6. Views and functions
-- ---------------------------------------------------------------------

-- Flat curriculum tree, ready for a topic picker in the UI.
-- Requires Postgres 15+ for security_invoker (see note in migration 002).
CREATE VIEW topic_tree WITH (security_invoker = true) AS
SELECT t.organisation_id,
       c.id            AS curriculum_id,
       c.name          AS curriculum_name,
       s.name          AS subject_name,
       v.id            AS version_id,
       v.version_label,
       v.status        AS version_status,
       u.id            AS unit_id,
       u.title         AS unit_title,
       u.position      AS unit_position,
       t.id            AS topic_id,
       t.code          AS topic_code,
       t.title         AS topic_title,
       t.position      AS topic_position,
       t.class_level,
       t.term
FROM curriculum_topics t
JOIN curriculum_units    u ON u.id = t.unit_id
JOIN curriculum_versions v ON v.id = t.version_id
JOIN curricula           c ON c.id = v.curriculum_id
JOIN subjects            s ON s.id = c.subject_id
WHERE c.deleted_at IS NULL;

-- Blueprint check: does the planned question total match total_marks?
CREATE VIEW blueprint_summary WITH (security_invoker = true) AS
SELECT b.id AS blueprint_id,
       b.organisation_id,
       b.name,
       b.total_marks,
       COALESCE(SUM(i.question_count), 0)                       AS planned_questions,
       COALESCE(SUM(i.question_count * i.marks_per_question), 0) AS planned_marks,
       COALESCE(SUM(i.question_count * i.marks_per_question), 0) = b.total_marks AS marks_match
FROM assessment_blueprints b
LEFT JOIN assessment_blueprint_items i ON i.blueprint_id = b.id
WHERE b.deleted_at IS NULL
GROUP BY b.id;

-- All upstream topics a student must know for a given topic, nearest first.
-- Runs with the caller's permissions, so RLS applies.
CREATE OR REPLACE FUNCTION topic_prerequisite_chain(p_topic_id uuid)
RETURNS TABLE (topic_id uuid, topic_title text, depth integer, strength smallint)
AS $$
  WITH RECURSIVE chain AS (
    SELECT p.requires_topic_id AS topic_id, 1 AS depth, p.strength
    FROM curriculum_prerequisites p
    WHERE p.topic_id = p_topic_id
    UNION
    SELECT p.requires_topic_id, c.depth + 1, p.strength
    FROM curriculum_prerequisites p
    JOIN chain c ON p.topic_id = c.topic_id
    WHERE c.depth < 10
  )
  SELECT ch.topic_id, t.title, MIN(ch.depth)::integer, MAX(ch.strength)::smallint
  FROM chain ch
  JOIN curriculum_topics t ON t.id = ch.topic_id
  GROUP BY ch.topic_id, t.title
  ORDER BY MIN(ch.depth), t.title;
$$ LANGUAGE sql STABLE;

GRANT SELECT ON topic_tree, blueprint_summary TO authenticated;
GRANT EXECUTE ON FUNCTION topic_prerequisite_chain(uuid) TO authenticated;

INSERT INTO public.schema_migrations (version, description) VALUES ('003', 'curriculum (rev 6)');

COMMIT;

-- =====================================================================
-- Notes
-- 1. Topics are tied to a curriculum version. When a syllabus changes,
--    create a new version and copy the topics you keep. If you later
--    need mastery history to survive a version change, add a stable
--    topic_key column that copies carry forward (decide before
--    migration 004, when questions start pointing at topics).
-- 2. Starter data: load one subject first (Physics SS1 First Term from
--    your teacher handbook), then use it to test question and note
--    links in the next migrations.
-- 3. exam_weight on topics is the share of a typical exam (0-100). It
--    can seed blueprints automatically later.
-- 4. Curricula here are private to each organisation. The shared content
--    library (Part C of the data model) will let you publish a master
--    curriculum that schools adopt by copy.
-- =====================================================================