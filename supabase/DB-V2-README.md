# Aibinu FlexiPrep — database (PostgreSQL 15+)

Run `migrations/001 … 010` in order (each is safe to run once; `schema_migrations` records them).
Verify with `tests/run_all.sh` against a scratch server (needs a superuser connection).

## Roles
- `app_user` — your API's connection role. RLS applies. Per request, inside a transaction, call
  `SELECT set_request_context(<user_id>, <org_id>)`; it is transaction-local, so it is safe with connection pooling.
- `payments_service` — webhook handler only; may call `ingest_payment_event()` and nothing else.
- `ai_worker` — AI job runner only; may call `claim_ai_job()`, `complete_ai_job()`, `fail_ai_job()`.
Create login roles and `GRANT` them these (e.g. `GRANT payments_service TO webhook_login`).

## Supabase / Neon
Use the *direct or pooler (transaction mode)* connection string from your backend. Migrations 001–010 run in the SQL editor
or via `psql`. Do not use the Supabase Data API with these tables unless you adapt authentication (see CHANGES.md).

## Scheduled jobs (run from your scheduler, e.g. pg_cron or a cron container)
`run_cbt_maintenance()` every minute; AI worker polling `claim_ai_job()`; and your own CAS/report jobs.

See CHANGES.md for what changed in this review.
