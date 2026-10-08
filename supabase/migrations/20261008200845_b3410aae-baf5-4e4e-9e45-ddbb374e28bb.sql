-- Gate 8G-4 / P4: semantic audit events for exam publish/close, result release and manual marking.
CREATE OR REPLACE FUNCTION public.audit_cbt_event()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'pg_temp'
AS $function$
DECLARE
  v_action text; v_before jsonb; v_after jsonb;
BEGIN
  IF TG_TABLE_NAME = 'exams' THEN
    v_action := 'exam.' || NEW.status::text;   -- exam.published / exam.closed
    v_before := jsonb_build_object('status', OLD.status);
    v_after  := jsonb_build_object('status', NEW.status, 'title', NEW.title, 'created_by', NEW.created_by);
  ELSIF TG_TABLE_NAME = 'results' THEN
    v_action := 'result.released';
    v_before := jsonb_build_object('released_at', OLD.released_at);
    v_after  := jsonb_build_object('released_at', NEW.released_at, 'exam_id', NEW.exam_id,
                                   'attempt_id', NEW.attempt_id, 'student_id', NEW.student_id);
  ELSIF TG_TABLE_NAME = 'responses' THEN
    v_action := 'response.marked';
    v_before := jsonb_build_object('marks_awarded', OLD.marks_awarded, 'marking_status', OLD.marking_status,
                                   'marked_by', OLD.marked_by, 'has_feedback', OLD.feedback IS NOT NULL);
    v_after  := jsonb_build_object('marks_awarded', NEW.marks_awarded, 'marking_status', NEW.marking_status,
                                   'marked_by', NEW.marked_by, 'marked_at', NEW.marked_at,
                                   'has_feedback', NEW.feedback IS NOT NULL,
                                   'attempt_id', NEW.attempt_id, 'exam_question_id', NEW.exam_question_id,
                                   'student_id', NEW.student_id);
  ELSE
    RETURN NULL;
  END IF;

  INSERT INTO public.audit_events (organisation_id, actor_user_id, action, entity_type, entity_id,
                                   before_state, after_state, source)
  VALUES (NEW.organisation_id, public.current_user_id(), v_action, TG_TABLE_NAME, NEW.id::text,
          public.audit_redact(v_before), public.audit_redact(v_after), 'trigger');
  RETURN NULL;
END;
$function$;

REVOKE ALL ON FUNCTION public.audit_cbt_event() FROM PUBLIC, anon, authenticated;

CREATE TRIGGER trg_audit_exam_status
  AFTER UPDATE OF status ON public.exams
  FOR EACH ROW
  WHEN (OLD.status IS DISTINCT FROM NEW.status AND NEW.status IN ('published', 'closed'))
  EXECUTE FUNCTION public.audit_cbt_event();

CREATE TRIGGER trg_audit_result_release
  AFTER UPDATE OF released_at ON public.results
  FOR EACH ROW
  WHEN (OLD.released_at IS NULL AND NEW.released_at IS NOT NULL)
  EXECUTE FUNCTION public.audit_cbt_event();

CREATE TRIGGER trg_audit_response_marked
  AFTER UPDATE ON public.responses
  FOR EACH ROW
  WHEN (NEW.marking_status = 'marked' AND (
        OLD.marking_status IS DISTINCT FROM NEW.marking_status
     OR OLD.marks_awarded  IS DISTINCT FROM NEW.marks_awarded
     OR OLD.marked_by      IS DISTINCT FROM NEW.marked_by
     OR OLD.feedback       IS DISTINCT FROM NEW.feedback))
  EXECUTE FUNCTION public.audit_cbt_event();