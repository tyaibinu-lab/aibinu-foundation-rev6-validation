-- ===== M3-A prompt governance =====
CREATE OR REPLACE FUNCTION public.ai_prompt_checksum(p_system text, p_user text, p_schema jsonb)
RETURNS text LANGUAGE sql IMMUTABLE STRICT SET search_path = pg_catalog, public, pg_temp AS $$
  SELECT encode(sha256(convert_to(
    'system_prompt:' || char_length(p_system)::text || ':' || p_system || chr(10) ||
    'user_template:' || char_length(p_user)::text || ':' || p_user || chr(10) ||
    'output_schema:' || char_length(p_schema::text)::text || ':' || p_schema::text, 'UTF8')), 'hex')
$$;
REVOKE ALL ON FUNCTION public.ai_prompt_checksum(text,text,jsonb) FROM PUBLIC, anon, authenticated;

ALTER TABLE public.ai_prompt_templates
  ADD COLUMN agent_code text REFERENCES public.ai_agents(code),
  ADD COLUMN state public.ai_prompt_state NOT NULL DEFAULT 'draft',
  ADD COLUMN checksum text,
  ADD COLUMN approved_by uuid REFERENCES public.users(id),
  ADD COLUMN effective_from timestamptz,
  ADD COLUMN retired_at timestamptz;

UPDATE public.ai_prompt_templates SET
  state = CASE WHEN is_active THEN 'active'::public.ai_prompt_state ELSE 'retired'::public.ai_prompt_state END,
  retired_at = CASE WHEN is_active THEN NULL ELSE created_at END,
  effective_from = created_at,
  agent_code = CASE job_type WHEN 'generate_questions' THEN 'question_bank'
                             WHEN 'generate_note' THEN 'lesson_note'
                             ELSE 'performance_analytics' END,
  checksum = public.ai_prompt_checksum(system_prompt, user_template, output_schema);

ALTER TABLE public.ai_prompt_templates
  ALTER COLUMN checksum SET NOT NULL,
  ADD CONSTRAINT ai_prompt_retired_chk CHECK ((state = 'retired') = (retired_at IS NOT NULL)),
  ADD CONSTRAINT ai_prompt_effective_chk CHECK (state = 'draft' OR effective_from IS NOT NULL),
  ADD CONSTRAINT ai_prompt_agent_chk CHECK (state = 'draft' OR agent_code IS NOT NULL),
  ADD CONSTRAINT ai_prompt_is_active_chk CHECK (is_active = (state = 'active'));
CREATE UNIQUE INDEX uq_prompt_one_active ON public.ai_prompt_templates(job_type) WHERE state = 'active';
CREATE INDEX ix_ai_prompt_templates_agent_code ON public.ai_prompt_templates(agent_code);
CREATE INDEX ix_ai_prompt_templates_approved_by ON public.ai_prompt_templates(approved_by);

