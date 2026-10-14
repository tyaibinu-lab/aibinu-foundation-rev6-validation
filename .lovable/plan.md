# Read-Only Security Audit: `public.users` References in Rev6 Application Source

Strictly read-only. No files edited, no migrations, no settings changes, no publish/deploy, no database queries. Source search only (ripgrep over `src/`, `supabase/`, `drizzle/`).

## Headline finding

**The application code (`src/`) contains zero direct queries against the `users` table.** No `.from("users")`, no `public.users` reference, and no client-side read of `is_platform_admin`, `status`, `deleted_at`, `email_verified_at`, `phone_verified_at`, or `last_login_at` anywhere in application source.

Every `.from(...)` call in `src/lib`, `src/routes`, and `src/components` was enumerated (63 calls). Tables touched: `students`, `student_parents`, `academic_sessions`, `classes`, `enrolments`, `class_roster`, `question_current`, `curriculum_topics`, `curriculum_versions`, `curricula`, `subjects`, `question_versions`, `questions`, `question_reviews`, `question_publications`, `notes`, `note_versions`, `note_reviews`, `exams`, `exam_questions`, `exam_eligibility`, `results`, `attempts`, `responses`, `organisation_memberships`. **`users` is not among them.**

## Classified findings

### 1. Authentication / authorization (app code)

- `src/lib/auth/org-context.ts:70` — `.from("organisation_memberships").select("organisation_id,status,organisations(id,name,slug,status,deleted_at)")`. Classification: **organisation-member display / tenant resolution**. Selects membership status and org fields only; no user security fields. The `deleted_at` here is on `organisations`, not `users`.
- `src/integrations/supabase/types.ts:5190-5224, 6266` — generated Supabase type definitions for the `users` row (includes `is_platform_admin`, `email_verified_at`, `phone_verified_at`, `last_login_at`) and the `is_platform_admin()` RPC signature. Classification: **other (generated types)**. Types only; no query is issued. Their presence does not expose data.
- Identity in the app comes from the Supabase Auth session (`auth.users` via the client SDK), never from `public.users` selects.

### 2. Database migrations (server-side authority, not client-facing)

- `supabase/migrations/001_identity_and_tenancy.sql` (and its drizzle mirror `drizzle/migrations/0000_aibinu_001_identity_and_tenancy.sql`):
  - Lines 205-208: column definitions for `is_platform_admin`, `email_verified_at`, `phone_verified_at`, `last_login_at`.
  - Lines 159, 397, 854-859: `is_platform_admin()` SECURITY DEFINER function and platform-admin checks inside other functions.
  - Line 680: trigger `AFTER UPDATE OF status, is_platform_admin, deleted_at ON public.users` (guard trigger).
  - Lines 729-742, 772-773: `handle_new_auth_user` / `handle_auth_user_updated` sync `email_verified_at`/`phone_verified_at` from `auth.users` confirmation timestamps.
  - Line 816 (comment): "Clients CANNOT modify email, phone, status, verification dates, or is_platform_admin." — column-grant restriction.
  - Lines 902-1100: RLS policies across tenant tables calling `public.is_platform_admin()`.
  - Lines 1004, 1020: `REVOKE ALL ... FROM PUBLIC` then `GRANT EXECUTE ... TO authenticated` on `is_platform_admin()`.
- `supabase/migrations/20261009014759_...sql:156` and `20261009020838_...sql:24` — platform-admin gates inside AI governance functions (`permission_denied` if not platform admin).
- `supabase/migrations/010_foreign_key_indexes.sql:243` — index on the function name reference only.

### 3. Security test fixtures (not app code)

- `supabase/tests/exploit.sql:17` — privilege-attack test attempting `UPDATE users SET is_platform_admin=true` as a student; expected to be **blocked**. Classification: **other (negative security test)**.
- `supabase/tests/00_seed.sql` — test fixture inserts into `users` for disposable-database testing only.

## Sensitive-field exposure assessment

| Field | Client UI reads it? | Where used |
|---|---|---|
| `is_platform_admin` | No | DB functions/RLS only; generated types |
| `users.status` | No | DB guard trigger, seed/exploit tests |
| `users.deleted_at` | No | DB guard trigger only |
| `email_verified_at` | No | Auth-sync trigger only |
| `phone_verified_at` | No | Auth-sync trigger only |
| `last_login_at` | No | Column definition only; no reads found anywhere |

No client-facing UI needs or consumes any security-sensitive user field. Org/member display uses `organisation_memberships` + `organisations` embeds; student/teacher/parent display uses the dedicated `students`/`parents` tables, not `users`.

## Caveats (UNKNOWN)

- Deployed database state (actual grants/policies) was not queried — per constraints. Source-only.
- Server functions: no `createServerFn` or `/api` route in this project reads `users` either (none found in search).
