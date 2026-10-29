# Unlink / withdrawal — unapplied candidate verification

Nothing in this document or its SQL companion has been executed. No live schema or function equivalence is asserted.

## Ordering and rollout gate

Candidate: `docs/migration-candidates/20261029010400_student_unlink_withdraw.sql`, after `20261011043814_49333c42-3943-4086-8fd5-7b65f96f643e.sql`. Tool-managed `supabase/migrations` is unchanged. A separately approved migration submission must use the candidate body; do not replay bootstrap 001 or create either ledger. The candidate's BEGIN/COMMIT defines intended transactional DDL, not proof of any runner behavior. No new application-ledger row is invented.

The API now requires these two RPCs. Until an approved application and verification, unlink/withdraw will fail on databases lacking them; no fallback is intentional. Revert the two API calls before removing the new RPCs. Do not remove or alter the existing helpers.

## Deliberate rules

- Primary unlink with other links: reject with 22023. Explicitly make another guardian primary first.
- Last link: permit unlink and retain the parent; zero links/primaries is allowed by the existing at-most-one index. No auto-promotion.
- Withdrawal: only active enrolments; server CURRENT_DATE; future enrolled_on rejects with 22023 so the existing date CHECK remains satisfied. Repeated/stale/transferred/completed requests reject and cannot overwrite history.
- Permissions: student.manage for unlink; class.manage for withdrawal. Both derive tenant from current_org_id and remain SECURITY INVOKER with RLS. Existing SECURITY DEFINER lock helpers are reused, not changed.
- Locks serialize participating RPCs only, under READ COMMITTED. Direct table writers, student soft-delete, membership/permission changes and stronger isolation need independent review; no broader permissions/trigger changes are included.

## Disposable functional script (not a fixture provisioner)

Use a fresh **local**, isolated Supabase-compatible PostgreSQL database named `rev6_disposable_*`. No validation/production URLs, passwords or data. Schema/auth emulation must be independently verified; do not use legacy `app_user` / `app.current_org` seeds, which do not represent Rev6 Auth. Preserve real RLS, grants, indexes and triggers. Load the reviewed baseline, Step 2 and candidate only after separate disposable-test authorization; do not automatically replay migration folders.

Provide committed, synthetic disposable fixtures through an independently reviewed setup:

| psql variable | Required fixture |
|---|---|
| staff | Active non-admin Org A member with student.manage + class.manage (and student.read for parent snapshot) |
| plain | Active Org A member with neither write permission |
| student_only | Active Org A member with student.manage only |
| class_only | Active Org A member with class.manage only |
| org_a / org_b | Separate active organisations; staff has NO membership/admin authority in B |
| primary_link / secondary_link | Same student in A, first primary, second non-primary |
| sole_link | A different student in A with exactly one link; run once primary and once non-primary |
| enrolment | Active A enrolment, started on/before today; same student as class transfer tests |
| foreign_link / foreign_enrolment | Existing B records inaccessible to every A actor |

An owner-capable **disposable** psql session must be able to SET LOCAL ROLE authenticated. Pass the UUID variables using `-v name=uuid`; use a private local service configuration for connection details, never put credentials in commands/logs/artifacts. Run `psql -X --set ON_ERROR_STOP=1 ... --file supabase/tests/60_student_unlink_withdraw.sql` only after authorization. It uses auth.uid JWT settings and request.headers, not application impersonation helpers. It verifies caller context and executes all business assertions as authenticated, not as owner.

The script asserts permission/tenant failures, explicit primary switch, primary rejection without changes, last unlink retaining parent, server date, stale/future withdrawal rejection, and savepoint restoration after successful writes. Outer ROLLBACK removes transaction effects. On any assertion error, close the session to ensure abort/rollback. Logs and committed disposable setup are not erased by rollback; destroy the entire disposable instance afterward. No staging audit deletion or weakening.

Additional disposable checks before accepting: validate exact helper bodies/ownership/EXECUTE and index definitions (presence guards do not prove definitions); assert PUBLIC/anon cannot call either new function; null/missing IDs; completed/transferred states; non-primary unlink with existing primary; archived/deleted student rejection; unaffected other sessions/students; injected DELETE/UPDATE trigger failure (within disposable savepoint) restores links/enrolment and transactional audit effects. SQL-level tests are **not run** in this source-only task.

## Two-session assign-versus-withdraw script protocol

Use two fresh direct psql sessions on the SAME disposable instance; READ COMMITTED; SET LOCAL ROLE authenticated and the same verified staff/JWT/header context as above. Use a second class in the SAME academic session. Never use a UAT student. Both sessions need explicit BEGIN, lock_timeout and statement_timeout; fixture setup must already be committed for cross-session visibility.

1. **Assign wins:** session A begins and calls assign_student_class(student, new_class), leaving transaction open. Session B begins and calls withdraw_enrolment(old_enrolment). Confirm B is waiting on A's transaction advisory lock using a third local diagnostic session (or pg_locks), not timing alone. Commit A promptly (before B's lock timeout). B must then reject with 22023; rollback B. Assert old row remains transferred and exactly one new active row exists, with correct student/session identity.
2. **Withdraw wins:** reset using fresh synthetic rows, not by rewriting history. A withdraws old_enrolment and holds transaction. B assigns new_class and blocks on the same lock. Commit A promptly. B succeeds and commits; assert old withdrawn row/server date unchanged and exactly one new active row exists. A withdrawal does not permanently prohibit subsequent enrolment.
3. **Holder rolls back:** repeat either ordering but ROLLBACK A; B must operate on restored committed state. Assert no partial transfer/withdrawal and no cross-student effects.
4. **Timeout:** hold A longer than helper's 5s acquisition limit. B must fail with 55P03, then rollback; holder state is unaffected. Release/rollback A immediately. Use bounded session watchdogs; lock_timeout does not bound holder duration.
5. **Guardian contention:** primary switch/add and unlink on same student must wait on guardian namespace; test both orders and assert primary unlink rejects only when it is still primary with others after the wait. Last-unlink racing add must observe the preceding committed link state. Direct writes are outside this guarantee.

Capture PASS/FAIL externally without credentials or student PII, terminate all sessions, destroy disposable instance. Committed concurrent-test audit rows disappear with instance destruction, not with rollback in another session. No concurrent SQL has been executed here.