-- =====================================================================
-- Aibinu FlexiPrep: Migration 002
-- Academic management: programmes, subjects, academic sessions, classes,
-- students, parents, teachers, enrolments
-- Requires: 001_identity_and_tenancy.sql
-- =====================================================================

BEGIN;
SELECT public.migration_begin('002', '001');   -- Revision 6 (M5)

-- ---------------------------------------------------------------------
-- 1. Enums
-- ---------------------------------------------------------------------
CREATE TYPE gender_type       AS ENUM ('female', 'male', 'other', 'undisclosed');
CREATE TYPE person_status     AS ENUM ('active', 'inactive', 'graduated', 'withdrawn');
CREATE TYPE enrolment_status  AS ENUM ('active', 'completed', 'withdrawn', 'transferred');

-- ---------------------------------------------------------------------
-- 2. New permissions (owner and administrator receive them below)
-- ---------------------------------------------------------------------
-- Revision 6 (C1/C5): permission seed removed; the catalogue and role mappings live in 001.

-- Revision 6 (C1/C5): permission seed removed; the catalogue and role mappings live in 001.

-- ---------------------------------------------------------------------
-- 3. Tables
-- Each tenant table has UNIQUE (id, organisation_id) so that child tables
-- can use composite foreign keys. This makes it impossible for a row in
-- one organisation to reference a row in another.
-- ---------------------------------------------------------------------

CREATE TABLE programmes (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organisation_id uuid NOT NULL REFERENCES organisations(id) ON DELETE CASCADE,
  name            text NOT NULL,              -- e.g. WAEC Prep, UTME, GCE, SS1-SS3 Regular
  code            text,
  level           text,                       -- e.g. 'Senior Secondary'
  is_active       boolean NOT NULL DEFAULT true,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  UNIQUE (id, organisation_id),
  UNIQUE (organisation_id, name)
);

CREATE TABLE subjects (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organisation_id uuid NOT NULL REFERENCES organisations(id) ON DELETE CASCADE,
  name            text NOT NULL,              -- e.g. Physics, Biology
  code            text,
  is_active       boolean NOT NULL DEFAULT true,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  UNIQUE (id, organisation_id),
  UNIQUE (organisation_id, name)
);

CREATE TABLE academic_sessions (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organisation_id uuid NOT NULL REFERENCES organisations(id) ON DELETE CASCADE,
  name            text NOT NULL,              -- e.g. 2026/2027
  term            text NOT NULL,              -- 'First Term', 'Second Term', 'Third Term'
  starts_on       date NOT NULL,
  ends_on         date NOT NULL,
  is_current      boolean NOT NULL DEFAULT false,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  UNIQUE (id, organisation_id),
  UNIQUE (organisation_id, name, term),
  CHECK (ends_on >= starts_on)
);
-- Only one current session/term per organisation.
CREATE UNIQUE INDEX uq_one_current_session
  ON academic_sessions(organisation_id) WHERE is_current;

CREATE TABLE teachers (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organisation_id uuid NOT NULL REFERENCES organisations(id) ON DELETE CASCADE,
  user_id         uuid REFERENCES users(id),  -- optional until the teacher has a login
  staff_no        text,
  full_name       text NOT NULL,
  phone           text,
  email           extensions.citext,
  status          person_status NOT NULL DEFAULT 'active',
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  deleted_at      timestamptz,
  UNIQUE (id, organisation_id),
  UNIQUE (organisation_id, staff_no),
  UNIQUE (organisation_id, user_id)
);

CREATE TABLE classes (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organisation_id     uuid NOT NULL REFERENCES organisations(id) ON DELETE CASCADE,
  name                text NOT NULL,          -- e.g. SS2 A
  programme_id        uuid,
  academic_session_id uuid NOT NULL,
  form_teacher_id     uuid,
  capacity            integer CHECK (capacity IS NULL OR capacity > 0),
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now(),
  UNIQUE (id, organisation_id),
  UNIQUE (organisation_id, academic_session_id, name),
  FOREIGN KEY (programme_id, organisation_id)
    REFERENCES programmes(id, organisation_id),
  FOREIGN KEY (academic_session_id, organisation_id)
    REFERENCES academic_sessions(id, organisation_id),
  FOREIGN KEY (form_teacher_id, organisation_id)
    REFERENCES teachers(id, organisation_id)
);

