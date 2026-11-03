#!/usr/bin/env bash
# Replays every migration on a FRESH, DISPOSABLE local PostgreSQL (with Supabase role/auth stubs) and runs the rev6 SQL tests.
# Usage: PGHOST=<socket dir> PGPORT=<port> PGUSER=postgres PGDATABASE=<scratch db> supabase/tests/rev6/run-local.sh
# Never point this at a Supabase project. The stub file must create roles anon/authenticated/service_role and auth.users/auth.uid().
set -euo pipefail
cd "$(dirname "$0")/../../.."
: "${STUBS:?set STUBS to the Supabase stub SQL file}"
psql -X -q -v ON_ERROR_STOP=1 -f "$STUBS" >/dev/null
for f in $(ls supabase/migrations/*.sql | sort); do psql -X -q -v ON_ERROR_STOP=1 -f "$f" >/dev/null || { echo "MIGRATION FAILED: $f"; exit 1; }; done
echo "migrations: all applied"
psql -X -q -f supabase/tests/rev6/curriculum_integrity.sql
psql -X -q -v ON_ERROR_STOP=1 -f supabase/tests/rev6/curriculum_bank_phase1.sql
bash supabase/tests/rev6/curriculum_cycle_race.sh
