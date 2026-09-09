-- ===== candidate DDL (tabla + constraints + indices + grants + guards + policies) =====

CREATE TABLE public.app_worker_credential_evidence (
  id                    uuid        PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Titular. NOT NULL y con FK: se corrige el defecto de certifications.user_id.
  user_id               uuid        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,

  -- Referencia opcional a la credencial que esta evidencia respalda.
  certification_id      uuid        REFERENCES public.app_worker_certifications(id) ON DELETE SET NULL,

  -- Metadata canonica de Storage. Sin columna de URL publica.
  storage_bucket        text        NOT NULL,
  storage_path          text        NOT NULL,
  file_name             text,
  mime_type             text,
  file_size             bigint,

  -- Estado de verificacion. Solo escribible por via privilegiada (guard).
  verification_state    text        NOT NULL DEFAULT 'claimed',

  -- Auditoria de verificacion admin. Solo via privilegiada.
  verified_at           timestamptz,
  verified_by           uuid        REFERENCES auth.users(id) ON DELETE RESTRICT,

  -- Extraccion de IA (consumidas por PB-CREDENTIAL-AI-BENCHMARK-001; pobladas por backend).
  ai_extracted_at       timestamptz,
  ai_extraction         jsonb,

  created_at            timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.app_worker_credential_evidence
  ADD CONSTRAINT credential_evidence_state_check
  CHECK (verification_state IN (
    'claimed', 'evidence_uploaded', 'ai_extracted',
    'document_supported', 'manually_verified', 'issuer_verified'
  ));

-- Coherencia de auditoria bidireccional:
-- verification_state verificado  <=>  verified_at y verified_by ambos no nulos.
ALTER TABLE public.app_worker_credential_evidence
  ADD CONSTRAINT credential_evidence_audit_bidirectional
  CHECK (
    (verification_state IN ('manually_verified', 'issuer_verified'))
    =
    (verified_at IS NOT NULL AND verified_by IS NOT NULL)
  );

-- Metadata canonica obligatoria en par.
ALTER TABLE public.app_worker_credential_evidence
  ADD CONSTRAINT credential_evidence_storage_pair
  CHECK (storage_bucket IS NOT NULL AND storage_path IS NOT NULL);

CREATE INDEX credential_evidence_user_idx
  ON public.app_worker_credential_evidence (user_id);
CREATE INDEX credential_evidence_cert_idx
  ON public.app_worker_credential_evidence (certification_id)
  WHERE certification_id IS NOT NULL;
CREATE INDEX credential_evidence_state_idx
  ON public.app_worker_credential_evidence (verification_state);

REVOKE ALL ON TABLE public.app_worker_credential_evidence FROM anon, authenticated, service_role;

-- anon: nada. Ni lectura.
-- (no GRANT para anon)

-- authenticated: lectura de sus filas; insercion de evidencia; escritura SOLO de metadata no
-- privilegiada. Las columnas de estado/auditoria/IA NO se conceden.
GRANT SELECT ON public.app_worker_credential_evidence TO authenticated;
GRANT INSERT (user_id, certification_id, storage_bucket, storage_path,
              file_name, mime_type, file_size) ON public.app_worker_credential_evidence TO authenticated;
GRANT UPDATE (certification_id, storage_bucket, storage_path,
              file_name, mime_type, file_size) ON public.app_worker_credential_evidence TO authenticated;

-- service_role: todo, para el backend (admin-verify, extraccion de IA, matching).
GRANT SELECT, INSERT, UPDATE, DELETE ON public.app_worker_credential_evidence TO service_role;

CREATE OR REPLACE FUNCTION public.pb_credential_evidence_guard()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog
AS $$
DECLARE
  v_is_privileged boolean;
BEGIN
  -- INSERT: el unico estado inicial valido es 'claimed', sin campos de auditoria ni IA.
  IF TG_OP = 'INSERT' THEN
    IF NEW.verification_state IS DISTINCT FROM 'claimed' THEN
      RAISE EXCEPTION 'INSERT directo con estado % no permitido; unico estado inicial = claimed.', NEW.verification_state;
    END IF;
    IF NEW.verified_at IS NOT NULL THEN
      RAISE EXCEPTION 'INSERT con verified_at no nulo no permitido.';
    END IF;
    IF NEW.verified_by IS NOT NULL THEN
      RAISE EXCEPTION 'INSERT con verified_by no nulo no permitido.';
    END IF;
    IF NEW.ai_extracted_at IS NOT NULL OR NEW.ai_extraction IS NOT NULL THEN
      RAISE EXCEPTION 'INSERT inicial no admite datos de extraccion IA.';
    END IF;
  END IF;

  v_is_privileged := current_user IN ('postgres', 'supabase_admin');
  IF NOT v_is_privileged THEN
    v_is_privileged := COALESCE(
      NULLIF(current_setting('request.jwt.claims', true), '')::jsonb ->> 'role', ''
    ) = 'service_role';
  END IF;
  -- Un admin de aplicacion (role='admin' en profiles) SI puede verificar. Su JWT es
  -- 'authenticated', asi que se detecta por el predicado canonico.
  IF NOT v_is_privileged THEN
    v_is_privileged := public.app_is_admin();
  END IF;

  -- 1) Transicion de estado: siempre validada, incluso para privilegiados.
  IF TG_OP = 'UPDATE' AND NEW.verification_state IS DISTINCT FROM OLD.verification_state THEN
    IF NOT EXISTS (
      SELECT 1 FROM (VALUES
        ('claimed','evidence_uploaded'),
        ('evidence_uploaded','ai_extracted'),
        ('evidence_uploaded','document_supported'),
        ('evidence_uploaded','manually_verified'),
        ('ai_extracted','document_supported'),
        ('ai_extracted','manually_verified'),
        ('document_supported','manually_verified'),
        ('document_supported','issuer_verified'),
        ('manually_verified','issuer_verified')
      ) AS t(from_state, to_state)
      WHERE t.from_state = OLD.verification_state AND t.to_state = NEW.verification_state
    ) THEN
      RAISE EXCEPTION 'Transicion de estado no permitida: % -> %.',
        OLD.verification_state, NEW.verification_state;
    END IF;
  END IF;

  -- 2) Coherencia de auditoria bidireccional: estado verificado <=> audit completo.
  IF NEW.verification_state IN ('manually_verified', 'issuer_verified')
     AND (NEW.verified_at IS NULL OR NEW.verified_by IS NULL) THEN
    RAISE EXCEPTION 'Estado verificado requiere verified_at y verified_by.';
  END IF;
  IF NEW.verification_state NOT IN ('manually_verified', 'issuer_verified')
     AND (NEW.verified_at IS NOT NULL OR NEW.verified_by IS NOT NULL) THEN
    RAISE EXCEPTION 'Estado no verificado no admite verified_at ni verified_by.';
  END IF;

  -- 3) Columnas privilegiadas: solo un actor privilegiado puede alterarlas.
  IF TG_OP = 'UPDATE' AND NOT v_is_privileged THEN
    IF NEW.verification_state IS DISTINCT FROM OLD.verification_state THEN
      RAISE EXCEPTION 'Columna protegida: verification_state.';
    END IF;
    IF NEW.verified_at IS DISTINCT FROM OLD.verified_at THEN
      RAISE EXCEPTION 'Columna protegida: verified_at.';
    END IF;
    IF NEW.verified_by IS DISTINCT FROM OLD.verified_by THEN
      RAISE EXCEPTION 'Columna protegida: verified_by.';
    END IF;
    IF NEW.ai_extracted_at IS DISTINCT FROM OLD.ai_extracted_at THEN
      RAISE EXCEPTION 'Columna protegida: ai_extracted_at.';
    END IF;
    IF NEW.ai_extraction IS DISTINCT FROM OLD.ai_extraction THEN
      RAISE EXCEPTION 'Columna protegida: ai_extraction.';
    END IF;
    -- El titular tampoco puede reasignar la evidencia a otro usuario.
    IF NEW.user_id IS DISTINCT FROM OLD.user_id THEN
      RAISE EXCEPTION 'Columna protegida: user_id.';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER credential_evidence_guard
  BEFORE INSERT OR UPDATE ON public.app_worker_credential_evidence
  FOR EACH ROW EXECUTE FUNCTION public.pb_credential_evidence_guard();

