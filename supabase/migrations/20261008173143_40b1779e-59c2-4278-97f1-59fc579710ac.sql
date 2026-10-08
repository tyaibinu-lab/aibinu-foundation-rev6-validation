-- Gate 8G-2 / P3: server-controlled provenance for exams and exam_eligibility.
CREATE OR REPLACE FUNCTION public.stamp_created_by()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'pg_catalog', 'public', 'pg_temp'
AS $function$
BEGIN
  -- Only direct client (Data API) writes are stamped; service/definer paths are unchanged.
  IF current_user IN ('anon', 'authenticated') THEN
    IF TG_OP = 'INSERT' THEN
      NEW.created_by := current_user_id();
    ELSE
      NEW.created_by := OLD.created_by;
    END IF;
  END IF;
  RETURN NEW;
END;
$function$;

REVOKE ALL ON FUNCTION public.stamp_created_by() FROM PUBLIC, anon, authenticated;

CREATE TRIGGER trg_exams_stamp_created_by
  BEFORE INSERT OR UPDATE OF created_by ON public.exams
  FOR EACH ROW EXECUTE FUNCTION public.stamp_created_by();

CREATE TRIGGER trg_elig_stamp_created_by
  BEFORE INSERT OR UPDATE OF created_by ON public.exam_eligibility
  FOR EACH ROW EXECUTE FUNCTION public.stamp_created_by();