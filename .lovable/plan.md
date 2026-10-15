# Curriculum Bank / Engine — Review-Only Plan (Option B, additive)

Scope: planning only. No files except this plan, no SQL, no database connection, no migrations, no publish. Production rsjwiaiyppiqrprfcqsr is out of scope. Repository migrations are not proof of what is deployed on any database.

## 1. Observed repository facts (current HEAD)

- Branch `edit/edt-048c10da-4c3b-4734-97b4-75861865e520`, commit `5fe8ceab6fcaed3a33ca9a0998afddd503866039`.
- No curriculum route in `src/routes/`; no `src/lib/curriculum`; no curriculum-specific test file.

Schema — `supabase/migrations/003_curriculum.sql`
- `curricula` (L33): `organisation_id NOT NULL`, `UNIQUE(organisation_id, name)`, `exam_body` text, soft delete `deleted_at`.
- `curriculum_versions` (L50): `version_label`, `effective_from`, `status curriculum_status` (draft/published/archived), `published_at`; `UNIQUE(curriculum_id, version_label)`.
- `uq_one_published_version` (L66): one published version per curriculum. Blocks e.g. WAEC 2026 and 2027 being live at the same time.
- `curriculum_units` (L69) → `curriculum_topics` (L85): two fixed levels; topic FK `(unit_id, version_id)` keeps unit and topic in the same version; `UNIQUE(version_id, code)`.
- `learning_outcomes` (L108) org-scoped, not versioned; `curriculum_outcomes` (L120) links topic_id ↔ outcome.
- `curriculum_prerequisites` (L131): keyed on version-specific `topic_id`; nothing stops a link across versions or curricula.
- `prevent_prerequisite_cycle()` (L144–161): plain plpgsql, no `SET search_path`, no lock. Two concurrent inserts (A→B and B→A) can each pass the check and commit a cycle. Not changed in any later migration (searched).
- `assessment_blueprints` (L169) optional `curriculum_version_id`; `assessment_blueprint_items` (L191) FK to `curriculum_topics(id, organisation_id)`.
- RLS (L247–283): curriculum tables readable by any active org member in `current_org_id()`, written with `curriculum.manage`; blueprints staff-only (`blueprint.manage` / `exam.create` / `academic.questions.write`). No shared/global rows and no platform-admin clause in these policies.
- Views `topic_tree` (L292), `blueprint_summary` (L317) are `security_invoker`; `topic_prerequisite_chain(uuid)` (L332) SQL STABLE, depth ≤ 10, caller rights.
- Permission `curriculum.manage` defined at `001_identity_and_tenancy.sql:1150`.

topic_key — `004_question_bank_and_notebank.sql:29–35`
- `curriculum_topics.topic_key uuid NOT NULL DEFAULT gen_random_uuid()`, `uq_topic_key_per_version(version_id, topic_key)`, `idx_topics_key(organisation_id, topic_key)`. Copies are expected to carry topic_key forward; nothing enforces that.
- Questions (004 L72) and notes (004 L157) FK to `curriculum_topics(id, organisation_id)`.
- Consumers by topic_key: `005_cbt_and_results.sql:591–604` (blueprint exam generation matches questions by topic_key), `007_cas_academic_intelligence.sql:38` (mastery by topic_key), `008_ai_services.sql:137, 257–305, 764–801` and `20261009022835_…sql:55–115` (AI context, diagnosis, recommendations; `topic_id_latest` used for titles).

App integration points
- `src/lib/notebank/api.ts:110` `listTopics()` → `curriculum_topics select("*") limit 500`.
- `src/lib/questionbank/api.ts:135` → `curriculum_topics select("id,title,code,version_id") order("position") limit 1000`.
- Topic pickers: `src/routes/notebank.index.tsx` (`t.title ?? t.name ?? t.id`), `src/components/questionbank/QuestionForm.tsx`.
- Tenant context: `src/lib/auth/AuthProvider.tsx`, `src/lib/auth/org-context.ts`, `src/components/auth/TenantGate.tsx` (sets `x-organisation-id`).
- Tests touching topics: `src/test/notebank-gate3.test.ts`, `notebank-workflow.test.ts`, `questionbank-contract.test.ts`, `cbt-contract.test.ts` (mocked client only). DB suites `supabase/tests/*.sql` exist for disposable PostgreSQL.

Unknowns: deployed state of 003/004 on any database; whether any rows exist that already rely on topic_key carry-forward; whether pickers show topics from non-published versions (both queries apply no version filter).

## 2. Proposed additive logical model (recommendation)

Three identities, kept separate:

```text
concept identity   topic_key (existing, stable across versions)   -> mastery, diagnoses, AI, analytics
legacy row         curriculum_topics.id / curriculum_units.id      -> notes, questions, blueprints, prerequisites (unchanged)
generic node       curriculum_nodes.id (new, version-specific)     -> arbitrary-depth tree
```

