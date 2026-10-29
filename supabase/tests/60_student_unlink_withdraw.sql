-- NOT EXECUTED. Disposable LOCAL database only; never validation/production.
-- See docs/student-unlink-withdraw-tests.md for fixtures/psql parameters.
\set ON_ERROR_STOP on
BEGIN;
SET LOCAL lock_timeout = '2s';
SET LOCAL statement_timeout = '15s';
DO $$ BEGIN
  IF left(current_database(), length('rev6_disposable_')) <> 'rev6_disposable_'
     OR (inet_server_addr() IS NOT NULL AND inet_server_addr() NOT IN ('127.0.0.1'::inet, '::1'::inet)) THEN
    RAISE EXCEPTION 'Requires explicitly isolated local rev6_disposable_* database';
  END IF;
END $$;
SELECT set_config('test.staff', :'staff', true), set_config('test.plain', :'plain', true),
       set_config('test.student_only', :'student_only', true), set_config('test.class_only', :'class_only', true),
       set_config('test.org', :'org_a', true), set_config('test.foreign_org', :'org_b', true),
       set_config('test.primary', :'primary_link', true), set_config('test.secondary', :'secondary_link', true),
       set_config('test.sole', :'sole_link', true), set_config('test.enrolment', :'enrolment', true),
       set_config('test.foreign_link', :'foreign_link', true), set_config('test.foreign_enrolment', :'foreign_enrolment', true);

-- Owner-context fixture checks only; business assertions below remain authenticated.
DO $$ BEGIN
  IF current_setting('test.foreign_org')::uuid = current_setting('test.org')::uuid THEN
    RAISE EXCEPTION 'Requires distinct Org A and Org B fixtures';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.student_parents
      WHERE id = current_setting('test.foreign_link')::uuid
        AND organisation_id = current_setting('test.foreign_org')::uuid) THEN
    RAISE EXCEPTION 'Requires an existing foreign guardian link belonging to Org B';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.enrolments
      WHERE id = current_setting('test.foreign_enrolment')::uuid
        AND organisation_id = current_setting('test.foreign_org')::uuid) THEN
    RAISE EXCEPTION 'Requires an existing foreign enrolment belonging to Org B';
  END IF;
END $$;

CREATE FUNCTION pg_temp.expect_error(stmt text, expected text) RETURNS void LANGUAGE plpgsql AS $$
DECLARE actual text;
BEGIN
  BEGIN
    EXECUTE stmt;
  EXCEPTION WHEN OTHERS THEN
    GET STACKED DIAGNOSTICS actual = RETURNED_SQLSTATE;
  END;
  IF actual IS DISTINCT FROM expected THEN
    RAISE EXCEPTION 'Expected SQLSTATE %, got %', expected, coalesce(actual, 'success');
  END IF;
END $$;

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', current_setting('test.staff'), true),
       set_config('request.jwt.claims', json_build_object('sub', current_setting('test.staff'), 'role', 'authenticated')::text, true),
       set_config('request.headers', json_build_object('x-organisation-id', current_setting('test.org'))::text, true);
DO $$ BEGIN
  IF public.current_org_id() IS DISTINCT FROM current_setting('test.org')::uuid
     OR NOT public.has_permission('student.manage') OR NOT public.has_permission('class.manage') THEN
    RAISE EXCEPTION 'Fixture staff/context invalid';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.student_parents a JOIN public.student_parents b
      ON a.student_id = b.student_id AND a.organisation_id = b.organisation_id
      WHERE a.id = current_setting('test.primary')::uuid AND a.is_primary
        AND b.id = current_setting('test.secondary')::uuid AND NOT b.is_primary) THEN
    RAISE EXCEPTION 'Requires primary and secondary links on same student';
  END IF;
  IF (SELECT count(*) FROM public.student_parents WHERE student_id =
      (SELECT student_id FROM public.student_parents WHERE id = current_setting('test.sole')::uuid)) <> 1 THEN
    RAISE EXCEPTION 'Requires a separate sole guardian link';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.enrolments WHERE id = current_setting('test.enrolment')::uuid
      AND status = 'active' AND enrolled_on <= CURRENT_DATE) THEN
    RAISE EXCEPTION 'Requires an active non-future enrolment';
  END IF;
END $$;
-- Explicit fixture scope; these are NOT whole-database/RLS-hidden-row proofs.
CREATE TEMP TABLE before_links ON COMMIT DROP AS SELECT * FROM public.student_parents
 WHERE id IN (current_setting('test.primary')::uuid, current_setting('test.secondary')::uuid, current_setting('test.sole')::uuid);
CREATE TEMP TABLE before_enrolments ON COMMIT DROP AS SELECT * FROM public.enrolments
 WHERE id = current_setting('test.enrolment')::uuid;
CREATE TEMP TABLE before_parents ON COMMIT DROP AS SELECT * FROM public.parents
 WHERE id IN (SELECT parent_id FROM before_links);
SAVEPOINT functional_state;

-- Permission-only and cross-tenant tests: no superuser business calls.
SELECT set_config('request.jwt.claim.sub', current_setting('test.plain'), true),
       set_config('request.jwt.claims', json_build_object('sub', current_setting('test.plain'), 'role', 'authenticated')::text, true);
SELECT pg_temp.expect_error('SELECT public.unlink_student_guardian(' || quote_literal(current_setting('test.primary')) || ')', '42501');
SELECT pg_temp.expect_error('SELECT public.withdraw_enrolment(' || quote_literal(current_setting('test.enrolment')) || ')', '42501');
SELECT set_config('request.jwt.claim.sub', current_setting('test.student_only'), true),
       set_config('request.jwt.claims', json_build_object('sub', current_setting('test.student_only'), 'role', 'authenticated')::text, true);
