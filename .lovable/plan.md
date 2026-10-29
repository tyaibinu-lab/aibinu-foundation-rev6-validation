# Rev6 Student Management — Guardian & Class Write Integrity (inspection result + plan)

Read-only inspection on HEAD `e3a6812`. No files, database, migrations or deployments touched.

## Evidence: workflow trace

```text
UI  src/routes/students.$studentId.tsx
  L104  assign mutation   -> assignClass(orgId, studentId, cls)
  L166  add guardian      -> addGuardian(orgId, studentId, g)
  L167  make primary      -> setPrimaryGuardian(studentId, linkId)
API src/lib/students/api.ts
  L135  addGuardian        -> 1 call: rpc add_student_guardian (trimmed/blank-normalised, no org id)
  L150  setPrimaryGuardian -> 1 call: rpc set_primary_guardian
  L191  assignClass        -> 1 call: rpc assign_student_class (only class id sent)
DB  supabase/migrations/20261011043814_49333c42-...sql (Step 2 v5.3)
  3 business functions SECURITY INVOKER (RLS applies), each a single transaction
  L98/L130 SECURITY DEFINER lock helpers: pg_advisory_xact_lock per student
    'rev6_step2:class:<id>' and 'rev6_step2:guardian:<id>'
```

Finding: the three workflows are **no longer multi-step on the client**. The earlier sequences (insert parent -> clear primary -> insert link; close enrolment -> insert enrolment) now run inside one database function each, serialised per student by transaction-scoped advisory locks. Partial client-side failure is not possible in source.

## Remaining risks (verified in source unless marked)

1. **Live equivalence UNVERIFIED** — the migration header still says "STATIC CANDIDATE, NOT APPLIED", while the staging ledger previously listed `20261011043814`. Live function bodies on `mdcmwhcjfpgewetsnunk` have not been compared to source.
2. **Real concurrency UNVERIFIED** — tests are mocks; C1–C8 two-session tests never ran (fixtures blocked by audit-residue decision).
3. **Adjacent single-statement writes (not atomic-sensitive, but integrity gaps):**
   - `unlinkGuardian` (L155) direct delete: unlinking the primary leaves the student with no primary guardian; not under the guardian lock.
   - `withdrawEnrolment` (L195) direct update: not under the class lock, so it can interleave with `assign_student_class`; uses client date for `ended_on`.
4. **UI double-submit** — mutations do not appear disabled while pending (to confirm in file during implementation); the DB rejects duplicate class enrolment, but duplicate guardian adds would create two parents.

## Existing tests

`src/test/students-contract.test.ts` L106–136: six contract tests (one RPC each, normalised args, no org id, no direct writes, error propagation). Mocked client only — no PL/pgSQL, RLS or lock proof.

## Proposed minimal fix (each step needs separate approval)

1. **No change to the three refactored calls** — retain.
2. **Verification gate (read-only, approved runner as `supabase_read_only_user`)**: compare live `pg_get_functiondef` hashes of the 3 RPCs + 2 lock helpers to source; confirm grants and no duplicate overloads.
3. **UI guard (source-only)**: disable add/primary/assign/unlink/withdraw buttons while their mutation is pending.
4. **Optional, requires a new reviewed migration (not now)**: `unlink_student_guardian` and `withdraw_enrolment` RPCs taking the same advisory locks, server date, and primary-reassignment rule (decision needed: block unlinking the primary, or auto-promote). Then switch the two API functions to one RPC each.

## Test plan

- Contract (Vitest, mocked): button-disabled-while-pending; if step 4 approved, unlink/withdraw call exactly one RPC with no direct writes and propagate errors.
- Rollback-only single-session DB tests (T1–T20 design) in a disposable DB: one primary per student, no two active enrolments per session, permission denials, cross-tenant rejection.
- Concurrency C1–C8 in a disposable isolated PostgreSQL/Supabase, not shared staging: parallel add-primary, parallel assign, assign vs withdraw.
- Run `bunx vitest run` and typecheck after any source change.

## Out of scope
Production, deployment, migrations, fixtures/accounts, RLS/permission changes.
