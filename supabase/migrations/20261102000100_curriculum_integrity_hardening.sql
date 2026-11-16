-- =====================================================================
-- Curriculum integrity hardening (audit findings F-03, F-04, F-06)
-- Forward-only, additive. No tables or columns are dropped or retyped.
--   1. prevent_prerequisite_cycle(): serialise per organisation (closes the
--      concurrent X->Y / Y->X race) and pin search_path.
--   2. Prerequisite endpoints must belong to the same curriculum version.
--   3. published_at is stamped when a version becomes published; a published
--      version can only move to archived (never back to draft).
--   4. Content of a non-draft version (units, topics, prerequisites, outcome
--      links) is immutable; corrections are made in a new draft version.
--   5. Audit triggers on curriculum and blueprint tables (audit_row_change).
-- Existing rows are not rewritten or validated; rules apply to new writes.
-- =====================================================================

-- 1 + 2. Cycle prevention (race-safe) and same-version rule -------------------
CREATE OR REPLACE FUNCTION public.prevent_prerequisite_cycle()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, public, pg_temp
AS $$
DECLARE
  v_topic_ver uuid;
  v_req_ver   uuid;
BEGIN
  -- Serialise graph writes per organisation so a concurrent transaction's
  -- committed edge is visible to the recursive check below (READ COMMITTED).
  PERFORM pg_advisory_xact_lock(hashtextextended('curriculum_prereq:' || NEW.organisation_id::text, 0));

  SELECT version_id INTO v_topic_ver FROM public.curriculum_topics WHERE id = NEW.topic_id;
  SELECT version_id INTO v_req_ver   FROM public.curriculum_topics WHERE id = NEW.requires_topic_id;
  IF v_topic_ver IS DISTINCT FROM v_req_ver THEN
    RAISE EXCEPTION 'Prerequisite topics must belong to the same curriculum version'
      USING ERRCODE = 'check_violation';
  END IF;

  IF EXISTS (
    WITH RECURSIVE upstream(topic_id) AS (
      SELECT NEW.requires_topic_id
      UNION
      SELECT p.requires_topic_id
      FROM public.curriculum_prerequisites p
      JOIN upstream u ON p.topic_id = u.topic_id
    )
    SELECT 1 FROM upstream WHERE topic_id = NEW.topic_id
  ) THEN
    RAISE EXCEPTION 'Prerequisite cycle detected between topics % and %',
      NEW.topic_id, NEW.requires_topic_id;
  END IF;
  RETURN NEW;
END;
$$;

-- 3. Version lifecycle ---------------------------------------------------------
CREATE OR REPLACE FUNCTION public.curriculum_version_lifecycle()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, public, pg_temp
AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF OLD.status <> 'draft' THEN
      RAISE EXCEPTION 'Only draft curriculum versions can be deleted; archive instead'
        USING ERRCODE = 'check_violation';
    END IF;
    RETURN OLD;
  END IF;

  IF TG_OP = 'INSERT' THEN
    IF NEW.status = 'published' AND NEW.published_at IS NULL THEN
      NEW.published_at := now();
    END IF;
    RETURN NEW;
  END IF;

  -- UPDATE
  IF OLD.status = 'published' THEN
    IF NEW.status NOT IN ('published', 'archived') THEN
      RAISE EXCEPTION 'A published curriculum version cannot return to draft; create a new version'
        USING ERRCODE = 'check_violation';
    END IF;
    IF NEW.curriculum_id IS DISTINCT FROM OLD.curriculum_id
       OR NEW.version_label IS DISTINCT FROM OLD.version_label
       OR NEW.effective_from IS DISTINCT FROM OLD.effective_from
       OR NEW.published_at IS DISTINCT FROM OLD.published_at THEN
      RAISE EXCEPTION 'A published curriculum version is immutable except for archiving'
        USING ERRCODE = 'check_violation';
    END IF;
  ELSIF OLD.status = 'archived' THEN
    IF NEW.status <> 'archived' THEN
      RAISE EXCEPTION 'An archived curriculum version cannot be reopened'
        USING ERRCODE = 'check_violation';
    END IF;
  ELSIF NEW.status = 'published' THEN
    NEW.published_at := COALESCE(NEW.published_at, now());
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_curriculum_version_lifecycle ON public.curriculum_versions;
CREATE TRIGGER trg_curriculum_version_lifecycle
  BEFORE INSERT OR UPDATE OR DELETE ON public.curriculum_versions
  FOR EACH ROW EXECUTE FUNCTION public.curriculum_version_lifecycle();

