# Roadmap

## Gate 1 — Backend initialization (APPROVED by project owner, 2026-10-06)
- [ ] Enable Lovable Cloud / Supabase for the project
- [ ] Preflight: confirm connection and environment
- [ ] Apply migration 001 → verify (tables, grants, RLS)
- [ ] Apply migrations 002…010 one at a time, verifying each
- [ ] Record results in a verification report

## Backlog
- NoteBank end-to-end against the real database (after migrations)

## External Supabase connection (Option 2 — approved)
- [x] Connect external Supabase project Aibinu-flexiprep DB Validation (mdcmwhcjfpgewetsnunk) — done via UI
- [x] Fixed stale client .env (still points at vzmbcodyatxbtbhbnviy) via backend rebind, not hand-editing
- [x] Read-only preflight: project identity, schema_migrations, RLS, roles, security definer functions
- [x] Reported identity/state — STOPPED, awaiting approval — no migrations, no wiring until explicit approval

## Gate 7 — Browser auth + organisation context (approved)
- [x] /login, session restore, sign-out, protected NoteBank/Question Bank, org context + x-organisation-id
- [x] Automated tests, live Teacher browser test, forged-org checks — STOPPED, awaiting approval

## Gate 8C Phase 1 — CBT Exam Administration (approved)
- [x] /cbt, /cbt/new, /cbt/$examId behind TenantGate; publish_exam/close_exam only
- [x] Contract tests + live Publisher validation; UAT exam "[Gate8B UAT] Quadratics Check" published with 3 pinned versions, class UAT SS2 A
- [x] Phase 2 student taking: /cbt/my, /cbt/take/$attemptId; live UAT attempt submitted (results unreleased)
- [x] Gate 8D results & release: /cbt/results, /cbt/results/$examId, /cbt/review/$examId; UAT result released via release_results
- [x] Gate 8E manual marking: /cbt/mark/$attemptId via mark_response; UAT fixture "[Gate8E UAT] Manual Marking Check" marked 3/4 and released
- [x] Gate 8F hardening audit — app-only fixes + tests; DB proposals P1–P4 in docs/gate8f-proposed-db-changes.md
- [ ] Apply P1–P4 — awaiting explicit DB-contract approval
- [x] Gate 8G-1 P1 applied (release_results scope). P2/P3/P4 pending approval.
- [x] Gate 8G-2 P3 applied (DB-stamped created_by on exams/exam_eligibility). P2/P4 pending approval.
- [x] Gate 8G-3 P2 applied (owner-scoped exam administration via can_manage_exam). P4 pending approval.
- [x] Gate 8G-4 P4 applied (audit_cbt_event triggers: exam.published/closed, result.released, response.marked).
- [x] Gate 8G-5 final CBT sign-off: Owner-only audit.read kept (no RBAC change); permanent UAT Owner, Teacher B, Teacher row + SS2 Maths assignment; full regression passed.
- [x] Gate 9 AI architecture audit/reservation (read-only; report in Files). Next: Gate 10 AI governance schema proposal.
- [x] Gate 10 AI governance schema & lifecycle design (docs/gate10-ai-governance-schema-proposal.md) — DESIGN ONLY, no DDL. Next: Gate 11 migrations M1–M8 on approval.
- [x] Gate 10 v1.1 design revision (C1–C5 from Gate 11A) — document only. Next: Gate 11B M1 on approval.
- [x] Gate 11B M1 applied (validation only): AI governance enum/type foundation, schema_migrations 011-m1. Next: M2 on approval.
