-- R0 remediation (F-01): the temporary M4 results table is no longer created
-- by the chain; IF EXISTS keeps cleanup safe for histories where it was.
DROP TABLE IF EXISTS public.m4_test_results;
