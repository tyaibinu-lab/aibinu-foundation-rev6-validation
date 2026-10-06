\set ON_ERROR_STOP on
\set A '00000000-0000-0000-0000-00000000000a'
\set OWNER '00000000-0000-0000-0000-0000000000a1'
\set TEACHER '00000000-0000-0000-0000-0000000000a2'
\set STUDENT '00000000-0000-0000-0000-0000000000a3'
INSERT INTO users (id,email,full_name,status,password_hash) VALUES ('00000000-0000-0000-0000-0000000000c1','newhead@c.test','New Head','active','x'), ('00000000-0000-0000-0000-0000000000c2','newteacher@c.test','New Teacher','active','x');
INSERT INTO students (id, organisation_id, user_id, full_name, email) VALUES ('00000000-0000-0000-0000-000000000508', :'A', :'STUDENT', 'Student A', 's@a.test');

-- signup: a user with no organisation creates one
BEGIN; SET LOCAL ROLE app_user; SELECT set_config('app.current_user','00000000-0000-0000-0000-0000000000c1',true), set_config('app.current_org','',true);
SELECT create_organisation('Crescent College','crescent-college','school'::org_type) AS org \gset
SELECT set_request_context('00000000-0000-0000-0000-0000000000c1', :'org'::uuid);
SELECT 'owner has permission: ' || has_permission('finance.manage');
SELECT invite_member('newteacher@c.test','teacher') AS tok \gset
COMMIT;
-- invitee accepts (no org context yet)
BEGIN; SET LOCAL ROLE app_user; SELECT set_config('app.current_user','00000000-0000-0000-0000-0000000000c2',true), set_config('app.current_org','',true);
SELECT 'accepted into right org: ' || (accept_invitation(:'tok') = :'org'::uuid);
COMMIT;
\set ON_ERROR_STOP off
\echo --- must fail:
BEGIN; SET LOCAL ROLE app_user; SELECT set_config('app.current_user','00000000-0000-0000-0000-0000000000c2',true), set_config('app.current_org','',true);
SELECT accept_invitation(:'tok');
ROLLBACK;
BEGIN; SET LOCAL ROLE app_user; SELECT set_config('app.current_user',:'TEACHER',true), set_config('app.current_org',:'A',true);
SELECT invite_member('x@y.test','teacher');
ROLLBACK;
BEGIN; SET LOCAL ROLE app_user; SELECT set_config('app.current_user',:'OWNER',true), set_config('app.current_org',:'A',true);
SELECT invite_member('x@y.test','platform_admin');
ROLLBACK;
\set ON_ERROR_STOP on
\echo --- anonymise
BEGIN; SET LOCAL ROLE app_user; SELECT set_config('app.current_user',:'OWNER',true), set_config('app.current_org',:'A',true);
SELECT anonymise_student('00000000-0000-0000-0000-000000000508');
SELECT 'after: ' || full_name || ' email=' || COALESCE(email,'null') FROM students WHERE id='00000000-0000-0000-0000-000000000508';
COMMIT;
SELECT 'migrations recorded: ' || count(*) FROM schema_migrations;
