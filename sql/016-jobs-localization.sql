-- =============================================================================
-- 016-jobs-localization.sql — PB-JOBS-PILOT-FOLLOWUP-002
-- Jobs localization + structured public fields + authenticated public read fix
--
-- PROBLEM
--   1. Jobs carry no source-language metadata and no translations table, so a
--      Spanish/Dutch/French/Portuguese reader sees the English description
--      mixed with a localized UI (mixed-language experience).
--   2. The public listing card renders the full description (unreadable feed).
--   3. There is no per-job detail route; the RLS policy "pb_public_read_open_jobs"
--      only grants SELECT to role "anon", so AUTHENTICATED candidates get an
--      EMPTY jobs list and cannot apply (production incident observed 2026-09-28).
--
-- DELTA
--   A. app_14da0f1941_jobs: additive columns only (all nullable, safe defaults):
--      source_language, vacancies, salary_period, hours_per_day, schedule,
--      saturdays, vca_required, accommodation_included, transport_included, period,
--      summary. No existing column is dropped or retyped.
--   B. new table app_14da0f1941_job_translations (one row per job+language,
--      UNIQUE(job_id, language), source_content_hash for staleness detection).
--   C. RLS: translations are publicly readable ONLY while the parent job is
--      'open' (mirrors the jobs public-read boundary). No client INSERT/UPDATE/
--      DELETE policy: writes are service-role only (translation pipeline).
--   D. RLS fix: "pb_public_read_open_jobs" now applies to (anon, authenticated)
--      with the SAME USING (status = 'open'). This grants authenticated users
--      nothing anon does not already have — it restores the intended public
--      read for logged-in candidates. Owner/admin policies are untouched.
--
-- BACKFILL
--   The two real pilot vacancies (INEOS Project One, BASF EUROCHEM) get their
--   structured fields + machine translations (es/nl/fr/pt). English source
--   content is NOT modified in meaning; business conditions are unchanged.
--
-- RLS IMPLICATIONS
--   - jobs: policy audience widened anon -> (anon, authenticated); predicate
--     unchanged. No owner/admin policy modified. No policy dropped.
--   - job_translations: new table, RLS enabled, single SELECT policy gated on
--     the parent job being open. Service role bypasses RLS for writes.
--
-- ROLLBACK
--   ALTER POLICY pb_public_read_open_jobs ON app_14da0f1941_jobs TO anon;
--   DROP TABLE IF EXISTS app_14da0f1941_job_translations;
--   ALTER TABLE app_14da0f1941_jobs
--     DROP COLUMN IF EXISTS source_language, DROP COLUMN IF EXISTS vacancies,
--     DROP COLUMN IF EXISTS salary_period, DROP COLUMN IF EXISTS hours_per_day,
--     DROP COLUMN IF EXISTS schedule, DROP COLUMN IF EXISTS saturdays,
--     DROP COLUMN IF EXISTS vca_required, DROP COLUMN IF EXISTS accommodation_included,
--     DROP COLUMN IF EXISTS transport_included, DROP COLUMN IF EXISTS period,
--     DROP COLUMN IF EXISTS summary;
--   (Column drops are safe: all are additive and nullable.)
--
-- COMPATIBILITY
--   - Old rows without the new columns read as NULL; the UI treats NULL as
--     "not provided" and keeps rendering legacy fields exactly as before.
--   - The existing /jobs listing and CompanyPostJob form are unaffected
--     (supabase.js ignores unknown columns).
-- =============================================================================

