// PB-CV-AUTO-PROFILE-001 — Diccionarios multilingües del motor de extracción.
//
// Cobertura mínima estructural de los 11 idiomas del ticket (§8): ES, EN, PT,
// NL, FR, DE, IT, RO, PL, UK, BG. Los diccionarios son deliberadamente
// conservadores: un término solo entra si su presencia en un CV de
// piping/mechanical implica inequívocamente la etiqueta. Lo dudoso NO se
// extrae (o se marca low) — regla "no inventar información" (§2).
//
// Módulo puro: datos + regex factory, sin APIs de plataforma.

import type { CvLanguage } from './types.ts';

// ─── Detección de idioma ─────────────────────────────────────────────────────

/** Palabras/secciones características por idioma para puntuar el texto. */
export const LANGUAGE_MARKERS: Record<CvLanguage, readonly string[]> = {
  es: ['experiencia', 'formación', 'idiomas', 'disponibilidad', 'años', 'empresa', 'puesto', 'soldador', 'tubero', 'disponible', 'competencias', 'resumen'],
  en: ['experience', 'education', 'skills', 'languages', 'availability', 'years', 'company', 'position', 'welder', 'pipefitter', 'available', 'summary', 'profile'],
  pt: ['experiência', 'formação', 'idiomas', 'disponibilidade', 'anos', 'empresa', 'função', 'soldador', 'disponível', 'competências', 'resumo'],
  nl: ['ervaring', 'opleiding', 'talen', 'beschikbaarheid', 'jaar', 'bedrijf', 'functie', 'lasser', 'pijpfitter', 'beschikbaar', 'vaardigheden', 'profiel'],
  fr: ['expérience', 'formation', 'langues', 'disponibilité', 'ans', 'entreprise', 'poste', 'soudeur', 'tuyauteur', 'disponible', 'compétences', 'résumé'],
  de: ['erfahrung', 'ausbildung', 'sprachen', 'verfügbarkeit', 'jahre', 'unternehmen', 'stelle', 'schweißer', 'rohrleitungsbauer', 'verfügbar', 'kenntnisse', 'profil'],
  it: ['esperienza', 'formazione', 'lingue', 'disponibilità', 'anni', 'azienda', 'posizione', 'saldatore', 'tubista', 'disponibile', 'competenze', 'profilo'],
  ro: ['experiență', 'experienta', 'formare', 'limbi', 'disponibilitate', 'ani', 'companie', 'funcție', 'sudor', 'instalator', 'disponibil', 'competențe'],
  pl: ['doświadczenie', 'wykształcenie', 'języki', 'dostępność', 'lat', 'firma', 'stanowisko', 'spawacz', 'monter', 'dostępny', 'umiejętności', 'podsumowanie'],
  uk: ['досвід', 'освіта', 'мови', 'доступність', 'років', 'компанія', 'посада', 'зварювальник', 'монтажник', 'доступний', 'навички', 'профіль'],
  bg: ['опит', 'образование', 'езици', 'наличност', 'години', 'фирма', 'длъжност', 'заварчик', 'монтажник', 'наличен', 'умения', 'профил'],
};

// ─── Etiquetas de sección (para extracción con confianza high) ───────────────

/** Etiquetas "nombre completo" por idioma. */
export const FULL_NAME_LABELS: readonly string[] = [
  'full name', 'name', 'nombre completo', 'nombre', 'nome completo', 'nome',
  'naam', 'nom', 'imię i nazwisko', 'nume complet', 'nume',
  "ім'я та прізвище", "ім'я", 'прізвище', 'име', 'име и фамилия',
];

/** Etiquetas de título/profesión por idioma. */
export const TITLE_LABELS: readonly string[] = [
  'title', 'professional title', 'job title', 'position', 'profession',
  'puesto', 'título', 'profesión', 'cargo', 'função', 'título profissional',
  'functie', 'titel', 'beruf', 'stellenbezeichnung', 'posizione', 'titolo',
  'funcție', 'titlu', 'stanowisko', 'посада', 'длъжност',
];

