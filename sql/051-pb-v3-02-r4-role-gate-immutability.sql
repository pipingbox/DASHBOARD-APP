-- ══════════════════════════════════════════════════════════════════════════════
-- PR-V3-02 RONDA 4 (PO review 18/10/2026) — Correcciones P1:
-- cierre real de roles, bloqueo fail-closed de contratos no aprobados,
-- inmutabilidad contractual y resincronización post-aceptación.
--
-- Contenido:
--   0. pgcrypto ANTES de cualquier uso de digest() (en sql/050 la extensión
--      se aseguraba DESPUÉS del seed; en una base fresca sin pgcrypto eso
--      rompe el orden de dependencias).
--   1. Política canónica de cuenta profesional: la aceptación v3 y el
--      endpoint de requisitos exigen SIMULTÁNEAMENTE account_type='worker'
--      Y role='worker'. Las cuentas híbridas históricas (role=company /
--      account_type=worker, role=admin / account_type=worker) quedan
--      bloqueadas con el outcome 'account_type_not_allowed', SIN modificar
--      esas cuentas. role='user' (sin selección de rol completada) tampoco
--      es un rol profesional válido: el alta canónica (OnboardingGate) fija
--      role='worker' y entonces la aceptación queda disponible.
--   2. Gate jurídico fail-closed (pb_v3_acceptance_gate + tabla
--      pb_marketplace_v3_release_config):
--        - acceptance_mode='off' (DEFAULT, producción): NADIE acepta, nadie
--          se promociona, ningún EMAIL 2. Un texto DRAFT no genera
--          consentimientos efectivos, promociones, candidaturas activadas
--          ni EMAIL 2.
--        - acceptance_mode='qa_fixtures' (SOLO QA): aceptación/promoción
--          permitida únicamente a identidades sintéticas cuyo email termina
--          en el dominio configurado (qa_fixture_email_domain), y solo
--          mientras el texto NO esté comercialmente activo. Si el texto se
--          activa (live), el modo qa_fixtures deja de abrir aunque la
--          config se copiara accidentalmente a producción; y en producción
--          ningún usuario real tiene email del dominio de fixtures.
--        - acceptance_mode='live': exige el texto con ciclo de vida
--          completo (status='active' en TODOS los idiomas de la versión).
--      La gate se aplica a consentimientos NUEVOS y también a las
--      re-sincronizaciones/promociones (already_accepted y auto-resync del
--      trigger): un DRAFT no promueve aunque el consentimiento exista.
--   3. Ciclo de vida del texto separado en 4 estados verificables
--      (existencia → aprobación jurídica → autorización comercial PO →
--      activación técnica) vía pb_marketplace_contract_text_set_status
--      (service_role), con orden forzado draft → legal_approved →
--      commercially_authorized → active y retired desde cualquier estado.
--   4. Inmutabilidad contractual: PK (text_version, lang); trigger absoluto
--      que PROHÍBE DELETE y cualquier UPDATE de contract_version / lang /
--      text_version / body_md / canonical_hash (sin excepción de rol: una
--      revisión crea un text_version NUEVO y retira el anterior). El hash
--      se RECALCULA del body en INSERT (imposible hash/body divergente).
--      El seed es ON CONFLICT DO NOTHING + verificación con RAISE si el
--      texto almacenado difiere del esperado (detecta sustitución
--      silenciosa en vez de aplicarla). is_legal_final queda sustituido
--      por el ciclo de vida `status`. Política de lectura idempotente
--      (DROP IF EXISTS + CREATE). Eventos de consentimiento con hash
--      COMPLETO, idioma y tipo de acto (accept/withdraw).
--   5. Resincronización post-aceptación: trigger AFTER UPDATE sobre
--      cv_storage_path / cv_storage_bucket / title / location /
--      availability_status que, para perfiles v3 consentidos no ready,
--      ejecuta el sync canónico (despacho por versión de sql/047/049) SI
--      la gate está abierta. Sin recursión (el sync no toca esas columnas
--      y ready=true corta la condición). EMAIL 2 solo por transición real
--      false→true vía outbox sql/034 (en QA queda pending/capture).
--   6. Retirada del consentimiento (pb_withdraw_marketplace_contract_v3):
--      acto del propio usuario (auth.uid()), append-only (event_type=
--      'withdraw' con la evidencia de la versión consentida), limpia las
--      columnas de consentimiento por vía canónica y, si el perfil estaba
--      ready por v3, lo degrada con auditoría en reconcile_log
--      (class='consent_withdrawn_v3_demoted'). Las candidaturas ya
--      aplicadas NO se tocan (la retirada no afecta a presentaciones ya
--      realizadas); las pending_profile_validation se conservan. La
--      re-aceptación posterior es posible (nuevo acto, nuevo evento).
--
-- Compatibilidad v1/v2: intacta. El despacho por versión no cambia; los
-- eventos históricos conservan su fila (nuevas columnas NULL). El trigger
-- de auto-resync SOLO actúa sobre contract_version=3: el comportamiento
-- v2 (PR #84) queda exactamente como estaba.
--
-- IDEMPOTENT: SÍ (drop+create de constraints/políticas, create or replace,
-- ON CONFLICT DO NOTHING, triggers DROP IF EXISTS + CREATE).
-- STATUS: QA primero; producción solo con GO expreso del PO.
-- ══════════════════════════════════════════════════════════════════════════════

-- ─────────────────────────────────────────────────────────────────────────────
-- 0. Dependencias: pgcrypto ANTES de digest()
-- ─────────────────────────────────────────────────────────────────────────────
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. Política canónica de cuenta profesional (cuenta Y rol)
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.pb_v3_is_professional_account(
  p_account_type text,
  p_role         text
)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $$
  -- Profesional válido = cuenta worker Y rol worker. Híbridos históricos
  -- (role=company/admin con account_type=worker) y role='user' (sin
  -- selección de rol) NO son cuentas profesionales válidas para el
  -- contrato de candidato. No se modifican las cuentas: solo se bloquea
  -- el acto.
  SELECT p_account_type = 'worker' AND p_role = 'worker';
$$;

REVOKE ALL ON FUNCTION public.pb_v3_is_professional_account(text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.pb_v3_is_professional_account(text, text) TO service_role;

COMMENT ON FUNCTION public.pb_v3_is_professional_account(text, text) IS
  'PR-V3-02 ronda 4: política canónica de cuenta profesional para el contrato v3: exige account_type=worker Y role=worker simultáneamente.';

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. Config de release (gate jurídico/comercial/técnico)
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.pb_marketplace_v3_release_config (
  key         text PRIMARY KEY,
  value       text NOT NULL,
  updated_at  timestamptz NOT NULL DEFAULT now(),
  updated_by  text NOT NULL DEFAULT current_user
);

COMMENT ON TABLE public.pb_marketplace_v3_release_config IS
  'PR-V3-02 ronda 4: configuración de release del contrato v3. acceptance_mode: off (default, producción) | qa_fixtures (solo QA con dominio de fixtures) | live (requiere texto active). Escritura solo service_role/migración; sin acceso de cliente.';

ALTER TABLE public.pb_marketplace_v3_release_config ENABLE ROW LEVEL SECURITY;
-- Sin políticas: ningún rol API lee ni escribe; service_role bypass RLS.

REVOKE ALL ON public.pb_marketplace_v3_release_config FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE ON public.pb_marketplace_v3_release_config TO service_role;

-- Default fail-closed. ON CONFLICT DO NOTHING: una re-ejecución de la
-- migración NUNCA pisa una decisión operativa posterior.
INSERT INTO public.pb_marketplace_v3_release_config (key, value)
VALUES ('acceptance_mode', 'off')
ON CONFLICT (key) DO NOTHING;

-- qa_fixture_email_domain NO se siembra en la migración: solo se crea
-- manualmente en QA vía service_role. Producción nunca lo recibe por defecto.

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. Textos contractuales: versionado inmutable + ciclo de vida
-- ─────────────────────────────────────────────────────────────────────────────

-- 3a. PK por versión de texto (una revisión = text_version NUEVO).
ALTER TABLE public.pb_marketplace_contract_texts
  DROP CONSTRAINT IF EXISTS pb_marketplace_contract_texts_pkey;
ALTER TABLE public.pb_marketplace_contract_texts
  DROP CONSTRAINT IF EXISTS pb_contract_texts_version_lang_pk;
ALTER TABLE public.pb_marketplace_contract_texts
  ADD CONSTRAINT pb_contract_texts_version_lang_pk PRIMARY KEY (text_version, lang);

-- 3b. Ciclo de vida separado: existencia → aprobación jurídica →
--     autorización comercial → activación técnica (+ retirada).
ALTER TABLE public.pb_marketplace_contract_texts
  ADD COLUMN IF NOT EXISTS status                     text,
  ADD COLUMN IF NOT EXISTS legal_approved_at          timestamptz,
  ADD COLUMN IF NOT EXISTS legal_approved_by          text,
  ADD COLUMN IF NOT EXISTS commercial_authorized_at   timestamptz,
  ADD COLUMN IF NOT EXISTS commercial_authorized_by   text,
  ADD COLUMN IF NOT EXISTS activated_at               timestamptz,
  ADD COLUMN IF NOT EXISTS activated_by               text,
  ADD COLUMN IF NOT EXISTS retired_at                 timestamptz,
  ADD COLUMN IF NOT EXISTS retired_by                 text,
  ADD COLUMN IF NOT EXISTS supersedes_version         text;

UPDATE public.pb_marketplace_contract_texts SET status = 'draft' WHERE status IS NULL;
ALTER TABLE public.pb_marketplace_contract_texts ALTER COLUMN status SET NOT NULL;
ALTER TABLE public.pb_marketplace_contract_texts ALTER COLUMN status SET DEFAULT 'draft';
ALTER TABLE public.pb_marketplace_contract_texts
  DROP CONSTRAINT IF EXISTS pb_contract_texts_status_check;
ALTER TABLE public.pb_marketplace_contract_texts
  ADD CONSTRAINT pb_contract_texts_status_check
  CHECK (status IN ('draft', 'legal_approved', 'commercially_authorized', 'active', 'retired'));

-- is_legal_final queda sustituido por el ciclo de vida (dos fuentes de
-- verdad serían peor). sql/050 aún no existe en producción: seguro.
ALTER TABLE public.pb_marketplace_contract_texts DROP COLUMN IF EXISTS is_legal_final;

-- 3c. Trigger de inmutabilidad ABSOLUTO (sin bypass de rol).
CREATE OR REPLACE FUNCTION public.pb_contract_texts_immutable()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, extensions
AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'pb_marketplace_contract_texts es append-only: DELETE prohibido. Una corrección crea un text_version nuevo y retira el anterior.';
  END IF;
  IF TG_OP = 'INSERT' THEN
    -- El hash SIEMPRE se deriva del body: imposible registrar un hash que
    -- no corresponda al texto preservado.
    NEW.canonical_hash := encode(digest(NEW.body_md, 'sha256'), 'hex');
    RETURN NEW;
  END IF;
  -- UPDATE: solo ciclo de vida (status + sellos + supersedes). El texto,
  -- la versión, el idioma y el hash son inmutables.
  IF NEW.contract_version IS DISTINCT FROM OLD.contract_version
     OR NEW.lang            IS DISTINCT FROM OLD.lang
     OR NEW.text_version    IS DISTINCT FROM OLD.text_version
     OR NEW.body_md         IS DISTINCT FROM OLD.body_md
     OR NEW.canonical_hash  IS DISTINCT FROM OLD.canonical_hash THEN
    RAISE EXCEPTION 'Texto contractual inmutable: una revisión exige un text_version NUEVO (body/hash/version/idioma no se pueden sobrescribir).';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS pb_contract_texts_immutable ON public.pb_marketplace_contract_texts;
CREATE TRIGGER pb_contract_texts_immutable
  BEFORE INSERT OR UPDATE OR DELETE ON public.pb_marketplace_contract_texts
  FOR EACH ROW EXECUTE FUNCTION public.pb_contract_texts_immutable();

-- 3d. Permisos: lectura del propio texto para autenticados (transparencia
--     del acto); escritura solo backend; DELETE prohibido para todos.
REVOKE ALL ON public.pb_marketplace_contract_texts FROM PUBLIC, anon;
GRANT SELECT ON public.pb_marketplace_contract_texts TO authenticated;
GRANT SELECT, INSERT, UPDATE ON public.pb_marketplace_contract_texts TO service_role;
REVOKE DELETE ON public.pb_marketplace_contract_texts FROM service_role;

-- Política de lectura IDEMPOTENTE (sql/050 fallaba al re-ejecutarse).
DROP POLICY IF EXISTS pb_contract_texts_read ON public.pb_marketplace_contract_texts;
CREATE POLICY pb_contract_texts_read ON public.pb_marketplace_contract_texts
  FOR SELECT TO authenticated USING (true);

-- 3e. Seed idempotente SIN sobrescritura + verificación anti-sustitución.
CREATE TEMP TABLE IF NOT EXISTS pb_tmp_contract_seed (lang text, body text);
TRUNCATE pb_tmp_contract_seed;
INSERT INTO pb_tmp_contract_seed VALUES
  ('es', '# Condiciones del Marketplace PIPINGBOX (v3 — BORRADOR)

Al aceptar estas condiciones:

1. Autorizas a PIPINGBOX a presentar tu perfil profesional (oficio, experiencia, habilidades, formación declarada, disponibilidad y región) a empresas verificadas de la plataforma.
2. Tu CV original y tus datos de contacto (teléfono, email, WhatsApp, dirección) NO se muestran a las empresas en la fase protegida. Solo se comparten cuando tú lo autorizas expresamente en una presentación concreta.
3. Los certificados son opcionales para participar en el Marketplace; pueden mejorar la relevancia de tu perfil, pero no bloquean tu acceso.
4. Puedes retirar tu consentimiento en cualquier momento desde tu perfil; la retirada no afecta a presentaciones ya realizadas.
5. Estas condiciones son un BORRADOR en revisión jurídica. No constituyen condiciones comerciales definitivas ni se activan comercialmente hasta su aprobación.

Versión del texto: v3-2026-10-17.'),
  ('en', '# PIPINGBOX Marketplace Terms (v3 — DRAFT)

By accepting these terms:

1. You authorize PIPINGBOX to present your professional profile (trade, experience, skills, declared training, availability and region) to verified companies on the platform.
2. Your original CV and contact details (phone, email, WhatsApp, address) are NOT shown to companies in the protected phase. They are only shared when you expressly authorize it for a specific presentation.
3. Certificates are optional to join the Marketplace; they may improve your profile relevance but do not block your access.
4. You may withdraw your consent at any time from your profile; withdrawal does not affect presentations already made.
5. These terms are a DRAFT under legal review. They are not final commercial terms and are not commercially activated until approved.

Text version: v3-2026-10-17.'),
  ('de', '# PIPINGBOX Marketplace-Bedingungen (v3 — ENTWURF)

Mit der Annahme dieser Bedingungen:

1. Autorisieren Sie PIPINGBOX, Ihr Berufsprofil (Beruf, Erfahrung, Fähigkeiten, angegebene Ausbildung, Verfügbarkeit und Region) verifizierten Unternehmen der Plattform zu präsentieren.
2. Ihr ursprünglicher Lebenslauf und Ihre Kontaktdaten (Telefon, E-Mail, WhatsApp, Adresse) werden Unternehmen in der geschützten Phase NICHT angezeigt. Sie werden nur geteilt, wenn Sie dies für eine konkrete Präsentation ausdrücklich genehmigen.
3. Zertifikate sind für die Teilnahme am Marketplace optional; sie können die Relevanz Ihres Profils verbessern, blockieren aber nicht Ihren Zugang.
4. Sie können Ihre Zustimmung jederzeit in Ihrem Profil widerrufen; der Widerruf berührt keine bereits erfolgten Präsentationen.
5. Diese Bedingungen sind ein ENTWURF in rechtlicher Prüfung. Sie sind keine endgültigen Handelsbedingungen und werden bis zur Genehmigung nicht kommerziell aktiviert.

Textversion: v3-2026-10-17.'),
  ('fr', '# Conditions du Marketplace PIPINGBOX (v3 — BROUILLON)

En acceptant ces conditions :

1. Vous autorisez PIPINGBOX à présenter votre profil professionnel (métier, expérience, compétences, formation déclarée, disponibilité et région) à des entreprises vérifiées de la plateforme.
2. Votre CV original et vos coordonnées (téléphone, email, WhatsApp, adresse) ne sont PAS montrés aux entreprises en phase protégée. Ils ne sont partagés que lorsque vous l''autorisez expressément pour une présentation concrète.
3. Les certificats sont facultatifs pour participer au Marketplace ; ils peuvent améliorer la pertinence de votre profil mais ne bloquent pas votre accès.
4. Vous pouvez retirer votre consentement à tout moment depuis votre profil ; le retrait n''affecte pas les présentations déjà réalisées.
5. Ces conditions sont un BROUILLON en cours de révision juridique. Elles ne constituent pas des conditions commerciales définitives et ne sont pas activées commercialement avant approbation.

Version du texte : v3-2026-10-17.'),
  ('it', '# Condizioni del Marketplace PIPINGBOX (v3 — BOZZA)

Accettando queste condizioni:

1. Autorizzi PIPINGBOX a presentare il tuo profilo professionale (mestiere, esperienza, competenze, formazione dichiarata, disponibilità e regione) ad aziende verificate della piattaforma.
2. Il tuo CV originale e i tuoi dati di contatto (telefono, email, WhatsApp, indirizzo) NON vengono mostrati alle aziende nella fase protetta. Vengono condivisi solo quando lo autorizzi espressamente per una presentazione specifica.
3. I certificati sono facoltativi per partecipare al Marketplace; possono migliorare la rilevanza del tuo profilo ma non bloccano l''accesso.
4. Puoi revocare il consenso in qualsiasi momento dal tuo profilo; la revoca non pregiudica le presentazioni già effettuate.
5. Queste condizioni sono una BOZZA in revisione legale. Non costituiscono condizioni commerciali definitive e non vengono attivate commercialmente fino all''approvazione.

Versione del testo: v3-2026-10-17.'),
  ('nl', '# PIPINGBOX Marketplace-voorwaarden (v3 — ONTWERP)

Door deze voorwaarden te accepteren:

1. Machtigt u PIPINGBOX om uw professionele profiel (beroep, ervaring, vaardigheden, opgegeven opleiding, beschikbaarheid en regio) te presenteren aan geverifieerde bedrijven op het platform.
2. Uw originele CV en contactgegevens (telefoon, e-mail, WhatsApp, adres) worden in de beschermde fase NIET aan bedrijven getoond. Ze worden alleen gedeeld wanneer u dit uitdrukkelijk toestaat voor een specifieke presentatie.
3. Certificaten zijn optioneel om deel te nemen aan de Marketplace; ze kunnen de relevantie van uw profiel verbeteren maar blokkeren uw toegang niet.
4. U kunt uw toestemming op elk moment intrekken via uw profiel; intrekking heeft geen invloed op reeds gedane presentaties.
5. Deze voorwaarden zijn een ONTWERP in juridische beoordeling. Het zijn geen definitieve handelsvoorwaarden en worden pas na goedkeuring commercieel geactiveerd.

Tekstversie: v3-2026-10-17.'),
  ('pl', '# Warunki Marketplace PIPINGBOX (v3 — PROJEKT)

Akceptując te warunki:

1. Upoważniasz PIPINGBOX do prezentowania Twojego profilu zawodowego (zawód, doświadczenie, umiejętności, zadeklarowane wykształcenie, dostępność i region) zweryfikowanym firmom na platformie.
2. Twoje oryginalne CV i dane kontaktowe (telefon, e-mail, WhatsApp, adres) NIE są pokazywane firmom w fazie chronionej. Są udostępniane tylko wtedy, gdy wyraźnie na to zezwolisz w konkretnej prezentacji.
3. Certyfikaty są opcjonalne, aby uczestniczyć w Marketplace; mogą poprawić trafność Twojego profilu, ale nie blokują dostępu.
4. Możesz wycofać zgodę w dowolnym momencie w swoim profilu; wycofanie nie wpływa na już dokonane prezentacje.
5. Niniejsze warunki są PROJEKTEM w trakcie przeglądu prawnego. Nie stanowią ostatecznych warunków handlowych i nie są aktywowane komercyjnie do czasu zatwierdzenia.

Wersja tekstu: v3-2026-10-17.'),
  ('pt', '# Condições do Marketplace PIPINGBOX (v3 — RASCUNHO)

Ao aceitar estas condições:

1. Autoriza a PIPINGBOX a apresentar o seu perfil profissional (ofício, experiência, competências, formação declarada, disponibilidade e região) a empresas verificadas da plataforma.
2. O seu CV original e os seus dados de contacto (telefone, email, WhatsApp, morada) NÃO são mostrados às empresas na fase protegida. Só são partilhados quando o autoriza expressamente para uma apresentação concreta.
3. Os certificados são opcionais para participar no Marketplace; podem melhorar a relevância do seu perfil mas não bloqueiam o seu acesso.
4. Pode retirar o seu consentimento a qualquer momento no seu perfil; a retirada não afeta apresentações já realizadas.
5. Estas condições são um RASCUNHO em revisão jurídica. Não constituem condições comerciais definitivas e não são ativadas comercialmente até aprovação.

Versão do texto: v3-2026-10-17.'),
  ('ro', '# Condițiile Marketplace PIPINGBOX (v3 — PROIECT)

Prin acceptarea acestor condiții:

1. Autorizezi PIPINGBOX să prezinte profilul tău profesional (meserie, experiență, competențe, formare declarată, disponibilitate și regiune) companiilor verificate de pe platformă.
2. CV-ul tău original și datele tale de contact (telefon, email, WhatsApp, adresă) NU sunt afișate companiilor în faza protejată. Sunt partajate doar atunci când autorizezi expres acest lucru pentru o prezentare concretă.
3. Certificatele sunt opționale pentru a participa la Marketplace; pot îmbunătăți relevanța profilului tău, dar nu îți blochează accesul.
4. Îți poți retrage consimțământul oricând din profilul tău; retragerea nu afectează prezentările deja efectuate.
5. Aceste condiții sunt un PROIECT în curs de revizuire juridică. Nu constituie condiții comerciale definitive și nu sunt activate comercial până la aprobare.

Versiunea textului: v3-2026-10-17.'),
  ('bg', '# Условия на Marketplace PIPINGBOX (v3 — ПРОЕКТ)

С приемането на тези условия:

1. Упълномощавате PIPINGBOX да представя вашия професионален профил (професия, опит, умения, декларирано обучение, наличност и регион) на проверени компании в платформата.
2. Вашето оригинално CV и данни за контакт (телефон, имейл, WhatsApp, адрес) НЕ се показват на компаниите в защитената фаза. Споделят се само когато изрично го разрешите за конкретна презентация.
3. Сертификатите са по желание за участие в Marketplace; могат да подобрят релевантността на профила ви, но не блокират достъпа ви.
4. Можете да оттеглите съгласието си по всяко време от профила си; оттеглянето не засяга вече направени презентации.
5. Тези условия са ПРОЕКТ в правна проверка. Не представляват окончателни търговски условия и не се активират търговски до одобрение.

Версия на текста: v3-2026-10-17.'),
  ('uk', '# Умови Marketplace PIPINGBOX (v3 — ПРОЕКТ)

Приймаючи ці умови:

1. Ви уповноважуєте PIPINGBOX представляти ваш професійний профіль (професія, досвід, навички, заявлена освіта, доступність і регіон) перевіреним компаніям на платформі.
2. Ваше оригінальне CV та контактні дані (телефон, email, WhatsApp, адреса) НЕ показуються компаніям у захищеній фазі. Вони надаються лише тоді, коли ви прямо дозволяєте це для конкретної презентації.
3. Сертифікати є необов''язковими для участі в Marketplace; вони можуть покращити релевантність вашого профілю, але не блокують доступ.
4. Ви можете відкликати свою згоду будь-коли у своєму профілі; відкликання не впливає на вже здійснені презентації.
5. Ці умови є ПРОЕКТОМ на юридичній перевірці. Вони не є остаточними комерційними умовами і не активуються комерційно до затвердження.

Версія тексту: v3-2026-10-17.');

INSERT INTO public.pb_marketplace_contract_texts
  (contract_version, lang, text_version, body_md, canonical_hash, status)
SELECT 3, s.lang, 'v3-2026-10-17', s.body, encode(digest(s.body, 'sha256'), 'hex'), 'draft'
FROM pb_tmp_contract_seed s
ON CONFLICT (text_version, lang) DO NOTHING;

-- Verificación anti-sustitución: si la fila preservada difiere del texto
-- esperado, la migración FALLA en vez de sobrescribir silenciosamente.
DO $$
DECLARE
  v_bad text;
BEGIN
  SELECT s.lang INTO v_bad
  FROM pb_tmp_contract_seed s
  JOIN public.pb_marketplace_contract_texts t
    ON t.text_version = 'v3-2026-10-17' AND t.lang = s.lang
  WHERE t.body_md IS DISTINCT FROM s.body
  LIMIT 1;
  IF v_bad IS NOT NULL THEN
    RAISE EXCEPTION 'Contrato v3 (%): el texto preservado difiere del esperado. Las revisiones exigen un text_version NUEVO; no se sobrescribe el existente.', v_bad;
  END IF;
END $$;

DROP TABLE pb_tmp_contract_seed;

-- 3f. Transiciones de ciclo de vida con orden forzado (service_role).
CREATE OR REPLACE FUNCTION public.pb_marketplace_contract_text_set_status(
  p_text_version text,
  p_new_status   text,
  p_actor        text
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_current  text;
  v_rank_old int;
  v_rank_new int;
  v_rows     integer;
BEGIN
  IF p_actor IS NULL OR btrim(p_actor) = '' THEN
    RAISE EXCEPTION 'actor requerido (sello de la transición)';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.pb_marketplace_contract_texts
    WHERE contract_version = 3 AND text_version = p_text_version
  ) THEN
    RAISE EXCEPTION 'text_version % no existe', p_text_version;
  END IF;
  IF (SELECT count(DISTINCT status) FROM public.pb_marketplace_contract_texts
      WHERE contract_version = 3 AND text_version = p_text_version) > 1 THEN
    RAISE EXCEPTION 'text_version % con estados divergentes por idioma: corregir antes de transicionar', p_text_version;
  END IF;
  SELECT DISTINCT status INTO v_current FROM public.pb_marketplace_contract_texts
  WHERE contract_version = 3 AND text_version = p_text_version;

  v_rank_old := CASE v_current
    WHEN 'draft' THEN 0 WHEN 'legal_approved' THEN 1
    WHEN 'commercially_authorized' THEN 2 WHEN 'active' THEN 3
    WHEN 'retired' THEN 99 END;
  v_rank_new := CASE p_new_status
    WHEN 'legal_approved' THEN 1
    WHEN 'commercially_authorized' THEN 2
    WHEN 'active' THEN 3
    WHEN 'retired' THEN 99 END;

  IF v_rank_new IS NULL THEN
    RAISE EXCEPTION 'status destino inválido: % (válidos: legal_approved, commercially_authorized, active, retired)', p_new_status;
  END IF;
  IF v_current = 'retired' THEN
    RAISE EXCEPTION 'text_version % está retired: no admite más transiciones', p_text_version;
  END IF;
  IF p_new_status <> 'retired' AND v_rank_new <> v_rank_old + 1 THEN
    RAISE EXCEPTION 'orden de ciclo de vida: % → % no permitido (draft → legal_approved → commercially_authorized → active)', v_current, p_new_status;
  END IF;

  UPDATE public.pb_marketplace_contract_texts
     SET status = p_new_status,
         legal_approved_at        = CASE WHEN p_new_status = 'legal_approved' THEN now() ELSE legal_approved_at END,
         legal_approved_by        = CASE WHEN p_new_status = 'legal_approved' THEN p_actor ELSE legal_approved_by END,
         commercial_authorized_at = CASE WHEN p_new_status = 'commercially_authorized' THEN now() ELSE commercial_authorized_at END,
         commercial_authorized_by = CASE WHEN p_new_status = 'commercially_authorized' THEN p_actor ELSE commercial_authorized_by END,
         activated_at             = CASE WHEN p_new_status = 'active' THEN now() ELSE activated_at END,
         activated_by             = CASE WHEN p_new_status = 'active' THEN p_actor ELSE activated_by END,
         retired_at               = CASE WHEN p_new_status = 'retired' THEN now() ELSE retired_at END,
         retired_by               = CASE WHEN p_new_status = 'retired' THEN p_actor ELSE retired_by END
   WHERE contract_version = 3 AND text_version = p_text_version;
  GET DIAGNOSTICS v_rows = ROW_COUNT;
  RETURN v_rows;
END;
$$;

REVOKE ALL ON FUNCTION public.pb_marketplace_contract_text_set_status(text, text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.pb_marketplace_contract_text_set_status(text, text, text) TO service_role;

COMMENT ON FUNCTION public.pb_marketplace_contract_text_set_status(text, text, text) IS
  'PR-V3-02 ronda 4: transiciones de ciclo de vida del texto v3 con orden forzado (draft → legal_approved → commercially_authorized → active; retired terminal). Sellos at/by por transición. service_role solamente.';

-- ─────────────────────────────────────────────────────────────────────────────
-- 4. Gate fail-closed de aceptación/promoción
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.pb_v3_acceptance_gate(
  p_user_id      uuid,
  p_text_version text
)
RETURNS text  -- 'open_live' | 'open_qa_fixture' | 'closed'
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_mode       text;
  v_domain     text;
  v_email      text;
  v_all_active boolean;
BEGIN
  SELECT c.value INTO v_mode
  FROM public.pb_marketplace_v3_release_config c
  WHERE c.key = 'acceptance_mode';
  v_mode := coalesce(v_mode, 'off');  -- ausencia de config = cerrado

  SELECT coalesce(bool_and(t.status = 'active'), FALSE) INTO v_all_active
  FROM public.pb_marketplace_contract_texts t
  WHERE t.contract_version = 3 AND t.text_version = p_text_version;

  IF v_mode = 'live' THEN
    -- Activación técnica completa: TODOS los idiomas de la versión activos.
    IF v_all_active THEN
      RETURN 'open_live';
    END IF;
    RETURN 'closed';
  END IF;

  IF v_mode = 'qa_fixtures' THEN
    -- QA jamás abre si el texto está comercialmente activo: una config de
    -- QA copiada a producción deja de funcionar en cuanto hay activación
    -- real. Además exige identidad sintética del dominio de fixtures, que
    -- en producción no existe.
    IF v_all_active THEN
      RETURN 'closed';
    END IF;
    SELECT c.value INTO v_domain
    FROM public.pb_marketplace_v3_release_config c
    WHERE c.key = 'qa_fixture_email_domain';
    IF nullif(btrim(coalesce(v_domain, '')), '') IS NULL THEN
      RETURN 'closed';
    END IF;
    SELECT u.email INTO v_email FROM auth.users u WHERE u.id = p_user_id;
    IF v_email IS NOT NULL AND lower(v_email) LIKE '%@' || lower(btrim(v_domain)) THEN
      RETURN 'open_qa_fixture';
    END IF;
    RETURN 'closed';
  END IF;

  RETURN 'closed';  -- 'off' y cualquier valor desconocido: cerrado
END;
$$;

REVOKE ALL ON FUNCTION public.pb_v3_acceptance_gate(uuid, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.pb_v3_acceptance_gate(uuid, text) TO service_role;

COMMENT ON FUNCTION public.pb_v3_acceptance_gate(uuid, text) IS
  'PR-V3-02 ronda 4: gate fail-closed del contrato v3. off/desconocido=closed; live exige texto active; qa_fixtures exige identidad sintética del dominio configurado y texto NO activo.';

-- ─────────────────────────────────────────────────────────────────────────────
-- 5. Eventos de consentimiento: hash completo + idioma + tipo de acto
-- ─────────────────────────────────────────────────────────────────────────────
ALTER TABLE public.app_14da0f1941_marketplace_consent_events
  ADD COLUMN IF NOT EXISTS event_type        text,
  ADD COLUMN IF NOT EXISTS consent_lang      text,
  ADD COLUMN IF NOT EXISTS consent_text_hash text;

UPDATE public.app_14da0f1941_marketplace_consent_events
SET event_type = 'accept' WHERE event_type IS NULL;
ALTER TABLE public.app_14da0f1941_marketplace_consent_events ALTER COLUMN event_type SET NOT NULL;
ALTER TABLE public.app_14da0f1941_marketplace_consent_events ALTER COLUMN event_type SET DEFAULT 'accept';
ALTER TABLE public.app_14da0f1941_marketplace_consent_events
  DROP CONSTRAINT IF EXISTS pb_consent_events_type_check;
ALTER TABLE public.app_14da0f1941_marketplace_consent_events
  ADD CONSTRAINT pb_consent_events_type_check CHECK (event_type IN ('accept', 'withdraw'));

-- ─────────────────────────────────────────────────────────────────────────────
-- 6. RPC de requisitos: política canónica de cuenta + gate visible
-- ─────────────────────────────────────────────────────────────────────────────
DROP FUNCTION IF EXISTS public.pb_marketplace_v3_requirements(text);

CREATE OR REPLACE FUNCTION public.pb_marketplace_v3_requirements(
  p_lang text DEFAULT 'es'
)
RETURNS TABLE(
  ok_cv           boolean,
  ok_profession   boolean,
  ok_location     boolean,
  ok_availability boolean,
  ok_minimums     boolean,
  already_ready   boolean,
  consent_version integer,
  account_type    text,
  role            text,
  account_allowed boolean,
  acceptance_open boolean,
  text_status     text,
  contract_lang   text,
  text_version    text,
  canonical_hash  text,
  body_md         text
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_min     record;
  v_prof    record;
  v_text    record;
  v_lang    text := lower(coalesce(nullif(btrim(p_lang), ''), 'es'));
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'not_authenticated' USING ERRCODE = '28000';
  END IF;

  SELECT pr.user_id, pr.marketplace_ready, pr.marketplace_contract_version,
         pr.marketplace_consent_version, pr.account_type, pr.role
    INTO v_prof
  FROM public.app_14da0f1941_profiles pr
  WHERE pr.user_id = v_user_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'profile_not_found' USING ERRCODE = 'P0002';
  END IF;

  -- Predicado canónico v3 (sql/047): Storage real + owner; availability sin
  -- 'not_specified'/'unknown'. El frontend NO duplica estas reglas.
  SELECT * INTO v_min FROM public.pb_marketplace_minimums_v3(v_user_id);

  -- Versión de texto VIGENTE para nuevos actos: la más reciente no retirada
  -- del contrato 3 (idioma resuelto con fallback canónico 'es').
  SELECT t.lang, t.text_version, t.canonical_hash, t.body_md, t.status
    INTO v_text
  FROM public.pb_marketplace_contract_texts t
  WHERE t.contract_version = 3 AND t.lang = v_lang AND t.status <> 'retired'
  ORDER BY t.created_at DESC
  LIMIT 1;

  IF NOT FOUND THEN
    SELECT t.lang, t.text_version, t.canonical_hash, t.body_md, t.status
      INTO v_text
    FROM public.pb_marketplace_contract_texts t
    WHERE t.contract_version = 3 AND t.lang = 'es' AND t.status <> 'retired'
    ORDER BY t.created_at DESC
    LIMIT 1;
    v_lang := 'es';
  END IF;

  RETURN QUERY SELECT
    v_min.ok_cv, v_min.ok_profession, v_min.ok_location, v_min.ok_availability,
    v_min.ok_minimums,
    (v_prof.marketplace_ready IS TRUE),
    v_prof.marketplace_consent_version,
    v_prof.account_type,
    v_prof.role,
    public.pb_v3_is_professional_account(v_prof.account_type, v_prof.role),
    (v_text.text_version IS NOT NULL
     AND public.pb_v3_acceptance_gate(v_user_id, v_text.text_version) <> 'closed'),
    v_text.status,
    v_lang,
    v_text.text_version, v_text.canonical_hash, v_text.body_md;
END;
$$;

REVOKE ALL ON FUNCTION public.pb_marketplace_v3_requirements(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.pb_marketplace_v3_requirements(text) TO authenticated;

COMMENT ON FUNCTION public.pb_marketplace_v3_requirements(text) IS
  'PR-V3-02 rondas 3-4: requisitos canónicos v3 + texto preservado + política de cuenta profesional (account_type Y role) + estado de la gate. Sin datos privados. actor=auth.uid().';

-- ─────────────────────────────────────────────────────────────────────────────
-- 7. RPC de aceptación: cuenta profesional + gate + evidencia completa
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.pb_accept_marketplace_contract_v3(
  p_lang text DEFAULT 'es'
)
RETURNS TABLE(out_status text, out_marketplace_ready boolean, out_activated_count integer)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id     uuid := auth.uid();
  v_profile     record;
  v_text        record;
  v_gate        text;
  v_lang        text := lower(coalesce(nullif(btrim(p_lang), ''), 'es'));
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'not_authenticated' USING ERRCODE = '28000';
  END IF;

  SELECT user_id, account_type, role, marketplace_ready,
         marketplace_contract_version, marketplace_consent_declared,
         marketplace_consent_version
    INTO v_profile
  FROM public.app_14da0f1941_profiles
  WHERE user_id = v_user_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'profile_not_found' USING ERRCODE = 'P0002';
  END IF;

  -- P1 ronda 4: política canónica de cuenta profesional EN EL RPC — exige
  -- account_type='worker' Y role='worker'. Híbridos históricos
  -- (company/worker, admin/worker) bloqueados SIN modificar las cuentas.
  IF NOT public.pb_v3_is_professional_account(v_profile.account_type, v_profile.role) THEN
    RETURN QUERY SELECT 'account_type_not_allowed'::text, FALSE, 0;
    RETURN;
  END IF;

  -- Legacy v1 READY: protegido (sql/037). No se migra por el wizard.
  IF v_profile.marketplace_contract_version = 1 AND v_profile.marketplace_ready IS TRUE THEN
    RETURN QUERY SELECT 'legacy_protected'::text, TRUE, 0;
    RETURN;
  END IF;

  -- Texto vigente (más reciente no retirado) del idioma resuelto.
  SELECT t.lang, t.text_version, t.canonical_hash, t.status
    INTO v_text
  FROM public.pb_marketplace_contract_texts t
  WHERE t.contract_version = 3 AND t.lang = v_lang AND t.status <> 'retired'
  ORDER BY t.created_at DESC
  LIMIT 1;
  IF NOT FOUND THEN
    SELECT t.lang, t.text_version, t.canonical_hash, t.status
      INTO v_text
    FROM public.pb_marketplace_contract_texts t
    WHERE t.contract_version = 3 AND t.lang = 'es' AND t.status <> 'retired'
    ORDER BY t.created_at DESC
    LIMIT 1;
    v_lang := 'es';
  END IF;
  IF v_text.text_version IS NULL THEN
    RAISE EXCEPTION 'contract_text_unavailable' USING ERRCODE = 'P0003';
  END IF;

  -- P1 ronda 4: GATE fail-closed. Un texto DRAFT no genera consentimientos
  -- efectivos, promociones, candidaturas activadas ni EMAIL 2. La gate
  -- cubre consentimientos NUEVOS y re-sincronizaciones de consentimientos
  -- existentes. Sin efectos secundarios cuando está cerrada.
  v_gate := public.pb_v3_acceptance_gate(v_user_id, v_text.text_version);
  IF v_gate = 'closed' THEN
    RETURN QUERY SELECT 'contract_not_active'::text, FALSE, 0;
    RETURN;
  END IF;

  -- Idempotencia + re-sync: 'already_accepted' no oculta un estado elegible
  -- pendiente (p.ej. subió el CV después). Gate ya evaluada arriba.
  IF v_profile.marketplace_contract_version = 3
     AND v_profile.marketplace_consent_declared IS TRUE
     AND v_profile.marketplace_consent_version = 3 THEN
    IF v_profile.marketplace_ready IS TRUE THEN
      RETURN QUERY SELECT 'already_accepted'::text, TRUE, 0;
      RETURN;
    END IF;
    RETURN QUERY
      SELECT s.out_status, s.out_marketplace_ready, s.out_activated_count
      FROM public.pb_sync_marketplace_ready_state(v_user_id) s;
    RETURN;
  END IF;

  -- Aceptación: columnas protegidas por vía canónica (SECURITY DEFINER).
  -- La aceptación del contrato v3 incluye la configuración de visibilidad
  -- necesaria (decisión de producto A: consentimiento y configuración de
  -- visibilidad necesarios; el texto aceptado autoriza presentar el
  -- perfil a empresas verificadas). Sin esto, el predicado v3 exigiría un
  -- cambio de visibilidad separado y el recorrido aceptar→subir CV→ready
  -- quedaría bloqueado.
  UPDATE public.app_14da0f1941_profiles
     SET marketplace_contract_version = 3,
         marketplace_consent_declared = TRUE,
         marketplace_consent_version = 3,
         marketplace_consent_at = now(),
         profile_visibility = 'public',
         cv_visible = TRUE
   WHERE user_id = v_user_id;

  -- Evidencia append-only: versión EXACTA mostrada + hash COMPLETO + idioma
  -- + timestamp (created_at). Identidad autenticada = user_id de la fila.
  INSERT INTO public.app_14da0f1941_marketplace_consent_events
    (user_id, contract_version, consent_text_version, source, event_type, consent_lang, consent_text_hash)
  VALUES
    (v_user_id, 3, v_text.text_version || ':' || v_lang || ':' || left(v_text.canonical_hash, 12),
     'wizard_v3', 'accept', v_lang, v_text.canonical_hash);

  -- Sincronización canónica: promueve SOLO si el predicado v3 se cumple.
  -- EMAIL 2 solo por transición real false -> true (outbox sql/034).
  RETURN QUERY
    SELECT s.out_status, s.out_marketplace_ready, s.out_activated_count
    FROM public.pb_sync_marketplace_ready_state(v_user_id) s;
END;
$$;

REVOKE ALL ON FUNCTION public.pb_accept_marketplace_contract_v3(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.pb_accept_marketplace_contract_v3(text) TO authenticated;

DROP FUNCTION IF EXISTS public.pb_accept_marketplace_contract_v3();

COMMENT ON FUNCTION public.pb_accept_marketplace_contract_v3(text) IS
  'PR-V3-02 rondas 3-4: aceptación v3 por el propio usuario. Exige cuenta profesional (account_type Y role = worker) y gate abierta (off/DRAFT: contract_not_active sin efectos). Evidencia con hash completo + idioma. already_accepted re-sincroniza. Legacy v1 protegido.';

-- ─────────────────────────────────────────────────────────────────────────────
-- 8. Retirada del consentimiento (acto del propio usuario)
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.pb_withdraw_marketplace_contract_v3()
RETURNS TABLE(out_status text, out_marketplace_ready boolean)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id  uuid := auth.uid();
  v_profile  record;
  v_ev       record;
  v_completion integer;
  v_batch    text := 'withdraw-v3-' || to_char(now(), 'YYYYMMDDHH24MISS');
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'not_authenticated' USING ERRCODE = '28000';
  END IF;

  SELECT user_id, full_name, title, marketplace_ready, onboarding_status,
         profile_completion, marketplace_contract_version,
         marketplace_consent_declared, marketplace_consent_version
    INTO v_profile
  FROM public.app_14da0f1941_profiles
  WHERE user_id = v_user_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'profile_not_found' USING ERRCODE = 'P0002';
  END IF;

  IF NOT (v_profile.marketplace_contract_version = 3
          AND v_profile.marketplace_consent_declared IS TRUE
          AND v_profile.marketplace_consent_version = 3) THEN
    RETURN QUERY SELECT 'not_consented'::text, v_profile.marketplace_ready;
    RETURN;
  END IF;

  -- Evidencia de la versión consentida que se retira (último acto accept).
  SELECT e.consent_text_version, e.consent_lang, e.consent_text_hash
    INTO v_ev
  FROM public.app_14da0f1941_marketplace_consent_events e
  WHERE e.user_id = v_user_id AND e.event_type = 'accept'
  ORDER BY e.created_at DESC
  LIMIT 1;

  -- Acto append-only de retirada.
  INSERT INTO public.app_14da0f1941_marketplace_consent_events
    (user_id, contract_version, consent_text_version, source, event_type, consent_lang, consent_text_hash)
  VALUES
    (v_user_id, 3,
     coalesce(v_ev.consent_text_version, 'unknown'),
     'wizard_v3_withdraw', 'withdraw', v_ev.consent_lang, v_ev.consent_text_hash);

  -- Limpieza canónica de columnas protegidas + degradación si estaba ready
  -- por v3. Las candidaturas NO se tocan: la retirada no afecta a
  -- presentaciones ya realizadas (texto contractual §4) y las
  -- pending_profile_validation se conservan.
  v_completion := public.pb_profile_completion_score(v_user_id);

  UPDATE public.app_14da0f1941_profiles
     SET marketplace_consent_declared = FALSE,
         marketplace_consent_version  = NULL,
         marketplace_consent_at       = NULL,
         marketplace_ready            = FALSE,
         profile_visibility           = 'private',
         cv_visible                   = FALSE,
         onboarding_status            = public.pb_onboarding_status(
                                          v_completion, FALSE, v_profile.full_name, v_profile.title),
         profile_completion           = v_completion,
         updated_at                   = now()
   WHERE user_id = v_user_id;

  IF v_profile.marketplace_ready IS TRUE THEN
    INSERT INTO public.pb_marketplace_ready_reconcile_log (
      batch_id, dry_run, user_id, prev_ready, prev_status, prev_completion,
      prev_contract_version, prev_consent_declared,
      new_ready, new_status, new_completion, class, applied
    ) VALUES (
      v_batch, FALSE, v_user_id, TRUE, v_profile.onboarding_status,
      v_profile.profile_completion, 3, TRUE,
      FALSE,
      public.pb_onboarding_status(v_completion, FALSE, v_profile.full_name, v_profile.title),
      v_completion,
      'consent_withdrawn_v3_demoted', TRUE
    );
  END IF;

  RETURN QUERY SELECT 'withdrawn'::text, FALSE;
END;
$$;

REVOKE ALL ON FUNCTION public.pb_withdraw_marketplace_contract_v3() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.pb_withdraw_marketplace_contract_v3() TO authenticated;

COMMENT ON FUNCTION public.pb_withdraw_marketplace_contract_v3() IS
  'PR-V3-02 ronda 4: retirada del consentimiento v3 por el propio usuario (auth.uid()). Evento append-only (withdraw) + limpieza canónica + degradación auditada si estaba ready. Candidaturas intactas. Re-aceptación posterior posible.';

-- ─────────────────────────────────────────────────────────────────────────────
-- 9. Auto-resync post-aceptación (CV/requisitos completados después)
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.pb_profiles_v3_auto_resync()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_text_version text;
BEGIN
  -- Solo perfiles v3 consentidos aún no ready. El comportamiento v2
  -- (PR #84) queda intacto: este trigger NO actúa sobre contract_version=2.
  IF NEW.marketplace_ready IS TRUE
     OR NEW.marketplace_contract_version IS DISTINCT FROM 3
     OR NEW.marketplace_consent_version IS DISTINCT FROM 3
     OR NEW.marketplace_consent_declared IS NOT TRUE THEN
    RETURN NEW;
  END IF;

  IF NOT (
    NEW.cv_storage_path      IS DISTINCT FROM OLD.cv_storage_path
    OR NEW.cv_storage_bucket IS DISTINCT FROM OLD.cv_storage_bucket
    OR NEW.title             IS DISTINCT FROM OLD.title
    OR NEW.location          IS DISTINCT FROM OLD.location
    OR NEW.availability_status IS DISTINCT FROM OLD.availability_status
  ) THEN
    RETURN NEW;
  END IF;

  -- Versión de texto consentida (último acto accept) para evaluar la gate.
  SELECT split_part(e.consent_text_version, ':', 1) INTO v_text_version
  FROM public.app_14da0f1941_marketplace_consent_events e
  WHERE e.user_id = NEW.user_id AND e.event_type = 'accept'
  ORDER BY e.created_at DESC
  LIMIT 1;

  IF nullif(coalesce(v_text_version, ''), '') IS NULL THEN
    RETURN NEW;
  END IF;

  -- Gate cerrada (p.ej. DRAFT en producción con mode=off): SIN promoción
  -- ni EMAIL 2 aunque el predicado se cumpla.
  IF public.pb_v3_acceptance_gate(NEW.user_id, v_text_version) = 'closed' THEN
    RETURN NEW;
  END IF;

  -- Sync canónico (despacho por versión, consent-gated). Sin recursión:
  -- el sync no toca las columnas vigiladas y ready=true corta la condición.
  PERFORM public.pb_sync_marketplace_ready_state(NEW.user_id, 'auto-resync-v3');
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.pb_profiles_v3_auto_resync() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS pb_profiles_v3_auto_resync ON public.app_14da0f1941_profiles;
CREATE TRIGGER pb_profiles_v3_auto_resync
  AFTER UPDATE OF cv_storage_path, cv_storage_bucket, title, location, availability_status
  ON public.app_14da0f1941_profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.pb_profiles_v3_auto_resync();

COMMENT ON FUNCTION public.pb_profiles_v3_auto_resync() IS
  'PR-V3-02 ronda 4: auto-resync de perfiles v3 consentidos no ready al cambiar cv/title/location/availability. Gate evaluada (DRAFT/off: sin promoción ni EMAIL 2). v2 intacto.';
