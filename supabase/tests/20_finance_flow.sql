-- Finance: invoice -> payment attempt -> webhook (idempotent) -> paid -> ledger balanced.
\set ON_ERROR_STOP on
\set A '00000000-0000-0000-0000-00000000000a'
\set OWNER '00000000-0000-0000-0000-0000000000a1'
\set BURSAR '00000000-0000-0000-0000-0000000000a5'
\set STUDENT '00000000-0000-0000-0000-0000000000a3'
\set PARENT '00000000-0000-0000-0000-0000000000a4'
INSERT INTO students (id, organisation_id, user_id, full_name) VALUES ('00000000-0000-0000-0000-000000000508', :'A', :'STUDENT', 'Student A') ON CONFLICT DO NOTHING;
INSERT INTO parents (id, organisation_id, user_id, full_name) VALUES ('00000000-0000-0000-0000-000000000509', :'A', :'PARENT', 'Parent A');
INSERT INTO student_parents (organisation_id, student_id, parent_id) VALUES (:'A','00000000-0000-0000-0000-000000000508','00000000-0000-0000-0000-000000000509');

BEGIN; SET LOCAL ROLE app_user; SELECT set_config('app.current_user', :'BURSAR', true), set_config('app.current_org', :'A', true);
INSERT INTO tenant_products (organisation_id, code, name) VALUES (:'A', 'TUITION', 'Tuition') RETURNING id AS pid \gset
INSERT INTO tenant_prices (organisation_id, product_id, amount) VALUES (:'A', :'pid', 5000000);
SELECT create_invoice('00000000-0000-0000-0000-000000000508', jsonb_build_array(jsonb_build_object('product_id', :'pid'))) AS inv \gset
SELECT issue_invoice(:'inv'::uuid);
SELECT 'invoice: ' || status || ' total=' || total || ' balance=' || balance FROM customer_invoices WHERE id = :'inv';
COMMIT;

BEGIN; SET LOCAL ROLE app_user; SELECT set_config('app.current_user', :'PARENT', true), set_config('app.current_org', :'A', true);
SELECT initiate_payment(:'inv'::uuid, 'paystack', NULL, 'idem-1', 'p@x.test') ->> 'reference' AS ref \gset
SELECT 'idempotent reuse: ' || (initiate_payment(:'inv'::uuid, 'paystack', NULL, 'idem-1') ->> 'reused');
COMMIT;

\echo --- webhook, delivered twice
BEGIN; SET LOCAL ROLE payments_service;
SELECT ingest_payment_event('paystack','evt-1','charge.success','{}'::jsonb,true,:'ref','success','txn-1',5000000,'NGN',75000,'card',now(),true);
SELECT ingest_payment_event('paystack','evt-1','charge.success','{}'::jsonb,true,:'ref','success','txn-1',5000000,'NGN',75000,'card',now(),true);
COMMIT;
\echo --- wrong amount must not mark paid
BEGIN; SET LOCAL ROLE payments_service;
SELECT ingest_payment_event('paystack','evt-2','charge.success','{}'::jsonb,true,'NOSUCHREF','success','txn-2',100,'NGN',0,'card',now(),true);
COMMIT;

SELECT 'invoice after webhook: ' || status || ' balance=' || balance FROM customer_invoices WHERE id = :'inv';
SELECT 'transactions: ' || count(*) FROM customer_payment_transactions;
SELECT 'ledger debits=' || sum(CASE WHEN entry_type='debit' THEN amount END) || ' credits=' || sum(CASE WHEN entry_type='credit' THEN amount END) FROM tenant_ledger;

\echo --- student must not create invoices or write ledger
\set ON_ERROR_STOP off
BEGIN; SET LOCAL ROLE app_user; SELECT set_config('app.current_user', :'STUDENT', true), set_config('app.current_org', :'A', true);
SELECT create_invoice('00000000-0000-0000-0000-000000000508', '[{}]'::jsonb);
ROLLBACK;
BEGIN; SET LOCAL ROLE app_user; SELECT set_config('app.current_user', :'STUDENT', true), set_config('app.current_org', :'A', true);
INSERT INTO tenant_ledger (organisation_id) VALUES (:'A');
ROLLBACK;
BEGIN; SET LOCAL ROLE app_user; SELECT set_config('app.current_user', :'STUDENT', true), set_config('app.current_org', :'A', true);
SELECT ingest_payment_event('paystack','evt-9','charge.success','{}'::jsonb,true,'x','success','t',1,'NGN');
ROLLBACK;