-- 4. Immutable content once a version is not a draft ---------------------------
CREATE OR REPLACE FUNCTION public.curriculum_content_guard()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, public, pg_temp
AS $$
DECLARE
  v_row     jsonb;
  v_ver_ids uuid[] := ARRAY[]::uuid[];
  v_status  public.curriculum_status;
  v_id      uuid;
BEGIN
  -- Collect every version the change touches (old and new side).
  FOREACH v_row IN ARRAY ARRAY[
    CASE WHEN TG_OP IN ('UPDATE', 'DELETE') THEN to_jsonb(OLD) END,
    CASE WHEN TG_OP IN ('INSERT', 'UPDATE') THEN to_jsonb(NEW) END
  ] LOOP
    CONTINUE WHEN v_row IS NULL;
    IF TG_TABLE_NAME IN ('curriculum_units', 'curriculum_topics') THEN
      v_id := NULLIF(v_row ->> 'version_id', '')::uuid;
    ELSIF TG_TABLE_NAME = 'curriculum_prerequisites' THEN
      SELECT version_id INTO v_id FROM public.curriculum_topics WHERE id = (v_row ->> 'topic_id')::uuid;
    ELSIF TG_TABLE_NAME = 'curriculum_outcomes' THEN
      SELECT version_id INTO v_id FROM public.curriculum_topics WHERE id = (v_row ->> 'topic_id')::uuid;
    END IF;
    IF v_id IS NOT NULL THEN v_ver_ids := v_ver_ids || v_id; END IF;
  END LOOP;

  FOREACH v_id IN ARRAY v_ver_ids LOOP
    SELECT status INTO v_status FROM public.curriculum_versions WHERE id = v_id;
    -- NULL = parent already gone (cascade from deleting a draft version): allow.
    IF v_status IS NOT NULL AND v_status <> 'draft' THEN
      RAISE EXCEPTION 'Curriculum version is % and cannot be edited; create a new draft version', v_status
        USING ERRCODE = 'check_violation';
    END IF;
  END LOOP;

  RETURN CASE TG_OP WHEN 'DELETE' THEN OLD ELSE NEW END;
END;
$$;

DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['curriculum_units', 'curriculum_topics', 'curriculum_prerequisites', 'curriculum_outcomes'] LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS trg_%s_content_guard ON public.%I', t, t);
    EXECUTE format(
      'CREATE TRIGGER trg_%s_content_guard BEFORE INSERT OR UPDATE OR DELETE ON public.%I
         FOR EACH ROW EXECUTE FUNCTION public.curriculum_content_guard()', t, t);
  END LOOP;
END $$;

-- 5. Audit coverage ------------------------------------------------------------
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['curricula', 'curriculum_versions', 'curriculum_units', 'curriculum_topics',
                           'curriculum_prerequisites', 'curriculum_outcomes',
                           'assessment_blueprints', 'assessment_blueprint_items'] LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS trg_audit_%s ON public.%I', t, t);
    EXECUTE format(
      'CREATE TRIGGER trg_audit_%s AFTER INSERT OR UPDATE OR DELETE ON public.%I
         FOR EACH ROW EXECUTE FUNCTION public.audit_row_change()', t, t);
  END LOOP;
END $$;
