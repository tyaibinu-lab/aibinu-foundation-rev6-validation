-- Gate 8G-3 / P2: exam administration scoped to owner (created_by) unless org-wide (result.read_all).
CREATE OR REPLACE FUNCTION public.can_manage_exam(p_exam_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'pg_temp'
AS $function$
  SELECT has_permission('exam.create') AND EXISTS (
    SELECT 1 FROM exams e
    WHERE e.id = p_exam_id
      AND e.organisation_id = current_org_id()
      AND (has_permission('result.read_all') OR (e.created_by IS NOT NULL AND e.created_by = current_user_id())));
$function$;
REVOKE ALL ON FUNCTION public.can_manage_exam(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.can_manage_exam(uuid) TO authenticated, service_role;

DROP POLICY exams_update ON public.exams;
CREATE POLICY exams_update ON public.exams FOR UPDATE
  USING (organisation_id = (SELECT current_org_id()) AND (SELECT has_permission('exam.create'))
         AND status = ANY (ARRAY['draft'::exam_status, 'published'::exam_status])
         AND ((SELECT has_permission('result.read_all')) OR (created_by IS NOT NULL AND created_by = (SELECT current_user_id()))))
  WITH CHECK (organisation_id = (SELECT current_org_id()));

DROP POLICY exams_delete ON public.exams;
CREATE POLICY exams_delete ON public.exams FOR DELETE
  USING (organisation_id = (SELECT current_org_id()) AND (SELECT has_permission('exam.create'))
         AND status = 'draft'::exam_status
         AND ((SELECT has_permission('result.read_all')) OR (created_by IS NOT NULL AND created_by = (SELECT current_user_id()))));

DROP POLICY exam_questions_write ON public.exam_questions;
CREATE POLICY exam_questions_write ON public.exam_questions FOR ALL
  USING (organisation_id = (SELECT current_org_id()) AND public.can_manage_exam(exam_id))
  WITH CHECK (organisation_id = (SELECT current_org_id()) AND public.can_manage_exam(exam_id));

DROP POLICY exam_eligibility_write ON public.exam_eligibility;
CREATE POLICY exam_eligibility_write ON public.exam_eligibility FOR ALL
  USING (organisation_id = (SELECT current_org_id()) AND public.can_manage_exam(exam_id))
  WITH CHECK (organisation_id = (SELECT current_org_id()) AND public.can_manage_exam(exam_id));

CREATE OR REPLACE FUNCTION public.publish_exam(p_exam_id uuid)
 RETURNS void LANGUAGE plpgsql SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'pg_temp'
AS $function$
DECLARE
  v_ex exams%ROWTYPE;
BEGIN
  IF NOT has_permission('exam.create') THEN
    RAISE EXCEPTION 'Permission denied: exam.create required';
  END IF;
  SELECT * INTO v_ex FROM exams WHERE id = p_exam_id AND organisation_id = current_org_id();
  IF NOT FOUND THEN RAISE EXCEPTION 'Exam not found'; END IF;
  IF NOT can_manage_exam(p_exam_id) THEN
    RAISE EXCEPTION 'Permission denied: you can only manage exams you created';
  END IF;
  IF v_ex.status <> 'draft' THEN RAISE EXCEPTION 'Exam is already %', v_ex.status; END IF;
  IF NOT EXISTS (SELECT 1 FROM exam_questions WHERE exam_id = p_exam_id) THEN
    RAISE EXCEPTION 'Add questions before publishing';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM exam_eligibility WHERE exam_id = p_exam_id AND NOT is_blocked) THEN
    RAISE EXCEPTION 'Assign the exam to at least one class or student before publishing';
  END IF;
  IF v_ex.closes_at <= now() THEN
    RAISE EXCEPTION 'The closing time is already in the past';
  END IF;
  UPDATE exams SET status = 'published' WHERE id = p_exam_id;
END;
$function$;

CREATE OR REPLACE FUNCTION public.close_exam(p_exam_id uuid)
 RETURNS void LANGUAGE plpgsql SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'pg_temp'
AS $function$
DECLARE
  v_att uuid;
BEGIN
  IF NOT has_permission('exam.create') THEN
    RAISE EXCEPTION 'Permission denied: exam.create required';
  END IF;
  PERFORM 1 FROM exams WHERE id = p_exam_id AND organisation_id = current_org_id() AND status = 'published';
  IF NOT FOUND THEN RAISE EXCEPTION 'Published exam not found'; END IF;
  IF NOT can_manage_exam(p_exam_id) THEN
    RAISE EXCEPTION 'Permission denied: you can only manage exams you created';
  END IF;
  FOR v_att IN SELECT id FROM attempts WHERE exam_id = p_exam_id AND status = 'in_progress' LOOP
    PERFORM finalize_attempt(v_att, 'auto_submitted');
  END LOOP;
  UPDATE exams SET status = 'closed' WHERE id = p_exam_id;
END;
$function$;