-- -----------------------------------------------------------------------------
-- A. Additive columns on the canonical jobs table
-- -----------------------------------------------------------------------------
ALTER TABLE app_14da0f1941_jobs
  ADD COLUMN IF NOT EXISTS source_language text NOT NULL DEFAULT 'en',
  ADD COLUMN IF NOT EXISTS vacancies integer,
  ADD COLUMN IF NOT EXISTS salary_period text,
  ADD COLUMN IF NOT EXISTS hours_per_day numeric,
  ADD COLUMN IF NOT EXISTS schedule text,
  ADD COLUMN IF NOT EXISTS saturdays text,
  ADD COLUMN IF NOT EXISTS vca_required boolean,
  ADD COLUMN IF NOT EXISTS accommodation_included boolean,
  ADD COLUMN IF NOT EXISTS transport_included boolean,
  ADD COLUMN IF NOT EXISTS period text,
  ADD COLUMN IF NOT EXISTS summary text;

COMMENT ON COLUMN app_14da0f1941_jobs.source_language IS 'BCP-47-ish language tag of the original/source content (source of truth).';
COMMENT ON COLUMN app_14da0f1941_jobs.vacancies IS 'Number of open positions for this vacancy.';
COMMENT ON COLUMN app_14da0f1941_jobs.salary_period IS 'Salary period for salary_min/salary_max (e.g. hour).';
COMMENT ON COLUMN app_14da0f1941_jobs.hours_per_day IS 'Contractual working hours per day.';
COMMENT ON COLUMN app_14da0f1941_jobs.schedule IS 'Normal working schedule, e.g. 07:00–17:00.';
COMMENT ON COLUMN app_14da0f1941_jobs.saturdays IS 'Saturday work arrangement (e.g. optional). NULL when not supplied.';

-- -----------------------------------------------------------------------------
-- B. Localized job content (one canonical job, N associated translations)
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS app_14da0f1941_job_translations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id uuid NOT NULL REFERENCES app_14da0f1941_jobs(id) ON DELETE CASCADE,
  language text NOT NULL CHECK (language ~ '^[a-z]{2}(-[A-Z]{2})?$'),
  title text NOT NULL,
  summary text,
  description text,
  requirements text,
  source_language text NOT NULL DEFAULT 'en',
  source_content_hash text NOT NULL,
  translation_status text NOT NULL DEFAULT 'machine' CHECK (translation_status IN ('machine', 'human_reviewed')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (job_id, language)
);

CREATE INDEX IF NOT EXISTS idx_job_translations_job_id ON app_14da0f1941_job_translations(job_id);

-- API roles need explicit SELECT grants (RLS controls rows; grants control access).
-- Required because this table is created outside Supabase's default-privilege path.
GRANT SELECT ON app_14da0f1941_job_translations TO anon, authenticated;

ALTER TABLE app_14da0f1941_job_translations ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS job_translations_public_read ON app_14da0f1941_job_translations;
CREATE POLICY job_translations_public_read ON app_14da0f1941_job_translations
  FOR SELECT TO anon, authenticated
  USING (
    EXISTS (
      SELECT 1 FROM app_14da0f1941_jobs j
      WHERE j.id = app_14da0f1941_job_translations.job_id AND j.status = 'open'
    )
  );

-- -----------------------------------------------------------------------------
-- C. Fix: authenticated candidates must be able to read OPEN jobs
--    (same predicate the anon role already has; owner/admin policies untouched)
-- -----------------------------------------------------------------------------
ALTER POLICY pb_public_read_open_jobs ON app_14da0f1941_jobs TO anon, authenticated;

-- -----------------------------------------------------------------------------
-- D. Backfill the two real pilot vacancies (business conditions unchanged)
-- -----------------------------------------------------------------------------
UPDATE app_14da0f1941_jobs SET
  source_language = 'en',
  vacancies = 5,
  currency = 'EUR',
  salary_min = 25,
  salary_max = NULL,
  salary_period = 'hour',
  hours_per_day = 9,
  schedule = '07:00–17:00',
  saturdays = 'optional',
  vca_required = true,
  accommodation_included = false,
  transport_included = false,
  contract_type = 'Belgian employment contract',
  period = NULL,
  summary = 'PIPINGBOX is looking for 5 experienced Pipefitters for INEOS Project One in Belgium. Belgian employment contract, from €25 gross/hour, 9 working hours per day, VCA mandatory. Accommodation and transport not included.',
  updated_at = now()
