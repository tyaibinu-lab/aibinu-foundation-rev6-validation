# Local Windows PostgreSQL 18.6 setup plan for the Rev6 candidate SQL tests (read-only)

I only read repository files. I did not touch any database, secret, migration or deployment.

## 1. Files and order needed
All files are in `supabase/migrations/` unless noted. Filenames are copied exactly from the folder listing.

Baseline, required:
1. `001_identity_and_tenancy.sql` through `010_foreign_key_indexes.sql`, in numeric order. 001 creates the ledger. 002-010 each call `migration_begin('00N')`, which refuses to run out of order or twice.

Tool-managed, in timestamp order:
2. `20261008155427` through `20261009022835` (CBT fixes, AI governance M1-M6b). The guardian/class RPCs do not depend on these. They are only needed to match the live validation ledger (011-m1 to 011-m6b).
3. `20261011043814_49333c42-3943-4086-8fd5-7b65f96f643e.sql`: Step 2. It adds `add_student_guardian`, `set_primary_guardian`, `assign_student_class` and the lock helpers. Its preflight aborts if a target function already exists (42723) or if a dependency is missing (42704).

Candidate, not tool-managed:
4. `docs/migration-candidates/20261029010400_student_unlink_withdraw.sql`.

Minimum chain for the guardian/class tests: 001-010, then Step 2, then the candidate. Whether Step 2 actually needs anything from the 2026100x files is not verified. Its preflight dependency list needs to be read to confirm.

## 2. Supabase-specific prerequisites (plain PostgreSQL 18.6 has none of these)
- Roles: `anon`, `authenticated`, `service_role`. They are granted and revoked throughout, and 001 runs `REVOKE ... FROM service_role` unconditionally. The test also needs an owner-level session that can `SET LOCAL ROLE authenticated`.
- `auth` schema: an `auth.users` table (referenced around 001 lines 200, 684-782) and `auth.uid()` (lines 111, 367, 853). `auth.uid()` must read `request.jwt.claim.sub` / `request.jwt.claims`, as Supabase does.
- Request settings: `current_org_id()` reads `request.headers` → `x-organisation-id`, with `request.jwt.claims` → `app_metadata.organisation_id` as a fallback.
- `extensions` schema containing `citext` (001), `btree_gist` (20261008222032) and `pgcrypto`, or PostgreSQL's built-in `gen_random_uuid()`.
- Unverified: whether 001-010 also reference `auth.jwt()`, `storage`, `pgsodium`/vault or `supabase_*` roles beyond what the search found. The earlier search covered only `auth.uid/jwt/role/users` and the known extensions.
- Compatibility: these files were written for Supabase's PostgreSQL (15/17). Whether they run on 18.6 has not been tested.

## 3. Can a clean local database safely replay them?
- 001-010: designed for a fresh database (ledger + ordering guard + a single BEGIN/COMMIT each). This should work on a clean database once the auth/roles/extensions stand-ins exist. Not executed.
- Tool-managed files: **not a clean replay**.
  - `20261009010318_...` runs test inserts against hard-coded validation-project IDs (organisation, owner, job). Its error handler only catches its own rollback signal, so on a clean database a foreign-key failure would probably abort it. Not confirmed.
  - `20261009005746` / `20261009010347` create and drop a test table. `20261009003453` / `20261009003553` create and drop a self-test function.
  - `20261009021124` rewrites a live function by text substitution and raises `anchor not found` if the function text differs.
  - These files are a historical record, not a reproducible setup. Recommendation: skip them, or replay them only after a separate review of each file.
- Do not replay the Drizzle copies (`drizzle/migrations/*`) as well; 001 would collide with the ledger.

## 4. Minimum next read-only inspection before writing a reviewed setup script
1. Read Step 2's preflight block (lines ~75-90 of `20261011043814`) and list exactly which objects it requires.
2. Search all of 001-010 for every reference to the `auth.`, `storage.`, `extensions.`, `vault`, `pgsodium` and `supabase_` schemas and roles, and every `CREATE EXTENSION`. This gives the full list of stand-ins.
3. Read the `migration_begin` and ledger definitions in 001 to confirm that skipping the tool-managed files leaves the ledger consistent for Step 2. Step 2 writes no ledger row.
4. Check the schemas of the `students`, `student_parents`, `enrolments`, `classes`, `academic_sessions`, `memberships` and RBAC tables, to design the synthetic fixtures the test requires.
5. Check whether the PostgreSQL 18 release notes break anything these files use (for example, changed defaults for `ALTER DEFAULT PRIVILEGES`). This would be a web read only.

None of this is executed in plan mode. Writing the setup script would be a later step, with your approval.
