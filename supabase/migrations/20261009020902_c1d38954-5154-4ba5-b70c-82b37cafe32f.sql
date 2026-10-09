REVOKE ALL ON public.ai_platform_settings FROM service_role;
GRANT SELECT ON public.ai_platform_settings TO service_role;
UPDATE public.schema_migrations SET description = description || ' (+ grant correction: service_role SELECT only on ai_platform_settings)' WHERE version = '011-m6a';