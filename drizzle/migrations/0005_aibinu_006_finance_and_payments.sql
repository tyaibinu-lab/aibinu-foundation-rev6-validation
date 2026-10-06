-- =====================================================================
-- Aibinu FlexiPrep: Migration 006
-- Tenant finance: products, prices, student fee accounts, invoices,
-- discounts, scholarships, online and manual payments, webhooks,
-- receipts, refunds, and an append-only ledger
-- Requires: 001-005
--
-- Scope: this is the money a SCHOOL collects from its students/parents.
-- What a school pays YOU (plans, subscriptions, entitlements) is a
-- separate migration.
-- =====================================================================

BEGIN;
SELECT public.migration_begin('006', '005');   -- Revision 6 (M5)

-- ---------------------------------------------------------------------
-- 1. Enums
-- ---------------------------------------------------------------------
CREATE TYPE product_type          AS ENUM ('tuition', 'registration', 'exam_fee', 'coaching', 'materials', 'subscription', 'other');
CREATE TYPE amount_kind           AS ENUM ('percent', 'fixed');   -- percent = basis points (1000 = 10%), fixed = kobo
CREATE TYPE invoice_status        AS ENUM ('draft', 'issued', 'partially_paid', 'paid', 'void');
CREATE TYPE payment_provider      AS ENUM ('paystack', 'flutterwave', 'bank_transfer', 'cash', 'pos', 'other');
CREATE TYPE payment_attempt_state AS ENUM ('initiated', 'pending', 'succeeded', 'failed', 'abandoned', 'expired', 'needs_review');
CREATE TYPE refund_status         AS ENUM ('requested', 'approved', 'rejected', 'completed');
CREATE TYPE refund_source         AS ENUM ('invoice', 'wallet');
CREATE TYPE ledger_entry_type     AS ENUM ('debit', 'credit');
CREATE TYPE ledger_kind           AS ENUM ('invoice', 'invoice_void', 'payment', 'wallet_credit', 'wallet_apply',
                                           'wallet_transfer', 'refund', 'adjustment');

-- ---------------------------------------------------------------------
-- 2. Permissions
-- Note: 'finance.read' (seeded in 001) is given to parents and means "see my
-- own family's finances". Staff who see EVERYONE need finance.view_all.
-- ---------------------------------------------------------------------
-- Revision 6 (C1/C5): permission seed removed; the catalogue and role mappings live in 001.

-- Revision 6 (C1/C5): permission seed removed; the catalogue and role mappings live in 001.

-- Revision 6 (C1/C5): permission seed removed; the catalogue and role mappings live in 001.

-- ---------------------------------------------------------------------
-- 3. Tables
-- Money is stored as integer kobo (bigint). Never floats.
-- ---------------------------------------------------------------------

-- Gapless per-organisation numbering for invoices and receipts.
CREATE TABLE org_counters (
  organisation_id uuid NOT NULL REFERENCES organisations(id) ON DELETE CASCADE,
  key             text NOT NULL,                  -- e.g. 'invoice:2026'
  next_value      bigint NOT NULL DEFAULT 1,
  PRIMARY KEY (organisation_id, key)
);

CREATE TABLE tenant_products (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organisation_id uuid NOT NULL REFERENCES organisations(id) ON DELETE CASCADE,
  code            text NOT NULL,                  -- e.g. 'TUITION-SS2'
  name            text NOT NULL,
  type            product_type NOT NULL DEFAULT 'other',
  description     text,
  is_active       boolean NOT NULL DEFAULT true,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  UNIQUE (id, organisation_id),
  UNIQUE (organisation_id, code)
);

-- A product can have a general price (academic_session_id NULL) and
-- session-specific prices that take precedence.
CREATE TABLE tenant_prices (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organisation_id     uuid NOT NULL REFERENCES organisations(id) ON DELETE CASCADE,
  product_id          uuid NOT NULL,
  academic_session_id uuid,
  amount              bigint NOT NULL CHECK (amount >= 0),
  currency            char(3) NOT NULL DEFAULT 'NGN',
  valid_from          date,
  valid_to            date,
  is_active           boolean NOT NULL DEFAULT true,
  created_at          timestamptz NOT NULL DEFAULT now(),
  UNIQUE (id, organisation_id),
  CHECK (valid_to IS NULL OR valid_from IS NULL OR valid_to >= valid_from),
  FOREIGN KEY (product_id, organisation_id)          REFERENCES tenant_products(id, organisation_id) ON DELETE CASCADE,
  FOREIGN KEY (academic_session_id, organisation_id) REFERENCES academic_sessions(id, organisation_id)
);
CREATE INDEX idx_prices_product ON tenant_prices(product_id, academic_session_id);

-- One fee account per student. Parents pay into it; they do not need their own.
-- balance = debits - credits. Positive = owes money. Negative = prepaid credit.
CREATE TABLE customer_accounts (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organisation_id uuid NOT NULL REFERENCES organisations(id) ON DELETE CASCADE,
  student_id      uuid NOT NULL,
  currency        char(3) NOT NULL DEFAULT 'NGN',
  balance         bigint NOT NULL DEFAULT 0,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  UNIQUE (id, organisation_id),
  UNIQUE (student_id),
  FOREIGN KEY (student_id, organisation_id) REFERENCES students(id, organisation_id) ON DELETE CASCADE
);

CREATE TABLE discounts (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organisation_id uuid NOT NULL REFERENCES organisations(id) ON DELETE CASCADE,
  code            text NOT NULL,
  name            text NOT NULL,
  kind            amount_kind NOT NULL,
  value           bigint NOT NULL CHECK (value > 0),
  product_id      uuid,                           -- NULL = any product
  valid_from      date,
  valid_to        date,
  usage_limit     integer CHECK (usage_limit IS NULL OR usage_limit > 0),
  used_count      integer NOT NULL DEFAULT 0,
  is_active       boolean NOT NULL DEFAULT true,
  created_at      timestamptz NOT NULL DEFAULT now(),
  UNIQUE (id, organisation_id),
  UNIQUE (organisation_id, code),
  CHECK (kind <> 'percent' OR value <= 10000),
  FOREIGN KEY (product_id, organisation_id) REFERENCES tenant_products(id, organisation_id) ON DELETE CASCADE
);

CREATE TABLE scholarships (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organisation_id uuid NOT NULL REFERENCES organisations(id) ON DELETE CASCADE,
  student_id      uuid NOT NULL,
  name            text NOT NULL,
  sponsor         text,
  kind            amount_kind NOT NULL,
  value           bigint NOT NULL CHECK (value > 0),
  product_id      uuid,                           -- NULL = any product
  valid_from      date,
  valid_to        date,
  is_active       boolean NOT NULL DEFAULT true,
  created_by      uuid DEFAULT current_user_id() REFERENCES users(id),
  created_at      timestamptz NOT NULL DEFAULT now(),
  UNIQUE (id, organisation_id),
  CHECK (kind <> 'percent' OR value <= 10000),
  FOREIGN KEY (student_id, organisation_id) REFERENCES students(id, organisation_id) ON DELETE CASCADE,
  FOREIGN KEY (product_id, organisation_id) REFERENCES tenant_products(id, organisation_id) ON DELETE CASCADE
);

CREATE TABLE customer_invoices (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organisation_id     uuid NOT NULL REFERENCES organisations(id) ON DELETE CASCADE,
  account_id          uuid NOT NULL,
  student_id          uuid NOT NULL,              -- denormalised for simple access rules
  academic_session_id uuid,
  number              text,                       -- assigned when issued
  status              invoice_status NOT NULL DEFAULT 'draft',
  currency            char(3) NOT NULL DEFAULT 'NGN',
  subtotal            bigint NOT NULL DEFAULT 0 CHECK (subtotal >= 0),
  discount_total      bigint NOT NULL DEFAULT 0 CHECK (discount_total >= 0),
  scholarship_total   bigint NOT NULL DEFAULT 0 CHECK (scholarship_total >= 0),
  total               bigint NOT NULL DEFAULT 0 CHECK (total >= 0),
  balance             bigint NOT NULL DEFAULT 0,  -- maintained from the ledger
  issued_at           timestamptz,
  due_on              date,
  paid_at             timestamptz,
  voided_at           timestamptz,
  void_reason         text,
  notes               text,
  created_by          uuid DEFAULT current_user_id() REFERENCES users(id),
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now(),
  UNIQUE (id, organisation_id),
  UNIQUE (organisation_id, number),
  FOREIGN KEY (account_id, organisation_id)          REFERENCES customer_accounts(id, organisation_id),
  FOREIGN KEY (student_id, organisation_id)          REFERENCES students(id, organisation_id),
  FOREIGN KEY (academic_session_id, organisation_id) REFERENCES academic_sessions(id, organisation_id)
);
CREATE INDEX idx_invoices_student ON customer_invoices(student_id, status);
CREATE INDEX idx_invoices_due     ON customer_invoices(organisation_id, due_on) WHERE status IN ('issued', 'partially_paid');

CREATE TABLE customer_invoice_items (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organisation_id     uuid NOT NULL REFERENCES organisations(id) ON DELETE CASCADE,
  invoice_id          uuid NOT NULL,
  product_id          uuid NOT NULL,
  description         text NOT NULL,
  quantity            integer NOT NULL DEFAULT 1 CHECK (quantity > 0),
  unit_price          bigint NOT NULL CHECK (unit_price >= 0),
  gross               bigint NOT NULL CHECK (gross >= 0),
  discount_id         uuid,
  discount_amount     bigint NOT NULL DEFAULT 0 CHECK (discount_amount >= 0),
  scholarships_applied jsonb NOT NULL DEFAULT '[]'::jsonb,   -- [{"scholarship_id":..,"amount":..}]
  scholarship_amount  bigint NOT NULL DEFAULT 0 CHECK (scholarship_amount >= 0),
  line_total          bigint NOT NULL CHECK (line_total >= 0),
  FOREIGN KEY (invoice_id, organisation_id) REFERENCES customer_invoices(id, organisation_id) ON DELETE CASCADE,
  FOREIGN KEY (product_id, organisation_id) REFERENCES tenant_products(id, organisation_id),
  FOREIGN KEY (discount_id, organisation_id) REFERENCES discounts(id, organisation_id)
);
CREATE INDEX idx_invoice_items_invoice ON customer_invoice_items(invoice_id);