/** Etiquetas de ubicación por idioma. */
export const LOCATION_LABELS: readonly string[] = [
  'location', 'based in', 'residence', 'ubicación', 'localización', 'domicilio',
  'localidade', 'localização', 'residência', 'woonplaats', 'locatie', 'lieu',
  'domicile', 'ort', 'wohnort', 'sede', 'locație', 'localizare',
  'lokalizacja', 'місце', 'місто', 'локація', 'местоположение', 'град',
];

/** Encabezados de resumen profesional por idioma. */
export const SUMMARY_HEADINGS: readonly string[] = [
  'professional summary', 'professional profile', 'summary', 'profile',
  'about me', 'resumen profesional', 'perfil profesional', 'sobre mí',
  'resumen', 'resumo profissional', 'resumo', 'perfil', 'professioneel profiel',
  'profiel', 'samenvatting', 'résumé professionnel', 'profil professionnel',
  'berufsprofil', 'profilo professionale', 'profilo', 'sumar profesional',
  'podsumowanie zawodowe', 'професійний профіль', 'про мене',
  'професионален профил',
];

/** Encabezados de experiencia laboral por idioma. */
export const EXPERIENCE_HEADINGS: readonly string[] = [
  'work experience', 'professional experience', 'employment history',
  'experience', 'experiencia laboral', 'experiencia profesional',
  'experiencia', 'experiência profissional', 'experiência', 'werkervaring',
  'expérience professionnelle', 'expérience', 'berufserfahrung', 'esperienza',
  'esperienza professionale', 'experiență profesională', 'experiență',
  'doświadczenie zawodowe', 'досвід роботи', 'професійний досвід',
  'трудов опит', 'професионален опит',
];

/** Encabezados de formación por idioma. */
export const EDUCATION_HEADINGS: readonly string[] = [
  'education', 'educational background', 'formación', 'formación académica',
  'estudios', 'formação', 'educação', 'opleiding', 'opleidingen', 'formation',
  'ausbildung', 'istruzione', 'educație', 'formare', 'wykształcenie',
  'освіта', 'образование',
];

/** Encabezados de idiomas hablados por idioma. */
export const LANGUAGES_HEADINGS: readonly string[] = [
  'languages', 'language skills', 'idiomas', 'línguas', 'talen', 'langues',
  'sprachen', 'lingue', 'limbi', 'języki', 'мови', 'езици',
];

/** Etiquetas empresa/puesto dentro de un bloque de experiencia. */
export const EMPLOYER_LABELS: readonly string[] = [
  'employer', 'company', 'company name', 'empresa', 'compañía', 'werkgever',
  'bedrijf', 'employeur', 'entreprise', 'arbeitgeber', 'unternehmen',
  'azienda', 'angajator', 'companie', 'pracodawca', 'firma', 'роботодавець',
  'компанія', 'работодател',
];

export const POSITION_LABELS: readonly string[] = [
  'position', 'role', 'job title', 'puesto', 'cargo', 'rol', 'função',
  'functie', 'poste', 'stelle', 'posizione', 'ruolo', 'funcție', 'stanowisko',
  'посада', 'роль', 'длъжност',
];

/** Marcadores de "hasta la actualidad" por idioma (fecha fin abierta). */
export const CURRENT_JOB_MARKERS: readonly string[] = [
  'present', 'current', 'now', 'actualmente', 'actual', 'actualidad',
  'atualmente', 'hoje', 'heden', 'aujourd', "aujourd'hui", 'heute', 'derzeit',
  'attuale', 'prezent', 'obecnie', 'тепер', 'донині', 'наш час', 'сьогодні',
  'сега', 'момента',
];

// ─── Años de experiencia ─────────────────────────────────────────────────────
// Se aplica al texto NORMALIZADO (sin acentos, minúsculas): todas las
// alternativas están escritas ya en forma normalizada.

