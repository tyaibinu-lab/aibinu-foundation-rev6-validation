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
