-- =====================================================================
-- Aibinu FlexiPrep — Migration 009: onboarding, privacy and operations (Revision 6)
-- Requires: 001–008. PostgreSQL 15+ / Supabase.
--
--  1. create_organisation — self-service signup (orgs have no INSERT policy, so this is the only way)
--  2. Invitations         — invite_member() / accept_invitation(), single-use hashed tokens
--  3. anonymise_student() — right-to-erasure support (keeps results and finance records, removes identity)
--  4. Privilege reconciliation — the explicit anon / authenticated / service_role matrix
--
-- Revision 6: transactional (M5); migration ledger moved to 001; extensions.citext qualified and
-- email comparisons made explicit (H5); invitation e-mail binding cannot be skipped by accounts
-- without an e-mail (M1); only owners invite owners (C4); the blanket
-- "REVOKE ALL ... FROM authenticated" that locked the application out (C2) is replaced by an
-- explicit, verified privilege matrix (C3).
-- =====================================================================
BEGIN;
SELECT public.migration_begin('009', '008');

-- 1. Create an organisation (the caller becomes its owner) ---------------
CREATE OR REPLACE FUNCTION create_organisation(p_name text, p_slug text, p_type org_type DEFAULT 'school',
                                               p_country text DEFAULT NULL)
RETURNS uuid AS $$
DECLARE
  v_user  uuid := current_user_id();
  v_org   uuid;
  v_owner uuid;
BEGIN
  IF v_user IS NULL OR NOT EXISTS (SELECT 1 FROM users WHERE id = v_user AND status = 'active' AND deleted_at IS NULL) THEN
    RAISE EXCEPTION 'Sign in first';
  END IF;
  IF length(btrim(COALESCE(p_name, ''))) < 2 THEN RAISE EXCEPTION 'Organisation name is too short'; END IF;
  IF p_type NOT IN ('school', 'individual') THEN
    RAISE EXCEPTION 'Self-service signup is for schools and individuals';
  END IF;
  -- Cheap abuse guard: one user may own at most 5 organisations created in the last day.
  IF (SELECT count(*) FROM audit_events WHERE actor_user_id = v_user AND action = 'organisation.created'
        AND occurred_at > now() - interval '1 day') >= 5 THEN
    RAISE EXCEPTION 'Too many organisations created recently; try again later';
  END IF;

  INSERT INTO organisations (name, type, slug, country) VALUES (btrim(p_name), p_type, lower(p_slug), COALESCE(p_country, 'NG'))
  RETURNING id INTO v_org;
  SELECT id INTO v_owner FROM roles WHERE code = 'org_owner' AND organisation_id IS NULL;
  INSERT INTO organisation_memberships (organisation_id, user_id, role_id, status)
  VALUES (v_org, v_user, v_owner, 'active');
  INSERT INTO audit_events (organisation_id, actor_user_id, action, entity_type, entity_id, source)
  VALUES (v_org, v_user, 'organisation.created', 'organisation', v_org::text, 'create_organisation');
  RETURN v_org;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public, pg_temp;

