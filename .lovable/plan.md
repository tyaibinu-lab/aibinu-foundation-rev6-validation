# Engineering Decision Record: Rev6 Validation Baseline and Step 2 Plan

Scope: recommendations only. No files, database, settings or production (rsjwiaiyppiqrprfcqsr) touched. Validation ref: mdcmwhcjfpgewetsnunk.
Legend: [O] seen in the repo, Files or project history. [A] assumption, needs checking.

## 1. Current baseline

What is built and working:
- [O] App: TanStack Start. One AuthProvider/TenantGate owns the session and the `x-organisation-id` header. Database rules (RLS) are the real protection.
- [O] NoteBank and Question Bank: review/publish workflow runs through the database. Live UAT done.
- [O] CBT (Gates 8C–8G-5): admin, student taking, results/release, manual marking, audit triggers. Live UAT done and signed off.
- [O] Student Management UI: directory, profile, class, guardians, roster, built on existing tables. Automated tests: 284/284. Live checklist was written but has NOT been run by a person.
- [O] AI governance M1–M6b is in the validation database (registries, prompt governance, credit ledger, credit lifecycle, kill switch, F1–F3, C4/C5). The global kill switch is OFF. There are 0 models, 0 credits and 0 ledger rows.

Design-only or database-only (no screens yet):
- [O] Step 2 atomic RPCs v5 plus tests v5.2. NOT applied. Database tests NOT RUN.
- [O] Finance, Curriculum/Syllabus, AICAS screens, diagnoses/interventions, parent reports. Tables exist, but there is no app code.
- [O] No AI worker or provider calls in `src/`.
- [A] Virtual Lab, Analytics, Communication and Offline: no schema or code seen in the Rev6 tables list.

Known open defects and gaps:
- [O] Monthly-expiry missed-run catch-up defect in frozen M5. This blocks real credit grants.
- [O] Running-cap claim race and true multi-session concurrency are untested. Deferred to M8.
- [O] Linter shows 102 findings. One is unexplained compared with the 97 baseline.
- [O] security_verify has one known finding: can_manage_exam(uuid).
- [O] The pre-M3 rollback copy of enqueue_ai_job could not be verified. The exact M6b self-test is lost.
- [O] `src/lib/students/api.ts` still makes several separate writes. Class assign, primary guardian change and add guardian can fail halfway.

## 2. D1 decision: where the lock helpers live

Recommendation: keep both helpers in `public` and lock down how they can be used. Do not move them to a new schema now.

Why:
- [O] The three business functions are SECURITY INVOKER, so their caller (`authenticated`) needs EXECUTE on the helpers. Moving the helpers to another schema would also need USAGE on that schema for `authenticated`. That only hides them from the Data API if the schema is not in the exposed list. It also adds a new schema, which needs approval. `private` is reserved for payment secrets, so it must not be used.
- [O] Calling a helper directly does no harm beyond the intended effect. Each helper re-checks `current_org_id()`, the student's tenant and the strict permission (class.manage / student.manage). The worst case is a permitted user taking a short transaction-level lock on their own org's student. That lock is released when the request transaction ends.

Required hardening:
1. Keep `SECURITY DEFINER SET search_path = pg_catalog, public, pg_temp`. Better, set it to `''` and fully qualify every reference (`public.students`, `pg_catalog.pg_advisory_xact_lock`).
2. Run `REVOKE ALL ... FROM PUBLIC, anon` and `GRANT EXECUTE ... TO authenticated` only, as already in v5.
3. Set the owner explicitly (`postgres`) and add an ACL check after migration.
4. Helpers return `void` and leak no data. Errors must not reveal whether a student exists in another org: use the same SQLSTATE for "not found" and "forbidden".
5. Business functions call helpers fully qualified (`PERFORM public.lock_student_for_*`). This is already in v5.
6. Optional later step (D1-b, needs approval): a non-exposed `app_internal` schema with USAGE + EXECUTE for `authenticated`. Do it only after checking that the schema is absent from the exposed-schemas setting.

## 3. Risks in the SQL and test artifacts

- `lock_timeout` 5s only limits how long a caller waits for the lock, not how long it is held. Document this, and consider `statement_timeout` on the RPCs.
- Advisory-lock keys can collide (hash). The effect is only extra waiting, and database constraints still protect correctness.
- The app keeps writing directly to tables, so the atomic guarantee only holds after the API switch.
- Tests rely on fixtures (UAT orgs, users, roles) that have not been confirmed.
- The pg_temp SECURITY DEFINER snapshot helper has not been tested on Supabase.
- The T20 search_path text match depends on the exact stored format.
- Missing preflight steps:
  - check that the function signatures are absent
  - security_verify baseline is 1 finding
  - linter baseline is 102
  - record checksums for the student and guardian tables' policies and grants
- Missing rollback steps:
  - DROPs in reverse order, in a verified script
  - a no-data-loss statement (functions only)
- Missing post-checks:
  - ACL and owner check
  - `prosecdef` and `proconfig` check
  - run tests v5.2
  - run C1–C8 with two real sessions
  - linter delta check

## 4. Ordered next steps (gates)

```text
S2-A  Approve D1 (public + hardening) and v5.3 cleanup          [approval]
S2-B  Preflight read-only on validation                          [approval]
S2-C  Apply Step 2 migration on validation only                  [approval]
S2-D  Run tests v5.2 + C1–C8 two-session concurrency            [approval: writes fixtures]
S2-E  Switch src/lib/students/api.ts to RPCs + contract tests   [approval: app change]
S2-F  Human live checklist + cross-org test, Student Mgmt 9/9    [human]
M7    Fix monthly-expiry catch-up (new migration, M5 stays frozen) [approval]
M8    Concurrency/race verification for AI claim + credits       [approval]
```

Acceptance criteria for each gate:
- security_verify stays at the 1 known finding.
- Linter shows no unexplained increase.
- 284/284 app tests pass, plus the new tests.
- Production is untouched.

## 5. Module roadmap reconciliation

1. Student Management Step 2 (S2-A–F), then the live validation sign-off.
2. AI M7 (expiry fix, prompt/model seeding policy) and M8 (concurrency). After that, a server-side AI worker with the kill switch kept OFF until approval.
3. Curriculum/Syllabus UI on the curriculum_* tables. NoteBank, Questions, AICAS and the Lab all depend on it.
4. Finance UI (invoices, payments, refunds) on the existing ledger RPCs. Webhooks go only through `/api/public` with signature checks.
5. AICAS teacher UI: diagnoses, interventions, mastery and parent reports. Every AI output stays a draft that staff must review.
6. Virtual Lab: needs its own schema proposal and a port of the reusable engine [A: source not in repo].
7. Analytics (read-only views), then Communication, then Offline.
8. Integrated AI Learning Intelligence: built on top of 3, 5 and 6 once M7/M8 and the worker are verified.

## Requires explicit approval

- Any DDL, fixture writes or test execution against the database.
- App API switch.
- New schema (D1-b).
- Seeding models or credits.
- Turning the kill switch on.
- Any production access (never, under this plan).