export const YEARS_EXPERIENCE_PATTERN =
  '(\\d{1,2})\\s*\\+?\\s*' +
  '(?:years?|yrs?|jaar|jaren|jahre|jahren|anos?|ans|ann[ée]es|annees|anni|ani|lat|lata|роки|років|години|г)?\\s*' +
  "(?:of\\s+|de\\s+|di\\s+|d['’]?\\s*)?" +
  '(?:experience|experiencia|ervaring|erfahrung|esperienza|experienta|doswiadczenia|doswiadczenie|dosvidu|досвіду|досвід|опит)';

// ─── Disponibilidad inequívoca y movilidad explícita ────────────────────────

/** Solo disponibilidad declarada de forma inequívoca (ticket §2). */
export const AVAILABILITY_PATTERNS: readonly { pattern: string; value: string }[] = [
  { pattern: 'available\\s+(?:immediately|at short notice)', value: 'immediately' },
  { pattern: 'immediately available', value: 'immediately' },
  { pattern: 'disponible\\s+(?:inmediatamente|de inmediato|ya)', value: 'immediately' },
  { pattern: 'disponivel\\s+(?:imediatamente|de imediato)', value: 'immediately' },
  { pattern: 'beschikbaar\\s+per\\s+direct', value: 'immediately' },
  { pattern: 'disponible\\s+immediatement', value: 'immediately' },
  { pattern: 'disponible\\s+immediatamente', value: 'immediately' },
  { pattern: 'verfugbar\\s+(?:ab sofort|unmittelbar)', value: 'immediately' },
  { pattern: 'dostepny\\s+(?:natychmiast|od zaraz)', value: 'immediately' },
  { pattern: 'доступний\\s+негайно', value: 'immediately' },
  { pattern: 'на\\s+разположение\\s+незабавно', value: 'immediately' },
  // Con fecha: "available from 01/2025", "disponible desde...", etc.
  { pattern: 'available\\s+from\\s+((?:\\d{1,2}[/.-]\\d{2,4})|(?:\\d{4}))', value: 'from_date' },
  { pattern: 'disponible\\s+desde\\s+((?:\\d{1,2}[/.-]\\d{2,4})|(?:\\d{4}))', value: 'from_date' },
  { pattern: 'beschikbaar\\s+per\\s+((?:\\d{1,2}[/.-]\\d{2,4})|(?:\\d{4}))', value: 'from_date' },
  { pattern: 'disponivel\\s+a\\s+partir\\s+de\\s+((?:\\d{1,2}[/.-]\\d{2,4})|(?:\\d{4}))', value: 'from_date' },
];

export const WILLING_TO_TRAVEL_PATTERNS: readonly string[] = [
  'willing to travel', 'willing to work abroad', 'available for assignments abroad',
  'disponible para viajar', 'disponibilidad para viajar', 'movilidad internacional',
  'disposto a viajar', 'disponivel para viajar',
  'bereid te reizen', 'inzetbaar in het buitenland',
  'pret a voyager', 'disponible pour voyager', 'mobilite internationale',
  'reisebereit', 'reisebereitschaft',
  'disponibile a viaggiare', 'disponibil pentru deplasari',
  'gotowy do wyjazdow', 'dostępny do wyjazdów',
  'готовий до відряджень', 'готовий до поїздок',
  'готов за пътувания', 'готовност за пътуване',
];

export const WILLING_TO_RELOCATE_PATTERNS: readonly string[] = [
  'willing to relocate', 'open to relocation', 'ready to relocate',
  'disponible para reubicarse', 'dispuesto a mudarse', 'disponibilidad para reubicarse',
  'disposto a mudar-se', 'disponivel para realocacao',
  'bereid te verhuizen', 'open voor verhuizen',
  'pret a demenager', 'ouvert a la mobilite',
  'umzugsbereit', 'bereitschaft umzuziehen',
  'disponibile al trasferimento', 'disponibil pentru relocare',
  'gotowy do przeprowadzki', 'готовий до переїзду',
  'готов за преместване',
];

// ─── Diccionario técnico: skills piping/mechanical ──────────────────────────

/**
 * Skills del dominio piping/mechanical. Clave = término canónico (lo que se
 * guarda en el perfil), valores = variantes por idioma (se normalizan al
 * comparar; el matching tolera una "s" final de plural).
 */
