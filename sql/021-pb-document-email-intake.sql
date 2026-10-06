-- PB-DOCUMENT-INTAKE-001 — Entrega B (Vía B): recepción documental por correo.
-- Additive-only: crea 4 tablas NUEVAS + 1 bucket PRIVADO de cuarentena.
-- NO toca tablas existentes, perfiles, certificaciones ni buckets actuales.
-- GO del PO 2026-10-06: migraciones PREPARADAS, NO aplicadas en producción
-- hasta un segundo GO explícito. Aplicación manual vía SQL Editor / psql
-- (runbook scripts/verify-sql-state.md) + verificación posterior.
--
-- Decisiones de seguridad (threat model en brain/growth/PB-DOCUMENT-INTAKE-001.md §Entrega B):
--   - El token de referencia se almacena SOLO como hash SHA-256 (token de 192
--     bits de entropía; hash sin sal aceptable a esa entropía, evita rainbow).
--   - Ningún nombre de archivo, asunto, remitente ni contenido se persiste:
--     solo metadatos sanitizados (conteos, MIME detectado, tamaños, hashes).
--   - RLS: el usuario solo lee SUS referencias; el resto es admin (rol en
--     app_14da0f1941_profiles) o service role (Edge Functions).
--   - Escrituras: SOLO service role (sin políticas INSERT/UPDATE/DELETE para
--     usuarios autenticados → denegado por defecto).
--   - Bucket de cuarentena PRIVADO, separado de los canónicos, con límite de
--     tamaño y MIME restringidos a documentos.
--   - Cero promoción canónica en esta fase: ninguna FK ni trigger escribe en
--     app_worker_certifications / app_14da0f1941_profiles.
--
-- Rollback:
--   DROP TABLE IF EXISTS app_14da0f1941_document_extraction_fields;
--   DROP TABLE IF EXISTS app_14da0f1941_document_inbound_attachments;
--   DROP TABLE IF EXISTS app_14da0f1941_document_inbound_messages;
--   DROP TABLE IF EXISTS app_14da0f1941_document_email_references;
--   DELETE FROM storage.buckets WHERE id = 'document-quarantine';

-- ---------------------------------------------------------------------------
-- 1. Referencias temporales (vínculo usuario ↔ correo entrante)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS app_14da0f1941_document_email_references (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  token_hash      text NOT NULL UNIQUE,            -- sha256 hex del token (el token NUNCA se persiste)
  user_id         uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  document_type   text NOT NULL CHECK (document_type IN ('certificate', 'cv')),
  status          text NOT NULL DEFAULT 'REFERENCE_CREATED'
                  CHECK (status IN ('REFERENCE_CREATED', 'CONSUMED', 'EXPIRED', 'REVOKED')),
  expires_at      timestamptz NOT NULL,
  created_at      timestamptz NOT NULL DEFAULT now(),
  consumed_at     timestamptz,
  revoked_at      timestamptz,
  correlation_id  uuid NOT NULL DEFAULT gen_random_uuid()
);
CREATE INDEX IF NOT EXISTS document_email_references_user_idx
  ON app_14da0f1941_document_email_references (user_id, created_at DESC);
-- Búsqueda del pipeline: por hash, solo referencias vivas.
CREATE INDEX IF NOT EXISTS document_email_references_token_idx
  ON app_14da0f1941_document_email_references (token_hash) WHERE status = 'REFERENCE_CREATED';

ALTER TABLE app_14da0f1941_document_email_references ENABLE ROW LEVEL SECURITY;

-- Usuario: solo lectura de sus propias referencias (estados permitidos).
DROP POLICY IF EXISTS document_email_references_select_own ON app_14da0f1941_document_email_references;
CREATE POLICY document_email_references_select_own
  ON app_14da0f1941_document_email_references FOR SELECT TO authenticated
  USING (user_id = auth.uid());

