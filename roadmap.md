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
