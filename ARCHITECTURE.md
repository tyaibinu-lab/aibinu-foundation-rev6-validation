# Aibinu Flexiprep — Canonical Architecture

> Status: BASELINE. This document defines the target architecture and module
> boundaries. It does not authorize implementation, schema changes, or
> database provisioning.

## Principles

1. **Preserve, then migrate.** Proven capabilities from the existing Aibinu
   Flexiprep staging / student-management / lab applications are source
   modules. They are selectively migrated, never wholesale rewritten.
2. **One canonical data platform.** PostgreSQL/Supabase, per the supplied
   db-v2 migrations 001–010. No competing data architecture.
3. **Server-side authority.** Identity, tenancy, RBAC, RLS, scoring, finance,
   and publishing decisions are enforced on the server. The frontend is a
   presentation layer only.
4. **AI is governed.** AICAS produces drafts; teacher/reviewer approval gates
   publication. Always.

## Layered view

```text
┌─────────────────────────────────────────────────────────────┐
│ Clients: Web (TanStack Start), future mobile/offline shell  │
├─────────────────────────────────────────────────────────────┤
│ Application modules (feature layer)                         │
│  Student Mgmt │ Academic/NoteBank │ Reviewer │ CBT │ Lab    │
│  AICAS │ Finance │ Analytics │ Communication │ Offline      │
├─────────────────────────────────────────────────────────────┤
│ Platform services (server functions / API routes)           │
│  auth context · tenancy · RBAC · audit · review workflow    │
├─────────────────────────────────────────────────────────────┤
│ Data layer: Supabase (PostgreSQL + RLS + Storage + Auth)    │
│  Schema defined exclusively by migrations 001–010 (db-v2)   │
└─────────────────────────────────────────────────────────────┘
```

## Module boundaries

Each module owns its UI, its server functions, and its queries against the
canonical schema. Modules communicate through the platform services layer
(auth context, tenancy, audit) — never by reaching into another module's
internals or tables without a defined contract.

| Module | Owns | Must not |
|---|---|---|
| Student Management | enrolment, profiles, class assignment | redefine identity/roles |
| Academic / NoteBank | notes, AI note creation, AI question generation | auto-publish AI content |
| Reviewer | submission → approval → publishing workflow | be bypassed by any module |
| CBT | attempt lifecycle, delivery, scoring, history | score on the client |
| Virtual Laboratory | reusable experiment engine | fork per-subject engines |
| AICAS | AI jobs, prompts, models, versions, audit metadata | publish without review |
| Finance | billing records, payment history | rewrite financial history |
| Analytics | reporting over canonical data | write to transactional tables |
| Communication | notices, messaging | bypass tenancy scoping |
| Offline | cached learning resources, sync | create divergent write paths |

## Academic content model (canonical)

```text
Curriculum → Subject → Topic → Learning Objective → Learning Resource
```

Learning resources: Notes, Questions, Worked Examples, Virtual Experiments,
Quizzes, CBT, AI explanations. All resources carry curriculum alignment
(WAEC, NECO, UTME where applicable) and review status.

## Engineering gates

```text
GATE 0  Architecture/baseline docs + minimal shell   ← THIS TASK (done here)
GATE 1  Supabase preflight / initialization          ← next approved gate
GATE 2  Migration 001 → verify
GATE 3+ Migrations 002…010, each applied incrementally and verified
```

No gate may be executed ahead of approval. Migrations are never auto-run.
