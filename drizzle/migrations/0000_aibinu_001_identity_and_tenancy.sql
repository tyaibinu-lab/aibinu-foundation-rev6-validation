
-- =====================================================================
-- Aibinu FlexiPrep: Migration 001 (Supabase Native — Revision 6)
-- Identity, Organisations, Memberships, RBAC, Row-Level Security, Audit
-- Target: PostgreSQL 15+ / Supabase
-- Target Database Reference: rsjwiaiyppiqrprfcqsr
-- Run as: Database Owner / postgres (Migration pipeline)
--
-- STATUS: REVISION 6 CANDIDATE — validated on a disposable PostgreSQL 16 database only.
--         Apply to production only after a Supabase branch / staging run (see README).
--
-- Revision 6 changes in this file: neutralised Supabase default privileges (C3), schema
-- hardening, migration ledger (M5), single permission catalogue (C1/C5), role ceilings and
-- ownership functions (C4), race-safe last-owner guard (H1), suspended-user context (H2),
-- provisioning normalisation (H3), audit actor/redaction (M2/M3), no app.current_org (M4).
-- =====================================================================

BEGIN;

-- ---------------------------------------------------------------------
-- 00. Privilege baseline (Revision 6, C3/M6)
-- Supabase grants ALL on every new table/function/sequence in public to anon and
-- authenticated by default. Neutralise that BEFORE creating anything, so the explicit
-- GRANT statements in 001-010 are the complete privilege model.
-- ---------------------------------------------------------------------
ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON TABLES    FROM anon, authenticated;
ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON SEQUENCES FROM anon, authenticated;
ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON FUNCTIONS FROM anon, authenticated;
-- PostgreSQL itself grants EXECUTE on new functions to PUBLIC; that default is global.
ALTER DEFAULT PRIVILEGES REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC;
-- The trusted backend never needs TRUNCATE.
ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE TRUNCATE ON TABLES FROM service_role;
-- Nobody but the migration owner may create objects in public (blocks search_path overload attacks).
REVOKE CREATE ON SCHEMA public FROM PUBLIC;
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN EXECUTE 'REVOKE CREATE ON SCHEMA public FROM anon'; END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN EXECUTE 'REVOKE CREATE ON SCHEMA public FROM authenticated'; END IF;
END $$;

-- ---------------------------------------------------------------------
-- 01. Migration ledger (Revision 6, M5): every migration records itself and refuses
-- to run twice or out of order.
-- ---------------------------------------------------------------------
CREATE TABLE public.schema_migrations (
  version     text PRIMARY KEY,
  description text NOT NULL,
  applied_at  timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.schema_migrations ENABLE ROW LEVEL SECURITY;   -- no policies: backend/owner only

CREATE OR REPLACE FUNCTION public.migration_begin(p_version text, p_requires text)
RETURNS void AS $$
BEGIN
  IF EXISTS (SELECT 1 FROM public.schema_migrations WHERE version = p_version) THEN
    RAISE EXCEPTION 'Migration % is already applied', p_version;
  END IF;
  IF p_requires IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.schema_migrations WHERE version = p_requires) THEN
    RAISE EXCEPTION 'Migration % requires migration % first', p_version, p_requires;
  END IF;
END;
$$ LANGUAGE plpgsql SET search_path = pg_catalog, public, pg_temp;

-- ---------------------------------------------------------------------
-- 0. Extensions
-- ---------------------------------------------------------------------
-- Install citext in the dedicated 'extensions' schema per Supabase standard
CREATE EXTENSION IF NOT EXISTS citext WITH SCHEMA extensions;

-- ---------------------------------------------------------------------
-- 1. Enums
-- ---------------------------------------------------------------------
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'user_status') THEN
    CREATE TYPE user_status AS ENUM ('invited', 'active', 'suspended', 'deleted');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'org_type') THEN
    CREATE TYPE org_type AS ENUM ('school', 'individual', 'partner');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'org_status') THEN
    CREATE TYPE org_status AS ENUM ('active', 'suspended', 'closed');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'membership_status') THEN
    CREATE TYPE membership_status AS ENUM ('invited', 'active', 'suspended', 'removed');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'role_scope') THEN
    CREATE TYPE role_scope AS ENUM ('platform', 'organisation');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'audit_actor_type') THEN
    CREATE TYPE audit_actor_type AS ENUM ('user', 'service_role', 'webhook', 'worker', 'system');
  END IF;
END $$;

-- ---------------------------------------------------------------------
-- 2. Core Context & Helper Functions
-- ---------------------------------------------------------------------

-- Trigger helper: Keep updated_at fresh
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS trigger AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = pg_catalog, public, pg_temp;

-- Current user identity:
-- Auth-only primitive. Cryptographically extracted strictly from Supabase Auth JWT.
-- No session variable fallback or impersonation permitted.
CREATE OR REPLACE FUNCTION public.current_user_id()
RETURNS uuid AS $$
  SELECT auth.uid();
$$ LANGUAGE sql STABLE SET search_path = pg_catalog, public, pg_temp;

-- Current organisation context:
-- Treats all incoming client hints (PostgREST header, JWT claim) as UNTRUSTED.
-- Validates that current_user_id() is an ACTIVE, non-deleted user who is either a platform
-- admin or holds an active membership in the active organisation. Returns NULL otherwise.
-- Revision 6: no session-variable (app.current_org) input (M4); user status enforced (H2).
CREATE OR REPLACE FUNCTION public.current_org_id()
RETURNS uuid AS $$
DECLARE
  v_user_id    uuid;
  v_raw_org    text;
  v_req_org    uuid;
  v_is_admin   boolean;
BEGIN
  v_user_id := public.current_user_id();
  IF v_user_id IS NULL THEN
    RETURN NULL;
  END IF;

  -- 1. PostgREST HTTP header: x-organisation-id
  BEGIN
    v_raw_org := (current_setting('request.headers', true)::jsonb ->> 'x-organisation-id');
  EXCEPTION WHEN OTHERS THEN
    v_raw_org := NULL;
  END;

  -- 2. JWT app_metadata claim fallback
  IF v_raw_org IS NULL OR v_raw_org = '' THEN
    BEGIN
      v_raw_org := (current_setting('request.jwt.claims', true)::jsonb -> 'app_metadata' ->> 'organisation_id');
    EXCEPTION WHEN OTHERS THEN
      v_raw_org := NULL;
    END;
  END IF;

  IF v_raw_org IS NULL OR v_raw_org = '' THEN
    RETURN NULL;
  END IF;

  BEGIN
    v_req_org := v_raw_org::uuid;
  EXCEPTION WHEN OTHERS THEN
    RETURN NULL;
  END;

  -- The user must exist, be active and not deleted (H2).
  SELECT u.is_platform_admin INTO v_is_admin
  FROM public.users u
  WHERE u.id = v_user_id AND u.status = 'active' AND u.deleted_at IS NULL;
  IF NOT FOUND THEN
    RETURN NULL;
  END IF;

  IF v_is_admin IS TRUE THEN
    IF EXISTS (
      SELECT 1 FROM public.organisations o
      WHERE o.id = v_req_org AND o.deleted_at IS NULL
    ) THEN
      RETURN v_req_org;   -- platform admins may act in suspended organisations (support)
    END IF;
    RETURN NULL;
  END IF;

  -- Verify tenant membership authorization
  IF EXISTS (
    SELECT 1
    FROM public.organisation_memberships m
    JOIN public.organisations o ON o.id = m.organisation_id
    WHERE m.user_id = v_user_id
      AND m.organisation_id = v_req_org
      AND m.status = 'active'
      AND o.status = 'active'
      AND o.deleted_at IS NULL
  ) THEN
    RETURN v_req_org;
  END IF;

  RETURN NULL;
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = pg_catalog, public, pg_temp;