CREATE OR REPLACE FUNCTION public.ai_prompt_governance()
RETURNS trigger LANGUAGE plpgsql SET search_path = pg_catalog, public, pg_temp AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.is_active AND NEW.state <> 'active' THEN
      RAISE EXCEPTION 'prompt_is_active_readonly: set state, not is_active';
    END IF;
    IF NEW.state = 'retired' THEN RAISE EXCEPTION 'prompt_invalid_state: cannot insert retired'; END IF;
    IF NEW.state = 'active' AND (NEW.approved_by IS NULL OR NEW.effective_from IS NULL) THEN
      RAISE EXCEPTION 'prompt_activation_requires_approval';
    END IF;
  ELSE
    IF NEW.is_active IS DISTINCT FROM OLD.is_active AND NEW.is_active IS DISTINCT FROM (NEW.state = 'active') THEN
      RAISE EXCEPTION 'prompt_is_active_readonly: set state, not is_active';
    END IF;
    IF NEW.id <> OLD.id OR NEW.created_at <> OLD.created_at THEN
      RAISE EXCEPTION 'prompt_immutable';
    END IF;
    IF OLD.state = 'draft' THEN
      IF NEW.state = 'retired' THEN RAISE EXCEPTION 'prompt_invalid_transition: draft -> retired'; END IF;
      IF NEW.state = 'active' AND (NEW.approved_by IS NULL OR NEW.effective_from IS NULL) THEN
        RAISE EXCEPTION 'prompt_activation_requires_approval';
      END IF;
      IF NEW.retired_at IS NOT NULL THEN RAISE EXCEPTION 'prompt_invalid_transition'; END IF;
    ELSE
      IF NEW.system_prompt IS DISTINCT FROM OLD.system_prompt OR NEW.user_template IS DISTINCT FROM OLD.user_template
         OR NEW.output_schema IS DISTINCT FROM OLD.output_schema OR NEW.version IS DISTINCT FROM OLD.version
         OR NEW.job_type IS DISTINCT FROM OLD.job_type OR NEW.agent_code IS DISTINCT FROM OLD.agent_code
         OR NEW.approved_by IS DISTINCT FROM OLD.approved_by OR NEW.effective_from IS DISTINCT FROM OLD.effective_from THEN
        RAISE EXCEPTION 'prompt_immutable: % template content is frozen', OLD.state;
      END IF;
      IF OLD.state = 'retired' THEN
        IF NEW.state <> 'retired' OR NEW.retired_at IS DISTINCT FROM OLD.retired_at THEN
          RAISE EXCEPTION 'prompt_invalid_transition: retired is terminal';
        END IF;
      ELSIF NEW.state = 'retired' THEN
        NEW.retired_at := COALESCE(NEW.retired_at, now());
      ELSIF NEW.state <> 'active' THEN
        RAISE EXCEPTION 'prompt_invalid_transition: active -> %', NEW.state;
      ELSIF NEW.retired_at IS NOT NULL THEN
        RAISE EXCEPTION 'prompt_invalid_transition';
      END IF;
    END IF;
  END IF;
  IF NEW.agent_code IS NOT NULL AND NOT EXISTS (
       SELECT 1 FROM ai_agents a WHERE a.code = NEW.agent_code AND NEW.job_type = ANY (a.job_types)) THEN
    RAISE EXCEPTION 'prompt_agent_mismatch: agent % does not serve %', NEW.agent_code, NEW.job_type;
  END IF;
  NEW.is_active := (NEW.state = 'active');
  NEW.checksum := ai_prompt_checksum(NEW.system_prompt, NEW.user_template, NEW.output_schema);
  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.ai_prompt_governance() FROM PUBLIC, anon, authenticated;
CREATE TRIGGER trg_ai_prompt_governance BEFORE INSERT OR UPDATE ON public.ai_prompt_templates
  FOR EACH ROW EXECUTE FUNCTION public.ai_prompt_governance();

-- ===== M3-B ai_jobs governance metadata (all nullable / safe defaults; no backfill) =====
ALTER TABLE public.ai_jobs
  ADD COLUMN agent_code text REFERENCES public.ai_agents(code),
  ADD COLUMN model_id text REFERENCES public.ai_model_registry(id),
  ADD COLUMN prompt_template_id uuid REFERENCES public.ai_prompt_templates(id) ON DELETE RESTRICT,
  ADD COLUMN requester_role text,
  ADD COLUMN source text NOT NULL DEFAULT 'app' CHECK (source IN ('app','scheduler','admin')),
  ADD COLUMN estimated_credits integer CHECK (estimated_credits >= 0),
  ADD COLUMN consumed_credits integer CHECK (consumed_credits >= 0),
  ADD COLUMN approval_required boolean NOT NULL DEFAULT false,
  ADD COLUMN approved_by uuid REFERENCES public.users(id),
  ADD COLUMN approved_at timestamptz,
  ADD COLUMN cancel_reason text CHECK (length(cancel_reason) <= 500),
  ADD COLUMN cancelled_by uuid REFERENCES public.users(id),
  ADD COLUMN timeout_seconds integer NOT NULL DEFAULT 120 CHECK (timeout_seconds BETWEEN 10 AND 900);
