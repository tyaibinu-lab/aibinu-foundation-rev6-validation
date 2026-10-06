-- AI queue: teacher requests -> worker claims & completes -> draft enters normal review; privilege checks.
\set ON_ERROR_STOP on
\set A '00000000-0000-0000-0000-00000000000a'
\set TEACHER '00000000-0000-0000-0000-0000000000a2'
\set STUDENT '00000000-0000-0000-0000-0000000000a3'
INSERT INTO subjects (id, organisation_id, name) VALUES ('00000000-0000-0000-0000-000000000501', :'A', 'Mathematics');
INSERT INTO curricula (id, organisation_id, subject_id, name) VALUES ('00000000-0000-0000-0000-000000000502', :'A', '00000000-0000-0000-0000-000000000501', 'Maths');
INSERT INTO curriculum_versions (id, organisation_id, curriculum_id, version_label) VALUES ('00000000-0000-0000-0000-000000000503', :'A', '00000000-0000-0000-0000-000000000502', 'v1');
INSERT INTO curriculum_units (id, organisation_id, version_id, title) VALUES ('00000000-0000-0000-0000-000000000504', :'A', '00000000-0000-0000-0000-000000000503', 'Algebra');
INSERT INTO curriculum_topics (id, organisation_id, version_id, unit_id, code, title) VALUES ('00000000-0000-0000-0000-000000000505', :'A', '00000000-0000-0000-0000-000000000503', '00000000-0000-0000-0000-000000000504', 'ALG1', 'Linear equations');

BEGIN; SET LOCAL ROLE app_user; SELECT set_config('app.current_user', :'TEACHER', true), set_config('app.current_org', :'A', true);
SELECT request_ai_questions('00000000-0000-0000-0000-000000000505', 2, 'mcq', 'medium', 'apply', NULL, 'k1') AS job \gset
SELECT 'same key returns same job: ' || (request_ai_questions('00000000-0000-0000-0000-000000000505', 2, 'mcq', 'medium', 'apply', NULL, 'k1') = :'job'::uuid);
COMMIT;

BEGIN; SET LOCAL ROLE ai_worker;
SELECT 'claimed type: ' || (claim_ai_job('w1') ->> 'type');
SELECT complete_ai_job(:'job'::uuid, '{"questions":[{"stem":"Solve 2x + 4 = 10 for x.","options":[{"key":"A","text":"2","is_correct":false},{"key":"B","text":"3","is_correct":true},{"key":"C","text":"4","is_correct":false}],"answer_key":["B"],"explanation":"2x=6"},{"stem":"bad","options":null}]}'::jsonb, '{"input_tokens":100,"output_tokens":50}'::jsonb);
COMMIT;
SELECT 'AI drafts: ' || count(*) || ' source=' || min(q.source) || ' created_by null=' || bool_and(q.created_by IS NULL) FROM questions q WHERE q.source = 'ai';

BEGIN; SET LOCAL ROLE app_user; SELECT set_config('app.current_user', :'TEACHER', true), set_config('app.current_org', :'A', true);
SELECT 'teacher sees job status: ' || status FROM ai_jobs WHERE id = :'job';
COMMIT;

\set ON_ERROR_STOP off
\echo --- must fail:
BEGIN; SET LOCAL ROLE app_user; SELECT set_config('app.current_user', :'STUDENT', true), set_config('app.current_org', :'A', true);
SELECT request_ai_questions('00000000-0000-0000-0000-000000000505');
ROLLBACK;
BEGIN; SET LOCAL ROLE app_user; SELECT set_config('app.current_user', :'TEACHER', true), set_config('app.current_org', :'A', true);
SELECT claim_ai_job('hacker');
ROLLBACK;
BEGIN; SET LOCAL ROLE app_user; SELECT set_config('app.current_user', :'TEACHER', true), set_config('app.current_org', :'A', true);
UPDATE ai_jobs SET status='succeeded';
ROLLBACK;
