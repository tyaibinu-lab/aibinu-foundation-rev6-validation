# Rev6 Validation — Isolated Tenant-Test Plan (no execution)

Scope: staging `mdcmwhcjfpgewetsnunk` only. Production `rsjwiaiyppiqrprfcqsr` excluded. Approving this plan approves nothing executable; each gate below needs its own explicit approval.

## 1. Proposed test identities

| Identity | Auth user | Intended membership | Purpose |
|---|---|---|---|
| `iso-a@aibinu.test` (new) | new, confirmed, no emails sent | Org A only, one active `org_admin` row | Org A actor |
| `iso-b@aibinu.test` (new) | new, confirmed | Org B only, one active `org_admin` row | Org B actor / adversary to A |
| `iso-none@aibinu.test` (new, optional) | new | no membership | Negative control (zero tenant data) |

- `org_admin` rather than `org_owner` so owner-protection logic and the existing ownership evidence aren't affected. Test owner-only paths separately, later.
- `rls-test-a` and `rls-test-b` stay as they are. Don't use `rls-test-b` as a cross-tenant adversary, because it legitimately belongs to both organisations.

## 2. Existing memberships to review (read-only, no changes)

- `rls-test-a`: Org A `org_admin` (active).
- `rls-test-b`: Org A `org_admin` + Org A `org_owner` + Org B `org_owner` (all active).
- Owners of record for Org A and Org B, and any owner-protection rows that refer to them.
- Audit rows for the past grants/ownership changes (`audit_events`). Snapshot them by count and id range only, with no PII.

## 3. Dependency checklist

- [ ] Supabase Auth: create users through Auth Admin only (Dashboard or the reviewed guarded script pattern). Never by SQL insert into `auth.users`.
- [ ] `public.users`: confirm that `handle_new_auth_user` creates the matching row with status `active`. A suspended or invited status would make `current_org_id()` reject the user.
- [ ] Roles: reuse the system `org_admin` role (organisation_id NULL). No new or edited roles or permissions.
- [ ] Memberships: one row per identity, inserted by an approved privileged runner. The insert writes an audit row, which is accepted as permanent evidence and must be approved explicitly.
- [ ] Test data: one dedicated fixture student per organisation (e.g. "ISO Fixture A", "ISO Fixture B"), clearly labelled, never UAT records. Optionally one fixture class each for write tests.
- [ ] Credentials: disposable passwords held by the tester out-of-band, never printed or committed.

## 4. Execution plan with gates

```text
G0 Approval of this plan
G1 Read-only preflight (approved read-only runner, not ambient tool)
   - confirm project ref, role = supabase_read_only_user
   - iso-* emails do not exist; Org A/B ids; org_admin role id
   - snapshot counts: memberships, audit_events, students per org
G2 Provision (separate approval): Auth Admin create iso-a, iso-b, iso-none
   -> verify public.users rows active
G3 Memberships + fixtures (separate approval, privileged runner)
   -> insert exactly 2 memberships + 2 fixture students
G4 Membership verification gate (read-only)
   - iso-a: exactly 1 active row, Org A; iso-b: exactly 1, Org B; iso-none: 0
   - rls-test-a/b memberships unchanged versus the G1 snapshot
   STOP if any mismatch
G5 Authenticated app-session RLS tests (browser, real sign-in)
G6 Evidence capture + classification
G7 Cleanup decision (separate approval)
```

## 5. Tests (G5), run through real signed-in app sessions

| # | Test | Method | Expected |
|---|---|---|---|
| T1 | Authorised read | iso-a opens /students | Sees Fixture A; never Fixture B |
| T2 | Mirror read | iso-b opens /students | Sees Fixture B only |
| T3 | Foreign record by id | iso-a opens /students/<FixtureB id> | Not found / empty; no data |
| T4 | Header tampering | iso-a session, REST call with `x-organisation-id` = Org B | `current_org_id()` null; 0 rows or error |
| T5 | Header absent | iso-a with no header | No tenant rows |
| T6 | Cross-tenant insert | iso-a inserts a student with Org B context | Rejected (RLS/permission error) |
| T7 | Cross-tenant update | iso-a updates the Fixture B name | 0 rows affected or error; row unchanged (verify as iso-b) |
| T8 | Cross-tenant RPC | iso-a calls `assign_student_class` / `add_student_guardian` on Fixture B | Rejected |
| T9 | No-membership control | iso-none signs in | "No organisation access" screen; REST returns 0 rows |
| T10 | Sign-out | iso-a signs out, then back navigation / refetch | Redirect to login; requests without a token return 0 rows |
| T11 | Cache isolation | iso-a signs out, iso-b signs in in the same tab | No Fixture A visible at any point; header = Org B |
| T12 | Header after switch | Inspect requests after T11 | `x-organisation-id` = Org B only |

Write tests (T6–T8) target fixtures only. If one unexpectedly succeeds, record it as FAIL and stop; don't continue.

## 6. Classification and evidence

- PASS: the expected outcome is observed, with request URL/status, a redacted response body (row count, error code) and a screenshot, all tied to the identity and a timestamp.
- FAIL: any foreign-tenant row returned, any cross-tenant mutation that persists, or stale cross-tenant UI. Attach the same evidence and halt further write tests.
- BLOCKED: the precondition gate failed (G4 mismatch, sign-in impossible, fixture missing) or the evidence is incomplete.
- Tokens, passwords and student PII are never captured. Use ids and counts only.

## 7. Preservation and cleanup (future approval)

- `rls-test-a`/`rls-test-b`, their memberships and existing audit rows stay untouched. G1 and G4 snapshots prove this.
- Audit rows created in G3 are permanent and append-only. Never delete them. Their existence must be accepted at G3 approval.
- Cleanup options for G7: set the iso memberships to `removed` and the fixture students to `withdrawn`/anonymised through the existing `anonymise_student` function, and disable or delete the iso Auth users through Auth Admin. Each option creates further audit rows. Leaving the fixtures in place, clearly labelled, is the option with the least residue.

## 8. Unresolved assumptions

- Whether `handle_new_auth_user` sets new users to `active` (needs a source or live check at G1).
- Whether an `org_admin` holds `student.read`/`student.manage` in staging role_permissions.
- Who the approved privileged runner for G2/G3 is (Dashboard SQL as owner vs the guarded server script).
- Whether audit residue from G3 is acceptable. It was previously rejected for Step 2 fixtures, so this needs a fresh decision.
- Whether a third identity (iso-none) is wanted.
- That Org B has no data links to Org A (shared curricula and similar) that could legitimately appear in reads.
