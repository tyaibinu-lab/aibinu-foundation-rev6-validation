-- Gate 11C M5 — AI credit lifecycle functions (Gate 10 v1.1 §3/§4 + approved M5 resolutions)

CREATE OR REPLACE FUNCTION public.ai_credit_lock(p_org uuid) RETURNS void
LANGUAGE sql VOLATILE SECURITY DEFINER SET search_path = pg_catalog, public, pg_temp
AS $$ SELECT pg_advisory_xact_lock(hashtext('ai_credit:' || p_org::text)); $$;

CREATE OR REPLACE FUNCTION public.ai_credit_available(p_org uuid) RETURNS integer
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog, public, pg_temp
AS $$
  SELECT COALESCE(SUM(CASE
           WHEN kind = 'grant' THEN amount
           WHEN kind = 'adjust' AND reason_code = 'adjust_credit' THEN amount
           WHEN kind = 'adjust' AND reason_code = 'adjust_debit' THEN -amount
           WHEN kind = 'expire' THEN -amount
           WHEN kind = 'reserve' THEN -amount
           WHEN kind = 'release' THEN amount
           WHEN kind = 'refund' THEN amount
           ELSE 0 END), 0)::integer
  FROM public.ai_credit_transactions WHERE organisation_id = p_org;
$$;

CREATE OR REPLACE FUNCTION public.ai_credit_check_reason(p_reason text) RETURNS text
LANGUAGE plpgsql IMMUTABLE SET search_path = pg_catalog, public, pg_temp
AS $$
BEGIN
  IF p_reason IS NULL OR p_reason !~ '^[a-z_]{3,40}$' THEN
    RAISE EXCEPTION 'invalid_reason_code' USING ERRCODE = '22023';
  END IF;
  RETURN p_reason;
END $$;

-- Estimate: ceil(agent.credit_base + model.credit_multiplier × units × plan multiplier)
CREATE OR REPLACE FUNCTION public.ai_estimate_credits(p_agent text, p_model text, p_units integer)
RETURNS integer LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = pg_catalog, public, pg_temp
AS $$
DECLARE v_base int; v_mult numeric; v_plan numeric; v_org uuid := public.current_org_id(); v_fair jsonb;
BEGIN
  SELECT credit_base INTO v_base FROM public.ai_agents WHERE code = p_agent AND enabled;
  IF NOT FOUND THEN RAISE EXCEPTION 'agent_disabled' USING ERRCODE = 'P0001'; END IF;
  SELECT credit_multiplier INTO v_mult FROM public.ai_model_registry WHERE id = p_model AND state = 'enabled';
  IF NOT FOUND THEN RAISE EXCEPTION 'model_unavailable' USING ERRCODE = 'P0001'; END IF;
  IF v_org IS NULL THEN RAISE EXCEPTION 'no_organisation_context' USING ERRCODE = '42501'; END IF;
  SELECT p.fair_use INTO v_fair FROM public.ai_org_plans op JOIN public.ai_plans p ON p.code = op.plan_code
   WHERE op.organisation_id = v_org AND op.effective_from <= now()
     AND (op.effective_to IS NULL OR op.effective_to > now()) AND p.active
   ORDER BY op.effective_from DESC LIMIT 1;
  IF NOT FOUND THEN RAISE EXCEPTION 'no_ai_plan' USING ERRCODE = 'P0001'; END IF;
  v_plan := COALESCE((v_fair ->> 'credit_multiplier')::numeric, 1);
  IF v_plan <= 0 THEN RAISE EXCEPTION 'invalid_plan_multiplier' USING ERRCODE = '22023'; END IF;
  RETURN ceil(v_base + v_mult * GREATEST(COALESCE(p_units, 1), 1) * v_plan)::integer;
END $$;

CREATE OR REPLACE FUNCTION public.ai_credit_reserve(p_job_id uuid, p_amount integer)
RETURNS void LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = pg_catalog, public, pg_temp
AS $$
DECLARE j record;
BEGIN
  IF p_amount IS NULL OR p_amount <= 0 THEN RAISE EXCEPTION 'invalid_amount' USING ERRCODE = '22023'; END IF;
  SELECT id, organisation_id, requested_by, status INTO j FROM public.ai_jobs WHERE id = p_job_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'job_not_found' USING ERRCODE = 'P0002'; END IF;
  IF j.status IN ('succeeded','failed','cancelled','expired','rejected') THEN
    RAISE EXCEPTION 'invalid_state' USING ERRCODE = 'P0001';
  END IF;
  PERFORM public.ai_credit_lock(j.organisation_id);
  IF EXISTS (SELECT 1 FROM public.ai_credit_transactions WHERE job_id = p_job_id AND kind = 'reserve') THEN
    RETURN; -- one reserve per job; retries keep the original hold
  END IF;
  IF public.ai_credit_available(j.organisation_id) - p_amount < 0 THEN
    RAISE EXCEPTION 'insufficient_credits' USING ERRCODE = 'P0001';
  END IF;
  INSERT INTO public.ai_credit_transactions (organisation_id, kind, amount, job_id, user_id, actor_type, reason_code)
  VALUES (j.organisation_id, 'reserve', p_amount, p_job_id, j.requested_by, 'system', 'job_reserve');