-- Admin: lectura completa (bandeja «Documentos recibidos»).
DROP POLICY IF EXISTS document_email_references_admin_select ON app_14da0f1941_document_email_references;
CREATE POLICY document_email_references_admin_select
  ON app_14da0f1941_document_email_references FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM app_14da0f1941_profiles p
    WHERE p.id = auth.uid() AND p.role = 'admin'
  ));

-- ---------------------------------------------------------------------------
-- 2. Mensajes entrantes (metadatos sanitizados; idempotencia por proveedor)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS app_14da0f1941_document_inbound_messages (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  provider            text NOT NULL CHECK (provider IN ('resend', 'postmark', 'cloudflare')),
  provider_message_id text NOT NULL,               -- email_id del proveedor (NO el Message-ID SMTP, potencialmente PII)
  reference_id        uuid REFERENCES app_14da0f1941_document_email_references(id) ON DELETE SET NULL,
  status              text NOT NULL DEFAULT 'RECEIVED'
                      CHECK (status IN (
                        'RECEIVED', 'QUARANTINED', 'SCANNING', 'EXTRACTION_PENDING',
                        'NEEDS_REVIEW', 'AWAITING_USER_CONFIRMATION',
                        'APPROVED', 'REJECTED', 'PROMOTED', 'FAILED', 'EXPIRED'
                      )),
  sender_match        text NOT NULL DEFAULT 'unknown'
                      CHECK (sender_match IN ('match', 'mismatch', 'unknown')), -- señal, nunca prueba
  attachment_count    integer NOT NULL DEFAULT 0,
  received_at         timestamptz NOT NULL DEFAULT now(),
  processed_at        timestamptz,
  error_category      text CHECK (error_category IN (
                        'invalid_signature', 'invalid_payload', 'unknown_reference',
                        'expired_reference', 'revoked_reference', 'consumed_reference',
                        'no_attachment', 'too_many_attachments', 'oversize',
                        'mime_mismatch', 'blocked_format', 'download_failed',
                        'provider_unavailable', 'duplicate', 'database', 'unknown'
                      )),
  retention_until     timestamptz NOT NULL DEFAULT (now() + interval '30 days'),
  correlation_id      uuid NOT NULL DEFAULT gen_random_uuid(),
  UNIQUE (provider, provider_message_id)           -- idempotencia estructural
);
CREATE INDEX IF NOT EXISTS document_inbound_messages_reference_idx
  ON app_14da0f1941_document_inbound_messages (reference_id);
CREATE INDEX IF NOT EXISTS document_inbound_messages_status_idx
  ON app_14da0f1941_document_inbound_messages (status, received_at DESC);

ALTER TABLE app_14da0f1941_document_inbound_messages ENABLE ROW LEVEL SECURITY;

-- Admin: lectura completa. Usuario final: SIN acceso (tabla interna; su
-- visibilidad es a través de sus referencias).
DROP POLICY IF EXISTS document_inbound_messages_admin_select ON app_14da0f1941_document_inbound_messages;
CREATE POLICY document_inbound_messages_admin_select
  ON app_14da0f1941_document_inbound_messages FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM app_14da0f1941_profiles p
    WHERE p.id = auth.uid() AND p.role = 'admin'
  ));