WHERE id = 'c5b70769-7189-4c1c-9329-cf6d26ed92a6';

UPDATE app_14da0f1941_jobs SET
  source_language = 'en',
  vacancies = 2,
  currency = 'EUR',
  salary_min = 25,
  salary_max = NULL,
  salary_period = 'hour',
  hours_per_day = 10,
  schedule = '07:00–17:00',
  saturdays = NULL,
  vca_required = true,
  accommodation_included = false,
  transport_included = false,
  contract_type = NULL,
  period = 'Weeks 44–47 of 2026 (approx. 26 October – 22 November 2026)',
  summary = 'PIPINGBOX is looking for 2 experienced Pipefitters for an industrial project at BASF EUROCHEM in Belgium. From €25 gross/hour, 10 hours per day, VCA mandatory, project period weeks 44–47 of 2026. Accommodation and transport not included.',
  updated_at = now()
WHERE id = 'c15f2a9c-5f3d-4c98-b2b5-febf38ca6ee8';

INSERT INTO app_14da0f1941_job_translations
  (job_id, language, title, summary, description, requirements, source_language, source_content_hash, translation_status)
VALUES
  ('c5b70769-7189-4c1c-9329-cf6d26ed92a6', 'es', '5 Montadores de tuberías – INEOS Project One', 'PIPINGBOX busca 5 montadores de tuberías con experiencia para INEOS Project One en Bélgica. Contrato de trabajo belga, desde 25 € brutos/hora, 9 horas de trabajo al día, VCA obligatorio. Alojamiento y transporte no incluidos.', 'PIPINGBOX busca 5 montadores de tuberías con experiencia para INEOS Project One en Bélgica.

Condiciones:
• 5 posiciones disponibles
• Contrato de trabajo belga
• Salario: desde 25 € brutos/hora — la tarifa horaria final depende de la experiencia relevante en montaje de tuberías, la experiencia industrial/petroquímica, las cualificaciones y la antigüedad/experiencia previa con la empresa
• Jornada: 9 horas de trabajo al día
• Horario habitual: 07:00–17:00 (turno de día)
• Sábados: opcionales (no obligatorios)
• Certificado VCA: obligatorio
• Alojamiento: no incluido — los candidatos lo gestionan por su cuenta
• Transporte: no incluido — los candidatos lo gestionan por su cuenta hasta/desde el sitio de trabajo

Perfil del candidato: Buscamos montadores de tuberías industriales con experiencia demostrada en tuberías industriales y/o montaje mecánico. Se valora la experiencia en proyectos petroquímicos y de construcción industrial de gran envergadura.

Los candidatos deben:
• Tener experiencia relevante como montador de tuberías
• Estar en posesión de un certificado VCA válido
• Poder trabajar de forma segura e independiente
• Gestionar su propio alojamiento
• Gestionar su propio transporte

Los candidatos seleccionados trabajarán bajo un contrato de trabajo belga.

Los candidatos deben crear o completar su perfil profesional en PIPINGBOX antes de postularse, incluyendo experiencia en montaje de tuberías, proyectos industriales previos, disponibilidad, certificación VCA y otros certificados relevantes.', '• Experiencia relevante como montador de tuberías
• Certificado VCA válido (obligatorio)
• Capacidad de trabajar de forma segura e independiente
• Alojamiento gestionado por el propio candidato
• Transporte gestionado por el propio candidato hasta/desde el sitio de trabajo
• Perfil profesional completado en PIPINGBOX', 'en', 'd02e73a0', 'machine')
ON CONFLICT (job_id, language) DO UPDATE SET
  title = EXCLUDED.title, summary = EXCLUDED.summary, description = EXCLUDED.description,
  requirements = EXCLUDED.requirements, source_content_hash = EXCLUDED.source_content_hash,
  translation_status = EXCLUDED.translation_status, updated_at = now();

INSERT INTO app_14da0f1941_job_translations
  (job_id, language, title, summary, description, requirements, source_language, source_content_hash, translation_status)
VALUES
  ('c5b70769-7189-4c1c-9329-cf6d26ed92a6', 'nl', '5 Pijpfitters – INEOS Project One', 'PIPINGBOX zoekt 5 ervaren pijpfitters voor INEOS Project One in België. Belgisch arbeidscontract, vanaf €25 bruto/uur, 9 arbeidsuren per dag, VCA verplicht. Logies en vervoer niet inbegrepen.', 'PIPINGBOX zoekt 5 ervaren pijpfitters voor INEOS Project One in België.

Voorwaarden:
• 5 beschikbare posities
• Belgisch arbeidscontract
• Salaris: vanaf €25 bruto/uur — het uiteindelijke uurloon is afhankelijk van relevante pijpfitterervaring, industriële/petrochemische ervaring, kwalificaties en eerdere anciënniteit/ervaring bij het bedrijf
• Arbeidstijd: 9 arbeidsuren per dag
• Normaal schema: 07:00–17:00 (dagploeg)
• Zaterdagen: optioneel (niet verplicht)
• VCA-certificaat: verplicht
• Logies: niet inbegrepen — kandidaten regelen dit zelf
• Vervoer: niet inbegrepen — kandidaten regelen dit zelf naar/van de werf

Kandidaatprofiel: Wij zoeken ervaren industriële pijpfitters met aantoonbare ervaring in industriële leidingwerkzaamheden en/of mechanische installatie. Ervaring in petrochemische en grote industriële bouwprojecten heeft de voorkeur.

Kandidaten moeten:
• Relevante ervaring hebben als pijpfitter
• In het bezit zijn van een geldig VCA-certificaat
• Zelfstandig en veilig kunnen werken
• Hun eigen logies regelen
• Hun eigen vervoer regelen
• Geselecteerde kandidaten werken onder een Belgisch arbeidscontract.

Kandidaten dienen vóór hun sollicitatie hun professionele profiel op PIPINGBOX aan te maken of compleet te maken, inclusief pijpfitterervaring, eerdere industriële projecten, beschikbaarheid, VCA-certificering en andere relevante certificaten.', '• Relevante ervaring als pijpfitter
• Geldig VCA-certificaat (verplicht)
• Zelfstandig en veilig kunnen werken
• Eigen regeling van logies
• Eigen regeling van vervoer naar/van de werf
• Volledig professioneel profiel op PIPINGBOX', 'en', 'd02e73a0', 'machine')
ON CONFLICT (job_id, language) DO UPDATE SET
  title = EXCLUDED.title, summary = EXCLUDED.summary, description = EXCLUDED.description,
  requirements = EXCLUDED.requirements, source_content_hash = EXCLUDED.source_content_hash,
  translation_status = EXCLUDED.translation_status, updated_at = now();

INSERT INTO app_14da0f1941_job_translations
  (job_id, language, title, summary, description, requirements, source_language, source_content_hash, translation_status)
VALUES
  ('c5b70769-7189-4c1c-9329-cf6d26ed92a6', 'fr', '5 Tuyauteurs – INEOS Project One', 'PIPINGBOX recherche 5 tuyauteurs expérimentés pour INEOS Project One en Belgique. Contrat de travail belge, à partir de 25 € brut/heure, 9 heures de travail par jour, VCA obligatoire. Logement et transport non inclus.', 'PIPINGBOX recherche 5 tuyauteurs expérimentés pour INEOS Project One en Belgique.

Conditions :
• 5 postes disponibles
• Contrat de travail belge
• Salaire : à partir de 25 € brut/heure — le taux horaire final dépend de l''expérience pertinente en tuyauterie, de l''expérience industrielle/pétrochimique, des qualifications et de l''ancienneté/expérience précédente auprès de l''entreprise
• Temps de travail : 9 heures de travail par jour
• Horaire normal : 07:00–17:00 (équipe de jour)
• Samedis : optionnels (non obligatoires)
• Certificat VCA : obligatoire
• Logement : non inclus — les candidats l''organisent eux-mêmes
• Transport : non inclus — les candidats l''organisent eux-mêmes vers/depuis le site

Profil du candidat : Nous recherchons des tuyauteurs industriels expérimentés ayant une expérience avérée en tuyauterie industrielle et/ou en installation mécanique. Une expérience dans les projets pétrochimiques et les grands projets de construction industrielle est préférée.

Les candidats doivent :
• Avoir une expérience pertinente en tant que tuyauteur
• Être titulaire d''un certificat VCA valide
• Pouvoir travailler en toute sécurité et de manière autonome
• Organiser leur propre logement
• Organiser leur propre transport

Les candidats retenus travailleront sous contrat de travail belge.

Les candidats doivent créer ou compléter leur profil professionnel sur PIPINGBOX avant de postuler, incluant l''expérience en tuyauterie, les projets industriels précédents, la disponibilité, la certification VCA et autres certificats pertinents.', '• Expérience pertinente en tant que tuyauteur
• Certificat VCA valide (obligatoire)
• Capacité à travailler en toute sécurité et de manière autonome
• Logement organisé par le candidat
• Transport organisé par le candidat vers/depuis le site
• Profil professionnel complété sur PIPINGBOX', 'en', 'd02e73a0', 'machine')
ON CONFLICT (job_id, language) DO UPDATE SET
  title = EXCLUDED.title, summary = EXCLUDED.summary, description = EXCLUDED.description,
  requirements = EXCLUDED.requirements, source_content_hash = EXCLUDED.source_content_hash,
  translation_status = EXCLUDED.translation_status, updated_at = now();

INSERT INTO app_14da0f1941_job_translations
  (job_id, language, title, summary, description, requirements, source_language, source_content_hash, translation_status)
VALUES
  ('c5b70769-7189-4c1c-9329-cf6d26ed92a6', 'pt', '5 Montadores de tubagens – INEOS Project One', 'A PIPINGBOX procura 5 montadores de tubagens experientes para o INEOS Project One na Bélgica. Contrato de trabalho belga, a partir de 25 € brutos/hora, 9 horas de trabalho por dia, VCA obrigatório. Alojamento e transporte não incluídos.', 'A PIPINGBOX procura 5 montadores de tubagens experientes para o INEOS Project One na Bélgica.

Condições:
• 5 posições disponíveis
• Contrato de trabalho belga
• Salário: a partir de 25 € brutos/hora — a taxa horária final depende da experiência relevante em montagem de tubagens, da experiência industrial/petroquímica, das qualificações e da antiguidade/experiência anterior na empresa
• Tempo de trabalho: 9 horas de trabalho por dia
• Horário normal: 07:00–17:00 (turno diurno)
• Sábados: opcionais (não obrigatórios)
• Certificado VCA: obrigatório
• Alojamento: não incluído — os candidatos organizam-no por conta própria
• Transporte: não incluído — os candidatos organizam-no por conta própria até/departir do local de trabalho

Perfil do candidato: Procuramos montadores de tubagens industriais experientes com experiência comprovada em tubagens industriais e/ou instalação mecânica. É preferível experiência em projetos petroquímicos e de construção industrial de grande escala.

Os candidatos devem:
• Ter experiência relevante como montador de tubagens
• Possuir um certificado VCA válido
• Ser capazes de trabalhar de forma segura e independente
• Organizar o seu próprio alojamento
• Organizar o seu próprio transporte

Os candidatos selecionados trabalharão sob contrato de trabalho belga.

Os candidatos devem criar ou completar o seu perfil profissional na PIPINGBOX antes de candidatar-se, incluindo experiência em montagem de tubagens, projetos industriais anteriores, disponibilidade, certificação VCA e outros certificados relevantes.', '• Experiência relevante como montador de tubagens
• Certificado VCA válido (obrigatório)
• Capacidade de trabalhar de forma segura e independente
• Alojamento organizado pelo próprio candidato
• Transporte organizado pelo próprio candidato até/departir do local de trabalho
• Perfil profissional completo na PIPINGBOX', 'en', 'd02e73a0', 'machine')
ON CONFLICT (job_id, language) DO UPDATE SET
  title = EXCLUDED.title, summary = EXCLUDED.summary, description = EXCLUDED.description,
  requirements = EXCLUDED.requirements, source_content_hash = EXCLUDED.source_content_hash,
  translation_status = EXCLUDED.translation_status, updated_at = now();

INSERT INTO app_14da0f1941_job_translations
  (job_id, language, title, summary, description, requirements, source_language, source_content_hash, translation_status)
VALUES
  ('c15f2a9c-5f3d-4c98-b2b5-febf38ca6ee8', 'es', '2 Montadores de tuberías – BASF EUROCHEM', 'PIPINGBOX busca 2 montadores de tuberías con experiencia para un proyecto industrial en BASF EUROCHEM (Bélgica). Desde 25 € brutos/hora, 10 horas al día, VCA obligatorio, periodo del proyecto: semanas 44–47 de 2026. Alojamiento y transporte no incluidos.', 'PIPINGBOX busca 2 montadores de tuberías con experiencia para un proyecto industrial en BASF EUROCHEM en Bélgica.

Condiciones:
• 2 posiciones disponibles
• Salario: desde 25 € brutos/hora — la tarifa final depende de la experiencia y de la antigüedad/experiencia previa con la empresa
• Jornada: 10 horas
• Horario habitual: 07:00–17:00
• Periodo: semanas 44–47 de 2026 (aprox. 26 de octubre – 22 de noviembre de 2026)
• VCA: obligatorio
• Alojamiento: no incluido — los candidatos lo gestionan por su cuenta
• Transporte: no incluido — los candidatos lo gestionan por su cuenta hasta/desde el sitio de trabajo

Perfil del candidato: Buscamos montadores de tuberías industriales con experiencia demostrada en tuberías y/o montaje mecánico. Se valora la experiencia en entornos petroquímicos o industriales.

Los candidatos deben:
• Estar en posesión de un certificado VCA válido
• Tener experiencia relevante en montaje de tuberías
• Estar disponibles durante el periodo del proyecto
• Poder trabajar de forma segura e independiente
• Gestionar su propio alojamiento
• Gestionar su propio transporte

Los candidatos deben completar su perfil profesional en PIPINGBOX antes de postularse.', '• Experiencia relevante en montaje de tuberías
• Certificado VCA válido (obligatorio)
• Disponibilidad durante todo el periodo del proyecto (semanas 44–47 de 2026)
• Capacidad de trabajar de forma segura e independiente
• Alojamiento gestionado por el propio candidato
• Transporte gestionado por el propio candidato hasta/desde el sitio de trabajo
• Perfil profesional completado en PIPINGBOX', 'en', '317716e4', 'machine')
ON CONFLICT (job_id, language) DO UPDATE SET
  title = EXCLUDED.title, summary = EXCLUDED.summary, description = EXCLUDED.description,
  requirements = EXCLUDED.requirements, source_content_hash = EXCLUDED.source_content_hash,
  translation_status = EXCLUDED.translation_status, updated_at = now();

INSERT INTO app_14da0f1941_job_translations
  (job_id, language, title, summary, description, requirements, source_language, source_content_hash, translation_status)
VALUES
  ('c15f2a9c-5f3d-4c98-b2b5-febf38ca6ee8', 'nl', '2 Pijpfitters – BASF EUROCHEM', 'PIPINGBOX zoekt 2 ervaren pijpfitters voor een industrieel project bij BASF EUROCHEM in België. Vanaf €25 bruto/uur, 10 uur per dag, VCA verplicht, projectperiode weken 44–47 van 2026. Logies en vervoer niet inbegrepen.', 'PIPINGBOX zoekt 2 ervaren pijpfitters voor een industrieel project bij BASF EUROCHEM in België.

Voorwaarden:
• 2 beschikbare posities
• Salaris: vanaf €25 bruto/uur — het uiteindelijke tarief is afhankelijk van de ervaring en de eerdere anciënniteit/ervaring bij het bedrijf
• Werktijd: 10 uur
• Normaal schema: 07:00–17:00
• Periode: weken 44–47 van 2026 (ca. 26 oktober – 22 november 2026)
• VCA: verplicht
• Logies: niet inbegrepen — kandidaten regelen dit zelf
• Vervoer: niet inbegrepen — kandidaten regelen dit zelf naar/van de werf

Kandidaatprofiel: Wij zoeken ervaren industriële pijpfitters met aantoonbare ervaring in leidingwerk en/of mechanische installatie. Ervaring in petrochemische of industriële omgevingen heeft de voorkeur.

Kandidaten moeten:
• In het bezit zijn van een geldig VCA-certificaat
• Relevante pijpfitterervaring hebben
• Beschikbaar zijn tijdens de projectperiode
• Zelfstandig en veilig kunnen werken
• Hun eigen logies regelen
• Hun eigen vervoer regelen

Kandidaten dienen hun professionele profiel op PIPINGBOX te completeren voordat ze solliciteren.', '• Relevante pijpfitterervaring
• Geldig VCA-certificaat (verplicht)
• Beschikbaarheid gedurende de volledige projectperiode (weken 44–47 van 2026)
• Zelfstandig en veilig kunnen werken
• Eigen regeling van logies
• Eigen regeling van vervoer naar/van de werf
• Volledig professioneel profiel op PIPINGBOX', 'en', '317716e4', 'machine')
ON CONFLICT (job_id, language) DO UPDATE SET
  title = EXCLUDED.title, summary = EXCLUDED.summary, description = EXCLUDED.description,
  requirements = EXCLUDED.requirements, source_content_hash = EXCLUDED.source_content_hash,
  translation_status = EXCLUDED.translation_status, updated_at = now();

INSERT INTO app_14da0f1941_job_translations
  (job_id, language, title, summary, description, requirements, source_language, source_content_hash, translation_status)
VALUES
  ('c15f2a9c-5f3d-4c98-b2b5-febf38ca6ee8', 'fr', '2 Tuyauteurs – BASF EUROCHEM', 'PIPINGBOX recherche 2 tuyauteurs expérimentés pour un projet industriel chez BASF EUROCHEM en Belgique. À partir de 25 € brut/heure, 10 heures par jour, VCA obligatoire, période du projet : semaines 44 à 47 de 2026. Logement et transport non inclus.', 'PIPINGBOX recherche 2 tuyauteurs expérimentés pour un projet industriel chez BASF EUROCHEM en Belgique.

Conditions :
• 2 postes disponibles
• Salaire : à partir de 25 € brut/heure — le taux final dépend de l''expérience et de l''ancienneté/expérience précédente auprès de l''entreprise
• Journée de travail : 10 heures
• Horaire normal : 07:00–17:00
• Période : semaines 44 à 47 de 2026 (env. 26 octobre – 22 novembre 2026)
• VCA : obligatoire
• Logement : non inclus — les candidats l''organisent eux-mêmes
• Transport : non inclus — les candidats l''organisent eux-mêmes vers/depuis le site

Profil du candidat : Nous recherchons des tuyauteurs industriels expérimentés ayant une expérience avérée en tuyauterie et/ou en installation mécanique. Une expérience en environnements pétrochimiques ou industriels est préférée.

Les candidats doivent :
• Être titulaires d''un certificat VCA valide
• Avoir une expérience pertinente en tuyauterie
• Être disponibles pendant la période du projet
• Pouvoir travailler en toute sécurité et de manière autonome
• Organiser leur propre logement
• Organiser leur propre transport

Les candidats doivent compléter leur profil professionnel PIPINGBOX avant de postuler.', '• Expérience pertinente en tuyauterie
• Certificat VCA valide (obligatoire)
• Disponibilité pendant toute la période du projet (semaines 44 à 47 de 2026)
• Capacité à travailler en toute sécurité et de manière autonome
• Logement organisé par le candidat
• Transport organisé par le candidat vers/depuis le site
• Profil professionnel complété sur PIPINGBOX', 'en', '317716e4', 'machine')
ON CONFLICT (job_id, language) DO UPDATE SET
  title = EXCLUDED.title, summary = EXCLUDED.summary, description = EXCLUDED.description,
  requirements = EXCLUDED.requirements, source_content_hash = EXCLUDED.source_content_hash,
  translation_status = EXCLUDED.translation_status, updated_at = now();

INSERT INTO app_14da0f1941_job_translations
  (job_id, language, title, summary, description, requirements, source_language, source_content_hash, translation_status)
VALUES
  ('c15f2a9c-5f3d-4c98-b2b5-febf38ca6ee8', 'pt', '2 Montadores de tubagens – BASF EUROCHEM', 'A PIPINGBOX procura 2 montadores de tubagens experientes para um projeto industrial na BASF EUROCHEM (Bélgica). A partir de 25 € brutos/hora, 10 horas por dia, VCA obrigatório, período do projeto: semanas 44–47 de 2026. Alojamento e transporte não incluídos.', 'A PIPINGBOX procura 2 montadores de tubagens experientes para um projeto industrial na BASF EUROCHEM na Bélgica.

Condições:
• 2 posições disponíveis
• Salário: a partir de 25 € brutos/hora — a taxa final depende da experiência e da antiguidade/experiência anterior na empresa
• Jornada de trabalho: 10 horas
• Horário normal: 07:00–17:00
• Período: semanas 44–47 de 2026 (aprox. 26 de outubro – 22 de novembro de 2026)
• VCA: obrigatório
• Alojamento: não incluído — os candidatos organizam-no por conta própria
• Transporte: não incluído — os candidatos organizam-no por conta própria até/departir do local de trabalho

Perfil do candidato: Procuramos montadores de tubagens industriais experientes com experiência comprovada em tubagens e/ou instalação mecânica. É preferível experiência em ambientes petroquímicos ou industriais.

Os candidatos devem:
• Possuir um certificado VCA válido
• Ter experiência relevante em montagem de tubagens
• Estar disponíveis durante o período do projeto
• Ser capazes de trabalhar de forma segura e independente
• Organizar o seu próprio alojamento
• Organizar o seu próprio transporte

Os candidatos devem completar o seu perfil profissional na PIPINGBOX antes de candidatar-se.', '• Experiência relevante em montagem de tubagens
• Certificado VCA válido (obrigatório)
• Disponibilidade durante todo o período do projeto (semanas 44–47 de 2026)
• Capacidade de trabalhar de forma segura e independente
• Alojamento organizado pelo próprio candidato
• Transporte organizado pelo próprio candidato até/departir do local de trabalho
• Perfil profissional completo na PIPINGBOX', 'en', '317716e4', 'machine')
ON CONFLICT (job_id, language) DO UPDATE SET
  title = EXCLUDED.title, summary = EXCLUDED.summary, description = EXCLUDED.description,
  requirements = EXCLUDED.requirements, source_content_hash = EXCLUDED.source_content_hash,
  translation_status = EXCLUDED.translation_status, updated_at = now();

-- Verification
SELECT id, title, source_language, vacancies, salary_min, salary_period, hours_per_day, saturdays, vca_required, accommodation_included, transport_included, contract_type, period FROM app_14da0f1941_jobs WHERE id IN ('c5b70769-7189-4c1c-9329-cf6d26ed92a6', 'c15f2a9c-5f3d-4c98-b2b5-febf38ca6ee8');
SELECT job_id, language, translation_status, source_content_hash FROM app_14da0f1941_job_translations ORDER BY job_id, language;
