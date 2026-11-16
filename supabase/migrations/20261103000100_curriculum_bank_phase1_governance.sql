-- =====================================================================
-- Curriculum Bank, phase 1: review workflow + governance (additive only)
-- No existing table is dropped or retyped; NoteBank keeps reading the
-- existing curriculum tables unchanged. Structural extensions (generic node
-- tree, coverage records, shared base curricula) are later phases.
--   1. Placeholder metadata on curricula (region, sitting_code): nullable, no seed data.
--   2. Review state + authorship on curriculum_versions (separate from lifecycle status).
--   3. curriculum_governance_settings (per organisation, opt-in review gate).
--   4. curriculum_version_reviews (append-only review log).
--   5. Permissions curriculum.review / curriculum.publish.
--   6. Audited SECURITY DEFINER functions: submit, review, publish.
--   7. Guards: review columns writable only via those functions; publish gate;
--      content edits invalidate approval / are blocked while in review.
-- =====================================================================

-- 1. Metadata placeholders ---------------------------------------------------
ALTER TABLE public.curricula
  ADD COLUMN IF NOT EXISTS region       text,
  ADD COLUMN IF NOT EXISTS sitting_code text;

-- 2. Review state ------------------------------------------------------------
DO $$ BEGIN
  CREATE TYPE public.curriculum_review_state AS ENUM ('not_submitted', 'in_review', 'changes_requested', 'approved');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

ALTER TABLE public.curriculum_versions
  ADD COLUMN IF NOT EXISTS review_state public.curriculum_review_state NOT NULL DEFAULT 'not_submitted',
  ADD COLUMN IF NOT EXISTS authored_by  uuid REFERENCES public.users(id),
  ADD COLUMN IF NOT EXISTS submitted_by uuid REFERENCES public.users(id),
  ADD COLUMN IF NOT EXISTS submitted_at timestamptz,
  ADD COLUMN IF NOT EXISTS reviewed_by  uuid REFERENCES public.users(id),
  ADD COLUMN IF NOT EXISTS reviewed_at  timestamptz;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'curriculum_versions_id_org_key') THEN
    ALTER TABLE public.curriculum_versions
      ADD CONSTRAINT curriculum_versions_id_org_key UNIQUE (id, organisation_id);
  END IF;
END $$;

-- Default authorship for new drafts (does not touch existing rows).
CREATE OR REPLACE FUNCTION public.curriculum_version_stamp_author()
RETURNS trigger LANGUAGE plpgsql
SET search_path = pg_catalog, public, pg_temp
AS $$
BEGIN
  IF NEW.authored_by IS NULL THEN NEW.authored_by := public.current_user_id(); END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS trg_curriculum_version_author ON public.curriculum_versions;
CREATE TRIGGER trg_curriculum_version_author BEFORE INSERT ON public.curriculum_versions
  FOR EACH ROW EXECUTE FUNCTION public.curriculum_version_stamp_author();

