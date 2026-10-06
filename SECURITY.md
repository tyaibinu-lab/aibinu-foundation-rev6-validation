# Aibinu Flexiprep — Security Rules

> Status: BASELINE. These rules are non-negotiable and apply to every future
> implementation task.

## Identity & sessions

- Authentication architecture and session management are protected areas.
  Do not redesign, weaken, or bypass them.
- Server-side session validation is the only source of truth for identity.
- Never trust client-supplied identity, role, or organisation claims.

## Tenancy

- Every tenant-scoped table carries organisation identity; every query is
  organisation-scoped.
- Cross-organisation data access is forbidden except through explicitly
  authorized platform-owner pathways.

## RBAC

- Roles live in a dedicated roles structure — never as a column on a
  profile/users table.
- RBAC is enforced server-side (RLS + server functions). Frontend role
  checks are UX only and are never a security boundary.
- Role checks use a security-definer function (e.g. `has_role`) to avoid
  recursive RLS.

## Row-Level Security

- RLS is enabled on every tenant/user-data table. No exceptions.
- Every `CREATE TABLE` in the public schema is followed by explicit `GRANT`
  statements in the same migration — RLS alone does not grant Data API access.
- Policies are additive and reviewed; a failing policy is fixed, never
  disabled.

## Owner protection

- Platform-owner / organisation-owner accounts cannot be demoted, locked out,
  or deleted by non-owner actors.
- Owner-protection rules are tested with both authorized and unauthorized
  paths before any related change ships.

## Audit

- Security-relevant actions (role changes, publishing, scoring, finance,
  AI job execution) write audit records with actor, action, target, timestamp.
- Audit records are append-only. Never rewrite audit or financial history.

## Service boundaries

- App-internal logic uses server functions; external callers (webhooks,
  cron, public APIs) use `/api/public/*` routes with in-handler verification
  (signatures, Zod validation).
- Privileged (service-role) work happens only after the caller is verified,
  and is loaded server-side only.
- Official CBT scoring is server-side only. Never move scoring to the client.

## Secrets

- Never expose, log, or commit API keys, auth secrets, Airtable PATs,
  database credentials, or private tokens.
- Secrets live in project secret storage; they are read inside server
  handlers, never at module scope, never in client bundles.

## Data protection

- Validate all user-controlled input (Zod or equivalent).
- Protect student information; avoid unnecessary exposure of student records
  in APIs, logs, and analytics.

## Forbidden

- Weakening auth, sessions, tenancy, RBAC, RLS, audit, or owner protection.
- Bypassing reviewer approval/publication for any content, AI-generated or not.
- Removing a security control to make a test pass.
