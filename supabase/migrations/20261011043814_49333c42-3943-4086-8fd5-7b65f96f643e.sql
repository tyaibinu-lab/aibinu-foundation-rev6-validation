-- =====================================================================
-- Rev6 Step 2 (v5.3 STATIC CANDIDATE, NOT APPLIED; derived from v5 md5 b851dd1280afa7f6ef68837b71c61364): atomic student/guardian ops
-- Target: validation project mdcmwhcjfpgewetsnunk only. Forward-only, additive.
-- No tables, columns, policies or table grants change; no existing function is
-- replaced (none of these names existed live at last read-only inspection).
--
-- v5 changes vs v4 (see rev6-step2-v4-v5-security-diff.md):
--   V5-1 Both lock helpers reject NULL p_student_id with 22023 (v4 fell through
--        to P0002 "Student not found").
--   V5-2 Business functions validate input BEFORE permission checks are reached
--        only for NULLs; permission is still checked before any row is read.
--   V5-3 Helpers pin statement-level lock_timeout only; comments corrected:
--        lock_timeout bounds how long a WAITER waits to ACQUIRE the lock
--        (then 55P03). It does NOT bound how long a holder keeps it. Holding
--        time is bounded by the holder's transaction length: for Data API
--        (PostgREST) callers, one RPC = one transaction, further capped by the
--        role's statement_timeout. A direct SQL session (owner/service role)
--        can hold a lock indefinitely; client roles have no direct SQL access.
--   V5-4 set_primary_guardian / add_student_guardian also re-check the target
--        link / new link row count, and add_student_guardian rejects
--        over-long phone/email/whatsapp (> 50 / 254 / 50 chars).
--   V5-5 Explicit REVOKE ... FROM PUBLIC, anon kept; authenticated EXECUTE on
--        helpers RETAINED (required, see below). service_role not granted.
--
-- v5.3 changes vs v5 (see rev6-step2-v5.3-changelog.md):
--   V53-1 Pre-apply guard: aborts (no changes) if any of the five functions
--         already exist, or if current_org_id()/has_permission(text),
--         uq_one_active_enrolment or uq_one_primary_parent are missing.
--   V53-2 Explicit ALTER FUNCTION ... OWNER TO postgres for all five, so the
--         SECURITY DEFINER helpers' effective role is fixed and auditable.
--   V53-3 SET LOCAL lock_timeout = '10s' at migration start so the DDL cannot
--         queue indefinitely behind live traffic; statement_timeout untouched.
--   V53-4 D1 confirmed: helpers stay in schema public (no new schema).
--   Function bodies, signatures, search_path and grants are byte-identical to v5.
--
-- WHY THE LOCK HELPERS KEEP authenticated EXECUTE (residual risk R1):
--   The three business functions are SECURITY INVOKER, so they run as the
--   caller ("authenticated") and every nested call is privilege-checked as
--   that role. Revoking EXECUTE on the helpers from authenticated breaks the
--   business RPCs with 42501. Alternatives considered:
--     (a) make business functions SECURITY DEFINER -> rejected: bypasses RLS,
--         violates the approved SECURITY INVOKER design.
--     (b) move helpers to schema "private" -> rejected: that schema is the
--         payment-secret boundary (006); granting USAGE to authenticated
--         would weaken it.
--     (c) NEW non-exposed schema (e.g. app_internal, not in PostgREST
--         db-schemas) with USAGE+EXECUTE to authenticated -> removes
--         standalone /rpc exposure while keeping invoker semantics. This is
--         a new architectural object, so it is NOT included; it is offered as
--         design decision D1 for approval.
--   Compensating controls: each helper requires active org membership via
--   current_org_id(), its specific permission, and an existing student in
--   that org; it reads one row, writes nothing, returns void. A direct /rpc
--   call can only lock a student the caller is already authorised to modify,
--   and the lock is released when that single request's transaction ends.
--
-- ADVISORY-LOCK LIMITATIONS:
--   * Not private: pg_advisory_xact_lock is executable by PUBLIC and keys are
--     derivable. Any role with a raw SQL session could take the key. Client
--     roles reach the DB only through PostgREST, which cannot call
--     pg_catalog functions as RPC, so this is limited to trusted SQL users.
--   * Hash collisions: keys are 64-bit hashtextextended values over
--     ('rev6_step2:<ns>:' || student_id). A collision causes only spurious
--     serialisation; never merged state or a skipped check, because every
--     write is scoped by student_id/org and backed by uq_one_active_enrolment
--     and uq_one_primary_parent.
--   * Advisory locks only serialise callers that use these functions. Legacy
--     direct table writes (current app client code) do not take them; the
--     unique indexes remain the correctness backstop for those paths.
-- =====================================================================

