<!-- LOVABLE:BEGIN -->
> [!IMPORTANT]
> This project is connected to [Lovable](https://lovable.dev). Avoid rewriting
> published git history — force pushing, or rebasing/amending/squashing commits
> that are already pushed — as it rewrites history on Lovable's side and the
> user will likely lose their project history.
>
> Commits you push to the connected branch sync back to Lovable and show up in
> the editor, so keep the branch in a working state.
<!-- LOVABLE:END -->

## Engineering gates
- Gate 0 baseline docs (ARCHITECTURE.md, SECURITY.md, DATABASE.md, MODULE_MAP.md, LOVABLE_RULES.md) are the canonical reference; no DB provisioning or migrations without explicit gate approval — the real Supabase project is not yet initialized.

- NoteBank UI (src/lib/notebank, src/routes/notebank.*) calls only the db-v2 contract (RLS tables + submit_note_version/publish_note_version, direct note_reviews insert); client permission checks via has_permission are UX only — the database is authoritative.
- Question Bank UI (src/lib/questionbank, src/routes/questionbank.*) calls only the Rev6 contract (RLS tables, question_current view, submit/publish/unpublish RPCs, direct question_reviews insert) and must embed questions from question_versions via the explicit FK question_versions_question_id_organisation_id_fkey — two FKs link the tables, so unnamed embeds fail with PGRST201.
- Tenant context: one AuthProvider (src/lib/auth) owns session + active organisation and is the only code that sets `x-organisation-id` on the shared Supabase client; protected modules sit under client-only layout routes (TenantGate). Why: Rev6 `current_org_id()` needs the header, and it must never be built per page — the database re-validates it, so it is context, not authorization.
- CBT Exam Administration (src/lib/cbt, src/components/cbt, src/routes/cbt.*) calls only the Rev6 contract: RLS inserts/updates on exams, exam_questions, exam_eligibility with organisation_id read from current_org_id(), plus publish_exam/close_exam for status. It never sends status, total_marks or created_by and never touches attempts, responses, results or answer keys. Why: the DB column grants, triggers and lifecycle RPCs are the authority, and scoring stays server-side.
- CBT Student Taking (src/lib/cbt/student.ts, src/components/cbt/student.tsx, src/routes/cbt.my.tsx, src/routes/cbt.take.$attemptId.tsx) uses only the Rev6 candidate RPCs (available_exams, start_attempt, get_attempt_paper, save_response, submit_attempt, results_for_student) and never table access. The countdown is display-only and anchored to server_now, and unsent answers are backed up locally and retried. Why: the database owns the deadline, layout, validation and scoring, and admin CBT files must never import this layer.
