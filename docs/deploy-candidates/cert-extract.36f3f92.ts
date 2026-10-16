// supabase/functions/cert-extract/index.ts
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// supabase/functions/_shared/cv-extraction/dictionaries.ts
var LANGUAGE_MARKERS = {
  es: ["experiencia", "formaci\xF3n", "idiomas", "disponibilidad", "a\xF1os", "empresa", "puesto", "soldador", "tubero", "disponible", "competencias", "resumen"],
  en: ["experience", "education", "skills", "languages", "availability", "years", "company", "position", "welder", "pipefitter", "available", "summary", "profile"],
  pt: ["experi\xEAncia", "forma\xE7\xE3o", "idiomas", "disponibilidade", "anos", "empresa", "fun\xE7\xE3o", "soldador", "dispon\xEDvel", "compet\xEAncias", "resumo"],
  nl: ["ervaring", "opleiding", "talen", "beschikbaarheid", "jaar", "bedrijf", "functie", "lasser", "pijpfitter", "beschikbaar", "vaardigheden", "profiel"],
  fr: ["exp\xE9rience", "formation", "langues", "disponibilit\xE9", "ans", "entreprise", "poste", "soudeur", "tuyauteur", "disponible", "comp\xE9tences", "r\xE9sum\xE9"],
  de: ["erfahrung", "ausbildung", "sprachen", "verf\xFCgbarkeit", "jahre", "unternehmen", "stelle", "schwei\xDFer", "rohrleitungsbauer", "verf\xFCgbar", "kenntnisse", "profil"],
  it: ["esperienza", "formazione", "lingue", "disponibilit\xE0", "anni", "azienda", "posizione", "saldatore", "tubista", "disponibile", "competenze", "profilo"],
  ro: ["experien\u021B\u0103", "experienta", "formare", "limbi", "disponibilitate", "ani", "companie", "func\u021Bie", "sudor", "instalator", "disponibil", "competen\u021Be"],
  pl: ["do\u015Bwiadczenie", "wykszta\u0142cenie", "j\u0119zyki", "dost\u0119pno\u015B\u0107", "lat", "firma", "stanowisko", "spawacz", "monter", "dost\u0119pny", "umiej\u0119tno\u015Bci", "podsumowanie"],
  uk: ["\u0434\u043E\u0441\u0432\u0456\u0434", "\u043E\u0441\u0432\u0456\u0442\u0430", "\u043C\u043E\u0432\u0438", "\u0434\u043E\u0441\u0442\u0443\u043F\u043D\u0456\u0441\u0442\u044C", "\u0440\u043E\u043A\u0456\u0432", "\u043A\u043E\u043C\u043F\u0430\u043D\u0456\u044F", "\u043F\u043E\u0441\u0430\u0434\u0430", "\u0437\u0432\u0430\u0440\u044E\u0432\u0430\u043B\u044C\u043D\u0438\u043A", "\u043C\u043E\u043D\u0442\u0430\u0436\u043D\u0438\u043A", "\u0434\u043E\u0441\u0442\u0443\u043F\u043D\u0438\u0439", "\u043D\u0430\u0432\u0438\u0447\u043A\u0438", "\u043F\u0440\u043E\u0444\u0456\u043B\u044C"],
  bg: ["\u043E\u043F\u0438\u0442", "\u043E\u0431\u0440\u0430\u0437\u043E\u0432\u0430\u043D\u0438\u0435", "\u0435\u0437\u0438\u0446\u0438", "\u043D\u0430\u043B\u0438\u0447\u043D\u043E\u0441\u0442", "\u0433\u043E\u0434\u0438\u043D\u0438", "\u0444\u0438\u0440\u043C\u0430", "\u0434\u043B\u044A\u0436\u043D\u043E\u0441\u0442", "\u0437\u0430\u0432\u0430\u0440\u0447\u0438\u043A", "\u043C\u043E\u043D\u0442\u0430\u0436\u043D\u0438\u043A", "\u043D\u0430\u043B\u0438\u0447\u0435\u043D", "\u0443\u043C\u0435\u043D\u0438\u044F", "\u043F\u0440\u043E\u0444\u0438\u043B"]
};
var SUMMARY_HEADINGS = [
  "professional summary",
  "professional profile",
  "summary",
  "profile",
  "about me",
  "resumen profesional",
  "perfil profesional",
  "sobre m\xED",
  "resumen",
  "resumo profissional",
  "resumo",
  "perfil",
  "professioneel profiel",
  "profiel",
  "samenvatting",
  "r\xE9sum\xE9 professionnel",
  "profil professionnel",
  "berufsprofil",
  "profilo professionale",
  "profilo",
  "sumar profesional",
  "podsumowanie zawodowe",
  "\u043F\u0440\u043E\u0444\u0435\u0441\u0456\u0439\u043D\u0438\u0439 \u043F\u0440\u043E\u0444\u0456\u043B\u044C",
  "\u043F\u0440\u043E \u043C\u0435\u043D\u0435",
  "\u043F\u0440\u043E\u0444\u0435\u0441\u0438\u043E\u043D\u0430\u043B\u0435\u043D \u043F\u0440\u043E\u0444\u0438\u043B"
];
var EXPERIENCE_HEADINGS = [
  "work experience",
  "professional experience",
  "employment history",
  "experience",
  "experiencia laboral",
  "experiencia profesional",
  "experiencia",
  "experi\xEAncia profissional",
  "experi\xEAncia",
  "werkervaring",
  "exp\xE9rience professionnelle",
  "exp\xE9rience",
  "berufserfahrung",
  "esperienza",
  "esperienza professionale",
  "experien\u021B\u0103 profesional\u0103",
  "experien\u021B\u0103",
  "do\u015Bwiadczenie zawodowe",
  "\u0434\u043E\u0441\u0432\u0456\u0434 \u0440\u043E\u0431\u043E\u0442\u0438",
  "\u043F\u0440\u043E\u0444\u0435\u0441\u0456\u0439\u043D\u0438\u0439 \u0434\u043E\u0441\u0432\u0456\u0434",
  "\u0442\u0440\u0443\u0434\u043E\u0432 \u043E\u043F\u0438\u0442",
  "\u043F\u0440\u043E\u0444\u0435\u0441\u0438\u043E\u043D\u0430\u043B\u0435\u043D \u043E\u043F\u0438\u0442"
];
var EDUCATION_HEADINGS = [
  "education",
  "educational background",
  "formaci\xF3n",
  "formaci\xF3n acad\xE9mica",
  "estudios",
  "forma\xE7\xE3o",
  "educa\xE7\xE3o",
  "opleiding",
  "opleidingen",
  "formation",
  "ausbildung",
  "istruzione",
  "educa\u021Bie",
  "formare",
  "wykszta\u0142cenie",
  "\u043E\u0441\u0432\u0456\u0442\u0430",
  "\u043E\u0431\u0440\u0430\u0437\u043E\u0432\u0430\u043D\u0438\u0435"
];
var LANGUAGES_HEADINGS = [
  "languages",
  "language skills",
  "idiomas",
  "l\xEDnguas",
  "talen",
  "langues",
  "sprachen",
  "lingue",
  "limbi",
  "j\u0119zyki",
  "\u043C\u043E\u0432\u0438",
  "\u0435\u0437\u0438\u0446\u0438"
];
var MONTH_NAMES = [
  "january",
  "february",
  "march",
  "april",
  "may",
  "june",
  "july",
  "august",
  "september",
  "october",
  "november",
  "december",
  "enero",
  "febrero",
  "marzo",
  "abril",
  "mayo",
  "junio",
  "julio",
  "agosto",
  "septiembre",
  "setiembre",
  "octubre",
  "noviembre",
  "diciembre",
  "janeiro",
  "fevereiro",
  "mar\xE7o",
  "maio",
  "junho",
  "julho",
  "setembro",
  "outubro",
  "novembro",
  "dezembro",
  "januari",
  "februari",
  "maart",
  "mei",
  "augustus",
  "oktober",
  "janvier",
  "f\xE9vrier",
  "avril",
  "mai",
  "juin",
  "juillet",
  "ao\xFBt",
  "septembre",
  "octobre",
  "novembre",
  "d\xE9cembre",
  "januar",
  "februar",
  "m\xE4rz",
  "juni",
  "juli",
  "oktober",
  "dezember",
  "gennaio",
  "febbraio",
  "aprile",
  "maggio",
  "giugno",
  "luglio",
  "settembre",
  "ottobre",
  "novembre",
  "dicembre",
  "ianuarie",
  "februarie",
  "martie",
  "aprilie",
  "iunie",
  "iulie",
  "septembrie",
  "octombrie",
  "noiembrie",
  "decembrie",
  "stycze\u0144",
  "kwiecie\u0144",
  "czerwiec",
  "lipiec",
  "sierpie\u0144",
  "wrzesie\u0144",
  "pa\u017Adziernik",
  "listopad",
  "grudzie\u0144",
  "\u0441\u0456\u0447\u0435\u043D\u044C",
  "\u043B\u044E\u0442\u0438\u0439",
  "\u0431\u0435\u0440\u0435\u0437\u0435\u043D\u044C",
  "\u043A\u0432\u0456\u0442\u0435\u043D\u044C",
  "\u0442\u0440\u0430\u0432\u0435\u043D\u044C",
  "\u0447\u0435\u0440\u0432\u0435\u043D\u044C",
  "\u043B\u0438\u043F\u0435\u043D\u044C",
  "\u0441\u0435\u0440\u043F\u0435\u043D\u044C",
  "\u0432\u0435\u0440\u0435\u0441\u0435\u043D\u044C",
  "\u0436\u043E\u0432\u0442\u0435\u043D\u044C",
  "\u043B\u0438\u0441\u0442\u043E\u043F\u0430\u0434",
  "\u0433\u0440\u0443\u0434\u0435\u043D\u044C",
  "\u044F\u043D\u0443\u0430\u0440\u0438",
  "\u0444\u0435\u0432\u0440\u0443\u0430\u0440\u0438",
  "\u0430\u043F\u0440\u0438\u043B",
  "\u043C\u0430\u0439",
  "\u044E\u043D\u0438",
  "\u044E\u043B\u0438",
  "\u0430\u0432\u0433\u0443\u0441\u0442",
  "\u0441\u0435\u043F\u0442\u0435\u043C\u0432\u0440\u0438",
  "\u043E\u043A\u0442\u043E\u043C\u0432\u0440\u0438",
  "\u043D\u043E\u0435\u043C\u0432\u0440\u0438",
  "\u0434\u0435\u043A\u0435\u043C\u0432\u0440\u0438"
];
var CURRENT_JOB_ALT = "present|current|now|actualmente|actual|actualidad|atualmente|hoje|heden|aujourd.*|heute|derzeit|attuale|prezent|obecnie|\u0442\u0435\u043F\u0435\u0440|\u0434\u043E\u043D\u0438\u043D\u0456|\u043D\u0430\u0448 \u0447\u0430\u0441|\u0441\u044C\u043E\u0433\u043E\u0434\u043D\u0456|\u0441\u0435\u0433\u0430|\u043C\u043E\u043C\u0435\u043D\u0442\u0430";
var DATE_RANGE_PATTERN = "((?:0?[1-9]|1[0-2])[/.-]\\d{4}|(?:19|20)\\d{2}|(?:" + MONTH_NAMES.join("|") + ")\\.?\\s*(?:19|20)?\\d{2}|\\d{1,2}\\s+(?:" + MONTH_NAMES.join("|") + ")\\.?\\s*(?:19|20)?\\d{2})\\s*(?:-|\u2013|\u2014|to|a|hasta|tot|jusqu|bis|fino|p\xE2n\u0103|do|\u0434\u043E|\u0434\u043E)\\s*((?:0?[1-9]|1[0-2])[/.-]\\d{4}|(?:19|20)\\d{2}|(?:" + MONTH_NAMES.join("|") + ")\\.?\\s*(?:19|20)?\\d{2}|\\d{1,2}\\s+(?:" + MONTH_NAMES.join("|") + ")\\.?\\s*(?:19|20)?\\d{2}|" + CURRENT_JOB_ALT + ")";
function normalizeForMatch(input) {
  return input.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/ł/g, "l").replace(/[«»"“”„`]/g, "");
}

// supabase/functions/_shared/cv-extraction/types.ts
var CV_LANGUAGES = [
  "en",
  "es",
  "pt",
  "nl",
  "fr",
  "de",
  "it",
  "ro",
  "pl",
  "uk",
  "bg"
];

// supabase/functions/_shared/cv-extraction/engine.ts
function detectLanguage(text) {
  const normalized = normalizeForMatch(text);
  let best = null;
  let bestScore = 0;
  for (const lang of CV_LANGUAGES) {
    let score = 0;
    for (const marker of LANGUAGE_MARKERS[lang]) {
      const count = normalized.split(normalizeForMatch(marker)).length - 1;
      if (count > 0) score += Math.min(count, 3);
    }
    if (score > bestScore) {
      bestScore = score;
      best = lang;
    }
  }
  return bestScore >= 2 ? best : null;
}
var DATE_RANGE_RE = new RegExp(DATE_RANGE_PATTERN, "i");
var CURRENT_RE = new RegExp("^(" + CURRENT_JOB_ALT + ")$", "i");
var ALL_HEADINGS = [
  ...SUMMARY_HEADINGS,
  ...EXPERIENCE_HEADINGS,
  ...EDUCATION_HEADINGS,
  ...LANGUAGES_HEADINGS
];
function parseCvDate(raw) {
  if (!raw) return null;
  const value = normalizeForMatch(raw.trim());
  if (CURRENT_RE.test(value)) return null;
  const MONTHS = {
    jan: "01",
    januar: "01",
    january: "01",
    januari: "01",
    janvier: "01",
    janeiro: "01",
    genn: "01",
    ian: "01",
    styc: "01",
    \u0441\u0456\u0447: "01",
    \u044F\u043D: "01",
    feb: "02",
    febru: "02",
    februar: "02",
    february: "02",
    fevrier: "02",
    fevereiro: "02",
    mar: "03",
    marzo: "03",
    march: "03",
    maart: "03",
    marto: "03",
    mars: "03",
    \u043C\u0430\u0440: "03",
    \u0431\u0435\u0440\u0435\u0437: "03",
    apr: "04",
    abril: "04",
    april: "04",
    avril: "04",
    may: "05",
    mayo: "05",
    mai: "05",
    magg: "05",
    maj: "05",
    \u0442\u0440\u0430\u0432: "05",
    jun: "06",
    junio: "06",
    june: "06",
    juni: "06",
    juin: "06",
    giugno: "06",
    czer: "06",
    \u0447\u0435\u0440\u0432: "06",
    jul: "07",
    julio: "07",
    july: "07",
    juli: "07",
    juillet: "07",
    luglio: "07",
    lipi: "07",
    \u043B\u0438\u043F: "07",
    aug: "08",
    agosto: "08",
    august: "08",
    augustus: "08",
    aou: "08",
    \u0441\u0435\u0440\u043F: "08",
    sep: "09",
    sept: "09",
    septiembre: "09",
    setiembre: "09",
    set: "09",
    setembro: "09",
    september: "09",
    settem: "09",
    wrzes: "09",
    \u0432\u0435\u0440\u0435: "09",
    \u0441\u0435\u043F\u0442: "09",
    oct: "10",
    octubre: "10",
    october: "10",
    outubro: "10",
    oktober: "10",
    octobre: "10",
    ottob: "10",
    ottobre: "10",
    pazio: "10",
    listop: "10",
    \u0436\u043E\u0432\u0442: "10",
    \u043E\u043A\u0442: "10",
    nov: "11",
    noviembre: "11",
    november: "11",
    novembro: "11",
    novembre: "11",
    novemb: "11",
    \u043B\u0438\u0441\u0442\u043E: "11",
    \u043D\u043E\u044F: "11",
    dec: "12",
    diciembre: "12",
    december: "12",
    dezembro: "12",
    d\u00E9cembre: "12",
    dezemb: "12",
    dezes: "12",
    grud: "12",
    \u0433\u0440\u0443\u0434: "12",
    \u0434\u0435\u043A: "12"
  };
  let m = value.match(/^(0?[1-9]|1[0-2])[/.-]((?:19|20)\d{2})$/);
  if (m) return `${m[2]}-${m[1].padStart(2, "0")}`;
  m = value.match(/^((?:19|20)\d{2})$/);
  if (m) return m[1];
  m = value.match(/^([a-zà-ÿ\u0400-\u04ff]{3,10})\.?\s*((?:19|20)\d{2})$/);
  if (m) {
    const mm = MONTHS[m[1].slice(0, 5)] ?? MONTHS[m[1].slice(0, 4)] ?? MONTHS[m[1].slice(0, 3)];
    return mm ? `${m[2]}-${mm}` : m[2];
  }
  m = value.match(/^\d{1,2}\s+([a-zà-ÿ\u0400-\u04ff]{3,10})\.?\s*((?:19|20)\d{2})$/);
  if (m) {
    const mm = MONTHS[m[1].slice(0, 5)] ?? MONTHS[m[1].slice(0, 4)] ?? MONTHS[m[1].slice(0, 3)];
    return mm ? `${m[2]}-${mm}` : m[2];
  }
  return null;
}

// supabase/functions/_shared/cv-extraction/certEngine.ts
var KNOWN_CERTIFICATIONS = {
  "VCA Basis": ["vca basis", "vca bas", "vca basic", "vca b\xE1sico", "vca b"],
  "VCA VOL": ["vca vol", "vca full"],
  "VCA VIL": ["vca vil"],
  "SCC": ["scc", "scc p", "scc pta"],
  "ISO 9606-1": ["iso 9606-1", "iso 9606", "une en iso 9606"],
  "EN 287-1": ["en 287-1", "en 287"],
  "ASME IX": ["asme ix", "asme section ix"],
  "TIG Welding (141)": ["tig 141", "141 tig", "gtaw 141"],
  "MIG/MAG Welding (135/136)": ["mig 135", "mag 135", "mig 136", "mag 136", "gmaw 135", "gmaw 136", "mig/mag"],
  "MMA Welding (111)": ["mma 111", "111 mma", "smaw 111", "electrode welding 111"],
  "Flange Fitting": ["flange", "flange fitting", "flange assembly", "bridas", "flens", "flansch"],
  "Confined Space Entry": ["confined space", "espacio confinado", "espacios confinados", "besloten ruimte", "engen r\xE4umen", "espace confin\xE9"],
  "Working at Height": ["working at height", "trabajos en altura", "werken op hoogte", "arbeiten in der h\xF6he", "travail en hauteur"],
  "Forklift Operator": ["forklift", "carretilla elevadora", "heftruck", "gabelstapler", "chariot \xE9l\xE9vateur"],
  "NDT VT Level 2": ["vt level 2", "visual testing level 2", "vt-2"],
  "NDT PT Level 2": ["pt level 2", "penetrant testing level 2", "pt-2"],
  "NDT MT Level 2": ["mt level 2", "magnetic particle level 2", "mt-2"],
  "NDT RT Level 2": ["rt level 2", "radiographic testing level 2", "rt-2"],
  "First Aid": ["first aid", "primeros auxilios", "ehbo", "erste hilfe", "premiers secours"],
  "Fire Watch": ["fire watch", "vigilante de incendios", "brandwacht", "feuerwache"]
};
var KNOWN_ISSUERS = [
  "t\xFCv",
  "tuv",
  "t\xFCv rheinland",
  "t\xFCv nord",
  "t\xFCv s\xFCd",
  "bureau veritas",
  "lloyd's register",
  "lloyds register",
  "dnv",
  "dnv gl",
  "sgs",
  "applus",
  "applus+",
  "dekra",
  "abs",
  "classnk",
  "vca infra",
  "vca.nl",
  "nil",
  "hobart",
  "twi",
  "kiwa",
  "stoomwezen",
  "aboma",
  "pbna",
  "arvabode"
];
var ISSUER_LABELS = [
  "issued by",
  "issuing organization",
  "issuing authority",
  "certified by",
  "awarded by",
  "accredited by",
  "emitido por",
  "expedido por",
  "otorgado por",
  "emisor",
  "entidad emisora",
  "organismo emisor",
  "uitgegeven door",
  "afgegeven door",
  "uitreikende instantie",
  "ausgestellt von",
  "aussteller",
  "zertifiziert durch",
  "pr\xFCfstelle",
  "\xE9mis par",
  "d\xE9livr\xE9 par",
  "organisme \xE9metteur",
  "attest\xE9 par",
  "emitido por",
  "emitente",
  "organismo emissor",
  "rilasciato da",
  "ente emittente",
  "organismo di certificazione",
  "emis de",
  "eliberat de",
  "organism emitent",
  "wydane przez",
  "wystawione przez",
  "jednostka certyfikuj\u0105ca",
  "\u0432\u0438\u0434\u0430\u043D\u043E",
  "\u0441\u0435\u0440\u0442\u0438\u0444\u0456\u043A\u043E\u0432\u0430\u043D\u043E",
  "\u0438\u0437\u0434\u0430\u0434\u0435\u043D \u043E\u0442",
  "\u0441\u0435\u0440\u0442\u0438\u0444\u0438\u0446\u0438\u0440\u0430\u0449 \u043E\u0440\u0433\u0430\u043D"
];
var CREDENTIAL_LABELS = [
  "certificate no",
  "certificate number",
  "cert. no",
  "cert no",
  "credential id",
  "credential number",
  "registration no",
  "registration number",
  "reg. no",
  "reg no",
  "licence no",
  "license no",
  "diploma no",
  "n\xBA de certificado",
  "n\xFAmero de certificado",
  "num. certificado",
  "n\xBA certificado",
  "numero de registro",
  "certificaatnummer",
  "certificaat nr",
  "registratienummer",
  "diplomanummer",
  "zertifikatsnummer",
  "zertifikat-nr",
  "urkundennummer",
  "registriernummer",
  "pr\xFCfungsnummer",
  "num\xE9ro de certificat",
  "n\xB0 de certificat",
  "num\xE9ro d'enregistrement",
  "r\xE9f\xE9rence",
  "n\xFAmero do certificado",
  "certificado n\xBA",
  "registo n\xBA",
  "numero del certificato",
  "certificato n",
  "numero di registrazione",
  "num\u0103r certificat",
  "nr. certificat",
  "num\u0103r de \xEEnregistrare",
  "numer certyfikatu",
  "nr certyfikatu",
  "numer rejestracyjny",
  "\u0441\u0435\u0440\u0442\u0438\u0444\u0456\u043A\u0430\u0442 \u2116",
  "\u043D\u043E\u043C\u0435\u0440 \u0441\u0435\u0440\u0442\u0438\u0444\u0456\u043A\u0430\u0442\u0430",
  "\u0441\u0435\u0440\u0442\u0438\u0444\u0438\u043A\u0430\u0442 \u2116",
  "\u043D\u043E\u043C\u0435\u0440 \u043D\u0430 \u0441\u0435\u0440\u0442\u0438\u0444\u0438\u043A\u0430\u0442"
];
var ISSUE_DATE_LABELS = [
  "issue date",
  "date of issue",
  "issued on",
  "issued",
  "date issued",
  "certification date",
  "examination date",
  "fecha de emisi\xF3n",
  "fecha emisi\xF3n",
  "emitido el",
  "expedido el",
  "fecha de expedici\xF3n",
  "fecha del examen",
  "uitgiftedatum",
  "datum van uitgifte",
  "afgegeven op",
  "behaald op",
  "ausstellungsdatum",
  "ausgestellt am",
  "ausgegeben am",
  "pr\xFCfungsdatum",
  "date d'\xE9mission",
  "date de d\xE9livrance",
  "\xE9mis le",
  "d\xE9livr\xE9 le",
  "date d'examen",
  "data de emiss\xE3o",
  "emitido em",
  "data do exame",
  "data di rilascio",
  "rilasciato il",
  "data dell'esame",
  "data emiterii",
  "emis la",
  "eliberat la",
  "data wydania",
  "wydany dnia",
  "data egzaminu",
  "\u0434\u0430\u0442\u0430 \u043D\u0430 \u0438\u0437\u0434\u0430\u0432\u0430\u043D\u0435",
  "\u0438\u0437\u0434\u0430\u0434\u0435\u043D \u043D\u0430"
];
var EXPIRY_DATE_LABELS = [
  "expiry date",
  "expiration date",
  "valid until",
  "valid thru",
  "valid through",
  "expires",
  "expiration",
  "date of expiry",
  "fecha de caducidad",
  "caduca el",
  "v\xE1lido hasta",
  "vigente hasta",
  "fecha de vencimiento",
  "vence el",
  "vervaldatum",
  "geldig tot",
  "verloopt op",
  "geldigheid tot",
  "g\xFCltig bis",
  "ablaufdatum",
  "verf\xE4llt am",
  "g\xFCltigkeit bis",
  "date d'expiration",
  "valable jusqu'au",
  "expire le",
  "date de validit\xE9",
  "data de validade",
  "v\xE1lido at\xE9",
  "expira em",
  "data de expira\xE7\xE3o",
  "data di scadenza",
  "valido fino al",
  "scade il",
  "data expir\u0103rii",
  "valabil p\xE2n\u0103 la",
  "expir\u0103 la",
  "data wa\u017Cno\u015Bci",
  "wa\u017Cny do",
  "wygasa",
  "\u0434\u0430\u0442\u0430 \u043D\u0430 \u0438\u0437\u0442\u0438\u0447\u0430\u043D\u0435",
  "\u0432\u0430\u043B\u0438\u0434\u0435\u043D \u0434\u043E"
];
var NO_EXPIRY_RE = /(?:no expiry|no expiration|unlimited validity|does not expire|sin caducidad|sin vencimiento|no caduca|onbeperkt geldig|geen vervaldatum|unbegrenzt gültig|kein ablaufdatum|sans expiration|validité illimitée|sem validade|sem data de expiração|senza scadenza|fără expirare|bezterminowo|без срок на валидност)/i;
function escapeRe(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
var WORD_CHAR = "a-z\xE0-\xFF\\u0100-\\u017f\\u0400-\\u04ff";
function hasVariant(normalizedText, variant) {
  const nv = normalizeForMatch(variant);
  if (!nv) return false;
  const pattern = /^\d/.test(nv) ? "(?:^|[^0-9])" + escapeRe(nv) + "(?![0-9])" : "(?:^|[^" + WORD_CHAR + "])" + escapeRe(nv) + "s?(?![" + WORD_CHAR + "])";
  return new RegExp(pattern).test(normalizedText);
}
function findLabeledValue(rawText, labels, valuePattern, maxValueLength) {
  const normalized = normalizeForMatch(rawText);
  let best = null;
  for (const label of labels) {
    const nl = escapeRe(normalizeForMatch(label));
    if (!nl) continue;
    const re = new RegExp(
      nl + "\\s*[:\\-\u2014\u2013]?\\s*\\n?\\s*(" + valuePattern.source + ")",
      "gi"
    );
    let m;
    while ((m = re.exec(normalized)) !== null) {
      const valueStart = m.index + m[0].length - m[1].length;
      const raw = rawText.slice(valueStart, valueStart + m[1].length).trim().replace(/\s+/g, " ");
      if (!raw || raw.length > maxValueLength) continue;
      if (!best) best = { value: raw, distance: 0 };
    }
  }
  return best;
}
var FULL_DATE_PATTERN = /(?:\d{4}[-/.]\d{1,2}[-/.]\d{1,2}|\d{1,2}[-/.]\d{1,2}[-/.]\d{4}|\d{1,2}\s+(?:de\s+)?[a-zà-ÿ]{3,10}\.?\s+(?:de\s+)?\d{4}|[a-zà-ÿ]{3,10}\.?\s+\d{1,2},?\s+\d{4})/i;
var CREDENTIAL_VALUE_PATTERN = /[A-Za-z0-9][A-Za-z0-9\-/. ]{2,28}[A-Za-z0-9]/;
function toIsoDate(raw) {
  const value = raw.trim();
  let m = value.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})$/);
  if (m) {
    const [, y, mo, d] = m;
    if (+mo >= 1 && +mo <= 12 && +d >= 1 && +d <= 31) {
      return { iso: `${y}-${mo.padStart(2, "0")}-${d.padStart(2, "0")}`, ambiguous: false };
    }
    return null;
  }
  m = value.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{4})$/);
  if (m) {
    const [, d, mo, y] = m;
    if (+mo < 1 || +mo > 12 || +d < 1 || +d > 31) return null;
    const ambiguous = +d <= 12;
    return { iso: `${y}-${mo.padStart(2, "0")}-${d.padStart(2, "0")}`, ambiguous };
  }
  const monthYear = parseCvDate(value.replace(/\bde\b/gi, " ").replace(/,/g, " ").replace(/\s+/g, " ").trim());
  if (monthYear && /^\d{4}-\d{2}$/.test(monthYear)) {
    const dayMatch = value.match(/\b(\d{1,2})\b/);
    if (dayMatch && +dayMatch[1] >= 1 && +dayMatch[1] <= 31) {
      return { iso: `${monthYear}-${dayMatch[1].padStart(2, "0")}`, ambiguous: false };
    }
    return null;
  }
  return null;
}
function extractCertificationName(rawText, normalized) {
  for (const [canonical, variants] of Object.entries(KNOWN_CERTIFICATIONS)) {
    for (const variant of variants) {
      if (hasVariant(normalized, variant)) return { value: canonical, confidence: "high" };
    }
  }
  const ofMatch = rawText.match(
    /(?:certificate of|certificado de|certificaat(?: van)?|zertifikat (?:über|für)|certificat(?: de| d')|certificado de|certificato di|certificat de|certyfikat)\s+([A-Za-z0-9][A-Za-z0-9 ()/+.,-]{2,60})/i
  );
  if (ofMatch) {
    const value = ofMatch[1].trim().replace(/[.,;]+$/, "");
    if (value.length >= 3) return { value, confidence: "medium" };
  }
  return null;
}
function extractIssuer(rawText, normalized) {
  const labeled = findLabeledValue(rawText, ISSUER_LABELS, /[A-Za-zÀ-ÿ0-9][A-Za-zÀ-ÿ0-9 &+.,()/-]{1,60}/, 60);
  if (labeled) return { value: labeled.value.replace(/[.,;]+$/, ""), confidence: "high" };
  for (const issuer of KNOWN_ISSUERS) {
    if (hasVariant(normalized, issuer)) {
      const re = new RegExp("(" + escapeRe(issuer).replace(/\\ /g, "\\s+") + ")", "i");
      const m = rawText.match(re);
      if (m) return { value: m[1].trim(), confidence: "medium" };
    }
  }
  return null;
}
function extractCredentialId(rawText) {
  const labeled = findLabeledValue(rawText, CREDENTIAL_LABELS, CREDENTIAL_VALUE_PATTERN, 30);
  if (!labeled) return null;
  const value = labeled.value.trim();
  if (!/\d/.test(value)) return null;
  return { value, confidence: "high" };
}
function extractDate(rawText, labels) {
  const labeled = findLabeledValue(rawText, labels, FULL_DATE_PATTERN, 40);
  if (!labeled) return null;
  const parsed = toIsoDate(labeled.value);
  if (!parsed) return null;
  return { value: parsed.iso, confidence: parsed.ambiguous ? "low" : "high" };
}
function extractCert(input) {
  const { text, sourceDocumentId } = input;
  const extractedAt = input.extractedAt ?? (/* @__PURE__ */ new Date()).toISOString();
  const normalized = normalizeForMatch(text);
  const language = detectLanguage(text);
  const fields = [];
  const push = (field, value, confidence) => {
    fields.push({
      field,
      value,
      source: "certificate_document",
      confidence,
      extracted_at: extractedAt,
      source_document_id: sourceDocumentId
    });
  };
  const name = extractCertificationName(text, normalized);
  if (name) push("certification_name", name.value, name.confidence);
  const issuer = extractIssuer(text, normalized);
  if (issuer) push("issuing_organization", issuer.value, issuer.confidence);
  const credential = extractCredentialId(text);
  if (credential) push("credential_id", credential.value, credential.confidence);
  const issueDate = extractDate(text, ISSUE_DATE_LABELS);
  let expiryDate = null;
  if (!NO_EXPIRY_RE.test(text)) {
    expiryDate = extractDate(text, EXPIRY_DATE_LABELS);
  }
  if (issueDate) {
    const today = (/* @__PURE__ */ new Date()).toISOString().slice(0, 10);
    if (issueDate.value > today) issueDate.confidence = "low";
  }
  if (issueDate && expiryDate && issueDate.value > expiryDate.value) {
    issueDate.confidence = "low";
    expiryDate.confidence = "low";
  }
  if (issueDate) push("issue_date", issueDate.value, issueDate.confidence);
  if (expiryDate) push("expiry_date", expiryDate.value, expiryDate.confidence);
  return { language, fields };
}

// supabase/functions/_shared/cv-extraction/textExtract.ts
var MAX_PDF_PAGES = 30;
var MAX_TEXT_CHARS = 2e5;
function isPdf(mime, bytes) {
  if (mime === "application/pdf") return true;
  return bytes.length > 4 && bytes[0] === 37 && bytes[1] === 80 && bytes[2] === 68 && bytes[3] === 70;
}
function isZipDocx(mime, bytes, fileName) {
  const nameOk = /\.docx$/i.test(fileName);
  const mimeOk = mime === "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
  const zipMagic = bytes.length > 3 && bytes[0] === 80 && bytes[1] === 75 && bytes[2] === 3 && bytes[3] === 4;
  return (nameOk || mimeOk) && zipMagic;
}
function isLegacyDoc(mime, fileName) {
  if (mime === "application/msword") return true;
  return /\.doc$/i.test(fileName);
}
async function extractText(bytes, mime, fileName) {
  try {
    if (isPdf(mime, bytes)) {
      return await extractPdfText(bytes);
    }
    if (isZipDocx(mime, bytes, fileName)) {
      return await extractDocxText(bytes);
    }
    if (isLegacyDoc(mime, fileName)) {
      return { ok: false, error: "unsupported_legacy_doc" };
    }
    return { ok: false, error: "unsupported_mime" };
  } catch {
    return { ok: false, error: "text_extraction_error" };
  }
}
async function extractPdfText(bytes) {
  const { getDocument } = await import("npm:pdfjs-dist@4.2.67/legacy/build/pdf.mjs");
  const pdf = await getDocument({
    data: bytes,
    useSystemFonts: true,
    // Sin worker: runtime edge sin Web Worker disponible.
    isEvalSupported: false,
    disableFontFace: true
  }).promise;
  const pageCount = Math.min(pdf.numPages, MAX_PDF_PAGES);
  const pageTexts = [];
  for (let i = 1; i <= pageCount; i++) {
    const page = await pdf.getPage(i);
    const content = await page.getTextContent();
    let line = "";
    const lines = [];
    for (const item of content.items) {
      if (typeof item.str !== "string") continue;
      line += item.str;
      if (item.hasEOL) {
        lines.push(line);
        line = "";
      }
    }
    if (line) lines.push(line);
    pageTexts.push(lines.join("\n"));
  }
  const text = pageTexts.join("\n").slice(0, MAX_TEXT_CHARS);
  if (text.replace(/\s/g, "").length < 40) {
    return { ok: false, error: "no_extractable_text" };
  }
  return { ok: true, text, method: "native_text", pages: pageCount };
}
async function extractDocxText(bytes) {
  const JSZip = (await import("npm:jszip@3.10.1")).default;
  const zip = await JSZip.loadAsync(bytes);
  const doc = zip.file("word/document.xml");
  if (!doc) return { ok: false, error: "no_extractable_text" };
  const xml = await doc.async("string");
  const text = xml.replace(/<w:tab[^>]*\/>/g, "	").replace(/<w:br[^>]*\/>/g, "\n").replace(/<\/w:p>/g, "\n").replace(/<[^>]+>/g, "").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&amp;/g, "&").replace(/[ \t]+/g, " ").replace(/\n{3,}/g, "\n\n").trim().slice(0, MAX_TEXT_CHARS);
  if (text.replace(/\s/g, "").length < 40) {
    return { ok: false, error: "no_extractable_text" };
  }
  return { ok: true, text, method: "docx_xml" };
}
async function sha256Hex(bytes) {
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

// supabase/functions/cert-extract/index.ts
var corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS"
};
var DRAFTS_TABLE = "app_cert_extraction_drafts";
var EVENTS_TABLE = "app_cert_extraction_events";
var CERTS_TABLE = "app_worker_certifications";
var ALLOWED_CERT_BUCKETS = ["app_14da0f1941_certificates"];
var CERT_ERROR_CODES = [
  "no_extractable_text",
  "unsupported_mime",
  "text_extraction_error",
  "engine_error",
  "storage_read_error"
];
function json(obj, status = 200) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" }
  });
}
function log(fields) {
  const allowed = [
    "fn",
    "event",
    "status",
    "error_code",
    "draft_id",
    "correlation_id",
    "fields_count",
    "linked_existing",
    "attempt"
  ];
  const safe = Object.fromEntries(
    allowed.filter((k) => fields[k] !== void 0).map((k) => [k, fields[k]])
  );
  console.log(JSON.stringify({ ts: (/* @__PURE__ */ new Date()).toISOString(), ...safe }));
}
async function emitEvent(supabase, userId, eventType, extra = {}) {
  try {
    await supabase.from(EVENTS_TABLE).insert({ user_id: userId, event_type: eventType, ...extra });
  } catch (e) {
    log({ event: "metric_insert_error", error_code: String(e).slice(0, 60) });
  }
}
function isKnownErrorCode(code) {
  return CERT_ERROR_CODES.includes(code);
}
async function findUnequivocalCertMatch(supabase, userId, certName) {
  const target = certName.trim().toLowerCase();
  if (!target) return null;
  const { data, error } = await supabase.from(CERTS_TABLE).select("id, certification_name").eq("user_id", userId);
  if (error || !data) return null;
  const matches = data.filter(
    (c) => (c.certification_name ?? "").trim().toLowerCase() === target
  );
  return matches.length === 1 ? matches[0].id : null;
}
Deno.serve(async (req) => {
  const correlationId = crypto.randomUUID();
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);
  const supabaseUrl = Deno.env.get("SUPABASE_URL") || "";
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
  if (!supabaseUrl || !serviceKey) {
    return json({ error: "missing_env" }, 500);
  }
  const authHeader = req.headers.get("authorization") || "";
  if (!authHeader.startsWith("Bearer ")) return json({ error: "unauthorized" }, 401);
  const bearer = authHeader.slice("Bearer ".length);
  const serviceClient = createClient(supabaseUrl, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false }
  });
  const { data: { user }, error: userError } = await serviceClient.auth.getUser(bearer);
  if (userError || !user) return json({ error: "unauthorized" }, 401);
  const userId = user.id;
  let body = {};
  try {
    const parsed = await req.json();
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      body = parsed;
    }
  } catch {
  }
  const bucket = typeof body.storage_bucket === "string" ? body.storage_bucket : null;
  const path = typeof body.storage_path === "string" ? body.storage_path : null;
  if (!bucket || !path) {
    return json({ error: "invalid_request", reason: "storage_bucket and storage_path are required" }, 400);
  }
  if (!ALLOWED_CERT_BUCKETS.includes(bucket) || !path.startsWith(`${userId}/`)) {
    return json({ error: "invalid_request", reason: "bucket or path outside the user namespace" }, 400);
  }
  const { data: fileData, error: downloadError } = await serviceClient.storage.from(bucket).download(path);
  if (downloadError || !fileData) {
    log({ fn: "cert-extract", event: "storage_read_failed", correlation_id: correlationId });
    return json({ error: "storage_read_error" }, 502);
  }
  const bytes = new Uint8Array(await fileData.arrayBuffer());
  const hash = await sha256Hex(bytes);
  const fileName = path.split("/").pop() || "certificate";
  const mimeType = fileData.type || null;
  const { data: existing } = await serviceClient.from(DRAFTS_TABLE).select("id, extraction_status, attempt_count").eq("user_id", userId).eq("doc_sha256", hash).maybeSingle();
  if (existing && (existing.extraction_status === "pending_review" || existing.extraction_status === "review_confirmed" || existing.extraction_status === "dismissed")) {
    await emitEvent(serviceClient, userId, "cert_already_processed", { draft_id: existing.id });
    log({ fn: "cert-extract", event: "already_processed", draft_id: existing.id, correlation_id: correlationId });
    return json({ status: "already_processed", draft_id: existing.id, extraction_status: existing.extraction_status });
  }
  await emitEvent(serviceClient, userId, "cert_extraction_started", {});
  let draftId;
  let attempt;
  let isRetry = false;
  if (existing && existing.extraction_status === "extraction_failed") {
    draftId = existing.id;
    attempt = existing.attempt_count + 1;
    isRetry = true;
    await emitEvent(serviceClient, userId, "cert_extraction_retried", { draft_id: draftId, attempt });
  } else {
    draftId = crypto.randomUUID();
    attempt = 1;
  }
  const textResult = await extractText(bytes, mimeType, fileName);
  const draftPayload = (status, extra) => ({
    id: draftId,
    user_id: userId,
    doc_sha256: hash,
    storage_bucket: bucket,
    storage_path: path,
    file_name: fileName,
    mime_type: mimeType,
    attempt_count: attempt,
    extraction_status: status,
    ...extra
  });
  const upsertDraft = async (payload) => {
    const { error } = await serviceClient.from(DRAFTS_TABLE).upsert(payload, { onConflict: "user_id,doc_sha256" });
    if (error) {
      log({ fn: "cert-extract", event: "draft_write_failed", correlation_id: correlationId });
      throw new Error("draft_write_failed");
    }
  };
  if (!textResult.ok) {
    const errorCode = isKnownErrorCode(textResult.error) ? textResult.error : "text_extraction_error";
    await upsertDraft(
      draftPayload("extraction_failed", {
        error_code: errorCode,
        extraction_method: "unavailable",
        extracted_fields: [],
        linked_certification_id: null
      })
    );
    await emitEvent(serviceClient, userId, "cert_extraction_failed", { draft_id: draftId });
    log({ fn: "cert-extract", event: "extraction_failed", error_code: errorCode, draft_id: draftId, correlation_id: correlationId });
    return json({
      status: "extraction_failed",
      draft_id: draftId,
      error_code: errorCode,
      retry_supported: true
    });
  }
  const result = extractCert({
    text: textResult.text,
    sourceDocumentId: draftId,
    extractedAt: (/* @__PURE__ */ new Date()).toISOString()
  });
  const extractedName = result.fields.find((f) => f.field === "certification_name")?.value ?? null;
  const linkedId = extractedName ? await findUnequivocalCertMatch(serviceClient, userId, extractedName) : null;
  await upsertDraft(
    draftPayload("pending_review", {
      error_code: null,
      extraction_method: "native_text",
      reviewed_at: null,
      extracted_fields: result.fields,
      linked_certification_id: linkedId
    })
  );
  await emitEvent(serviceClient, userId, "cert_extraction_completed", {
    draft_id: draftId,
    fields_extracted_count: result.fields.length,
    linked_existing: linkedId !== null
  });
  log({
    fn: "cert-extract",
    event: "extraction_completed",
    draft_id: draftId,
    fields_count: result.fields.length,
    linked_existing: linkedId !== null,
    attempt,
    correlation_id: correlationId
  });
  return json({
    status: isRetry ? "retried" : "completed",
    draft_id: draftId,
    extraction_status: "pending_review",
    language: result.language,
    fields_count: result.fields.length,
    linked_certification_id: linkedId
  });
});
