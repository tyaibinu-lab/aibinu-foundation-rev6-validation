-- Rev6 curriculum integrity regression test (audit findings F-03, F-04, F-06).
-- DISPOSABLE LOCAL POSTGRES ONLY (needs the Supabase role/auth stubs). NEVER run against a Supabase project.
-- Synthetic data; whole script runs in one transaction and rolls back. Exit code != 0 on any failed assertion.
\set ON_ERROR_STOP on
BEGIN;
INSERT INTO organisations(id,name,type,slug) VALUES ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa','School A','school','it-school-a');
INSERT INTO subjects(id,organisation_id,name) VALUES ('5a000000-0000-0000-0000-00000000000a','aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa','Physics');
INSERT INTO curricula(id,organisation_id,subject_id,name) VALUES
 ('c1000000-0000-0000-0000-00000000000a','aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa','5a000000-0000-0000-0000-00000000000a','C1'),
 ('c2000000-0000-0000-0000-00000000000a','aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa','5a000000-0000-0000-0000-00000000000a','C2');
INSERT INTO curriculum_versions(id,organisation_id,curriculum_id,version_label,status) VALUES
 ('d1000000-0000-0000-0000-00000000000a','aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa','c1000000-0000-0000-0000-00000000000a','v1','draft'),
 ('d2000000-0000-0000-0000-00000000000a','aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa','c1000000-0000-0000-0000-00000000000a','v2','draft'),
 ('d3000000-0000-0000-0000-00000000000a','aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa','c2000000-0000-0000-0000-00000000000a','v1','draft');
INSERT INTO curriculum_units(id,organisation_id,version_id,title) VALUES
 ('e1000000-0000-0000-0000-00000000000a','aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa','d1000000-0000-0000-0000-00000000000a','U1'),
 ('e2000000-0000-0000-0000-00000000000a','aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa','d2000000-0000-0000-0000-00000000000a','U2'),
 ('e3000000-0000-0000-0000-00000000000a','aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa','d3000000-0000-0000-0000-00000000000a','U3');
INSERT INTO curriculum_topics(id,organisation_id,version_id,unit_id,code,title) VALUES
 ('f0000000-0000-0000-0000-0000000000a1','aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa','d1000000-0000-0000-0000-00000000000a','e1000000-0000-0000-0000-00000000000a','T1','a1'),
 ('f0000000-0000-0000-0000-0000000000a2','aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa','d1000000-0000-0000-0000-00000000000a','e1000000-0000-0000-0000-00000000000a','T2','a2'),
 ('f0000000-0000-0000-0000-0000000000a3','aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa','d1000000-0000-0000-0000-00000000000a','e1000000-0000-0000-0000-00000000000a','T3','a3'),
 ('f0000000-0000-0000-0000-0000000000b1','aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa','d2000000-0000-0000-0000-00000000000a','e2000000-0000-0000-0000-00000000000a','T1','b1'),
 ('f0000000-0000-0000-0000-0000000000c1','aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa','d3000000-0000-0000-0000-00000000000a','e3000000-0000-0000-0000-00000000000a','T1','c1');

DO $t$
DECLARE
  O constant uuid := 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
  A1 constant uuid := 'f0000000-0000-0000-0000-0000000000a1'; A2 constant uuid := 'f0000000-0000-0000-0000-0000000000a2';
  A3 constant uuid := 'f0000000-0000-0000-0000-0000000000a3'; B1 constant uuid := 'f0000000-0000-0000-0000-0000000000b1';
  C1 constant uuid := 'f0000000-0000-0000-0000-0000000000c1';
  V1 constant uuid := 'd1000000-0000-0000-0000-00000000000a'; V2 constant uuid := 'd2000000-0000-0000-0000-00000000000a';
  ok boolean; pub timestamptz;
BEGIN
  -- same-version rule
  BEGIN INSERT INTO curriculum_prerequisites(organisation_id,topic_id,requires_topic_id) VALUES (O,A1,B1); ok:=false; EXCEPTION WHEN check_violation THEN ok:=true; END;
  ASSERT ok, 'cross-version prerequisite must be rejected';
  BEGIN INSERT INTO curriculum_prerequisites(organisation_id,topic_id,requires_topic_id) VALUES (O,A2,C1); ok:=false; EXCEPTION WHEN check_violation THEN ok:=true; END;
  ASSERT ok, 'cross-curriculum prerequisite must be rejected';
  -- cycle rules
  INSERT INTO curriculum_prerequisites(organisation_id,topic_id,requires_topic_id) VALUES (O,A1,A2),(O,A2,A3);
  BEGIN INSERT INTO curriculum_prerequisites(organisation_id,topic_id,requires_topic_id) VALUES (O,A3,A1); ok:=false; EXCEPTION WHEN raise_exception THEN ok:=true; END;
  ASSERT ok, 'cycle A3->A1 must be rejected';
  -- published_at stamping and lifecycle
  UPDATE curriculum_versions SET status='published' WHERE id=V1;
  SELECT published_at INTO pub FROM curriculum_versions WHERE id=V1;
  ASSERT pub IS NOT NULL, 'published_at must be stamped on publish';
  BEGIN UPDATE curriculum_versions SET status='draft' WHERE id=V1; ok:=false; EXCEPTION WHEN check_violation THEN ok:=true; END;
  ASSERT ok, 'published version must not return to draft';
  BEGIN UPDATE curriculum_versions SET version_label='x' WHERE id=V1; ok:=false; EXCEPTION WHEN check_violation THEN ok:=true; END;
  ASSERT ok, 'published version label must be immutable';
  BEGIN DELETE FROM curriculum_versions WHERE id=V1; ok:=false; EXCEPTION WHEN check_violation THEN ok:=true; END;
  ASSERT ok, 'published version must not be deletable';
  -- content immutability on published version
  BEGIN UPDATE curriculum_topics SET title='edited' WHERE id=A1; ok:=false; EXCEPTION WHEN check_violation THEN ok:=true; END;
  ASSERT ok, 'topic in published version must be immutable';
  BEGIN INSERT INTO curriculum_topics(organisation_id,version_id,unit_id,code,title) VALUES (O,V1,'e1000000-0000-0000-0000-00000000000a','T9','new'); ok:=false; EXCEPTION WHEN check_violation THEN ok:=true; END;
  ASSERT ok, 'topic insert into published version must be rejected';
  BEGIN DELETE FROM curriculum_prerequisites WHERE topic_id=A1; ok:=false; EXCEPTION WHEN check_violation THEN ok:=true; END;
  ASSERT ok, 'prerequisite delete in published version must be rejected';
  -- draft versions stay editable; archiving allowed
  UPDATE curriculum_topics SET title='edited-draft' WHERE id=B1;
  UPDATE curriculum_versions SET status='archived' WHERE id=V1;
  BEGIN UPDATE curriculum_versions SET status='published' WHERE id=V1; ok:=false; EXCEPTION WHEN check_violation THEN ok:=true; END;
  ASSERT ok, 'archived version must not be reopened';
  -- audit coverage
  ASSERT (SELECT count(*) FROM audit_events WHERE entity_type='curriculum_versions' AND organisation_id=O) >= 3, 'curriculum_versions changes must be audited';
  ASSERT (SELECT count(*) FROM audit_events WHERE entity_type='curriculum_topics' AND organisation_id=O) >= 5, 'curriculum_topics changes must be audited';
  RAISE NOTICE 'curriculum_integrity: ALL ASSERTIONS PASSED';
END $t$;
ROLLBACK;