export const SKILL_DICTIONARY: Readonly<Record<string, readonly string[]>> = {
  'Pipefitting': ['pipefitting', 'pipefit', 'pipe fitter', 'pipefitter', 'tuberia', 'tubero', 'montador de tuberias', 'montaje de tuberias', 'montagem de tubagens', 'tubista', 'pijpfitten', 'pijpfitter', 'tuyauteur', 'montage de tuyauterie', 'rohrleitungsbau', 'rohrleitungsbauer', 'instalator de tubulatura', 'montaj tevi', 'montaz rur', 'монтаж трубопроводів', 'трубопроводчик', 'монтаж тръбопроводи'],
  'Pipe fabrication': ['pipe fabrication', 'pipefab', 'fabricacion de tuberias', 'fabricacao de tubagens', 'pijpfabricage', 'fabrication de tuyauteries', 'rohrfertigung', 'fabricazione di tubazioni', 'prefabricare tubulatura', 'prefabrykacja rurociagow', 'виробництво трубопроводів', 'изработка тръбопроводи'],
  'Welding': ['welding', 'welder', 'soldadura', 'soldador', 'soldagem', 'lassen', 'lasser', 'soudage', 'soudeur', 'schweissen', 'schweizer', 'saldatura', 'saldatore', 'sudare', 'sudor', 'spawanie', 'spawacz', 'зварювання', 'зварювальник', 'заваряване', 'заварчик'],
  'Mechanical fitting': ['mechanical fitter', 'mechanical fitting', 'fitter', 'mechanical installation', 'montaje mecanico', 'montador mecanico', 'montagem mecanica', 'mechanisch monteur', 'monteur', 'montage mecanique', 'monteur mecanique', 'mechanische montage', 'montaggio meccanico', 'montaj mecanic', 'montaz mechaniczny', 'механічний монтаж', 'механичен монтаж'],
  'Boilermaking / Plating': ['boilermaker', 'plater', 'boilermaking', 'plating', 'caldereria', 'calderero', 'caldeiraria', 'caldeireiro', 'plaatwerk', 'constructiebankwerker', 'chaudronnerie', 'chaudronnier', 'kesselbau', 'kotlarz', 'конструкційні роботи', 'котлярство', 'котелостроене'],
  'Isometric drawing reading': ['isometric', 'isometrics', 'isometricos', 'lectura de isometricos', 'isometrische tekeningen', 'isometrique', 'isometrisch', 'izometric', 'rysunek izometryczny', 'ізометричні креслення', 'изометрични чертежи'],
  'P&ID reading': ['p&id', 'p&ids', 'planos p&id', 'p&id lezen', 'lecture de p&id', 'p&id lesen', 'czytanie p&id', 'читання p&id'],
  'Blueprint reading': ['blueprint reading', 'blueprint', 'lectura de planos', 'tekening lezen', 'lecture de plans', 'zeichnungslesen', 'lettura disegni', 'czytanie rysunkow', 'читання креслень', 'четене на чертежи'],
  'Rigging': ['rigging', 'rigger', 'aparejador', 'armador de cargas', 'aparelhagem', 'hijseen', 'greage', 'такелаж', 'такелажник', 'ригинг'],
  'Scaffolding': ['scaffolding', 'scaffolder', 'andamios', 'andamiero', 'andaimes', 'steigerbouw', 'echafaudage', 'gerustbau', 'impalcature', 'schelarie', 'rusztowania', 'pinage', 'ригування', 'скелета', 'подмости', 'леи'],
  'Shutdown / Turnaround': ['shutdown', 'turnaround', 'tar work', 'parada de planta', 'shutdowns', 'stops', 'revisions', 'stillstande', 'fermate', 'oprire', 'przeglady', 'зупинки', 'ремонти'],
  'Pressure testing': ['pressure test', 'pressure testing', 'hydrotest', 'prueba de presion', 'pruebas de presion', 'teste de pressao', 'druktest', 'drukproef', 'essai de pression', 'druckprufung', 'prova di pressione', 'teste de presiune', 'proba cisnieniowa', 'випробування тиском', 'хидротест', 'хидравличен тест'],
  'Flange assembly': ['flange', 'flanges', 'bridas', 'flenzen', 'brides', 'flansche', 'flanse', 'flanse', 'kolnierze', 'фланці', 'фланци'],
  'Pipe supports': ['pipe support', 'pipe supports', 'soportes', 'suportes de tuberia', 'suportes de tubagem', 'pijpondersteuning', 'supports de tuyauterie', 'rohrhalterungen', 'sostegni', 'suporturi', 'podpory', 'опори', 'опори за тръби'],
  'Valves': ['valves', 'valve installation', 'valvulas', 'kleppen', 'vannes', 'armaturen', 'valvole', 'vane', 'zawory', 'клапани', 'вентили'],
  'Bolting / Torque': ['torque', 'torque wrench', 'bolt tensioning', 'apriete controlado', 'par de apriete', 'aanspannen', 'koppel', 'couple', 'anzugsmoment', 'coppia', 'cuplu', 'dokrecanie', 'крутний момент', 'затягване'],
  'NDT awareness': ['ndt', 'non-destructive', 'non destructive testing', 'ensayos no destructivos', 'ensayo no destructivo', 'nao destrutivo', 'niet-destructief', 'essais non destructifs', 'zerstorungsfrei', 'prove non distruttive', 'incercari nedistructive', 'badania nieniszczace', 'неруйнівний контроль', 'неразрушаващ контрол'],
  'Grinding': ['grinding', 'grinder', 'esmerilado', 'amolado', 'rectificadora', 'slijpen', 'meulage', 'schleifen', 'molatura', 'polizor', 'szlifowanie', 'шліфування', 'шлайфане'],
  'Gas cutting': ['gas cutting', 'flame cutting', 'oxicorte', 'snijbrander', 'snijden', 'oxycoupage', 'autogeen', 'taglio autogeno', 'taiere autogena', 'ciecie', 'газове різання', 'газово рязане'],
  'Construction site experience': ['construction site', 'onsite', 'on site', 'en obra', 'chantier', 'baustelle', 'cantiere', 'santier', 'plac budowy', 'будівельний майданчик', 'строителна площадка'],
};

