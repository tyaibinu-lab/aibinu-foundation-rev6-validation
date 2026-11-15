-- 35_ai_credit_selftest.sql — AI Governance M4 credit-ledger self-test.
-- R0 (F-01): relocated from migrations 20261009005746 and 20261009010318,
-- which are now no-ops. Run AFTER the full migration chain, as the database
-- owner (postgres), against a DISPOSABLE database only:
--   psql -X -v ON_ERROR_STOP=1 -d rev6_disposable_<name> -f supabase/tests/35_ai_credit_selftest.sql
-- Self-contained: creates its own synthetic orgs/users/jobs (reserved
-- 00000000-0000-0000-0000-000000035xxx ids), never reads existing records,
-- and ROLLs BACK everything at the end. Fails (non-zero exit) on any false check.
\set ON_ERROR_STOP on
BEGIN;

DO $$ BEGIN
  IF left(current_database(), 16) <> 'rev6_disposable_' THEN
    RAISE EXCEPTION 'refusing to run: database % is not rev6_disposable_*', current_database();
  END IF;
  IF inet_server_addr() IS NOT NULL AND NOT inet_server_addr() <<= '127.0.0.0/8'::inet
     AND inet_server_addr() <> '::1'::inet THEN
    RAISE EXCEPTION 'refusing to run: server address is not local';
  END IF;
END $$;

-- Synthetic fixtures (rolled back at end).
INSERT INTO auth.users (id, email, email_confirmed_at, raw_user_meta_data) VALUES
 ('00000000-0000-0000-0000-000000035a01','m4-owner@selftest.invalid',  now(), '{"full_name":"M4 Owner"}'),
 ('00000000-0000-0000-0000-000000035a02','m4-teacher@selftest.invalid',now(), '{"full_name":"M4 Teacher"}');
UPDATE public.users SET status='active'
 WHERE id IN ('00000000-0000-0000-0000-000000035a01','00000000-0000-0000-0000-000000035a02');
INSERT INTO public.organisations (id,name,type,slug) VALUES
 ('00000000-0000-0000-0000-000000035000','M4 Selftest A','school','m4-selftest-a'),
 ('00000000-0000-0000-0000-000000035001','M4 Selftest B','school','m4-selftest-b');
INSERT INTO public.organisation_memberships (organisation_id,user_id,role_id,status)
SELECT '00000000-0000-0000-0000-000000035000', m.u, r.id, 'active'
FROM (VALUES ('00000000-0000-0000-0000-000000035a01'::uuid,'org_owner'),
             ('00000000-0000-0000-0000-000000035a02'::uuid,'teacher')) m(u,code)
JOIN public.roles r ON r.code=m.code AND r.organisation_id IS NULL;
INSERT INTO public.ai_jobs (id,organisation_id,type,input,requested_by,status) VALUES
 ('00000000-0000-0000-0000-0000000350j1','00000000-0000-0000-0000-000000035000','generate_note','{}','00000000-0000-0000-0000-000000035a01','queued'),
 ('00000000-0000-0000-0000-0000000350j2','00000000-0000-0000-0000-000000035000','generate_note','{}','00000000-0000-0000-0000-000000035a01','queued');
