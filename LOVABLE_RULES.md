# Aibinu Flexiprep — Implementation Do/Don't Rules

> Binding rules for every future implementation task on this project.

## DO

- **Inspect before changing.** Identify dependencies, callers, and data flow
  before touching existing code. Do not change what you have not understood.
- **Preserve proven functionality.** Migrate persistence and selectively
  port business logic from the staging / student-management / lab apps.
- **Work in small, reversible increments.** Implement, test, verify, report.
- **Enforce security server-side.** RBAC, tenancy, scoring, publishing, and
  finance decisions happen on the server; RLS on every tenant table.
- **Add GRANTs with every CREATE TABLE** in the same migration.
- **Keep AI content as drafts** until teacher/reviewer approval, with full
  prompt/model/job/version/audit metadata.
- **Distinguish findings.** Report VERIFIED ISSUE vs CONFIGURATION FINDING vs
  POTENTIAL RISK vs INFORMATIONAL vs REQUESTED CHANGE. A configuration
  finding is not automatically a defect and is not automatically fixed.
- **Test what you change** — build, affected API behaviour, auth/authz paths
  (authorized and unauthorized), frontend workflow, regression behaviour.
  Never claim a test passed unless it was actually executed.
- **Report after implementation:** CHANGED / WHY / PRESERVED / TESTED /
  REMAINING / DEPLOYMENT.

## DON'T

- **Don't rewrite, rebuild, modernize, or restructure** existing working
  functionality unless explicitly requested.
- **Don't provision or connect a database, and don't auto-run migrations.**
  Migration 001 follows the approved Supabase preflight gate only.
- **Don't invent schema changes** where a supplied db-v2 migration exists.
- **Don't touch protected areas without explicit authorization:**
  authentication architecture, session management, RBAC, Airtable schema or
  credentials, database/data structures, API contracts, environment
  variables, deployment configuration, production deployment, and the
  separate `aibinu-flexiprep` Vercel project.
- **Don't change Vercel settings** — no Framework Preset changes, no env var
  changes, no production deployments. Report preset mismatches as
  CONFIGURATION FINDINGs only.
- **Don't expose or log secrets** — API keys, auth secrets, Airtable PATs,
  database credentials, private tokens.
- **Don't move CBT scoring to the client** or mix student attempts.
- **Don't bypass the reviewer workflow** for any content, AI-generated or not.
- **Don't rewrite financial or audit history.**
- **Don't add dependencies** without checking whether the functionality
  already exists in the project; no major upgrades as part of unrelated work.
- **Don't make speculative fixes** or redesign unrelated areas while
  implementing a specific feature.

## Engineering gates

```text
GATE 0  Baseline docs + minimal shell        ← complete with this task
GATE 1  Supabase preflight / initialization  ← requires explicit approval
GATE 2  Migration 001 → verify
GATE 3+ Migrations 002…010, incremental + verified
```

Executing any gate ahead of approval is a rule violation.
