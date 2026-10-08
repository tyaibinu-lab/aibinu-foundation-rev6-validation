# Gate 10 — AI Governance Schema & Lifecycle Design — v1.1

> **Version 1.1 (2026-10-08)** — v1.0 approved; v1.1 incorporates Gate 11A preflight corrections C1–C5 only (see §13, which is authoritative where it differs from earlier sections).

> **DESIGN ONLY. NO DDL EXECUTED.** No tables, columns, functions, RLS, grants,
> permissions, workers, providers, UI or credit charging were created or changed.
> Validation project `mdcmwhcjfpgewetsnunk`; production `rsjwiaiyppiqrprfcqsr`
> untouched. All SQL below is a proposal for a later, separately approved
> migration gate (Gate 11+).

## 0. Current-state baseline (inspected live, read-only, 2026-10-08)

### Tables
| Object | Exact columns (live) |
|---|---|
| `ai_jobs` | id, organisation_id NN, type ai_job_type NN, status ai_job_status='queued', priority smallint=5, input jsonb NN, target_type, target_id, student_id, idempotency_key, requested_by=current_user_id(), attempts=0, max_attempts=3, run_after=now(), locked_by, locked_until, model text, input_tokens, output_tokens, cost_usd_micros bigint=0, error, result_summary jsonb, created_at, started_at, finished_at. Partial unique `uq_ai_job_idem` (organisation_id, idempotency_key) WHERE key NOT NULL AND status NOT IN (failed, cancelled) — see §13.3. |
| `ai_prompt_templates` | id, job_type NN, version int NN, system_prompt NN, user_template NN, output_schema jsonb NN, is_active bool=false, notes, created_at. (Platform-global, no org.) |
| `ai_content` | id, organisation_id, job_id NN, kind ai_content_kind, status ai_content_status, student_id, payload jsonb, target_type, target_id, error, created_at |
| `ai_diagnostics` | id, organisation_id, student_id, job_id, summary, findings jsonb, model, review_state ai_review_state='pending_review', reviewed_by, reviewed_at, created_at |
| `ai_recommendations` | id, organisation_id, student_id, kind, topic_key, note_id, exam_id, title, reason, priority, source='rule', is_active, shown/clicked/dismissed_at, created_at |
| `ai_usage_daily` | organisation_id, day, jobs, input_tokens, output_tokens, cost_usd_micros (provider-cost rollup) |
| `diagnoses` | … narrative text, generated_by diagnosis_source, status diagnosis_status … (F1 target) |
| `organisation_settings` | organisation_id, key, value jsonb, updated_by, updated_at (holds ai_enabled, ai_daily_job_limit=100, ai_monthly_budget_usd_micros) |

Enums: `ai_job_status` (queued, running, succeeded, failed, cancelled); `ai_job_type` (generate_questions, generate_note, review_student, explain_diagnosis, report_comment); `ai_content_kind`; `ai_content_status`; `ai_review_state` (pending_review, accepted, discarded).

Views: `ai_review_outcomes`, `ai_usage_this_month`, `my_ai_drafts`, `topic_mastery_detail`.

### Functions (all `search_path = pg_catalog, public, pg_temp`)
| Function | Signature | Definer |
|---|---|---|
| enqueue_ai_job | (p_type ai_job_type, p_input jsonb, p_target_type text, p_target_id uuid, p_student_id uuid, p_idempotency_key text, p_priority smallint) → uuid | yes |
| request_ai_questions | (p_topic_id uuid, p_count int, p_type question_type, p_difficulty difficulty_level, p_cognitive cognitive_level, p_instructions text, p_idempotency_key text) → uuid | yes |
| request_ai_note | (p_topic_id uuid, p_style text, p_instructions text, p_idempotency_key text) → uuid | yes |
| request_ai_student_review | (p_student_id uuid, p_idempotency_key text) → uuid | yes |
| request_ai_diagnosis_explanation | (p_diagnosis_id uuid) → uuid | yes |
| request_ai_report_comment | (p_report_id uuid) → uuid | yes |
| claim_ai_job | (p_worker text, p_lease_seconds int) → jsonb | yes (service only) |
| complete_ai_job | (p_job_id uuid, p_outputs jsonb, p_usage jsonb) → jsonb | yes (service only) |
| fail_ai_job | (p_job_id uuid, p_error text, p_retry bool, p_usage jsonb) → void | yes (service only) |
| cancel_ai_job | (p_job_id uuid) → void | yes |
| record_ai_usage | (p_org uuid, p_usage jsonb) → void | yes (internal) |
| run_ai_maintenance | () → jsonb | yes (service) |
| review_ai_diagnostic | (p_id uuid, p_accept bool) → void | yes |
| build_ai_context | (j ai_jobs) → jsonb | yes (internal) |
| refresh_recommendations | (p_student_id uuid) → int | yes |
| my_recommendations | (p_refresh bool) → jsonb | yes |
| assert_service_context | () → void | invoker |

Permissions reused: `ai.use`, `ai.manage`, `academic.notes.*`, `academic.questions.*` (write/review/approve/publish), `cas.manage`, `result.mark`, `result.read_all`. **No new permission is required by this design** (Student Tutor permission deferred until the tutor is built).

## 1. Architecture decision (single recommendation)

`ai_jobs` remains the one canonical AI run record. Governance is added by:
extending `ai_jobs` and `ai_prompt_templates`; adding three small platform
catalogues (`ai_agents`, `ai_model_registry`, `ai_plans`); one tenant
assignment (`ai_org_plans`); one append-only customer ledger
(`ai_credit_transactions`); and (Phase 2) `ai_user_allocations`. Provider cost
stays in `ai_jobs` + `ai_usage_daily`. Credits are never derived from client
input. All writes go through SECURITY DEFINER functions. No `ai_agent_runs`,
`ai_usage_ledger` or `ai_rate_limits` tables (redundant with `ai_jobs`,
`ai_usage_daily`, and count queries on indexed `ai_jobs`).

