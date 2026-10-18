-- ══════════════════════════════════════════════════════════════════════════════
-- PR-V3-02 RONDA 3 (PO review 17/10/2026) — Correcciones P1:
-- discrepancias frontend/backend, cierre por tipo de cuenta y consentimiento
-- verificable.
--
-- Contenido:
--   1. pb_marketplace_contract_texts — versión preservada del texto del
--      contrato por idioma (11 locales) con hash SHA-256. La versión que se
--      muestra es la versión que se registra: el RPC de aceptación valida
--      que el idioma solicitado existe y toma la versión/canonical_hash de
--      ESTA tabla (no de una constante suelta). BORRADOR no jurídico:
--      is_legal_final=false hasta revisión del abogado y GO PO.
--   2. pb_marketplace_v3_requirements(p_lang) — RPC canónico PÚBLICO para el
--      wizard: devuelve el resultado del predicado canónico v3 (que ya exige
--      objeto Storage real con owner correcto y excluye availability
--      'not_specified'/'unknown'), SIN exponer datos privados (solo claves
--      de requisito + versión/hash del texto). El frontend NO duplica reglas
--      SQL: consume este resultado.
--   3. Restricción por tipo de cuenta EN EL RPC (no solo router): la
--      aceptación v3 exige cuenta profesional (account_type='worker');
--      company/admin reciben 'account_type_not_allowed' sin efectos
--      secundarios. Una cuenta empresarial NUNCA se convierte en candidata
--      Marketplace Ready por el wizard.
--   4. 'already_accepted' ya no oculta un estado elegible pendiente de
--      sincronización: si el perfil consentido no está ready y es elegible,
--      la re-aceptación dispara el sync canónico (idempotente; EMAIL 2 solo
--      por transición real del outbox de sql/034).
--
-- Seguridad: SECURITY DEFINER con actor=auth.uid() por construcción (sin
-- parámetro de sujeto). Cero relajación de RLS. Anon: 28000.
--
-- IDEMPOTENT: SÍ. STATUS: QA primero; producción solo con GO expreso del PO.
-- ══════════════════════════════════════════════════════════════════════════════

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. Textos contractuales preservados (borrador, no jurídico definitivo)
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.pb_marketplace_contract_texts (
  contract_version integer NOT NULL,
  lang             text    NOT NULL,
  text_version     text    NOT NULL,
  body_md          text    NOT NULL,
  canonical_hash   text    NOT NULL,
  is_legal_final   boolean NOT NULL DEFAULT false,
  created_at       timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (contract_version, lang)
);

COMMENT ON TABLE public.pb_marketplace_contract_texts IS
  'PR-V3-02 ronda 3: versiones preservadas del texto del contrato marketplace por idioma. canonical_hash = SHA-256 del body; la versión mostrada es la versión registrada. is_legal_final=false hasta revisión del abogado y GO PO (borrador, sin activación comercial).';

ALTER TABLE public.pb_marketplace_contract_texts ENABLE ROW LEVEL SECURITY;

-- Lectura del propio texto que se va a aceptar: cualquier autenticado puede
-- LEER el contrato (transparencia del acto); escritura solo backend.
-- Idempotente (ronda 5): DROP previo para permitir reejecución de la migración.
DROP POLICY IF EXISTS pb_contract_texts_read ON public.pb_marketplace_contract_texts;
CREATE POLICY pb_contract_texts_read ON public.pb_marketplace_contract_texts
  FOR SELECT TO authenticated USING (true);

REVOKE ALL ON public.pb_marketplace_contract_texts FROM PUBLIC, anon;
GRANT SELECT ON public.pb_marketplace_contract_texts TO authenticated;
GRANT INSERT, UPDATE, SELECT ON public.pb_marketplace_contract_texts TO service_role;

