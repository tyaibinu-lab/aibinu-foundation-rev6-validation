# Rev6 Step 2 — Fixture Validation: Go/No-Go Review (read-only)

No changes were made. This review only assesses where the workflow stands and names the single next action.

## Facts (established earlier in this workflow)

- Target is staging `mdcmwhcjfpgewetsnunk` only; production `rsjwiaiyppiqrprfcqsr` is unreferenced and untouched.
- v5.3 atomic RPCs (`add_student_guardian`, `set_primary_guardian`, `assign_student_class`) plus lock helpers are applied and verified on staging.
- The app now calls these RPCs (no direct-write fallback), so the v5.3 rollback is no longer safe on its own.
- Fixture package is complete and review-only in Files: plan v1, manifest v1 (pre-generated UUIDs), preflight v1, setup v1, cleanup v1.
- Design decisions already made: two dedicated test orgs (`FX2 Test Org A/B`), six org-scoped `fx2_*` roles, six Auth identities `fx2-<role>-d4151c2c@example.invalid`, Auth users created only via Auth Admin (never SQL), data written by the trusted backend in one self-asserting transaction.
- The user has completed separate read-only checks covering schema dependencies, the three RPCs, role collisions, the six fixture profiles, unexpected fixture accounts, RLS policy inventory, and trigger inventory. These map to preflight items P1–P7 and open items O1, O3, O4, O5 — they are treated as done and will not be repeated.

## Unknowns (not established by any evidence seen so far)

1. **Preflight section A of `rev6-step2-fixture-preflight-v1.sql`** — the consolidated, self-asserting run that checks: correct project identity, permissions exist, manifest UUIDs/names/emails unused, Step 2 functions present. The user's separate checks cover the same ground piecemeal, but there is no record that section A itself was executed and passed as a single gate. This is the only missing preflight evidence.
2. **O2 — audit residue acceptance.** Setup will write append-only `audit_events` rows that cleanup can never remove. This needs an explicit accept/reject decision; it is a decision, not a check.
3. **O6 — test runner.** v5.2 functional tests and C1–C8 need `psql` with `SET LOCAL ROLE` from a trusted terminal; no such runner exists in this environment. This blocks the tests, not the fixture setup.
4. **O7 — `security_verify()` baseline.** Not readable by the read-only role; needs an authorized session before/after setup.

## Single next action that advances Step 2

**Run preflight section A once, as written, against staging (read-only), and record the pass/fail output.** That closes the last evidence gap without repeating any prior check. Everything after it (Auth user creation, setup script) is a write and requires separate approval.

## Go/No-Go recommendation

- **Fixture setup (Auth users + setup script): NO-GO today.** Two things are missing: (a) a recorded pass of preflight section A as a single gate, and (b) your explicit acceptance of O2 audit residue. Neither is assumed failed — both are simply unevidenced/undecided.
- **Preflight section A: GO** (read-only, no risk, directly advances Step 2).
- **v5.2 functional tests and C1–C8: NO-GO** until a psql two-session runner (O6) exists and fixture setup has actually been executed and verified with preflight section C.

## Proposed sequence (each step separately approved)

1. Run preflight section A read-only; record output.
2. You accept or reject O2 (audit residue).
3. On approval: create the six Auth users via Auth Admin; record UUIDs in the manifest; run preflight section B.
4. On approval: run the setup script (single transaction, self-asserting); run preflight section C; capture `security_verify()` baseline (O7).
5. Separately: arrange the psql runner (O6), then approve v5.2 + C1–C8 execution.