-- Every attempt to collect money online. The reference is what the provider echoes back.
CREATE TABLE customer_payment_attempts (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organisation_id uuid NOT NULL REFERENCES organisations(id) ON DELETE CASCADE,
  account_id      uuid NOT NULL,
  student_id      uuid NOT NULL,
  invoice_id      uuid NOT NULL,
  provider        payment_provider NOT NULL,
  reference       text NOT NULL,
  idempotency_key text,
  amount          bigint NOT NULL CHECK (amount > 0),
  currency        char(3) NOT NULL DEFAULT 'NGN',
  status          payment_attempt_state NOT NULL DEFAULT 'initiated',
  checkout_url    text,
  provider_ref    text,
  payer_email     text,
  failure_reason  text,
  created_by      uuid DEFAULT current_user_id() REFERENCES users(id),
  created_at      timestamptz NOT NULL DEFAULT now(),
  completed_at    timestamptz,
  UNIQUE (id, organisation_id),
  UNIQUE (provider, reference),
  UNIQUE (organisation_id, idempotency_key),
  FOREIGN KEY (account_id, organisation_id) REFERENCES customer_accounts(id, organisation_id),
  FOREIGN KEY (student_id, organisation_id) REFERENCES students(id, organisation_id),
  FOREIGN KEY (invoice_id, organisation_id) REFERENCES customer_invoices(id, organisation_id)
);
CREATE INDEX idx_pay_attempts_open ON customer_payment_attempts(created_at) WHERE status IN ('initiated', 'pending');

-- Confirmed money only. Created after the provider has been verified server-side,
-- or by a bursar recording cash / a bank transfer.
CREATE TABLE customer_payment_transactions (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organisation_id uuid NOT NULL REFERENCES organisations(id) ON DELETE CASCADE,
  account_id      uuid NOT NULL,
  student_id      uuid NOT NULL,
  invoice_id      uuid,                            -- NULL = prepayment into the wallet
  attempt_id      uuid,
  provider        payment_provider NOT NULL,
  provider_txn_id text,
  amount          bigint NOT NULL CHECK (amount > 0),
  fee             bigint NOT NULL DEFAULT 0 CHECK (fee >= 0),    -- provider charge (your cost)
  currency        char(3) NOT NULL DEFAULT 'NGN',
  channel         text,                            -- card, bank, ussd, ...
  payer_name      text,
  payer_email     text,
  note            text,
  applied_amount  bigint NOT NULL DEFAULT 0,       -- part applied to the invoice
  wallet_amount   bigint NOT NULL DEFAULT 0,       -- surplus kept as credit
  paid_at         timestamptz NOT NULL DEFAULT now(),
  verified_at     timestamptz NOT NULL DEFAULT now(),
  recorded_by     uuid REFERENCES users(id),       -- set for manual payments
  created_at      timestamptz NOT NULL DEFAULT now(),
  UNIQUE (id, organisation_id),
  FOREIGN KEY (account_id, organisation_id) REFERENCES customer_accounts(id, organisation_id),
  FOREIGN KEY (student_id, organisation_id) REFERENCES students(id, organisation_id),
  FOREIGN KEY (invoice_id, organisation_id) REFERENCES customer_invoices(id, organisation_id),
  FOREIGN KEY (attempt_id, organisation_id) REFERENCES customer_payment_attempts(id, organisation_id)
);
-- The same provider transaction can never be recorded twice.
CREATE UNIQUE INDEX uq_txn_provider_id
  ON customer_payment_transactions(provider, provider_txn_id) WHERE provider_txn_id IS NOT NULL;
CREATE INDEX idx_txn_student ON customer_payment_transactions(student_id, paid_at DESC);

-- Raw provider events, kept for audit and replay. organisation_id is filled in
-- once the payment reference has been matched.
CREATE TABLE customer_payment_webhooks (
  id              bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  organisation_id uuid REFERENCES organisations(id),
  provider        payment_provider NOT NULL,
  event_id        text NOT NULL,
  event_type      text NOT NULL,
  reference       text,
  payload         jsonb NOT NULL,
  signature_valid boolean NOT NULL,
  delivery_count  integer NOT NULL DEFAULT 1,
  outcome         text,                            -- recorded, duplicate_event, invalid_signature, ...
  received_at     timestamptz NOT NULL DEFAULT now(),
  processed_at    timestamptz,
  UNIQUE (provider, event_id)
);

CREATE TABLE customer_receipts (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organisation_id uuid NOT NULL REFERENCES organisations(id) ON DELETE CASCADE,
  transaction_id  uuid NOT NULL,
  invoice_id      uuid,
  student_id      uuid NOT NULL,
  number          text NOT NULL,
  amount          bigint NOT NULL CHECK (amount > 0),
  issued_at       timestamptz NOT NULL DEFAULT now(),
  UNIQUE (transaction_id),
  UNIQUE (organisation_id, number),
  FOREIGN KEY (transaction_id, organisation_id) REFERENCES customer_payment_transactions(id, organisation_id),
  FOREIGN KEY (invoice_id, organisation_id)     REFERENCES customer_invoices(id, organisation_id),
  FOREIGN KEY (student_id, organisation_id)     REFERENCES students(id, organisation_id)
);

CREATE TABLE customer_refunds (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organisation_id    uuid NOT NULL REFERENCES organisations(id) ON DELETE CASCADE,
  transaction_id     uuid NOT NULL,
  invoice_id         uuid,
  student_id         uuid NOT NULL,
  amount             bigint NOT NULL CHECK (amount > 0),
  source             refund_source NOT NULL DEFAULT 'invoice',
  reason             text NOT NULL,
  status             refund_status NOT NULL DEFAULT 'requested',
  requested_by       uuid DEFAULT current_user_id() REFERENCES users(id),
  approved_by        uuid REFERENCES users(id),
  completed_by       uuid REFERENCES users(id),
  provider_refund_id text,
  decision_note      text,
  created_at         timestamptz NOT NULL DEFAULT now(),
  decided_at         timestamptz,
  completed_at       timestamptz,
  UNIQUE (id, organisation_id),
  FOREIGN KEY (transaction_id, organisation_id) REFERENCES customer_payment_transactions(id, organisation_id),
  FOREIGN KEY (invoice_id, organisation_id)     REFERENCES customer_invoices(id, organisation_id),
  FOREIGN KEY (student_id, organisation_id)     REFERENCES students(id, organisation_id)
);
CREATE INDEX idx_refunds_txn ON customer_refunds(transaction_id);

-- The source of truth for money. Append-only.
--   invoice_id set  -> movement on that invoice
--   invoice_id NULL -> movement in the student's wallet (prepaid credit)
-- Invoice outstanding = SUM(debits - credits) for the invoice.
-- Wallet balance      = SUM(credits - debits) where invoice_id IS NULL.
CREATE TABLE tenant_ledger (
  id              bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  organisation_id uuid NOT NULL REFERENCES organisations(id) ON DELETE CASCADE,
  account_id      uuid NOT NULL,
  student_id      uuid NOT NULL,
  invoice_id      uuid,
  entry_type      ledger_entry_type NOT NULL,
  kind            ledger_kind NOT NULL,
  amount          bigint NOT NULL CHECK (amount > 0),
  currency        char(3) NOT NULL DEFAULT 'NGN',
  transaction_id  uuid,
  refund_id       uuid,
  memo            text,
  balance_after   bigint NOT NULL,                 -- account balance after this entry
  posted_by       uuid DEFAULT current_user_id() REFERENCES users(id),
  posted_at       timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (account_id, organisation_id)     REFERENCES customer_accounts(id, organisation_id),
  FOREIGN KEY (student_id, organisation_id)     REFERENCES students(id, organisation_id),
  FOREIGN KEY (invoice_id, organisation_id)     REFERENCES customer_invoices(id, organisation_id),
  FOREIGN KEY (transaction_id, organisation_id) REFERENCES customer_payment_transactions(id, organisation_id),
  FOREIGN KEY (refund_id, organisation_id)      REFERENCES customer_refunds(id, organisation_id)
);
CREATE INDEX idx_ledger_account ON tenant_ledger(account_id, id);
CREATE INDEX idx_ledger_invoice ON tenant_ledger(invoice_id) WHERE invoice_id IS NOT NULL;

CREATE OR REPLACE FUNCTION block_ledger_changes() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'tenant_ledger is append-only; post a correcting entry instead';
END;
$$ LANGUAGE plpgsql;
CREATE TRIGGER trg_ledger_no_change BEFORE UPDATE OR DELETE ON tenant_ledger
  FOR EACH ROW EXECUTE FUNCTION block_ledger_changes();