-- digest() requiere pgcrypto (ya presente en Supabase; se asegura ANTES del
-- seed que lo utiliza — ronda 5: orden de dependencias para instalación limpia).
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- 11 idiomas del producto. El cuerpo canónico es el texto funcional ES; el
-- resto de locales registran su propia versión (misma text_version v3) con su
-- traducción. El wizard muestra el texto del idioma resuelto del usuario y
-- registra exactamente esa versión.
INSERT INTO public.pb_marketplace_contract_texts (contract_version, lang, text_version, body_md, canonical_hash, is_legal_final)
SELECT 3, l.lang, 'v3-2026-10-17', l.body, encode(digest(l.body, 'sha256'), 'hex'), false
FROM (VALUES
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

Версія тексту: v3-2026-10-17.')
) AS l(lang, body)
-- Inmutable (ronda 5): el seed NUNCA sobrescribe un texto ya versionado.
-- DO NOTHING sin lista de columnas: compatible tanto con la PK original
-- (contract_version, lang) como con la PK (text_version, lang) instalada por
-- sql/051, y con cualquier índice único adicional.
ON CONFLICT DO NOTHING;

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. RPC canónico público: requisitos v3 + texto del contrato para el wizard
-- ─────────────────────────────────────────────────────────────────────────────

-- Cambio de firma (añade account_type): DROP + CREATE.
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
         pr.marketplace_consent_version, pr.account_type
    INTO v_prof
  FROM public.app_14da0f1941_profiles pr
  WHERE pr.user_id = v_user_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'profile_not_found' USING ERRCODE = 'P0002';
  END IF;

  -- Predicado canónico v3 (sql/047): exige objeto Storage real con owner
  -- correcto y excluye availability 'not_specified'/'unknown'. El frontend
  -- NO duplica estas reglas: consume este resultado.
  SELECT * INTO v_min FROM public.pb_marketplace_minimums_v3(v_user_id);

  -- Texto del contrato: idioma solicitado si existe; si no, fallback 'es'
  -- (canónico). La versión mostrada ES la versión que se registra.
  SELECT t.lang, t.text_version, t.canonical_hash, t.body_md
    INTO v_text
  FROM public.pb_marketplace_contract_texts t
  WHERE t.contract_version = 3 AND t.lang = v_lang;

  IF NOT FOUND THEN
    SELECT t.lang, t.text_version, t.canonical_hash, t.body_md
      INTO v_text
    FROM public.pb_marketplace_contract_texts t
    WHERE t.contract_version = 3 AND t.lang = 'es';
    v_lang := 'es';
  END IF;

  RETURN QUERY SELECT
    v_min.ok_cv, v_min.ok_profession, v_min.ok_location, v_min.ok_availability,
    v_min.ok_minimums,
    (v_prof.marketplace_ready IS TRUE),
    v_prof.marketplace_consent_version,
    v_prof.account_type,
    v_lang,
    v_text.text_version, v_text.canonical_hash, v_text.body_md;
END;
$$;

