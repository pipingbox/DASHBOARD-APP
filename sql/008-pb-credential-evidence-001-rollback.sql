-- rollback for 008-pb-credential-evidence-001.sql
DROP TRIGGER IF EXISTS credential_evidence_cert_ownership ON public.app_worker_credential_evidence;
DROP TRIGGER IF EXISTS credential_evidence_guard ON public.app_worker_credential_evidence;

DROP FUNCTION IF EXISTS public.pb_credential_evidence_cert_ownership();
DROP FUNCTION IF EXISTS public.pb_credential_evidence_guard();

DROP TABLE IF EXISTS public.app_worker_credential_evidence;