/**
 * Procesos de soldadura: nombres ISO 4063 / AWS / coloquiales.
 * Clave = etiqueta canónica, valores = variantes.
 */
export const WELDING_PROCESS_DICTIONARY: Readonly<Record<string, readonly string[]>> = {
  '111 (SMAW/MMA)': ['111', 'smaw', 'mma welding', 'arc welding', 'soldadura de arco', 'elektrisch lassen', "soudage a l'arc", 'lichtbogenschweissen', 'saldatura ad arco'],
  '136 (GMAW/MAG)': ['136', 'gmaw', 'mag', 'mag welding', 'soldadura mag', 'mag-lassen', 'soudage mag', 'mag-schweissen', 'saldatura mag', 'spawanie mag', 'маг-зварювання', 'маг заваряване'],
  '135 (MAG solid wire)': ['135', 'mag solid wire'],
  '141 (GTAW/TIG)': ['141', 'gtaw', 'tig', 'tig welding', 'soldadura tig', 'tig-lassen', 'soudage tig', 'tig-schweissen', 'saldatura tig', 'sudare tig', 'spawanie tig', 'тиг', 'зварювання tig', 'тиг заваряване', 'wig'],
  '131 (GMAW/MIG)': ['131', 'mig', 'mig welding', 'soldadura mig', 'mig-lassen', 'soudage mig', 'mig-schweissen', 'spawanie mig', 'міг', 'міг заваряване'],
  '138 (FCAW)': ['138', 'fcaw', 'flux cored', 'rutilo'],
  'Plasma cutting': ['plasma cutting', 'plasma', 'coupage plasma', 'plasmaschneiden', 'taglio al plasma', 'ciecie plazmowe', 'плазма'],
};