-- 2. Invitations -----------------------------------------------------------
CREATE TABLE membership_invitations (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organisation_id uuid NOT NULL REFERENCES organisations(id),
  email           extensions.citext NOT NULL,
  role_id         uuid NOT NULL REFERENCES roles(id),
  token_hash      bytea NOT NULL UNIQUE,                  -- sha256 of the token; the token itself is never stored
  invited_by      uuid NOT NULL REFERENCES users(id),
  expires_at      timestamptz NOT NULL DEFAULT now() + interval '7 days',
  accepted_at     timestamptz,
  revoked_at      timestamptz,
  created_at      timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX uq_invitation_open ON membership_invitations (organisation_id, email)
  WHERE accepted_at IS NULL AND revoked_at IS NULL;
CREATE INDEX idx_invitations_role ON membership_invitations (role_id);
CREATE INDEX idx_invitations_inviter ON membership_invitations (invited_by);

ALTER TABLE membership_invitations ENABLE ROW LEVEL SECURITY;
-- Clients may see who was invited, never the token hash.
GRANT SELECT (id, organisation_id, email, role_id, invited_by, expires_at, accepted_at, revoked_at, created_at)
  ON membership_invitations TO authenticated;
CREATE POLICY invitations_read ON membership_invitations FOR SELECT TO authenticated
  USING (organisation_id = (SELECT current_org_id()) AND (SELECT has_permission('membership.manage')));

-- Returns the one-time token. Your backend emails it inside a link; it cannot be recovered later.
CREATE OR REPLACE FUNCTION invite_member(p_email text, p_role_code text) RETURNS text AS $$
DECLARE
  v_role  roles%ROWTYPE;
  v_org   uuid := current_org_id();
  v_email text := lower(btrim(COALESCE(p_email, '')));
  v_token text := replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', '');
BEGIN
  IF NOT has_permission('membership.manage') THEN RAISE EXCEPTION 'Permission denied: membership.manage required'; END IF;
  IF v_email !~* '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$' THEN RAISE EXCEPTION 'A valid e-mail address is required'; END IF;
  SELECT * INTO v_role FROM roles
  WHERE code = p_role_code AND scope = 'organisation' AND (organisation_id IS NULL OR organisation_id = v_org)
  ORDER BY organisation_id NULLS LAST LIMIT 1;
  IF NOT FOUND THEN RAISE EXCEPTION 'Unknown role'; END IF;
  -- Owners are invited only by owners (or a platform administrator).
  IF v_role.code = 'org_owner' THEN
    PERFORM assert_owner_authority();
  END IF;
  -- Nobody can invite someone to a role more powerful than their own.
  IF NOT role_within_caller_ceiling(v_role.id) THEN
    RAISE EXCEPTION 'You cannot invite someone to a role with permissions you do not hold';
  END IF;
  UPDATE membership_invitations SET revoked_at = now()
  WHERE organisation_id = v_org AND lower(email::text) = v_email AND accepted_at IS NULL AND revoked_at IS NULL;
  INSERT INTO membership_invitations (organisation_id, email, role_id, token_hash, invited_by)
  VALUES (v_org, v_email::extensions.citext, v_role.id, sha256(convert_to(v_token, 'UTF8')), current_user_id());
  INSERT INTO audit_events (organisation_id, actor_user_id, action, entity_type, entity_id, after_state, source)
  VALUES (v_org, current_user_id(), 'membership.invited', 'invitation', v_email,
          jsonb_build_object('role', p_role_code), 'invite_member');
  RETURN v_token;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public, pg_temp;

-- The signed-in user accepts. Their account e-mail must match the invited e-mail; an account with
-- no e-mail (phone-only) can never accept an e-mail invitation (Revision 6, M1).
CREATE OR REPLACE FUNCTION accept_invitation(p_token text) RETURNS uuid AS $$
DECLARE
  inv membership_invitations%ROWTYPE;
  u   users%ROWTYPE;
BEGIN
  SELECT * INTO u FROM users WHERE id = current_user_id() AND status = 'active' AND deleted_at IS NULL;
  IF NOT FOUND THEN RAISE EXCEPTION 'Sign in first'; END IF;
  SELECT * INTO inv FROM membership_invitations
  WHERE token_hash = sha256(convert_to(COALESCE(p_token, ''), 'UTF8')) AND accepted_at IS NULL AND revoked_at IS NULL
    AND expires_at > now()
  FOR UPDATE;
  IF NOT FOUND
     OR u.email IS NULL
     OR lower(inv.email::text) IS DISTINCT FROM lower(u.email::text) THEN
    RAISE EXCEPTION 'This invitation is invalid or has expired';
  END IF;
  INSERT INTO organisation_memberships (organisation_id, user_id, role_id, status, invited_by)
  VALUES (inv.organisation_id, u.id, inv.role_id, 'active', inv.invited_by)
  ON CONFLICT (organisation_id, user_id, role_id) DO UPDATE SET status = 'active';
  UPDATE membership_invitations SET accepted_at = now() WHERE id = inv.id;
  INSERT INTO audit_events (organisation_id, actor_user_id, action, entity_type, entity_id, source)
  VALUES (inv.organisation_id, u.id, 'membership.accepted', 'invitation', inv.id::text, 'accept_invitation');
  RETURN inv.organisation_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public, pg_temp;

-- 3. Privacy: anonymise a student -------------------------------------------
-- Removes identity but keeps scores, invoices and ledger entries (the school's records stay intact).
CREATE OR REPLACE FUNCTION anonymise_student(p_student_id uuid) RETURNS void AS $$
DECLARE
  s students%ROWTYPE;
BEGIN
  IF NOT has_permission('student.manage') THEN RAISE EXCEPTION 'Permission denied: student.manage required'; END IF;
  SELECT * INTO s FROM students WHERE id = p_student_id AND organisation_id = current_org_id() FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Student not found'; END IF;
  UPDATE students
  SET full_name = 'Anonymised student', email = NULL, phone = NULL, date_of_birth = NULL,
      admission_no = NULL, user_id = NULL, status = 'inactive', deleted_at = COALESCE(deleted_at, now())
  WHERE id = s.id;
  UPDATE customer_payment_attempts SET payer_email = NULL WHERE student_id = s.id;
  INSERT INTO audit_events (organisation_id, actor_user_id, action, entity_type, entity_id, source)
  VALUES (current_org_id(), current_user_id(), 'student.anonymised', 'student', s.id::text, 'anonymise_student');
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public, pg_temp;

GRANT EXECUTE ON FUNCTION create_organisation(text, text, org_type, text), invite_member(text, text),
                          accept_invitation(text), anonymise_student(uuid) TO authenticated;

-- 4. Privilege reconciliation (Revision 6, C2/C3/M6) ----------------------------
-- Final matrix (verified by security_verify() in migration 010):
--   anon          : USAGE on schemas public/extensions only. Nothing else.
--   authenticated : only the explicit table/column grants made in 001-009 (all RLS-protected) and
--                   EXECUTE on the client function allow-list in security_expected_client_functions().
--                   Never TRUNCATE / REFERENCES / TRIGGER.
--   service_role  : trusted backend: SELECT/INSERT/UPDATE/DELETE on every public table, USAGE on
--                   sequences, EXECUTE on every public function. Never TRUNCATE.
--   postgres      : owner of every object; runs migrations and pg_cron.
REVOKE ALL ON ALL TABLES    IN SCHEMA public FROM anon, PUBLIC;
REVOKE ALL ON ALL SEQUENCES IN SCHEMA public FROM anon, authenticated, PUBLIC;
REVOKE ALL ON ALL FUNCTIONS IN SCHEMA public FROM anon, PUBLIC;
REVOKE TRUNCATE, REFERENCES, TRIGGER ON ALL TABLES IN SCHEMA public FROM authenticated;

GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO service_role;
REVOKE TRUNCATE, REFERENCES, TRIGGER ON ALL TABLES IN SCHEMA public FROM service_role;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO service_role;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA public TO service_role;

INSERT INTO public.schema_migrations (version, description) VALUES ('009', 'onboarding, privacy and operations (rev 6)');

COMMIT;
