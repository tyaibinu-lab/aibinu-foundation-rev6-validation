-- UNAPPLIED SOURCE CANDIDATE. Validation mdcmwhcjfpgewetsnunk only.
-- Ordered AFTER 20261011043814 (Step 2 v5.3); do not bootstrap/replay 001.
-- Kept outside tool-managed supabase/migrations until separate apply approval.
-- No table, policy, existing function, or existing privilege changes.
-- New RPC EXECUTE grants only; business routines remain SECURITY INVOKER.
-- Cooperative locks: direct table writers are NOT serialized by these RPCs.
-- READ COMMITTED required for post-wait reads to observe preceding commits.
BEGIN;
SET LOCAL lock_timeout = '10s';

DO $guard$
BEGIN
  IF to_regprocedure('public.unlink_student_guardian(uuid)') IS NOT NULL
     OR to_regprocedure('public.withdraw_enrolment(uuid)') IS NOT NULL THEN
    RAISE EXCEPTION 'Unlink/withdraw preflight: target function exists' USING ERRCODE = '42723';
  END IF;
  IF to_regprocedure('public.current_org_id()') IS NULL
     OR to_regprocedure('public.has_permission(text)') IS NULL
     OR to_regprocedure('public.lock_student_for_guardian_op(uuid)') IS NULL
     OR to_regprocedure('public.lock_student_for_class_op(uuid)') IS NULL
     OR to_regprocedure('public.add_student_guardian(uuid,text,text,text,text,text,boolean)') IS NULL
     OR to_regprocedure('public.set_primary_guardian(uuid,uuid)') IS NULL
     OR to_regprocedure('public.assign_student_class(uuid,uuid)') IS NULL
     OR to_regclass('public.uq_one_primary_parent') IS NULL
     OR to_regclass('public.uq_one_active_enrolment') IS NULL THEN
    RAISE EXCEPTION 'Unlink/withdraw preflight: Step 2 dependency missing' USING ERRCODE = '42704';
  END IF;
END
$guard$;

-- Delete ONLY the link; retain its parent. A primary with other links cannot
-- be removed until another link is made primary. The last link (primary or
-- not) MAY be removed, leaving zero links/primaries: the schema allows this.
-- No implicit promotion and no new exactly-one-primary rule.
CREATE FUNCTION public.unlink_student_guardian(p_link_id uuid)
RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY INVOKER
SET search_path = pg_catalog, public, pg_temp
AS $$
DECLARE
  v_org uuid := public.current_org_id();
  v_student uuid;
  v_primary boolean;
BEGIN
  IF p_link_id IS NULL THEN
    RAISE EXCEPTION 'Guardian link is required' USING ERRCODE = '22023';
  END IF;
  IF v_org IS NULL THEN
    RAISE EXCEPTION 'No active organisation' USING ERRCODE = '42501';
  END IF;
  IF NOT public.has_permission('student.manage') THEN
    RAISE EXCEPTION 'Permission denied: student.manage required' USING ERRCODE = '42501';
  END IF;

  -- Identity lookup only (RLS); do not take a row lock before the advisory lock.
  SELECT sp.student_id INTO v_student FROM public.student_parents sp
   WHERE sp.id = p_link_id AND sp.organisation_id = v_org;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Guardian link not found' USING ERRCODE = 'P0002';
  END IF;
  PERFORM public.lock_student_for_guardian_op(v_student);

  -- Revalidate AFTER acquiring the same lock as add/set-primary.
  SELECT sp.is_primary INTO v_primary FROM public.student_parents sp
   WHERE sp.id = p_link_id AND sp.student_id = v_student AND sp.organisation_id = v_org
   FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Guardian link not found' USING ERRCODE = 'P0002';
  END IF;
  IF v_primary AND EXISTS (
    SELECT 1 FROM public.student_parents sp
     WHERE sp.student_id = v_student AND sp.organisation_id = v_org AND sp.id <> p_link_id
  ) THEN
    RAISE EXCEPTION 'Make another guardian primary before unlinking this guardian' USING ERRCODE = '22023';
  END IF;

  DELETE FROM public.student_parents
   WHERE id = p_link_id AND student_id = v_student AND organisation_id = v_org;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Guardian link could not be removed' USING ERRCODE = '42501';
  END IF;
  RETURN jsonb_build_object('ok', true, 'link_id', p_link_id, 'student_id', v_student);
END;
$$;

-- Withdraw only an ACTIVE enrolment. Repeated/stale requests reject rather
-- than overwriting transferred/completed history. Uses database CURRENT_DATE,
-- not the browser clock. Future enrolled_on is rejected (existing date CHECK)
-- rather than silently substituting a future end date.
CREATE FUNCTION public.withdraw_enrolment(p_enrolment_id uuid)
RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY INVOKER
SET search_path = pg_catalog, public, pg_temp
AS $$
DECLARE
  v_org uuid := public.current_org_id();
  v_student uuid;
  v_status public.enrolment_status;
  v_enrolled_on date;
BEGIN
  IF p_enrolment_id IS NULL THEN
    RAISE EXCEPTION 'Enrolment is required' USING ERRCODE = '22023';
  END IF;
  IF v_org IS NULL THEN
    RAISE EXCEPTION 'No active organisation' USING ERRCODE = '42501';
  END IF;
  IF NOT public.has_permission('class.manage') THEN
    RAISE EXCEPTION 'Permission denied: class.manage required' USING ERRCODE = '42501';
  END IF;

  SELECT e.student_id INTO v_student FROM public.enrolments e
   WHERE e.id = p_enrolment_id AND e.organisation_id = v_org;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Enrolment not found' USING ERRCODE = 'P0002';
  END IF;
  PERFORM public.lock_student_for_class_op(v_student);

  SELECT e.status, e.enrolled_on INTO v_status, v_enrolled_on FROM public.enrolments e
   WHERE e.id = p_enrolment_id AND e.student_id = v_student AND e.organisation_id = v_org
   FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Enrolment not found' USING ERRCODE = 'P0002';
  END IF;
  IF v_status <> 'active' THEN
    RAISE EXCEPTION 'Only an active enrolment can be withdrawn' USING ERRCODE = '22023';
  END IF;
  IF v_enrolled_on > CURRENT_DATE THEN
    RAISE EXCEPTION 'Cannot withdraw an enrolment before its start date' USING ERRCODE = '22023';
  END IF;

  UPDATE public.enrolments SET status = 'withdrawn', ended_on = CURRENT_DATE
   WHERE id = p_enrolment_id AND student_id = v_student AND organisation_id = v_org AND status = 'active';
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Enrolment could not be withdrawn' USING ERRCODE = '42501';
  END IF;
  RETURN jsonb_build_object('ok', true, 'enrolment_id', p_enrolment_id, 'student_id', v_student,
                            'ended_on', CURRENT_DATE);
END;
$$;

REVOKE ALL ON FUNCTION public.unlink_student_guardian(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.withdraw_enrolment(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.unlink_student_guardian(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.withdraw_enrolment(uuid) TO authenticated;
ALTER FUNCTION public.unlink_student_guardian(uuid) OWNER TO postgres;
ALTER FUNCTION public.withdraw_enrolment(uuid) OWNER TO postgres;
COMMIT;

-- Rollback requires reverting the two API calls first; never drop lock helpers.
-- DROP FUNCTION public.unlink_student_guardian(uuid);
-- DROP FUNCTION public.withdraw_enrolment(uuid);