New tables (all with `organisation_id` + composite FKs like existing tables):
- `curriculum_nodes`: `id`, `organisation_id`, `version_id`, `parent_node_id` (same version), `node_kind` (unit, topic, subtopic, objective…), `code`, `title`, `position`, `node_key` (stable concept key for non-topic nodes). Unique `(version_id, code)`, parent must share version.
- `curriculum_node_legacy_map`: `node_id` 1:1 with exactly one of `unit_id` or `topic_id`. Topic nodes take their topic_key from the mapped `curriculum_topics` row; topic_key is never stored twice as an independent value.
- `curriculum_version_editions` (or columns on versions): `exam_year`, `exam_body`, lifecycle fields — only if the human decision in §3 chooses per-year editions.
- `topic_key_lineage` (optional): `(from_topic_id, to_topic_id, relation: carried|split|merged)` to record carry-forward explicitly instead of trusting copies.

Rules: legacy `curriculum_topics` stays the write target that notes/questions/blueprints reference; nodes deeper than topic are additive and do not get mastery until a decision is made. Existing views stay; a new `curriculum_node_tree` view (security_invoker) is added beside `topic_tree`.

## 3. Decisions requiring human approval

D1 Shared/base ownership: (a) per-org copies only (fits current RLS, no change); (b) platform "base" organisation whose curricula are cloned into tenants (keeps `organisation_id NOT NULL`); (c) `organisation_id NULL` global rows (changes every policy — not recommended). Recommendation: (b).
D2 RLS/platform-admin: whether platform admins can read/write tenant curricula; whether base curricula are readable cross-tenant (needs a new read-only policy) and who may publish them. No bypass assumed.
D3 Exam-year lifecycle: keep one-published-per-curriculum and model each exam year as its own curriculum, or replace the index with one-published-per (curriculum, exam_year). Changing the index is non-additive and must be its own gate.
D4 Immutable published versions: block edits to units/topics/nodes/prereqs/outcomes of a published version by trigger; changes require a new draft version. Decide whether `archived` can return to `draft`.
D5 Prerequisite concurrency: add `SET search_path`, take a per-version advisory transaction lock (or SERIALIZABLE retry) inside the cycle trigger, and require both topics in the same version. Confirm behaviour for existing cross-version rows (expected none; must be checked read-only).
D6 topic_key carry-forward: enforce via a `clone_curriculum_version` RPC rather than free copying; decide split/merge semantics.
D7 Permissions: reuse `curriculum.manage` or add `curriculum.publish` (catalogue change — 001 is gated).

## 4. Staged implementation (each a separate gate, validation project only)

```text
G-C0  Read-only: confirm deployed 003/004 match source; count cross-version prereqs, topic_key duplicates
G-C1  Prereq hardening (search_path, lock, same-version check)      rollback: restore old function body
G-C2  Clone RPC carrying topic_key + lineage table                   rollback: drop RPC/table (no legacy change)
G-C3  Immutability trigger for published versions                    rollback: drop trigger
G-C4  curriculum_nodes + legacy map + tree view, backfill from units/topics   rollback: drop new objects
G-C5  Exam-year lifecycle (index change only if D3 approves)        rollback: recreate uq_one_published_version (needs data check)
G-C6  Curriculum Bank UI: src/lib/curriculum, routes /curriculum.* under TenantGate (ssr:false), read-first then write
G-C7  Optional base-curriculum publishing/cloning per D1/D2
```

Each gate: disposable local PostgreSQL first, then validation project; all new tables follow CREATE → GRANT → RLS → policies; NoteBank/Question Bank keep calling `curriculum_topics` untouched. Rollback note: once the app calls new RPCs, rolling back the database alone breaks the UI — roll back app first.

## 5. Regression test matrix

| ID | Area | Check |
|---|---|---|
| R1 | Existing flows | NoteBank/Question Bank create with topic; CBT blueprint generation by topic_key (005 L591) unchanged |
| R2 | Views | `topic_tree`, `blueprint_summary`, `topic_prerequisite_chain` return identical rows before/after |
| T1 | Tenancy | Org B cannot read/write Org A curricula, nodes, map, lineage |
| T2 | Tenancy | Composite FKs reject cross-org node parent / map / prereq |
| P1 | Permissions | Member without `curriculum.manage` can read, cannot write; student cannot read blueprints |
| P2 | Permissions | Platform admin behaviour matches D2 exactly |
| V1 | Versioning | Published version edits rejected (D4); new draft allowed |
| V2 | Versioning | Publish rules per D3 (second published version allowed/blocked) |
| K1 | topic_key | Clone keeps topic_key for every carried topic; mastery/diagnosis joins still resolve |
| K2 | topic_key | `uq_topic_key_per_version` still enforced; node map cannot assign a different key |
| C1 | Cycles | Simple and 3-hop cycle rejected |
| C2 | Cycle race | Two sessions insert A→B and B→A concurrently: exactly one commits |
| C3 | Cycles | Cross-version prerequisite rejected |
| S1 | Hardening | Cycle function has fixed search_path; search-path hijack attempt fails |
| B1 | Rollback | Each gate's rollback restores prior catalog and R1–R2 pass |
| U1 | App | Vitest contract tests for new curriculum lib (exact calls, no direct writes to protected tables) |

## 6. Evidence needed before any approval

Decisions D1–D7 signed off; G-C0 read-only report; per-gate local run of matrix rows; existing 287 Vitest tests still passing; explicit migration gate for each step.