-- ---------------------------------------------------------------------
-- 3. Users Table (Application Profile referencing auth.users)
-- ---------------------------------------------------------------------
-- Note: Authentication credentials, passwords, OTPs, and sessions are managed
-- authoritatively by Supabase Auth (auth.users).
CREATE TABLE public.users (
  id                 uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email              extensions.citext UNIQUE,
  phone              text UNIQUE,
  full_name          text NOT NULL,
  status             user_status NOT NULL DEFAULT 'invited',
  is_platform_admin  boolean NOT NULL DEFAULT false,
  email_verified_at  timestamptz,
  phone_verified_at  timestamptz,
  last_login_at      timestamptz,
  created_at         timestamptz NOT NULL DEFAULT now(),
  updated_at         timestamptz NOT NULL DEFAULT now(),
  deleted_at         timestamptz,
  CONSTRAINT users_contact_required CHECK (email IS NOT NULL OR phone IS NOT NULL),
  CONSTRAINT users_email_format CHECK (email IS NULL OR email::text ~* '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$'),
  CONSTRAINT users_phone_e164 CHECK (phone IS NULL OR phone ~ '^\+[1-9][0-9]{7,14}$')
);

CREATE TRIGGER trg_users_updated
  BEFORE UPDATE ON public.users
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ---------------------------------------------------------------------
-- 4. Organisations, Memberships, Settings
-- ---------------------------------------------------------------------
CREATE TABLE public.organisations (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name        text NOT NULL,
  type        org_type NOT NULL,
  slug        extensions.citext NOT NULL UNIQUE,
  country     char(2) NOT NULL DEFAULT 'NG',
  status      org_status NOT NULL DEFAULT 'active',
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  deleted_at  timestamptz,
  CONSTRAINT organisations_slug_format CHECK (slug::text ~ '^[a-z0-9][a-z0-9-]{1,48}[a-z0-9]$')
);

CREATE TRIGGER trg_organisations_updated
  BEFORE UPDATE ON public.organisations
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TABLE public.roles (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organisation_id uuid REFERENCES public.organisations(id) ON DELETE CASCADE, -- NULL for system roles
  code            text NOT NULL,
  name            text NOT NULL,
  description     text,
  is_system       boolean NOT NULL DEFAULT false,
  scope           role_scope NOT NULL DEFAULT 'organisation',
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  UNIQUE (organisation_id, code),
  CONSTRAINT roles_scope_consistency CHECK (
    (scope = 'platform' AND organisation_id IS NULL)
    OR (scope = 'organisation')
  ),
  CONSTRAINT roles_system_consistency CHECK (
    (is_system = true AND organisation_id IS NULL)
    OR (is_system = false AND organisation_id IS NOT NULL)
  )
);

CREATE TRIGGER trg_roles_updated
  BEFORE UPDATE ON public.roles
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- PostgreSQL UNIQUE permits multiple NULL organisation_id values; enforce one copy
-- of each system role code explicitly.
CREATE UNIQUE INDEX roles_system_code_uq
  ON public.roles (code)
  WHERE organisation_id IS NULL;

CREATE TABLE public.permissions (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code         text NOT NULL UNIQUE,             -- e.g. 'exam.create'
  description  text
);

CREATE TABLE public.role_permissions (
  role_id        uuid NOT NULL REFERENCES public.roles(id) ON DELETE CASCADE,
  permission_id  uuid NOT NULL REFERENCES public.permissions(id) ON DELETE CASCADE,
  PRIMARY KEY (role_id, permission_id)
);

CREATE TABLE public.organisation_memberships (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organisation_id uuid NOT NULL REFERENCES public.organisations(id) ON DELETE CASCADE,
  user_id         uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  role_id         uuid NOT NULL REFERENCES public.roles(id),
  status          membership_status NOT NULL DEFAULT 'invited',
  invited_by      uuid REFERENCES public.users(id),
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  UNIQUE (organisation_id, user_id, role_id)
);

CREATE INDEX idx_memberships_user ON public.organisation_memberships(user_id);
CREATE INDEX idx_memberships_org  ON public.organisation_memberships(organisation_id);

CREATE TRIGGER trg_memberships_updated
  BEFORE UPDATE ON public.organisation_memberships
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TABLE public.organisation_settings (
  organisation_id uuid NOT NULL REFERENCES public.organisations(id) ON DELETE CASCADE,
  key             text NOT NULL,
  value           jsonb NOT NULL,
  updated_by      uuid REFERENCES public.users(id),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (organisation_id, key),
  -- Revision 6 (M2): settings are readable by every member; secrets belong in Supabase Vault
  -- or private.payment_provider_secrets, never here.
  CONSTRAINT settings_no_secret_keys CHECK (key !~* '(secret|passw|token|api[_-]?key|private[_-]?key|signing)'),
  CONSTRAINT settings_no_secret_values CHECK (value::text !~ '"(sk|rk)_(live|test)_')
);

CREATE TRIGGER trg_org_settings_updated
  BEFORE UPDATE ON public.organisation_settings
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ---------------------------------------------------------------------
-- 5. Audit Events (Append-Only Trusted Sink)
-- ---------------------------------------------------------------------
CREATE TABLE public.audit_events (
  id              bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  organisation_id uuid REFERENCES public.organisations(id),   -- NULL for platform events
  actor_user_id   uuid REFERENCES public.users(id),
  action          text NOT NULL,                              -- e.g. 'membership.role_changed'
  entity_type     text NOT NULL,
  entity_id       text,
  before_state    jsonb,
  after_state     jsonb,
  ip_address      inet,
  occurred_at     timestamptz NOT NULL DEFAULT now(),
  -- Revision 6 (M3): every row says who/what acted. actor_user_id is NULL when no human acted.
  actor_type      audit_actor_type NOT NULL DEFAULT 'system',
  actor_role      text,                                       -- database role of the request (authenticated, service_role, ...)
  source          text,                                       -- e.g. 'trigger', 'webhook:paystack', 'ai-job-worker'
  CONSTRAINT audit_user_actor_has_id CHECK (actor_type <> 'user' OR actor_user_id IS NOT NULL)
);

CREATE INDEX idx_audit_org_time ON public.audit_events(organisation_id, occurred_at DESC);
CREATE INDEX idx_audit_entity   ON public.audit_events(entity_type, entity_id);

-- Enforce strict append-only immutability
CREATE OR REPLACE FUNCTION public.block_audit_changes()
RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'audit_events is append-only: modifications and truncations are forbidden';
END;
$$ LANGUAGE plpgsql SET search_path = pg_catalog, public, pg_temp;

CREATE TRIGGER trg_audit_no_update_delete
  BEFORE UPDATE OR DELETE ON public.audit_events
  FOR EACH ROW EXECUTE FUNCTION public.block_audit_changes();

CREATE TRIGGER trg_audit_no_truncate
  BEFORE TRUNCATE ON public.audit_events
  FOR EACH STATEMENT EXECUTE FUNCTION public.block_audit_changes();

-- Stamp the actor on every audit row (Revision 6, M3). Whatever the inserter supplied:
--  * a signed-in request (auth.uid() present) is always recorded as that user, type 'user';
--  * otherwise the row may not claim a human actor; service_role defaults to 'service_role',
--    migrations / pg_cron (no role) to 'system'. Explicit 'webhook' / 'worker' are kept.
CREATE OR REPLACE FUNCTION public.audit_stamp_actor()
RETURNS trigger AS $$
DECLARE
  v_uid  uuid := auth.uid();
  v_role text := NULLIF(current_setting('role', true), 'none');