CREATE INDEX ix_ai_jobs_agent_code ON public.ai_jobs(agent_code);
CREATE INDEX ix_ai_jobs_model_id ON public.ai_jobs(model_id);
CREATE INDEX ix_ai_jobs_prompt_template_id ON public.ai_jobs(prompt_template_id);
CREATE INDEX ix_ai_jobs_approved_by ON public.ai_jobs(approved_by);
CREATE INDEX ix_ai_jobs_cancelled_by ON public.ai_jobs(cancelled_by);

-- ===== M3-C idempotency (C3) =====
CREATE OR REPLACE FUNCTION public.ai_reusable_key_statuses()
RETURNS public.ai_job_status[] LANGUAGE sql IMMUTABLE SET search_path = pg_catalog, public, pg_temp AS $$
  SELECT ARRAY['failed','cancelled','expired','rejected']::public.ai_job_status[]
$$;
REVOKE ALL ON FUNCTION public.ai_reusable_key_statuses() FROM PUBLIC, anon, authenticated;

DROP INDEX public.uq_ai_job_idem;
CREATE UNIQUE INDEX uq_ai_job_idem ON public.ai_jobs (organisation_id, idempotency_key)
  WHERE idempotency_key IS NOT NULL
    AND status NOT IN ('failed','cancelled','expired','rejected');

CREATE OR REPLACE FUNCTION public.enqueue_ai_job(p_type ai_job_type, p_input jsonb, p_target_type text, p_target_id uuid, p_student_id uuid, p_idempotency_key text, p_priority smallint DEFAULT 5)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'pg_temp'
AS $function$
DECLARE
  v_org     uuid := current_org_id();
  v_limit   integer;
  v_budget  bigint;
  v_id      uuid;
BEGIN
  IF NOT has_permission('ai.use') THEN RAISE EXCEPTION 'Permission denied: ai.use required'; END IF;
  IF NOT COALESCE((org_setting(v_org, 'ai_enabled', 'true'::jsonb) #>> '{}')::boolean, true) THEN
    RAISE EXCEPTION 'AI features are turned off for this organisation';
  END IF;

  IF p_idempotency_key IS NOT NULL THEN
    SELECT id INTO v_id FROM ai_jobs
    WHERE organisation_id = v_org AND idempotency_key = p_idempotency_key
      AND status <> ALL (ai_reusable_key_statuses());
    IF FOUND THEN RETURN v_id; END IF;
  END IF;

  v_limit := COALESCE((org_setting(v_org, 'ai_daily_job_limit', '100'::jsonb) #>> '{}')::integer, 100);
  IF (SELECT COUNT(*) FROM ai_jobs WHERE organisation_id = v_org
        AND created_at >= date_trunc('day', now()) AND status <> 'cancelled') >= v_limit THEN
    RAISE EXCEPTION 'Daily AI limit reached (% jobs). Try again tomorrow.', v_limit;
  END IF;

  v_budget := (org_setting(v_org, 'ai_monthly_budget_usd_micros', 'null'::jsonb) #>> '{}')::bigint;
  IF v_budget IS NOT NULL AND
     (SELECT COALESCE(SUM(cost_usd_micros), 0) FROM ai_usage_daily
      WHERE organisation_id = v_org AND day >= date_trunc('month', current_date)::date) >= v_budget THEN
    RAISE EXCEPTION 'The monthly AI budget has been reached';
  END IF;

  IF (SELECT COUNT(*) FROM ai_jobs WHERE organisation_id = v_org AND requested_by = current_user_id()
        AND status IN ('queued', 'running')) >= 10 THEN
    RAISE EXCEPTION 'You already have 10 AI jobs waiting; let some finish first';
  END IF;

  INSERT INTO ai_jobs (organisation_id, type, input, target_type, target_id, student_id,
                       idempotency_key, priority)
  VALUES (v_org, p_type, p_input, p_target_type, p_target_id, p_student_id,
          p_idempotency_key, p_priority)
  RETURNING id INTO v_id;
  RETURN v_id;
END;
$function$;

INSERT INTO public.schema_migrations (version, description)
VALUES ('011-m3', 'AI governance M3: prompt governance (R1-R5), ai_jobs metadata, C3 idempotency (Gate 10 v1.1)');