```text
request_ai_*  ──► enqueue_ai_job ──(one txn)──► ai_jobs row + ledger RESERVE
                     │ checks: agent/model/plan/kill-switch/limits/balance
                     ▼
            awaiting_approval ──ai.manage approve──► queued
                     ▼
 worker(service) claim_ai_job ─► running ─► complete_ai_job ─► SETTLE + RELEASE
                                        └─► fail_ai_job(final) / cancel / expire ─► RELEASE
                                        └─► fail_ai_job(retry) ─► queued (no new reserve)
```

## 2. Proposed schema (PROPOSED SQL — NOT EXECUTED)

### 2.1 Enum extensions
```sql
ALTER TYPE ai_job_status ADD VALUE 'awaiting_approval' BEFORE 'queued';
ALTER TYPE ai_job_status ADD VALUE 'expired';
ALTER TYPE ai_job_status ADD VALUE 'rejected';
-- 'requested' is transient inside enqueue_ai_job, never persisted.
CREATE TYPE ai_credit_kind AS ENUM ('grant','reserve','settle','release','refund','adjust','expire');
CREATE TYPE ai_prompt_state AS ENUM ('draft','active','retired');
CREATE TYPE ai_safety_class AS ENUM ('staff_generation','staff_assist','student_facing','analytics');
CREATE TYPE ai_model_state AS ENUM ('enabled','disabled','retired');
ALTER TYPE ai_content_kind ADD VALUE 'mark_suggestion';      -- Marking Assistant (future)
-- v1.1 C2: no new kind for F1; existing 'diagnosis_narrative' is reused.
```
(`ALTER TYPE … ADD VALUE` runs in its own migration before use.)

### 2.2 `ai_agents` (platform catalogue, NEW)
```sql
CREATE TABLE public.ai_agents (
  code text PRIMARY KEY CHECK (code ~ '^[a-z][a-z0-9_]{2,40}$'),
  name text NOT NULL, description text,
  job_types ai_job_type[] NOT NULL,          -- which ai_job_type values this agent serves
  required_permission text NOT NULL REFERENCES permissions(code),
  safety_class ai_safety_class NOT NULL,
  default_model_id text REFERENCES ai_model_registry(id),
  fallback_model_id text REFERENCES ai_model_registry(id),
  credit_base integer NOT NULL DEFAULT 0 CHECK (credit_base >= 0),
  max_batch smallint CHECK (max_batch BETWEEN 1 AND 20),
  enabled boolean NOT NULL DEFAULT false,
  version integer NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now());
```
Seed (all `enabled=false` except existing paths):
| code | job_types | permission | safety | enabled at migration |
|---|---|---|---|---|
| lesson_note | {generate_note} | academic.notes.write | staff_generation | true (existing path) |
| question_bank | {generate_questions} | academic.questions.write | staff_generation | true |
| marking_assistant | {} (future type) | result.mark | staff_assist | false |
| student_tutor | {} (future type) | ai.use (+ future tutor perm) | student_facing | false |
| performance_analytics | {review_student, explain_diagnosis, report_comment} | cas.manage | analytics | true |

`review_student` etc. are mapped to `performance_analytics` so every existing job type has an agent; required permission for each existing request_ai_* function stays exactly what it checks today (the agent row is an additional gate, never a replacement).

### 2.3 `ai_model_registry` (platform catalogue, NEW)
```sql
CREATE TABLE public.ai_model_registry (
  id text PRIMARY KEY,                       -- stable, e.g. 'google/gemini-2.5-flash'
  provider text NOT NULL,                    -- 'lovable_gateway', …
  provider_model text NOT NULL,
  state ai_model_state NOT NULL DEFAULT 'disabled',
  safety_classes ai_safety_class[] NOT NULL,
  context_tokens integer NOT NULL CHECK (context_tokens > 0),
  input_usd_micros_per_1k bigint, output_usd_micros_per_1k bigint, -- metadata, Gate 11
  credit_multiplier numeric(6,3) NOT NULL DEFAULT 1 CHECK (credit_multiplier > 0),
  retired_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (state <> 'retired' OR retired_at IS NOT NULL));
```
No secret/key columns. Provider keys live only in worker secrets.

### 2.4 `ai_prompt_templates` extension (EXTEND)
```sql
ALTER TABLE ai_prompt_templates
  ADD COLUMN agent_code text REFERENCES ai_agents(code),
  ADD COLUMN state ai_prompt_state NOT NULL DEFAULT 'draft',
  ADD COLUMN checksum text,                  -- sha256(system_prompt||user_template||output_schema)
  ADD COLUMN approved_by uuid REFERENCES users(id),
  ADD COLUMN effective_from timestamptz,
  ADD COLUMN retired_at timestamptz;
-- backfill: state = CASE WHEN is_active THEN 'active' ELSE 'retired' END; checksum computed
ALTER TABLE ai_prompt_templates ADD CONSTRAINT uq_prompt_version UNIQUE (job_type, version);
CREATE UNIQUE INDEX uq_prompt_one_active ON ai_prompt_templates(job_type) WHERE state='active';
-- trigger prompt_immutable: once state<>'draft', system_prompt/user_template/output_schema/version/job_type immutable;
-- only state active→retired (+retired_at) allowed. No DELETE once referenced by ai_jobs (FK RESTRICT).
```
`is_active` kept as a generated-compatible column during transition (`is_active = (state='active')` via trigger) to avoid breaking existing readers; removed only in a later approved gate.