BEGIN
  NEW.actor_role := COALESCE(v_role, session_user::text);
  IF v_uid IS NOT NULL THEN
    NEW.actor_user_id := v_uid;
    NEW.actor_type    := 'user';
  ELSE
    NEW.actor_user_id := NULL;
    IF NEW.actor_type IS NULL OR NEW.actor_type IN ('user', 'system') THEN
      NEW.actor_type := CASE WHEN v_role = 'service_role' THEN 'service_role' ELSE 'system' END::audit_actor_type;
    END IF;
  END IF;
  NEW.occurred_at := now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = pg_catalog, public, pg_temp;

CREATE TRIGGER trg_audit_stamp_actor
  BEFORE INSERT ON public.audit_events
  FOR EACH ROW EXECUTE FUNCTION public.audit_stamp_actor();

-- ---------------------------------------------------------------------
-- 6. RBAC & Permission Evaluation Helper
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.has_permission(perm text)
RETURNS boolean AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.users u
    WHERE u.id = public.current_user_id()
      AND u.is_platform_admin
      AND u.status = 'active'
      AND u.deleted_at IS NULL
  )
  OR EXISTS (
    SELECT 1
    FROM public.organisation_memberships m
    JOIN public.users u             ON u.id = m.user_id AND u.status = 'active' AND u.deleted_at IS NULL
    JOIN public.organisations o     ON o.id = m.organisation_id AND o.status = 'active' AND o.deleted_at IS NULL
    JOIN public.role_permissions rp ON rp.role_id = m.role_id
    JOIN public.permissions p       ON p.id = rp.permission_id
    WHERE m.user_id = public.current_user_id()
      AND m.organisation_id = public.current_org_id()
      AND m.status = 'active'
      AND p.code = perm
  );
$$ LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog, public, pg_temp;

-- ---------------------------------------------------------------------
-- 7. Integrity Guards & Audit Automation
-- ---------------------------------------------------------------------

-- Membership role guard: Ensures role belongs to the organisation or is system-wide org role
CREATE OR REPLACE FUNCTION public.membership_role_guard()
RETURNS trigger AS $$
DECLARE
  r public.roles%ROWTYPE;
BEGIN
  SELECT * INTO r FROM public.roles WHERE id = NEW.role_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Role not found';
  END IF;
  IF r.scope <> 'organisation' THEN
    RAISE EXCEPTION 'Platform roles cannot be assigned to an organisation member';
  END IF;
  IF r.organisation_id IS NOT NULL AND r.organisation_id <> NEW.organisation_id THEN
    RAISE EXCEPTION 'That role belongs to a different organisation';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public, pg_temp;

CREATE TRIGGER trg_membership_role_guard
  BEFORE INSERT OR UPDATE OF role_id ON public.organisation_memberships
  FOR EACH ROW EXECUTE FUNCTION public.membership_role_guard();

-- Role ceiling (Revision 6, C4): true when the caller holds every permission the role carries.
CREATE OR REPLACE FUNCTION public.role_within_caller_ceiling(p_role_id uuid)
RETURNS boolean AS $$
  SELECT NOT EXISTS (
    SELECT 1 FROM public.role_permissions rp
    JOIN public.permissions p ON p.id = rp.permission_id
    WHERE rp.role_id = p_role_id
      AND NOT public.has_permission(p.code)
  );
$$ LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog, public, pg_temp;

-- Direct client writes to memberships (Revision 6, C4). Fires only when the statement runs as
-- a client role (anon/authenticated); trusted SECURITY DEFINER functions and service_role are
-- not affected (they run as another role). Rules for clients:
--  * nobody, not even a platform admin, creates/changes/removes an org_owner membership directly:
--    ownership moves only through grant_/revoke_/transfer_organisation_ownership();
--  * a caller may only assign a role within their own permission ceiling;
--  * a caller may only change or remove a membership whose current role is within their ceiling.
CREATE OR REPLACE FUNCTION public.membership_client_guard()
RETURNS trigger AS $$
DECLARE
  v_owner_role uuid;
BEGIN
  IF public.current_user_id() IS NULL THEN
    RAISE EXCEPTION 'Sign in first';
  END IF;
  SELECT id INTO v_owner_role FROM public.roles WHERE code = 'org_owner' AND organisation_id IS NULL;

  IF TG_OP IN ('UPDATE', 'DELETE') THEN
    IF OLD.role_id = v_owner_role THEN
      RAISE EXCEPTION 'Owner memberships change only through the ownership functions';
    END IF;
    IF NOT public.role_within_caller_ceiling(OLD.role_id) THEN
      RAISE EXCEPTION 'You cannot change a member whose role has permissions you do not hold';
    END IF;
  END IF;
  IF TG_OP IN ('INSERT', 'UPDATE') THEN
    IF NEW.role_id = v_owner_role THEN
      RAISE EXCEPTION 'Owner memberships change only through the ownership functions';
    END IF;
    IF NOT public.role_within_caller_ceiling(NEW.role_id) THEN
      RAISE EXCEPTION 'You cannot assign a role with permissions you do not hold';
    END IF;
  END IF;
  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public, pg_temp;

-- Named trg_00_* so it fires before the last-owner guard (triggers fire in name order).
CREATE TRIGGER trg_00_membership_client_guard
  BEFORE INSERT OR UPDATE OR DELETE ON public.organisation_memberships
  FOR EACH ROW WHEN (current_user IN ('anon', 'authenticated'))
  EXECUTE FUNCTION public.membership_client_guard();

-- Tenant roles may not reuse a system role code (Revision 6, L3).
CREATE OR REPLACE FUNCTION public.role_code_guard()
RETURNS trigger AS $$
BEGIN
  IF NEW.organisation_id IS NOT NULL AND EXISTS (
       SELECT 1 FROM public.roles r WHERE r.organisation_id IS NULL AND r.code = NEW.code) THEN
    RAISE EXCEPTION 'Role code % is reserved for a system role', NEW.code;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public, pg_temp;

CREATE TRIGGER trg_role_code_guard
  BEFORE INSERT OR UPDATE OF code, organisation_id ON public.roles
  FOR EACH ROW EXECUTE FUNCTION public.role_code_guard();

-- Last owner guard: Prevents removing, deactivating, or demoting the last active owner.
-- Revision 6 (H1): race-safe under READ COMMITTED, REPEATABLE READ and SERIALIZABLE.
--  1. Lock the organisation row (serialises owner changes per organisation).
--  2. Lock every OTHER active owner membership FOR UPDATE. Under READ COMMITTED a concurrent
--     demotion is re-checked against the committed row and drops out of the count; under
--     REPEATABLE READ / SERIALIZABLE locking a row a concurrent transaction changed raises a
--     serialization failure. Either way two transactions cannot both remove the last owners.
--  3. Count only owners whose user account is itself active (L2).
CREATE OR REPLACE FUNCTION public.last_owner_guard()
RETURNS trigger AS $$
DECLARE
  v_owner_role_id     uuid;
  v_remaining_owners  integer;
BEGIN
  SELECT id INTO v_owner_role_id
  FROM public.roles
  WHERE code = 'org_owner' AND organisation_id IS NULL;

  IF v_owner_role_id IS NOT NULL AND OLD.role_id = v_owner_role_id AND OLD.status = 'active'
     AND (TG_OP = 'DELETE' OR NEW.status <> 'active' OR NEW.role_id <> OLD.role_id
          OR NEW.organisation_id <> OLD.organisation_id OR NEW.user_id <> OLD.user_id) THEN

    PERFORM 1
    FROM public.organisations
    WHERE id = OLD.organisation_id AND deleted_at IS NULL
    FOR NO KEY UPDATE;

    IF EXISTS (SELECT 1 FROM public.organisations WHERE id = OLD.organisation_id AND deleted_at IS NULL) THEN
      SELECT COUNT(*) INTO v_remaining_owners
      FROM (
        SELECT m.id
        FROM public.organisation_memberships m
        JOIN public.users u ON u.id = m.user_id AND u.status = 'active' AND u.deleted_at IS NULL
        WHERE m.organisation_id = OLD.organisation_id
          AND m.role_id = v_owner_role_id
          AND m.status = 'active'
          AND m.id <> OLD.id
        FOR UPDATE OF m
      ) other_owners;

      IF v_remaining_owners = 0 THEN
        RAISE EXCEPTION 'An organisation must keep at least one active owner';
      END IF;
    END IF;
  END IF;

  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public, pg_temp;