-- 3. Governance settings -----------------------------------------------------
CREATE TABLE IF NOT EXISTS public.curriculum_governance_settings (
  organisation_id uuid PRIMARY KEY REFERENCES public.organisations(id) ON DELETE CASCADE,
  require_review  boolean NOT NULL DEFAULT false,   -- opt-in: existing publish flow unchanged until enabled
  allow_self_review boolean NOT NULL DEFAULT false, -- small-tenant waiver: submitter may approve own submission
  updated_by uuid REFERENCES public.users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.curriculum_governance_settings ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS curriculum_governance_read ON public.curriculum_governance_settings;
CREATE POLICY curriculum_governance_read ON public.curriculum_governance_settings FOR SELECT
  USING (organisation_id = (SELECT public.current_org_id()) AND (SELECT public.is_org_member()));
DROP POLICY IF EXISTS curriculum_governance_write ON public.curriculum_governance_settings;
CREATE POLICY curriculum_governance_write ON public.curriculum_governance_settings FOR ALL
  USING (organisation_id = (SELECT public.current_org_id()) AND (SELECT public.has_permission('curriculum.publish')))
  WITH CHECK (organisation_id = (SELECT public.current_org_id()) AND (SELECT public.has_permission('curriculum.publish')));

-- 4. Review log (append-only) ------------------------------------------------
CREATE TABLE IF NOT EXISTS public.curriculum_version_reviews (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organisation_id uuid NOT NULL,
  version_id uuid NOT NULL,
  action text NOT NULL CHECK (action IN ('submit', 'approve', 'request_changes')),
  actor_user_id uuid REFERENCES public.users(id),
  note text,
  created_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (version_id, organisation_id) REFERENCES public.curriculum_versions (id, organisation_id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS curriculum_version_reviews_version_idx ON public.curriculum_version_reviews (version_id, created_at);
ALTER TABLE public.curriculum_version_reviews ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS curriculum_reviews_read ON public.curriculum_version_reviews;
CREATE POLICY curriculum_reviews_read ON public.curriculum_version_reviews FOR SELECT
  USING (organisation_id = (SELECT public.current_org_id()) AND (SELECT public.is_org_member()));
-- No INSERT/UPDATE/DELETE policy: rows are written only by the definer functions below.

CREATE OR REPLACE FUNCTION public.curriculum_reviews_append_only()
RETURNS trigger LANGUAGE plpgsql
SET search_path = pg_catalog, public, pg_temp
AS $$
BEGIN
  -- Cascade from deleting a draft version is allowed; direct edits are not.
  IF TG_OP = 'DELETE' AND NOT EXISTS (SELECT 1 FROM public.curriculum_versions WHERE id = OLD.version_id) THEN
    RETURN OLD;
  END IF;
  RAISE EXCEPTION 'curriculum_version_reviews is append-only' USING ERRCODE = 'check_violation';
END $$;
DROP TRIGGER IF EXISTS trg_curriculum_reviews_append_only ON public.curriculum_version_reviews;
CREATE TRIGGER trg_curriculum_reviews_append_only BEFORE UPDATE OR DELETE ON public.curriculum_version_reviews
  FOR EACH ROW EXECUTE FUNCTION public.curriculum_reviews_append_only();

REVOKE ALL ON public.curriculum_version_reviews FROM anon, authenticated;
GRANT SELECT ON public.curriculum_version_reviews TO authenticated;
GRANT ALL ON public.curriculum_version_reviews TO service_role;
REVOKE ALL ON public.curriculum_governance_settings FROM anon;
GRANT SELECT, INSERT, UPDATE ON public.curriculum_governance_settings TO authenticated;
GRANT ALL ON public.curriculum_governance_settings TO service_role;

-- 5. Permissions -------------------------------------------------------------
INSERT INTO public.permissions (code, description) VALUES
  ('curriculum.review',  'Approve or request changes on submitted curriculum versions'),
  ('curriculum.publish', 'Publish curriculum versions and manage curriculum governance settings')
ON CONFLICT (code) DO NOTHING;

INSERT INTO public.role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM public.roles r
JOIN public.permissions p ON (
     (r.code IN ('org_owner', 'org_admin', 'reviewer') AND p.code = 'curriculum.review')
  OR (r.code IN ('org_owner', 'org_admin')             AND p.code = 'curriculum.publish'))
WHERE r.organisation_id IS NULL
ON CONFLICT DO NOTHING;

-- 7a. Review columns writable only through the workflow functions ------------
CREATE OR REPLACE FUNCTION public.curriculum_review_columns_guard()
RETURNS trigger LANGUAGE plpgsql
SET search_path = pg_catalog, public, pg_temp
AS $$
BEGIN
  IF current_setting('app.curriculum_workflow', true) = 'on' THEN RETURN NEW; END IF;
  IF TG_OP = 'INSERT' THEN
    IF NEW.review_state <> 'not_submitted' OR NEW.submitted_by IS NOT NULL OR NEW.reviewed_by IS NOT NULL THEN
      RAISE EXCEPTION 'Review state can only be changed through the review workflow' USING ERRCODE = 'check_violation';
    END IF;
  ELSIF NEW.review_state IS DISTINCT FROM OLD.review_state
     OR NEW.submitted_by IS DISTINCT FROM OLD.submitted_by
     OR NEW.submitted_at IS DISTINCT FROM OLD.submitted_at
     OR NEW.reviewed_by  IS DISTINCT FROM OLD.reviewed_by
     OR NEW.reviewed_at  IS DISTINCT FROM OLD.reviewed_at
     OR NEW.authored_by  IS DISTINCT FROM OLD.authored_by THEN
    RAISE EXCEPTION 'Review state can only be changed through the review workflow' USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS trg_curriculum_review_columns_guard ON public.curriculum_versions;
CREATE TRIGGER trg_curriculum_review_columns_guard BEFORE INSERT OR UPDATE ON public.curriculum_versions
  FOR EACH ROW EXECUTE FUNCTION public.curriculum_review_columns_guard();

-- 7b. Publish gate (only bites when the organisation enabled require_review) --
CREATE OR REPLACE FUNCTION public.curriculum_publish_gate()
RETURNS trigger LANGUAGE plpgsql
SET search_path = pg_catalog, public, pg_temp
AS $$
DECLARE v_req boolean;
BEGIN
  IF NEW.status = 'published' AND (TG_OP = 'INSERT' OR OLD.status IS DISTINCT FROM 'published') THEN
    SELECT require_review INTO v_req FROM public.curriculum_governance_settings WHERE organisation_id = NEW.organisation_id;
    IF COALESCE(v_req, false) AND NEW.review_state <> 'approved' THEN
      RAISE EXCEPTION 'This organisation requires an approved review before a curriculum version can be published'
        USING ERRCODE = 'check_violation';
    END IF;
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS trg_curriculum_publish_gate ON public.curriculum_versions;
CREATE TRIGGER trg_curriculum_publish_gate BEFORE INSERT OR UPDATE ON public.curriculum_versions
  FOR EACH ROW EXECUTE FUNCTION public.curriculum_publish_gate();

-- 7c. Content guard: also protect review integrity ----------------------------
CREATE OR REPLACE FUNCTION public.curriculum_content_guard()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, public, pg_temp
AS $$
DECLARE
  v_row     jsonb;
  v_ver_ids uuid[] := ARRAY[]::uuid[];
  v_status  public.curriculum_status;
  v_review  public.curriculum_review_state;
  v_id      uuid;
BEGIN
  FOREACH v_row IN ARRAY ARRAY[
    CASE WHEN TG_OP IN ('UPDATE', 'DELETE') THEN to_jsonb(OLD) END,
    CASE WHEN TG_OP IN ('INSERT', 'UPDATE') THEN to_jsonb(NEW) END
  ] LOOP
    CONTINUE WHEN v_row IS NULL;
    v_id := NULL;
    IF TG_TABLE_NAME IN ('curriculum_units', 'curriculum_topics') THEN
      v_id := NULLIF(v_row ->> 'version_id', '')::uuid;
    ELSIF TG_TABLE_NAME IN ('curriculum_prerequisites', 'curriculum_outcomes') THEN
      SELECT version_id INTO v_id FROM public.curriculum_topics WHERE id = (v_row ->> 'topic_id')::uuid;
    END IF;
    IF v_id IS NOT NULL THEN v_ver_ids := v_ver_ids || v_id; END IF;
  END LOOP;

  FOREACH v_id IN ARRAY v_ver_ids LOOP
    SELECT status, review_state INTO v_status, v_review FROM public.curriculum_versions WHERE id = v_id;
    IF v_status IS NOT NULL AND v_status <> 'draft' THEN
      RAISE EXCEPTION 'Curriculum version is % and cannot be edited; create a new draft version', v_status
        USING ERRCODE = 'check_violation';
    END IF;
    IF v_status = 'draft' THEN
      IF v_review = 'in_review' THEN
        RAISE EXCEPTION 'Curriculum version is in review and cannot be edited; request changes first'
          USING ERRCODE = 'check_violation';
      ELSIF v_review = 'approved' THEN
        -- Editing an approved draft voids the approval.
        PERFORM set_config('app.curriculum_workflow', 'on', true);
        UPDATE public.curriculum_versions
           SET review_state = 'not_submitted', reviewed_by = NULL, reviewed_at = NULL
         WHERE id = v_id;
        PERFORM set_config('app.curriculum_workflow', 'off', true);
      END IF;
    END IF;
  END LOOP;

  RETURN CASE TG_OP WHEN 'DELETE' THEN OLD ELSE NEW END;
END;
$$;

-- 6. Workflow functions ------------------------------------------------------
CREATE OR REPLACE FUNCTION public.curriculum_submit_for_review(p_version_id uuid, p_note text DEFAULT NULL)
RETURNS public.curriculum_review_state
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
DECLARE
  v_org uuid := public.current_org_id();
  v_uid uuid := public.current_user_id();
  v_ver public.curriculum_versions%ROWTYPE;
BEGIN
  IF v_uid IS NULL OR v_org IS NULL OR NOT public.has_permission('curriculum.manage') THEN
    RAISE EXCEPTION 'Not permitted' USING ERRCODE = 'insufficient_privilege';
  END IF;
  SELECT * INTO v_ver FROM public.curriculum_versions WHERE id = p_version_id AND organisation_id = v_org FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Curriculum version not found' USING ERRCODE = 'no_data_found'; END IF;
  IF v_ver.status <> 'draft' OR v_ver.review_state NOT IN ('not_submitted', 'changes_requested') THEN
    RAISE EXCEPTION 'Only a draft that is not already in review or approved can be submitted'
      USING ERRCODE = 'check_violation';
  END IF;
  PERFORM set_config('app.curriculum_workflow', 'on', true);
  UPDATE public.curriculum_versions
     SET review_state = 'in_review', submitted_by = v_uid, submitted_at = now(), reviewed_by = NULL, reviewed_at = NULL
   WHERE id = p_version_id;
  PERFORM set_config('app.curriculum_workflow', 'off', true);
  INSERT INTO public.curriculum_version_reviews (organisation_id, version_id, action, actor_user_id, note)
  VALUES (v_org, p_version_id, 'submit', v_uid, p_note);
  RETURN 'in_review';
END $$;

CREATE OR REPLACE FUNCTION public.curriculum_review_version(p_version_id uuid, p_decision text, p_note text DEFAULT NULL)
RETURNS public.curriculum_review_state
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
DECLARE
  v_org uuid := public.current_org_id();
  v_uid uuid := public.current_user_id();
  v_ver public.curriculum_versions%ROWTYPE;
  v_self boolean;
  v_new public.curriculum_review_state;
BEGIN
  IF v_uid IS NULL OR v_org IS NULL OR NOT public.has_permission('curriculum.review') THEN
    RAISE EXCEPTION 'Not permitted' USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF p_decision NOT IN ('approve', 'request_changes') THEN
    RAISE EXCEPTION 'Decision must be approve or request_changes' USING ERRCODE = 'invalid_parameter_value';
  END IF;
  IF p_decision = 'request_changes' AND NULLIF(btrim(COALESCE(p_note, '')), '') IS NULL THEN
    RAISE EXCEPTION 'A note is required when requesting changes' USING ERRCODE = 'invalid_parameter_value';
  END IF;
  SELECT * INTO v_ver FROM public.curriculum_versions WHERE id = p_version_id AND organisation_id = v_org FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Curriculum version not found' USING ERRCODE = 'no_data_found'; END IF;
  IF v_ver.status <> 'draft' OR v_ver.review_state <> 'in_review' THEN
    RAISE EXCEPTION 'Version is not awaiting review' USING ERRCODE = 'check_violation';
  END IF;
  -- Separation of duties, unless the organisation enabled the small-tenant waiver.
  SELECT COALESCE(allow_self_review, false) INTO v_self
    FROM public.curriculum_governance_settings WHERE organisation_id = v_org;
  IF v_ver.submitted_by = v_uid AND NOT COALESCE(v_self, false) THEN
    RAISE EXCEPTION 'The submitter cannot review their own submission' USING ERRCODE = 'insufficient_privilege';
  END IF;
  v_new := CASE p_decision WHEN 'approve' THEN 'approved' ELSE 'changes_requested' END;
  PERFORM set_config('app.curriculum_workflow', 'on', true);
  UPDATE public.curriculum_versions
     SET review_state = v_new, reviewed_by = v_uid, reviewed_at = now()
   WHERE id = p_version_id;
  PERFORM set_config('app.curriculum_workflow', 'off', true);
  INSERT INTO public.curriculum_version_reviews (organisation_id, version_id, action, actor_user_id, note)
  VALUES (v_org, p_version_id, p_decision, v_uid, p_note);
  RETURN v_new;
END $$;

CREATE OR REPLACE FUNCTION public.curriculum_publish_version(p_version_id uuid)
RETURNS timestamptz
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
DECLARE
  v_org uuid := public.current_org_id();
  v_ver public.curriculum_versions%ROWTYPE;
BEGIN
  IF public.current_user_id() IS NULL OR v_org IS NULL OR NOT public.has_permission('curriculum.publish') THEN
    RAISE EXCEPTION 'Not permitted' USING ERRCODE = 'insufficient_privilege';
  END IF;
  SELECT * INTO v_ver FROM public.curriculum_versions WHERE id = p_version_id AND organisation_id = v_org FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Curriculum version not found' USING ERRCODE = 'no_data_found'; END IF;
  IF v_ver.status <> 'draft' THEN
    RAISE EXCEPTION 'Only a draft can be published' USING ERRCODE = 'check_violation';
  END IF;
  -- The publish gate trigger enforces approval when require_review is on.
  UPDATE public.curriculum_versions SET status = 'published' WHERE id = p_version_id;
  RETURN (SELECT published_at FROM public.curriculum_versions WHERE id = p_version_id);
END $$;

REVOKE ALL ON FUNCTION public.curriculum_submit_for_review(uuid, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.curriculum_review_version(uuid, text, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.curriculum_publish_version(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.curriculum_submit_for_review(uuid, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.curriculum_review_version(uuid, text, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.curriculum_publish_version(uuid) TO authenticated, service_role;

-- Audit ----------------------------------------------------------------------
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['curriculum_governance_settings', 'curriculum_version_reviews'] LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS trg_audit_%s ON public.%I', t, t);
    EXECUTE format('CREATE TRIGGER trg_audit_%s AFTER INSERT OR UPDATE OR DELETE ON public.%I
                    FOR EACH ROW EXECUTE FUNCTION public.audit_row_change()', t, t);
  END LOOP;
END $$;