-- updated_at triggers
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['tenant_products', 'customer_accounts', 'customer_invoices']
  LOOP
    EXECUTE format('CREATE TRIGGER trg_%s_updated BEFORE UPDATE ON %I
                    FOR EACH ROW EXECUTE FUNCTION set_updated_at()', t, t);
  END LOOP;
END $$;

-- Audit trail for pricing, discount and scholarship changes made inside an authenticated request.
CREATE TRIGGER trg_audit_products AFTER INSERT OR UPDATE OR DELETE ON tenant_products
  FOR EACH ROW WHEN (current_user_id() IS NOT NULL) EXECUTE FUNCTION audit_row_change();
CREATE TRIGGER trg_audit_prices AFTER INSERT OR UPDATE OR DELETE ON tenant_prices
  FOR EACH ROW WHEN (current_user_id() IS NOT NULL) EXECUTE FUNCTION audit_row_change();
CREATE TRIGGER trg_audit_discounts AFTER INSERT OR UPDATE OR DELETE ON discounts
  FOR EACH ROW WHEN (current_user_id() IS NOT NULL) EXECUTE FUNCTION audit_row_change();
CREATE TRIGGER trg_audit_scholarships AFTER INSERT OR UPDATE OR DELETE ON scholarships
  FOR EACH ROW WHEN (current_user_id() IS NOT NULL) EXECUTE FUNCTION audit_row_change();

-- ---------------------------------------------------------------------
-- 4. Internal helpers (not callable by the app role)
-- ---------------------------------------------------------------------

CREATE OR REPLACE FUNCTION org_setting(p_org uuid, p_key text, p_default jsonb) RETURNS jsonb AS $$
  SELECT COALESCE((SELECT value FROM organisation_settings
                   WHERE organisation_id = p_org AND key = p_key), p_default);
$$ LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog, public, pg_temp;

-- e.g. 'invoice' -> INV-2026-000001
CREATE OR REPLACE FUNCTION next_number(p_org uuid, p_prefix text, p_scope text) RETURNS text AS $$
DECLARE
  v_year text := to_char(now(), 'YYYY');
  n bigint;
BEGIN
  INSERT INTO org_counters (organisation_id, key, next_value)
  VALUES (p_org, p_scope || ':' || v_year, 2)
  ON CONFLICT (organisation_id, key) DO UPDATE SET next_value = org_counters.next_value + 1
  RETURNING next_value - 1 INTO n;
  RETURN p_prefix || '-' || v_year || '-' || lpad(n::text, 6, '0');
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public, pg_temp;

CREATE OR REPLACE FUNCTION audit_finance(p_org uuid, p_action text, p_entity text, p_entity_id text, p_after jsonb)
RETURNS void AS $$
  INSERT INTO audit_events (organisation_id, actor_user_id, action, entity_type, entity_id, after_state)
  VALUES (p_org, current_user_id(), p_action, p_entity, p_entity_id, p_after);
$$ LANGUAGE sql SECURITY DEFINER SET search_path = pg_catalog, public, pg_temp;

CREATE OR REPLACE FUNCTION wallet_balance_of(p_account_id uuid) RETURNS bigint AS $$
  SELECT COALESCE(SUM(CASE entry_type WHEN 'credit' THEN amount ELSE -amount END), 0)::bigint
  FROM tenant_ledger WHERE account_id = p_account_id AND invoice_id IS NULL;
$$ LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog, public, pg_temp;

-- The only way money moves. Locks the account so balances stay consistent,
-- writes the ledger row, and keeps account and invoice balances in step.
CREATE OR REPLACE FUNCTION post_ledger(
  p_account_id uuid, p_invoice_id uuid, p_type ledger_entry_type, p_kind ledger_kind,
  p_amount bigint, p_txn_id uuid DEFAULT NULL, p_refund_id uuid DEFAULT NULL, p_memo text DEFAULT NULL
) RETURNS bigint AS $$
DECLARE
  acc      customer_accounts%ROWTYPE;
  inv      customer_invoices%ROWTYPE;
  delta    bigint;
  new_bal  bigint;
  new_inv  bigint;
  v_id     bigint;
BEGIN
  IF p_amount IS NULL OR p_amount <= 0 THEN RAISE EXCEPTION 'Ledger amount must be positive'; END IF;

  SELECT * INTO acc FROM customer_accounts WHERE id = p_account_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Account not found'; END IF;

  IF p_invoice_id IS NOT NULL THEN
    SELECT * INTO inv FROM customer_invoices WHERE id = p_invoice_id AND account_id = acc.id FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'Invoice does not belong to this account'; END IF;
  END IF;

  delta   := CASE p_type WHEN 'debit' THEN p_amount ELSE -p_amount END;
  new_bal := acc.balance + delta;

  INSERT INTO tenant_ledger (organisation_id, account_id, student_id, invoice_id, entry_type, kind,
                             amount, currency, transaction_id, refund_id, memo, balance_after)
  VALUES (acc.organisation_id, acc.id, acc.student_id, p_invoice_id, p_type, p_kind,
          p_amount, acc.currency, p_txn_id, p_refund_id, p_memo, new_bal)
  RETURNING id INTO v_id;

  UPDATE customer_accounts SET balance = new_bal WHERE id = acc.id;

  IF p_invoice_id IS NOT NULL THEN
    new_inv := inv.balance + delta;
    UPDATE customer_invoices SET
      balance = new_inv,
      status  = CASE WHEN status IN ('issued', 'partially_paid', 'paid')
                     THEN (CASE WHEN new_inv <= 0     THEN 'paid'
                                WHEN new_inv < total  THEN 'partially_paid'
                                ELSE 'issued' END)::invoice_status
                     ELSE status END,
      paid_at = CASE WHEN status IN ('issued', 'partially_paid', 'paid') AND new_inv <= 0
                     THEN COALESCE(paid_at, now())
                     WHEN new_inv > 0 THEN NULL
                     ELSE paid_at END
    WHERE id = inv.id;
  END IF;

  RETURN v_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public, pg_temp;

CREATE OR REPLACE FUNCTION account_for_student(p_student_id uuid) RETURNS uuid AS $$
DECLARE
  v_org uuid := current_org_id();
  v_id  uuid;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM students WHERE id = p_student_id AND organisation_id = v_org) THEN
    RAISE EXCEPTION 'Student not found';
  END IF;
  INSERT INTO customer_accounts (organisation_id, student_id, currency)
  VALUES (v_org, p_student_id,
          COALESCE(org_setting(v_org, 'currency', '"NGN"'::jsonb) #>> '{}', 'NGN'))
  ON CONFLICT (student_id) DO NOTHING;
  SELECT id INTO v_id FROM customer_accounts WHERE student_id = p_student_id;
  RETURN v_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public, pg_temp;

-- Staff who manage finance, or the student / a parent paying for the student.
CREATE OR REPLACE FUNCTION can_pay_for_student(p_student_id uuid) RETURNS boolean AS $$
  SELECT has_permission('finance.manage')
      OR (has_permission('finance.read') AND is_self_or_parent(p_student_id));
$$ LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog, public, pg_temp;

-- Apply money from the wallet to an invoice.
CREATE OR REPLACE FUNCTION apply_wallet_internal(p_invoice_id uuid, p_amount bigint) RETURNS bigint AS $$
DECLARE
  inv customer_invoices%ROWTYPE;
  v_wallet bigint;
  v_apply bigint;
BEGIN
  SELECT * INTO inv FROM customer_invoices WHERE id = p_invoice_id FOR UPDATE;
  IF NOT FOUND OR inv.status NOT IN ('issued', 'partially_paid') THEN RETURN 0; END IF;
  v_wallet := wallet_balance_of(inv.account_id);
  v_apply  := LEAST(COALESCE(p_amount, inv.balance), inv.balance, v_wallet);
  IF v_apply <= 0 THEN RETURN 0; END IF;

  PERFORM post_ledger(inv.account_id, NULL,   'debit',  'wallet_apply', v_apply, NULL, NULL, 'Wallet applied to ' || inv.number);
  PERFORM post_ledger(inv.account_id, inv.id, 'credit', 'wallet_apply', v_apply, NULL, NULL, 'Paid from wallet');
  RETURN v_apply;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public, pg_temp;

-- Record a confirmed transaction against the ledger and issue the receipt.
-- Any amount above the invoice balance goes to the wallet, never lost.
CREATE OR REPLACE FUNCTION apply_payment(p_txn_id uuid) RETURNS void AS $$
DECLARE
  t        customer_payment_transactions%ROWTYPE;
  inv      customer_invoices%ROWTYPE;
  v_applied bigint := 0;
  v_surplus bigint;
BEGIN
  SELECT * INTO t FROM customer_payment_transactions WHERE id = p_txn_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Transaction not found'; END IF;

  IF t.invoice_id IS NOT NULL THEN
    SELECT * INTO inv FROM customer_invoices WHERE id = t.invoice_id FOR UPDATE;
    IF FOUND AND inv.status IN ('issued', 'partially_paid') THEN
      v_applied := LEAST(t.amount, inv.balance);
    END IF;
  END IF;

  IF v_applied > 0 THEN
    PERFORM post_ledger(t.account_id, inv.id, 'credit', 'payment', v_applied, t.id, NULL,
                        'Payment via ' || t.provider::text);
  END IF;
  v_surplus := t.amount - v_applied;
  IF v_surplus > 0 THEN
    PERFORM post_ledger(t.account_id, NULL, 'credit', 'wallet_credit', v_surplus, t.id, NULL,
                        'Credit held from payment via ' || t.provider::text);
  END IF;

  UPDATE customer_payment_transactions
  SET applied_amount = v_applied, wallet_amount = v_surplus
  WHERE id = t.id;

  INSERT INTO customer_receipts (organisation_id, transaction_id, invoice_id, student_id, number, amount)
  VALUES (t.organisation_id, t.id, t.invoice_id, t.student_id,
          next_number(t.organisation_id, 'RCT', 'receipt'), t.amount);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public, pg_temp;

-- ---------------------------------------------------------------------
-- 5. Pricing and invoicing (staff)
-- ---------------------------------------------------------------------

-- Best active price for a product: a session-specific price wins over a general one.
CREATE OR REPLACE FUNCTION price_for(p_product_id uuid, p_session_id uuid DEFAULT NULL)
RETURNS tenant_prices AS $$
  SELECT p.* FROM tenant_prices p
  WHERE p.product_id = p_product_id AND p.is_active
    AND (p.valid_from IS NULL OR p.valid_from <= current_date)
    AND (p.valid_to   IS NULL OR p.valid_to   >= current_date)
    AND (p.academic_session_id IS NULL OR p.academic_session_id = p_session_id)
  ORDER BY (p.academic_session_id IS NOT NULL) DESC, p.created_at DESC
  LIMIT 1;
$$ LANGUAGE sql STABLE;

-- Build a DRAFT invoice. items = [{"product_id":"..","quantity":1,"discount_code":"EARLY10"}].
-- Scholarships for the student are applied automatically. A manual "unit_price"
-- override needs finance.approve.
CREATE OR REPLACE FUNCTION create_invoice(
  p_student_id uuid, p_items jsonb,
  p_academic_session_id uuid DEFAULT NULL, p_due_on date DEFAULT NULL, p_notes text DEFAULT NULL
) RETURNS uuid AS $$
DECLARE
  v_org       uuid := current_org_id();
  v_acc       uuid;
  v_inv       uuid;
  v_cur       text;
  it          jsonb;
  prod        tenant_products%ROWTYPE;
  pr          tenant_prices%ROWTYPE;
  d           discounts%ROWTYPE;
  sch         scholarships%ROWTYPE;
  v_qty       integer;
  v_unit      bigint;
  v_gross     bigint;
  v_disc      bigint;
  v_disc_id   uuid;
  v_base      bigint;
  v_left      bigint;
  v_amt       bigint;
  v_sch_tot   bigint;
  v_sch_list  jsonb;
  v_fixed_left jsonb := '{}'::jsonb;
  v_line      bigint;
  t_gross bigint := 0; t_disc bigint := 0; t_sch bigint := 0;
BEGIN
  IF NOT has_permission('finance.manage') THEN
    RAISE EXCEPTION 'Permission denied: finance.manage required';
  END IF;
  IF p_items IS NULL OR jsonb_typeof(p_items) <> 'array' OR jsonb_array_length(p_items) = 0 THEN
    RAISE EXCEPTION 'At least one invoice item is required';
  END IF;

  v_acc := account_for_student(p_student_id);
  v_cur := COALESCE(org_setting(v_org, 'currency', '"NGN"'::jsonb) #>> '{}', 'NGN');

  INSERT INTO customer_invoices (organisation_id, account_id, student_id, academic_session_id,
                                 currency, due_on, notes)
  VALUES (v_org, v_acc, p_student_id, p_academic_session_id, v_cur, p_due_on, p_notes)
  RETURNING id INTO v_inv;

  FOR it IN SELECT e FROM jsonb_array_elements(p_items) e LOOP
    SELECT * INTO prod FROM tenant_products
    WHERE id = (it ->> 'product_id')::uuid AND organisation_id = v_org AND is_active;
    IF NOT FOUND THEN RAISE EXCEPTION 'Product % not found or inactive', it ->> 'product_id'; END IF;

    v_qty := COALESCE((it ->> 'quantity')::integer, 1);
    IF v_qty < 1 THEN RAISE EXCEPTION 'Quantity must be at least 1'; END IF;

    IF it ? 'unit_price' THEN
      IF NOT has_permission('finance.approve') THEN
        RAISE EXCEPTION 'Permission denied: overriding a price needs finance.approve';
      END IF;
      v_unit := (it ->> 'unit_price')::bigint;
    ELSE
      pr := price_for(prod.id, p_academic_session_id);
      IF pr.id IS NULL THEN RAISE EXCEPTION 'No active price set for %', prod.name; END IF;
      v_unit := pr.amount;
    END IF;
    v_gross := v_qty * v_unit;

    -- discount code
    v_disc := 0; v_disc_id := NULL;
    IF NULLIF(it ->> 'discount_code', '') IS NOT NULL THEN
      SELECT * INTO d FROM discounts
      WHERE organisation_id = v_org AND upper(code) = upper(it ->> 'discount_code') AND is_active
        AND (valid_from IS NULL OR valid_from <= current_date)
        AND (valid_to   IS NULL OR valid_to   >= current_date)
        AND (usage_limit IS NULL OR used_count < usage_limit)
        AND (product_id IS NULL OR product_id = prod.id);
      IF NOT FOUND THEN RAISE EXCEPTION 'Discount code % is not valid for this item', it ->> 'discount_code'; END IF;
      v_disc := LEAST(v_gross, CASE d.kind WHEN 'percent' THEN (v_gross * d.value) / 10000 ELSE d.value END);
      v_disc_id := d.id;
    END IF;

    -- scholarships (percent: of the price after discount; fixed: shared across lines until used up)
    v_base := v_gross - v_disc; v_left := v_base; v_sch_tot := 0; v_sch_list := '[]'::jsonb;
    FOR sch IN
      SELECT * FROM scholarships
      WHERE organisation_id = v_org AND student_id = p_student_id AND is_active
        AND (valid_from IS NULL OR valid_from <= current_date)
        AND (valid_to   IS NULL OR valid_to   >= current_date)
        AND (product_id IS NULL OR product_id = prod.id)
      ORDER BY created_at
    LOOP
      IF sch.kind = 'percent' THEN
        v_amt := LEAST(v_left, (v_base * sch.value) / 10000);
      ELSE
        v_amt := LEAST(v_left, COALESCE((v_fixed_left ->> sch.id::text)::bigint, sch.value));
        v_fixed_left := v_fixed_left || jsonb_build_object(
          sch.id::text, COALESCE((v_fixed_left ->> sch.id::text)::bigint, sch.value) - v_amt);
      END IF;
      IF v_amt > 0 THEN
        v_left    := v_left - v_amt;
        v_sch_tot := v_sch_tot + v_amt;
        v_sch_list := v_sch_list || jsonb_build_object('scholarship_id', sch.id, 'amount', v_amt);
      END IF;
    END LOOP;

    v_line := v_base - v_sch_tot;
    INSERT INTO customer_invoice_items
      (organisation_id, invoice_id, product_id, description, quantity, unit_price, gross,
       discount_id, discount_amount, scholarships_applied, scholarship_amount, line_total)
    VALUES (v_org, v_inv, prod.id, COALESCE(NULLIF(it ->> 'description', ''), prod.name), v_qty, v_unit, v_gross,
            v_disc_id, v_disc, v_sch_list, v_sch_tot, v_line);

    t_gross := t_gross + v_gross; t_disc := t_disc + v_disc; t_sch := t_sch + v_sch_tot;
  END LOOP;

  UPDATE customer_invoices
  SET subtotal = t_gross, discount_total = t_disc, scholarship_total = t_sch,
      total = t_gross - t_disc - t_sch
  WHERE id = v_inv;
  RETURN v_inv;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public, pg_temp;

-- Issue a draft: number it, post the debit, and use any wallet credit automatically.
CREATE OR REPLACE FUNCTION issue_invoice(p_invoice_id uuid) RETURNS void AS $$
DECLARE
  inv customer_invoices%ROWTYPE;
  v_due date;
  v_disc uuid;
  v_wallet bigint;
BEGIN
  IF NOT has_permission('finance.manage') THEN
    RAISE EXCEPTION 'Permission denied: finance.manage required';
  END IF;
  SELECT * INTO inv FROM customer_invoices
  WHERE id = p_invoice_id AND organisation_id = current_org_id() FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Invoice not found'; END IF;
  IF inv.status <> 'draft' THEN RAISE EXCEPTION 'Only draft invoices can be issued'; END IF;

  v_due := COALESCE(inv.due_on,
             current_date + COALESCE((org_setting(inv.organisation_id, 'default_due_days', '30'::jsonb) #>> '{}')::integer, 30));

  -- count each discount once per invoice, and honour usage limits
  FOR v_disc IN SELECT DISTINCT discount_id FROM customer_invoice_items
                WHERE invoice_id = inv.id AND discount_id IS NOT NULL LOOP
    UPDATE discounts SET used_count = used_count + 1
    WHERE id = v_disc AND (usage_limit IS NULL OR used_count < usage_limit);
    IF NOT FOUND THEN RAISE EXCEPTION 'A discount on this invoice has reached its usage limit'; END IF;
  END LOOP;

  UPDATE customer_invoices
  SET status = 'issued', number = next_number(inv.organisation_id, 'INV', 'invoice'),
      issued_at = now(), due_on = v_due
  WHERE id = inv.id;

  IF inv.total = 0 THEN
    UPDATE customer_invoices SET status = 'paid', paid_at = now() WHERE id = inv.id;
    RETURN;
  END IF;

  PERFORM post_ledger(inv.account_id, inv.id, 'debit', 'invoice', inv.total, NULL, NULL, 'Invoice issued');

  IF COALESCE((org_setting(inv.organisation_id, 'auto_apply_wallet', 'true'::jsonb) #>> '{}')::boolean, true) THEN
    v_wallet := wallet_balance_of(inv.account_id);
    IF v_wallet > 0 THEN PERFORM apply_wallet_internal(inv.id, LEAST(v_wallet, inv.total)); END IF;
  END IF;

  PERFORM audit_finance(inv.organisation_id, 'invoice.issued', 'customer_invoice', inv.id::text,
                        jsonb_build_object('total', inv.total, 'student_id', inv.student_id));
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public, pg_temp;

-- Cancel an invoice. Anything already paid moves to the student's wallet
-- (refund it from there if the money must go back to the payer).
CREATE OR REPLACE FUNCTION void_invoice(p_invoice_id uuid, p_reason text) RETURNS void AS $$
DECLARE
  inv customer_invoices%ROWTYPE;
  v_paid bigint;
BEGIN
  IF NOT has_permission('finance.manage') THEN
    RAISE EXCEPTION 'Permission denied: finance.manage required';
  END IF;
  IF p_reason IS NULL OR btrim(p_reason) = '' THEN RAISE EXCEPTION 'A reason is required'; END IF;

  SELECT * INTO inv FROM customer_invoices
  WHERE id = p_invoice_id AND organisation_id = current_org_id() FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Invoice not found'; END IF;
  IF inv.status = 'void' THEN RETURN; END IF;

  IF inv.status = 'draft' THEN
    UPDATE customer_invoices SET status = 'void', voided_at = now(), void_reason = p_reason WHERE id = inv.id;
    RETURN;
  END IF;

  v_paid := inv.total - inv.balance;               -- net paid (payments minus refunds)
  PERFORM post_ledger(inv.account_id, inv.id, 'credit', 'invoice_void', inv.total, NULL, NULL, 'Invoice voided: ' || p_reason);
  IF v_paid > 0 THEN
    PERFORM post_ledger(inv.account_id, inv.id, 'debit',  'wallet_transfer', v_paid, NULL, NULL, 'Moved to wallet');
    PERFORM post_ledger(inv.account_id, NULL,   'credit', 'wallet_transfer', v_paid, NULL, NULL, 'From voided ' || inv.number);
  END IF;

  UPDATE customer_invoices
  SET status = 'void', balance = 0, paid_at = NULL, voided_at = now(), void_reason = p_reason
  WHERE id = inv.id;

  PERFORM audit_finance(inv.organisation_id, 'invoice.voided', 'customer_invoice', inv.id::text,
                        jsonb_build_object('reason', p_reason, 'moved_to_wallet', v_paid));
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public, pg_temp;

-- Forgive part or all of an outstanding balance (needs finance.approve).
CREATE OR REPLACE FUNCTION write_off_balance(p_invoice_id uuid, p_amount bigint, p_reason text) RETURNS void AS $$
DECLARE
  inv customer_invoices%ROWTYPE;
BEGIN
  IF NOT has_permission('finance.approve') THEN
    RAISE EXCEPTION 'Permission denied: finance.approve required';
  END IF;
  IF p_reason IS NULL OR btrim(p_reason) = '' THEN RAISE EXCEPTION 'A reason is required'; END IF;
  SELECT * INTO inv FROM customer_invoices
  WHERE id = p_invoice_id AND organisation_id = current_org_id() FOR UPDATE;
  IF NOT FOUND OR inv.status NOT IN ('issued', 'partially_paid') THEN
    RAISE EXCEPTION 'Invoice not found or has nothing outstanding';
  END IF;
  IF p_amount IS NULL OR p_amount <= 0 OR p_amount > inv.balance THEN
    RAISE EXCEPTION 'Write-off must be between 1 and the outstanding balance (%)', inv.balance;
  END IF;

  PERFORM post_ledger(inv.account_id, inv.id, 'credit', 'adjustment', p_amount, NULL, NULL, 'Write-off: ' || p_reason);
  PERFORM audit_finance(inv.organisation_id, 'invoice.written_off', 'customer_invoice', inv.id::text,
                        jsonb_build_object('amount', p_amount, 'reason', p_reason));
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public, pg_temp;

-- Use wallet credit on an invoice (staff, or the student / a parent).
CREATE OR REPLACE FUNCTION apply_wallet_to_invoice(p_invoice_id uuid, p_amount bigint DEFAULT NULL) RETURNS bigint AS $$
DECLARE
  inv customer_invoices%ROWTYPE;
BEGIN
  SELECT * INTO inv FROM customer_invoices WHERE id = p_invoice_id AND organisation_id = current_org_id();
  IF NOT FOUND OR NOT can_pay_for_student(inv.student_id) THEN RAISE EXCEPTION 'Invoice not found'; END IF;
  RETURN apply_wallet_internal(inv.id, p_amount);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public, pg_temp;

-- ---------------------------------------------------------------------
-- 6. Payments
-- ---------------------------------------------------------------------

-- Step 1 of an online payment: your API calls this, then calls the provider's
-- "initialise" endpoint using the returned reference and amount, then attach_checkout().
-- Send an idempotency_key (e.g. a UUID per button press) so retries cannot double-charge.
CREATE OR REPLACE FUNCTION initiate_payment(
  p_invoice_id uuid, p_provider payment_provider, p_amount bigint DEFAULT NULL,
  p_idempotency_key text DEFAULT NULL, p_payer_email text DEFAULT NULL
) RETURNS jsonb AS $$
DECLARE
  inv customer_invoices%ROWTYPE;
  att customer_payment_attempts%ROWTYPE;
  v_amount bigint;
  v_ref text;
BEGIN
  IF p_provider NOT IN ('paystack', 'flutterwave') THEN
    RAISE EXCEPTION 'Online payments use paystack or flutterwave; record cash and transfers with record_manual_payment()';
  END IF;

  SELECT * INTO inv FROM customer_invoices WHERE id = p_invoice_id AND organisation_id = current_org_id();
  IF NOT FOUND OR NOT can_pay_for_student(inv.student_id) THEN RAISE EXCEPTION 'Invoice not found'; END IF;
  IF inv.status NOT IN ('issued', 'partially_paid') THEN
    RAISE EXCEPTION 'This invoice is not open for payment (status: %)', inv.status;
  END IF;

  IF p_idempotency_key IS NOT NULL THEN
    SELECT * INTO att FROM customer_payment_attempts
    WHERE organisation_id = inv.organisation_id AND idempotency_key = p_idempotency_key;
    IF FOUND THEN
      RETURN jsonb_build_object('attempt_id', att.id, 'reference', att.reference, 'amount', att.amount,
                                'currency', att.currency, 'checkout_url', att.checkout_url, 'reused', true);
    END IF;
  END IF;

  v_amount := COALESCE(p_amount, inv.balance);
  IF v_amount <= 0 OR v_amount > inv.balance THEN
    RAISE EXCEPTION 'Amount must be between 1 and the outstanding balance (%)', inv.balance;
  END IF;
  IF v_amount < inv.balance AND NOT COALESCE(
       (org_setting(inv.organisation_id, 'allow_part_payment', 'true'::jsonb) #>> '{}')::boolean, true) THEN
    RAISE EXCEPTION 'Part payments are not allowed; the full balance is required';
  END IF;

  v_ref := 'AFP' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 16));
  INSERT INTO customer_payment_attempts (organisation_id, account_id, student_id, invoice_id, provider,
                                         reference, idempotency_key, amount, currency, payer_email)
  VALUES (inv.organisation_id, inv.account_id, inv.student_id, inv.id, p_provider,
          v_ref, p_idempotency_key, v_amount, inv.currency, p_payer_email)
  RETURNING * INTO att;

  RETURN jsonb_build_object('attempt_id', att.id, 'reference', att.reference, 'amount', att.amount,
                            'currency', att.currency, 'reused', false);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public, pg_temp;

-- Step 2: store the provider's checkout link.
CREATE OR REPLACE FUNCTION attach_checkout(p_attempt_id uuid, p_checkout_url text, p_provider_ref text DEFAULT NULL)
RETURNS void AS $$
DECLARE
  att customer_payment_attempts%ROWTYPE;
BEGIN
  SELECT * INTO att FROM customer_payment_attempts
  WHERE id = p_attempt_id AND organisation_id = current_org_id();
  IF NOT FOUND OR NOT can_pay_for_student(att.student_id) THEN RAISE EXCEPTION 'Attempt not found'; END IF;
  UPDATE customer_payment_attempts
  SET checkout_url = p_checkout_url, provider_ref = p_provider_ref,
      status = CASE WHEN status = 'initiated' THEN 'pending'::payment_attempt_state ELSE status END
  WHERE id = att.id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public, pg_temp;

-- Cash, bank transfer, POS. With no invoice the money is held as wallet credit.
-- A bank/POS reference can be recorded only once.
CREATE OR REPLACE FUNCTION record_manual_payment(
  p_student_id uuid, p_amount bigint, p_provider payment_provider,
  p_invoice_id uuid DEFAULT NULL, p_reference text DEFAULT NULL,
  p_paid_at timestamptz DEFAULT NULL, p_payer_name text DEFAULT NULL, p_note text DEFAULT NULL
) RETURNS uuid AS $$
DECLARE
  v_org uuid := current_org_id();
  v_acc uuid;
  v_cur text;
  v_txn uuid;
BEGIN
  IF NOT has_permission('finance.manage') THEN
    RAISE EXCEPTION 'Permission denied: finance.manage required';
  END IF;
  IF p_provider IN ('paystack', 'flutterwave') THEN
    RAISE EXCEPTION 'Online payments are recorded automatically from the provider';
  END IF;
  IF p_amount IS NULL OR p_amount <= 0 THEN RAISE EXCEPTION 'Amount must be positive'; END IF;
  IF p_invoice_id IS NOT NULL AND NOT EXISTS (
       SELECT 1 FROM customer_invoices
       WHERE id = p_invoice_id AND organisation_id = v_org AND student_id = p_student_id) THEN
    RAISE EXCEPTION 'That invoice does not belong to this student';
  END IF;

  v_acc := account_for_student(p_student_id);
  SELECT currency INTO v_cur FROM customer_accounts WHERE id = v_acc;

  INSERT INTO customer_payment_transactions
    (organisation_id, account_id, student_id, invoice_id, provider, provider_txn_id, amount, currency,
     payer_name, note, paid_at, recorded_by)
  VALUES (v_org, v_acc, p_student_id, p_invoice_id, p_provider, NULLIF(btrim(p_reference), ''), p_amount, v_cur,
          p_payer_name, p_note, COALESCE(p_paid_at, now()), current_user_id())
  RETURNING id INTO v_txn;

  PERFORM apply_payment(v_txn);
  PERFORM audit_finance(v_org, 'payment.recorded_manually', 'customer_payment_transaction', v_txn::text,
                        jsonb_build_object('amount', p_amount, 'provider', p_provider, 'student_id', p_student_id));
  RETURN v_txn;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public, pg_temp;

-- ---------------------------------------------------------------------
-- Webhook secrets (Revision 6, H4). Readable only by the database owner (SECURITY DEFINER
-- functions). Production: keep the value in Supabase Vault and store only a reference, or
-- load it here from the backend's secret store through set_payment_provider_secret().
-- organisation_id NULL = platform-level merchant account.
-- ---------------------------------------------------------------------
CREATE SCHEMA IF NOT EXISTS private;
REVOKE ALL ON SCHEMA private FROM PUBLIC;
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN EXECUTE 'REVOKE ALL ON SCHEMA private FROM anon, authenticated, service_role'; END IF;
END $$;
CREATE TABLE private.payment_provider_secrets (
  provider        payment_provider NOT NULL CHECK (provider IN ('paystack', 'flutterwave')),
  organisation_id uuid REFERENCES public.organisations(id) ON DELETE CASCADE,
  secret          text NOT NULL CHECK (length(secret) >= 16),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  UNIQUE NULLS NOT DISTINCT (provider, organisation_id)
);
REVOKE ALL ON private.payment_provider_secrets FROM PUBLIC;

CREATE OR REPLACE FUNCTION set_payment_provider_secret(p_provider payment_provider, p_secret text,
                                                       p_organisation_id uuid DEFAULT NULL) RETURNS void AS $$
BEGIN
  PERFORM assert_service_context();
  INSERT INTO private.payment_provider_secrets (provider, organisation_id, secret)
  VALUES (p_provider, p_organisation_id, p_secret)
  ON CONFLICT (provider, organisation_id) DO UPDATE SET secret = EXCLUDED.secret, updated_at = now();
  INSERT INTO audit_events (organisation_id, action, entity_type, entity_id, source)
  VALUES (p_organisation_id, 'payment.secret_set', 'payment_provider', p_provider::text, 'set_payment_provider_secret');
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public, pg_temp;

-- Webhook entry point (trusted backend ONLY). Revision 6 (H4): the database no longer trusts
-- caller-supplied "signature valid" / "verified" flags or amounts.
--   p_raw_body     : the exact HTTP body the provider sent
--   p_signature    : the provider's signature header (Paystack x-paystack-signature,
--                    Flutterwave verif-hash)
--   p_verification : the JSON the backend got from the provider's verify-transaction API
--                    (optional; without it the event is recorded as 'not_verified')
-- The signature is checked here (HMAC-SHA512 / shared hash) against private.payment_provider_secrets,
-- and reference, amount, currency and status are read from the SIGNED body. The verification JSON
-- must agree with the signed body before money is recorded.
CREATE OR REPLACE FUNCTION ingest_payment_event(
  p_provider payment_provider, p_raw_body text, p_signature text, p_verification jsonb DEFAULT NULL
) RETURNS text AS $$
DECLARE
  v_body     jsonb;
  v_data     jsonb;
  v_event    text;
  v_event_id text;
  v_ref      text;
  v_ok       boolean;
  v_amount   bigint;
  v_currency text;
  v_txn_ref  text;
  v_fee      bigint;
  v_channel  text;
  v_paid_at  timestamptz;
  v_hint_org uuid;
  v_secret   text;
  v_sig_ok   boolean;
  v_verified boolean := false;
  v_vd       jsonb;
  v_wh       bigint;
  v_prev     text;
  v_att      customer_payment_attempts%ROWTYPE;
  v_txn      uuid;
  v_outcome  text;
BEGIN
  PERFORM assert_service_context();
  IF p_provider NOT IN ('paystack', 'flutterwave') THEN
    RAISE EXCEPTION 'Webhooks are accepted from paystack or flutterwave only';
  END IF;

  BEGIN
    v_body := p_raw_body::jsonb;
  EXCEPTION WHEN OTHERS THEN
    v_body := NULL;
  END;
  IF v_body IS NULL OR jsonb_typeof(v_body) <> 'object' OR jsonb_typeof(v_body -> 'data') <> 'object' THEN
    INSERT INTO audit_events (action, entity_type, entity_id, after_state, actor_type, source)
    VALUES ('payment.webhook.malformed_payload', 'payment_webhook', p_provider::text,
            jsonb_build_object('provider', p_provider, 'body_sha256',
                               encode(extensions.digest(COALESCE(p_raw_body, ''), 'sha256'), 'hex')),
            'webhook', 'webhook:' || p_provider);
    RETURN 'malformed_payload';
  END IF;

  v_event := v_body ->> 'event';
  v_data  := v_body -> 'data';
  BEGIN
    IF p_provider = 'paystack' THEN
      v_ref      := v_data ->> 'reference';
      v_ok       := (v_data ->> 'status') = 'success' AND v_event = 'charge.success';
      v_amount   := (v_data ->> 'amount')::bigint;                         -- kobo
      v_fee      := COALESCE((v_data ->> 'fees')::bigint, 0);
      v_channel  := v_data ->> 'channel';
      v_paid_at  := (v_data ->> 'paid_at')::timestamptz;
    ELSE
      v_ref      := v_data ->> 'tx_ref';
      v_ok       := (v_data ->> 'status') = 'successful';
      v_amount   := round((v_data ->> 'amount')::numeric * 100)::bigint;   -- naira -> kobo
      v_fee      := round(COALESCE((v_data ->> 'app_fee')::numeric, 0) * 100)::bigint;
      v_channel  := v_data ->> 'payment_type';
      v_paid_at  := (v_data ->> 'created_at')::timestamptz;
    END IF;
    v_currency := upper(v_data ->> 'currency');
    v_txn_ref  := v_data ->> 'id';
  EXCEPTION WHEN OTHERS THEN
    v_amount := NULL;
  END;
  v_event_id := p_provider::text || ':' || COALESCE(v_event, '?') || ':' ||
                COALESCE(v_txn_ref, encode(extensions.digest(p_raw_body, 'sha256'), 'hex'));

  -- Secret: the school's own merchant account if the (unverified) reference points to one, else platform.
  SELECT a.organisation_id INTO v_hint_org FROM customer_payment_attempts a
  WHERE a.provider = p_provider AND a.reference = v_ref;
  SELECT ps.secret INTO v_secret FROM private.payment_provider_secrets ps
  WHERE ps.provider = p_provider AND (ps.organisation_id = v_hint_org OR ps.organisation_id IS NULL)
  ORDER BY ps.organisation_id NULLS LAST LIMIT 1;

  v_sig_ok := v_secret IS NOT NULL AND p_signature IS NOT NULL AND
              CASE p_provider
                WHEN 'paystack' THEN lower(btrim(p_signature)) =
                     encode(extensions.hmac(convert_to(p_raw_body, 'UTF8'), convert_to(v_secret, 'UTF8'), 'sha512'), 'hex')
                ELSE btrim(p_signature) = v_secret
              END;

  INSERT INTO customer_payment_webhooks (provider, event_id, event_type, reference, payload, signature_valid)
  VALUES (p_provider, v_event_id, COALESCE(v_event, 'unknown'), v_ref, v_body, v_sig_ok)
  ON CONFLICT (provider, event_id) DO UPDATE
    SET delivery_count  = customer_payment_webhooks.delivery_count + 1,
        signature_valid = customer_payment_webhooks.signature_valid OR EXCLUDED.signature_valid
  RETURNING id, outcome INTO v_wh, v_prev;

  IF v_prev IN ('recorded', 'already_processed', 'recorded_failure') THEN
    v_outcome := 'duplicate_event';
  ELSIF NOT v_sig_ok THEN
    v_outcome := 'invalid_signature';
  ELSIF v_amount IS NULL OR v_ref IS NULL THEN
    v_outcome := 'malformed_payload';
  ELSE
    SELECT * INTO v_att FROM customer_payment_attempts
    WHERE provider = p_provider AND reference = v_ref FOR UPDATE;

    IF NOT FOUND THEN
      v_outcome := 'unknown_reference';
    ELSE
      UPDATE customer_payment_webhooks SET organisation_id = v_att.organisation_id WHERE id = v_wh;

      -- Verification JSON from the provider's verify API must match the signed body.
      v_vd := p_verification -> 'data';
      IF v_vd IS NOT NULL THEN
        IF p_provider = 'paystack' THEN
          v_verified := (v_vd ->> 'status') = 'success' AND (v_vd ->> 'reference') = v_ref
                        AND (v_vd ->> 'amount')::bigint = v_amount AND upper(v_vd ->> 'currency') = v_currency;
        ELSE
          v_verified := (v_vd ->> 'status') = 'successful' AND (v_vd ->> 'tx_ref') = v_ref
                        AND round((v_vd ->> 'amount')::numeric * 100)::bigint = v_amount
                        AND upper(v_vd ->> 'currency') = v_currency;
        END IF;
      END IF;

      IF NOT v_ok THEN
        UPDATE customer_payment_attempts
        SET status = 'failed', failure_reason = COALESCE(v_data ->> 'gateway_response', v_data ->> 'status', 'failed'),
            completed_at = now()
        WHERE id = v_att.id AND status IN ('initiated', 'pending', 'expired');
        v_outcome := 'recorded_failure';

      ELSIF NOT COALESCE(v_verified, false) THEN
        v_outcome := 'not_verified';

      ELSIF v_amount IS DISTINCT FROM v_att.amount OR v_currency IS DISTINCT FROM v_att.currency THEN
        UPDATE customer_payment_attempts
        SET status = 'needs_review',
            failure_reason = format('Expected %s %s, provider reported %s %s',
                                    v_att.amount, v_att.currency, v_amount, v_currency)
        WHERE id = v_att.id;
        v_outcome := 'amount_mismatch';

      ELSIF v_att.status = 'succeeded'
            OR EXISTS (SELECT 1 FROM customer_payment_transactions
                       WHERE provider = p_provider AND provider_txn_id = v_txn_ref) THEN
        v_outcome := 'already_processed';

      ELSE
        INSERT INTO customer_payment_transactions
          (organisation_id, account_id, student_id, invoice_id, attempt_id, provider, provider_txn_id,
           amount, fee, currency, channel, payer_email, paid_at, verified_at)
        VALUES (v_att.organisation_id, v_att.account_id, v_att.student_id, v_att.invoice_id, v_att.id,
                p_provider, v_txn_ref, v_att.amount, COALESCE(v_fee, 0), v_att.currency,
                v_channel, v_att.payer_email, COALESCE(v_paid_at, now()), now())
        RETURNING id INTO v_txn;

        UPDATE customer_payment_attempts SET status = 'succeeded', completed_at = now() WHERE id = v_att.id;
        PERFORM apply_payment(v_txn);
        v_outcome := 'recorded';
      END IF;
    END IF;
  END IF;

  UPDATE customer_payment_webhooks SET outcome = v_outcome, processed_at = now() WHERE id = v_wh;
  INSERT INTO audit_events (organisation_id, action, entity_type, entity_id, after_state, actor_type, source)
  VALUES (v_att.organisation_id, 'payment.webhook.' || v_outcome, 'payment_webhook', v_wh::text,
          jsonb_build_object('provider', p_provider, 'event', v_event, 'reference', v_ref,
                             'amount', v_amount, 'currency', v_currency, 'outcome', v_outcome,
                             'signature_valid', v_sig_ok, 'verified', v_verified),
          'webhook', 'webhook:' || p_provider);
  RETURN v_outcome;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public, pg_temp;

-- Run every few minutes from a scheduler (service role): abandoned checkouts expire after 24 hours.
-- A late "success" webhook for an expired attempt is still honoured.
CREATE OR REPLACE FUNCTION run_finance_maintenance() RETURNS integer AS $$
DECLARE n integer;
BEGIN
  PERFORM assert_service_context();   -- Revision 6 (H4)
  UPDATE customer_payment_attempts
  SET status = 'expired', completed_at = now()
  WHERE status IN ('initiated', 'pending') AND created_at < now() - interval '24 hours';
  GET DIAGNOSTICS n = ROW_COUNT;
  RETURN n;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public, pg_temp;

-- ---------------------------------------------------------------------
-- 8. Refunds: request -> approve (a different person) -> complete
-- ---------------------------------------------------------------------
-- source 'invoice': reopens the invoice balance (use when the fee is still owed).
-- source 'wallet' : takes it from the student's credit (use after voiding an invoice).
CREATE OR REPLACE FUNCTION request_refund(
  p_transaction_id uuid, p_amount bigint, p_reason text, p_source refund_source DEFAULT 'invoice'
) RETURNS uuid AS $$
DECLARE
  t customer_payment_transactions%ROWTYPE;
  v_committed bigint;
  v_id uuid;
BEGIN
  IF NOT has_permission('finance.manage') THEN
    RAISE EXCEPTION 'Permission denied: finance.manage required';
  END IF;
  IF p_reason IS NULL OR btrim(p_reason) = '' THEN RAISE EXCEPTION 'A reason is required'; END IF;
  SELECT * INTO t FROM customer_payment_transactions
  WHERE id = p_transaction_id AND organisation_id = current_org_id() FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Transaction not found'; END IF;

  SELECT COALESCE(SUM(amount), 0) INTO v_committed FROM customer_refunds
  WHERE transaction_id = t.id AND status IN ('requested', 'approved', 'completed');
  IF p_amount IS NULL OR p_amount <= 0 OR p_amount > t.amount - v_committed THEN
    RAISE EXCEPTION 'Refund must be between 1 and % (payment less refunds already requested)', t.amount - v_committed;
  END IF;

  INSERT INTO customer_refunds (organisation_id, transaction_id, invoice_id, student_id, amount, source, reason)
  VALUES (t.organisation_id, t.id, t.invoice_id, t.student_id, p_amount, p_source, p_reason)
  RETURNING id INTO v_id;
  RETURN v_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public, pg_temp;

CREATE OR REPLACE FUNCTION approve_refund(p_refund_id uuid, p_note text DEFAULT NULL) RETURNS void AS $$
DECLARE
  r customer_refunds%ROWTYPE;
BEGIN
  IF NOT has_permission('finance.approve') THEN
    RAISE EXCEPTION 'Permission denied: finance.approve required';
  END IF;
  SELECT * INTO r FROM customer_refunds
  WHERE id = p_refund_id AND organisation_id = current_org_id() FOR UPDATE;
  IF NOT FOUND OR r.status <> 'requested' THEN RAISE EXCEPTION 'Refund not found or not awaiting approval'; END IF;
  IF r.requested_by = current_user_id() THEN
    RAISE EXCEPTION 'A refund must be approved by someone other than the person who requested it';
  END IF;
  UPDATE customer_refunds
  SET status = 'approved', approved_by = current_user_id(), decision_note = p_note, decided_at = now()
  WHERE id = r.id;
  PERFORM audit_finance(r.organisation_id, 'refund.approved', 'customer_refund', r.id::text,
                        jsonb_build_object('amount', r.amount));
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public, pg_temp;

CREATE OR REPLACE FUNCTION reject_refund(p_refund_id uuid, p_note text DEFAULT NULL) RETURNS void AS $$
DECLARE
  r customer_refunds%ROWTYPE;
BEGIN
  IF NOT has_permission('finance.approve') THEN
    RAISE EXCEPTION 'Permission denied: finance.approve required';
  END IF;
  SELECT * INTO r FROM customer_refunds
  WHERE id = p_refund_id AND organisation_id = current_org_id() FOR UPDATE;
  IF NOT FOUND OR r.status <> 'requested' THEN RAISE EXCEPTION 'Refund not found or not awaiting approval'; END IF;
  UPDATE customer_refunds
  SET status = 'rejected', approved_by = current_user_id(), decision_note = p_note, decided_at = now()
  WHERE id = r.id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public, pg_temp;

-- Call after the money has actually been sent back (through the provider's
-- refund API, or by bank transfer). Posts the ledger entry.
CREATE OR REPLACE FUNCTION complete_refund(p_refund_id uuid, p_provider_refund_id text DEFAULT NULL) RETURNS void AS $$
DECLARE
  r   customer_refunds%ROWTYPE;
  t   customer_payment_transactions%ROWTYPE;
  inv customer_invoices%ROWTYPE;
BEGIN
  IF NOT has_permission('finance.manage') THEN
    RAISE EXCEPTION 'Permission denied: finance.manage required';
  END IF;
  SELECT * INTO r FROM customer_refunds
  WHERE id = p_refund_id AND organisation_id = current_org_id() FOR UPDATE;
  IF NOT FOUND OR r.status <> 'approved' THEN RAISE EXCEPTION 'Refund not found or not approved'; END IF;
  SELECT * INTO t FROM customer_payment_transactions WHERE id = r.transaction_id;

  IF r.source = 'invoice' THEN
    IF r.invoice_id IS NULL THEN RAISE EXCEPTION 'This payment has no invoice; refund it from the wallet'; END IF;
    SELECT * INTO inv FROM customer_invoices WHERE id = r.invoice_id;
    IF inv.status = 'void' THEN RAISE EXCEPTION 'The invoice is void; refund from the wallet instead'; END IF;
    IF r.amount > t.applied_amount THEN
      RAISE EXCEPTION 'Only % of this payment was applied to the invoice; refund the rest from the wallet', t.applied_amount;
    END IF;
    PERFORM post_ledger(t.account_id, inv.id, 'debit', 'refund', r.amount, t.id, r.id, 'Refund: ' || r.reason);
  ELSE
    IF wallet_balance_of(t.account_id) < r.amount THEN
      RAISE EXCEPTION 'Not enough wallet credit for this refund';
    END IF;
    PERFORM post_ledger(t.account_id, NULL, 'debit', 'refund', r.amount, t.id, r.id, 'Refund from wallet: ' || r.reason);
  END IF;

  UPDATE customer_refunds
  SET status = 'completed', completed_by = current_user_id(), completed_at = now(),
      provider_refund_id = p_provider_refund_id
  WHERE id = r.id;
  PERFORM audit_finance(r.organisation_id, 'refund.completed', 'customer_refund', r.id::text,
                        jsonb_build_object('amount', r.amount, 'source', r.source));
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public, pg_temp;

-- ---------------------------------------------------------------------
-- 9. Exam eligibility hook (replaces the stub from migration 005)
-- A student is "cleared" unless they have an overdue invoice with a balance
-- above the organisation's tolerance (setting 'fee_clearance_tolerance', kobo).
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION fees_cleared(p_student_id uuid) RETURNS boolean AS $$
  SELECT NOT EXISTS (
    SELECT 1 FROM customer_invoices i
    WHERE i.student_id = p_student_id
      -- Revision 6 (M4): the student's own organisation, so trusted backend jobs evaluate it too
      AND i.organisation_id = (SELECT s.organisation_id FROM students s WHERE s.id = p_student_id)
      AND i.status IN ('issued', 'partially_paid')
      AND i.due_on < current_date
      AND i.balance > COALESCE(
            (SELECT (value #>> '{}')::bigint FROM organisation_settings
             WHERE organisation_id = i.organisation_id AND key = 'fee_clearance_tolerance'), 0)
  );
$$ LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog, public, pg_temp;

-- ---------------------------------------------------------------------
-- 10. Roles and grants
-- ---------------------------------------------------------------------
-- Supabase service_role is reserved for trusted webhook/scheduler execution.

GRANT SELECT, INSERT, UPDATE, DELETE ON tenant_products, tenant_prices, scholarships TO authenticated;
-- used_count is maintained by issue_invoice(); it cannot be reset by hand.
GRANT SELECT, DELETE ON discounts TO authenticated;
GRANT INSERT (organisation_id, code, name, kind, value, product_id, valid_from, valid_to, usage_limit, is_active)
  ON discounts TO authenticated;
GRANT UPDATE (code, name, kind, value, product_id, valid_from, valid_to, usage_limit, is_active)
  ON discounts TO authenticated;
GRANT SELECT, DELETE ON customer_invoices TO authenticated;               -- drafts only (see policy)
GRANT SELECT ON customer_accounts, customer_invoice_items, customer_payment_attempts,
                customer_payment_transactions, customer_payment_webhooks, customer_receipts,
                customer_refunds, tenant_ledger TO authenticated;

DO $$
DECLARE f record;
BEGIN
  -- lock everything down first
  FOR f IN SELECT p.oid::regprocedure AS sig FROM pg_proc p
           JOIN pg_namespace n ON n.oid = p.pronamespace
           WHERE n.nspname = 'public' AND p.proname = ANY (ARRAY[
             'org_setting','next_number','audit_finance','wallet_balance_of','post_ledger','account_for_student',
             'can_pay_for_student','apply_wallet_internal','apply_payment','create_invoice','issue_invoice',
             'void_invoice','write_off_balance','apply_wallet_to_invoice','initiate_payment','attach_checkout',
             'record_manual_payment','ingest_payment_event','run_finance_maintenance','request_refund',
             'approve_refund','reject_refund','complete_refund'])
  LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC', f.sig);
  END LOOP;

  -- callable by the app (each function checks the caller's permissions itself)
  FOR f IN SELECT p.oid::regprocedure AS sig FROM pg_proc p
           JOIN pg_namespace n ON n.oid = p.pronamespace
           WHERE n.nspname = 'public' AND p.proname = ANY (ARRAY[
             'can_pay_for_student','create_invoice','issue_invoice','void_invoice','write_off_balance',
             'apply_wallet_to_invoice','initiate_payment','attach_checkout','record_manual_payment',
             'request_refund','approve_refund','reject_refund','complete_refund','price_for'])
  LOOP
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO authenticated', f.sig);
  END LOOP;

  -- callable by the webhook / scheduler service only
  FOR f IN SELECT p.oid::regprocedure AS sig FROM pg_proc p
           JOIN pg_namespace n ON n.oid = p.pronamespace
           WHERE n.nspname = 'public' AND p.proname = ANY (ARRAY['ingest_payment_event','run_finance_maintenance','set_payment_provider_secret'])
  LOOP
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO service_role', f.sig);
  END LOOP;
END $$;

-- ---------------------------------------------------------------------
-- 11. Row-level security
-- Staff who see everyone: finance.view_all.
-- Students and parents: finance.read AND linked to the student (drafts hidden).
-- Teachers see no financial data.
-- ---------------------------------------------------------------------
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['org_counters','tenant_products','tenant_prices','customer_accounts','discounts',
                           'scholarships','customer_invoices','customer_invoice_items','customer_payment_attempts',
                           'customer_payment_transactions','customer_payment_webhooks','customer_receipts',
                           'customer_refunds','tenant_ledger']
  LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
  END LOOP;
END $$;

-- Price list: every member can read active products and prices; finance.manage edits.
CREATE POLICY products_read ON tenant_products FOR SELECT TO authenticated
  USING (organisation_id = (SELECT current_org_id()) AND (SELECT is_org_member()));
CREATE POLICY products_write ON tenant_products FOR ALL TO authenticated
  USING (organisation_id = (SELECT current_org_id()) AND (SELECT has_permission('finance.manage')))
  WITH CHECK (organisation_id = (SELECT current_org_id()) AND (SELECT has_permission('finance.manage')));

CREATE POLICY prices_read ON tenant_prices FOR SELECT TO authenticated
  USING (organisation_id = (SELECT current_org_id()) AND (SELECT is_org_member()));
CREATE POLICY prices_write ON tenant_prices FOR ALL TO authenticated
  USING (organisation_id = (SELECT current_org_id()) AND (SELECT has_permission('finance.manage')))
  WITH CHECK (organisation_id = (SELECT current_org_id()) AND (SELECT has_permission('finance.manage')));

-- Discount codes and scholarships are confidential.
CREATE POLICY discounts_all ON discounts FOR ALL TO authenticated
  USING (organisation_id = (SELECT current_org_id()) AND (SELECT has_permission('finance.view_all')))
  WITH CHECK (organisation_id = (SELECT current_org_id()) AND (SELECT has_permission('finance.manage')));

CREATE POLICY scholarships_read ON scholarships FOR SELECT TO authenticated
  USING (organisation_id = (SELECT current_org_id())
         AND ((SELECT has_permission('finance.view_all'))
              OR ((SELECT has_permission('finance.read')) AND is_self_or_parent(student_id))));
CREATE POLICY scholarships_write ON scholarships FOR ALL TO authenticated
  USING (organisation_id = (SELECT current_org_id()) AND (SELECT has_permission('finance.manage')))
  WITH CHECK (organisation_id = (SELECT current_org_id()) AND (SELECT has_permission('finance.manage')));

-- Money tables share one read rule.
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['customer_accounts','customer_payment_attempts','customer_payment_transactions',
                           'customer_receipts','customer_refunds','tenant_ledger']
  LOOP
    EXECUTE format(
      'CREATE POLICY %I ON %I FOR SELECT TO authenticated
         USING (organisation_id = (SELECT current_org_id())
                AND ((SELECT has_permission(''finance.view_all''))
                     OR ((SELECT has_permission(''finance.read'')) AND is_self_or_parent(student_id))))',
      t || '_read', t);
  END LOOP;
END $$;

CREATE POLICY invoices_read ON customer_invoices FOR SELECT TO authenticated
  USING (organisation_id = (SELECT current_org_id())
         AND ((SELECT has_permission('finance.view_all'))
              OR (status <> 'draft' AND (SELECT has_permission('finance.read')) AND is_self_or_parent(student_id))));
CREATE POLICY invoices_delete_draft ON customer_invoices FOR DELETE TO authenticated
  USING (organisation_id = (SELECT current_org_id()) AND (SELECT has_permission('finance.manage')) AND status = 'draft');

CREATE POLICY invoice_items_read ON customer_invoice_items FOR SELECT TO authenticated
  USING (organisation_id = (SELECT current_org_id())
         AND EXISTS (SELECT 1 FROM customer_invoices i WHERE i.id = customer_invoice_items.invoice_id));

CREATE POLICY webhooks_read ON customer_payment_webhooks FOR SELECT TO authenticated
  USING (organisation_id = (SELECT current_org_id()) AND (SELECT has_permission('finance.manage')));

-- org_counters: no policy for authenticated = no direct access (functions only).

-- ---------------------------------------------------------------------
-- 12. Views (Postgres 15+ for security_invoker)
-- ---------------------------------------------------------------------

-- Invoices with payment progress and overdue flags.
CREATE VIEW invoice_summary WITH (security_invoker = true) AS
SELECT i.organisation_id, i.id AS invoice_id, i.number, i.student_id,
       s.full_name AS student_name, s.admission_no, i.academic_session_id,
       i.status, i.issued_at, i.due_on, i.total, i.balance, i.total - i.balance AS paid,
       (i.status IN ('issued', 'partially_paid') AND i.due_on < current_date) AS is_overdue,
       GREATEST(current_date - i.due_on, 0) AS days_overdue
FROM customer_invoices i
JOIN students s ON s.id = i.student_id;

-- Prepaid credit per student.
CREATE VIEW wallet_balances WITH (security_invoker = true) AS
SELECT l.organisation_id, l.account_id, l.student_id,
       SUM(CASE l.entry_type WHEN 'credit' THEN l.amount ELSE -l.amount END)::bigint AS wallet_balance
FROM tenant_ledger l
WHERE l.invoice_id IS NULL
GROUP BY l.organisation_id, l.account_id, l.student_id;

-- What each student owes, and how much of it is overdue.
CREATE VIEW outstanding_balances WITH (security_invoker = true) AS
SELECT a.organisation_id, a.student_id, a.id AS account_id, a.balance AS account_balance,
       COALESCE(SUM(i.balance) FILTER (WHERE i.status IN ('issued', 'partially_paid')), 0)::bigint AS outstanding,
       COALESCE(SUM(i.balance) FILTER (WHERE i.status IN ('issued', 'partially_paid')
                                        AND i.due_on < current_date), 0)::bigint AS overdue
FROM customer_accounts a
LEFT JOIN customer_invoices i ON i.account_id = a.id
GROUP BY a.organisation_id, a.student_id, a.id, a.balance;

-- Statement of account with running balance.
CREATE VIEW account_statement WITH (security_invoker = true) AS
SELECT l.organisation_id, l.account_id, l.student_id, l.id AS entry_id, l.posted_at,
       l.kind, l.entry_type, l.amount, l.balance_after, l.memo,
       i.number AS invoice_number
FROM tenant_ledger l
LEFT JOIN customer_invoices i ON i.id = l.invoice_id;

-- Billing and collection per academic session (for the bursar / management dashboard).
CREATE VIEW fee_collection_summary WITH (security_invoker = true) AS
SELECT i.organisation_id, i.academic_session_id,
       COUNT(*)                                        AS invoices,
       COALESCE(SUM(i.total), 0)::bigint               AS billed,
       COALESCE(SUM(i.total - i.balance), 0)::bigint   AS collected,
       COALESCE(SUM(i.balance), 0)::bigint             AS outstanding,
       COALESCE(SUM(i.balance) FILTER (WHERE i.due_on < current_date), 0)::bigint AS overdue,
       COALESCE(SUM(i.discount_total), 0)::bigint      AS discounts_given,
       COALESCE(SUM(i.scholarship_total), 0)::bigint   AS scholarships_given
FROM customer_invoices i
WHERE i.status IN ('issued', 'partially_paid', 'paid')
GROUP BY i.organisation_id, i.academic_session_id;

-- Payments that need a human: amount mismatches and similar.
CREATE VIEW payments_needing_review WITH (security_invoker = true) AS
SELECT a.organisation_id, a.id AS attempt_id, a.reference, a.provider, a.student_id,
       a.invoice_id, a.amount, a.currency, a.failure_reason, a.created_at
FROM customer_payment_attempts a
WHERE a.status = 'needs_review';

GRANT SELECT ON invoice_summary, wallet_balances, outstanding_balances, account_statement,
                fee_collection_summary, payments_needing_review TO authenticated;

INSERT INTO public.schema_migrations (version, description) VALUES ('006', 'finance and payments (rev 6)');

COMMIT;

-- =====================================================================
-- Notes
-- 1. Everyday flow:
--      price list (products + prices) -> create_invoice() -> issue_invoice()
--      -> parent pays: initiate_payment() -> provider checkout -> webhook
--      -> ingest_payment_event() -> ledger + receipt + invoice status.
--      Cash/transfer: record_manual_payment().
-- 2. Settings this migration reads from organisation_settings (all optional):
--      currency ("NGN"), default_due_days (30), auto_apply_wallet (true),
--      allow_part_payment (true), fee_clearance_tolerance (kobo, 0).
-- 3. Exams with requires_fees_cleared = true now block students who have an
--    overdue invoice above the tolerance (fees_cleared() is replaced here).
-- 4. Security model for payments: the browser is never trusted. The webhook
--    handler verifies the signature AND re-checks the transaction with the
--    provider, then calls ingest_payment_event() under service_role.
--    Store provider secret keys in your host's secret manager, not in the
--    database.
-- 5. Business decision to make before going live: does each school receive
--    money directly (Paystack subaccounts / split payments, so you never
--    hold their funds) or does it settle to you first? That changes how
--    initiate_payment() talks to the provider, not this schema.
-- 6. Keep in mind: amounts are integer kobo everywhere (N1,000.00 = 100000).
--    Multi-currency conversion is not handled; each account has one currency.
-- 7. Refund limits: a refund cannot exceed its payment, and 'invoice'
--    refunds cannot exceed what was applied to the invoice. Partial
--    invoice/wallet splits within one payment are handled by making two
--    refund requests.
-- 8. Not yet included: payment plans/instalment schedules with automatic
--    reminders (they would sit on top of invoices), platform billing (what
--    schools pay you), and PDF receipt rendering (done in the app layer).
-- =====================================================================