CREATE TABLE class_subjects (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organisation_id uuid NOT NULL REFERENCES organisations(id) ON DELETE CASCADE,
  class_id        uuid NOT NULL,
  subject_id      uuid NOT NULL,
  teacher_id      uuid,
  created_at      timestamptz NOT NULL DEFAULT now(),
  UNIQUE (class_id, subject_id),
  FOREIGN KEY (class_id, organisation_id)   REFERENCES classes(id, organisation_id) ON DELETE CASCADE,
  FOREIGN KEY (subject_id, organisation_id) REFERENCES subjects(id, organisation_id),
  FOREIGN KEY (teacher_id, organisation_id) REFERENCES teachers(id, organisation_id)
);

CREATE TABLE students (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organisation_id uuid NOT NULL REFERENCES organisations(id) ON DELETE CASCADE,
  user_id         uuid REFERENCES users(id),  -- optional until the student has a login
  admission_no    text,
  full_name       text NOT NULL,
  date_of_birth   date,
  gender          gender_type NOT NULL DEFAULT 'undisclosed',
  phone           text,
  email           extensions.citext,
  status          person_status NOT NULL DEFAULT 'active',
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  deleted_at      timestamptz,
  UNIQUE (id, organisation_id),
  UNIQUE (organisation_id, admission_no),
  UNIQUE (organisation_id, user_id)
);
CREATE INDEX idx_students_name ON students(organisation_id, full_name);

CREATE TABLE parents (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organisation_id uuid NOT NULL REFERENCES organisations(id) ON DELETE CASCADE,
  user_id         uuid REFERENCES users(id),
  full_name       text NOT NULL,
  phone           text,
  email           extensions.citext,
  whatsapp        text,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  deleted_at      timestamptz,
  UNIQUE (id, organisation_id),
  UNIQUE (organisation_id, user_id)
);

CREATE TABLE student_parents (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organisation_id uuid NOT NULL REFERENCES organisations(id) ON DELETE CASCADE,
  student_id      uuid NOT NULL,
  parent_id       uuid NOT NULL,
  relationship    text NOT NULL DEFAULT 'guardian',  -- mother, father, guardian, sponsor
  is_primary      boolean NOT NULL DEFAULT false,
  created_at      timestamptz NOT NULL DEFAULT now(),
  UNIQUE (student_id, parent_id),
  FOREIGN KEY (student_id, organisation_id) REFERENCES students(id, organisation_id) ON DELETE CASCADE,
  FOREIGN KEY (parent_id, organisation_id)  REFERENCES parents(id, organisation_id)  ON DELETE CASCADE
);
-- At most one primary contact per student.
CREATE UNIQUE INDEX uq_one_primary_parent
  ON student_parents(student_id) WHERE is_primary;

CREATE TABLE enrolments (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organisation_id     uuid NOT NULL REFERENCES organisations(id) ON DELETE CASCADE,
  student_id          uuid NOT NULL,
  class_id            uuid NOT NULL,
  academic_session_id uuid NOT NULL,
  status              enrolment_status NOT NULL DEFAULT 'active',
  enrolled_on         date NOT NULL DEFAULT CURRENT_DATE,
  ended_on            date,
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now(),
  UNIQUE (id, organisation_id),
  FOREIGN KEY (student_id, organisation_id)          REFERENCES students(id, organisation_id),
  FOREIGN KEY (class_id, organisation_id)            REFERENCES classes(id, organisation_id),
  FOREIGN KEY (academic_session_id, organisation_id) REFERENCES academic_sessions(id, organisation_id),
  CHECK (ended_on IS NULL OR ended_on >= enrolled_on)
);
-- A student can have only one active enrolment per academic session.
CREATE UNIQUE INDEX uq_one_active_enrolment
  ON enrolments(student_id, academic_session_id) WHERE status = 'active';
