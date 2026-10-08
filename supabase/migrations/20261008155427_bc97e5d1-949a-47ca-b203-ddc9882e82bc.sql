CREATE OR REPLACE FUNCTION public.release_results(p_exam_id uuid, p_force boolean DEFAULT false)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'pg_temp'
AS $function$
BEGIN
  IF NOT has_permission('result.release') THEN
    RAISE EXCEPTION 'Permission denied: result.release required';
  END IF;
  PERFORM 1 FROM exams WHERE id = p_exam_id AND organisation_id = current_org_id();
  IF NOT FOUND THEN RAISE EXCEPTION 'Exam not found'; END IF;
  -- Gate 8G-1 / P1: callers without result.read_all may only release an exam
  -- when every result on it is visible to them via staff_can_view_results().
  IF NOT has_permission('result.read_all') AND EXISTS (
       SELECT 1 FROM results r
       WHERE r.exam_id = p_exam_id
         AND NOT staff_can_view_results(r.student_id)) THEN
    RAISE EXCEPTION 'Permission denied: results outside your classes';
  END IF;
  RETURN release_results_internal(p_exam_id, p_force);
END;
$function$;