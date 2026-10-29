# Review: prerequisites for supabase/tests/60_student_unlink_withdraw.sql (read-only)

No database was accessed, no files other than this note were changed, and no secrets were read.

## 1. Is the script designed to refuse non-disposable databases?
Yes. Lines 7-12 abort unless BOTH:
- the database name literally starts with `rev6_disposable_` (checked with `left(...)`, so underscores are not treated as wildcards), and
- the server address is local (`127.0.0.1`, `::1`, or a Unix socket, where the address is NULL).

Limits: the check depends on name and address only. A local database that is wrongly named `rev6_disposable_*`, or a tunnel/port-forward to a remote server on 127.0.0.1, would pass. It also runs inside `BEGIN ... ROLLBACK`, but committed fixtures and logs stay, so the whole instance should be destroyed afterward.

## 2. Required environment (from docs/student-unlink-withdraw-tests.md)
- A new, isolated local PostgreSQL database that works like Supabase, named `rev6_disposable_*`. No validation/production URLs, passwords or data.
- Supabase-style auth emulation, checked separately: `authenticated` role, `auth.uid()` reading `request.jwt.claim.sub` / `request.jwt.claims`, `request.headers` with `x-organisation-id`. Do not use the legacy `app_user` / `app.current_org` seeds.
- A disposable psql session with owner-level rights that can `SET LOCAL ROLE authenticated`.
- Run with `psql -X --set ON_ERROR_STOP=1 -v name=uuid ... --file supabase/tests/60_student_unlink_withdraw.sql`. Credentials go in a private local service config, not on the command line or in logs.

## 3. Required schema, in order (separately authorised; do not auto-replay folders)
1. The reviewed Rev6 baseline: `supabase/migrations/001`-`010` plus the tool-managed migrations through `20261011043814_49333c42-...sql` (Step 2: `add_student_guardian`, `set_primary_guardian`, `assign_student_class`, and the lock helpers `lock_student_for_guardian_op` / `lock_student_for_class_op`).
2. The candidate `docs/migration-candidates/20261029010400_student_unlink_withdraw.sql` (`unlink_student_guardian`, `withdraw_enrolment`).
- Keep real RLS, grants, indexes (including the at-most-one-primary index), triggers and the enrolment date CHECK.
- The script needs: `public.current_org_id()`, `public.has_permission(text)`, and the tables `student_parents`, `enrolments` and `parents`.

## 4. Required roles/permissions
Permissions `student.manage`, `class.manage`, `student.read` assigned through Rev6 RBAC, with active memberships.

## 5. Required committed synthetic fixtures (psql variables)
| Variable | Fixture |
|---|---|
| staff | Active non-admin Org A member with student.manage + class.manage (+ student.read) |
| plain | Org A member with neither write permission |
| student_only / class_only | Org A members with only one permission each |
| org_a / org_b | Two separate active orgs; staff has no rights in B |
| primary_link / secondary_link | Same Org A student; primary + non-primary |
| sole_link | A different Org A student with exactly one link (run once as primary and once as non-primary) |
| enrolment | Active Org A enrolment, enrolled_on on or before today |
| foreign_link / foreign_enrolment | Existing Org B records (checked before the role switch) |

The script checks these preconditions and stops early if any are missing. It does not create them; setup is a separately reviewed step. The two-session assign-vs-withdraw test is a separate manual procedure in the doc and needs a second class in the same academic session.

## Not verified
Whether the local auth emulation matches Supabase, and whether the live helper bodies match the source. No SQL has been run.

## Proposed next step (needs your approval)
None is executed here. Next would be a reviewed fixture-setup script for the local Windows database, for your approval.
