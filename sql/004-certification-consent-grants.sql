-- PB-DRIFT-001 V6: create certification consent log table.
--
-- When a company is allowed to see the full details of a worker's certification during a hiring
-- process, that authorization must be logged and the worker must be notified. This table stores
-- every grant, its scope, and its revocation.

CREATE TABLE IF NOT EXISTS app_certification_access_grants (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  certification_id UUID NOT NULL REFERENCES app_worker_certifications(id) ON DELETE CASCADE,
  worker_user_id   UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  company_user_id  UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  granted_by       UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  granted_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at       TIMESTAMPTZ,
  revoked_at       TIMESTAMPTZ,
  revoked_by       UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  job_application_id UUID,
  notes            TEXT,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_cert_grants_certification ON app_certification_access_grants(certification_id);
CREATE INDEX IF NOT EXISTS idx_cert_grants_worker        ON app_certification_access_grants(worker_user_id);
CREATE INDEX IF NOT EXISTS idx_cert_grants_company       ON app_certification_access_grants(company_user_id);

ALTER TABLE app_certification_access_grants ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS cert_grants_worker_select ON app_certification_access_grants;
DROP POLICY IF EXISTS cert_grants_company_select ON app_certification_access_grants;
DROP POLICY IF EXISTS cert_grants_worker_insert ON app_certification_access_grants;
DROP POLICY IF EXISTS cert_grants_worker_revoke ON app_certification_access_grants;
DROP POLICY IF EXISTS cert_grants_admin_all ON app_certification_access_grants;

CREATE POLICY cert_grants_worker_select ON app_certification_access_grants
  FOR SELECT TO authenticated
  USING (worker_user_id = auth.uid() OR app_is_admin());

CREATE POLICY cert_grants_company_select ON app_certification_access_grants
  FOR SELECT TO authenticated
  USING (company_user_id = auth.uid());

CREATE POLICY cert_grants_worker_insert ON app_certification_access_grants
  FOR INSERT TO authenticated
  WITH CHECK (granted_by = auth.uid() AND worker_user_id = auth.uid());

CREATE POLICY cert_grants_worker_revoke ON app_certification_access_grants
  FOR UPDATE TO authenticated
  USING (worker_user_id = auth.uid() OR app_is_admin())
  WITH CHECK (worker_user_id = auth.uid() OR app_is_admin());

CREATE POLICY cert_grants_admin_all ON app_certification_access_grants
  FOR ALL TO authenticated
  USING (app_is_admin())
  WITH CHECK (app_is_admin());