BEGIN;
SET LOCAL lock_timeout = '10s';

DO $guard$
BEGIN
  IF to_regprocedure('public.lock_student_for_class_op(uuid)') IS NOT NULL
  OR to_regprocedure('public.lock_student_for_guardian_op(uuid)') IS NOT NULL
  OR to_regprocedure('public.assign_student_class(uuid,uuid)') IS NOT NULL
  OR to_regprocedure('public.set_primary_guardian(uuid,uuid)') IS NOT NULL
  OR to_regprocedure('public.add_student_guardian(uuid,text,text,text,text,text,boolean)') IS NOT NULL THEN
    RAISE EXCEPTION 'Step 2 preflight: a target function already exists; aborting' USING ERRCODE = '42723';
  END IF;
  IF to_regprocedure('public.current_org_id()') IS NULL
  OR to_regprocedure('public.has_permission(text)') IS NULL
  OR to_regclass('public.uq_one_active_enrolment') IS NULL
  OR to_regclass('public.uq_one_primary_parent') IS NULL THEN
    RAISE EXCEPTION 'Step 2 preflight: required dependency missing; aborting' USING ERRCODE = '42704';
  END IF;
END
$guard$;

-- ---------------------------------------------------------------------
-- Internal lock for class/enrolment operations on one student.
-- ---------------------------------------------------------------------
CREATE FUNCTION public.lock_student_for_class_op(p_student_id uuid)
RETURNS void
LANGUAGE plpgsql VOLATILE SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
SET lock_timeout = '5s'
AS $$
DECLARE
  v_org uuid := public.current_org_id();
BEGIN
  IF p_student_id IS NULL THEN
    RAISE EXCEPTION 'student is required' USING ERRCODE = '22023';
  END IF;
  IF v_org IS NULL THEN
    RAISE EXCEPTION 'No active organisation' USING ERRCODE = '42501';
  END IF;
  IF NOT public.has_permission('class.manage') THEN
    RAISE EXCEPTION 'Permission denied: class.manage required' USING ERRCODE = '42501';
  END IF;
  PERFORM 1 FROM public.students s
   WHERE s.id = p_student_id AND s.organisation_id = v_org AND s.deleted_at IS NULL;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Student not found' USING ERRCODE = 'P0002';
  END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended('rev6_step2:class:' || p_student_id::text, 0));
END;
$$;

-- ---------------------------------------------------------------------
-- Internal lock for guardian operations on one student. Strictly
-- student.manage: a class-only user cannot acquire it and cannot delay
-- guardian operations.
-- ---------------------------------------------------------------------
CREATE FUNCTION public.lock_student_for_guardian_op(p_student_id uuid)
RETURNS void
LANGUAGE plpgsql VOLATILE SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
SET lock_timeout = '5s'
AS $$
DECLARE
  v_org uuid := public.current_org_id();
BEGIN
  IF p_student_id IS NULL THEN
    RAISE EXCEPTION 'student is required' USING ERRCODE = '22023';
  END IF;
  IF v_org IS NULL THEN
    RAISE EXCEPTION 'No active organisation' USING ERRCODE = '42501';
  END IF;
  IF NOT public.has_permission('student.manage') THEN
    RAISE EXCEPTION 'Permission denied: student.manage required' USING ERRCODE = '42501';
  END IF;
  PERFORM 1 FROM public.students s
   WHERE s.id = p_student_id AND s.organisation_id = v_org AND s.deleted_at IS NULL;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Student not found' USING ERRCODE = 'P0002';
  END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended('rev6_step2:guardian:' || p_student_id::text, 0));
END;
$$;