### 2.5 `ai_jobs` extension (EXTEND — no redundant columns)
Existing kept: organisation_id, requested_by, type, status, priority, input, target_*, student_id, idempotency_key, attempts/max_attempts, run_after, locked_by/locked_until (lease), model (legacy free text, retained for history), input/output_tokens, cost_usd_micros (actual provider cost), error, result_summary, created/started/finished_at. `id` is the job/request id.
```sql
ALTER TABLE ai_jobs
  ADD COLUMN agent_code text REFERENCES ai_agents(code),
  ADD COLUMN model_id text REFERENCES ai_model_registry(id),
  ADD COLUMN prompt_template_id uuid REFERENCES ai_prompt_templates(id) ON DELETE RESTRICT,
  ADD COLUMN requester_role text,              -- snapshot of role code at request (provenance only, not authz)
  ADD COLUMN source text NOT NULL DEFAULT 'app' CHECK (source IN ('app','scheduler','admin')),
  ADD COLUMN estimated_credits integer CHECK (estimated_credits >= 0),
  ADD COLUMN consumed_credits integer CHECK (consumed_credits >= 0),
  ADD COLUMN approval_required boolean NOT NULL DEFAULT false,
  ADD COLUMN approved_by uuid REFERENCES users(id),
  ADD COLUMN approved_at timestamptz,
  ADD COLUMN cancel_reason text,
  ADD COLUMN cancelled_by uuid REFERENCES users(id),
  ADD COLUMN timeout_seconds integer NOT NULL DEFAULT 120 CHECK (timeout_seconds BETWEEN 10 AND 900);
-- reserved credits are NOT a column: they are the job's ledger 'reserve' row (single source of truth).
-- Historical rows keep NULL agent/model/prompt; CHECK applied NOT VALID for new rows only:
ALTER TABLE ai_jobs ADD CONSTRAINT ai_jobs_governed_chk
  CHECK (created_at < '<migration_ts>' OR (agent_code IS NOT NULL AND model_id IS NOT NULL
         AND prompt_template_id IS NOT NULL AND estimated_credits IS NOT NULL)) NOT VALID;
```
Client column grants on ai_jobs unchanged (clients have no direct write today and get none).

### 2.6 `ai_plans` + `ai_org_plans` (NEW)
Rationale: `organisation_settings` is free-form, owner-editable jsonb; plan entitlements must not be editable by the tenant itself.
```sql
CREATE TABLE public.ai_plans (
  code text PRIMARY KEY, name text NOT NULL,
  monthly_credit_grant integer NOT NULL CHECK (monthly_credit_grant >= 0),
  allowed_agents text[] NOT NULL, allowed_models text[] NOT NULL,
  daily_job_limit integer NOT NULL CHECK (daily_job_limit > 0),
  max_concurrent_jobs integer NOT NULL DEFAULT 5,
  per_user_daily_jobs integer NOT NULL DEFAULT 10,   -- matches existing 10-per-user cap
  approval_threshold_credits integer,                -- NULL = never require approval
  grant_expires_after_days integer,                  -- NULL = rollover
  fair_use jsonb NOT NULL DEFAULT '{}',
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE public.ai_org_plans (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organisation_id uuid NOT NULL REFERENCES organisations(id),
  plan_code text NOT NULL REFERENCES ai_plans(code),
  effective_from timestamptz NOT NULL, effective_to timestamptz,
  approval_threshold_override integer,  -- org may only LOWER (CHECK in setter fn)
  assigned_by uuid, created_at timestamptz NOT NULL DEFAULT now(),
  EXCLUDE USING gist (organisation_id WITH =, tstzrange(effective_from, effective_to) WITH &&));
```
No currency fields; Naira pricing is commercial, outside the DB design.
`organisation_settings.ai_enabled` remains the org kill-switch; `ai_daily_job_limit` / `ai_monthly_budget_usd_micros` remain and the effective limit is `LEAST(setting, plan)` (org can tighten, never loosen).

### 2.7 `ai_user_allocations` (NEW, Phase 2)
```sql
CREATE TABLE public.ai_user_allocations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organisation_id uuid NOT NULL REFERENCES organisations(id),
  user_id uuid NOT NULL REFERENCES users(id),
  period_start date NOT NULL, period_end date NOT NULL CHECK (period_end > period_start),
  allocated_credits integer NOT NULL CHECK (allocated_credits >= 0),
  max_daily_credits integer, enabled boolean NOT NULL DEFAULT true,
  set_by uuid NOT NULL, created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (organisation_id, user_id, period_start),
  CHECK (set_by <> user_id OR false));  -- enforced in setter: caller must hold ai.manage and not be target
```
Allocation is a sub-limit of org balance, not separate money; consumption is computed from the ledger (`actor`=user).

### 2.8 `ai_credit_transactions` (NEW, append-only canonical ledger)
```sql
CREATE TABLE public.ai_credit_transactions (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  organisation_id uuid NOT NULL REFERENCES organisations(id),
  kind ai_credit_kind NOT NULL,
  amount integer NOT NULL CHECK (amount > 0),        -- sign derived from kind
  job_id uuid REFERENCES ai_jobs(id),
  user_id uuid REFERENCES users(id),                 -- beneficiary (requester) where applicable
  actor_id uuid,                                     -- current_user_id() or NULL for service/system
  actor_type audit_actor_type NOT NULL,
  reason_code text NOT NULL CHECK (reason_code ~ '^[a-z_]{3,40}$'),
  note text CHECK (length(note) <= 500),
  period_month date,                                 -- for grant/expire
  external_ref text,
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK ((kind IN ('reserve','settle','release','refund')) = (job_id IS NOT NULL)),
  CHECK (kind <> 'adjust' OR actor_id IS NOT NULL));
CREATE UNIQUE INDEX uq_credit_job_kind ON ai_credit_transactions(job_id, kind)
  WHERE kind IN ('reserve','settle','release','refund');
CREATE UNIQUE INDEX uq_credit_grant_period ON ai_credit_transactions(organisation_id, period_month, kind)
  WHERE kind IN ('grant','expire') AND reason_code IN ('monthly_grant','monthly_expire');
-- triggers reuse existing pattern: block UPDATE/DELETE/TRUNCATE (as block_ledger_changes / block_audit_changes).
```
Sign convention and balances (view, security_invoker):
```text
available = Σgrant + Σadjust(+/-: adjust uses reason_code adjust_credit|adjust_debit)
          − Σexpire − Σreserve + Σrelease + Σrefund
consumed  = Σsettle   (settle converts part of a reserve to spent; remainder released)
held      = Σreserve − Σsettle − Σrelease (per open job)
```
Exact per job: `reserve = settle + release` (refund only after a settle, e.g. bad-output credit-back).
Cache: **none initially**. Concurrency is controlled by `pg_advisory_xact_lock(hashtext('ai_credit:'||org_id))` plus SUM over an index on `(organisation_id)`; a cached `ai_credit_balances` row is justified only if Gate 11 load tests show SUM latency > 20 ms at 10k-student volume.

