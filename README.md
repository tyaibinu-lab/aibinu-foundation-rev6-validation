# Aibinu Foundation — Rev6 Validation

Create the Aibinu Flexiprep Global Learning Platform as a controlled engineering project.

IMPORTANT: This first task is an ARCHITECTURE/BASELINE SETUP task, not a full application build.

Establish a clean project shell and documentation for the platform. Do not invent or redesign the database/security architecture. Do not connect or provision a new database yet. Do not auto-run database migrations. Do not replace existing proven application architecture.

Create:
1. ARCHITECTURE.md — canonical platform architecture and module boundaries.
2. SECURITY.md — identity, tenancy, RBAC, RLS, audit, owner-protection and service-boundary rules.
3. DATABASE.md — migration 001-010 strategy and explicit note that disposable PostgreSQL was used for prior tests and the real Supabase project is not yet initialized.
4. MODULE_MAP.md — Student Management, Academic/NoteBank, Reviewer, CBT, Virtual Laboratory, AICAS, Finance, Analytics, Communication, Offline.
5. LOVABLE_RULES.md — explicit do/don't rules for future implementation.
6. A minimal responsive application shell only; do not implement business logic yet.

The target platform must preserve and selectively migrate proven capabilities from the existing Aibinu Flexiprep staging/student-management/lab applications rather than rewrite everything.

The next approved engineering gate after this is Supabase preflight/initialization, followed by migration 001. Do not execute that gate in this task.

This project was built with [Lovable](https://lovable.dev).

## Build with Lovable

Continue developing this project in the [Lovable editor](https://lovable.dev/projects/1eff1978-0896-4db4-a065-976c75f1167c).

- **Ship faster**: describe what you want to build and Lovable handles the code.
- **Stay in sync**: every change made in Lovable is committed straight to this repository.
- **Full ownership**: this code is yours. Push to `main` on GitHub and your changes sync back into Lovable, ready for your next prompt.

## Development

Prefer working locally? You need Node.js and npm — [install with nvm](https://github.com/nvm-sh/nvm#installing-and-updating).

```sh
git clone <this-repository-url>
cd <repository-name>
npm i
npm run dev
```