REVOKE ALL ON FUNCTION public.pb_marketplace_v3_requirements(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.pb_marketplace_v3_requirements(text) TO authenticated;

COMMENT ON FUNCTION public.pb_marketplace_v3_requirements(text) IS
  'PR-V3-02 ronda 3: resultado canónico de requisitos v3 para el wizard (predicado de sql/047: Storage real + owner; availability sin not_specified/unknown) + versión preservada del texto del contrato (hash). Solo claves y versión; sin datos privados. actor=auth.uid().';

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. Aceptación: tipo de cuenta + versión del texto preservada + re-sync
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

  -- P1 ronda 3 (5-8): restricción por tipo de cuenta EN EL RPC. Solo cuentas
  -- profesionales (worker). Company (pending o verified) y admin no pueden
  -- aceptar el contrato de candidato; sin efectos secundarios. Una cuenta
  -- empresarial NUNCA se convierte en candidata Marketplace Ready.
  IF v_profile.account_type IS DISTINCT FROM 'worker' THEN
    RETURN QUERY SELECT 'account_type_not_allowed'::text, FALSE, 0;
    RETURN;
  END IF;

  -- Texto preservado que realmente se acepta (versión + hash del idioma
  -- resuelto, con fallback canónico 'es').
  SELECT t.text_version, t.canonical_hash
    INTO v_text
  FROM public.pb_marketplace_contract_texts t
  WHERE t.contract_version = 3 AND t.lang = v_lang;
  IF NOT FOUND THEN
    SELECT t.text_version, t.canonical_hash
      INTO v_text
    FROM public.pb_marketplace_contract_texts t
    WHERE t.contract_version = 3 AND t.lang = 'es';
    v_lang := 'es';
  END IF;
  IF v_text.text_version IS NULL THEN
    -- Fail-closed: sin versión preservada del texto no hay acto válido.
    RAISE EXCEPTION 'contract_text_unavailable' USING ERRCODE = 'P0003';
  END IF;

  -- Idempotencia + P2 (15): 'already_accepted' NO oculta un estado elegible
  -- pendiente de sincronización. Si ya consintió pero no está ready y es
  -- elegible (p.ej. subió el CV después), se dispara el sync canónico.
  IF v_profile.marketplace_contract_version = 3
     AND v_profile.marketplace_consent_declared IS TRUE
     AND v_profile.marketplace_consent_version = 3 THEN
    IF v_profile.marketplace_ready IS TRUE THEN
      RETURN QUERY SELECT 'already_accepted'::text, TRUE, 0;
      RETURN;
    END IF;
    -- Ya consentido, aún no ready: re-sync idempotente sin duplicar evento.
    RETURN QUERY
      SELECT s.out_status, s.out_marketplace_ready, s.out_activated_count
      FROM public.pb_sync_marketplace_ready_state(v_user_id) s;
    RETURN;
  END IF;

  -- Legacy v1 READY: protegido (sql/037). No se migra por el wizard.
  IF v_profile.marketplace_contract_version = 1 AND v_profile.marketplace_ready IS TRUE THEN
    RETURN QUERY SELECT 'legacy_protected'::text, TRUE, 0;
    RETURN;
  END IF;

  -- Aceptación: columnas protegidas por vía canónica (SECURITY DEFINER).
  UPDATE public.app_14da0f1941_profiles
     SET marketplace_contract_version = 3,
         marketplace_consent_declared = TRUE,
         marketplace_consent_version = 3,
         marketplace_consent_at = now()
   WHERE user_id = v_user_id;

  -- Evidencia append-only: versión EXACTA del texto mostrado (tabla
  -- preservada, no constante), fecha, identidad autenticada e idioma.
  INSERT INTO public.app_14da0f1941_marketplace_consent_events
    (user_id, contract_version, consent_text_version, source)
  VALUES
    (v_user_id, 3, v_text.text_version || ':' || v_lang || ':' || left(v_text.canonical_hash, 12), 'wizard_v3');

  -- Sincronización canónica: promueve SOLO si el predicado v3 se cumple.
  -- EMAIL 2 solo por transición real false -> true (outbox sql/034).
  RETURN QUERY
    SELECT s.out_status, s.out_marketplace_ready, s.out_activated_count
    FROM public.pb_sync_marketplace_ready_state(v_user_id) s;
END;
$$;

REVOKE ALL ON FUNCTION public.pb_accept_marketplace_contract_v3(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.pb_accept_marketplace_contract_v3(text) TO authenticated;

-- La firma antigua sin parámetros queda reemplazada por la nueva (text).
DROP FUNCTION IF EXISTS public.pb_accept_marketplace_contract_v3();

COMMENT ON FUNCTION public.pb_accept_marketplace_contract_v3(text) IS
  'PR-V3-02 ronda 3: aceptación v3 por el propio usuario (auth.uid()). Restringida a account_type=worker (account_type_not_allowed). Registra versión preservada del texto (text_version:lang:hash12). already_accepted re-sincroniza si hay estado elegible pendiente. Idempotente; legacy v1 ready protegido.';