## 3. Function contracts (PROPOSED — NOT EXECUTED)

All: `SECURITY DEFINER`, `SET search_path = pg_catalog, public, pg_temp`, `REVOKE ALL FROM PUBLIC, anon`; errors raise with SQLSTATE `P0001` and stable message codes; every function is a single transaction (caller's). Org always from `current_org_id()` for user callers; from the job row for service callers. Never from parameters.

| Function | Caller | Behaviour / authz | Idempotency | Failure |
|---|---|---|---|---|
| `enqueue_ai_job(p_type, p_input, p_target_type, p_target_id, p_student_id, p_idempotency_key, p_priority)` — **signature unchanged** | internal (called by request_ai_*); EXECUTE stays revoked from authenticated as today | existing checks kept (ai_enabled, daily cap, budget, 10/user) **plus**: resolve agent by type → agent.enabled, `global_ai_enabled` platform flag, plan allows agent; resolve model = agent.default_model (fallback if disabled) and plan allows; pin active prompt for type; `requester_role` snapshot; concurrent-job and per-user limits; estimate credits; `ai_credit_reserve()`; status = awaiting_approval if estimate > threshold else queued | partial `uq_ai_job_idem` semantics per §13.3 (C3) | raises `ai_disabled`, `agent_disabled`, `model_unavailable`, `no_active_prompt`, `limit_exceeded`, `insufficient_credits`; whole txn rolls back (no job, no reserve) |
| `request_ai_*` (5) — signatures unchanged | authenticated | existing permission & scope checks unchanged; F3 cap via `ai_max_batch()` | via key | as today |
| `ai_estimate_credits(p_agent text, p_model text, p_units int) → int` | internal, IMMUTABLE-ish STABLE | `ceil(agent.credit_base + model.credit_multiplier × units × plan policy multiplier)`; units = batch count (questions) or 1 | pure | raises on unknown agent/model |
| `ai_credit_reserve(p_job_id uuid, p_amount int) → void` | internal only (no EXECUTE to any client role) | advisory lock on org; compute available; if `available − amount < 0` raise; check user allocation (Phase 2); insert reserve | unique (job_id,'reserve') — conflict = no-op | raise `insufficient_credits` |
| `ai_credit_settle(p_job_id uuid, p_actual int) → void` | internal (complete_ai_job) | lock org; actual = LEAST(actual, reserved) — never charge beyond reservation; insert settle(actual) if >0 and release(reserved−actual) if >0; set ai_jobs.consumed_credits | unique (job_id,'settle'/'release') | missing reserve → raise (legacy jobs: skip) |
| `ai_credit_release(p_job_id uuid, p_reason text) → void` | internal (fail final / cancel / expire / reject) | inserts release = reserved − settled; consumed_credits=0 | unique (job_id,'release') no-op | none |
| `ai_credit_refund(p_job_id uuid, p_amount int, p_reason text) → void` | authenticated with `ai.manage` in current org (job.org must match) | amount ≤ settled − refunded; audited | unique (job_id,'refund') — one refund per job | raise `refund_exceeds_settled` |
| `ai_credit_adjust(p_amount int, p_direction text, p_reason_code text, p_note text) → bigint` | **platform admin only** (`is_platform_admin()`); org from current_org_id() | adjust_credit / adjust_debit (debit may not push available < 0); audit_events row | caller supplies `external_ref`; unique (org, external_ref) where kind='adjust' | raise |
| `ai_credit_monthly_grant(p_org uuid, p_month date) → void` | service_role (`assert_service_context`) via scheduler | inserts expire of unused prior grant (if plan expires) then grant | uq_credit_grant_period | no-op on repeat |
| `approve_ai_job(p_job_id uuid, p_approve bool, p_reason text) → void` (NEW) | authenticated, `ai.manage`, same org, approver ≠ requested_by | awaiting_approval → queued (approved_by/at) or → rejected + release | status precondition (only from awaiting_approval) | raise `invalid_state` |
| `claim_ai_job(p_worker, p_lease_seconds)` — unchanged signature | service_role only | SKIP LOCKED; additionally skip jobs whose agent/model now disabled or global off (they are cancelled with release, reason `kill_switch`); returns prompt by `prompt_template_id` (not "current active"); lease = LEAST(p_lease_seconds, timeout_seconds) | attempts++ only on claim | — |
| `complete_ai_job(p_job_id, p_outputs, p_usage)` — unchanged signature | service_role only, must hold current lease (locked_by matches & not expired) | validate outputs against pinned output_schema + `ai_max_batch()`; drafts only (unchanged); record_ai_usage; compute actual credits from p_usage (server formula, never client) → `ai_credit_settle` | status must be running; second call raises `invalid_state`, settle unique prevents double charge | invalid output → fail path, release |
| `fail_ai_job(p_job_id, p_error, p_retry, p_usage)` — unchanged | service_role only | provider cost still rolled into ai_usage_daily; retry & attempts<max → queued with backoff, **reservation kept, no new reserve**; else failed + `ai_credit_release` | release unique | — |
| `cancel_ai_job(p_job_id)` → extend to `cancel_ai_job(p_job_id uuid, p_reason text DEFAULT NULL)` | requester (own) or `ai.manage` same org | allowed from awaiting_approval/queued; from running only by ai.manage (sets cancelled; worker's later complete is rejected, release issued); writes cancel_reason/cancelled_by; audit | already-terminal → no-op | — |
| `run_ai_maintenance()` — unchanged | service_role | requeue expired leases (no new reserve); per §13.4 (C4): expire → `expired` + release in same txn; reconcile report (below) | each step idempotent | — |
| `ai_set_kill_switch(p_scope text, p_code text, p_enabled bool)` (NEW) | platform admin only | scope ∈ global/agent/model; audit; global flag lives in a platform settings row | idempotent | — |
| `ai_credit_reconcile(p_from date, p_to date) → jsonb` (NEW, read) | service_role / platform admin | per org/day: ledger settle vs ai_jobs.cost_usd_micros vs ai_usage_daily; flags jobs with settle but no usage, usage but no settle, reserve without terminal | read-only | — |

`build_ai_context`, `review_ai_diagnostic`, `refresh_recommendations`, `my_recommendations`, `record_ai_usage`, `assert_service_context`: signatures unchanged; changes only as in §6.

## 4. RLS / grants intent (PROPOSED)

| Object | anon | authenticated | service_role | Policies |
|---|---|---|---|---|
| ai_agents, ai_model_registry, ai_plans | none | SELECT (non-sensitive catalogue; cost metadata columns excluded via column grant) | ALL | read: true for active members; writes only via platform-admin definer fns |
| ai_prompt_templates | none | none (unchanged; prompt text not exposed to tenants) | ALL | platform-admin read via fn |
| ai_org_plans | none | SELECT | ALL | `organisation_id = current_org_id() AND has_permission('ai.manage')` |
| ai_jobs (extended) | none | SELECT unchanged | ALL | existing policy kept (requester sees own; ai.manage org-wide); new columns readable under same policy |
| ai_credit_transactions | none | SELECT only | INSERT only (no UPDATE/DELETE grant to anyone; triggers block) | read: `organisation_id = current_org_id() AND (has_permission('ai.manage') OR user_id = current_user_id())`; no INSERT/UPDATE/DELETE policy for authenticated |
| ai_user_allocations | none | SELECT | ALL | own row (`user_id = current_user_id()`) or ai.manage org-wide; writes only via `ai_set_user_allocation` (ai.manage, target ≠ caller) |
| balance view `ai_credit_balance` | none | SELECT (security_invoker) | — | inherits ledger RLS |

Function EXECUTE: request_ai_*, cancel_ai_job, approve_ai_job, ai_credit_refund → authenticated; ai_credit_adjust, ai_set_kill_switch → authenticated but platform-admin checked inside; claim/complete/fail/run_ai_maintenance/monthly_grant/reconcile → service_role only; reserve/settle/release/estimate → no role (internal).

## 5. Credit lifecycle (exact semantics)
1. **Estimate:** `enqueue` computes max charge from agent, model, plan multiplier, requested units (server-side; client cannot send credits).
2. **Lock:** `pg_advisory_xact_lock` keyed on org (serialises reservations per tenant only).
3. **Reserve atomically with insert:** ai_jobs INSERT and ledger `reserve` in the same transaction; any failure rolls back both.
4. **Worker runs:** under lease; no ledger writes during run.
5. **Success:** settle(actual ≤ reserved) + release(remainder); `consumed_credits` set.
6. **Final failure / cancel / expiry / rejection:** release(full reserved − settled). Partial provider cost is recorded in ai_usage_daily (platform absorbs).
7. **Retries:** reuse the same job and reservation; unique (job_id,'reserve') makes a second reserve impossible.
8. **Admin adjustment:** `adjust` rows only, reason-coded, platform-admin actor, audited; history never edited.
9. **Monthly grants/expiry:** explicit `grant`/`expire` rows, unique per org-month.
10. **Reconciliation:** `ai_credit_reconcile` compares settle sums vs `ai_jobs.cost_usd_micros` and `ai_usage_daily` per org/day; mismatch rows reported, never auto-corrected.

## 6. F1 / F2 / F3 resolutions

**F1 — diagnosis narrative.** Future `complete_ai_job` for `explain_diagnosis` no longer writes `diagnoses.narrative`. It inserts `ai_content(kind='diagnosis_narrative', status='draft_created', target_type='diagnosis', target_id=…)`. New `review_ai_diagnosis_narrative(p_content_id uuid, p_accept bool, p_edited_text text DEFAULT NULL)` (definer; `cas.manage` + `can_view_student`, same org) → accept copies (optionally edited) text into `diagnoses.narrative` and marks content `applied`; reject marks `discarded`. Narratives already written stay (history preserved, no backfill). Student/parent views continue to see only staff-accepted narrative. Pseudonymous context unchanged.

**F2 — live-exam stems.** Future rule inside `build_ai_context` sample-question selection:
```sql
-- superseded by v1.1 §13.1 (C1)
```
`student_tutor` (safety_class student_facing) receives no question stems from any exam-linked question unless that exam is closed **and** results released. Privileged exam context requires a future explicit agent policy flag; none is granted now. Answer keys remain excluded everywhere (unchanged).

**F3 — batch cap.** Single authority `ai_max_batch(p_agent text) RETURNS smallint` = `LEAST(20, agent.max_batch, plan fair_use.max_batch)`; 20 is the existing safer request-side limit. Used by request_ai_questions validation, enqueue (stored in input.count), claim payload, and complete_ai_job (reject outputs with more items than `input.count`, replacing the current ≤25 check).

## 7. Human-in-the-loop contract (frozen)
- Lesson Note → AI draft (NoteBank, source='ai', created_by=requester) → teacher edit → submit_note_version → reviewer → publish_note_version.
- Question Bank → AI draft → teacher review → submit → reviewer approve → publish.
- Marking Assistant → `ai_content(mark_suggestion)` only → authorised human calls existing `mark_response`. AI never calls it.
- Student Tutor → explanatory text only; no writes to attempts/responses/results/marks.
- Analytics → reads released results only; outputs suggestions/report drafts.
- Requester is author ⇒ existing no-self-approval rules apply. `approve_ai_job` approves spending, never content.
No change to NoteBank, Question Bank, CBT, Auth/RBAC or tenancy behaviour is required. **No STOP condition triggered.**

## 8. Security / privacy controls
| Control | DB | Worker |
|---|---|---|
| Tenant isolation | org from current_org_id()/job row; RLS on all tenant tables | uses job org only |
| Requester scope | existing request_ai_* scope checks | — |
| Role/permission | agent.required_permission + existing checks | — |
| Service-only worker fns | assert_service_context, EXECUTE service_role only | holds service key server-side |
| Provider keys | never stored | secrets only, never in browser |
| Prompt injection | instruction length cap (1000), delimiting in pinned template | system prompt isolation, no tool access |
| Output validation | complete_ai_job schema + batch cap; draft-only | pre-validate JSON |
| Answer-key protection | build_ai_context excludes keys; F2 | — |
| Student minimisation | pseudonymised context | no logging of payloads |
| Idempotency / replay | unique job key, unique ledger (job,kind), lease ownership | idempotent retries |
| Cost abuse | limits, reservation, approval threshold, no negative balance | timeout |
| Emergency shutdown | global/agent/model kill-switch checked at enqueue and claim | stops claiming |
| Provider failure | retry/backoff, fallback model, release on final fail | circuit breaker |
| Audit/provenance | audit_events for enqueue, approve, cancel, settle, refund, adjust, kill-switch; job pins agent/model/prompt | records model actually used |

## 9. Index / constraint design
- ai_jobs: existing unique (organisation_id, idempotency_key); add `(organisation_id, status, created_at)`, `(requested_by, created_at)`, `(status, run_after) WHERE status='queued'`, FK indexes on agent_code, model_id, prompt_template_id, approved_by, cancelled_by.
- ai_credit_transactions: `(organisation_id, created_at)`, `(organisation_id, kind)`, `(user_id, created_at)`, unique (job_id,kind) partial, unique grant/expire per org-month, unique (organisation_id, external_ref) WHERE kind='adjust'.
- ai_prompt_templates: unique (job_type, version), unique active per job_type.
- ai_org_plans: gist exclusion (no overlapping periods), `(organisation_id, effective_from)`.
- ai_user_allocations: unique (org,user,period_start), `(user_id)`.
- Append-only triggers on ledger; immutability trigger on non-draft prompts; FK RESTRICT from jobs to prompts/models.

## 10. Staged migration plan (future)
| # | Content | Depends | Rollback |
|---|---|---|---|
| M1 | enum value additions | — | values cannot be dropped; harmless if unused |
| M2 | ai_model_registry, ai_agents, ai_plans, ai_org_plans (+grants, RLS) + seeds | M1 | drop new tables (no data dependents yet) |
| M3 | ai_prompt_templates + ai_jobs column extensions, backfill prompt state/checksum, NOT VALID check | M2 | drop added columns |
| M4 | ai_credit_transactions + append-only triggers + balance view | M2 | drop if no rows; otherwise freeze (never delete ledger) |
| M5 | estimate/reserve/settle/release/refund/adjust/grant fns (internal grants) | M4 | drop fns |
| M6 | request-path integration: enqueue, claim, complete, fail, cancel, maintenance, approve, kill-switch, F1, F2, F3 | M3, M5 | `CREATE OR REPLACE` back to captured Rev6 definitions (saved verbatim in migration comment) |
| M7 | worker-only grants / revokes | M6 | re-grant previous |
| M8 | RLS/policies review + verification test pack | all | — |
Each migration applied alone, verified, recorded in schema_migrations; existing orgs assigned a default plan with `monthly_credit_grant` set so no running feature is blocked at cut-over.

## 11. Test plan (future)
1. Tenant isolation: Org A user/ai.manage cannot see Org B jobs, ledger, plans, allocations; forged/missing x-organisation-id → 0 rows / denied.
2. RBAC: Student/Parent/Reviewer cannot request generation; Teacher sees own jobs/ledger only; ai.manage sees org; only platform admin adjusts/kill-switches; user cannot set own allocation.
3. Concurrency: 20 parallel enqueues with balance for 5 → exactly 5 succeed; available never < 0.
4. Idempotency: repeat key → same job, one reserve row.
5. Retry: fail(retry) ×2 then complete → one reserve, one settle, one release.
6. Release/refund: final fail, cancel (queued & running), expiry, rejection → reserve = settle + release; refund ≤ settled, once.
7. Double complete → second raises, no extra settle.
8. Batch cap: request 21 rejected; completion with more items than input.count rejected.
9. Agent/model disable: enqueue rejected; queued jobs cancelled at claim with release; fallback model used when default disabled.
10. Prompt traceability: job pins prompt_template_id; activating a new version does not change pinned job; non-draft prompt edit raises.
11. F1: explain_diagnosis creates suggestion only, narrative unchanged until accepted; reject leaves narrative unchanged.
12. F2: question in an open published exam never appears in context; appears after close (generation agents); tutor excluded until released.
13. Human approval: AI drafts land draft/source='ai'; requester cannot self-approve; no AI path to publish/mark/release.
14. Approval threshold: over-threshold → awaiting_approval; requester cannot approve own; ai.manage approves → queued.
15. Provider failure: partial usage recorded, credits released.
16. Emergency shutdown: global off blocks enqueue and claim.
17. Audit: every governance action writes audit_events with real actor; ledger UPDATE/DELETE refused for all roles incl. service_role.
18. Regression: full existing suite (261) + CBT P1–P4 + NoteBank/Question Bank unchanged.

## 12. Statement (v1.0)
**DESIGN ONLY; NO DDL EXECUTED.** Zero migrations, zero function/RLS/RBAC/permission changes, zero production changes.

---

## 13. v1.1 corrections (Gate 11A findings C1–C5) — AUTHORITATIVE

Evidence: Gate 11A read-only preflight, 2026-10-08, validation `mdcmwhcjfpgewetsnunk`. Rollback capture of the 18 current function definitions: Files `gate11a-rollback-ai-function-definitions.sql`.

### 13.1 C1 — F2 live-exam exclusion (actual Rev6 columns)
Rev6 facts: `exam_questions(question_version_id, exam_id, …)` has **no** `question_id`; `exams` has `status`, `opens_at`, `closes_at`, `hard_close`, `deleted_at`; `questions(status, current_version_id, deleted_at)`.

Proposed replacement for the `sample_questions` subquery in `build_ai_context` (generate_questions / generate_note):
```sql
SELECT qv.stem
FROM questions q
JOIN question_versions qv ON qv.id = q.current_version_id
JOIN curriculum_topics qt ON qt.id = q.topic_id
WHERE qt.topic_key = t.topic_key
  AND q.organisation_id = t.organisation_id
  AND q.status = 'published'
  AND q.deleted_at IS NULL
  AND NOT EXISTS (                                   -- any version of this question in a live exam
        SELECT 1
        FROM exam_questions eq
        JOIN question_versions eqv ON eqv.id = eq.question_version_id
        JOIN exams e              ON e.id  = eq.exam_id
        WHERE eqv.question_id = q.id
          AND e.organisation_id = q.organisation_id
          AND e.deleted_at IS NULL
          AND e.status = 'published'
          AND (e.closes_at IS NULL OR e.closes_at > now()))
ORDER BY random() LIMIT 3
```
"Live" = `published` AND not deleted AND (`closes_at` NULL or in the future), covering both scheduled (`opens_at` > now) and open exams. Draft-exam links are not excluded (not visible to candidates); `closed`/`archived` are allowed for staff generation agents. `student_tutor`: additionally excluded unless every linking exam is `closed`/`archived` **and** its results are released (rule reserved; tutor not built). Answer keys, options and explanations remain excluded (stems only).

### 13.2 C2 — diagnosis narrative governance (reuse `diagnosis_narrative`)
No new enum value. Lifecycle on `ai_content` (kind = `diagnosis_narrative`, target_type `diagnosis`):
| From | Event | To | Effect on `diagnoses.narrative` |
|---|---|---|---|
| — | `complete_ai_job(explain_diagnosis)` | `draft_created` | none (no longer written by worker) |
| draft_created | staff accepts (optionally edited) | `applied` | narrative := accepted text; generated_by stays as-is |
| draft_created | staff rejects | `discarded` | none |
| draft_created | diagnosis no longer `open` at review | `discarded` (reason recorded) | none |
| applied / discarded | any | — (terminal, immutable) | — |

Review function (proposed): `review_ai_diagnosis_narrative(p_content_id uuid, p_accept boolean, p_edited_text text DEFAULT NULL) RETURNS void`, SECURITY DEFINER, fixed search_path, EXECUTE to authenticated; requires `cas.manage`, `organisation_id = current_org_id()`, and `staff_can_view_results(student_id)` (same check as existing `review_ai_diagnostic`); row locked `FOR UPDATE`; only from `draft_created`; edited text 20–3000 chars; writes `audit_events` `ai.diagnosis_narrative.applied|discarded` with ids only (no narrative text). Existing applied narratives are history and not modified. Students/parents never read `ai_content`; they see only `diagnoses.narrative` set by a human. Context remains pseudonymous.

### 13.3 C3 — idempotency semantics (preserve partial `uq_ai_job_idem`)
Live index: `UNIQUE (organisation_id, idempotency_key) WHERE idempotency_key IS NOT NULL AND status NOT IN ('failed','cancelled')`. Preserved; extended to all new terminal-without-result statuses:
```sql
-- M3 (proposed): recreate concurrently-safe
DROP INDEX uq_ai_job_idem;
CREATE UNIQUE INDEX uq_ai_job_idem ON ai_jobs (organisation_id, idempotency_key)
  WHERE idempotency_key IS NOT NULL
    AND status NOT IN ('failed','cancelled','expired','rejected');
```
`enqueue_ai_job` duplicate lookup uses the **identical** status list (single SQL constant `ai_reusable_key_statuses()` IMMUTABLE returning that array, used by both index predicate text review and the function).

| Existing job with same (org, key) | Result of new request |
|---|---|
| awaiting_approval / queued / running / succeeded | return existing job id; **no new job, no new reserve** |
| failed / cancelled / expired / rejected | new job id, new reservation (old job's hold already released, §13.4) |
| none | new job + reserve |

Retries are **within one job** (`fail_ai_job(retry)` / lease requeue keep the same `ai_jobs.id`); `uq_credit_job_kind (job_id,'reserve')` makes a second reservation for the same job impossible. A concurrent duplicate insert loses on `uq_ai_job_idem` (unique_violation) → enqueue catches it, rolls back its own reservation savepoint and returns the winner's id. Requests without a key are never deduplicated (existing behaviour).

### 13.4 C4 — no stranded reservations
Invariant: every job that leaves a non-terminal status reaches a terminal status in the **same transaction** as its ledger closure (settle+release or release). Terminal set T = {succeeded, failed, cancelled, expired, rejected}.

| Path (function) | Current Rev6 behaviour | v1.1 behaviour (same txn) |
|---|---|---|
| claim_ai_job: no prompt / pinned prompt missing | → failed, no release | → `failed`, error `no_active_prompt`, `ai_credit_release` |
| claim_ai_job: agent/model/global kill-switch | n/a | → `cancelled`, cancel_reason `kill_switch`, release |
| complete_ai_job success | → succeeded | → `succeeded`, settle(actual ≤ reserved) + release(rest) |
| complete_ai_job validation exception | raises (txn aborted, job stays running) | unchanged raise; lease expiry then handled below — no hold stranded |
| fail_ai_job retry | → queued | → queued; hold kept; no ledger write |
| fail_ai_job final | → failed | → `failed` + release |
| run_ai_maintenance lease expired, attempts < max | → queued | → queued; hold kept |
| run_ai_maintenance lease expired, attempts ≥ max | → failed | → `failed` + release |
| run_ai_maintenance queued > 24h | → **failed** "Expired in the queue" | → `expired` + release |
| run_ai_maintenance awaiting_approval > 7d | n/a | → `expired` + release |
| cancel_ai_job (queued/awaiting_approval; running by ai.manage) | queued only → cancelled | → `cancelled` + release |
| approve_ai_job reject | n/a | → `rejected` + release |

Maintenance processes rows with `FOR UPDATE SKIP LOCKED` in batches, each row's status update and release in one statement block; a reconciliation sweep in `run_ai_maintenance` releases any job in T whose `reserve` lacks `settle`/`release` (defence in depth; reports count, should be 0). Historical (pre-migration) jobs have no reserve and are skipped.

Credit state per job:
```text
           reserve(R)
  [none] ───────────► [held R] ──settle(A≤R)+release(R−A)──► [closed: consumed A]
                         │
                         └──release(R)─────────────────────► [closed: consumed 0]
  [closed: consumed A] ──refund(≤A, once, ai.manage)──► [closed: refunded]
Invariant: Σreserve = Σsettle + Σrelease per job once status ∈ T.
```

### 13.5 C5 — limit counting (no bypass by status cycling)
| Status | Daily org cap (`ai_daily_job_limit`, plan daily) | Per-user concurrent cap (10 / plan) | Org concurrent cap | Credits held |
|---|---|---|---|---|
| awaiting_approval | counts | counts | no | yes |
| queued | counts | counts | no | yes |
| running | counts | counts | counts | yes |
| succeeded | counts | no | no | no (settled) |
| failed | counts | no | no | no |
| expired | counts | no | no | no |
| rejected | counts | no | no | no |
| cancelled | **counts** (v1.1 change; Rev6 excluded) | no | no | no |

Rule: daily cap = COUNT of all jobs created today in the org regardless of status (`created_at >= date_trunc('day', now())`), so cancel→re-request cannot exceed the cap. Per-user daily cap (plan `per_user_daily_jobs`) counts all statuses by `requested_by` the same way. Concurrent caps count non-terminal statuses {awaiting_approval, queued, running}. Retries do not create rows and so never consume additional daily quota. Counting runs after the per-org advisory lock so concurrent requests cannot both pass the last slot.

### 13.6 Job state-transition table (complete)
| From | To | Actor / function | Ledger |
|---|---|---|---|
| (requested, txn-local) | awaiting_approval | enqueue (estimate > threshold) | reserve |
| (requested) | queued | enqueue | reserve |
| (requested) | — (rollback) | enqueue failure | none |
| awaiting_approval | queued | approve_ai_job(true), ai.manage ≠ requester | — |
| awaiting_approval | rejected | approve_ai_job(false) | release |
| awaiting_approval | cancelled | cancel_ai_job | release |
| awaiting_approval | expired | run_ai_maintenance (>7d) | release |
| queued | running | claim_ai_job | — |
| queued | cancelled | cancel_ai_job / claim kill-switch | release |
| queued | expired | run_ai_maintenance (>24h) | release |
| queued | failed | claim (no prompt) | release |
| running | succeeded | complete_ai_job | settle + release |
| running | queued | fail_ai_job(retry) / lease expiry (attempts<max) | — |
| running | failed | fail_ai_job(final) / lease expiry (attempts≥max) | release |
| running | cancelled | cancel_ai_job by ai.manage | release |
| T | any | — | forbidden (guard trigger `ai_jobs_terminal_guard`, proposed M6) |

### 13.7 Security / grants / RLS requirements (unchanged intent, restated)
No anon access to any AI object; `ai_jobs_read` policy kept exactly; authenticated has no write grants on ai_jobs / ai_content / ledger; worker functions keep `assert_service_context()`; new functions SECURITY DEFINER with `search_path = pg_catalog, public, pg_temp` and `REVOKE ALL … FROM PUBLIC, anon`; ledger append-only for every role including service_role. No new permission codes. No change to CBT, Question Bank, NoteBank, Auth, RBAC, tenancy or P1–P4.

### 13.8 Rollback strategy
Per stage: before each migration, the exact `pg_get_functiondef` of every function it replaces is captured (baseline already captured in Gate 11A, md5 per function recorded). Function rollback = re-apply captured definitions. Index rollback (C3) = recreate the original predicate `NOT IN ('failed','cancelled')` (only safe while no rows use expired/rejected; otherwise keep v1.1 index). Enum values are not removed. Ledger rows are never deleted; rollback of ledger stages = revoke EXECUTE on credit functions and leave history frozen.

### 13.9 Mandatory security_verify checkpoint
`security_verify()` is executable only by service_role/admin (Gate 11A: read role denied). Each migration stage M1–M8 must: run `SELECT * FROM security_verify()` as service_role **before** and **after**; record both outputs; require zero new failures versus baseline; plus the Supabase linter count must not exceed the 97-finding baseline except for documented, intended new SECURITY DEFINER warnings. A failure stops the gate before the next stage.

### 13.10 Added tests (v1.1)
19. C1: question whose version is in a published, non-deleted exam with future/NULL closes_at never appears; soft-deleted exam or closed exam → may appear (staff agents).
20. C2: explain_diagnosis leaves narrative unchanged; accept → applied + narrative set; reject → discarded; second review raises; non-cas.manage/out-of-scope staff denied.
21. C3: same key after succeeded returns same id; after failed/cancelled/expired/rejected creates new job; concurrent duplicate → one job, one reserve.
22. C4: every path in §13.4 ends with Σreserve = Σsettle + Σrelease; reconciliation sweep reports 0.
23. C5: cancel-and-re-request cannot exceed daily cap; awaiting_approval counts toward per-user cap.
24. security_verify before/after each stage, zero new failures.

## 14. Statement (v1.1)
**DESIGN ONLY; NO DDL EXECUTED.** v1.1 changed only this document. No migrations, SQL execution, data, permissions, provider, worker or production changes.
