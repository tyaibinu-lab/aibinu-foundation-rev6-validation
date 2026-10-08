CREATE EXTENSION IF NOT EXISTS btree_gist WITH SCHEMA extensions;

-- 1. Model registry (no secrets)
CREATE TABLE public.ai_model_registry (
  id text PRIMARY KEY,
  provider text NOT NULL,
  provider_model text NOT NULL,
  state public.ai_model_state NOT NULL DEFAULT 'disabled',
  safety_classes public.ai_safety_class[] NOT NULL,
  context_tokens integer NOT NULL CHECK (context_tokens > 0),
  input_usd_micros_per_1k bigint,
  output_usd_micros_per_1k bigint,
  credit_multiplier numeric(6,3) NOT NULL DEFAULT 1 CHECK (credit_multiplier > 0),
  retired_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (state <> 'retired' OR retired_at IS NOT NULL)
);
REVOKE ALL ON public.ai_model_registry FROM PUBLIC, anon, authenticated;
GRANT SELECT (id, provider, provider_model, state, safety_classes, context_tokens, credit_multiplier, retired_at, created_at, updated_at)
  ON public.ai_model_registry TO authenticated;
GRANT ALL ON public.ai_model_registry TO service_role;
ALTER TABLE public.ai_model_registry ENABLE ROW LEVEL SECURITY;
CREATE POLICY ai_model_registry_read ON public.ai_model_registry FOR SELECT TO authenticated
  USING ((SELECT public.is_org_member()));
CREATE TRIGGER trg_ai_model_registry_updated BEFORE UPDATE ON public.ai_model_registry
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- 2. Agent registry
CREATE TABLE public.ai_agents (
  code text PRIMARY KEY CHECK (code ~ '^[a-z][a-z0-9_]{2,40}$'),
  name text NOT NULL,
  description text,
  job_types public.ai_job_type[] NOT NULL,
  required_permission text NOT NULL REFERENCES public.permissions(code),
  safety_class public.ai_safety_class NOT NULL,
  default_model_id text REFERENCES public.ai_model_registry(id),
  fallback_model_id text REFERENCES public.ai_model_registry(id),
  credit_base integer NOT NULL DEFAULT 0 CHECK (credit_base >= 0),
  max_batch smallint CHECK (max_batch BETWEEN 1 AND 20),
  enabled boolean NOT NULL DEFAULT false,
  version integer NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX ix_ai_agents_required_permission ON public.ai_agents(required_permission);
CREATE INDEX ix_ai_agents_default_model ON public.ai_agents(default_model_id);
CREATE INDEX ix_ai_agents_fallback_model ON public.ai_agents(fallback_model_id);
REVOKE ALL ON public.ai_agents FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.ai_agents TO authenticated;
GRANT ALL ON public.ai_agents TO service_role;
ALTER TABLE public.ai_agents ENABLE ROW LEVEL SECURITY;
CREATE POLICY ai_agents_read ON public.ai_agents FOR SELECT TO authenticated
  USING ((SELECT public.is_org_member()));
CREATE TRIGGER trg_ai_agents_updated BEFORE UPDATE ON public.ai_agents
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

INSERT INTO public.ai_agents (code, name, description, job_types, required_permission, safety_class, enabled) VALUES
 ('lesson_note', 'Lesson-Note Agent', 'Drafts lesson notes into the NoteBank review workflow', '{generate_note}', 'academic.notes.write', 'staff_generation', true),
 ('question_bank', 'Question Bank Agent', 'Drafts questions into the Question Bank review workflow', '{generate_questions}', 'academic.questions.write', 'staff_generation', true),
 ('marking_assistant', 'Marking Assistant', 'Reserved: recommends marks only; humans mark via mark_response', '{}', 'result.mark', 'staff_assist', false),
 ('student_tutor', 'Student AI Tutor', 'Reserved: explanatory interaction only; no scoring or exam access', '{}', 'ai.use', 'student_facing', false),
 ('performance_analytics', 'Performance & Intervention Analytics', 'Student reviews, diagnosis explanations and report comments as drafts', '{review_student,explain_diagnosis,report_comment}', 'cas.manage', 'analytics', true);

-- 3. Plan catalogue (no currency fields)
CREATE TABLE public.ai_plans (
  code text PRIMARY KEY,
  name text NOT NULL,
  monthly_credit_grant integer NOT NULL CHECK (monthly_credit_grant >= 0),
  allowed_agents text[] NOT NULL,
  allowed_models text[] NOT NULL,
  daily_job_limit integer NOT NULL CHECK (daily_job_limit > 0),
  max_concurrent_jobs integer NOT NULL DEFAULT 5,
  per_user_daily_jobs integer NOT NULL DEFAULT 10,
  approval_threshold_credits integer,
  grant_expires_after_days integer,
  fair_use jsonb NOT NULL DEFAULT '{}',
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
REVOKE ALL ON public.ai_plans FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.ai_plans TO authenticated;
GRANT ALL ON public.ai_plans TO service_role;
ALTER TABLE public.ai_plans ENABLE ROW LEVEL SECURITY;
CREATE POLICY ai_plans_read ON public.ai_plans FOR SELECT TO authenticated
  USING ((SELECT public.is_org_member()));
CREATE TRIGGER trg_ai_plans_updated BEFORE UPDATE ON public.ai_plans
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

INSERT INTO public.ai_plans (code, name, monthly_credit_grant, allowed_agents, allowed_models, daily_job_limit, max_concurrent_jobs, per_user_daily_jobs, fair_use)
VALUES ('validation_default', 'Validation default (non-commercial)', 0,
        '{lesson_note,question_bank,performance_analytics}', '{}', 100, 5, 10,
        '{"note":"validation-only baseline mirroring Rev6 defaults; credit grant set before credit enforcement"}');

-- 4. Organisation plan assignment
CREATE TABLE public.ai_org_plans (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organisation_id uuid NOT NULL REFERENCES public.organisations(id),
  plan_code text NOT NULL REFERENCES public.ai_plans(code),
  effective_from timestamptz NOT NULL,
  effective_to timestamptz,
  approval_threshold_override integer,
  assigned_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (effective_to IS NULL OR effective_to > effective_from),
  EXCLUDE USING gist (organisation_id WITH =, tstzrange(effective_from, effective_to) WITH &&)
);
CREATE INDEX ix_ai_org_plans_org_from ON public.ai_org_plans(organisation_id, effective_from);
CREATE INDEX ix_ai_org_plans_plan ON public.ai_org_plans(plan_code);
REVOKE ALL ON public.ai_org_plans FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.ai_org_plans TO authenticated;
GRANT ALL ON public.ai_org_plans TO service_role;
ALTER TABLE public.ai_org_plans ENABLE ROW LEVEL SECURITY;
CREATE POLICY ai_org_plans_read ON public.ai_org_plans FOR SELECT TO authenticated
  USING (organisation_id = (SELECT public.current_org_id()) AND (SELECT public.has_permission('ai.manage')));

INSERT INTO public.ai_org_plans (organisation_id, plan_code, effective_from)
SELECT id, 'validation_default', now() FROM public.organisations;

INSERT INTO public.schema_migrations (version, description) VALUES ('011-m2', 'AI governance M2: model/agent/plan catalogues + org plan assignment (Gate 10 v1.1)');