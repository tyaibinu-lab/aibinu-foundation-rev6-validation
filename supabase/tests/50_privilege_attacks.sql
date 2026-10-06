-- Attacks against the content / exam / finance tables (run after 10 and 20 so data exists).
\set ON_ERROR_STOP off
\pset tuples_only on
CREATE OR REPLACE FUNCTION pg_temp.attempt(label text, stmt text) RETURNS void AS $$
DECLARE n bigint;
BEGIN
  EXECUTE stmt; GET DIAGNOSTICS n = ROW_COUNT;
  IF n > 0 THEN RAISE NOTICE 'EXPLOIT WORKED (% rows): %', n, label; ELSE RAISE NOTICE 'blocked (0 rows): %', label; END IF;
EXCEPTION WHEN OTHERS THEN RAISE NOTICE 'blocked: % (%)', label, left(SQLERRM, 50);
END $$ LANGUAGE plpgsql;
BEGIN; SET LOCAL ROLE app_user;
SELECT set_config('app.current_user','00000000-0000-0000-0000-0000000000a2',true), set_config('app.current_org','00000000-0000-0000-0000-00000000000a',true);
SELECT pg_temp.attempt('teacher publishes own question by setting status', $$UPDATE questions SET status='published'$$);
SELECT pg_temp.attempt('teacher approves own version by setting status', $$UPDATE question_versions SET status='approved'$$);
SELECT pg_temp.attempt('teacher edits a published version in place', $$UPDATE question_versions SET stem='changed stem here'$$);
SELECT pg_temp.attempt('teacher inserts question credited to someone else', $$INSERT INTO questions (organisation_id,topic_id,type,created_by) SELECT organisation_id,topic_id,type,'00000000-0000-0000-0000-0000000000a6' FROM questions LIMIT 1$$);
SELECT pg_temp.attempt('teacher opens a published exam by editing status', $$UPDATE exams SET status='draft'$$);
SELECT pg_temp.attempt('teacher edits exam total_marks', $$UPDATE exams SET total_marks=100$$);
SELECT pg_temp.attempt('teacher forges an attempt score', $$UPDATE results SET score=100$$);
SELECT pg_temp.attempt('teacher edits an attempt', $$UPDATE attempts SET status='submitted'$$);
SELECT pg_temp.attempt('teacher writes mastery', $$UPDATE topic_mastery SET updated_at=now()$$);
SELECT pg_temp.attempt('teacher reads another tenant (count must be 0)', $$SELECT 1 FROM students WHERE organisation_id='00000000-0000-0000-0000-00000000000b'$$);
ROLLBACK;
BEGIN; SET LOCAL ROLE app_user;
SELECT set_config('app.current_user','00000000-0000-0000-0000-0000000000a5',true), set_config('app.current_org','00000000-0000-0000-0000-00000000000a',true);
SELECT pg_temp.attempt('bursar edits ledger', $$UPDATE tenant_ledger SET amount=1$$);
SELECT pg_temp.attempt('bursar deletes ledger', $$DELETE FROM tenant_ledger$$);
SELECT pg_temp.attempt('bursar marks invoice paid directly', $$UPDATE customer_invoices SET status='paid', balance=0$$);
SELECT pg_temp.attempt('bursar inserts a transaction', $$INSERT INTO customer_payment_transactions (organisation_id) VALUES ('00000000-0000-0000-0000-00000000000a')$$);
SELECT pg_temp.attempt('bursar resets discount used_count', $$UPDATE discounts SET used_count=0$$);
SELECT pg_temp.attempt('bursar edits audit log', $$UPDATE audit_events SET action='x'$$);
SELECT pg_temp.attempt('bursar deletes audit log', $$DELETE FROM audit_events$$);
ROLLBACK;
BEGIN; SET LOCAL ROLE app_user;
SELECT set_config('app.current_user','00000000-0000-0000-0000-0000000000a3',true), set_config('app.current_org','00000000-0000-0000-0000-00000000000a',true);
SELECT pg_temp.attempt('student reads exam answer keys', $$SELECT answer_key FROM question_versions$$);
SELECT pg_temp.attempt('student reads exam_questions', $$SELECT 1 FROM exam_questions$$);
SELECT pg_temp.attempt('student edits own results', $$UPDATE results SET score=100$$);
SELECT pg_temp.attempt('student reads other students results', $$SELECT 1 FROM results WHERE student_id <> current_student_id()$$);
ROLLBACK;