/**
 * Disciplinas piping/mechanical (ticket §2). Clave = etiqueta canónica.
 */
export const DISCIPLINE_DICTIONARY: Readonly<Record<string, readonly string[]>> = {
  'Piping': ['piping', 'tuberias', 'tubagens', 'leidingwerk', 'tuyauterie', 'rohrleitungen', 'tubazioni', 'tubulatura', 'rurociagi', 'трубопроводи', 'тръбопроводи'],
  'Mechanical': ['mechanical', 'mecanico', 'mecanica', 'mechanica', 'mecanique', 'mechanisch', 'meccanico', 'mecanic', 'mechaniczny', 'механічний', 'механичен'],
  'Structural': ['structural', 'estructura', 'estrutural', 'constructiewerk', 'charpente', 'stahlbau', 'strutture', 'structuri', 'konstrukcje', 'конструктивний', 'конструкционни'],
  'Maintenance': ['maintenance', 'mantenimiento', 'manutencao', 'onderhoud', 'instandhaltung', 'manutenzione', 'intretinere', 'utrzymanie ruchu', 'обслуговування', 'поддръжка'],
  'Installation': ['installation', 'instalacion', 'instalacao', 'installatie', 'installazione', 'instalare', 'instalacja', 'монтаж', 'інсталяція', 'инсталация'],
};

// ─── Certificaciones (siempre declared/unverified) ──────────────────────────

/**
 * Certificaciones habituales del sector. La extracción SOLO produce filas
 * declared/unverified; jamás is_verified=true (ticket §6).
 */
export const CERTIFICATION_DICTIONARY: readonly { canonical: string; patterns: readonly string[]; confidence: 'high' | 'medium' }[] = [
  { canonical: 'VCA (Veiligheidscertificaat voor Aannemers)', patterns: ['vca', 'vca basic', 'b-vca', 'veiligheidscertificaat', 'vca certificaat'], confidence: 'high' },
  { canonical: 'VCA-VOL', patterns: ['vca-vol', 'vca vol', 'vol-vca', 'vca volledig'], confidence: 'high' },
  { canonical: 'SCC (Safety Certificate Contractors)', patterns: ['scc', 'scc 018', 'scc certificaat', 'safety certificate contractors'], confidence: 'high' },
  { canonical: 'TIG 141 (ISO 9606-1)', patterns: ['tig 141', '141 tig', 'iso 9606-1 141', 'en iso 9606 141', 'lasser 141'], confidence: 'high' },
  { canonical: 'MIG/MAG 135/136 (ISO 9606-1)', patterns: ['mag 136', 'mig 131', '136 iso', 'iso 9606-1 136', 'iso 9606-1 135', '135 iso'], confidence: 'high' },
  { canonical: 'ISO 9606-1 Welder qualification', patterns: ['iso 9606', 'iso 9606-1', 'en iso 9606', 'en 287', 'en287'], confidence: 'high' },
  { canonical: 'ISO 15614 Welding procedure qualification', patterns: ['iso 15614', 'en iso 15614', 'welding procedure specification', 'wpqr'], confidence: 'medium' },
  { canonical: 'Flange training (EN 1591 / TA Lubricant)', patterns: ['flange training', 'flens training', 'bridas training', 'en 1591', 'ta lubricant', 'flensmontage training'], confidence: 'medium' },
  { canonical: 'Rigging certificate', patterns: ['rigging certificate', 'certificado de rigging', 'hijs certificaat', 'certificat de greage'], confidence: 'medium' },
  { canonical: 'LEEA', patterns: ['leea'], confidence: 'high' },
  { canonical: 'NEN 3140 (VP)', patterns: ['nen 3140', 'nen3140', 'vp gecertificeerd'], confidence: 'medium' },
  { canonical: 'NDT (VT/PT/MT/UT)', patterns: ['ndt certificate', 'visual testing', 'vt level', 'penetrant test', 'magnetic particle', 'ultrasonic testing', 'ndt certificaat'], confidence: 'medium' },
  { canonical: 'ASME IX', patterns: ['asme ix', 'asme 9', 'asme section ix'], confidence: 'high' },
  { canonical: '6G/6GR welder test', patterns: ['6g', '6gr'], confidence: 'medium' },
  { canonical: 'First aid / EHBO', patterns: ['first aid', 'ehbo', 'premiers secours', 'erste hilfe', 'erste hulp', 'primo soccorso'], confidence: 'medium' },
];