END $$;

CREATE OR REPLACE FUNCTION public.ai_credit_settle(p_job_id uuid, p_actual integer)
RETURNS void LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = pg_catalog, public, pg_temp
AS $$
DECLARE j record; v_res int; v_act int;
BEGIN
  IF p_actual IS NULL OR p_actual < 0 THEN RAISE EXCEPTION 'invalid_amount' USING ERRCODE = '22023'; END IF;
  SELECT id, organisation_id, requested_by, estimated_credits INTO j FROM public.ai_jobs WHERE id = p_job_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'job_not_found' USING ERRCODE = 'P0002'; END IF;
  PERFORM public.ai_credit_lock(j.organisation_id);
  SELECT amount INTO v_res FROM public.ai_credit_transactions WHERE job_id = p_job_id AND kind = 'reserve';
  IF v_res IS NULL THEN
    IF j.estimated_credits IS NULL THEN RETURN; END IF; -- pre-ledger job: skip
    RAISE EXCEPTION 'no_reservation' USING ERRCODE = 'P0001';
  END IF;
  IF EXISTS (SELECT 1 FROM public.ai_credit_transactions WHERE job_id = p_job_id AND kind IN ('settle','release')) THEN
    RETURN; -- already closed
  END IF;
  v_act := LEAST(p_actual, v_res);
  IF v_act > 0 THEN
    INSERT INTO public.ai_credit_transactions (organisation_id, kind, amount, job_id, user_id, actor_type, reason_code)
    VALUES (j.organisation_id, 'settle', v_act, p_job_id, j.requested_by, 'system', 'job_settle');
  END IF;
  IF v_res - v_act > 0 THEN
    INSERT INTO public.ai_credit_transactions (organisation_id, kind, amount, job_id, user_id, actor_type, reason_code)
    VALUES (j.organisation_id, 'release', v_res - v_act, p_job_id, j.requested_by, 'system', 'job_settle_remainder');
  END IF;
  UPDATE public.ai_jobs SET consumed_credits = v_act WHERE id = p_job_id;
END $$;

CREATE OR REPLACE FUNCTION public.ai_credit_release(p_job_id uuid, p_reason text)
RETURNS void LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = pg_catalog, public, pg_temp
AS $$
DECLARE j record; v_res int; v_set int;
BEGIN
  PERFORM public.ai_credit_check_reason(p_reason);
  SELECT id, organisation_id, requested_by INTO j FROM public.ai_jobs WHERE id = p_job_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'job_not_found' USING ERRCODE = 'P0002'; END IF;
  PERFORM public.ai_credit_lock(j.organisation_id);
  SELECT amount INTO v_res FROM public.ai_credit_transactions WHERE job_id = p_job_id AND kind = 'reserve';
  IF v_res IS NULL THEN RETURN; END IF;
  IF EXISTS (SELECT 1 FROM public.ai_credit_transactions WHERE job_id = p_job_id AND kind = 'release') THEN RETURN; END IF;
  SELECT COALESCE(SUM(amount),0) INTO v_set FROM public.ai_credit_transactions WHERE job_id = p_job_id AND kind = 'settle';
  IF v_res - v_set > 0 THEN
    INSERT INTO public.ai_credit_transactions (organisation_id, kind, amount, job_id, user_id, actor_type, reason_code)
    VALUES (j.organisation_id, 'release', v_res - v_set, p_job_id, j.requested_by, 'system', p_reason);
  END IF;
  IF v_set = 0 THEN UPDATE public.ai_jobs SET consumed_credits = 0 WHERE id = p_job_id; END IF;
END $$;

