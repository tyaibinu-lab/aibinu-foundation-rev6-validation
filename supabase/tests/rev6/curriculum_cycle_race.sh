#!/usr/bin/env bash
# Concurrency test for F-03: X->Y and Y->X committed concurrently must not both succeed.
# DISPOSABLE LOCAL POSTGRES ONLY. Uses PG* env vars. Cleans up its own synthetic rows.
set -u
O=aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaa0001; S=5a000000-0000-0000-0000-0000000000a1
psql -X -q -v ON_ERROR_STOP=1 <<SQL
INSERT INTO organisations(id,name,type,slug) VALUES ('$O','Race Org','school','race-org');
INSERT INTO subjects(id,organisation_id,name) VALUES ('$S','$O','Physics');
INSERT INTO curricula(id,organisation_id,subject_id,name) VALUES ('c1000000-0000-0000-0000-0000000000a1','$O','$S','R');
INSERT INTO curriculum_versions(id,organisation_id,curriculum_id,version_label) VALUES ('d1000000-0000-0000-0000-0000000000a1','$O','c1000000-0000-0000-0000-0000000000a1','v1');
INSERT INTO curriculum_units(id,organisation_id,version_id,title) VALUES ('e1000000-0000-0000-0000-0000000000a1','$O','d1000000-0000-0000-0000-0000000000a1','U');
INSERT INTO curriculum_topics(id,organisation_id,version_id,unit_id,code,title) VALUES
 ('f0000000-0000-0000-0000-0000000000f1','$O','d1000000-0000-0000-0000-0000000000a1','e1000000-0000-0000-0000-0000000000a1','X','X'),
 ('f0000000-0000-0000-0000-0000000000f2','$O','d1000000-0000-0000-0000-0000000000a1','e1000000-0000-0000-0000-0000000000a1','Y','Y');
SQL
X=f0000000-0000-0000-0000-0000000000f1; Y=f0000000-0000-0000-0000-0000000000f2
psql -X -qAt -c "BEGIN; INSERT INTO curriculum_prerequisites(organisation_id,topic_id,requires_topic_id) VALUES ('$O','$X','$Y'); SELECT pg_sleep(2); COMMIT;" >/dev/null 2>&1 &
sleep 0.7
psql -X -qAt -c "INSERT INTO curriculum_prerequisites(organisation_id,topic_id,requires_topic_id) VALUES ('$O','$Y','$X');" >/dev/null 2>&1
wait
N=$(psql -X -qAt -c "SELECT count(*) FROM curriculum_prerequisites WHERE organisation_id='$O'")
# cleanup (drafts only; cascades)
psql -X -q -c "DELETE FROM curriculum_prerequisites WHERE organisation_id='$O'; DELETE FROM curriculum_topics WHERE organisation_id='$O'; DELETE FROM curriculum_units WHERE organisation_id='$O'; DELETE FROM curriculum_versions WHERE organisation_id='$O'; DELETE FROM curricula WHERE organisation_id='$O'; DELETE FROM subjects WHERE organisation_id='$O'; DELETE FROM organisations WHERE id='$O';" >/dev/null 2>&1
if [ "$N" = "1" ]; then echo "PASS: exactly one of the concurrent edges committed"; else echo "FAIL: $N edges committed (cycle)"; exit 1; fi
