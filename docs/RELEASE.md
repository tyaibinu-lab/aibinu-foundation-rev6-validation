# Release runbook (Rev6)

Status of this document: written during the technical-audit remediation. Nothing here has been run against a Supabase project.

## Gate 0: before any release
1. `package-lock.json` is committed (generate with `npm install --package-lock-only --ignore-scripts`; the audit sandbox had no registry access). CI uses `npm ci --ignore-scripts`, then `npm test`, `npm run lint`, `npm run build`, `npm audit`.
2. `supabase/tests/rev6/run-local.sh` passes on a fresh disposable PostgreSQL (all migrations replay; curriculum integrity and cycle-race tests pass).
3. `EXPECTED_SUPABASE_REF=<ref> npm run check:target` passes for the intended project. `src/integrations/supabase/client.ts` is generated and hardcodes one project, so the release build for production must be produced from a branch/config whose client and `config.toml` point at the production ref.
4. `supabase/MIGRATION-CHECKSUMS.sha256` matches `(cd supabase/migrations && sha256sum -c ../MIGRATION-CHECKSUMS.sha256)`. The older `MIGRATION-MANIFEST.md` hashes are stale and must not be used.

## Known items that need the project owner
- `20261011043814_*` is labelled "STATIC CANDIDATE, NOT APPLIED" yet sits in `supabase/migrations`; confirm whether it belongs in the chain before production.
- `20261009005746` creates `public.m4_test_results` (a test table). Decide whether to drop it in a later migration before production.
- Applying `20261102000100_curriculum_integrity_hardening.sql` to the validation project, then runtime checks through the Supabase API with real tokens, then dashboard review (Auth settings, storage policies, exposed schemas).
- Production migration and deployment require the owner's explicit written approval. Not performed.
