# Gate 11C / M4 — Read-only Preflight & Scope Report

READ-ONLY. No DDL, DML, migrations, fixtures, app code or settings changed. Validation `mdcmwhcjfpgewetsnunk` only; production `rsjwiaiyppiqrprfcqsr` not touched.

## 1. Approved M4 scope (Gate 10 v1.1 §10, §2.8, §4)
| Stage | Content | Depends on |
|---|---|---|
| **M4** | `ai_credit_transactions` table + append-only triggers + balance view `ai_credit_balance` (security_invoker) | M2 |
| M5 | credit functions (estimate/reserve/settle/release/refund/adjust/monthly_grant), internal grants only | M4 |
| M6 | request-path integration (enqueue/claim/complete/fail/cancel/maintenance/approve/kill-switch, F1–F3, C4/C5) + deferred governed-job rule | M3, M5 |
| M7 | worker-only grants/revokes | M6 |
| M8 | RLS review + verification test pack | all |

The M4 contents come from the design:
- **Table** (§2.8):
  - columns: id identity, organisation_id, kind `ai_credit_kind`, amount > 0, job_id, user_id, actor_id, actor_type `audit_actor_type`, reason_code (regex), note ≤ 500, period_month, external_ref, created_at
  - checks: kind/job_id pairing; adjust needs actor_id
- **Unique indexes:**
  - `uq_credit_job_kind` on (job_id, kind) for reserve/settle/release/refund
  - `uq_credit_grant_period` for monthly grant/expire
  - (organisation_id, external_ref) where kind = 'adjust' (§9)
- **Other indexes** (§9): (organisation_id, created_at), (organisation_id, kind), (user_id, created_at), plus a job_id foreign-key index
- **Append-only:** block UPDATE, DELETE and TRUNCATE for every role, including service_role
- **Access** (§4):
  - anon: nothing
  - authenticated: SELECT only, filtered by RLS `organisation_id = current_org_id() AND (has_permission('ai.manage') OR user_id = current_user_id())`
  - service_role: INSERT and SELECT only; no UPDATE or DELETE grant
  - no write policies for any client role
- **Balance view:** `ai_credit_balance` with security_invoker, so it inherits the ledger's RLS; available/consumed/held formulas from §2.8

**Not part of M4:**
- any credit function, reserve or settle logic, or enforcement (M5/M6)
- the governed-job rule (M6)
- model seeding or benchmarking, credit grant values (M2 finding, commercial decision)
- worker, provider or UI
- `ai_user_allocations` (Phase 2)

## 2. Live validation state (read-only, verified)
- **schema_migrations:** 001–010, 011-m1, 011-m2, 011-m3. No M4 objects exist: no `ai_credit_transactions`, no `ai_credit_balance`, no `ai_credit_*` functions.
- **Enums:**
  - `ai_credit_kind` = grant, reserve, settle, release, refund, adjust, expire (from M1)
  - `audit_actor_type` = user, service_role, webhook, worker, system
- **Row counts:** templates 5, jobs 3, ai_content 0, ai_usage_daily 1, models 0, agents 5, plans 1, org_plans 2
- **Agents:** lesson_note, question_bank and performance_analytics are enabled; marking_assistant and student_tutor are disabled. No agent has a default model.
- **Plan `validation_default`:** monthly grant 0, daily limit 100, allowed models none. Assigned to Org A and Org B with no end date.
- **ai_jobs:**
  - 38 columns
  - one policy, `ai_jobs_read`
  - client grants: authenticated SELECT only
  - `uq_ai_job_idem` excludes failed, cancelled, expired and rejected
- **Jobs:**
  - `2daf3b9a…` — historical, succeeded, gate6 key, M3 fields all empty
  - `1f52f5d9-7f4c-4f9b-9347-47ddf45efffe` — M3 live test, cancelled, generate_note, key `m3-live-1791506190929`, Org A
  - `90422cf5-54d0-44c3-a2de-1f4969c1356f` — M3 live test, cancelled, same key (retry after cancel), Org A

  Both test jobs were left untouched.