CREATE TRIGGER trg_last_owner_guard
  BEFORE UPDATE OR DELETE ON public.organisation_memberships
  FOR EACH ROW EXECUTE FUNCTION public.last_owner_guard();

-- Redaction (Revision 6, M2): any key that looks like a credential is replaced, at any depth,
-- and any string value that looks like a provider secret key is replaced too.
CREATE OR REPLACE FUNCTION public.audit_redact(p jsonb)
RETURNS jsonb AS $$
DECLARE
  k text; v jsonb; out jsonb;
BEGIN
  IF p IS NULL THEN RETURN NULL; END IF;
  IF jsonb_typeof(p) = 'object' THEN
    out := '{}'::jsonb;
    FOR k, v IN SELECT * FROM jsonb_each(p) LOOP
      IF k ~* '(passw|secret|token|api[_-]?key|private[_-]?key|signature|signing|otp|pin_?code|cvv|card_?number|account_?number|bvn|^nin$|^sk$|^pk$|authorization|cookie)' THEN
        out := out || jsonb_build_object(k, '[REDACTED]');
      ELSE
        out := out || jsonb_build_object(k, public.audit_redact(v));
      END IF;
    END LOOP;
    RETURN out;
  ELSIF jsonb_typeof(p) = 'array' THEN
    RETURN COALESCE((SELECT jsonb_agg(public.audit_redact(e)) FROM jsonb_array_elements(p) e), '[]'::jsonb);
  ELSIF jsonb_typeof(p) = 'string' AND (p #>> '{}') ~ '^(sk|rk|pk)_(live|test)_' THEN
    RETURN to_jsonb('[REDACTED]'::text);
  END IF;
  RETURN p;
END;
$$ LANGUAGE plpgsql IMMUTABLE SET search_path = pg_catalog, public, pg_temp;

-- Row-level audit logging trigger function:
-- Serializes the affected administrative records into the audit log, after redaction.
-- Revision 6: fires for every actor (users, service_role, system); the actor is stamped
-- by trg_audit_stamp_actor on audit_events.
CREATE OR REPLACE FUNCTION public.audit_row_change()
RETURNS trigger AS $$
DECLARE
  v_old jsonb;
  v_new jsonb;
  v_row jsonb;
  v_org uuid;
  v_id  text;
BEGIN
  v_old := CASE WHEN TG_OP IN ('UPDATE', 'DELETE') THEN to_jsonb(OLD) END;
  v_new := CASE WHEN TG_OP IN ('INSERT', 'UPDATE') THEN to_jsonb(NEW) END;
  v_row := COALESCE(v_new, v_old);

  IF TG_TABLE_NAME = 'role_permissions' THEN
    SELECT r.organisation_id INTO v_org FROM public.roles r WHERE r.id = (v_row ->> 'role_id')::uuid;
    v_id := (v_row ->> 'role_id') || ':' || (v_row ->> 'permission_id');
  ELSIF TG_TABLE_NAME = 'organisation_settings' THEN
    v_org := (v_row ->> 'organisation_id')::uuid;
    v_id  := (v_row ->> 'organisation_id') || ':' || (v_row ->> 'key');
  ELSIF TG_TABLE_NAME = 'organisations' THEN
    v_org := (v_row ->> 'id')::uuid;
    v_id  := v_row ->> 'id';
  ELSIF TG_TABLE_NAME = 'users' THEN
    v_org := NULL;
    v_id  := v_row ->> 'id';
  ELSE
    v_org := NULLIF(v_row ->> 'organisation_id', '')::uuid;
    v_id  := v_row ->> 'id';
  END IF;

  INSERT INTO public.audit_events (
    organisation_id,
    actor_user_id,
    action,
    entity_type,
    entity_id,
    before_state,
    after_state,
    source
  ) VALUES (
    v_org,
    public.current_user_id(),
    lower(TG_OP) || '.' || TG_TABLE_NAME,
    TG_TABLE_NAME,
    v_id,
    public.audit_redact(v_old),
    public.audit_redact(v_new),
    'trigger'
  );

  RETURN NULL;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public, pg_temp;

CREATE TRIGGER trg_audit_memberships
  AFTER INSERT OR UPDATE OR DELETE ON public.organisation_memberships
  FOR EACH ROW EXECUTE FUNCTION public.audit_row_change();

CREATE TRIGGER trg_audit_roles
  AFTER INSERT OR UPDATE OR DELETE ON public.roles
  FOR EACH ROW EXECUTE FUNCTION public.audit_row_change();

CREATE TRIGGER trg_audit_role_permissions
  AFTER INSERT OR DELETE ON public.role_permissions
  FOR EACH ROW EXECUTE FUNCTION public.audit_row_change();

CREATE TRIGGER trg_audit_settings
  AFTER INSERT OR UPDATE OR DELETE ON public.organisation_settings
  FOR EACH ROW EXECUTE FUNCTION public.audit_row_change();

CREATE TRIGGER trg_audit_organisations
  AFTER UPDATE ON public.organisations
  FOR EACH ROW EXECUTE FUNCTION public.audit_row_change();

-- Account status and platform-admin changes are security events (Revision 6, M3).
CREATE TRIGGER trg_audit_users
  AFTER UPDATE OF status, is_platform_admin, deleted_at ON public.users
  FOR EACH ROW EXECUTE FUNCTION public.audit_row_change();

-- ---------------------------------------------------------------------
-- 8. Auth Provisioning & Sync Triggers (auth.users -> public.users)
-- ---------------------------------------------------------------------

-- Normalisation helpers (Revision 6, H3). Validation is NOT weakened: the users table CHECK
-- constraints still require a well-formed email and an E.164 phone; these helpers only map the
-- formats Supabase Auth stores (phone digits without '+', empty-string email) onto that form.
CREATE OR REPLACE FUNCTION public.normalise_auth_email(p_email text)
RETURNS extensions.citext AS $$
  SELECT NULLIF(lower(btrim(COALESCE(p_email, ''))), '')::extensions.citext;
$$ LANGUAGE sql IMMUTABLE SET search_path = pg_catalog, public, extensions, pg_temp;

CREATE OR REPLACE FUNCTION public.normalise_auth_phone(p_phone text)
RETURNS text AS $$
DECLARE
  v text := NULLIF(regexp_replace(btrim(COALESCE(p_phone, '')), '[[:space:]()-]', '', 'g'), '');
BEGIN
  IF v IS NULL THEN RETURN NULL; END IF;
  IF left(v, 1) <> '+' THEN v := '+' || v; END IF;
  RETURN v;
END;
$$ LANGUAGE plpgsql IMMUTABLE SET search_path = pg_catalog, public, pg_temp;

-- Provision (or refresh) the platform profile for one auth.users row.
-- Invariant: Sets status = 'active' (PLATFORM IDENTITY LOGIN-ELIGIBLE ONLY).
-- NEVER creates students, enrolments, roles, or organisation memberships.
-- Anonymous Supabase sign-ins (no email, no phone) get no profile and therefore no access.
CREATE OR REPLACE FUNCTION public.provision_public_user(p auth.users)
RETURNS void AS $$
DECLARE
  v_full_name text;
  v_email     extensions.citext := public.normalise_auth_email(p.email);
  v_phone     text := public.normalise_auth_phone(p.phone);
BEGIN
  IF COALESCE((to_jsonb(p) ->> 'is_anonymous')::boolean, false) OR (v_email IS NULL AND v_phone IS NULL) THEN
    RETURN;
  END IF;

  v_full_name := COALESCE(
    NULLIF(btrim(p.raw_user_meta_data ->> 'full_name'), ''),
    NULLIF(btrim(p.raw_user_meta_data ->> 'name'), ''),
    NULLIF(split_part(v_email::text, '@', 1), ''),
    'User'
  );

  INSERT INTO public.users (
    id, email, phone, full_name, status, is_platform_admin,
    email_verified_at, phone_verified_at, created_at, updated_at
  ) VALUES (
    p.id, v_email, v_phone, v_full_name,
    'active',          -- PLATFORM IDENTITY ACTIVE: eligible to authenticate; NOT a student record
    false,             -- Invariant: Platform admin is NEVER auto-assigned
    p.email_confirmed_at, p.phone_confirmed_at,
    COALESCE(p.created_at, now()), now()
  )
  ON CONFLICT (id) DO UPDATE SET
    email = EXCLUDED.email,
    phone = EXCLUDED.phone,
    email_verified_at = EXCLUDED.email_verified_at,
    phone_verified_at = EXCLUDED.phone_verified_at,
    updated_at = now();
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public, extensions, pg_temp;

CREATE OR REPLACE FUNCTION public.handle_new_auth_user()
RETURNS trigger AS $$
BEGIN
  PERFORM public.provision_public_user(NEW);
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public, extensions, pg_temp;

CREATE TRIGGER trg_on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_auth_user();

-- Trigger function: Syncs verified profile attributes from auth.users to public.users.
-- Revision 6: upsert, so an anonymous user who later adds an email/phone gets a profile.
CREATE OR REPLACE FUNCTION public.handle_auth_user_updated()
RETURNS trigger AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.users WHERE id = NEW.id) THEN
    PERFORM public.provision_public_user(NEW);
    RETURN NEW;
  END IF;
  UPDATE public.users
  SET
    email = public.normalise_auth_email(NEW.email),
    phone = public.normalise_auth_phone(NEW.phone),
    email_verified_at = NEW.email_confirmed_at,
    phone_verified_at = NEW.phone_confirmed_at,
    updated_at = now()
  WHERE id = NEW.id;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public, extensions, pg_temp;

