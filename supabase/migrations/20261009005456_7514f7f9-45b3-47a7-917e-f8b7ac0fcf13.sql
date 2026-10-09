CREATE TABLE public.ai_credit_transactions (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  organisation_id uuid NOT NULL REFERENCES public.organisations(id),
  kind public.ai_credit_kind NOT NULL,
  amount integer NOT NULL CHECK (amount > 0),
  job_id uuid REFERENCES public.ai_jobs(id),
  user_id uuid REFERENCES public.users(id),
  actor_id uuid,
  actor_type public.audit_actor_type NOT NULL,
  reason_code text NOT NULL CHECK (reason_code ~ '^[a-z_]{3,40}$'),
  note text CHECK (length(note) <= 500),
  period_month date,
  external_ref text,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT ai_credit_job_kind_chk CHECK ((kind IN ('reserve','settle','release','refund')) = (job_id IS NOT NULL)),
  CONSTRAINT ai_credit_adjust_actor_chk CHECK (kind <> 'adjust' OR actor_id IS NOT NULL),
  CONSTRAINT ai_credit_adjust_reason_chk CHECK (kind <> 'adjust' OR reason_code IN ('adjust_credit','adjust_debit'))
);
CREATE UNIQUE INDEX uq_credit_job_kind ON public.ai_credit_transactions(job_id, kind)
  WHERE kind IN ('reserve','settle','release','refund');
CREATE UNIQUE INDEX uq_credit_grant_period ON public.ai_credit_transactions(organisation_id, period_month, kind)
  WHERE kind IN ('grant','expire') AND reason_code IN ('monthly_grant','monthly_expire');
CREATE UNIQUE INDEX uq_credit_adjust_ref ON public.ai_credit_transactions(organisation_id, external_ref)
  WHERE kind = 'adjust';
CREATE INDEX ix_ai_credit_org_created ON public.ai_credit_transactions(organisation_id, created_at);
CREATE INDEX ix_ai_credit_org_kind ON public.ai_credit_transactions(organisation_id, kind);
CREATE INDEX ix_ai_credit_user_created ON public.ai_credit_transactions(user_id, created_at);
CREATE INDEX ix_ai_credit_job ON public.ai_credit_transactions(job_id);

REVOKE ALL ON public.ai_credit_transactions FROM PUBLIC, anon, authenticated, service_role;
GRANT SELECT ON public.ai_credit_transactions TO authenticated;
GRANT SELECT, INSERT ON public.ai_credit_transactions TO service_role;
ALTER TABLE public.ai_credit_transactions ENABLE ROW LEVEL SECURITY;
CREATE POLICY ai_credit_transactions_read ON public.ai_credit_transactions FOR SELECT TO authenticated
  USING (organisation_id = (SELECT public.current_org_id())
         AND ((SELECT public.has_permission('ai.manage')) OR user_id = (SELECT public.current_user_id())));

CREATE OR REPLACE FUNCTION public.ai_credit_block_changes()
RETURNS trigger LANGUAGE plpgsql SET search_path = pg_catalog, public, pg_temp AS $$
BEGIN
  RAISE EXCEPTION 'ai_credit_transactions is append-only; post a correcting entry instead';
END $$;
REVOKE ALL ON FUNCTION public.ai_credit_block_changes() FROM PUBLIC, anon, authenticated;
CREATE TRIGGER trg_ai_credit_no_update_delete BEFORE UPDATE OR DELETE ON public.ai_credit_transactions
  FOR EACH ROW EXECUTE FUNCTION public.ai_credit_block_changes();
CREATE TRIGGER trg_ai_credit_no_truncate BEFORE TRUNCATE ON public.ai_credit_transactions
  FOR EACH STATEMENT EXECUTE FUNCTION public.ai_credit_block_changes();

CREATE VIEW public.ai_credit_balance WITH (security_invoker = true) AS
SELECT organisation_id,
  COALESCE(SUM(CASE kind
    WHEN 'grant'   THEN amount
    WHEN 'adjust'  THEN CASE WHEN reason_code = 'adjust_debit' THEN -amount ELSE amount END
    WHEN 'expire'  THEN -amount
    WHEN 'reserve' THEN -amount
    WHEN 'release' THEN amount
    WHEN 'refund'  THEN amount
    ELSE 0 END), 0)::bigint AS available,
  COALESCE(SUM(amount) FILTER (WHERE kind = 'settle'), 0)::bigint AS consumed,
  (COALESCE(SUM(amount) FILTER (WHERE kind = 'reserve'), 0)
   - COALESCE(SUM(amount) FILTER (WHERE kind = 'settle'), 0)
   - COALESCE(SUM(amount) FILTER (WHERE kind = 'release'), 0))::bigint AS held
FROM public.ai_credit_transactions
GROUP BY organisation_id;
REVOKE ALL ON public.ai_credit_balance FROM PUBLIC, anon, authenticated, service_role;
GRANT SELECT ON public.ai_credit_balance TO authenticated, service_role;

INSERT INTO public.schema_migrations (version, description)
VALUES ('011-m4', 'AI governance M4: append-only ai_credit_transactions ledger + ai_credit_balance view (Gate 10 v1.1)');