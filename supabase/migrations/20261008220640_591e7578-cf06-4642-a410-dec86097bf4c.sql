ALTER TYPE public.ai_job_status ADD VALUE IF NOT EXISTS 'awaiting_approval' BEFORE 'queued';
ALTER TYPE public.ai_job_status ADD VALUE IF NOT EXISTS 'expired';
ALTER TYPE public.ai_job_status ADD VALUE IF NOT EXISTS 'rejected';
ALTER TYPE public.ai_content_kind ADD VALUE IF NOT EXISTS 'mark_suggestion';
CREATE TYPE public.ai_credit_kind AS ENUM ('grant','reserve','settle','release','refund','adjust','expire');
CREATE TYPE public.ai_prompt_state AS ENUM ('draft','active','retired');
CREATE TYPE public.ai_safety_class AS ENUM ('staff_generation','staff_assist','student_facing','analytics');
CREATE TYPE public.ai_model_state AS ENUM ('enabled','disabled','retired');
INSERT INTO public.schema_migrations (version, description) VALUES ('011-m1', 'AI governance M1: enum/type foundation (Gate 10 v1.1)');