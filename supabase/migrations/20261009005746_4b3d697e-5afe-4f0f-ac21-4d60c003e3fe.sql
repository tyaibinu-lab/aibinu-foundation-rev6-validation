-- R0 remediation (F-01): intentional no-op.
-- Originally a transient Gate 11C M4 self-test that inserted rows into
-- ai_credit_transactions using organisation/user UUIDs that existed only in the
-- validation project, so it failed with a foreign-key violation on any fresh
-- database. It created only a temporary results table and rolled back all test
-- data; no schema object it created survives the chain.
-- The test coverage now lives in supabase/tests/35_ai_credit_selftest.sql with
-- self-contained synthetic fixtures. Filename and position are preserved so
-- existing migration histories stay aligned.
SELECT 1;
