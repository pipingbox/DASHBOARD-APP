-- PB-JOBS-SWEDEN-001 — registro histórico y verificación de solo lectura.
-- La oferta y sus traducciones se crearon manualmente en producción antes de este PR.
-- Este archivo NO es una migración ni un seed; NO debe ejecutarse automáticamente.
-- No incluye INSERT, UPDATE, DELETE, UPSERT ni instrucciones para publicar.
-- La oferta debe permanecer en DRAFT hasta recibir autorización comercial,
-- confirmación contractual de las condiciones y GO explícito de Gaspar.
-- El SQL original podía sobrescribir una oferta editada mediante ON CONFLICT DO UPDATE;
-- se retiró antes de abrir el PR. No se modifican ni duplican registros al consultarlo.
-- Hallazgo cosmético: period es texto libre en español y no se localiza en la ficha
-- inglesa o portuguesa; la duración sí figura traducida en la descripción.

SELECT id, title, company, country, category, discipline, status,
       vacancies, currency, salary_min, salary_max, salary_period, salary_mode,
       hours_per_day, period, accommodation_included, transport_included,
       source_language, applications_count
FROM app_14da0f1941_jobs
WHERE id = '8c1d4f6a-2b57-4d3e-9f21-7a6c5e0b9d34';

SELECT job_id, language, title, translation_status, source_content_hash
FROM app_14da0f1941_job_translations
WHERE job_id = '8c1d4f6a-2b57-4d3e-9f21-7a6c5e0b9d34'
ORDER BY language;