- **Existing append-only functions:**
  - `block_ledger_changes()` has no fixed search_path and its error message names `tenant_ledger`.
  - `block_audit_changes()` is specific to `audit_events`.
  - Neither should be reused for the AI ledger. M4 needs its own `ai_credit_block_changes()` with a fixed search_path and EXECUTE revoked from client roles.

## 3. Security baseline
`security_verify()` was run as service_role: 1 finding, `unexpected_client_function` on `can_manage_exam(uuid)`. This is identical to the M3 baseline.

## 4. enqueue_ai_job checksum
- Live database md5: `a93bc2c2f88aafef1da98dcdf364fe78`. This is the M3 version and contains the `ai_reusable_key_statuses()` lookup.
- Stored pre-M3 md5 in the rollback file header: `6ab1234a35134b630ec6a1cfd6400bda`. This came from the database before M3.
- The two differ, which is expected because M3 replaced the function.
- The file body has still not been verified byte-for-byte against `6ab1234a…`.
- **Recommendation:** treat the rollback file's body as unverified. If you ever roll back, rebuild the pre-M3 body from the M3 migration diff, which changed exactly one predicate (`status NOT IN ('failed','cancelled')`). Confirm the rebuilt body's md5 equals `6ab1234a…` before applying it. Do not apply a rollback now.

## 5. Risks carried forward
1. **Zero-credit plan:** harmless in M4, because no enforcement exists yet. Must be resolved before M6, or every AI request will fail on insufficient credits.
2. **No model registry entries:** this blocks M6 (model resolution), not M4.
3. **Two cancelled M3 test jobs:** they count toward Org A's daily cap for 2026-10-09 only. They have no ledger rows, and the M4 reconciliation logic in M5/M6 must skip pre-ledger jobs.
4. **Rollback artifact:** not verified byte-for-byte (see §4).
5. **Governed-job rule:** deferred to M6. M4 must not add it.
6. **Linter:** 97 baseline. M4 may add at most the documented, intended findings.

## 6. Recommended next step — Gate 11C M4 only (on approval)
**Prerequisites:**
- confirm the project is `mdcmwhcjfpgewetsnunk`
- `security_verify()` returns exactly the 1 baseline finding
- `schema_migrations` ends at 011-m3
- no `ai_credit_*` objects exist yet

**Migration `011-m4`:**
- create the table, grants, RLS and the read policy
- add the unique and lookup indexes
- add the `ai_credit_block_changes()` function and its triggers (BEFORE UPDATE, DELETE and TRUNCATE)
- create the security_invoker balance view, SELECT for authenticated only
- record the version in `schema_migrations`
- no seed rows, no functions beyond the block function

**Tests:** a self-test that undoes itself, plus live role checks:
- service_role can insert valid rows
- UPDATE, DELETE and TRUNCATE are refused for service_role
- the CHECK rules (amount, kind/job_id pairing, adjust actor, reason_code) refuse bad rows
- unique rules: a duplicate reserve per job and a duplicate monthly grant are refused
- anon has no access; an authenticated user cannot insert or update
- RLS: Org A ai.manage sees only Org A rows; Teacher B sees only rows where user_id is their own; a forged or missing organisation sees nothing
- the balance view follows RLS and the formulas are correct on fixture rows
- `security_verify()` after shows no new findings; linter stays at 97 except documented items
- the 261-test regression suite
- all 12 AI function md5s and the 5 templates and 3 jobs are unchanged

**Rollback:** drop the view, the triggers, the block function and the table. This is only possible while the ledger has 0 rows, which holds because M4 seeds nothing. Otherwise freeze it (§10).

**Stop conditions:**
- any preflight mismatch
- any new `security_verify()` finding
- any write to the ledger succeeding as authenticated or anon
- UPDATE or DELETE succeeding for any role
- any change to an existing function md5 or to existing rows
- a regression failure

STOP after M4. Do not start M5.