SELECT pg_temp.expect_error('SELECT public.withdraw_enrolment(' || quote_literal(current_setting('test.enrolment')) || ')', '42501');
SELECT set_config('request.jwt.claim.sub', current_setting('test.class_only'), true),
       set_config('request.jwt.claims', json_build_object('sub', current_setting('test.class_only'), 'role', 'authenticated')::text, true);
SELECT pg_temp.expect_error('SELECT public.unlink_student_guardian(' || quote_literal(current_setting('test.primary')) || ')', '42501');
SELECT set_config('request.jwt.claim.sub', current_setting('test.staff'), true),
       set_config('request.jwt.claims', json_build_object('sub', current_setting('test.staff'), 'role', 'authenticated')::text, true);
SELECT pg_temp.expect_error('SELECT public.unlink_student_guardian(' || quote_literal(current_setting('test.foreign_link')) || ')', 'P0002');
SELECT pg_temp.expect_error('SELECT public.withdraw_enrolment(' || quote_literal(current_setting('test.foreign_enrolment')) || ')', 'P0002');
SELECT set_config('request.headers', json_build_object('x-organisation-id', current_setting('test.foreign_org'))::text, true);
SELECT pg_temp.expect_error('SELECT public.unlink_student_guardian(' || quote_literal(current_setting('test.primary')) || ')', '42501');
SELECT pg_temp.expect_error('SELECT public.withdraw_enrolment(' || quote_literal(current_setting('test.enrolment')) || ')', '42501');
SELECT set_config('request.headers', json_build_object('x-organisation-id', current_setting('test.org'))::text, true);

-- Primary with another link must reject without changing either link.
SELECT pg_temp.expect_error('SELECT public.unlink_student_guardian(' || quote_literal(current_setting('test.primary')) || ')', '22023');
DO $$ BEGIN
  IF EXISTS ((SELECT * FROM public.student_parents WHERE id IN (SELECT id FROM before_links) EXCEPT SELECT * FROM before_links)
         UNION ALL (SELECT * FROM before_links EXCEPT SELECT * FROM public.student_parents WHERE id IN (SELECT id FROM before_links))) THEN
    RAISE EXCEPTION 'Rejected unlink changed links';
  END IF;
END $$;
-- Explicitly switch primary, then remove the former primary.
SELECT public.set_primary_guardian(
  (SELECT student_id FROM public.student_parents WHERE id = current_setting('test.primary')::uuid),
  current_setting('test.secondary')::uuid);
SELECT public.unlink_student_guardian(current_setting('test.primary')::uuid);
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM public.student_parents WHERE id = current_setting('test.primary')::uuid)
     OR NOT EXISTS (SELECT 1 FROM public.student_parents WHERE id = current_setting('test.secondary')::uuid AND is_primary) THEN
    RAISE EXCEPTION 'Explicit primary switch/unlink invariant failed';
  END IF;
END $$;
SELECT public.unlink_student_guardian(current_setting('test.sole')::uuid);
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM public.student_parents WHERE id = current_setting('test.sole')::uuid)
     OR EXISTS ((SELECT * FROM public.parents WHERE id IN (SELECT id FROM before_parents) EXCEPT SELECT * FROM before_parents)
             UNION ALL (SELECT * FROM before_parents EXCEPT SELECT * FROM public.parents WHERE id IN (SELECT id FROM before_parents))) THEN
    RAISE EXCEPTION 'Last unlink must remove link only and retain parents';
  END IF;
END $$;
SELECT public.withdraw_enrolment(current_setting('test.enrolment')::uuid);
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.enrolments WHERE id = current_setting('test.enrolment')::uuid
                 AND status = 'withdrawn' AND ended_on = CURRENT_DATE) THEN
    RAISE EXCEPTION 'Withdrawal must use server CURRENT_DATE';
  END IF;
END $$;
SELECT pg_temp.expect_error('SELECT public.withdraw_enrolment(' || quote_literal(current_setting('test.enrolment')) || ')', '22023');
ROLLBACK TO SAVEPOINT functional_state;
-- Successful mutations, trigger effects and error-side effects must roll back.
DO $$ BEGIN
  IF EXISTS ((SELECT * FROM public.student_parents WHERE id IN (SELECT id FROM before_links) EXCEPT SELECT * FROM before_links)
         UNION ALL (SELECT * FROM before_links EXCEPT SELECT * FROM public.student_parents WHERE id IN (SELECT id FROM before_links)))
     OR EXISTS ((SELECT * FROM public.enrolments WHERE id IN (SELECT id FROM before_enrolments) EXCEPT SELECT * FROM before_enrolments)
         UNION ALL (SELECT * FROM before_enrolments EXCEPT SELECT * FROM public.enrolments WHERE id IN (SELECT id FROM before_enrolments))) THEN
    RAISE EXCEPTION 'Rollback did not restore fixture state';
  END IF;
END $$;
-- Future start dates must reject rather than violate the date constraint.
UPDATE public.enrolments SET enrolled_on = CURRENT_DATE + 1
 WHERE id = current_setting('test.enrolment')::uuid;
SELECT pg_temp.expect_error('SELECT public.withdraw_enrolment(' || quote_literal(current_setting('test.enrolment')) || ')', '22023');
\echo 'PASS: functional assertions (disposable only); outer transaction rolling back'
ROLLBACK;