/**
 * Supresión de duplicados: si la clave (valor) fue detectada, la clave del
 * campo se elimina (la específica sustituye a la genérica).
 * Ej.: "VCA VOL" también matchea el patrón genérico "VCA": nos quedamos
 * solo con VCA-VOL.
 */
export const CERTIFICATION_SUPPRESS_WHEN: Readonly<Record<string, string>> = {
  'VCA (Veiligheidscertificaat voor Aannemers)': 'VCA-VOL',
  'ISO 9606-1 Welder qualification': 'TIG 141 (ISO 9606-1)',
};

// ─── Idiomas hablados ────────────────────────────────────────────────────────

/**
 * Idiomas que un candidato puede declarar hablar. Clave = nombre canónico EN
 * (el perfil los guarda como etiquetas canónicas).
 */
export const SPOKEN_LANGUAGE_DICTIONARY: Readonly<Record<string, readonly string[]>> = {
  'English': ['english', 'ingles', 'ingles', 'engels', 'anglais', 'englisch', 'inglese', 'engleza', 'angielski', 'англійська', 'английски'],
  'Spanish': ['spanish', 'espanol', 'castellano', 'espanhol', 'spaans', 'espagnol', 'spanisch', 'spagnolo', 'spaniola', 'hiszpanski', 'іспанська', 'испански'],
  'Portuguese': ['portuguese', 'portugues', 'portuguesa', 'portugees', 'portugais', 'portugiesisch', 'portoghese', 'portugheza', 'portugalski', 'португальська', 'португалски'],
  'Dutch': ['dutch', 'nederlands', 'neerlandes', 'holandes', 'nederlands', 'nederlandais', 'niederlandisch', 'olandese', 'neerlandeza', 'niderlandzki', 'нідерландська', 'нидерландски'],
  'German': ['german', 'aleman', 'alemao', 'duits', 'allemand', 'deutsch', 'tedesco', 'germana', 'niemiecki', 'німецька', 'немски'],
  'French': ['french', 'frances', 'francais', 'frans', 'franzosisch', 'francese', 'franceza', 'francuski', 'французька', 'френски'],
  'Italian': ['italian', 'italiano', 'italiaans', 'italien', 'italienisch', 'italiana', 'wloski', 'італійська', 'италиански'],
  'Romanian': ['romanian', 'rumano', 'rumaniisch', 'roumain', 'roman', 'rumunski', 'румунська', 'румънски'],
  'Polish': ['polish', 'polaco', 'pools', 'polonais', 'polnisch', 'polacco', 'polonez', 'polski', 'польська', 'полски'],
  'Ukrainian': ['ukrainian', 'ucraniano', 'ucraens', 'ukrainien', 'ukrainisch', 'ucraino', 'ucrainean', 'ukrainski', 'українська'],
  'Bulgarian': ['bulgarian', 'bulgaro', 'bulgaars', 'bulgare', 'bulgarisch', 'bulgar', 'bulgarski', 'болгарська', 'български'],
};

/** Marcadores de nivel hablado (CEFR + descriptores habituales). */
export const LANGUAGE_LEVEL_PATTERN =
  '\\b([abc][12])\\b|\\b(native|moedertaal|muttersprache|langue maternelle|madrelingua|limba materna|jezyk ojczysty|ридна мова|роден език|nativo|native speaker)\\b|\\b(fluent|vloeiend|courant|fliessend|fluente|biegly|вільно|свободно)\\b|\\b(intermediate|gevorderd|intermediaire|mittelstufe|intermedio|srednio|середній|средно)\\b|\\b(basic|basis|basique|grundkenntnisse|basico|podstawowy|базовий|основен)\\b';

