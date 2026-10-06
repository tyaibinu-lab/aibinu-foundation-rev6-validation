# Review of migrations 001–008: what was found and changed

Tested on PostgreSQL 16 only. Not yet run on Supabase itself.

## Security flaws found in the first version (all fixed, all covered by tests)
These were exploitable by an ordinary logged-in user connected as `app_user`:
- A student could set `is_platform_admin = true` on their own user row, or change their own `status`.
- A student could insert into `role_permissions` (grant themselves any permission) and edit the permissions catalogue.
- An organisation owner could change their organisation's `status`/`type` and assign a *platform* role to a member.
- Anyone in an organisation could write audit events pretending to be another user.
- A suspended user, or a user of a suspended organisation, kept all their permissions.
- Question/note authors could set their own content to `approved`/`published`, bypassing review, and could credit work to someone else.
- Teachers could change an exam's `status` / `total_marks` directly, bypassing the checks in `publish_exam()`.
- Finance staff could reset a discount's `used_count`.

Fixes: column-level grants everywhere (users can write only the columns they should), RLS on `permissions` and
`role_permissions`, split INSERT/UPDATE/DELETE policies, `created_by = current_user_id()` on inserts,
`has_permission()` and `is_org_member()` require an active user and active organisation, new guard triggers
(`membership_role_guard`, `last_owner_guard`, exam status guard), and `set_request_context()` which validates the user
before setting the session identity.

## Bug found by actually running the code
- 005 and 006 created two indexes with the same name (`idx_attempts_open`), so the set failed to install. Renamed in 006.

## Modern-standard improvements
- Audit trail (`audit_row_change`) on memberships, roles, role permissions, settings, organisations, products, prices,
  discounts and scholarships.
- Every SECURITY DEFINER function pins `search_path = pg_catalog, public, pg_temp` (blocks search-path hijacking).
- RLS policies call helpers as `(SELECT fn())` so Postgres evaluates them once per query, not once per row.
- Email, phone (E.164) and slug format checks; `citext` installed in `public`; unused `pgcrypto` removed.
- 009: `create_organisation()` (signup was impossible before: organisations had no INSERT policy), single-use hashed
  invitation tokens (`invite_member`, `accept_invitation`) that cannot grant a role above the inviter's own,
  `anonymise_student()`, `schema_migrations` tracking, and a lockdown of Supabase's `anon`/`authenticated` roles.
- 010: 177 indexes on foreign-key columns (Postgres does not create these; without them deletes and RLS filters degrade as data grows).
- Test suite (`tests/run_all.sh`): exam, finance, AI queue, onboarding flows plus 30+ attack attempts.

## Not done / you should know
- Not load-tested. Not tested on Supabase or Neon, only a local PostgreSQL 16.
- The database trusts the backend to say who the user is (`set_request_context`). Only your server may connect as
  `app_user`; never expose it directly to browsers. If you use Supabase's own Data API instead, the user id must come
  from the verified JWT (`auth.uid()`), not from a settable value. That needs a different, small adapter.
- The payment webhook handler, the AI worker and the schedulers (`run_cbt_maintenance`, etc.) are application code
  that is not included; the database side of each is.
- Legal compliance (NDPR/GDPR retention periods, children's data consent) needs a lawyer; `anonymise_student()` is a tool, not a policy.
