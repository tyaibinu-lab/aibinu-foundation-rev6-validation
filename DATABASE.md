# Aibinu Flexiprep — Database Strategy

> Status: BASELINE. No database has been provisioned or connected by this
> task. This document records strategy only.

## Canonical target

- **PostgreSQL via Supabase (Lovable Cloud)**, schema defined exclusively by
  the supplied **db-v2 migrations 001–010**.
- Do not invent schema changes where a supplied migration exists.
- Do not create a competing data layer (no parallel Airtable-first design,
  no ad-hoc tables outside the migration sequence).

## Important status note

- Prior migration testing used **disposable PostgreSQL instances** only.
- **The real Supabase project is NOT yet initialized.** Do not assume any
  migration has been deployed to it.
- Do not run migrations automatically. Migration execution requires an
  explicit migration gate approved by the project owner.

## Migration strategy

Migrations are applied **incrementally, one at a time, with verification
between each step**:

```text
Preflight/initialization (GATE 1)
  → apply 001 → verify (schema, grants, RLS, policies)
  → apply 002 → verify
  → apply 003 → verify
  → …
  → apply 010 → verify
```

Verification per migration includes:

1. Migration applies cleanly on a fresh database.
2. Expected tables, enums, functions, and indexes exist.
3. Every new public-schema table has explicit `GRANT` statements in the same
   migration (anon/authenticated/service_role as appropriate).
4. RLS is enabled and policies match the intended access model.
5. Reversible: the change can be reasoned about and rolled back if needed.

## Data change discipline

- Prefer **additive** changes over destructive ones.
- Never delete production data without explicit authorization.
- Never rewrite financial or audit history.
- Before changing any data structure: identify affected fields, find all
  references (API, frontend, Airtable legacy), and assess impact first.

## Legacy sources

The existing staging / student-management / lab applications (including
Airtable-backed modules) are **migration sources**, not the target
architecture. Their proven business logic is preserved; their persistence is
migrated to the canonical schema through the gated migration sequence above.