CREATE OR REPLACE FUNCTION public.ai_credit_refund(p_job_id uuid, p_amount integer, p_reason text)
RETURNS void LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = pg_catalog, public, pg_temp
AS $$
DECLARE v_org uuid := public.current_org_id(); v_uid uuid := public.current_user_id(); j record; v_set int;
BEGIN
  IF v_org IS NULL OR v_uid IS NULL OR NOT public.has_permission('ai.manage') THEN
    RAISE EXCEPTION 'permission_denied' USING ERRCODE = '42501';
  END IF;
  PERFORM public.ai_credit_check_reason(p_reason);
  IF p_amount IS NULL OR p_amount <= 0 THEN RAISE EXCEPTION 'invalid_amount' USING ERRCODE = '22023'; END IF;
  SELECT id, organisation_id, requested_by INTO j FROM public.ai_jobs
   WHERE id = p_job_id AND organisation_id = v_org FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'job_not_found' USING ERRCODE = 'P0002'; END IF;
  PERFORM public.ai_credit_lock(v_org);
  IF EXISTS (SELECT 1 FROM public.ai_credit_transactions WHERE job_id = p_job_id AND kind = 'refund') THEN
    RAISE EXCEPTION 'refund_exceeds_settled' USING ERRCODE = 'P0001';
  END IF;
  SELECT COALESCE(SUM(amount),0) INTO v_set FROM public.ai_credit_transactions WHERE job_id = p_job_id AND kind = 'settle';
  IF p_amount > v_set THEN RAISE EXCEPTION 'refund_exceeds_settled' USING ERRCODE = 'P0001'; END IF;
  INSERT INTO public.ai_credit_transactions (organisation_id, kind, amount, job_id, user_id, actor_id, actor_type, reason_code)
  VALUES (v_org, 'refund', p_amount, p_job_id, j.requested_by, v_uid, 'user', p_reason);
  INSERT INTO public.audit_events (organisation_id, actor_user_id, action, entity_type, entity_id, after_state, actor_type, source)
  VALUES (v_org, v_uid, 'ai.credit.refund', 'ai_job', p_job_id::text,
          jsonb_build_object('amount', p_amount, 'reason_code', p_reason), 'user', 'db');
END $$;

CREATE OR REPLACE FUNCTION public.ai_credit_adjust(p_amount integer, p_direction text, p_external_ref text, p_note text)
RETURNS bigint LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = pg_catalog, public, pg_temp
AS $$
DECLARE v_org uuid := public.current_org_id(); v_uid uuid := public.current_user_id();
        v_reason text; v_row record; v_id bigint;
BEGIN
  IF v_uid IS NULL OR NOT public.is_platform_admin() OR v_org IS NULL THEN
    RAISE EXCEPTION 'permission_denied' USING ERRCODE = '42501';
  END IF;
  IF p_direction NOT IN ('credit','debit') OR p_direction IS NULL THEN
    RAISE EXCEPTION 'invalid_direction' USING ERRCODE = '22023';
  END IF;
  IF p_amount IS NULL OR p_amount <= 0 THEN RAISE EXCEPTION 'invalid_amount' USING ERRCODE = '22023'; END IF;
  IF p_external_ref IS NULL OR length(btrim(p_external_ref)) = 0 OR length(p_external_ref) > 200 THEN
    RAISE EXCEPTION 'invalid_external_ref' USING ERRCODE = '22023';
  END IF;
  IF p_note IS NOT NULL AND length(p_note) > 500 THEN RAISE EXCEPTION 'invalid_note' USING ERRCODE = '22023'; END IF;
  v_reason := 'adjust_' || p_direction;
  PERFORM public.ai_credit_lock(v_org);
  SELECT id, amount, reason_code, note INTO v_row FROM public.ai_credit_transactions
   WHERE organisation_id = v_org AND kind = 'adjust' AND external_ref = p_external_ref;
  IF FOUND THEN
    IF v_row.amount = p_amount AND v_row.reason_code = v_reason AND v_row.note IS NOT DISTINCT FROM p_note THEN
      RETURN v_row.id; -- same payload: idempotent replay
    END IF;
    RAISE EXCEPTION 'external_ref_conflict' USING ERRCODE = '23505';
  END IF;
  IF p_direction = 'debit' AND public.ai_credit_available(v_org) - p_amount < 0 THEN
    RAISE EXCEPTION 'insufficient_credits' USING ERRCODE = 'P0001';
  END IF;
  INSERT INTO public.ai_credit_transactions (organisation_id, kind, amount, actor_id, actor_type, reason_code, note, external_ref)
  VALUES (v_org, 'adjust', p_amount, v_uid, 'user', v_reason, p_note, p_external_ref)
  RETURNING id INTO v_id;
  INSERT INTO public.audit_events (organisation_id, actor_user_id, action, entity_type, entity_id, after_state, actor_type, source)
  VALUES (v_org, v_uid, 'ai.credit.adjust', 'ai_credit_transaction', v_id::text,
          jsonb_build_object('amount', p_amount, 'direction', p_direction, 'external_ref', p_external_ref), 'user', 'db');
  RETURN v_id;