// ─── Contacto ────────────────────────────────────────────────────────────────

export const EMAIL_PATTERN = '[a-z0-9._%+-]+@[a-z0-9.-]+\\.[a-z]{2,}';

/** Teléfono: 7-15 dígitos con separadores habituales en Europa. */
export const PHONE_PATTERN = '(?:\\+?[0-9][0-9 .()/-]{6,18}[0-9])';

/** Un candidato a teléfono que contenga esto es una fecha, no un número. */
export const PHONE_DATE_REJECT = /(\d{1,2}[/.-]\d{4})|((?:19|20)\d{2})|\s[-–—]\s/;

// ─── Fechas ─────────────────────────────────────────────────────────────────

/** Meses por idioma (se usan también para parseo de fecha). */
export const MONTH_NAMES: readonly string[] = [
  'january', 'february', 'march', 'april', 'may', 'june', 'july', 'august', 'september', 'october', 'november', 'december',
  'enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'setiembre', 'octubre', 'noviembre', 'diciembre',
  'janeiro', 'fevereiro', 'março', 'maio', 'junho', 'julho', 'setembro', 'outubro', 'novembro', 'dezembro',
  'januari', 'februari', 'maart', 'mei', 'augustus', 'oktober',
  'janvier', 'février', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre',
  'januar', 'februar', 'märz', 'juni', 'juli', 'oktober', 'dezember',
  'gennaio', 'febbraio', 'aprile', 'maggio', 'giugno', 'luglio', 'settembre', 'ottobre', 'novembre', 'dicembre',
  'ianuarie', 'februarie', 'martie', 'aprilie', 'iunie', 'iulie', 'septembrie', 'octombrie', 'noiembrie', 'decembrie',
  'styczeń', 'kwiecień', 'czerwiec', 'lipiec', 'sierpień', 'wrzesień', 'październik', 'listopad', 'grudzień',
  'січень', 'лютий', 'березень', 'квітень', 'травень', 'червень', 'липень', 'серпень', 'вересень', 'жовтень', 'листопад', 'грудень',
  'януари', 'февруари', 'април', 'май', 'юни', 'юли', 'август', 'септември', 'октомври', 'ноември', 'декември',
];

/** Marcadores de "presente" (fecha fin abierta), para el rango. */
export const CURRENT_JOB_ALT =
  'present|current|now|actualmente|actual|actualidad|atualmente|hoje|heden|aujourd.*|heute|derzeit|attuale|prezent|obecnie|тепер|донині|наш час|сьогодні|сега|момента';

/** Rango de fechas: MM/YYYY, MM-YYYY, YYYY, "Mon YYYY – Mon YYYY". */
export const DATE_RANGE_PATTERN =
  '((?:0?[1-9]|1[0-2])[/.-]\\d{4}|(?:19|20)\\d{2}|(?:' + MONTH_NAMES.join('|') + ')\\.?\\s*(?:19|20)?\\d{2}|\\d{1,2}\\s+(?:' + MONTH_NAMES.join('|') + ')\\.?\\s*(?:19|20)?\\d{2})\\s*(?:-|–|—|to|a|hasta|tot|jusqu|bis|fino|până|do|до|до)\\s*(' +
  '(?:0?[1-9]|1[0-2])[/.-]\\d{4}|(?:19|20)\\d{2}|(?:' + MONTH_NAMES.join('|') + ')\\.?\\s*(?:19|20)?\\d{2}|\\d{1,2}\\s+(?:' + MONTH_NAMES.join('|') + ')\\.?\\s*(?:19|20)?\\d{2}|' +
  CURRENT_JOB_ALT +
  ')';

// ─── Utilidades compartidas por el motor ─────────────────────────────────────

/**
 * Normaliza a minúsculas sin acentos latinos para matching de diccionario.
 * Se conservan los apóstrofos (francés "d'expérience") y el cirílico.
 */
export function normalizeForMatch(input: string): string {
  return input
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/ł/g, 'l')
    .replace(/[«»"“”„`]/g, '');
}
