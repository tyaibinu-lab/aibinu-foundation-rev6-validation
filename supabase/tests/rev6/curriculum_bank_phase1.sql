-- Curriculum Bank phase 1 regression test. DISPOSABLE LOCAL POSTGRES ONLY. Synthetic data; rolls back.
\set ON_ERROR_STOP on
BEGIN;
INSERT INTO organisations(id,name,type,slug) VALUES
 ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa','School A','school','cb-school-a'),
 ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb','School B','school','cb-school-b');
INSERT INTO auth.users(id,email) VALUES
 ('10000000-0000-0000-0000-000000000001','author@example.test'),
 ('10000000-0000-0000-0000-000000000002','reviewer@example.test'),
 ('10000000-0000-0000-0000-000000000003','teacher@example.test'),
 ('10000000-0000-0000-0000-000000000004','otherorg@example.test');
INSERT INTO users(id,email,full_name,status) SELECT id,email,'T '||left(id::text,2),'active' FROM auth.users
ON CONFLICT (id) DO UPDATE SET status='active', deleted_at=NULL;
INSERT INTO organisation_memberships(organisation_id,user_id,role_id,status)
SELECT o, u, (SELECT id FROM roles WHERE code=r AND organisation_id IS NULL), 'active'
FROM (VALUES
 ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'::uuid,'10000000-0000-0000-0000-000000000001'::uuid,'org_admin'),
 ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa','10000000-0000-0000-0000-000000000002','reviewer'),
 ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa','10000000-0000-0000-0000-000000000003','teacher'),
 ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb','10000000-0000-0000-0000-000000000004','org_admin')) v(o,u,r);
INSERT INTO subjects(id,organisation_id,name) VALUES ('5a000000-0000-0000-0000-00000000000a','aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa','Physics');
INSERT INTO curricula(id,organisation_id,subject_id,name) VALUES ('c1000000-0000-0000-0000-00000000000a','aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa','5a000000-0000-0000-0000-00000000000a','C1');
INSERT INTO curriculum_versions(id,organisation_id,curriculum_id,version_label,status) VALUES
 ('d1000000-0000-0000-0000-00000000000a','aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa','c1000000-0000-0000-0000-00000000000a','v1','draft'),
 ('d2000000-0000-0000-0000-00000000000a','aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa','c1000000-0000-0000-0000-00000000000a','v2','draft');
INSERT INTO curriculum_units(id,organisation_id,version_id,title) VALUES ('e1000000-0000-0000-0000-00000000000a','aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa','d1000000-0000-0000-0000-00000000000a','U1');

CREATE FUNCTION pg_temp.as_user(u uuid, o uuid) RETURNS void LANGUAGE sql AS $$
  SELECT set_config('request.jwt.claims', json_build_object('sub',u,'role','authenticated','app_metadata',json_build_object('organisation_id',o))::text, true) $$;

DO $t$
DECLARE
  A constant uuid := 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'; B constant uuid := 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
  AUTHOR constant uuid := '10000000-0000-0000-0000-000000000001'; REV constant uuid := '10000000-0000-0000-0000-000000000002';
  TEACH constant uuid := '10000000-0000-0000-0000-000000000003'; OTHER constant uuid := '10000000-0000-0000-0000-000000000004';
  V1 constant uuid := 'd1000000-0000-0000-0000-00000000000a'; V2 constant uuid := 'd2000000-0000-0000-0000-00000000000a';
  ok boolean; st curriculum_review_state; n int; pub timestamptz;
BEGIN
  -- default: gate off -> publish works without review (backward compatible)
  PERFORM pg_temp.as_user(AUTHOR, A);
  pub := curriculum_publish_version(V2);
  ASSERT pub IS NOT NULL, 'publish without gate must work and stamp published_at';

  -- gate on
  INSERT INTO curriculum_governance_settings(organisation_id, require_review) VALUES (A, true);
  INSERT INTO curriculum_versions(id,organisation_id,curriculum_id,version_label,status) VALUES
   ('d3000000-0000-0000-0000-00000000000a',A,'c1000000-0000-0000-0000-00000000000a','v3','draft');

  -- direct write of review columns is blocked
  BEGIN UPDATE curriculum_versions SET review_state='approved' WHERE id=V1; ok:=false; EXCEPTION WHEN check_violation THEN ok:=true; END;
  ASSERT ok, 'direct review_state write must be rejected';
  -- direct publish blocked by gate
  BEGIN UPDATE curriculum_versions SET status='published' WHERE id=V1; ok:=false; EXCEPTION WHEN check_violation THEN ok:=true; END;
  ASSERT ok, 'direct publish without approval must be rejected';
  BEGIN PERFORM curriculum_publish_version(V1); ok:=false; EXCEPTION WHEN check_violation THEN ok:=true; END;
  ASSERT ok, 'publish function without approval must be rejected';

  -- teacher cannot submit/review/publish
  PERFORM pg_temp.as_user(TEACH, A);
  BEGIN PERFORM curriculum_publish_version(V1); ok:=false; EXCEPTION WHEN insufficient_privilege THEN ok:=true; END;
  ASSERT ok, 'teacher cannot publish';
  BEGIN PERFORM curriculum_review_version(V1,'approve'); ok:=false; EXCEPTION WHEN insufficient_privilege THEN ok:=true; END;
  ASSERT ok, 'teacher cannot review';

  -- other org cannot see/act on org A's version
  PERFORM pg_temp.as_user(OTHER, B);
  BEGIN PERFORM curriculum_submit_for_review(V1); ok:=false; EXCEPTION WHEN no_data_found THEN ok:=true; END;
  ASSERT ok, 'cross-tenant submit must fail';

  -- submit
  PERFORM pg_temp.as_user(AUTHOR, A);
  st := curriculum_submit_for_review(V1, 'ready');
  ASSERT st = 'in_review', 'submit moves to in_review';
  BEGIN PERFORM curriculum_submit_for_review(V1); ok:=false; EXCEPTION WHEN check_violation THEN ok:=true; END;
  ASSERT ok, 'double submit rejected';
  -- edits blocked while in review
  BEGIN UPDATE curriculum_units SET title='X' WHERE id='e1000000-0000-0000-0000-00000000000a'; ok:=false; EXCEPTION WHEN check_violation THEN ok:=true; END;
  ASSERT ok, 'content edit while in review rejected';
  -- separation of duties (author is admin with review permission)
  BEGIN PERFORM curriculum_review_version(V1,'approve'); ok:=false; EXCEPTION WHEN insufficient_privilege THEN ok:=true; END;
  ASSERT ok, 'submitter cannot approve own submission';

  -- reviewer: request changes needs note
  PERFORM pg_temp.as_user(REV, A);
  BEGIN PERFORM curriculum_review_version(V1,'request_changes'); ok:=false; EXCEPTION WHEN invalid_parameter_value THEN ok:=true; END;
  ASSERT ok, 'request_changes requires note';
  st := curriculum_review_version(V1,'request_changes','fix unit 1');
  ASSERT st = 'changes_requested';
  -- author fixes, resubmits, reviewer approves
  PERFORM pg_temp.as_user(AUTHOR, A);
  UPDATE curriculum_units SET title='U1 fixed' WHERE id='e1000000-0000-0000-0000-00000000000a';
  PERFORM curriculum_submit_for_review(V1);
  PERFORM pg_temp.as_user(REV, A);
  st := curriculum_review_version(V1,'approve');
  ASSERT st = 'approved';
  -- editing approved draft voids approval
  PERFORM pg_temp.as_user(AUTHOR, A);
  UPDATE curriculum_units SET title='U1 again' WHERE id='e1000000-0000-0000-0000-00000000000a';
  ASSERT (SELECT review_state FROM curriculum_versions WHERE id=V1) = 'not_submitted', 'edit voids approval';
  -- resubmit + approve + publish
  PERFORM curriculum_submit_for_review(V1);
  PERFORM pg_temp.as_user(REV, A);
  PERFORM curriculum_review_version(V1,'approve');
  -- reviewer lacks publish
  BEGIN PERFORM curriculum_publish_version(V1); ok:=false; EXCEPTION WHEN insufficient_privilege THEN ok:=true; END;
  ASSERT ok, 'reviewer cannot publish';
  PERFORM pg_temp.as_user(AUTHOR, A);
  UPDATE curriculum_versions SET status='archived' WHERE id=V2; -- one published version per curriculum
  pub := curriculum_publish_version(V1);
  ASSERT pub IS NOT NULL AND (SELECT status FROM curriculum_versions WHERE id=V1)='published';

  -- review log: 6 rows, append-only
  SELECT count(*) INTO n FROM curriculum_version_reviews WHERE version_id=V1;
  ASSERT n = 6, format('expected 6 review rows, got %s', n);
  BEGIN UPDATE curriculum_version_reviews SET note='x'; ok:=false; EXCEPTION WHEN check_violation THEN ok:=true; END;
  ASSERT ok, 'review log is append-only';
  BEGIN DELETE FROM curriculum_version_reviews; ok:=false; EXCEPTION WHEN check_violation THEN ok:=true; END;
  ASSERT ok, 'review log delete rejected';

  -- small-tenant waiver
  UPDATE curriculum_governance_settings SET allow_self_review=true WHERE organisation_id=A;
  PERFORM curriculum_submit_for_review('d3000000-0000-0000-0000-00000000000a');
  st := curriculum_review_version('d3000000-0000-0000-0000-00000000000a','approve');
  ASSERT st='approved', 'waiver allows self-review';

  -- audit rows exist
  ASSERT (SELECT count(*) FROM audit_events WHERE entity_type='curriculum_version_reviews' AND organisation_id=A) >= 6, 'review log audited';
  ASSERT (SELECT count(*) FROM audit_events WHERE entity_type='curriculum_governance_settings') >= 2, 'governance audited';

  -- permissions seeded
  ASSERT (SELECT count(*) FROM role_permissions rp JOIN roles r ON r.id=rp.role_id JOIN permissions p ON p.id=rp.permission_id
          WHERE p.code='curriculum.publish' AND r.code='reviewer')=0, 'reviewer has no publish';
  ASSERT (SELECT count(*) FROM role_permissions rp JOIN roles r ON r.id=rp.role_id JOIN permissions p ON p.id=rp.permission_id
          WHERE p.code='curriculum.review' AND r.code='reviewer')=1, 'reviewer has review';
  RAISE NOTICE 'curriculum_bank_phase1: ALL ASSERTIONS PASSED';
END $t$;
ROLLBACK;