END $$;

CREATE OR REPLACE FUNCTION public.ai_credit_monthly_grant(p_org uuid, p_month date)
RETURNS void LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = pg_catalog, public, pg_temp
AS $$
DECLARE v_month date; v_prev date; v_plan record; v_prev_grant record; v_exp int;
BEGIN
  PERFORM public.assert_service_context();
  IF p_org IS NULL OR p_month IS NULL THEN RAISE EXCEPTION 'invalid_argument' USING ERRCODE = '22023'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.organisations WHERE id = p_org AND deleted_at IS NULL) THEN
    RAISE EXCEPTION 'organisation_not_found' USING ERRCODE = 'P0002';
  END IF;
  v_month := date_trunc('month', p_month)::date;
  v_prev  := (v_month - interval '1 month')::date;
  PERFORM public.ai_credit_lock(p_org);
  SELECT p.monthly_credit_grant, p.grant_expires_after_days INTO v_plan
    FROM public.ai_org_plans op JOIN public.ai_plans p ON p.code = op.plan_code
   WHERE op.organisation_id = p_org AND op.effective_from <= now()
     AND (op.effective_to IS NULL OR op.effective_to > now()) AND p.active
   ORDER BY op.effective_from DESC LIMIT 1;
  IF NOT FOUND THEN RETURN; END IF;

  -- Expiry of the immediately previous month's grant (NULL days = rollover)
  IF v_plan.grant_expires_after_days IS NOT NULL THEN
    SELECT amount, created_at INTO v_prev_grant FROM public.ai_credit_transactions
     WHERE organisation_id = p_org AND kind = 'grant' AND reason_code = 'monthly_grant' AND period_month = v_prev;
    IF FOUND AND v_prev_grant.created_at + make_interval(days => v_plan.grant_expires_after_days) <= now()
       AND NOT EXISTS (SELECT 1 FROM public.ai_credit_transactions
                        WHERE organisation_id = p_org AND kind = 'expire' AND reason_code = 'monthly_expire' AND period_month = v_prev) THEN
      v_exp := GREATEST(LEAST(v_prev_grant.amount, public.ai_credit_available(p_org)), 0);
      IF v_exp > 0 THEN
        INSERT INTO public.ai_credit_transactions (organisation_id, kind, amount, actor_type, reason_code, period_month)
        VALUES (p_org, 'expire', v_exp, 'service_role', 'monthly_expire', v_prev);
      END IF;
    END IF;
  END IF;

  IF v_plan.monthly_credit_grant > 0 THEN
    INSERT INTO public.ai_credit_transactions (organisation_id, kind, amount, actor_type, reason_code, period_month)
    VALUES (p_org, 'grant', v_plan.monthly_credit_grant, 'service_role', 'monthly_grant', v_month)
    ON CONFLICT DO NOTHING;
  END IF;
END $$;

-- Least privilege
DO $$
DECLARE f text;
BEGIN
  FOREACH f IN ARRAY ARRAY[
    'ai_credit_lock(uuid)','ai_credit_available(uuid)','ai_credit_check_reason(text)',
    'ai_estimate_credits(text,text,integer)','ai_credit_reserve(uuid,integer)','ai_credit_settle(uuid,integer)',
    'ai_credit_release(uuid,text)','ai_credit_refund(uuid,integer,text)',
    'ai_credit_adjust(integer,text,text,text)','ai_credit_monthly_grant(uuid,date)'] LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION public.%s FROM PUBLIC, anon, authenticated, service_role', f);
  END LOOP;
END $$;
GRANT EXECUTE ON FUNCTION public.ai_credit_refund(uuid,integer,text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.ai_credit_adjust(integer,text,text,text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.ai_credit_monthly_grant(uuid,date) TO service_role;

-- Register the two reviewed client functions in the security allow-list (text-preserving edit)
DO $$
DECLARE d text := pg_get_functiondef('public.security_expected_client_functions()'::regprocedure);
        a text := '''accept_invitation(text)'',';
BEGIN
  IF (length(d) - length(replace(d, a, ''))) / length(a) <> 1 THEN
    RAISE EXCEPTION 'allow-list anchor not found exactly once';
  END IF;
  EXECUTE replace(d, a, a || E'\n    ''ai_credit_adjust(integer,text,text,text)'',\n    ''ai_credit_refund(uuid,integer,text)'',');
END $$;

INSERT INTO public.schema_migrations (version, description)
VALUES ('011-m5', 'Gate 11C M5: AI credit lifecycle functions (estimate/reserve/settle/release/refund/adjust/monthly_grant)');