-- Ownership invariant: evidence may reference only certifications that belong to the same
-- user. No SECURITY DEFINER; it runs under the caller's privileges. For authenticated
-- owners this is naturally enforced by the RLS on app_worker_certifications; for
-- service_role/backend it is enforced explicitly. Certifications with user_id IS NULL
-- are rejected as invalid targets.
CREATE OR REPLACE FUNCTION public.pb_credential_evidence_cert_ownership()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog
AS $$
DECLARE
  v_cert_owner uuid;
BEGIN
  IF NEW.certification_id IS NOT NULL THEN
    SELECT user_id INTO v_cert_owner
    FROM public.app_worker_certifications
    WHERE id = NEW.certification_id;

    IF v_cert_owner IS NULL THEN
      RAISE EXCEPTION 'La certificacion % no existe o no tiene titular valido.', NEW.certification_id;
    END IF;

    IF v_cert_owner IS DISTINCT FROM NEW.user_id THEN
      RAISE EXCEPTION 'La certificacion % no pertenece al titular de la evidencia.', NEW.certification_id;
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER credential_evidence_cert_ownership
  BEFORE INSERT OR UPDATE ON public.app_worker_credential_evidence
  FOR EACH ROW EXECUTE FUNCTION public.pb_credential_evidence_cert_ownership();

ALTER TABLE public.app_worker_credential_evidence ENABLE ROW LEVEL SECURITY;

CREATE POLICY evidence_select_own ON public.app_worker_credential_evidence
  FOR SELECT TO authenticated USING ((select auth.uid()) = user_id OR public.app_is_admin());
CREATE POLICY evidence_insert_own ON public.app_worker_credential_evidence
  FOR INSERT TO authenticated WITH CHECK ((select auth.uid()) = user_id);
CREATE POLICY evidence_update_own ON public.app_worker_credential_evidence
  FOR UPDATE TO authenticated USING ((select auth.uid()) = user_id) WITH CHECK ((select auth.uid()) = user_id);
CREATE POLICY evidence_delete_own ON public.app_worker_credential_evidence
  FOR DELETE TO authenticated USING ((select auth.uid()) = user_id);