CREATE TRIGGER trg_on_auth_user_updated
  AFTER UPDATE OF email, phone, email_confirmed_at, phone_confirmed_at ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_auth_user_updated();

-- ---------------------------------------------------------------------
-- 9. Role Grants & Least-Privilege Access Control
-- ---------------------------------------------------------------------
-- Architecture uses exclusively Supabase standard roles: anon, authenticated, service_role.
-- Legacy connection-pool roles are eliminated; Supabase standard roles are used.

-- Revision 6 privilege matrix for 001 (the default privileges were neutralised in section 00):
--   anon          : schema USAGE only. No table, sequence or function privileges.
--   authenticated : the explicit column/table grants below + EXECUTE on RLS helper predicates.
--                   Never TRUNCATE, never INSERT on audit_events/users/organisations/memberships.
--   service_role  : trusted backend; SELECT/INSERT/UPDATE/DELETE on every table (no TRUNCATE),
--                   EXECUTE on every function (reconciled again in migration 009).

-- Schema USAGE grants
GRANT USAGE ON SCHEMA public TO anon, authenticated, service_role;
GRANT USAGE ON SCHEMA extensions TO anon, authenticated, service_role;

-- Functions: nothing is executable by PUBLIC/anon; authenticated gets context helpers only.
REVOKE ALL ON ALL FUNCTIONS IN SCHEMA public FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.current_user_id() TO authenticated;
GRANT EXECUTE ON FUNCTION public.current_org_id() TO authenticated;
GRANT EXECUTE ON FUNCTION public.has_permission(text) TO authenticated;

-- service_role (trusted backend)
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO service_role;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO service_role;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA public TO service_role;

-- Least-Privilege Table Grants for 'authenticated':
-- 1. NO direct INSERT, UPDATE, DELETE, or TRUNCATE on audit_events for authenticated.
-- 2. Direct client UPDATE on public.users restricted to 'full_name' only.
-- 3. Clients CANNOT modify email, phone, status, verification dates, or is_platform_admin.
-- 4. Revision 6 (M8): no direct INSERT into organisation_memberships. Members join only through
--    create_organisation(), accept_invitation() or the trusted backend (consent required).
GRANT SELECT ON public.users, public.organisations, public.roles, public.permissions,
                public.role_permissions, public.organisation_memberships,
                public.organisation_settings, public.audit_events
             TO authenticated;

GRANT UPDATE (full_name) ON public.users TO authenticated;
GRANT UPDATE (name) ON public.organisations TO authenticated;
GRANT INSERT (organisation_id, code, name, description) ON public.roles TO authenticated;
GRANT DELETE ON public.roles TO authenticated;
GRANT UPDATE (name, description) ON public.roles TO authenticated;
GRANT INSERT, DELETE ON public.role_permissions TO authenticated;
GRANT DELETE ON public.organisation_memberships TO authenticated;
GRANT UPDATE (role_id, status) ON public.organisation_memberships TO authenticated;
GRANT INSERT (organisation_id, key, value, updated_by) ON public.organisation_settings TO authenticated;
GRANT DELETE ON public.organisation_settings TO authenticated;
GRANT UPDATE (value, updated_by, updated_at) ON public.organisation_settings TO authenticated;

-- ---------------------------------------------------------------------
-- 10. Row-Level Security (RLS) Policies
-- ---------------------------------------------------------------------

ALTER TABLE public.users                    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.organisations            ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.roles                    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.permissions              ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.role_permissions         ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.organisation_memberships ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.organisation_settings    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.audit_events             ENABLE ROW LEVEL SECURITY;

-- 10.x Security predicates used by RLS
-- These helpers are deliberately SECURITY DEFINER so their internal membership,
-- role, and user lookups are evaluated outside caller-facing RLS policies.
-- This prevents policy-to-policy recursion while keeping every predicate tied to
-- auth.uid() and validated tenant context.
CREATE OR REPLACE FUNCTION public.is_platform_admin()
RETURNS boolean AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.users u
    WHERE u.id = public.current_user_id()
      AND u.is_platform_admin = true
      AND u.status = 'active'
      AND u.deleted_at IS NULL
  );
$$ LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog, public, pg_temp;

CREATE OR REPLACE FUNCTION public.is_active_org_member(p_org_id uuid)
RETURNS boolean AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.organisation_memberships m
    JOIN public.organisations o ON o.id = m.organisation_id
    JOIN public.users u         ON u.id = m.user_id AND u.status = 'active' AND u.deleted_at IS NULL  -- H2
    WHERE m.user_id = public.current_user_id()
      AND m.organisation_id = p_org_id
      AND m.status = 'active'
      AND o.status = 'active'
      AND o.deleted_at IS NULL
  );
$$ LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog, public, pg_temp;

CREATE OR REPLACE FUNCTION public.can_read_user(p_user_id uuid)
RETURNS boolean AS $$
  SELECT p_user_id = public.current_user_id()
      OR public.is_platform_admin()
      OR EXISTS (
        SELECT 1
        FROM public.organisation_memberships target_m
        JOIN public.organisation_memberships caller_m
          ON caller_m.organisation_id = target_m.organisation_id
        JOIN public.organisations o ON o.id = target_m.organisation_id
        WHERE target_m.user_id = p_user_id
          AND caller_m.user_id = public.current_user_id()
          AND target_m.status = 'active'
          AND caller_m.status = 'active'
          AND o.status = 'active'
          AND o.deleted_at IS NULL
          AND target_m.organisation_id = public.current_org_id()
      );