-- ---------------------------------------------------------------------
-- A. Assign or transfer a class (target class's academic session only).
-- Active enrolments in other sessions are untouched (uq_one_active_enrolment
-- is per session; matches current client behaviour). No capacity rule exists.
-- ---------------------------------------------------------------------
CREATE FUNCTION public.assign_student_class(p_student_id uuid, p_class_id uuid)
RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY INVOKER
SET search_path = pg_catalog, public, pg_temp
AS $$
DECLARE
  v_org     uuid := public.current_org_id();
  v_session uuid;
  v_old     uuid[];
  v_new     uuid;
BEGIN
  IF p_student_id IS NULL OR p_class_id IS NULL THEN
    RAISE EXCEPTION 'student and class are required' USING ERRCODE = '22023';
  END IF;
  IF v_org IS NULL THEN
    RAISE EXCEPTION 'No active organisation' USING ERRCODE = '42501';
  END IF;
  IF NOT public.has_permission('class.manage') THEN
    RAISE EXCEPTION 'Permission denied: class.manage required' USING ERRCODE = '42501';
  END IF;

  PERFORM public.lock_student_for_class_op(p_student_id);  -- verifies org + student, then locks
  -- Statements below start after the lock, so under READ COMMITTED they see any
  -- enrolment committed by a concurrent call that held the lock first.

  SELECT c.academic_session_id INTO v_session
    FROM public.classes c WHERE c.id = p_class_id AND c.organisation_id = v_org;
  IF v_session IS NULL THEN
    RAISE EXCEPTION 'Class not found' USING ERRCODE = 'P0002';
  END IF;

  IF EXISTS (SELECT 1 FROM public.enrolments e
             WHERE e.student_id = p_student_id AND e.academic_session_id = v_session
               AND e.organisation_id = v_org AND e.status = 'active' AND e.class_id = p_class_id) THEN
    RAISE EXCEPTION 'The student is already in this class' USING ERRCODE = '22023';
  END IF;

  WITH closed AS (
    UPDATE public.enrolments e
       SET status = 'transferred', ended_on = GREATEST(CURRENT_DATE, e.enrolled_on)
     WHERE e.student_id = p_student_id AND e.academic_session_id = v_session
       AND e.organisation_id = v_org AND e.status = 'active'
    RETURNING e.id)
  SELECT coalesce(array_agg(id), '{}') INTO v_old FROM closed;

  -- Any failure here rolls back the transfer above as well.
  INSERT INTO public.enrolments (organisation_id, student_id, class_id, academic_session_id, status, enrolled_on)
  VALUES (v_org, p_student_id, p_class_id, v_session, 'active', CURRENT_DATE)
  RETURNING id INTO v_new;

  RETURN jsonb_build_object('ok', true, 'enrolment_id', v_new, 'academic_session_id', v_session,
                            'transferred_enrolment_ids', to_jsonb(v_old));
END;
$$;

-- ---------------------------------------------------------------------
-- B. Change the primary guardian. Rule preserved: AT MOST one primary.
-- ---------------------------------------------------------------------
CREATE FUNCTION public.set_primary_guardian(p_student_id uuid, p_link_id uuid)
RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY INVOKER
SET search_path = pg_catalog, public, pg_temp
AS $$
DECLARE
  v_org  uuid := public.current_org_id();
  v_prev uuid;
BEGIN
  IF p_student_id IS NULL OR p_link_id IS NULL THEN
    RAISE EXCEPTION 'student and guardian link are required' USING ERRCODE = '22023';
  END IF;
  IF v_org IS NULL THEN
    RAISE EXCEPTION 'No active organisation' USING ERRCODE = '42501';
  END IF;
  IF NOT public.has_permission('student.manage') THEN
    RAISE EXCEPTION 'Permission denied: student.manage required' USING ERRCODE = '42501';
  END IF;

  PERFORM public.lock_student_for_guardian_op(p_student_id);

  IF NOT EXISTS (SELECT 1 FROM public.student_parents sp
                 WHERE sp.id = p_link_id AND sp.student_id = p_student_id AND sp.organisation_id = v_org) THEN
    RAISE EXCEPTION 'Guardian is not linked to this student' USING ERRCODE = 'P0002';
  END IF;

  SELECT sp.id INTO v_prev FROM public.student_parents sp
   WHERE sp.student_id = p_student_id AND sp.organisation_id = v_org AND sp.is_primary;
  IF v_prev = p_link_id THEN
    RETURN jsonb_build_object('ok', true, 'primary_link_id', p_link_id, 'previous_link_id', v_prev, 'changed', false);
  END IF;

  UPDATE public.student_parents SET is_primary = false
   WHERE student_id = p_student_id AND organisation_id = v_org AND is_primary;
  UPDATE public.student_parents SET is_primary = true
   WHERE id = p_link_id AND student_id = p_student_id AND organisation_id = v_org;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Guardian link could not be updated' USING ERRCODE = '42501';
  END IF;

  RETURN jsonb_build_object('ok', true, 'primary_link_id', p_link_id, 'previous_link_id', v_prev, 'changed', true);
END;
$$;

-- ---------------------------------------------------------------------
-- C. Create a guardian and link it in one transaction. Every call creates a
-- NEW parent row (no reuse rule exists), so (student_id, parent_id) cannot
-- duplicate; any failure also rolls back the parent insert (no orphan).
-- ---------------------------------------------------------------------
CREATE FUNCTION public.add_student_guardian(
  p_student_id uuid, p_full_name text, p_phone text, p_email text, p_whatsapp text,
  p_relationship text, p_is_primary boolean DEFAULT false)
RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY INVOKER
SET search_path = pg_catalog, public, pg_temp
AS $$
DECLARE
  v_org     uuid := public.current_org_id();
  v_name    text := btrim(coalesce(p_full_name, ''));
  v_primary boolean := coalesce(p_is_primary, false);
  v_parent  uuid;
  v_link    uuid;
BEGIN
  IF p_student_id IS NULL THEN RAISE EXCEPTION 'student is required' USING ERRCODE = '22023'; END IF;
  IF v_org IS NULL THEN RAISE EXCEPTION 'No active organisation' USING ERRCODE = '42501'; END IF;
  IF NOT (public.has_permission('student.manage') AND public.has_permission('parent.manage')) THEN
    RAISE EXCEPTION 'Permission denied: student.manage and parent.manage required' USING ERRCODE = '42501';
  END IF;
  IF length(v_name) < 2 OR length(v_name) > 150 THEN
    RAISE EXCEPTION 'Guardian name must be 2-150 characters' USING ERRCODE = '22023';
  END IF;
  IF p_relationship IS NULL OR p_relationship NOT IN ('mother','father','guardian','sponsor') THEN
    RAISE EXCEPTION 'Invalid relationship' USING ERRCODE = '22023';
  END IF;
  IF nullif(btrim(coalesce(p_phone,'')),'') IS NULL AND nullif(btrim(coalesce(p_email,'')),'') IS NULL THEN
    RAISE EXCEPTION 'Provide a phone number or email for the guardian' USING ERRCODE = '22023';
  END IF;
  IF length(coalesce(p_phone,'')) > 50 OR length(coalesce(p_whatsapp,'')) > 50
     OR length(coalesce(p_email,'')) > 254 THEN
    RAISE EXCEPTION 'Guardian contact details are too long' USING ERRCODE = '22023';
  END IF;

  PERFORM public.lock_student_for_guardian_op(p_student_id);

  INSERT INTO public.parents (organisation_id, full_name, phone, email, whatsapp)
  VALUES (v_org, v_name, nullif(btrim(p_phone),''), nullif(btrim(p_email),''), nullif(btrim(p_whatsapp),''))
  RETURNING id INTO v_parent;

  IF v_primary THEN
    UPDATE public.student_parents SET is_primary = false
     WHERE student_id = p_student_id AND organisation_id = v_org AND is_primary;
  END IF;

  INSERT INTO public.student_parents (organisation_id, student_id, parent_id, relationship, is_primary)
  VALUES (v_org, p_student_id, v_parent, p_relationship, v_primary)
  RETURNING id INTO v_link;
  IF v_link IS NULL THEN
    RAISE EXCEPTION 'Guardian link could not be created' USING ERRCODE = '42501';
  END IF;

  RETURN jsonb_build_object('ok', true, 'parent_id', v_parent, 'link_id', v_link, 'is_primary', v_primary);
END;
$$;

-- Grants: no PUBLIC/anon access. authenticated needs EXECUTE on the two lock
-- helpers because the invoker functions call them as the user; each helper
-- re-verifies org, its specific permission, and the student itself.
REVOKE ALL ON FUNCTION public.lock_student_for_class_op(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.lock_student_for_guardian_op(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.assign_student_class(uuid, uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.set_primary_guardian(uuid, uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.add_student_guardian(uuid, text, text, text, text, text, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.lock_student_for_class_op(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.lock_student_for_guardian_op(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.assign_student_class(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.set_primary_guardian(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.add_student_guardian(uuid, text, text, text, text, text, boolean) TO authenticated;

-- V53-2 explicit ownership
ALTER FUNCTION public.lock_student_for_class_op(uuid) OWNER TO postgres;
ALTER FUNCTION public.lock_student_for_guardian_op(uuid) OWNER TO postgres;
ALTER FUNCTION public.assign_student_class(uuid, uuid) OWNER TO postgres;
ALTER FUNCTION public.set_primary_guardian(uuid, uuid) OWNER TO postgres;
ALTER FUNCTION public.add_student_guardian(uuid, text, text, text, text, text, boolean) OWNER TO postgres;

COMMIT;

-- Rollback (only safe while no app code calls these):
-- DROP FUNCTION IF EXISTS public.add_student_guardian(uuid, text, text, text, text, text, boolean);
-- DROP FUNCTION IF EXISTS public.set_primary_guardian(uuid, uuid);
-- DROP FUNCTION IF EXISTS public.assign_student_class(uuid, uuid);
-- DROP FUNCTION IF EXISTS public.lock_student_for_guardian_op(uuid);
-- DROP FUNCTION IF EXISTS public.lock_student_for_class_op(uuid);