CREATE INDEX idx_enrolments_class ON enrolments(class_id) WHERE status = 'active';

-- updated_at triggers
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['programmes','subjects','academic_sessions','teachers',
                           'classes','students','parents','enrolments']
  LOOP
    EXECUTE format('CREATE TRIGGER trg_%s_updated BEFORE UPDATE ON %I
                    FOR EACH ROW EXECUTE FUNCTION set_updated_at()', t, t);
  END LOOP;
END $$;

-- ---------------------------------------------------------------------
-- 4. Helper functions for policies
-- ---------------------------------------------------------------------

-- True if the current user is an active member of the current organisation.
CREATE OR REPLACE FUNCTION is_org_member() RETURNS boolean AS $$
  SELECT EXISTS (
    SELECT 1
    FROM organisation_memberships m
    JOIN users u         ON u.id = m.user_id AND u.status = 'active' AND u.deleted_at IS NULL
    JOIN organisations o ON o.id = m.organisation_id AND o.status = 'active' AND o.deleted_at IS NULL
    WHERE m.user_id = current_user_id()
      AND m.organisation_id = current_org_id()
      AND m.status = 'active'
  );
$$ LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog, public, pg_temp;

-- True if the current user may see this student's records:
-- staff with student permissions, the student themselves, or a linked parent.
-- SECURITY DEFINER avoids recursive RLS checks between students and student_parents.
CREATE OR REPLACE FUNCTION can_view_student(p_student_id uuid) RETURNS boolean AS $$
  SELECT
    has_permission('student.read')
    OR has_permission('student.manage')
    OR (is_org_member() AND (
         EXISTS (SELECT 1 FROM students s
                 WHERE s.id = p_student_id
                   AND s.organisation_id = current_org_id()
                   AND s.user_id = current_user_id())
         OR EXISTS (SELECT 1
                    FROM student_parents sp
                    JOIN parents p ON p.id = sp.parent_id AND p.organisation_id = sp.organisation_id
                    WHERE sp.student_id = p_student_id
                      AND sp.organisation_id = current_org_id()
                      AND p.user_id = current_user_id())));
$$ LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog, public, pg_temp;

-- ---------------------------------------------------------------------
-- 5. Grants
-- ---------------------------------------------------------------------
GRANT SELECT, INSERT, UPDATE, DELETE ON
  programmes, subjects, academic_sessions, teachers, classes, class_subjects,
  students, parents, student_parents, enrolments
TO authenticated;

-- Revision 6: RLS helper predicates must be executable by the querying role (PUBLIC no longer is).
GRANT EXECUTE ON FUNCTION is_org_member(), can_view_student(uuid) TO authenticated;

-- ---------------------------------------------------------------------
-- 6. Row-level security
-- ---------------------------------------------------------------------
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['programmes','subjects','academic_sessions','teachers',
                           'classes','class_subjects','students','parents',
                           'student_parents','enrolments']
  LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
  END LOOP;
END $$;

-- Reference data (programmes, subjects, sessions, classes, class_subjects):
-- any active member can read; class.manage can write.
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['programmes','subjects','academic_sessions','classes','class_subjects']
  LOOP
    EXECUTE format(
      'CREATE POLICY %I ON %I FOR SELECT TO authenticated
         USING (organisation_id = (SELECT current_org_id()) AND (SELECT is_org_member()))',
      t || '_read', t);
    EXECUTE format(
      'CREATE POLICY %I ON %I FOR ALL TO authenticated
         USING (organisation_id = (SELECT current_org_id()) AND (SELECT has_permission(''class.manage'')))
         WITH CHECK (organisation_id = (SELECT current_org_id()) AND (SELECT has_permission(''class.manage'')))',
      t || '_write', t);
  END LOOP;
END $$;

-- Teachers: members can read the staff list; teacher.manage writes.
CREATE POLICY teachers_read ON teachers FOR SELECT TO authenticated
  USING (organisation_id = (SELECT current_org_id()) AND (SELECT is_org_member()));
CREATE POLICY teachers_write ON teachers FOR ALL TO authenticated
  USING (organisation_id = (SELECT current_org_id()) AND (SELECT has_permission('teacher.manage')))
  WITH CHECK (organisation_id = (SELECT current_org_id()) AND (SELECT has_permission('teacher.manage')));

-- Students: staff see all; a student sees themself; a parent sees their children.
CREATE POLICY students_read ON students FOR SELECT TO authenticated
  USING (organisation_id = (SELECT current_org_id()) AND can_view_student(id));
CREATE POLICY students_write ON students FOR ALL TO authenticated
  USING (organisation_id = (SELECT current_org_id()) AND (SELECT has_permission('student.manage')))
  WITH CHECK (organisation_id = (SELECT current_org_id()) AND (SELECT has_permission('student.manage')));

-- Parents: staff with student.read see all; a parent sees their own row.
CREATE POLICY parents_read ON parents FOR SELECT TO authenticated
  USING (organisation_id = (SELECT current_org_id())
         AND ((SELECT has_permission('student.read')) OR (SELECT has_permission('parent.manage'))
              OR user_id = (SELECT current_user_id())));
CREATE POLICY parents_write ON parents FOR ALL TO authenticated
  USING (organisation_id = (SELECT current_org_id()) AND (SELECT has_permission('parent.manage')))
  WITH CHECK (organisation_id = (SELECT current_org_id()) AND (SELECT has_permission('parent.manage')));

-- Links and enrolments follow the student's visibility.
CREATE POLICY student_parents_read ON student_parents FOR SELECT TO authenticated
  USING (organisation_id = (SELECT current_org_id()) AND can_view_student(student_id));
CREATE POLICY student_parents_write ON student_parents FOR ALL TO authenticated
  USING (organisation_id = (SELECT current_org_id()) AND (SELECT has_permission('student.manage')))
  WITH CHECK (organisation_id = (SELECT current_org_id()) AND (SELECT has_permission('student.manage')));

CREATE POLICY enrolments_read ON enrolments FOR SELECT TO authenticated
  USING (organisation_id = (SELECT current_org_id()) AND can_view_student(student_id));
CREATE POLICY enrolments_write ON enrolments FOR ALL TO authenticated
  USING (organisation_id = (SELECT current_org_id()) AND (SELECT has_permission('class.manage')))
  WITH CHECK (organisation_id = (SELECT current_org_id()) AND (SELECT has_permission('class.manage')));

-- ---------------------------------------------------------------------
-- 7. Convenience view: current class roster
-- security_invoker makes the view obey the caller's RLS (Postgres 15+).
-- On Postgres 14, drop "WITH (security_invoker = true)" and query the
-- base tables instead.
-- ---------------------------------------------------------------------
CREATE VIEW class_roster WITH (security_invoker = true) AS
SELECT e.organisation_id,
       e.class_id,
       c.name         AS class_name,
       s.id           AS student_id,
       s.admission_no,
       s.full_name,
       e.academic_session_id
FROM enrolments e
JOIN classes  c ON c.id = e.class_id
JOIN students s ON s.id = e.student_id
WHERE e.status = 'active' AND s.deleted_at IS NULL;

GRANT SELECT ON class_roster TO authenticated;

INSERT INTO public.schema_migrations (version, description) VALUES ('002', 'academic management (rev 6)');

COMMIT;

-- =====================================================================
-- Notes
-- 1. Composite foreign keys (child_id, organisation_id) guarantee that a
--    class can only point to a programme in the same organisation, and so on.
-- 2. When you add a student, the API creates the students row first, then
--    optionally links parents through student_parents, then enrols them.
-- 3. Bulk import (CSV of students) should run in one transaction and go
--    through the same policies, so a bad import cannot cross tenants.
-- 4. Teachers currently see all students in the organisation via
--    student.read. If you later want teachers limited to their own classes,
--    add a can_teach_student() helper and swap it into can_view_student().
-- =====================================================================