-- ---------------------------------------------------------------------------
-- 3. Adjuntos en cuarentena (objeto privado + metadatos forenses)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS app_14da0f1941_document_inbound_attachments (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  inbound_message_id    uuid NOT NULL REFERENCES app_14da0f1941_document_inbound_messages(id) ON DELETE CASCADE,
  document_type         text CHECK (document_type IN ('certificate', 'cv')),
  quarantine_bucket     text NOT NULL DEFAULT 'document-quarantine',
  quarantine_object_key text NOT NULL,             -- generado por nosotros (uuid), NUNCA el nombre original
  detected_mime         text NOT NULL,             -- MIME real por magic bytes (no el declarado)
  declared_mime         text,                      -- declarado por el remitente (para detectar mismatch)
  size_bytes            bigint NOT NULL,
  sha256                text NOT NULL,
  malware_status        text NOT NULL DEFAULT 'pending'
                        CHECK (malware_status IN ('pending', 'clean_static_checks', 'suspicious', 'rejected')),
  extraction_status     text NOT NULL DEFAULT 'pending'
                        CHECK (extraction_status IN ('pending', 'completed', 'low_confidence', 'failed', 'skipped')),
  confidence            numeric(4,3),              -- 0.000–1.000; nunca prueba documental
  canonical_status      text NOT NULL DEFAULT 'none'
                        CHECK (canonical_status IN ('none', 'promoted', 'rejected')), -- TEST: siempre 'none'
  created_at            timestamptz NOT NULL DEFAULT now(),
  UNIQUE (inbound_message_id, sha256),             -- dedupe por hash dentro del mensaje
  UNIQUE (quarantine_bucket, quarantine_object_key)
);
CREATE INDEX IF NOT EXISTS document_inbound_attachments_message_idx
  ON app_14da0f1941_document_inbound_attachments (inbound_message_id);

ALTER TABLE app_14da0f1941_document_inbound_attachments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS document_inbound_attachments_admin_select ON app_14da0f1941_document_inbound_attachments;
CREATE POLICY document_inbound_attachments_admin_select
  ON app_14da0f1941_document_inbound_attachments FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM app_14da0f1941_profiles p
    WHERE p.id = auth.uid() AND p.role = 'admin'
  ));

-- ---------------------------------------------------------------------------
-- 4. Campos de extracción (BORRADOR; sin OCR íntegro persistido)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS app_14da0f1941_document_extraction_fields (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  attachment_id uuid NOT NULL REFERENCES app_14da0f1941_document_inbound_attachments(id) ON DELETE CASCADE,
  field_name    text NOT NULL CHECK (field_name IN (
                  'certificate_name', 'issuing_org', 'issue_date', 'expiry_date',
                  'credential_number', 'language', 'specialties', 'work_experience'
                )),
  field_value   text,                              -- NULL hasta que un motor autorizado extraiga
  confidence    numeric(4,3),
  source        text,                              -- p. ej. 'page:1' — nunca contenido OCR
  status        text NOT NULL DEFAULT 'draft'
                CHECK (status IN ('draft', 'confirmed_user', 'corrected_admin', 'rejected')),
  corrected_value text,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now(),
  UNIQUE (attachment_id, field_name)
);

ALTER TABLE app_14da0f1941_document_extraction_fields ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS document_extraction_fields_admin_select ON app_14da0f1941_document_extraction_fields;
CREATE POLICY document_extraction_fields_admin_select
  ON app_14da0f1941_document_extraction_fields FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM app_14da0f1941_profiles p
    WHERE p.id = auth.uid() AND p.role = 'admin'
  ));

-- Admin corrige borradores (única escritura no-service-role permitida).
DROP POLICY IF EXISTS document_extraction_fields_admin_update ON app_14da0f1941_document_extraction_fields;
CREATE POLICY document_extraction_fields_admin_update
  ON app_14da0f1941_document_extraction_fields FOR UPDATE TO authenticated
  USING (EXISTS (
    SELECT 1 FROM app_14da0f1941_profiles p
    WHERE p.id = auth.uid() AND p.role = 'admin'
  ))
  WITH CHECK (status IN ('draft', 'corrected_admin', 'rejected'));

-- ---------------------------------------------------------------------------
-- 5. Bucket PRIVADO de cuarentena (10 MB/objeto, solo documentos e imágenes)
-- ---------------------------------------------------------------------------
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'document-quarantine',
  'document-quarantine',
  false,
  10485760, -- 10 MiB, alineado con el límite de la app
  ARRAY['application/pdf', 'image/png', 'image/jpeg']
)
ON CONFLICT (id) DO NOTHING;

NOTIFY pgrst, 'reload schema';