$$ LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog, public, pg_temp;

CREATE OR REPLACE FUNCTION public.can_manage_organisation(p_org_id uuid)
RETURNS boolean AS $$
  SELECT public.is_platform_admin()
      OR (
        p_org_id = public.current_org_id()
        AND public.has_permission('organisation.manage')
      );
$$ LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog, public, pg_temp;

CREATE OR REPLACE FUNCTION public.can_read_membership(p_membership_org_id uuid, p_user_id uuid)
RETURNS boolean AS $$
  SELECT public.is_platform_admin()
      OR p_user_id = public.current_user_id()
      OR p_membership_org_id = public.current_org_id();
$$ LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog, public, pg_temp;

CREATE OR REPLACE FUNCTION public.can_manage_membership(p_org_id uuid)
RETURNS boolean AS $$
  SELECT public.is_platform_admin()
      OR (
        p_org_id = public.current_org_id()
        AND public.has_permission('membership.manage')
      );
$$ LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog, public, pg_temp;

CREATE OR REPLACE FUNCTION public.can_read_role(p_role_id uuid)
RETURNS boolean AS $$
  SELECT public.is_platform_admin()
      OR EXISTS (
        SELECT 1 FROM public.roles r
        WHERE r.id = p_role_id
          AND (
            r.organisation_id IS NULL
            OR r.organisation_id = public.current_org_id()
          )
      );
$$ LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog, public, pg_temp;

CREATE OR REPLACE FUNCTION public.can_manage_role(p_role_id uuid, p_org_id uuid, p_is_system boolean)
RETURNS boolean AS $$
  SELECT public.is_platform_admin()
      OR (
        p_org_id = public.current_org_id()
        AND p_is_system = false
        AND public.has_permission('role.manage')
        AND EXISTS (
          SELECT 1 FROM public.roles r
          WHERE r.id = p_role_id
            AND r.organisation_id = p_org_id
            AND r.is_system = false
        )
      );
$$ LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog, public, pg_temp;

CREATE OR REPLACE FUNCTION public.can_read_role_permissions(p_role_id uuid)
RETURNS boolean AS $$
  SELECT public.is_platform_admin()
      OR EXISTS (
        SELECT 1 FROM public.roles r
        WHERE r.id = p_role_id
          AND (
            r.organisation_id IS NULL
            OR r.organisation_id = public.current_org_id()
          )
      );
$$ LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog, public, pg_temp;

CREATE OR REPLACE FUNCTION public.can_manage_role_permissions(p_role_id uuid)
RETURNS boolean AS $$
  SELECT public.is_platform_admin()
      OR (
        public.has_permission('role.manage')
        AND EXISTS (
          SELECT 1 FROM public.roles r
          WHERE r.id = p_role_id
            AND r.organisation_id = public.current_org_id()
            AND r.is_system = false
        )
      );
$$ LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog, public, pg_temp;

CREATE OR REPLACE FUNCTION public.can_read_settings(p_org_id uuid)
RETURNS boolean AS $$
  SELECT public.is_platform_admin() OR p_org_id = public.current_org_id();
$$ LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog, public, pg_temp;

CREATE OR REPLACE FUNCTION public.can_manage_settings(p_org_id uuid)
RETURNS boolean AS $$
  SELECT public.is_platform_admin()
      OR (
        p_org_id = public.current_org_id()
        AND public.has_permission('settings.manage')
      );
$$ LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog, public, pg_temp;

CREATE OR REPLACE FUNCTION public.can_read_audit(p_org_id uuid)
RETURNS boolean AS $$
  SELECT public.is_platform_admin()
      OR (
        p_org_id = public.current_org_id()
        AND public.has_permission('audit.read')
      );
$$ LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog, public, pg_temp;

