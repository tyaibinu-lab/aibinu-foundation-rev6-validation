-- End-to-end exam flow, run as the app role with RLS on. Any exception fails the test.
\set ON_ERROR_STOP on
\set A '00000000-0000-0000-0000-00000000000a'
\set TEACHER '00000000-0000-0000-0000-0000000000a2'
\set TEACHER2 '00000000-0000-0000-0000-0000000000a6'
\set OWNER '00000000-0000-0000-0000-0000000000a1'
\set STUDENT '00000000-0000-0000-0000-0000000000a3'

-- fixtures (owner role)
INSERT INTO subjects (id, organisation_id, name) VALUES ('00000000-0000-0000-0000-000000000501', :'A', 'Mathematics');
INSERT INTO curricula (id, organisation_id, subject_id, name) VALUES ('00000000-0000-0000-0000-000000000502', :'A', '00000000-0000-0000-0000-000000000501', 'Maths');
INSERT INTO curriculum_versions (id, organisation_id, curriculum_id, version_label) VALUES ('00000000-0000-0000-0000-000000000503', :'A', '00000000-0000-0000-0000-000000000502', 'v1');
INSERT INTO curriculum_units (id, organisation_id, version_id, title) VALUES ('00000000-0000-0000-0000-000000000504', :'A', '00000000-0000-0000-0000-000000000503', 'Algebra');
INSERT INTO curriculum_topics (id, organisation_id, version_id, unit_id, code, title) VALUES ('00000000-0000-0000-0000-000000000505', :'A', '00000000-0000-0000-0000-000000000503', '00000000-0000-0000-0000-000000000504', 'ALG1', 'Linear equations');
INSERT INTO academic_sessions (id, organisation_id, name, term, starts_on, ends_on, is_current) VALUES ('00000000-0000-0000-0000-000000000506', :'A', '2026/27', 'first', '2026-09-01', '2026-12-20', true);
INSERT INTO classes (id, organisation_id, name, academic_session_id) VALUES ('00000000-0000-0000-0000-000000000507', :'A', 'JSS1', '00000000-0000-0000-0000-000000000506');
INSERT INTO students (id, organisation_id, user_id, full_name) VALUES ('00000000-0000-0000-0000-000000000508', :'A', :'STUDENT', 'Student A');
INSERT INTO enrolments (organisation_id, student_id, class_id, academic_session_id) VALUES (:'A', '00000000-0000-0000-0000-000000000508', '00000000-0000-0000-0000-000000000507', '00000000-0000-0000-0000-000000000506');


-- 1. teacher authors a question
BEGIN; SET LOCAL ROLE app_user; SELECT set_config('app.current_user', :'TEACHER', true), set_config('app.current_org', :'A', true);
INSERT INTO questions (organisation_id, topic_id, type, created_by) VALUES (:'A', '00000000-0000-0000-0000-000000000505', 'mcq', :'TEACHER') RETURNING id AS qid \gset
INSERT INTO question_versions (organisation_id, question_id, stem, options, answer_key, marks, created_by)
VALUES (:'A', :'qid', 'Solve x+2=5',
 '[{"key":"A","text":"2","is_correct":false},{"key":"B","text":"3","is_correct":true}]', '["B"]', 2, :'TEACHER') RETURNING id AS qvid \gset
SELECT submit_question_version((:'qvid')::uuid);
COMMIT;

-- 2. a second teacher reviews and approves; owner publishes
BEGIN; SET LOCAL ROLE app_user; SELECT set_config('app.current_user', :'TEACHER2', true), set_config('app.current_org', :'A', true);
INSERT INTO question_reviews (organisation_id, question_version_id, reviewer_id, decision) VALUES (:'A',(:'qvid')::uuid, :'TEACHER2','approved');
COMMIT;
BEGIN; SET LOCAL ROLE app_user; SELECT set_config('app.current_user', :'OWNER', true), set_config('app.current_org', :'A', true);
SELECT publish_question_version((:'qvid')::uuid);
COMMIT;

-- 3. teacher builds and publishes an exam
BEGIN; SET LOCAL ROLE app_user; SELECT set_config('app.current_user', :'TEACHER', true), set_config('app.current_org', :'A', true);
INSERT INTO exams (organisation_id, title, kind, subject_id, opens_at, closes_at, duration_min, release_policy, created_by)
VALUES (:'A', 'Week 1 test', 'test', '00000000-0000-0000-0000-000000000501', now() - interval '1 hour', now() + interval '1 day', 30, 'manual', :'TEACHER') RETURNING id AS exid \gset
INSERT INTO exam_questions (organisation_id, exam_id, question_version_id) VALUES (:'A',(:'exid')::uuid,(:'qvid')::uuid);
INSERT INTO exam_eligibility (organisation_id, exam_id, class_id, created_by) VALUES (:'A',(:'exid')::uuid,'00000000-0000-0000-0000-000000000507', :'TEACHER');
SELECT publish_exam((:'exid')::uuid);
COMMIT;

-- 4. student takes it
BEGIN; SET LOCAL ROLE app_user; SELECT set_config('app.current_user', :'STUDENT', true), set_config('app.current_org', :'A', true);
SELECT 'available: ' || count(*) FROM available_exams();
SELECT start_attempt((:'exid')::uuid) AS att \gset
SELECT get_attempt_paper(:'att'::uuid) AS paper \gset
SELECT 'paper has answer key leak: ' || (:'paper'::text LIKE '%is_correct%' OR :'paper'::text LIKE '%answer_key%');
SELECT (:'paper'::jsonb -> 'questions' -> 0 ->> 'exam_question_id') AS eqid \gset
SELECT 'save: ' || save_response(:'att'::uuid, :'eqid'::uuid, '{"selected":["B"]}');
SELECT 'submit: ' || submit_attempt(:'att'::uuid)::text;
COMMIT;

-- 5. teacher releases; student sees result
BEGIN; SET LOCAL ROLE app_user; SELECT set_config('app.current_user', :'TEACHER', true), set_config('app.current_org', :'A', true);
SELECT 'released: ' || release_results((:'exid')::uuid);
COMMIT;
BEGIN; SET LOCAL ROLE app_user; SELECT set_config('app.current_user', :'STUDENT', true), set_config('app.current_org', :'A', true);
SELECT 'my results: ' || count(*) || ' score=' || max(score) FROM exam_final_results;
COMMIT;
-- 6. direct status change must fail (expected: permission denied)
\set ON_ERROR_STOP off
BEGIN; SET LOCAL ROLE app_user; SELECT set_config('app.current_user', :'TEACHER', true), set_config('app.current_org', :'A', true);
UPDATE exams SET status='draft';
ROLLBACK;
