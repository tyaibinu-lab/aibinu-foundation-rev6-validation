DO $$
DECLARE d text := pg_get_functiondef('public.enqueue_ai_job(ai_job_type,jsonb,text,uuid,uuid,text,smallint)'::regprocedure);
        a1 text := 'p_type::text = ANY (job_types)'; a2 text := 'SELECT p.*, op.approval_threshold_override INTO pl';
BEGIN
  IF position(a1 in d) = 0 OR position(a2 in d) = 0 THEN RAISE EXCEPTION 'anchor not found'; END IF;
  d := replace(d, a1, 'p_type = ANY (job_types)');
  d := replace(d, a2, 'SELECT p.* INTO pl');
  EXECUTE d;
END $$;
UPDATE public.schema_migrations SET description = description || ' (+ enqueue job-type comparison fix)' WHERE version = '011-m6a';