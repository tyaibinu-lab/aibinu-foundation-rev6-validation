-- Test fixtures (run as the database owner). Fixed UUIDs so tests are readable.
INSERT INTO users (id,email,full_name,status,password_hash) VALUES
 ('00000000-0000-0000-0000-0000000000a1','owner@a.test','Owner A','active','x'),
 ('00000000-0000-0000-0000-0000000000a2','teacher@a.test','Teacher A','active','x'),
 ('00000000-0000-0000-0000-0000000000a3','student@a.test','Student A','active','x'),
 ('00000000-0000-0000-0000-0000000000a4','parent@a.test','Parent A','active','x'),
 ('00000000-0000-0000-0000-0000000000a5','bursar@a.test','Bursar A','active','x'),
 ('00000000-0000-0000-0000-0000000000a6','teacher2@a.test','Teacher A2','active','x'),
 ('00000000-0000-0000-0000-0000000000b1','owner@b.test','Owner B','active','x'),
 ('00000000-0000-0000-0000-0000000000b3','student@b.test','Student B','active','x'),
 ('00000000-0000-0000-0000-0000000000f1','suspended@a.test','Suspended A','suspended','x');
INSERT INTO organisations (id,name,type,slug) VALUES
 ('00000000-0000-0000-0000-00000000000a','School A','school','school-a'),
 ('00000000-0000-0000-0000-00000000000b','School B','school','school-b');
INSERT INTO organisation_memberships (organisation_id,user_id,role_id,status)
SELECT m.o, m.u, r.id, 'active'
FROM (VALUES
 ('00000000-0000-0000-0000-00000000000a'::uuid,'00000000-0000-0000-0000-0000000000a1'::uuid,'org_owner'),
 ('00000000-0000-0000-0000-00000000000a'::uuid,'00000000-0000-0000-0000-0000000000a2'::uuid,'teacher'),
 ('00000000-0000-0000-0000-00000000000a'::uuid,'00000000-0000-0000-0000-0000000000a6'::uuid,'teacher'),
 ('00000000-0000-0000-0000-00000000000a'::uuid,'00000000-0000-0000-0000-0000000000a3'::uuid,'student'),
 ('00000000-0000-0000-0000-00000000000a'::uuid,'00000000-0000-0000-0000-0000000000a4'::uuid,'parent'),
 ('00000000-0000-0000-0000-00000000000a'::uuid,'00000000-0000-0000-0000-0000000000a5'::uuid,'bursar'),
 ('00000000-0000-0000-0000-00000000000a'::uuid,'00000000-0000-0000-0000-0000000000f1'::uuid,'teacher'),
 ('00000000-0000-0000-0000-00000000000b'::uuid,'00000000-0000-0000-0000-0000000000b1'::uuid,'org_owner'),
 ('00000000-0000-0000-0000-00000000000b'::uuid,'00000000-0000-0000-0000-0000000000b3'::uuid,'student')
) AS m(o,u,code)
JOIN roles r ON r.code = m.code AND r.organisation_id IS NULL;
