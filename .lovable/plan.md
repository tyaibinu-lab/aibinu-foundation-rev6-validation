# Read-only audit: PostgreSQL password dependencies (staging mdcmwhcjfpgewetsnunk)

No changes were made. Approving this plan only authorises the read-only diagnostic step in section 5.

## 1. Direct PostgreSQL connections found: No (in the app at runtime). Unknown (for external tools)
- No application code imports `postgres`, `pg` or `drizzle-orm`. A repo-wide import search found nothing.
- The only direct-connection config is `drizzle.config.ts:8`, which sets `url: process.env.LOVABLE_DB_MIGRATION_URL ?? ""`. It is used only by the drizzle-kit CLI, and that variable is not present in this sandbox.
- `package.json:83-84` lists `drizzle-kit` and `drizzle-orm`. It also lists `postgres ^3.4.9`. All three are installed but not imported anywhere.

## 2. Environment variables referenced
| Variable | Where | Present here |
|---|---|---|
| SUPABASE_URL | client.server.ts:33, auth-middleware.ts:37 | yes (.env) |
| SUPABASE_SERVICE_ROLE_KEY | client.server.ts:34 | yes (value masked) |
| SUPABASE_PUBLISHABLE_KEY | auth-middleware.ts:38 | yes |
| VITE_SUPABASE_* | .env, browser client (hardcoded publishable key) | yes |
| LOVABLE_CRON_SECRET / _PREVIOUS | cron-auth.ts:5-6 | not verified; helper is unused (no api routes) |
| LOVABLE_DB_MIGRATION_URL | drizzle.config.ts:8 | absent |
| DATABASE_URL, POSTGRES_URL, PGPASSWORD, SUPABASE_DB_URL | not referenced | absent |

## 3. Code paths by access method
- **Service-role key (HTTPS Data/Auth API, not a Postgres password):** `src/integrations/supabase/client.server.ts`.
- **Publishable key plus user JWT:** `auth-middleware.ts` and `client.ts` (browser). These are used by all modules (NoteBank, Question Bank, CBT, Students).
- **Direct Postgres:** none in the app. There is no `supabase/functions/`, no `src/routes/api/` and no `wrangler.*`.

## 4. What may depend on the current database password
- Changing the database password does not affect the app at runtime, because it uses API keys only.
- These things may depend on it, but none of them can be inspected from here:
  - drizzle-kit or psql sessions run outside the app
  - the Lovable migration tool's connection
  - Supabase SQL editor sessions (these use dashboard auth, not the password)
  - any external runner planned for the C1–C8 tests (O6)
  - CI or scripts outside this repo
  - pg_cron jobs (these run inside the database and do not use the password)
- The comment at `drizzle/migrations/0004...sql:1192` only suggests a schedule for `run_cbt_maintenance()`. Whether a cron job actually exists was not checked.

## Evidence and limitations
- **Confirmed:** source search results, `package.json`, `.env`, and which variables are present in this sandbox (checked by name only).
- **Cannot inspect:**
  - hosted or published secret values
  - the Supabase dashboard's pooler and password settings
  - the user names and hosts in your failing connection string
  - external CI or tools
  - Supabase Postgres logs (not queried)

## 5. Recommended next diagnostic step (read-only, needs approval)
1. Query the Supabase Postgres logs for recent `password authentication failed` entries. Record the user, host and app name, with no values exposed.
2. Read `cron.job` (if it exists) to confirm whether any scheduled job connects out.
3. On your machine, check that the connection string's user format matches the connection type:
   - pooler: `postgres.mdcmwhcjfpgewetsnunk`
   - direct: `postgres`
   Also check that the host belongs to the staging project and not production (rsjwiaiyppiqrprfcqsr), and that special characters in the password are URL-encoded.