REVOKE ALL ON FUNCTION public.is_platform_admin() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.is_active_org_member(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.can_read_user(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.can_manage_organisation(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.can_read_membership(uuid, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.can_manage_membership(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.can_read_role(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.can_manage_role(uuid, uuid, boolean) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.can_read_role_permissions(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.can_manage_role_permissions(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.can_read_settings(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.can_manage_settings(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.can_read_audit(uuid) FROM PUBLIC;

-- No helper below is granted to anon. Authenticated callers receive only the
-- narrowly-scoped predicates needed by RLS evaluation.
GRANT EXECUTE ON FUNCTION public.is_platform_admin() TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_active_org_member(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.can_read_user(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.can_manage_organisation(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.can_read_membership(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.can_manage_membership(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.can_read_role(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.can_manage_role(uuid, uuid, boolean) TO authenticated;
GRANT EXECUTE ON FUNCTION public.can_read_role_permissions(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.can_manage_role_permissions(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.can_read_settings(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.can_manage_settings(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.can_read_audit(uuid) TO authenticated;

-- 10.1 Users Policies
CREATE POLICY users_read ON public.users FOR SELECT TO authenticated
  USING (public.can_read_user(id));

CREATE POLICY users_update_self ON public.users FOR UPDATE TO authenticated
  USING (id = public.current_user_id())
  WITH CHECK (id = public.current_user_id());

-- 10.2 Organisations Policies
CREATE POLICY orgs_read ON public.organisations FOR SELECT TO authenticated
  USING (
    public.is_platform_admin()
    OR id = public.current_org_id()
    OR public.is_active_org_member(id)
  );

CREATE POLICY orgs_update ON public.organisations FOR UPDATE TO authenticated
  USING (public.can_manage_organisation(id))
  WITH CHECK (public.is_platform_admin() OR id = public.current_org_id());

-- 10.3 Organisation Memberships Policies
CREATE POLICY memberships_read ON public.organisation_memberships FOR SELECT TO authenticated
  USING (public.can_read_membership(organisation_id, user_id));

CREATE POLICY memberships_insert ON public.organisation_memberships FOR INSERT TO authenticated
  WITH CHECK (public.can_manage_membership(organisation_id));

CREATE POLICY memberships_update ON public.organisation_memberships FOR UPDATE TO authenticated
  USING (public.can_manage_membership(organisation_id))
  WITH CHECK (public.can_manage_membership(organisation_id));

CREATE POLICY memberships_delete ON public.organisation_memberships FOR DELETE TO authenticated
  USING (public.can_manage_membership(organisation_id));

-- 10.4 Roles Policies
-- Revision 6: evaluated on the row's own columns (not a lookup by id), so INSERT ... RETURNING
-- (PostgREST return=representation) can see the role it has just created.
CREATE POLICY roles_read ON public.roles FOR SELECT TO authenticated
  USING (
    public.is_platform_admin()
    OR organisation_id IS NULL
    OR organisation_id = public.current_org_id()
  );

CREATE POLICY roles_write ON public.roles FOR ALL TO authenticated
  USING (public.can_manage_role(id, organisation_id, is_system))
  WITH CHECK (
    public.is_platform_admin()
    OR (
      organisation_id = public.current_org_id()
      AND is_system = false
      AND scope = 'organisation'
      AND public.has_permission('role.manage')
    )
  );

-- 10.5 Permissions Policies (Catalog is readable, immutable via client API)
CREATE POLICY permissions_read ON public.permissions FOR SELECT TO authenticated
  USING (true);

-- 10.6 Role Permissions Policies (TENANT ISOLATION)
CREATE POLICY role_permissions_read ON public.role_permissions FOR SELECT TO authenticated
  USING (public.can_read_role_permissions(role_id));

CREATE POLICY role_permissions_insert ON public.role_permissions FOR INSERT TO authenticated
  WITH CHECK (
    public.is_platform_admin()
    OR (
      public.can_manage_role_permissions(role_id)
      AND EXISTS (
        SELECT 1 FROM public.permissions p
        WHERE p.id = public.role_permissions.permission_id
          AND public.has_permission(p.code)
      )
    )
  );

CREATE POLICY role_permissions_delete ON public.role_permissions FOR DELETE TO authenticated
  USING (public.can_manage_role_permissions(role_id));

-- 10.7 Organisation Settings Policies
CREATE POLICY settings_read ON public.organisation_settings FOR SELECT TO authenticated
  USING (public.can_read_settings(organisation_id));

CREATE POLICY settings_write ON public.organisation_settings FOR ALL TO authenticated
  USING (public.can_manage_settings(organisation_id))
  WITH CHECK (public.can_manage_settings(organisation_id));

-- 10.8 Audit Events Policies (APPEND-ONLY TRUSTED SINK)
CREATE POLICY audit_read ON public.audit_events FOR SELECT TO authenticated
  USING (public.can_read_audit(organisation_id));
-- No INSERT, UPDATE, or DELETE policies exist for authenticated.
-- Audit rows are inserted strictly by trusted database triggers (SECURITY DEFINER)
-- and privileged backend routines running under service_role.

-- 11. Seed: the ONE authoritative permission catalogue and built-in system roles
-- ---------------------------------------------------------------------
-- Revision 6 (C1/C5): every permission code used by any policy or function in 001-010 is
-- defined here, once. Later migrations add no permissions. All seeds are idempotent.
-- The academic content model uses one namespace (no note.* / question.* aliases):
--   academic.<notes|questions>.read     read (students: published notes only; staff: bank)
--   academic.<notes|questions>.write    author drafts, revise, submit for review
--   academic.<notes|questions>.review   review: request changes / reject
--   academic.<notes|questions>.approve  record the approving decision (never on own work)
--   academic.<notes|questions>.publish  publish / unpublish approved versions
INSERT INTO public.permissions (code, description) VALUES
  ('organisation.manage', 'Edit organisation details'),
  ('membership.manage',   'Invite members, change their role or status, remove members (within your own permission ceiling)'),
  ('role.manage',         'Create, edit, or delete custom roles and assign permissions you hold'),
  ('settings.manage',     'Edit organisation operational settings'),
  ('audit.read',          'View organisation audit log'),
  ('class.manage',        'Manage programmes, subjects, sessions, classes and enrolments'),
  ('teacher.manage',      'Create and edit teacher records'),
  ('parent.manage',       'Create and edit parent records'),
  ('student.manage',      'Admit and update student records and guardians'),
  ('student.read',        'Read student records of the organisation'),
  ('curriculum.manage',   'Create and edit curricula, units, topics and outcomes'),
  ('blueprint.manage',    'Create and edit assessment blueprints'),
  ('academic.notes.read',        'Read published notes'),
  ('academic.notes.write',       'Author and revise note drafts and submit them for review'),
  ('academic.notes.review',      'Review submitted notes: request changes or reject'),
  ('academic.notes.approve',     'Approve submitted notes written by someone else'),
  ('academic.notes.publish',     'Publish and unpublish approved notes'),
  ('academic.questions.read',    'Read the question bank including answer keys (staff)'),
  ('academic.questions.write',   'Author and revise question drafts and submit them for review'),
  ('academic.questions.review',  'Review submitted questions: request changes or reject'),
  ('academic.questions.approve', 'Approve submitted questions written by someone else'),
  ('academic.questions.publish', 'Publish and unpublish approved questions'),
  ('report.view',         'View engagement and usage reports'),
  ('exam.create',         'Create, schedule, publish and close CBT exams'),
  ('exam.take',           'Sit CBT exams you are eligible for'),
  ('result.mark',         'Mark theory/short answers and override marks'),
  ('result.release',      'Release results to students and parents'),
  ('result.read_all',     'Read every student''s attempts and results'),
  ('result.read_class',   'Read attempts and results of students in your classes'),
  ('finance.manage',      'Configure products and prices, create and issue invoices, record payments'),
  ('finance.read',        'Read your own (or your ward''s) invoices, payments and receipts'),
  ('finance.view_all',    'Read every account, invoice, payment and the ledger'),
  ('finance.approve',     'Approve refunds, write-offs and manual price overrides'),
  ('cas.manage',          'Assign interventions, dismiss diagnoses, prepare and approve parent reports'),
  ('ai.use',              'Request AI-generated drafts and reviews'),
  ('ai.manage',           'See all AI jobs and usage for the organisation')
ON CONFLICT (code) DO UPDATE SET description = EXCLUDED.description;

-- Seed system roles (organisation_id IS NULL)
INSERT INTO public.roles (code, name, description, is_system, scope) VALUES
  ('platform_admin', 'Platform Administrator', 'Full system-wide administrative access (users.is_platform_admin)', true, 'platform'),
  ('org_owner',      'School Owner / Director', 'Full control over the school; the only role that can change ownership, roles, settings and read the audit log', true, 'organisation'),
  ('org_admin',      'School Administrator',   'Operational administration; cannot change ownership, roles or settings', true, 'organisation'),
  ('teacher',        'Teacher / Instructor',   'Author notes and questions, run CBT exams for their classes', true, 'organisation'),
  ('reviewer',       'Academic Reviewer',      'Review and approve notes and questions written by others; no administrative rights', true, 'organisation'),
  ('student',        'Student / Candidate',    'Study published notes, take eligible CBT exams, see own results and fees', true, 'organisation'),
  ('parent',         'Parent / Guardian',      'See wards'' released results, invoices and receipts', true, 'organisation'),
  ('bursar',         'Bursar / Accounts',      'Fees and payments: products, prices, invoices, manual payments; no refunds or write-offs', true, 'organisation')
ON CONFLICT (code) WHERE organisation_id IS NULL DO UPDATE SET name = EXCLUDED.name, description = EXCLUDED.description;

-- Role -> permission mapping (authoritative; idempotent)
WITH map(role_code, perm_code) AS (
  -- org_owner: every organisation-scope permission
  SELECT 'org_owner', code FROM public.permissions
  UNION ALL
  -- org_admin: everything except ownership-level controls (roles, settings, audit)
  SELECT 'org_admin', code FROM public.permissions
   WHERE code NOT IN ('role.manage', 'settings.manage', 'audit.read')
  UNION ALL
  SELECT 'teacher', unnest(ARRAY[
    'student.read', 'blueprint.manage',
    'academic.notes.read', 'academic.notes.write', 'academic.questions.read', 'academic.questions.write',
    'exam.create', 'result.mark', 'result.release', 'result.read_class', 'cas.manage', 'ai.use'])
  UNION ALL
  SELECT 'reviewer', unnest(ARRAY[
    'academic.notes.read', 'academic.notes.review', 'academic.notes.approve',
    'academic.questions.read', 'academic.questions.review', 'academic.questions.approve'])
  UNION ALL
  SELECT 'student', unnest(ARRAY['academic.notes.read', 'exam.take', 'finance.read'])
  UNION ALL
  SELECT 'parent', unnest(ARRAY['finance.read'])
  UNION ALL
  SELECT 'bursar', unnest(ARRAY['finance.manage', 'finance.view_all', 'student.read'])
)
INSERT INTO public.role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM map
JOIN public.roles r       ON r.code = map.role_code AND r.organisation_id IS NULL
JOIN public.permissions p ON p.code = map.perm_code
ON CONFLICT (role_id, permission_id) DO NOTHING;

-- Fail the migration if any mapping referenced a code that does not exist.
DO $$
DECLARE v_missing text;
BEGIN
  SELECT string_agg(c, ', ') INTO v_missing
  FROM unnest(ARRAY['student.read','blueprint.manage','academic.notes.read','academic.notes.write',
                    'academic.notes.review','academic.notes.approve','academic.notes.publish',
                    'academic.questions.read','academic.questions.write','academic.questions.review',
                    'academic.questions.approve','academic.questions.publish','exam.create','exam.take',
                    'result.mark','result.release','result.read_class','cas.manage','ai.use',
                    'finance.read','finance.manage','finance.view_all']) c
  WHERE NOT EXISTS (SELECT 1 FROM public.permissions p WHERE p.code = c);
  IF v_missing IS NOT NULL THEN
    RAISE EXCEPTION 'Permission catalogue incomplete: %', v_missing;
  END IF;
END $$;

-- ---------------------------------------------------------------------
-- 11b. Trusted-backend assertion (Revision 6, H4)
-- Service-only entry points (webhooks, workers, schedulers) call this first. Allowed:
--   * a request running as service_role (Supabase service key / backend), or
--   * the database owner with no SET ROLE (pg_cron, SQL editor, migrations).
-- Inside SECURITY DEFINER functions current_user is the owner, but the 'role' setting still
-- reports the caller's role, so a client calling through any path is refused.
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.assert_service_context()
RETURNS void AS $$
DECLARE
  v_role text := COALESCE(NULLIF(current_setting('role', true), ''), 'none');
BEGIN
  IF v_role = 'service_role' THEN RETURN; END IF;
  IF v_role = 'none' AND session_user::text IN ('postgres', 'supabase_admin') THEN RETURN; END IF;
  RAISE EXCEPTION 'This operation is reserved for the trusted backend (service_role)'
    USING ERRCODE = '42501';
END;
$$ LANGUAGE plpgsql STABLE SET search_path = pg_catalog, public, pg_temp;
REVOKE ALL ON FUNCTION public.assert_service_context() FROM PUBLIC, anon, authenticated;

-- ---------------------------------------------------------------------
-- 12. Ownership functions (Revision 6, C4)
-- The ONLY client path that creates, removes or transfers an org_owner membership.
-- Authorised callers: an active owner of the organisation, or an active platform admin,
-- acting in the validated organisation context (current_org_id()).
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.assert_owner_authority()
RETURNS uuid AS $$
DECLARE
  v_org uuid := public.current_org_id();
BEGIN
  IF v_org IS NULL THEN
    RAISE EXCEPTION 'No valid organisation context';
  END IF;
  IF public.is_platform_admin() THEN
    RETURN v_org;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.organisation_memberships m
    JOIN public.roles r ON r.id = m.role_id AND r.code = 'org_owner' AND r.organisation_id IS NULL
    WHERE m.organisation_id = v_org AND m.user_id = public.current_user_id() AND m.status = 'active'
  ) THEN
    RAISE EXCEPTION 'Only an owner of this organisation (or a platform administrator) can change ownership';
  END IF;
  RETURN v_org;
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = pg_catalog, public, pg_temp;

-- Make an existing active member a (co-)owner.
CREATE OR REPLACE FUNCTION public.grant_organisation_owner(p_user_id uuid)
RETURNS void AS $$
DECLARE
  v_org        uuid := public.assert_owner_authority();
  v_owner_role uuid;
BEGIN
  SELECT id INTO v_owner_role FROM public.roles WHERE code = 'org_owner' AND organisation_id IS NULL;
  IF NOT EXISTS (
    SELECT 1 FROM public.organisation_memberships m
    JOIN public.users u ON u.id = m.user_id AND u.status = 'active' AND u.deleted_at IS NULL
    WHERE m.organisation_id = v_org AND m.user_id = p_user_id AND m.status = 'active'
  ) THEN
    RAISE EXCEPTION 'The new owner must already be an active member of the organisation';
  END IF;
  INSERT INTO public.organisation_memberships (organisation_id, user_id, role_id, status, invited_by)
  VALUES (v_org, p_user_id, v_owner_role, 'active', public.current_user_id())
  ON CONFLICT (organisation_id, user_id, role_id) DO UPDATE SET status = 'active';
  INSERT INTO public.audit_events (organisation_id, action, entity_type, entity_id, source)
  VALUES (v_org, 'ownership.granted', 'user', p_user_id::text, 'grant_organisation_owner');
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public, pg_temp;

-- Remove owner status from a user; they keep membership with p_new_role_code (default org_admin).
-- The last-owner guard still applies.
CREATE OR REPLACE FUNCTION public.revoke_organisation_owner(p_user_id uuid, p_new_role_code text DEFAULT 'org_admin')
RETURNS void AS $$
DECLARE
  v_org        uuid := public.assert_owner_authority();
  v_owner_role uuid;
  v_new_role   uuid;
  v_owner_m    uuid;
BEGIN
  SELECT id INTO v_owner_role FROM public.roles WHERE code = 'org_owner' AND organisation_id IS NULL;
  SELECT id INTO v_new_role FROM public.roles
  WHERE code = p_new_role_code AND scope = 'organisation' AND code <> 'org_owner'
    AND (organisation_id IS NULL OR organisation_id = v_org)
  ORDER BY organisation_id NULLS LAST LIMIT 1;
  IF NOT FOUND THEN RAISE EXCEPTION 'Unknown role %', p_new_role_code; END IF;

  SELECT id INTO v_owner_m FROM public.organisation_memberships
  WHERE organisation_id = v_org AND user_id = p_user_id AND role_id = v_owner_role AND status = 'active';
  IF NOT FOUND THEN RAISE EXCEPTION 'That user is not an active owner'; END IF;

  IF EXISTS (SELECT 1 FROM public.organisation_memberships
             WHERE organisation_id = v_org AND user_id = p_user_id AND role_id = v_new_role) THEN
    UPDATE public.organisation_memberships SET status = 'active'
    WHERE organisation_id = v_org AND user_id = p_user_id AND role_id = v_new_role;
    UPDATE public.organisation_memberships SET status = 'removed' WHERE id = v_owner_m;
  ELSE
    UPDATE public.organisation_memberships SET role_id = v_new_role WHERE id = v_owner_m;
  END IF;
  INSERT INTO public.audit_events (organisation_id, action, entity_type, entity_id, after_state, source)
  VALUES (v_org, 'ownership.revoked', 'user', p_user_id::text,
          jsonb_build_object('new_role', p_new_role_code), 'revoke_organisation_owner');
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public, pg_temp;

-- Owner hands the organisation to another active member and steps down to p_previous_owner_role.
CREATE OR REPLACE FUNCTION public.transfer_organisation_ownership(p_new_owner_id uuid,
                                                                  p_previous_owner_role text DEFAULT 'org_admin')
RETURNS void AS $$
DECLARE
  v_me uuid := public.current_user_id();
BEGIN
  PERFORM public.assert_owner_authority();
  IF p_new_owner_id = v_me THEN RAISE EXCEPTION 'You already own this organisation'; END IF;
  PERFORM public.grant_organisation_owner(p_new_owner_id);
  IF EXISTS (SELECT 1 FROM public.organisation_memberships m
             JOIN public.roles r ON r.id = m.role_id AND r.code = 'org_owner' AND r.organisation_id IS NULL
             WHERE m.organisation_id = public.current_org_id() AND m.user_id = v_me AND m.status = 'active') THEN
    PERFORM public.revoke_organisation_owner(v_me, p_previous_owner_role);
  END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public, pg_temp;

REVOKE ALL ON FUNCTION public.assert_owner_authority(), public.grant_organisation_owner(uuid),
  public.revoke_organisation_owner(uuid, text), public.transfer_organisation_ownership(uuid, text)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.grant_organisation_owner(uuid), public.revoke_organisation_owner(uuid, text),
  public.transfer_organisation_ownership(uuid, text) TO authenticated;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA public TO service_role;

INSERT INTO public.schema_migrations (version, description) VALUES ('001', 'identity and tenancy (rev 6)');

COMMIT;