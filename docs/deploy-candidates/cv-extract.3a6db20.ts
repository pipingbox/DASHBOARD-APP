// cv-extract/index.ts
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// _shared/cv-extraction/dictionaries.ts
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
var FULL_NAME_LABELS = [
  "full name",
  "name",
  "nombre completo",
  "nombre",
  "nome completo",
  "nome",
  "naam",
  "nom",
  "imi\u0119 i nazwisko",
  "nume complet",
  "nume",
  "\u0456\u043C'\u044F \u0442\u0430 \u043F\u0440\u0456\u0437\u0432\u0438\u0449\u0435",
  "\u0456\u043C'\u044F",
  "\u043F\u0440\u0456\u0437\u0432\u0438\u0449\u0435",
  "\u0438\u043C\u0435",
  "\u0438\u043C\u0435 \u0438 \u0444\u0430\u043C\u0438\u043B\u0438\u044F"
];
var TITLE_LABELS = [
  "title",
  "professional title",
  "job title",
  "position",
  "profession",
  "puesto",
  "t\xEDtulo",
  "profesi\xF3n",
  "cargo",
  "fun\xE7\xE3o",
  "t\xEDtulo profissional",
  "functie",
  "titel",
  "beruf",
  "stellenbezeichnung",
  "posizione",
  "titolo",
  "func\u021Bie",
  "titlu",
  "stanowisko",
  "\u043F\u043E\u0441\u0430\u0434\u0430",
  "\u0434\u043B\u044A\u0436\u043D\u043E\u0441\u0442"
];
var LOCATION_LABELS = [
  "location",
  "based in",
  "residence",
  "ubicaci\xF3n",
  "localizaci\xF3n",
  "domicilio",
  "localidade",
  "localiza\xE7\xE3o",
  "resid\xEAncia",
  "woonplaats",
  "locatie",
  "lieu",
  "domicile",
  "ort",
  "wohnort",
  "sede",
  "loca\u021Bie",
  "localizare",
  "lokalizacja",
  "\u043C\u0456\u0441\u0446\u0435",
  "\u043C\u0456\u0441\u0442\u043E",
  "\u043B\u043E\u043A\u0430\u0446\u0456\u044F",
  "\u043C\u0435\u0441\u0442\u043E\u043F\u043E\u043B\u043E\u0436\u0435\u043D\u0438\u0435",
  "\u0433\u0440\u0430\u0434"
];
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
var EMPLOYER_LABELS = [
  "employer",
  "company",
  "company name",
  "empresa",
  "compa\xF1\xEDa",
  "werkgever",
  "bedrijf",
  "employeur",
  "entreprise",
  "arbeitgeber",
  "unternehmen",
  "azienda",
  "angajator",
  "companie",
  "pracodawca",
  "firma",
  "\u0440\u043E\u0431\u043E\u0442\u043E\u0434\u0430\u0432\u0435\u0446\u044C",
  "\u043A\u043E\u043C\u043F\u0430\u043D\u0456\u044F",
  "\u0440\u0430\u0431\u043E\u0442\u043E\u0434\u0430\u0442\u0435\u043B"
];
var POSITION_LABELS = [
  "position",
  "role",
  "job title",
  "puesto",
  "cargo",
  "rol",
  "fun\xE7\xE3o",
  "functie",
  "poste",
  "stelle",
  "posizione",
  "ruolo",
  "func\u021Bie",
  "stanowisko",
  "\u043F\u043E\u0441\u0430\u0434\u0430",
  "\u0440\u043E\u043B\u044C",
  "\u0434\u043B\u044A\u0436\u043D\u043E\u0441\u0442"
];
var AVAILABILITY_PATTERNS = [
  { pattern: "available\\s+(?:immediately|at short notice)", value: "immediately" },
  { pattern: "immediately available", value: "immediately" },
  { pattern: "disponible\\s+(?:inmediatamente|de inmediato|ya)", value: "immediately" },
  { pattern: "disponivel\\s+(?:imediatamente|de imediato)", value: "immediately" },
  { pattern: "beschikbaar\\s+per\\s+direct", value: "immediately" },
  { pattern: "disponible\\s+immediatement", value: "immediately" },
  { pattern: "disponible\\s+immediatamente", value: "immediately" },
  { pattern: "verfugbar\\s+(?:ab sofort|unmittelbar)", value: "immediately" },
  { pattern: "dostepny\\s+(?:natychmiast|od zaraz)", value: "immediately" },
  { pattern: "\u0434\u043E\u0441\u0442\u0443\u043F\u043D\u0438\u0439\\s+\u043D\u0435\u0433\u0430\u0439\u043D\u043E", value: "immediately" },
  { pattern: "\u043D\u0430\\s+\u0440\u0430\u0437\u043F\u043E\u043B\u043E\u0436\u0435\u043D\u0438\u0435\\s+\u043D\u0435\u0437\u0430\u0431\u0430\u0432\u043D\u043E", value: "immediately" },
  // Con fecha: "available from 01/2025", "disponible desde...", etc.
  { pattern: "available\\s+from\\s+((?:\\d{1,2}[/.-]\\d{2,4})|(?:\\d{4}))", value: "from_date" },
  { pattern: "disponible\\s+desde\\s+((?:\\d{1,2}[/.-]\\d{2,4})|(?:\\d{4}))", value: "from_date" },
  { pattern: "beschikbaar\\s+per\\s+((?:\\d{1,2}[/.-]\\d{2,4})|(?:\\d{4}))", value: "from_date" },
  { pattern: "disponivel\\s+a\\s+partir\\s+de\\s+((?:\\d{1,2}[/.-]\\d{2,4})|(?:\\d{4}))", value: "from_date" }
];
var WILLING_TO_TRAVEL_PATTERNS = [
  "willing to travel",
  "willing to work abroad",
  "available for assignments abroad",
  "disponible para viajar",
  "disponibilidad para viajar",
  "movilidad internacional",
  "disposto a viajar",
  "disponivel para viajar",
  "bereid te reizen",
  "inzetbaar in het buitenland",
  "pret a voyager",
  "disponible pour voyager",
  "mobilite internationale",
  "reisebereit",
  "reisebereitschaft",
  "disponibile a viaggiare",
  "disponibil pentru deplasari",
  "gotowy do wyjazdow",
  "dost\u0119pny do wyjazd\xF3w",
  "\u0433\u043E\u0442\u043E\u0432\u0438\u0439 \u0434\u043E \u0432\u0456\u0434\u0440\u044F\u0434\u0436\u0435\u043D\u044C",
  "\u0433\u043E\u0442\u043E\u0432\u0438\u0439 \u0434\u043E \u043F\u043E\u0457\u0437\u0434\u043E\u043A",
  "\u0433\u043E\u0442\u043E\u0432 \u0437\u0430 \u043F\u044A\u0442\u0443\u0432\u0430\u043D\u0438\u044F",
  "\u0433\u043E\u0442\u043E\u0432\u043D\u043E\u0441\u0442 \u0437\u0430 \u043F\u044A\u0442\u0443\u0432\u0430\u043D\u0435"
];
var WILLING_TO_RELOCATE_PATTERNS = [
  "willing to relocate",
  "open to relocation",
  "ready to relocate",
  "disponible para reubicarse",
  "dispuesto a mudarse",
  "disponibilidad para reubicarse",
  "disposto a mudar-se",
  "disponivel para realocacao",
  "bereid te verhuizen",
  "open voor verhuizen",
  "pret a demenager",
  "ouvert a la mobilite",
  "umzugsbereit",
  "bereitschaft umzuziehen",
  "disponibile al trasferimento",
  "disponibil pentru relocare",
  "gotowy do przeprowadzki",
  "\u0433\u043E\u0442\u043E\u0432\u0438\u0439 \u0434\u043E \u043F\u0435\u0440\u0435\u0457\u0437\u0434\u0443",
  "\u0433\u043E\u0442\u043E\u0432 \u0437\u0430 \u043F\u0440\u0435\u043C\u0435\u0441\u0442\u0432\u0430\u043D\u0435"
];
var SKILL_DICTIONARY = {
  "Pipefitting": ["pipefitting", "pipefit", "pipe fitter", "pipefitter", "tuberia", "tubero", "montador de tuberias", "montaje de tuberias", "montagem de tubagens", "tubista", "pijpfitten", "pijpfitter", "tuyauteur", "montage de tuyauterie", "rohrleitungsbau", "rohrleitungsbauer", "instalator de tubulatura", "montaj tevi", "montaz rur", "\u043C\u043E\u043D\u0442\u0430\u0436 \u0442\u0440\u0443\u0431\u043E\u043F\u0440\u043E\u0432\u043E\u0434\u0456\u0432", "\u0442\u0440\u0443\u0431\u043E\u043F\u0440\u043E\u0432\u043E\u0434\u0447\u0438\u043A", "\u043C\u043E\u043D\u0442\u0430\u0436 \u0442\u0440\u044A\u0431\u043E\u043F\u0440\u043E\u0432\u043E\u0434\u0438"],
  "Pipe fabrication": ["pipe fabrication", "pipefab", "fabricacion de tuberias", "fabricacao de tubagens", "pijpfabricage", "fabrication de tuyauteries", "rohrfertigung", "fabricazione di tubazioni", "prefabricare tubulatura", "prefabrykacja rurociagow", "\u0432\u0438\u0440\u043E\u0431\u043D\u0438\u0446\u0442\u0432\u043E \u0442\u0440\u0443\u0431\u043E\u043F\u0440\u043E\u0432\u043E\u0434\u0456\u0432", "\u0438\u0437\u0440\u0430\u0431\u043E\u0442\u043A\u0430 \u0442\u0440\u044A\u0431\u043E\u043F\u0440\u043E\u0432\u043E\u0434\u0438"],
  "Welding": ["welding", "welder", "soldadura", "soldador", "soldagem", "lassen", "lasser", "soudage", "soudeur", "schweissen", "schweizer", "saldatura", "saldatore", "sudare", "sudor", "spawanie", "spawacz", "\u0437\u0432\u0430\u0440\u044E\u0432\u0430\u043D\u043D\u044F", "\u0437\u0432\u0430\u0440\u044E\u0432\u0430\u043B\u044C\u043D\u0438\u043A", "\u0437\u0430\u0432\u0430\u0440\u044F\u0432\u0430\u043D\u0435", "\u0437\u0430\u0432\u0430\u0440\u0447\u0438\u043A"],
  "Mechanical fitting": ["mechanical fitter", "mechanical fitting", "fitter", "mechanical installation", "montaje mecanico", "montador mecanico", "montagem mecanica", "mechanisch monteur", "monteur", "montage mecanique", "monteur mecanique", "mechanische montage", "montaggio meccanico", "montaj mecanic", "montaz mechaniczny", "\u043C\u0435\u0445\u0430\u043D\u0456\u0447\u043D\u0438\u0439 \u043C\u043E\u043D\u0442\u0430\u0436", "\u043C\u0435\u0445\u0430\u043D\u0438\u0447\u0435\u043D \u043C\u043E\u043D\u0442\u0430\u0436"],
  "Boilermaking / Plating": ["boilermaker", "plater", "boilermaking", "plating", "caldereria", "calderero", "caldeiraria", "caldeireiro", "plaatwerk", "constructiebankwerker", "chaudronnerie", "chaudronnier", "kesselbau", "kotlarz", "\u043A\u043E\u043D\u0441\u0442\u0440\u0443\u043A\u0446\u0456\u0439\u043D\u0456 \u0440\u043E\u0431\u043E\u0442\u0438", "\u043A\u043E\u0442\u043B\u044F\u0440\u0441\u0442\u0432\u043E", "\u043A\u043E\u0442\u0435\u043B\u043E\u0441\u0442\u0440\u043E\u0435\u043D\u0435"],
  "Isometric drawing reading": ["isometric", "isometrics", "isometricos", "lectura de isometricos", "isometrische tekeningen", "isometrique", "isometrisch", "izometric", "rysunek izometryczny", "\u0456\u0437\u043E\u043C\u0435\u0442\u0440\u0438\u0447\u043D\u0456 \u043A\u0440\u0435\u0441\u043B\u0435\u043D\u043D\u044F", "\u0438\u0437\u043E\u043C\u0435\u0442\u0440\u0438\u0447\u043D\u0438 \u0447\u0435\u0440\u0442\u0435\u0436\u0438"],
  "P&ID reading": ["p&id", "p&ids", "planos p&id", "p&id lezen", "lecture de p&id", "p&id lesen", "czytanie p&id", "\u0447\u0438\u0442\u0430\u043D\u043D\u044F p&id"],
  "Blueprint reading": ["blueprint reading", "blueprint", "lectura de planos", "tekening lezen", "lecture de plans", "zeichnungslesen", "lettura disegni", "czytanie rysunkow", "\u0447\u0438\u0442\u0430\u043D\u043D\u044F \u043A\u0440\u0435\u0441\u043B\u0435\u043D\u044C", "\u0447\u0435\u0442\u0435\u043D\u0435 \u043D\u0430 \u0447\u0435\u0440\u0442\u0435\u0436\u0438"],
  "Rigging": ["rigging", "rigger", "aparejador", "armador de cargas", "aparelhagem", "hijseen", "greage", "\u0442\u0430\u043A\u0435\u043B\u0430\u0436", "\u0442\u0430\u043A\u0435\u043B\u0430\u0436\u043D\u0438\u043A", "\u0440\u0438\u0433\u0438\u043D\u0433"],
  "Scaffolding": ["scaffolding", "scaffolder", "andamios", "andamiero", "andaimes", "steigerbouw", "echafaudage", "gerustbau", "impalcature", "schelarie", "rusztowania", "pinage", "\u0440\u0438\u0433\u0443\u0432\u0430\u043D\u043D\u044F", "\u0441\u043A\u0435\u043B\u0435\u0442\u0430", "\u043F\u043E\u0434\u043C\u043E\u0441\u0442\u0438", "\u043B\u0435\u0438"],
  "Shutdown / Turnaround": ["shutdown", "turnaround", "tar work", "parada de planta", "shutdowns", "stops", "revisions", "stillstande", "fermate", "oprire", "przeglady", "\u0437\u0443\u043F\u0438\u043D\u043A\u0438", "\u0440\u0435\u043C\u043E\u043D\u0442\u0438"],
  "Pressure testing": ["pressure test", "pressure testing", "hydrotest", "prueba de presion", "pruebas de presion", "teste de pressao", "druktest", "drukproef", "essai de pression", "druckprufung", "prova di pressione", "teste de presiune", "proba cisnieniowa", "\u0432\u0438\u043F\u0440\u043E\u0431\u0443\u0432\u0430\u043D\u043D\u044F \u0442\u0438\u0441\u043A\u043E\u043C", "\u0445\u0438\u0434\u0440\u043E\u0442\u0435\u0441\u0442", "\u0445\u0438\u0434\u0440\u0430\u0432\u043B\u0438\u0447\u0435\u043D \u0442\u0435\u0441\u0442"],
  "Flange assembly": ["flange", "flanges", "bridas", "flenzen", "brides", "flansche", "flanse", "flanse", "kolnierze", "\u0444\u043B\u0430\u043D\u0446\u0456", "\u0444\u043B\u0430\u043D\u0446\u0438"],
  "Pipe supports": ["pipe support", "pipe supports", "soportes", "suportes de tuberia", "suportes de tubagem", "pijpondersteuning", "supports de tuyauterie", "rohrhalterungen", "sostegni", "suporturi", "podpory", "\u043E\u043F\u043E\u0440\u0438", "\u043E\u043F\u043E\u0440\u0438 \u0437\u0430 \u0442\u0440\u044A\u0431\u0438"],
  "Valves": ["valves", "valve installation", "valvulas", "kleppen", "vannes", "armaturen", "valvole", "vane", "zawory", "\u043A\u043B\u0430\u043F\u0430\u043D\u0438", "\u0432\u0435\u043D\u0442\u0438\u043B\u0438"],
  "Bolting / Torque": ["torque", "torque wrench", "bolt tensioning", "apriete controlado", "par de apriete", "aanspannen", "koppel", "couple", "anzugsmoment", "coppia", "cuplu", "dokrecanie", "\u043A\u0440\u0443\u0442\u043D\u0438\u0439 \u043C\u043E\u043C\u0435\u043D\u0442", "\u0437\u0430\u0442\u044F\u0433\u0432\u0430\u043D\u0435"],
  "NDT awareness": ["ndt", "non-destructive", "non destructive testing", "ensayos no destructivos", "ensayo no destructivo", "nao destrutivo", "niet-destructief", "essais non destructifs", "zerstorungsfrei", "prove non distruttive", "incercari nedistructive", "badania nieniszczace", "\u043D\u0435\u0440\u0443\u0439\u043D\u0456\u0432\u043D\u0438\u0439 \u043A\u043E\u043D\u0442\u0440\u043E\u043B\u044C", "\u043D\u0435\u0440\u0430\u0437\u0440\u0443\u0448\u0430\u0432\u0430\u0449 \u043A\u043E\u043D\u0442\u0440\u043E\u043B"],
  "Grinding": ["grinding", "grinder", "esmerilado", "amolado", "rectificadora", "slijpen", "meulage", "schleifen", "molatura", "polizor", "szlifowanie", "\u0448\u043B\u0456\u0444\u0443\u0432\u0430\u043D\u043D\u044F", "\u0448\u043B\u0430\u0439\u0444\u0430\u043D\u0435"],
  "Gas cutting": ["gas cutting", "flame cutting", "oxicorte", "snijbrander", "snijden", "oxycoupage", "autogeen", "taglio autogeno", "taiere autogena", "ciecie", "\u0433\u0430\u0437\u043E\u0432\u0435 \u0440\u0456\u0437\u0430\u043D\u043D\u044F", "\u0433\u0430\u0437\u043E\u0432\u043E \u0440\u044F\u0437\u0430\u043D\u0435"],
  "Construction site experience": ["construction site", "onsite", "on site", "en obra", "chantier", "baustelle", "cantiere", "santier", "plac budowy", "\u0431\u0443\u0434\u0456\u0432\u0435\u043B\u044C\u043D\u0438\u0439 \u043C\u0430\u0439\u0434\u0430\u043D\u0447\u0438\u043A", "\u0441\u0442\u0440\u043E\u0438\u0442\u0435\u043B\u043D\u0430 \u043F\u043B\u043E\u0449\u0430\u0434\u043A\u0430"]
};
var WELDING_PROCESS_DICTIONARY = {
  "111 (SMAW/MMA)": ["111", "smaw", "mma welding", "arc welding", "soldadura de arco", "elektrisch lassen", "soudage a l'arc", "lichtbogenschweissen", "saldatura ad arco"],
  "136 (GMAW/MAG)": ["136", "gmaw", "mag", "mag welding", "soldadura mag", "mag-lassen", "soudage mag", "mag-schweissen", "saldatura mag", "spawanie mag", "\u043C\u0430\u0433-\u0437\u0432\u0430\u0440\u044E\u0432\u0430\u043D\u043D\u044F", "\u043C\u0430\u0433 \u0437\u0430\u0432\u0430\u0440\u044F\u0432\u0430\u043D\u0435"],
  "135 (MAG solid wire)": ["135", "mag solid wire"],
  "141 (GTAW/TIG)": ["141", "gtaw", "tig", "tig welding", "soldadura tig", "tig-lassen", "soudage tig", "tig-schweissen", "saldatura tig", "sudare tig", "spawanie tig", "\u0442\u0438\u0433", "\u0437\u0432\u0430\u0440\u044E\u0432\u0430\u043D\u043D\u044F tig", "\u0442\u0438\u0433 \u0437\u0430\u0432\u0430\u0440\u044F\u0432\u0430\u043D\u0435", "wig"],
  "131 (GMAW/MIG)": ["131", "mig", "mig welding", "soldadura mig", "mig-lassen", "soudage mig", "mig-schweissen", "spawanie mig", "\u043C\u0456\u0433", "\u043C\u0456\u0433 \u0437\u0430\u0432\u0430\u0440\u044F\u0432\u0430\u043D\u0435"],
  "138 (FCAW)": ["138", "fcaw", "flux cored", "rutilo"],
  "Plasma cutting": ["plasma cutting", "plasma", "coupage plasma", "plasmaschneiden", "taglio al plasma", "ciecie plazmowe", "\u043F\u043B\u0430\u0437\u043C\u0430"]
};
var DISCIPLINE_DICTIONARY = {
  "Piping": ["piping", "tuberias", "tubagens", "leidingwerk", "tuyauterie", "rohrleitungen", "tubazioni", "tubulatura", "rurociagi", "\u0442\u0440\u0443\u0431\u043E\u043F\u0440\u043E\u0432\u043E\u0434\u0438", "\u0442\u0440\u044A\u0431\u043E\u043F\u0440\u043E\u0432\u043E\u0434\u0438"],
  "Mechanical": ["mechanical", "mecanico", "mecanica", "mechanica", "mecanique", "mechanisch", "meccanico", "mecanic", "mechaniczny", "\u043C\u0435\u0445\u0430\u043D\u0456\u0447\u043D\u0438\u0439", "\u043C\u0435\u0445\u0430\u043D\u0438\u0447\u0435\u043D"],
  "Structural": ["structural", "estructura", "estrutural", "constructiewerk", "charpente", "stahlbau", "strutture", "structuri", "konstrukcje", "\u043A\u043E\u043D\u0441\u0442\u0440\u0443\u043A\u0442\u0438\u0432\u043D\u0438\u0439", "\u043A\u043E\u043D\u0441\u0442\u0440\u0443\u043A\u0446\u0438\u043E\u043D\u043D\u0438"],
  "Maintenance": ["maintenance", "mantenimiento", "manutencao", "onderhoud", "instandhaltung", "manutenzione", "intretinere", "utrzymanie ruchu", "\u043E\u0431\u0441\u043B\u0443\u0433\u043E\u0432\u0443\u0432\u0430\u043D\u043D\u044F", "\u043F\u043E\u0434\u0434\u0440\u044A\u0436\u043A\u0430"],
  "Installation": ["installation", "instalacion", "instalacao", "installatie", "installazione", "instalare", "instalacja", "\u043C\u043E\u043D\u0442\u0430\u0436", "\u0456\u043D\u0441\u0442\u0430\u043B\u044F\u0446\u0456\u044F", "\u0438\u043D\u0441\u0442\u0430\u043B\u0430\u0446\u0438\u044F"]
};
var CERTIFICATION_DICTIONARY = [
  { canonical: "VCA (Veiligheidscertificaat voor Aannemers)", patterns: ["vca", "vca basic", "b-vca", "veiligheidscertificaat", "vca certificaat"], confidence: "high" },
  { canonical: "VCA-VOL", patterns: ["vca-vol", "vca vol", "vol-vca", "vca volledig"], confidence: "high" },
  { canonical: "SCC (Safety Certificate Contractors)", patterns: ["scc", "scc 018", "scc certificaat", "safety certificate contractors"], confidence: "high" },
  { canonical: "TIG 141 (ISO 9606-1)", patterns: ["tig 141", "141 tig", "iso 9606-1 141", "en iso 9606 141", "lasser 141"], confidence: "high" },
  { canonical: "MIG/MAG 135/136 (ISO 9606-1)", patterns: ["mag 136", "mig 131", "136 iso", "iso 9606-1 136", "iso 9606-1 135", "135 iso"], confidence: "high" },
  { canonical: "ISO 9606-1 Welder qualification", patterns: ["iso 9606", "iso 9606-1", "en iso 9606", "en 287", "en287"], confidence: "high" },
  { canonical: "ISO 15614 Welding procedure qualification", patterns: ["iso 15614", "en iso 15614", "welding procedure specification", "wpqr"], confidence: "medium" },
  { canonical: "Flange training (EN 1591 / TA Lubricant)", patterns: ["flange training", "flens training", "bridas training", "en 1591", "ta lubricant", "flensmontage training"], confidence: "medium" },
  { canonical: "Rigging certificate", patterns: ["rigging certificate", "certificado de rigging", "hijs certificaat", "certificat de greage"], confidence: "medium" },
  { canonical: "LEEA", patterns: ["leea"], confidence: "high" },
  { canonical: "NEN 3140 (VP)", patterns: ["nen 3140", "nen3140", "vp gecertificeerd"], confidence: "medium" },
  { canonical: "NDT (VT/PT/MT/UT)", patterns: ["ndt certificate", "visual testing", "vt level", "penetrant test", "magnetic particle", "ultrasonic testing", "ndt certificaat"], confidence: "medium" },
  { canonical: "ASME IX", patterns: ["asme ix", "asme 9", "asme section ix"], confidence: "high" },
  { canonical: "6G/6GR welder test", patterns: ["6g", "6gr"], confidence: "medium" },
  { canonical: "First aid / EHBO", patterns: ["first aid", "ehbo", "premiers secours", "erste hilfe", "erste hulp", "primo soccorso"], confidence: "medium" }
];
var CERTIFICATION_SUPPRESS_WHEN = {
  "VCA (Veiligheidscertificaat voor Aannemers)": "VCA-VOL",
  "ISO 9606-1 Welder qualification": "TIG 141 (ISO 9606-1)"
};
var SPOKEN_LANGUAGE_DICTIONARY = {
  "English": ["english", "ingles", "ingles", "engels", "anglais", "englisch", "inglese", "engleza", "angielski", "\u0430\u043D\u0433\u043B\u0456\u0439\u0441\u044C\u043A\u0430", "\u0430\u043D\u0433\u043B\u0438\u0439\u0441\u043A\u0438"],
  "Spanish": ["spanish", "espanol", "castellano", "espanhol", "spaans", "espagnol", "spanisch", "spagnolo", "spaniola", "hiszpanski", "\u0456\u0441\u043F\u0430\u043D\u0441\u044C\u043A\u0430", "\u0438\u0441\u043F\u0430\u043D\u0441\u043A\u0438"],
  "Portuguese": ["portuguese", "portugues", "portuguesa", "portugees", "portugais", "portugiesisch", "portoghese", "portugheza", "portugalski", "\u043F\u043E\u0440\u0442\u0443\u0433\u0430\u043B\u044C\u0441\u044C\u043A\u0430", "\u043F\u043E\u0440\u0442\u0443\u0433\u0430\u043B\u0441\u043A\u0438"],
  "Dutch": ["dutch", "nederlands", "neerlandes", "holandes", "nederlands", "nederlandais", "niederlandisch", "olandese", "neerlandeza", "niderlandzki", "\u043D\u0456\u0434\u0435\u0440\u043B\u0430\u043D\u0434\u0441\u044C\u043A\u0430", "\u043D\u0438\u0434\u0435\u0440\u043B\u0430\u043D\u0434\u0441\u043A\u0438"],
  "German": ["german", "aleman", "alemao", "duits", "allemand", "deutsch", "tedesco", "germana", "niemiecki", "\u043D\u0456\u043C\u0435\u0446\u044C\u043A\u0430", "\u043D\u0435\u043C\u0441\u043A\u0438"],
  "French": ["french", "frances", "francais", "frans", "franzosisch", "francese", "franceza", "francuski", "\u0444\u0440\u0430\u043D\u0446\u0443\u0437\u044C\u043A\u0430", "\u0444\u0440\u0435\u043D\u0441\u043A\u0438"],
  "Italian": ["italian", "italiano", "italiaans", "italien", "italienisch", "italiana", "wloski", "\u0456\u0442\u0430\u043B\u0456\u0439\u0441\u044C\u043A\u0430", "\u0438\u0442\u0430\u043B\u0438\u0430\u043D\u0441\u043A\u0438"],
  "Romanian": ["romanian", "rumano", "rumaniisch", "roumain", "roman", "rumunski", "\u0440\u0443\u043C\u0443\u043D\u0441\u044C\u043A\u0430", "\u0440\u0443\u043C\u044A\u043D\u0441\u043A\u0438"],
  "Polish": ["polish", "polaco", "pools", "polonais", "polnisch", "polacco", "polonez", "polski", "\u043F\u043E\u043B\u044C\u0441\u044C\u043A\u0430", "\u043F\u043E\u043B\u0441\u043A\u0438"],
  "Ukrainian": ["ukrainian", "ucraniano", "ucraens", "ukrainien", "ukrainisch", "ucraino", "ucrainean", "ukrainski", "\u0443\u043A\u0440\u0430\u0457\u043D\u0441\u044C\u043A\u0430"],
  "Bulgarian": ["bulgarian", "bulgaro", "bulgaars", "bulgare", "bulgarisch", "bulgar", "bulgarski", "\u0431\u043E\u043B\u0433\u0430\u0440\u0441\u044C\u043A\u0430", "\u0431\u044A\u043B\u0433\u0430\u0440\u0441\u043A\u0438"]
};
var LANGUAGE_LEVEL_PATTERN = "\\b([abc][12])\\b|\\b(native|moedertaal|muttersprache|langue maternelle|madrelingua|limba materna|jezyk ojczysty|\u0440\u0438\u0434\u043D\u0430 \u043C\u043E\u0432\u0430|\u0440\u043E\u0434\u0435\u043D \u0435\u0437\u0438\u043A|nativo|native speaker)\\b|\\b(fluent|vloeiend|courant|fliessend|fluente|biegly|\u0432\u0456\u043B\u044C\u043D\u043E|\u0441\u0432\u043E\u0431\u043E\u0434\u043D\u043E)\\b|\\b(intermediate|gevorderd|intermediaire|mittelstufe|intermedio|srednio|\u0441\u0435\u0440\u0435\u0434\u043D\u0456\u0439|\u0441\u0440\u0435\u0434\u043D\u043E)\\b|\\b(basic|basis|basique|grundkenntnisse|basico|podstawowy|\u0431\u0430\u0437\u043E\u0432\u0438\u0439|\u043E\u0441\u043D\u043E\u0432\u0435\u043D)\\b";
var EMAIL_PATTERN = "[a-z0-9._%+-]+@[a-z0-9.-]+\\.[a-z]{2,}";
var PHONE_PATTERN = "(?:\\+?[0-9][0-9 .()/-]{6,18}[0-9])";
var PHONE_DATE_REJECT = /(\d{1,2}[/.-]\d{4})|((?:19|20)\d{2})|\s[-–—]\s/;
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

// _shared/cv-extraction/types.ts
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
var CV_EXTRACTION_ERROR_CODES = [
  "no_extractable_text",
  "unsupported_legacy_doc",
  "unsupported_mime",
  "text_extraction_error",
  "engine_error",
  "storage_read_error"
];

// _shared/cv-extraction/engine.ts
function prepareLines(text) {
  const raw = text.replace(/\r\n?/g, "\n").split("\n").map((l) => l.replace(/[ \t]+/g, " ").trim());
  return { raw, normalized: raw.map(normalizeForMatch) };
}
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
function escapeRe(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
var DATE_RANGE_RE = new RegExp(DATE_RANGE_PATTERN, "i");
var CURRENT_RE = new RegExp("^(" + CURRENT_JOB_ALT + ")$", "i");
function dateRangeAtLineStart(line) {
  const m = DATE_RANGE_RE.exec(line);
  return !!m && (m.index ?? 0) <= 4;
}
function isAnyHeading(normalizedLine) {
  if (!normalizedLine || normalizedLine.length > 60) return false;
  const bare = normalizedLine.replace(/[:•\-–—|]+$/g, "").trim();
  return ALL_HEADINGS.some((h) => {
    const nh = normalizeForMatch(h);
    return bare === nh || bare === nh + "s";
  });
}
function matchesHeading(normalizedLine, headings) {
  if (!normalizedLine || normalizedLine.length > 60) return false;
  const bare = normalizedLine.replace(/[:•\-–—|]+$/g, "").trim();
  return headings.some((h) => {
    const nh = normalizeForMatch(h);
    return bare === nh || bare === nh + "s" || bare.endsWith(":") && bare.slice(0, -1) === nh;
  });
}
var ALL_HEADINGS = [
  ...SUMMARY_HEADINGS,
  ...EXPERIENCE_HEADINGS,
  ...EDUCATION_HEADINGS,
  ...LANGUAGES_HEADINGS
];
function sectionLines(lines, headings, maxLines = 8) {
  const idx = lines.normalized.findIndex((l) => matchesHeading(l, headings));
  if (idx === -1) return null;
  const out = [];
  for (let i = idx + 1; i < lines.raw.length && out.length < maxLines; i++) {
    const raw = lines.raw[i];
    if (!raw) continue;
    if (isAnyHeading(lines.normalized[i]) || dateRangeAtLineStart(raw)) break;
    out.push(raw);
  }
  return out.length ? out : null;
}
function extractLabeled(lines, labels) {
  for (let i = 0; i < lines.normalized.length; i++) {
    const line = lines.normalized[i];
    for (const label of labels) {
      const nl2 = normalizeForMatch(label);
      const m = line.match(new RegExp("^" + escapeRe(nl2) + "\\s*[:\u2022\\-\u2013\u2014|]\\s*(.+)$"));
      if (m && m[1].trim().length > 0 && m[1].trim().length <= 90) {
        return { value: stripLabel(lines.raw[i]), lineIdx: i };
      }
    }
  }
  return null;
}
function stripLabel(raw) {
  const m = raw.match(/^[^:•|]{1,40}[:•|]\s*(.*)$/);
  if (m && m[1].trim()) return m[1].trim();
  const m2 = raw.match(/^\s*[A-Za-zÀ-ÿ\u0100-\u017F\u0400-\u04FF][^\-–—]{1,30}\s+[-–—]\s+(.*)$/);
  return m2 && m2[1].trim() ? m2[1].trim() : raw.trim();
}
function field(ctx, name, value, confidence) {
  return {
    field: name,
    value,
    source: "cv",
    confidence,
    extracted_at: ctx.now,
    source_document_id: ctx.sourceDocumentId
  };
}
var NAME_STOPWORDS = /curriculum|vitae|resume|cv|profile|perfil|address|direccion|telefon|phone|email|correo|experiencia|experience|erfahrung/i;
function looksLikeName(candidate) {
  const value = candidate.trim();
  if (!value || value.length > 64 || value.length < 3) return false;
  if (/\d|@|https?:|www\.|\//.test(value)) return false;
  if (NAME_STOPWORDS.test(value)) return false;
  const words = value.split(/\s+/);
  if (words.length < 2 || words.length > 4) return false;
  return words.every((w) => /^[A-ZÀ-ÿ\u0100-\u017F\u0400-\u04FF][a-zà-ÿ\u0100-\u017F\u0400-\u04FF'-]*$/i.test(w));
}
function extractFullName(lines) {
  const labeled = extractLabeled(lines, FULL_NAME_LABELS);
  if (labeled && looksLikeName(labeled.value)) {
    return { value: labeled.value, confidence: "high" };
  }
  const first = lines.raw.find((l) => l.length > 0);
  if (first && looksLikeName(first)) {
    return { value: first, confidence: "low" };
  }
  return null;
}
function extractEmail(text) {
  const m = text.toLowerCase().match(new RegExp(EMAIL_PATTERN));
  return m ? m[0] : null;
}
function extractPhone(lines) {
  const head = lines.raw.slice(0, 15).join("\n");
  const re = new RegExp(PHONE_PATTERN, "g");
  let m;
  while ((m = re.exec(head)) !== null) {
    const candidate = m[0].trim();
    const digits = candidate.replace(/\D/g, "");
    if (digits.length >= 7 && digits.length <= 15 && !PHONE_DATE_REJECT.test(candidate)) {
      return candidate;
    }
  }
  return null;
}
var YEARS_EXPERIENCE_AFTER = "(\\d{1,2})\\s*\\+?\\s*(?:years?|yrs?|jaar|jaren|jahre|jahren|anos?|ans|ann[\xE9e]es|annees|anni|ani|lat|lata|\u0440\u043E\u043A\u0438|\u0440\u043E\u043A\u0456\u0432|\u0433\u043E\u0434\u0438\u043D\u0438|\u0433)?\\s*(?:of\\s+|de\\s+|di\\s+|d['\u2019]?\\s*)?(?:experience|experiencia|ervaring|erfahrung|esperienza|experienta|doswiadczenia|doswiadczenie|dosvidu|\u0434\u043E\u0441\u0432\u0456\u0434\u0443|\u0434\u043E\u0441\u0432\u0456\u0434|\u043E\u043F\u0438\u0442)";
var YEARS_EXPERIENCE_BEFORE = "(?:experience|experiencia|ervaring|erfahrung|esperienza|experienta|doswiadczenia|doswiadczenie|dosvidu|\u0434\u043E\u0441\u0432\u0456\u0434\u0443|\u0434\u043E\u0441\u0432\u0456\u0434|\u043E\u043F\u0438\u0442)\\s*[:-\u2013\u2014]?\\s*(\\d{1,2})\\s*\\+?\\s*(?:years?|yrs?|jaar|jaren|jahre|jahren|anos?|ans|anni|ani|lat|lata|\u0440\u043E\u043A\u0438|\u0440\u043E\u043A\u0456\u0432|\u0433\u043E\u0434\u0438\u043D\u0438|\u0433)";
function extractYearsExperience(normalizedText) {
  for (const pattern of [YEARS_EXPERIENCE_AFTER, YEARS_EXPERIENCE_BEFORE]) {
    const m = normalizedText.match(new RegExp(pattern));
    if (!m) continue;
    const years = parseInt(m[1] ?? "", 10);
    if (Number.isFinite(years) && years > 0 && years <= 60) return years;
  }
  return null;
}
var WORD_CHAR = "a-z\xE0-\xFF\\u0100-\\u017f\\u0400-\\u04ff";
function matchDictionary(normalizedText, dictionary) {
  const found = [];
  for (const [canonical, variants] of Object.entries(dictionary)) {
    for (const variant of variants) {
      const nv = normalizeForMatch(variant);
      if (!nv) continue;
      const pattern = /^\d/.test(nv) ? "(?:^|[^0-9])" + escapeRe(nv) + "(?![0-9])" : "(?:^|[^" + WORD_CHAR + "])" + escapeRe(nv) + "s?(?![" + WORD_CHAR + "])";
      if (new RegExp(pattern).test(normalizedText)) {
        found.push(canonical);
        break;
      }
    }
  }
  return found;
}
function matchSpoken(normalizedText) {
  const found = [];
  for (const [canonical, variants] of Object.entries(SPOKEN_LANGUAGE_DICTIONARY)) {
    for (const variant of variants) {
      const nv = normalizeForMatch(variant);
      if (new RegExp("(?:^|[^" + WORD_CHAR + "])" + escapeRe(nv) + "(?![" + WORD_CHAR + "])").test(normalizedText)) {
        found.push(canonical);
        break;
      }
    }
  }
  return found;
}
function extractSpokenLanguages(lines) {
  const section = sectionLines(lines, LANGUAGES_HEADINGS, 6);
  if (section) {
    const found = matchSpoken(normalizeForMatch(section.join("\n")));
    if (found.length) return { values: found, confidence: "high" };
  }
  const levelRe = new RegExp(LANGUAGE_LEVEL_PATTERN, "i");
  for (let i = 0; i < lines.normalized.length; i++) {
    const line = lines.normalized[i];
    if (line.includes(":") && levelRe.test(line)) {
      const found = matchSpoken(line);
      if (found.length) return { values: found, confidence: "medium" };
    }
  }
  return null;
}
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
function findSectionBounds(lines) {
  const expIdx = lines.normalized.findIndex((l) => matchesHeading(l, EXPERIENCE_HEADINGS));
  if (expIdx === -1) return { start: 0, end: lines.raw.length - 1 };
  let end = lines.raw.length - 1;
  for (let i = expIdx + 1; i < lines.normalized.length; i++) {
    if (isAnyHeading(lines.normalized[i])) {
      end = i - 1;
      break;
    }
  }
  return { start: expIdx + 1, end };
}
function findDateRanges(lines, bounds) {
  const ranges = [];
  for (let i = bounds.start; i <= bounds.end; i++) {
    const line = lines.raw[i];
    if (!line || line.length > 120) continue;
    const m = line.match(DATE_RANGE_RE);
    if (m && (m.index ?? 0) <= 4) {
      ranges.push({
        lineIdx: i,
        startRaw: m[1],
        endRaw: m[2] ?? null,
        currently: !!m[2] && CURRENT_RE.test(m[2].trim())
      });
    }
  }
  return ranges;
}
function splitRoleCompany(candidate) {
  const value = candidate.trim();
  if (!value) return { position: "", company: "" };
  const parts = value.split(/\s+[—–|]\s+|\s+-\s+|,\s+/).map((p) => p.trim()).filter(Boolean);
  if (parts.length >= 2) {
    return { position: parts[0].slice(0, 100), company: parts.slice(1).join(", ").slice(0, 100) };
  }
  const looksLikeRole = matchDictionary(normalizeForMatch(value), SKILL_DICTIONARY).length > 0;
  return looksLikeRole ? { position: value.slice(0, 100), company: "" } : { position: "", company: value.slice(0, 100) };
}
function extractExperiences(lines) {
  const bounds = findSectionBounds(lines);
  const ranges = findDateRanges(lines, bounds);
  const experiences = [];
  let seq = 1;
  for (let r = 0; r < ranges.length; r++) {
    const range = ranges[r];
    const nextRange = ranges[r + 1];
    let position = "";
    let company = "";
    let labeled = false;
    const labelScanEnd = Math.min(bounds.end, range.lineIdx + 3);
    for (let i = Math.max(bounds.start, range.lineIdx - 3); i <= labelScanEnd; i++) {
      const nl2 = lines.normalized[i];
      for (const label of EMPLOYER_LABELS) {
        const m = nl2.match(new RegExp("^" + escapeRe(normalizeForMatch(label)) + "\\s*[:\u2022\\-\u2013\u2014|]\\s*(.+)$"));
        if (m && !company) {
          company = stripLabel(lines.raw[i]).slice(0, 100);
          labeled = true;
        }
      }
      for (const label of POSITION_LABELS) {
        const m = nl2.match(new RegExp("^" + escapeRe(normalizeForMatch(label)) + "\\s*[:\u2022\\-\u2013\u2014|]\\s*(.+)$"));
        if (m && !position) {
          position = stripLabel(lines.raw[i]).slice(0, 100);
          labeled = true;
        }
      }
    }
    const candidates = [];
    const dateLineRemainder = lines.raw[range.lineIdx].replace(new RegExp(DATE_RANGE_PATTERN, "gi"), "").replace(/^[\s,|.\-–—]+|[\s,|.\-–—]+$/g, "");
    if (dateLineRemainder) candidates.push(dateLineRemainder);
    const aboveIdx = range.lineIdx - 1;
    if (aboveIdx >= bounds.start) {
      const above = lines.raw[aboveIdx];
      if (above && above.length <= 100 && !dateRangeAtLineStart(above) && !isAnyHeading(lines.normalized[aboveIdx])) {
        candidates.push(above);
      }
    }
    for (const cand of candidates) {
      const parts = splitRoleCompany(cand);
      if (!position && parts.position) position = parts.position;
      if (!company && parts.company) company = parts.company;
    }
    const description = [];
    const descEnd = Math.min(
      bounds.end,
      range.lineIdx + 8,
      nextRange ? nextRange.lineIdx - 2 : bounds.end
    );
    for (let i = range.lineIdx + 1; i <= descEnd; i++) {
      const raw = lines.raw[i];
      if (!raw || dateRangeAtLineStart(raw) || isAnyHeading(lines.normalized[i])) continue;
      const nr = normalizeForMatch(raw);
      if (nr === normalizeForMatch(position) || nr === normalizeForMatch(company)) continue;
      description.push(raw);
    }
    const start = parseCvDate(range.startRaw);
    const end = range.currently ? null : parseCvDate(range.endRaw);
    const hasCore = position && position.length >= 2 || company && company.length >= 2;
    const hasAnyDate = !!start || !!end || range.currently;
    if (!hasCore || !hasAnyDate) continue;
    const confidence = labeled ? "high" : position && company && start && (end || range.currently) ? "medium" : "low";
    experiences.push({
      local_id: "exp-" + seq++,
      company_name: company,
      position,
      project_name: null,
      city_region: null,
      country: null,
      start_date: start,
      end_date: end,
      currently_working: range.currently,
      description_original: description.length ? description.join("\n").slice(0, 2e3) : null,
      confidence
    });
  }
  return experiences;
}
function extractEducation(lines) {
  const section = sectionLines(lines, EDUCATION_HEADINGS, 4);
  if (!section) return null;
  const cleaned = section.filter((l) => !dateRangeAtLineStart(l)).map((l) => l.replace(/^[•\-–*]\s*/, "").trim()).filter(Boolean).slice(0, 3);
  if (!cleaned.length) return null;
  return cleaned.join("\n").slice(0, 500);
}
function extractCertifications(normalizedText) {
  const out = [];
  let seq = 1;
  for (const entry of CERTIFICATION_DICTIONARY) {
    for (const pattern of entry.patterns) {
      const np = normalizeForMatch(pattern);
      const re = /^\d/.test(np) ? "(?:^|[^0-9a-z])" + escapeRe(np) + "(?![0-9])" : "(?:^|[^" + WORD_CHAR + "])" + escapeRe(np) + "(?![" + WORD_CHAR + "])";
      if (new RegExp(re).test(normalizedText)) {
        out.push({ local_id: "cert-" + seq++, name: entry.canonical, confidence: entry.confidence });
        break;
      }
    }
  }
  return out.filter((c) => {
    const specific = CERTIFICATION_SUPPRESS_WHEN[c.name];
    return !specific || !out.some((o) => o.name === specific);
  });
}
function extractAvailability(normalizedText) {
  for (const { pattern, value } of AVAILABILITY_PATTERNS) {
    const m = normalizedText.match(new RegExp(pattern));
    if (m) {
      if (value === "immediately") return "immediately";
      return "from " + (m[1] ?? "").trim();
    }
  }
  return null;
}
function extractTitle(lines) {
  const labeled = extractLabeled(lines, TITLE_LABELS);
  if (labeled) return { value: labeled.value.slice(0, 90), confidence: "high" };
  const nonEmpty = [];
  for (let i = 0; i < lines.raw.length && nonEmpty.length < 6; i++) {
    if (lines.raw[i]) nonEmpty.push({ raw: lines.raw[i], idx: i });
  }
  for (const { raw, idx } of nonEmpty.slice(1, 4)) {
    if (raw.length > 80) continue;
    const matches = matchDictionary(lines.normalized[idx], SKILL_DICTIONARY);
    if (matches.length >= 1) {
      return { value: raw, confidence: "medium" };
    }
  }
  return null;
}
function extractCv(input) {
  const text = (input.text || "").normalize("NFC");
  const lines = prepareLines(text);
  const ctx = {
    sourceDocumentId: input.sourceDocumentId,
    now: input.now ?? (/* @__PURE__ */ new Date()).toISOString()
  };
  const fields = [];
  const normalizedAll = lines.normalized.join("\n");
  const name = extractFullName(lines);
  if (name) fields.push(field(ctx, "full_name", name.value, name.confidence));
  const email = extractEmail(text);
  if (email) fields.push(field(ctx, "email", email, "high"));
  const phone = extractPhone(lines);
  if (phone) fields.push(field(ctx, "phone", phone, "high"));
  const title = extractTitle(lines);
  if (title) fields.push(field(ctx, "title", title.value, title.confidence));
  const labeledLocation = extractLabeled(lines, LOCATION_LABELS);
  if (labeledLocation) {
    fields.push(field(ctx, "location", labeledLocation.value.slice(0, 90), "high"));
  }
  const summarySection = sectionLines(lines, SUMMARY_HEADINGS, 10);
  if (summarySection) {
    const summary = summarySection.join("\n").slice(0, 1200);
    if (summary.trim().length >= 20) {
      fields.push(field(ctx, "summary", summary, "high"));
    }
  }
  const years = extractYearsExperience(normalizedAll);
  if (years !== null) fields.push(field(ctx, "years_experience", years, "high"));
  const skills = matchDictionary(normalizedAll, SKILL_DICTIONARY);
  if (skills.length) fields.push(field(ctx, "skills", skills, "medium"));
  const processes = matchDictionary(normalizedAll, WELDING_PROCESS_DICTIONARY);
  if (processes.length) fields.push(field(ctx, "welding_processes", processes, "high"));
  const disciplines = matchDictionary(normalizedAll, DISCIPLINE_DICTIONARY);
  if (disciplines.length) fields.push(field(ctx, "disciplines", disciplines, "medium"));
  const spoken = extractSpokenLanguages(lines);
  if (spoken) fields.push(field(ctx, "languages", spoken.values, spoken.confidence));
  const education = extractEducation(lines);
  if (education) fields.push(field(ctx, "education", education, "medium"));
  const certifications = extractCertifications(normalizedAll);
  if (certifications.length) {
    fields.push(field(ctx, "certifications_declared", certifications.map((c) => c.name), "medium"));
  }
  const availability = extractAvailability(normalizedAll);
  if (availability) fields.push(field(ctx, "availability", availability, "medium"));
  if (WILLING_TO_TRAVEL_PATTERNS.some((p) => normalizedAll.includes(p))) {
    fields.push(field(ctx, "willing_to_travel", true, "medium"));
  }
  if (WILLING_TO_RELOCATE_PATTERNS.some((p) => normalizedAll.includes(p))) {
    fields.push(field(ctx, "willing_to_relocate", true, "medium"));
  }
  return {
    language: detectLanguage(text),
    fields,
    experiences: extractExperiences(lines),
    certifications
  };
}

// _shared/cv-extraction/textExtract.ts
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

// _shared/email-provider.ts
import nodemailer from "npm:nodemailer";
var RESEND_PROVIDER_NAME = "resend_smtp";
var ONECOM_PROVIDER_NAME = "smtp_onecom";
var RESEND_API_PROVIDER_NAME = "resend_api";
var CAPTURE_PROVIDER_NAME = "capture";
var NOTIFY_DEFAULT_FROM = "notifications@notify.pipingbox.com";
var AUTH_DEFAULT_FROM = "no-reply@auth.pipingbox.com";
var LEGACY_DEFAULT_FROM = "noreply@pipingbox.com";
function resolveDeliveryMode() {
  const raw = (Deno.env.get("EMAIL_DELIVERY_MODE") || "").trim().toLowerCase();
  if (raw === "") return "smtp";
  if (raw === "smtp" || raw === "capture" || raw === "resend_api") return raw;
  throw new Error(`email_delivery_mode_invalid: "${raw}"`);
}
function resolveSmtpConfig() {
  const notifyHost = Deno.env.get("NOTIFY_SMTP_HOST");
  const notifyUser = Deno.env.get("NOTIFY_SMTP_USER");
  const notifyPass = Deno.env.get("NOTIFY_SMTP_PASSWORD");
  if (notifyHost && notifyUser && notifyPass) {
    return {
      host: notifyHost,
      port: parseInt(Deno.env.get("NOTIFY_SMTP_PORT") || "465", 10),
      secure: Deno.env.get("NOTIFY_SMTP_SECURE") !== "false",
      user: notifyUser,
      pass: notifyPass,
      from: Deno.env.get("NOTIFY_SMTP_FROM") || NOTIFY_DEFAULT_FROM,
      providerName: RESEND_PROVIDER_NAME
    };
  }
  const host = Deno.env.get("SMTP_HOST");
  const user = Deno.env.get("SMTP_USER");
  const pass = Deno.env.get("SMTP_PASSWORD");
  if (!host || !user || !pass) {
    return null;
  }
  return {
    host,
    port: parseInt(Deno.env.get("SMTP_PORT") || "587", 10),
    secure: Deno.env.get("SMTP_SECURE") !== "false",
    user,
    pass,
    from: Deno.env.get("SMTP_FROM") || LEGACY_DEFAULT_FROM,
    providerName: ONECOM_PROVIDER_NAME
  };
}
var SmtpEmailProvider = class {
  transporter;
  from;
  providerName;
  constructor(config) {
    this.transporter = nodemailer.createTransport({
      host: config.host,
      port: config.port,
      secure: config.secure,
      auth: { user: config.user, pass: config.pass }
    });
    this.from = config.from;
    this.providerName = config.providerName;
  }
  isConfigured() {
    return true;
  }
  async send(message) {
    const result = await this.transporter.sendMail({
      from: message.fromName ? { name: message.fromName, address: this.from } : this.from,
      to: message.to,
      bcc: message.bcc,
      replyTo: message.replyTo,
      subject: message.subject,
      text: message.text,
      html: message.html
    });
    return {
      messageId: result.messageId,
      provider: this.providerName,
      accepted: Array.isArray(result.accepted) ? result.accepted.length : void 0,
      rejected: Array.isArray(result.rejected) ? result.rejected.length : void 0
    };
  }
};
var NoopEmailProvider = class {
  isConfigured() {
    return false;
  }
  async send() {
    throw new Error("email_provider_not_configured");
  }
};
function resolveResendApiConfig(kind) {
  if (kind === "auth") {
    const apiKey2 = Deno.env.get("RESEND_AUTH_API_KEY");
    if (!apiKey2) return null;
    return { apiKey: apiKey2, from: Deno.env.get("RESEND_AUTH_FROM") || AUTH_DEFAULT_FROM };
  }
  const apiKey = Deno.env.get("RESEND_NOTIFY_API_KEY");
  if (!apiKey) return null;
  return { apiKey, from: Deno.env.get("NOTIFY_SMTP_FROM") || NOTIFY_DEFAULT_FROM };
}
var ResendApiEmailProvider = class {
  constructor(config) {
    this.config = config;
  }
  isConfigured() {
    return true;
  }
  async send(message) {
    const from = message.fromName ? `${message.fromName.replace(/["<>]/g, "")} <${this.config.from}>` : this.config.from;
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${this.config.apiKey}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        from,
        to: [message.to],
        bcc: message.bcc ? [message.bcc] : void 0,
        reply_to: message.replyTo,
        subject: message.subject,
        html: message.html,
        text: message.text
      })
    });
    if (!res.ok) {
      throw new Error(`resend_api_error_${res.status}`);
    }
    const data = await res.json();
    return { messageId: data.id, provider: RESEND_API_PROVIDER_NAME, accepted: 1, rejected: 0 };
  }
};
var CAPTURE_TABLE = "app_14da0f1941_email_capture";
async function sha256Hex2(input) {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(input));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
}
function redactSensitive(value) {
  if (!value) return "";
  return value.replace(/([?&](?:token|token_hash|code|access_token|refresh_token)=)[^&\s"'<]+/gi, "$1[REDACTED]").replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, "[EMAIL]").replace(/\b\d{6,8}\b/g, "[OTP]");
}
var CaptureEmailProvider = class {
  url;
  key;
  constructor() {
    this.url = Deno.env.get("SUPABASE_URL") || "";
    this.key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
  }
  isConfigured() {
    return Boolean(this.url && this.key);
  }
  async send(message) {
    if (!this.isConfigured()) throw new Error("email_capture_not_configured");
    const email = message.to.trim().toLowerCase();
    const at = email.lastIndexOf("@");
    const row = {
      source: message.capture?.source ?? "unknown",
      template: message.capture?.template ?? "unknown",
      lang: message.capture?.lang ?? "en",
      lang_source: message.capture?.langSource ?? "fallback",
      recipient_hash: await sha256Hex2(email),
      recipient_domain: at > 0 ? email.slice(at + 1) : null,
      subject: redactSensitive(message.subject),
      html: redactSensitive(message.html),
      text_body: redactSensitive(message.text),
      meta: message.capture?.meta ?? {}
    };
    const res = await fetch(`${this.url}/rest/v1/${CAPTURE_TABLE}`, {
      method: "POST",
      headers: {
        apikey: this.key,
        Authorization: `Bearer ${this.key}`,
        "Content-Type": "application/json",
        Prefer: "return=representation"
      },
      body: JSON.stringify(row)
    });
    if (!res.ok) throw new Error(`email_capture_insert_failed_${res.status}`);
    const data = await res.json();
    return { messageId: `capture:${data[0]?.id ?? "unknown"}`, provider: CAPTURE_PROVIDER_NAME, accepted: 1, rejected: 0 };
  }
};
function createEmailProvider() {
  const mode = resolveDeliveryMode();
  if (mode === "capture") return new CaptureEmailProvider();
  if (mode === "resend_api") {
    const cfg = resolveResendApiConfig("notify");
    return cfg ? new ResendApiEmailProvider(cfg) : new NoopEmailProvider();
  }
  const config = resolveSmtpConfig();
  if (!config) {
    return new NoopEmailProvider();
  }
  return new SmtpEmailProvider(config);
}

// _shared/email-i18n/languages.ts
var SUPPORTED_EMAIL_LANGUAGES = [
  "en",
  "es",
  "nl",
  "fr",
  "de",
  "pt",
  "it",
  "ro",
  "uk",
  "pl",
  "bg"
];
var DEFAULT_EMAIL_LANGUAGE = "en";
function normalizeEmailLanguage(value) {
  if (typeof value !== "string") return null;
  const base = value.trim().slice(0, 2).toLowerCase();
  return SUPPORTED_EMAIL_LANGUAGES.includes(base) ? base : null;
}

// _shared/email-i18n/locales/en.ts
var en = {
  code: "en",
  common: {
    brand_tagline: "Professional platform for welding and industrial construction",
    button_fallback: "If the button does not work, copy this address into your browser:",
    security_title: "Security information",
    expires: "This link expires in {minutes} minutes and can be used only once. If it expires, you can request a new one from the PIPINGBOX sign-in screen.",
    never_share: "Never share this link or code. PIPINGBOX will never ask for your password by email, phone or chat.",
    support_prompt: "If you have any doubts about this message, contact {support} before opening the link.",
    not_you: "If you did not make this change, contact {support} immediately and reset your password.",
    footer_no_reply: "Automatic message from PIPINGBOX. This address does not accept replies; for any enquiry, write to {support}.",
    code_label: "Your verification code"
  },
  templates: {
    confirmation: {
      subject: "PIPINGBOX \xB7 Confirm your account",
      preheader: "Confirm your email address to activate your PIPINGBOX account.",
      heading: "Confirm your account",
      body: "Thank you for signing up to PIPINGBOX with the address {email}. To activate your account, confirm that this email address is yours.",
      button: "Confirm my account",
      note: "If you did not sign up for PIPINGBOX, you do not need to do anything: the account will stay unconfirmed, will not be activated and cannot be used to access the platform.",
      footer_reason: "You are receiving this message because someone requested to create a PIPINGBOX account with this address."
    },
    recovery: {
      subject: "PIPINGBOX \xB7 Reset your password",
      preheader: "We received a request to reset the password of your PIPINGBOX account.",
      heading: "Reset your password",
      body: "We received a request to reset the password of the PIPINGBOX account linked to {email}. Use the button below to choose a new password.",
      button: "Choose a new password",
      note: "If you did not request this change, you can ignore this message: your password will remain unchanged.",
      footer_reason: "You are receiving this message because a password reset was requested for this address."
    },
    magic_link: {
      subject: "PIPINGBOX \xB7 Your sign-in link",
      preheader: "Use this link to sign in to PIPINGBOX.",
      heading: "Sign in to PIPINGBOX",
      body: "Use the button below to sign in to PIPINGBOX with the address {email}.",
      button: "Sign in",
      note: "If you did not request this link, you can ignore this message: nobody can sign in without it.",
      footer_reason: "You are receiving this message because a sign-in link was requested for this address."
    },
    invite: {
      subject: "PIPINGBOX \xB7 You have been invited",
      preheader: "You have been invited to join PIPINGBOX.",
      heading: "You have been invited to PIPINGBOX",
      body: "You have been invited to create a PIPINGBOX account with the address {email}. Use the button below to accept the invitation and set up your account.",
      button: "Accept invitation",
      note: "If you were not expecting this invitation, you can ignore this message.",
      footer_reason: "You are receiving this message because someone invited this address to PIPINGBOX."
    },
    email_change_current: {
      subject: "PIPINGBOX \xB7 Confirm your email change",
      preheader: "Confirm the change of email address of your PIPINGBOX account.",
      heading: "Confirm your email change",
      body: "A request was made to change the email address of your PIPINGBOX account from {email} to {newEmail}. To authorise this change, confirm it from your current address.",
      button: "Confirm the change",
      note: "If you did not request this change, do not use the link: contact {support} immediately and reset your password.",
      footer_reason: "You are receiving this message because an email change was requested on the account linked to this address."
    },
    email_change_new: {
      subject: "PIPINGBOX \xB7 Confirm your new email address",
      preheader: "Confirm {newEmail} as the new address of your PIPINGBOX account.",
      heading: "Confirm your new email address",
      body: "Confirm {newEmail} as the new email address of your PIPINGBOX account.",
      button: "Confirm new address",
      note: "If you did not request this change, you can ignore this message: the address will not be changed.",
      footer_reason: "You are receiving this message because this address was proposed as the new address of a PIPINGBOX account."
    },
    reauthentication: {
      subject: "PIPINGBOX \xB7 Your verification code",
      preheader: "Use this code to confirm your identity in PIPINGBOX.",
      heading: "Your verification code",
      body: "Enter the code below in PIPINGBOX to confirm your identity. It expires in {minutes} minutes and can be used only once.",
      footer_reason: "You are receiving this message because a sensitive action on your PIPINGBOX account required identity verification."
    },
    password_changed_notification: {
      subject: "PIPINGBOX \xB7 Your password was changed",
      preheader: "The password of your PIPINGBOX account was changed.",
      heading: "Your password was changed",
      body: "The password of the PIPINGBOX account linked to {email} was changed recently.",
      footer_reason: "You are receiving this security notice because of a change on your PIPINGBOX account."
    },
    email_changed_notification: {
      subject: "PIPINGBOX \xB7 Your email address was changed",
      preheader: "The email address of your PIPINGBOX account was changed.",
      heading: "Your email address was changed",
      body: "The email address of your PIPINGBOX account was changed from {oldEmail} to {email}.",
      footer_reason: "You are receiving this security notice because of a change on your PIPINGBOX account."
    },
    phone_changed_notification: {
      subject: "PIPINGBOX \xB7 Your phone number was changed",
      preheader: "The phone number of your PIPINGBOX account was changed.",
      heading: "Your phone number was changed",
      body: "The phone number of your PIPINGBOX account was changed from {oldPhone} to {phone}.",
      footer_reason: "You are receiving this security notice because of a change on your PIPINGBOX account."
    },
    identity_linked_notification: {
      subject: "PIPINGBOX \xB7 A new sign-in method was linked",
      preheader: "A new sign-in method was linked to your PIPINGBOX account.",
      heading: "A new sign-in method was linked",
      body: "Your {provider} account was linked as a new sign-in method for {email}.",
      footer_reason: "You are receiving this security notice because of a change on your PIPINGBOX account."
    },
    identity_unlinked_notification: {
      subject: "PIPINGBOX \xB7 A sign-in method was removed",
      preheader: "A sign-in method was removed from your PIPINGBOX account.",
      heading: "A sign-in method was removed",
      body: "Your {provider} account was removed as a sign-in method for {email}.",
      footer_reason: "You are receiving this security notice because of a change on your PIPINGBOX account."
    },
    mfa_factor_enrolled_notification: {
      subject: "PIPINGBOX \xB7 A new verification method was added",
      preheader: "A new verification method was added to your PIPINGBOX account.",
      heading: "A new verification method was added",
      body: "A new sign-in verification method ({factorType}) was added to your PIPINGBOX account.",
      footer_reason: "You are receiving this security notice because of a change on your PIPINGBOX account."
    },
    mfa_factor_unenrolled_notification: {
      subject: "PIPINGBOX \xB7 A verification method was removed",
      preheader: "A verification method was removed from your PIPINGBOX account.",
      heading: "A verification method was removed",
      body: "A sign-in verification method ({factorType}) was removed from your PIPINGBOX account.",
      footer_reason: "You are receiving this security notice because of a change on your PIPINGBOX account."
    },
    job_match: {
      subject: "PIPINGBOX \xB7 New job matching your profile: {jobTitle}",
      preheader: '{score}% match with "{jobTitle}".',
      heading: "New job matching your profile",
      body: 'We found a job offer with a {score}% match with your profile: "{jobTitle}" at {company}.',
      body_no_company: 'We found a job offer with a {score}% match with your profile: "{jobTitle}".',
      button: "View the offer",
      note: "You receive job alerts because they are enabled in your PIPINGBOX profile. You can turn them off at any time from your matching preferences.",
      footer_reason: "You are receiving this message because job alerts are enabled on your PIPINGBOX account."
    },
    workforce_match: {
      subject: "PIPINGBOX \xB7 New workforce request matching your profile",
      preheader: "A company is looking for {workerType} professionals in {country}.",
      heading: "New workforce request",
      body: "A company has published a workforce request with a {score}% match with your profile: {workerType} in {country}.",
      button: "View the request",
      note: "You receive these alerts because they are enabled in your PIPINGBOX profile. You can turn them off at any time from your matching preferences.",
      footer_reason: "You are receiving this message because job alerts are enabled on your PIPINGBOX account."
    },
    cert_expiry: {
      subject: "PIPINGBOX \xB7 Your certification {certName} expires soon",
      preheader: "{certName} expires on {expiresOn}.",
      heading: "Certification about to expire",
      body: "Your certification {certName} expires on {expiresOn}. Keep your profile up to date so that companies can see your valid certifications.",
      button: "Update my certifications",
      note: "You receive these alerts because they are enabled in your PIPINGBOX profile.",
      footer_reason: "You are receiving this message because certification alerts are enabled on your PIPINGBOX account."
    },
    lead_receipt: {
      subject: "PIPINGBOX \xB7 We have received your request",
      preheader: "Thank you for contacting PIPINGBOX.",
      heading: "We have received your request",
      body: "Hello {name}, thank you for contacting PIPINGBOX. We have received your workforce request and our team will get back to you shortly with a proposal.",
      footer_reason: "You are receiving this message because you submitted a contact form on pipingbox.com."
    },
    application_pending_profile: {
      subject: "PIPINGBOX \xB7 Application received \u2014 complete your profile to activate it",
      preheader: "We have received your application for {jobTitle}.",
      heading: "Application received \u2014 complete your profile to activate it",
      body: "We have received your application for \xAB{jobTitle}\xBB at {company}. You can keep applying to other offers: all your applications are saved. This application cannot be presented to the company yet \u2014 to activate it, complete your profile until it is fully validated (Marketplace Ready).",
      body_no_company: "We have received your application for \xAB{jobTitle}\xBB. You can keep applying to other offers: all your applications are saved. This application cannot be presented to the company yet \u2014 to activate it, complete your profile until it is fully validated (Marketplace Ready).",
      note: "Your application has not been rejected: it is simply waiting for your profile to be validated. As soon as your profile is Marketplace Ready, it will automatically be reviewed for presentation to companies.",
      pending_intro: "What is missing from your profile:",
      pending_items: {
        photo: "Profile photo",
        basic_details: "Name and profession",
        location: "Location",
        years_experience: "Years of experience",
        skills: "Skills",
        bio: "About you (bio)",
        cv: "CV",
        experience: "Work experience",
        certifications: "Certifications",
        documents: "Documents"
      },
      button: "Complete my profile",
      footer_reason: "You are receiving this message because you applied to a job on PIPINGBOX."
    },
    marketplace_ready: {
      subject: "PIPINGBOX \xB7 Profile validated \u2014 your applications can now be reviewed",
      preheader: "Your profile is now Marketplace Ready.",
      heading: "Profile validated \u2014 your applications can now be reviewed",
      body_single: "Your profile is now validated and you are Marketplace Ready. Your application for \xAB{jobTitle}\xBB can now be reviewed for presentation to companies.",
      body_multiple: "Your profile is now validated and you are Marketplace Ready. Your {count} pending applications can now be reviewed for presentation to companies.",
      activated_list_intro: "Activated applications:",
      note: "There is nothing else you need to do: our team reviews each application against the specific requirements of every offer and will get in touch with you.",
      button: "View my applications",
      footer_reason: "You are receiving this message because your PIPINGBOX profile reached Marketplace Ready."
    },
    cv_review_pending: {
      subject: "PIPINGBOX \xB7 We received your CV \u2014 review your profile",
      preheader: "We prepared your professional profile from your CV.",
      heading: "Your professional profile is ready to review",
      body: "Hello! We received your CV and prepared your professional profile from it. Review the data so PIPINGBOX can consider you for compatible opportunities.",
      button: "Review my profile",
      note: "Nothing has been published yet: the extracted data only becomes part of your profile after you review and confirm it. Certifications mentioned in your CV are recorded as declared, not verified.",
      footer_reason: "You are receiving this message because PIPINGBOX received a CV associated with your account."
    }
  }
};
var en_default = en;

// _shared/email-i18n/locales/es.ts
var es = {
  code: "es",
  common: {
    brand_tagline: "Plataforma profesional para soldadura y construcci\xF3n industrial",
    button_fallback: "Si el bot\xF3n no funciona, copia esta direcci\xF3n en tu navegador:",
    security_title: "Informaci\xF3n de seguridad",
    expires: "El enlace caduca en {minutes} minutos y solo puede utilizarse una vez. Si caduca, puedes solicitar uno nuevo desde la pantalla de acceso de PIPINGBOX.",
    never_share: "No compartas este enlace ni este c\xF3digo con nadie. PIPINGBOX nunca te pedir\xE1 tu contrase\xF1a por correo, tel\xE9fono ni mensajer\xEDa.",
    support_prompt: "Si tienes dudas sobre este mensaje, escribe a {support} antes de abrir el enlace.",
    not_you: "Si no has realizado este cambio, escribe inmediatamente a {support} y restablece tu contrase\xF1a.",
    footer_no_reply: "Mensaje autom\xE1tico de PIPINGBOX. Esta direcci\xF3n no admite respuestas; para cualquier consulta, escribe a {support}.",
    code_label: "Tu c\xF3digo de verificaci\xF3n"
  },
  templates: {
    confirmation: {
      subject: "PIPINGBOX \xB7 Confirma tu cuenta",
      preheader: "Confirma tu direcci\xF3n de correo para activar tu cuenta PIPINGBOX.",
      heading: "Confirma tu cuenta",
      body: "Gracias por registrarte en PIPINGBOX con la direcci\xF3n {email}. Para activar tu cuenta, confirma que esta direcci\xF3n de correo es tuya.",
      button: "Confirmar mi cuenta",
      note: "Si no te has registrado en PIPINGBOX, no es necesario que hagas nada: la cuenta quedar\xE1 sin confirmar, no se activar\xE1 y no podr\xE1 usarse para acceder a la plataforma.",
      footer_reason: "Recibes este mensaje porque alguien solicit\xF3 crear una cuenta PIPINGBOX con esta direcci\xF3n."
    },
    recovery: {
      subject: "PIPINGBOX \xB7 Restablecer tu contrase\xF1a",
      preheader: "Hemos recibido una solicitud para restablecer la contrase\xF1a de tu cuenta PIPINGBOX.",
      heading: "Restablecer tu contrase\xF1a",
      body: "Hemos recibido una solicitud para restablecer la contrase\xF1a de la cuenta PIPINGBOX asociada a {email}. Usa el bot\xF3n para elegir una contrase\xF1a nueva.",
      button: "Elegir una contrase\xF1a nueva",
      note: "Si no has solicitado este cambio, puedes ignorar este mensaje: tu contrase\xF1a seguir\xE1 siendo la misma.",
      footer_reason: "Recibes este mensaje porque se solicit\xF3 restablecer la contrase\xF1a de esta direcci\xF3n."
    },
    magic_link: {
      subject: "PIPINGBOX \xB7 Tu enlace de acceso",
      preheader: "Usa este enlace para acceder a PIPINGBOX.",
      heading: "Accede a PIPINGBOX",
      body: "Usa el bot\xF3n para acceder a PIPINGBOX con la direcci\xF3n {email}.",
      button: "Acceder",
      note: "Si no has solicitado este enlace, puedes ignorar este mensaje: nadie puede acceder sin \xE9l.",
      footer_reason: "Recibes este mensaje porque se solicit\xF3 un enlace de acceso para esta direcci\xF3n."
    },
    invite: {
      subject: "PIPINGBOX \xB7 Te han invitado",
      preheader: "Te han invitado a unirte a PIPINGBOX.",
      heading: "Te han invitado a PIPINGBOX",
      body: "Te han invitado a crear una cuenta PIPINGBOX con la direcci\xF3n {email}. Usa el bot\xF3n para aceptar la invitaci\xF3n y configurar tu cuenta.",
      button: "Aceptar la invitaci\xF3n",
      note: "Si no esperabas esta invitaci\xF3n, puedes ignorar este mensaje.",
      footer_reason: "Recibes este mensaje porque alguien invit\xF3 esta direcci\xF3n a PIPINGBOX."
    },
    email_change_current: {
      subject: "PIPINGBOX \xB7 Confirma el cambio de correo",
      preheader: "Confirma el cambio de direcci\xF3n de correo de tu cuenta PIPINGBOX.",
      heading: "Confirma el cambio de correo",
      body: "Se ha solicitado cambiar la direcci\xF3n de correo de tu cuenta PIPINGBOX de {email} a {newEmail}. Para autorizar el cambio, conf\xEDrmalo desde tu direcci\xF3n actual.",
      button: "Confirmar el cambio",
      note: "Si no has solicitado este cambio, no uses el enlace: escribe inmediatamente a {support} y restablece tu contrase\xF1a.",
      footer_reason: "Recibes este mensaje porque se solicit\xF3 un cambio de correo en la cuenta asociada a esta direcci\xF3n."
    },
    email_change_new: {
      subject: "PIPINGBOX \xB7 Confirma tu nueva direcci\xF3n de correo",
      preheader: "Confirma {newEmail} como nueva direcci\xF3n de tu cuenta PIPINGBOX.",
      heading: "Confirma tu nueva direcci\xF3n de correo",
      body: "Confirma {newEmail} como nueva direcci\xF3n de correo de tu cuenta PIPINGBOX.",
      button: "Confirmar la nueva direcci\xF3n",
      note: "Si no has solicitado este cambio, puedes ignorar este mensaje: la direcci\xF3n no se modificar\xE1.",
      footer_reason: "Recibes este mensaje porque esta direcci\xF3n se propuso como nueva direcci\xF3n de una cuenta PIPINGBOX."
    },
    reauthentication: {
      subject: "PIPINGBOX \xB7 Tu c\xF3digo de verificaci\xF3n",
      preheader: "Usa este c\xF3digo para confirmar tu identidad en PIPINGBOX.",
      heading: "Tu c\xF3digo de verificaci\xF3n",
      body: "Introduce el siguiente c\xF3digo en PIPINGBOX para confirmar tu identidad. Caduca en {minutes} minutos y solo puede usarse una vez.",
      footer_reason: "Recibes este mensaje porque una acci\xF3n sensible en tu cuenta PIPINGBOX requiri\xF3 verificar tu identidad."
    },
    password_changed_notification: {
      subject: "PIPINGBOX \xB7 Tu contrase\xF1a ha cambiado",
      preheader: "La contrase\xF1a de tu cuenta PIPINGBOX ha cambiado.",
      heading: "Tu contrase\xF1a ha cambiado",
      body: "La contrase\xF1a de la cuenta PIPINGBOX asociada a {email} se ha cambiado recientemente.",
      footer_reason: "Recibes este aviso de seguridad por un cambio en tu cuenta PIPINGBOX."
    },
    email_changed_notification: {
      subject: "PIPINGBOX \xB7 Tu direcci\xF3n de correo ha cambiado",
      preheader: "La direcci\xF3n de correo de tu cuenta PIPINGBOX ha cambiado.",
      heading: "Tu direcci\xF3n de correo ha cambiado",
      body: "La direcci\xF3n de correo de tu cuenta PIPINGBOX ha cambiado de {oldEmail} a {email}.",
      footer_reason: "Recibes este aviso de seguridad por un cambio en tu cuenta PIPINGBOX."
    },
    phone_changed_notification: {
      subject: "PIPINGBOX \xB7 Tu n\xFAmero de tel\xE9fono ha cambiado",
      preheader: "El n\xFAmero de tel\xE9fono de tu cuenta PIPINGBOX ha cambiado.",
      heading: "Tu n\xFAmero de tel\xE9fono ha cambiado",
      body: "El n\xFAmero de tel\xE9fono de tu cuenta PIPINGBOX ha cambiado de {oldPhone} a {phone}.",
      footer_reason: "Recibes este aviso de seguridad por un cambio en tu cuenta PIPINGBOX."
    },
    identity_linked_notification: {
      subject: "PIPINGBOX \xB7 Se ha vinculado un nuevo m\xE9todo de acceso",
      preheader: "Se ha vinculado un nuevo m\xE9todo de acceso a tu cuenta PIPINGBOX.",
      heading: "Se ha vinculado un nuevo m\xE9todo de acceso",
      body: "Tu cuenta de {provider} se ha vinculado como nuevo m\xE9todo de acceso para {email}.",
      footer_reason: "Recibes este aviso de seguridad por un cambio en tu cuenta PIPINGBOX."
    },
    identity_unlinked_notification: {
      subject: "PIPINGBOX \xB7 Se ha eliminado un m\xE9todo de acceso",
      preheader: "Se ha eliminado un m\xE9todo de acceso de tu cuenta PIPINGBOX.",
      heading: "Se ha eliminado un m\xE9todo de acceso",
      body: "Tu cuenta de {provider} se ha eliminado como m\xE9todo de acceso para {email}.",
      footer_reason: "Recibes este aviso de seguridad por un cambio en tu cuenta PIPINGBOX."
    },
    mfa_factor_enrolled_notification: {
      subject: "PIPINGBOX \xB7 Se ha a\xF1adido un nuevo m\xE9todo de verificaci\xF3n",
      preheader: "Se ha a\xF1adido un nuevo m\xE9todo de verificaci\xF3n a tu cuenta PIPINGBOX.",
      heading: "Se ha a\xF1adido un nuevo m\xE9todo de verificaci\xF3n",
      body: "Se ha a\xF1adido un nuevo m\xE9todo de verificaci\xF3n de acceso ({factorType}) a tu cuenta PIPINGBOX.",
      footer_reason: "Recibes este aviso de seguridad por un cambio en tu cuenta PIPINGBOX."
    },
    mfa_factor_unenrolled_notification: {
      subject: "PIPINGBOX \xB7 Se ha eliminado un m\xE9todo de verificaci\xF3n",
      preheader: "Se ha eliminado un m\xE9todo de verificaci\xF3n de tu cuenta PIPINGBOX.",
      heading: "Se ha eliminado un m\xE9todo de verificaci\xF3n",
      body: "Se ha eliminado un m\xE9todo de verificaci\xF3n de acceso ({factorType}) de tu cuenta PIPINGBOX.",
      footer_reason: "Recibes este aviso de seguridad por un cambio en tu cuenta PIPINGBOX."
    },
    job_match: {
      subject: "PIPINGBOX \xB7 Nueva oferta compatible con tu perfil: {jobTitle}",
      preheader: "{score}% de compatibilidad con \xAB{jobTitle}\xBB.",
      heading: "Nueva oferta compatible con tu perfil",
      body: "Hemos encontrado una oferta de empleo con un {score}% de compatibilidad con tu perfil: \xAB{jobTitle}\xBB en {company}.",
      body_no_company: "Hemos encontrado una oferta de empleo con un {score}% de compatibilidad con tu perfil: \xAB{jobTitle}\xBB.",
      button: "Ver la oferta",
      note: "Recibes alertas de empleo porque est\xE1n activadas en tu perfil de PIPINGBOX. Puedes desactivarlas en cualquier momento desde tus preferencias de compatibilidad.",
      footer_reason: "Recibes este mensaje porque las alertas de empleo est\xE1n activadas en tu cuenta PIPINGBOX."
    },
    workforce_match: {
      subject: "PIPINGBOX \xB7 Nueva solicitud de personal compatible con tu perfil",
      preheader: "Una empresa busca profesionales de {workerType} en {country}.",
      heading: "Nueva solicitud de personal",
      body: "Una empresa ha publicado una solicitud de personal con un {score}% de compatibilidad con tu perfil: {workerType} en {country}.",
      button: "Ver la solicitud",
      note: "Recibes estas alertas porque est\xE1n activadas en tu perfil de PIPINGBOX. Puedes desactivarlas en cualquier momento desde tus preferencias de compatibilidad.",
      footer_reason: "Recibes este mensaje porque las alertas de empleo est\xE1n activadas en tu cuenta PIPINGBOX."
    },
    cert_expiry: {
      subject: "PIPINGBOX \xB7 Tu certificaci\xF3n {certName} caduca pronto",
      preheader: "{certName} caduca el {expiresOn}.",
      heading: "Certificaci\xF3n a punto de caducar",
      body: "Tu certificaci\xF3n {certName} caduca el {expiresOn}. Mant\xE9n tu perfil actualizado para que las empresas vean tus certificaciones vigentes.",
      button: "Actualizar mis certificaciones",
      note: "Recibes estas alertas porque est\xE1n activadas en tu perfil de PIPINGBOX.",
      footer_reason: "Recibes este mensaje porque las alertas de certificaciones est\xE1n activadas en tu cuenta PIPINGBOX."
    },
    lead_receipt: {
      subject: "PIPINGBOX \xB7 Hemos recibido tu solicitud",
      preheader: "Gracias por contactar con PIPINGBOX.",
      heading: "Hemos recibido tu solicitud",
      body: "Hola, {name}. Gracias por contactar con PIPINGBOX. Hemos recibido tu solicitud de personal y nuestro equipo se pondr\xE1 en contacto contigo en breve con una propuesta.",
      footer_reason: "Recibes este mensaje porque has enviado un formulario de contacto en pipingbox.com."
    },
    application_pending_profile: {
      subject: "PIPINGBOX \xB7 Candidatura recibida \u2014 completa tu perfil para activarla",
      preheader: "Hemos recibido tu candidatura para {jobTitle}.",
      heading: "Candidatura recibida \u2014 completa tu perfil para activarla",
      body: "Hemos recibido correctamente tu candidatura para \xAB{jobTitle}\xBB en {company}. Puedes seguir aplicando a otras ofertas: todas tus candidaturas quedan guardadas. Esta candidatura todav\xEDa no puede presentarse a la empresa; para activarla, completa tu perfil hasta que est\xE9 totalmente validado (Marketplace Ready).",
      body_no_company: "Hemos recibido correctamente tu candidatura para \xAB{jobTitle}\xBB. Puedes seguir aplicando a otras ofertas: todas tus candidaturas quedan guardadas. Esta candidatura todav\xEDa no puede presentarse a la empresa; para activarla, completa tu perfil hasta que est\xE9 totalmente validado (Marketplace Ready).",
      note: "Tu candidatura NO ha sido rechazada: simplemente est\xE1 a la espera de que valides tu perfil. En cuanto tu perfil sea Marketplace Ready, pasar\xE1 autom\xE1ticamente a revisi\xF3n para su presentaci\xF3n a las empresas.",
      pending_intro: "Qu\xE9 le falta a tu perfil:",
      pending_items: {
        photo: "Foto de perfil",
        basic_details: "Nombre y profesi\xF3n",
        location: "Ubicaci\xF3n",
        years_experience: "A\xF1os de experiencia",
        skills: "Habilidades",
        bio: "Sobre ti (bio)",
        cv: "CV",
        experience: "Experiencia laboral",
        certifications: "Certificaciones",
        documents: "Documentos"
      },
      button: "Completar mi perfil",
      footer_reason: "Recibes este mensaje porque aplicaste a una oferta en PIPINGBOX."
    },
    marketplace_ready: {
      subject: "PIPINGBOX \xB7 Perfil validado \u2014 tus candidaturas ya pueden revisarse",
      preheader: "Tu perfil ya es Marketplace Ready.",
      heading: "Perfil validado \u2014 tus candidaturas ya pueden revisarse",
      body_single: "Tu perfil ya est\xE1 validado y eres Marketplace Ready. Tu candidatura para \xAB{jobTitle}\xBB ya puede revisarse para su presentaci\xF3n a las empresas.",
      body_multiple: "Tu perfil ya est\xE1 validado y eres Marketplace Ready. Tus {count} candidaturas pendientes ya pueden revisarse para su presentaci\xF3n a las empresas.",
      activated_list_intro: "Candidaturas activadas:",
      note: "No tienes que hacer nada m\xE1s: nuestro equipo revisa cada candidatura seg\xFAn los requisitos espec\xEDficos de cada oferta y se pondr\xE1 en contacto contigo.",
      button: "Ver mis candidaturas",
      footer_reason: "Recibes este mensaje porque tu perfil de PIPINGBOX ha alcanzado Marketplace Ready."
    },
    cv_review_pending: {
      subject: "PIPINGBOX \xB7 Recibimos tu CV \u2014 revisa tu perfil",
      preheader: "Preparamos tu perfil profesional a partir de tu CV.",
      heading: "Tu perfil profesional est\xE1 listo para revisar",
      body: "Hola: recibimos tu CV y preparamos tu perfil profesional a partir de \xE9l. Revisa los datos para que PIPINGBOX pueda tenerte en cuenta para oportunidades compatibles.",
      button: "Revisar mi perfil",
      note: "Todav\xEDa no se ha publicado nada: los datos extra\xEDdos solo forman parte de tu perfil despu\xE9s de que los revises y confirmes. Las certificaciones mencionadas en tu CV se registran como declaradas, no verificadas.",
      footer_reason: "Recibes este mensaje porque PIPINGBOX recibi\xF3 un CV asociado a tu cuenta."
    }
  }
};
var es_default = es;

// _shared/email-i18n/locales/nl.ts
var nl = {
  code: "nl",
  common: {
    brand_tagline: "Professioneel platform voor lassen en industri\xEBle bouw",
    button_fallback: "Werkt de knop niet? Kopieer dan dit adres in je browser:",
    security_title: "Veiligheidsinformatie",
    expires: "Deze link verloopt na {minutes} minuten en kan slechts \xE9\xE9n keer worden gebruikt. Is de link verlopen, dan kun je een nieuwe aanvragen via het inlogscherm van PIPINGBOX.",
    never_share: "Deel deze link of code nooit met anderen. PIPINGBOX zal je nooit per e-mail, telefoon of chat om je wachtwoord vragen.",
    support_prompt: "Twijfel je over dit bericht? Neem dan contact op met {support} voordat je de link opent.",
    not_you: "Heb jij deze wijziging niet uitgevoerd? Neem dan onmiddellijk contact op met {support} en stel je wachtwoord opnieuw in.",
    footer_no_reply: "Automatisch bericht van PIPINGBOX. Op dit adres kun je niet antwoorden; voor vragen schrijf je naar {support}.",
    code_label: "Je verificatiecode"
  },
  templates: {
    confirmation: {
      subject: "PIPINGBOX \xB7 Bevestig je account",
      preheader: "Bevestig je e-mailadres om je PIPINGBOX-account te activeren.",
      heading: "Bevestig je account",
      body: "Bedankt voor je registratie bij PIPINGBOX met het adres {email}. Bevestig dat dit e-mailadres van jou is om je account te activeren.",
      button: "Mijn account bevestigen",
      note: "Heb je je niet bij PIPINGBOX geregistreerd? Dan hoef je niets te doen: het account blijft onbevestigd, wordt niet geactiveerd en kan niet worden gebruikt om toegang te krijgen tot het platform.",
      footer_reason: "Je ontvangt dit bericht omdat iemand een PIPINGBOX-account met dit adres heeft willen aanmaken."
    },
    recovery: {
      subject: "PIPINGBOX \xB7 Wachtwoord opnieuw instellen",
      preheader: "We hebben een verzoek ontvangen om het wachtwoord van je PIPINGBOX-account opnieuw in te stellen.",
      heading: "Wachtwoord opnieuw instellen",
      body: "We hebben een verzoek ontvangen om het wachtwoord van het PIPINGBOX-account gekoppeld aan {email} opnieuw in te stellen. Gebruik de knop hieronder om een nieuw wachtwoord te kiezen.",
      button: "Nieuw wachtwoord kiezen",
      note: "Heb je deze wijziging niet aangevraagd? Dan kun je dit bericht negeren: je wachtwoord blijft ongewijzigd.",
      footer_reason: "Je ontvangt dit bericht omdat er voor dit adres een wachtwoordherstel is aangevraagd."
    },
    magic_link: {
      subject: "PIPINGBOX \xB7 Je inloglink",
      preheader: "Gebruik deze link om in te loggen bij PIPINGBOX.",
      heading: "Inloggen bij PIPINGBOX",
      body: "Gebruik de knop hieronder om in te loggen bij PIPINGBOX met het adres {email}.",
      button: "Inloggen",
      note: "Heb je deze link niet aangevraagd? Dan kun je dit bericht negeren: zonder de link kan niemand inloggen.",
      footer_reason: "Je ontvangt dit bericht omdat er voor dit adres een inloglink is aangevraagd."
    },
    invite: {
      subject: "PIPINGBOX \xB7 Je bent uitgenodigd",
      preheader: "Je bent uitgenodigd om lid te worden van PIPINGBOX.",
      heading: "Je bent uitgenodigd voor PIPINGBOX",
      body: "Je bent uitgenodigd om een PIPINGBOX-account aan te maken met het adres {email}. Gebruik de knop hieronder om de uitnodiging te accepteren en je account in te stellen.",
      button: "Uitnodiging accepteren",
      note: "Verwachtte je deze uitnodiging niet? Dan kun je dit bericht negeren.",
      footer_reason: "Je ontvangt dit bericht omdat iemand dit adres heeft uitgenodigd voor PIPINGBOX."
    },
    email_change_current: {
      subject: "PIPINGBOX \xB7 Bevestig de wijziging van je e-mailadres",
      preheader: "Bevestig de wijziging van het e-mailadres van je PIPINGBOX-account.",
      heading: "Bevestig de wijziging van je e-mailadres",
      body: "Er is gevraagd om het e-mailadres van je PIPINGBOX-account te wijzigen van {email} naar {newEmail}. Bevestig de wijziging vanaf je huidige adres om deze toe te staan.",
      button: "Wijziging bevestigen",
      note: "Heb je deze wijziging niet aangevraagd? Gebruik de link dan niet: neem onmiddellijk contact op met {support} en stel je wachtwoord opnieuw in.",
      footer_reason: "Je ontvangt dit bericht omdat er een e-mailwijziging is aangevraagd voor het account gekoppeld aan dit adres."
    },
    email_change_new: {
      subject: "PIPINGBOX \xB7 Bevestig je nieuwe e-mailadres",
      preheader: "Bevestig {newEmail} als nieuw adres van je PIPINGBOX-account.",
      heading: "Bevestig je nieuwe e-mailadres",
      body: "Bevestig {newEmail} als nieuw e-mailadres van je PIPINGBOX-account.",
      button: "Nieuw adres bevestigen",
      note: "Heb je deze wijziging niet aangevraagd? Dan kun je dit bericht negeren: het adres wordt niet gewijzigd.",
      footer_reason: "Je ontvangt dit bericht omdat dit adres is voorgesteld als nieuw adres van een PIPINGBOX-account."
    },
    reauthentication: {
      subject: "PIPINGBOX \xB7 Je verificatiecode",
      preheader: "Gebruik deze code om je identiteit te bevestigen in PIPINGBOX.",
      heading: "Je verificatiecode",
      body: "Voer de onderstaande code in bij PIPINGBOX om je identiteit te bevestigen. De code verloopt na {minutes} minuten en kan slechts \xE9\xE9n keer worden gebruikt.",
      footer_reason: "Je ontvangt dit bericht omdat een gevoelige actie in je PIPINGBOX-account identiteitsverificatie vereiste."
    },
    password_changed_notification: {
      subject: "PIPINGBOX \xB7 Je wachtwoord is gewijzigd",
      preheader: "Het wachtwoord van je PIPINGBOX-account is gewijzigd.",
      heading: "Je wachtwoord is gewijzigd",
      body: "Het wachtwoord van het PIPINGBOX-account gekoppeld aan {email} is onlangs gewijzigd.",
      footer_reason: "Je ontvangt deze veiligheidsmelding vanwege een wijziging in je PIPINGBOX-account."
    },
    email_changed_notification: {
      subject: "PIPINGBOX \xB7 Je e-mailadres is gewijzigd",
      preheader: "Het e-mailadres van je PIPINGBOX-account is gewijzigd.",
      heading: "Je e-mailadres is gewijzigd",
      body: "Het e-mailadres van je PIPINGBOX-account is gewijzigd van {oldEmail} naar {email}.",
      footer_reason: "Je ontvangt deze veiligheidsmelding vanwege een wijziging in je PIPINGBOX-account."
    },
    phone_changed_notification: {
      subject: "PIPINGBOX \xB7 Je telefoonnummer is gewijzigd",
      preheader: "Het telefoonnummer van je PIPINGBOX-account is gewijzigd.",
      heading: "Je telefoonnummer is gewijzigd",
      body: "Het telefoonnummer van je PIPINGBOX-account is gewijzigd van {oldPhone} naar {phone}.",
      footer_reason: "Je ontvangt deze veiligheidsmelding vanwege een wijziging in je PIPINGBOX-account."
    },
    identity_linked_notification: {
      subject: "PIPINGBOX \xB7 Er is een nieuwe inlogmethode gekoppeld",
      preheader: "Er is een nieuwe inlogmethode gekoppeld aan je PIPINGBOX-account.",
      heading: "Er is een nieuwe inlogmethode gekoppeld",
      body: "Je {provider}-account is gekoppeld als nieuwe inlogmethode voor {email}.",
      footer_reason: "Je ontvangt deze veiligheidsmelding vanwege een wijziging in je PIPINGBOX-account."
    },
    identity_unlinked_notification: {
      subject: "PIPINGBOX \xB7 Er is een inlogmethode verwijderd",
      preheader: "Er is een inlogmethode verwijderd uit je PIPINGBOX-account.",
      heading: "Er is een inlogmethode verwijderd",
      body: "Je {provider}-account is verwijderd als inlogmethode voor {email}.",
      footer_reason: "Je ontvangt deze veiligheidsmelding vanwege een wijziging in je PIPINGBOX-account."
    },
    mfa_factor_enrolled_notification: {
      subject: "PIPINGBOX \xB7 Er is een nieuwe verificatiemethode toegevoegd",
      preheader: "Er is een nieuwe verificatiemethode toegevoegd aan je PIPINGBOX-account.",
      heading: "Er is een nieuwe verificatiemethode toegevoegd",
      body: "Er is een nieuwe inlogverificatiemethode ({factorType}) toegevoegd aan je PIPINGBOX-account.",
      footer_reason: "Je ontvangt deze veiligheidsmelding vanwege een wijziging in je PIPINGBOX-account."
    },
    mfa_factor_unenrolled_notification: {
      subject: "PIPINGBOX \xB7 Er is een verificatiemethode verwijderd",
      preheader: "Er is een verificatiemethode verwijderd uit je PIPINGBOX-account.",
      heading: "Er is een verificatiemethode verwijderd",
      body: "Er is een inlogverificatiemethode ({factorType}) verwijderd uit je PIPINGBOX-account.",
      footer_reason: "Je ontvangt deze veiligheidsmelding vanwege een wijziging in je PIPINGBOX-account."
    },
    job_match: {
      subject: "PIPINGBOX \xB7 Nieuwe vacature die past bij je profiel: {jobTitle}",
      preheader: '{score}% match met "{jobTitle}".',
      heading: "Nieuwe vacature die past bij je profiel",
      body: 'We hebben een vacature gevonden met een match van {score}% met je profiel: "{jobTitle}" bij {company}.',
      body_no_company: 'We hebben een vacature gevonden met een match van {score}% met je profiel: "{jobTitle}".',
      button: "Vacature bekijken",
      note: "Je ontvangt vacaturemeldingen omdat deze zijn ingeschakeld in je PIPINGBOX-profiel. Je kunt ze op elk moment uitschakelen in je matchingvoorkeuren.",
      footer_reason: "Je ontvangt dit bericht omdat vacaturemeldingen zijn ingeschakeld voor je PIPINGBOX-account."
    },
    workforce_match: {
      subject: "PIPINGBOX \xB7 Nieuwe personeelsaanvraag die past bij je profiel",
      preheader: "Een bedrijf zoekt {workerType}-professionals in {country}.",
      heading: "Nieuwe personeelsaanvraag",
      body: "Een bedrijf heeft een personeelsaanvraag geplaatst met een match van {score}% met je profiel: {workerType} in {country}.",
      button: "Aanvraag bekijken",
      note: "Je ontvangt deze meldingen omdat ze zijn ingeschakeld in je PIPINGBOX-profiel. Je kunt ze op elk moment uitschakelen in je matchingvoorkeuren.",
      footer_reason: "Je ontvangt dit bericht omdat vacaturemeldingen zijn ingeschakeld voor je PIPINGBOX-account."
    },
    cert_expiry: {
      subject: "PIPINGBOX \xB7 Je certificering {certName} verloopt binnenkort",
      preheader: "{certName} verloopt op {expiresOn}.",
      heading: "Certificering verloopt binnenkort",
      body: "Je certificering {certName} verloopt op {expiresOn}. Houd je profiel actueel zodat bedrijven je geldige certificeringen kunnen zien.",
      button: "Mijn certificeringen bijwerken",
      note: "Je ontvangt deze meldingen omdat ze zijn ingeschakeld in je PIPINGBOX-profiel.",
      footer_reason: "Je ontvangt dit bericht omdat certificeringsmeldingen zijn ingeschakeld voor je PIPINGBOX-account."
    },
    lead_receipt: {
      subject: "PIPINGBOX \xB7 We hebben je aanvraag ontvangen",
      preheader: "Bedankt dat je contact hebt opgenomen met PIPINGBOX.",
      heading: "We hebben je aanvraag ontvangen",
      body: "Hallo {name}, bedankt dat je contact hebt opgenomen met PIPINGBOX. We hebben je personeelsaanvraag ontvangen en ons team neemt binnenkort contact met je op met een voorstel.",
      footer_reason: "Je ontvangt dit bericht omdat je een contactformulier hebt verzonden op pipingbox.com."
    },
    application_pending_profile: {
      subject: "PIPINGBOX \xB7 Sollicitatie ontvangen \u2014 voltooi je profiel om te activeren",
      preheader: "We hebben je sollicitatie voor {jobTitle} ontvangen.",
      heading: "Sollicitatie ontvangen \u2014 voltooi je profiel om te activeren",
      body: "We hebben je sollicitatie voor \xAB{jobTitle}\xBB bij {company} goed ontvangen. Je kunt blijven solliciteren op andere vacatures: al je sollicitaties worden bewaard. Deze sollicitatie kan nog niet aan het bedrijf worden gepresenteerd; voltooi je profiel totdat het volledig is gevalideerd (Marketplace Ready) om ze te activeren.",
      body_no_company: "We hebben je sollicitatie voor \xAB{jobTitle}\xBB goed ontvangen. Je kunt blijven solliciteren op andere vacatures: al je sollicitaties worden bewaard. Deze sollicitatie kan nog niet aan het bedrijf worden gepresenteerd; voltooi je profiel totdat het volledig is gevalideerd (Marketplace Ready) om ze te activeren.",
      note: "Je sollicitatie is NIET afgewezen: ze wacht alleen tot je profiel is gevalideerd. Zodra je profiel Marketplace Ready is, wordt ze automatisch beoordeeld voor presentatie aan bedrijven.",
      pending_intro: "Wat er nog ontbreekt in je profiel:",
      pending_items: {
        photo: "Profielfoto",
        basic_details: "Naam en beroep",
        location: "Locatie",
        years_experience: "Jaren ervaring",
        skills: "Vaardigheden",
        bio: "Over jou (bio)",
        cv: "CV",
        experience: "Werkervaring",
        certifications: "Certificeringen",
        documents: "Documenten"
      },
      button: "Voltooi mijn profiel",
      footer_reason: "Je ontvangt dit bericht omdat je hebt gesolliciteerd op een vacature bij PIPINGBOX."
    },
    marketplace_ready: {
      subject: "PIPINGBOX \xB7 Profiel gevalideerd \u2014 je sollicitaties kunnen nu worden beoordeeld",
      preheader: "Je profiel is nu Marketplace Ready.",
      heading: "Profiel gevalideerd \u2014 je sollicitaties kunnen nu worden beoordeeld",
      body_single: "Je profiel is nu gevalideerd en je bent Marketplace Ready. Je sollicitatie voor \xAB{jobTitle}\xBB kan nu worden beoordeeld voor presentatie aan bedrijven.",
      body_multiple: "Je profiel is nu gevalideerd en je bent Marketplace Ready. Je {count} lopende sollicitaties kunnen nu worden beoordeeld voor presentatie aan bedrijven.",
      activated_list_intro: "Geactiveerde sollicitaties:",
      note: "Je hoeft verder niets te doen: ons team beoordeelt elke sollicitatie op basis van de specifieke eisen van elke vacature en neemt contact met je op.",
      button: "Bekijk mijn sollicitaties",
      footer_reason: "Je ontvangt dit bericht omdat je PIPINGBOX-profiel Marketplace Ready heeft bereikt."
    },
    cv_review_pending: {
      subject: "PIPINGBOX \xB7 We hebben je CV ontvangen \u2014 bekijk je profiel",
      preheader: "We hebben je professionele profiel opgesteld op basis van je CV.",
      heading: "Je professionele profiel staat klaar om te bekijken",
      body: "Hallo! We hebben je CV ontvangen en daar je professionele profiel uit opgesteld. Bekijk de gegevens zodat PIPINGBOX je in overweging kan nemen voor passende opdrachten.",
      button: "Bekijk mijn profiel",
      note: "Er is nog niets gepubliceerd: de ge\xEBxtraheerde gegevens worden pas onderdeel van je profiel nadat je ze hebt bekeken en bevestigd. Certificaten die in je CV worden genoemd, worden geregistreerd als aangegeven, niet als geverifieerd.",
      footer_reason: "Je ontvangt dit bericht omdat PIPINGBOX een CV heeft ontvangen dat aan jouw account is gekoppeld."
    }
  }
};
var nl_default = nl;

// _shared/email-i18n/locales/fr.ts
var fr = {
  code: "fr",
  common: {
    brand_tagline: "Plateforme professionnelle pour le soudage et la construction industrielle",
    button_fallback: "Si le bouton ne fonctionne pas, copiez cette adresse dans votre navigateur :",
    security_title: "Informations de s\xE9curit\xE9",
    expires: "Ce lien expire dans {minutes} minutes et ne peut \xEAtre utilis\xE9 qu'une seule fois. S'il a expir\xE9, vous pouvez en demander un nouveau depuis l'\xE9cran de connexion de PIPINGBOX.",
    never_share: "Ne partagez jamais ce lien ni ce code. PIPINGBOX ne vous demandera jamais votre mot de passe par e-mail, par t\xE9l\xE9phone ou par messagerie.",
    support_prompt: "En cas de doute sur ce message, \xE9crivez \xE0 {support} avant d'ouvrir le lien.",
    not_you: "Si vous n'\xEAtes pas \xE0 l'origine de cette modification, contactez imm\xE9diatement {support} et r\xE9initialisez votre mot de passe.",
    footer_no_reply: "Message automatique de PIPINGBOX. Cette adresse n'accepte pas les r\xE9ponses ; pour toute question, \xE9crivez \xE0 {support}.",
    code_label: "Votre code de v\xE9rification"
  },
  templates: {
    confirmation: {
      subject: "PIPINGBOX \xB7 Confirmez votre compte",
      preheader: "Confirmez votre adresse e-mail pour activer votre compte PIPINGBOX.",
      heading: "Confirmez votre compte",
      body: "Merci de vous \xEAtre inscrit sur PIPINGBOX avec l'adresse {email}. Pour activer votre compte, confirmez que cette adresse e-mail vous appartient.",
      button: "Confirmer mon compte",
      note: "Si vous ne vous \xEAtes pas inscrit sur PIPINGBOX, vous n'avez rien \xE0 faire : le compte restera non confirm\xE9, ne sera pas activ\xE9 et ne pourra pas \xEAtre utilis\xE9 pour acc\xE9der \xE0 la plateforme.",
      footer_reason: "Vous recevez ce message parce qu'une personne a demand\xE9 la cr\xE9ation d'un compte PIPINGBOX avec cette adresse."
    },
    recovery: {
      subject: "PIPINGBOX \xB7 R\xE9initialisez votre mot de passe",
      preheader: "Nous avons re\xE7u une demande de r\xE9initialisation du mot de passe de votre compte PIPINGBOX.",
      heading: "R\xE9initialisez votre mot de passe",
      body: "Nous avons re\xE7u une demande de r\xE9initialisation du mot de passe du compte PIPINGBOX associ\xE9 \xE0 {email}. Utilisez le bouton ci-dessous pour choisir un nouveau mot de passe.",
      button: "Choisir un nouveau mot de passe",
      note: "Si vous n'avez pas demand\xE9 cette modification, vous pouvez ignorer ce message : votre mot de passe restera inchang\xE9.",
      footer_reason: "Vous recevez ce message parce qu'une r\xE9initialisation du mot de passe a \xE9t\xE9 demand\xE9e pour cette adresse."
    },
    magic_link: {
      subject: "PIPINGBOX \xB7 Votre lien de connexion",
      preheader: "Utilisez ce lien pour vous connecter \xE0 PIPINGBOX.",
      heading: "Connectez-vous \xE0 PIPINGBOX",
      body: "Utilisez le bouton ci-dessous pour vous connecter \xE0 PIPINGBOX avec l'adresse {email}.",
      button: "Se connecter",
      note: "Si vous n'avez pas demand\xE9 ce lien, vous pouvez ignorer ce message : personne ne peut se connecter sans lui.",
      footer_reason: "Vous recevez ce message parce qu'un lien de connexion a \xE9t\xE9 demand\xE9 pour cette adresse."
    },
    invite: {
      subject: "PIPINGBOX \xB7 Vous avez \xE9t\xE9 invit\xE9",
      preheader: "Vous avez \xE9t\xE9 invit\xE9 \xE0 rejoindre PIPINGBOX.",
      heading: "Vous avez \xE9t\xE9 invit\xE9 sur PIPINGBOX",
      body: "Vous avez \xE9t\xE9 invit\xE9 \xE0 cr\xE9er un compte PIPINGBOX avec l'adresse {email}. Utilisez le bouton ci-dessous pour accepter l'invitation et configurer votre compte.",
      button: "Accepter l'invitation",
      note: "Si vous n'attendiez pas cette invitation, vous pouvez ignorer ce message.",
      footer_reason: "Vous recevez ce message parce qu'une personne a invit\xE9 cette adresse sur PIPINGBOX."
    },
    email_change_current: {
      subject: "PIPINGBOX \xB7 Confirmez le changement d'adresse e-mail",
      preheader: "Confirmez le changement d'adresse e-mail de votre compte PIPINGBOX.",
      heading: "Confirmez le changement d'adresse e-mail",
      body: "Une demande a \xE9t\xE9 faite pour remplacer l'adresse e-mail de votre compte PIPINGBOX, {email}, par {newEmail}. Pour autoriser ce changement, confirmez-le depuis votre adresse actuelle.",
      button: "Confirmer le changement",
      note: "Si vous n'avez pas demand\xE9 ce changement, n'utilisez pas le lien : contactez imm\xE9diatement {support} et r\xE9initialisez votre mot de passe.",
      footer_reason: "Vous recevez ce message parce qu'un changement d'adresse e-mail a \xE9t\xE9 demand\xE9 sur le compte associ\xE9 \xE0 cette adresse."
    },
    email_change_new: {
      subject: "PIPINGBOX \xB7 Confirmez votre nouvelle adresse e-mail",
      preheader: "Confirmez {newEmail} comme nouvelle adresse de votre compte PIPINGBOX.",
      heading: "Confirmez votre nouvelle adresse e-mail",
      body: "Confirmez {newEmail} comme nouvelle adresse e-mail de votre compte PIPINGBOX.",
      button: "Confirmer la nouvelle adresse",
      note: "Si vous n'avez pas demand\xE9 ce changement, vous pouvez ignorer ce message : l'adresse ne sera pas modifi\xE9e.",
      footer_reason: "Vous recevez ce message parce que cette adresse a \xE9t\xE9 propos\xE9e comme nouvelle adresse d'un compte PIPINGBOX."
    },
    reauthentication: {
      subject: "PIPINGBOX \xB7 Votre code de v\xE9rification",
      preheader: "Utilisez ce code pour confirmer votre identit\xE9 sur PIPINGBOX.",
      heading: "Votre code de v\xE9rification",
      body: "Saisissez le code ci-dessous dans PIPINGBOX pour confirmer votre identit\xE9. Il expire dans {minutes} minutes et ne peut \xEAtre utilis\xE9 qu'une seule fois.",
      footer_reason: "Vous recevez ce message parce qu'une action sensible sur votre compte PIPINGBOX a n\xE9cessit\xE9 une v\xE9rification d'identit\xE9."
    },
    password_changed_notification: {
      subject: "PIPINGBOX \xB7 Votre mot de passe a \xE9t\xE9 modifi\xE9",
      preheader: "Le mot de passe de votre compte PIPINGBOX a \xE9t\xE9 modifi\xE9.",
      heading: "Votre mot de passe a \xE9t\xE9 modifi\xE9",
      body: "Le mot de passe du compte PIPINGBOX associ\xE9 \xE0 {email} a \xE9t\xE9 modifi\xE9 r\xE9cemment.",
      footer_reason: "Vous recevez cet avis de s\xE9curit\xE9 en raison d'une modification de votre compte PIPINGBOX."
    },
    email_changed_notification: {
      subject: "PIPINGBOX \xB7 Votre adresse e-mail a \xE9t\xE9 modifi\xE9e",
      preheader: "L'adresse e-mail de votre compte PIPINGBOX a \xE9t\xE9 modifi\xE9e.",
      heading: "Votre adresse e-mail a \xE9t\xE9 modifi\xE9e",
      body: "L'adresse e-mail de votre compte PIPINGBOX a \xE9t\xE9 remplac\xE9e : {oldEmail} devient {email}.",
      footer_reason: "Vous recevez cet avis de s\xE9curit\xE9 en raison d'une modification de votre compte PIPINGBOX."
    },
    phone_changed_notification: {
      subject: "PIPINGBOX \xB7 Votre num\xE9ro de t\xE9l\xE9phone a \xE9t\xE9 modifi\xE9",
      preheader: "Le num\xE9ro de t\xE9l\xE9phone de votre compte PIPINGBOX a \xE9t\xE9 modifi\xE9.",
      heading: "Votre num\xE9ro de t\xE9l\xE9phone a \xE9t\xE9 modifi\xE9",
      body: "Le num\xE9ro de t\xE9l\xE9phone de votre compte PIPINGBOX a \xE9t\xE9 remplac\xE9 : {oldPhone} devient {phone}.",
      footer_reason: "Vous recevez cet avis de s\xE9curit\xE9 en raison d'une modification de votre compte PIPINGBOX."
    },
    identity_linked_notification: {
      subject: "PIPINGBOX \xB7 Une nouvelle m\xE9thode de connexion a \xE9t\xE9 associ\xE9e",
      preheader: "Une nouvelle m\xE9thode de connexion a \xE9t\xE9 associ\xE9e \xE0 votre compte PIPINGBOX.",
      heading: "Une nouvelle m\xE9thode de connexion a \xE9t\xE9 associ\xE9e",
      body: "Votre compte {provider} a \xE9t\xE9 associ\xE9 comme nouvelle m\xE9thode de connexion pour {email}.",
      footer_reason: "Vous recevez cet avis de s\xE9curit\xE9 en raison d'une modification de votre compte PIPINGBOX."
    },
    identity_unlinked_notification: {
      subject: "PIPINGBOX \xB7 Une m\xE9thode de connexion a \xE9t\xE9 supprim\xE9e",
      preheader: "Une m\xE9thode de connexion a \xE9t\xE9 supprim\xE9e de votre compte PIPINGBOX.",
      heading: "Une m\xE9thode de connexion a \xE9t\xE9 supprim\xE9e",
      body: "Votre compte {provider} a \xE9t\xE9 supprim\xE9 des m\xE9thodes de connexion pour {email}.",
      footer_reason: "Vous recevez cet avis de s\xE9curit\xE9 en raison d'une modification de votre compte PIPINGBOX."
    },
    mfa_factor_enrolled_notification: {
      subject: "PIPINGBOX \xB7 Une nouvelle m\xE9thode de v\xE9rification a \xE9t\xE9 ajout\xE9e",
      preheader: "Une nouvelle m\xE9thode de v\xE9rification a \xE9t\xE9 ajout\xE9e \xE0 votre compte PIPINGBOX.",
      heading: "Une nouvelle m\xE9thode de v\xE9rification a \xE9t\xE9 ajout\xE9e",
      body: "Une nouvelle m\xE9thode de v\xE9rification de connexion ({factorType}) a \xE9t\xE9 ajout\xE9e \xE0 votre compte PIPINGBOX.",
      footer_reason: "Vous recevez cet avis de s\xE9curit\xE9 en raison d'une modification de votre compte PIPINGBOX."
    },
    mfa_factor_unenrolled_notification: {
      subject: "PIPINGBOX \xB7 Une m\xE9thode de v\xE9rification a \xE9t\xE9 supprim\xE9e",
      preheader: "Une m\xE9thode de v\xE9rification a \xE9t\xE9 supprim\xE9e de votre compte PIPINGBOX.",
      heading: "Une m\xE9thode de v\xE9rification a \xE9t\xE9 supprim\xE9e",
      body: "Une m\xE9thode de v\xE9rification de connexion ({factorType}) a \xE9t\xE9 supprim\xE9e de votre compte PIPINGBOX.",
      footer_reason: "Vous recevez cet avis de s\xE9curit\xE9 en raison d'une modification de votre compte PIPINGBOX."
    },
    job_match: {
      subject: "PIPINGBOX \xB7 Nouvelle offre correspondant \xE0 votre profil : {jobTitle}",
      preheader: "{score} % de compatibilit\xE9 avec \xAB {jobTitle} \xBB.",
      heading: "Nouvelle offre correspondant \xE0 votre profil",
      body: "Nous avons trouv\xE9 une offre d'emploi pr\xE9sentant {score} % de compatibilit\xE9 avec votre profil : \xAB {jobTitle} \xBB chez {company}.",
      body_no_company: "Nous avons trouv\xE9 une offre d'emploi pr\xE9sentant {score} % de compatibilit\xE9 avec votre profil : \xAB {jobTitle} \xBB.",
      button: "Voir l'offre",
      note: "Vous recevez des alertes emploi parce qu'elles sont activ\xE9es dans votre profil PIPINGBOX. Vous pouvez les d\xE9sactiver \xE0 tout moment depuis vos pr\xE9f\xE9rences de compatibilit\xE9.",
      footer_reason: "Vous recevez ce message parce que les alertes emploi sont activ\xE9es sur votre compte PIPINGBOX."
    },
    workforce_match: {
      subject: "PIPINGBOX \xB7 Nouvelle demande de personnel correspondant \xE0 votre profil",
      preheader: "Une entreprise recherche des professionnels {workerType} en {country}.",
      heading: "Nouvelle demande de personnel",
      body: "Une entreprise a publi\xE9 une demande de personnel pr\xE9sentant {score} % de compatibilit\xE9 avec votre profil : {workerType} en {country}.",
      button: "Voir la demande",
      note: "Vous recevez ces alertes parce qu'elles sont activ\xE9es dans votre profil PIPINGBOX. Vous pouvez les d\xE9sactiver \xE0 tout moment depuis vos pr\xE9f\xE9rences de compatibilit\xE9.",
      footer_reason: "Vous recevez ce message parce que les alertes emploi sont activ\xE9es sur votre compte PIPINGBOX."
    },
    cert_expiry: {
      subject: "PIPINGBOX \xB7 Votre certification {certName} expire bient\xF4t",
      preheader: "{certName} expire le {expiresOn}.",
      heading: "Certification sur le point d'expirer",
      body: "Votre certification {certName} expire le {expiresOn}. Maintenez votre profil \xE0 jour pour que les entreprises voient vos certifications en cours de validit\xE9.",
      button: "Mettre \xE0 jour mes certifications",
      note: "Vous recevez ces alertes parce qu'elles sont activ\xE9es dans votre profil PIPINGBOX.",
      footer_reason: "Vous recevez ce message parce que les alertes de certification sont activ\xE9es sur votre compte PIPINGBOX."
    },
    lead_receipt: {
      subject: "PIPINGBOX \xB7 Nous avons bien re\xE7u votre demande",
      preheader: "Merci d'avoir contact\xE9 PIPINGBOX.",
      heading: "Nous avons bien re\xE7u votre demande",
      body: "Bonjour {name}, merci d'avoir contact\xE9 PIPINGBOX. Nous avons bien re\xE7u votre demande de personnel et notre \xE9quipe vous recontactera prochainement avec une proposition.",
      footer_reason: "Vous recevez ce message parce que vous avez envoy\xE9 un formulaire de contact sur pipingbox.com."
    },
    application_pending_profile: {
      subject: "PIPINGBOX \xB7 Candidature re\xE7ue \u2014 compl\xE9tez votre profil pour l'activer",
      preheader: "Nous avons bien re\xE7u votre candidature pour {jobTitle}.",
      heading: "Candidature re\xE7ue \u2014 compl\xE9tez votre profil pour l'activer",
      body: "Nous avons bien re\xE7u votre candidature pour \xAB {jobTitle} \xBB chez {company}. Vous pouvez continuer \xE0 postuler \xE0 d'autres offres : toutes vos candidatures sont enregistr\xE9es. Cette candidature ne peut pas encore \xEAtre pr\xE9sent\xE9e \xE0 l'entreprise ; pour l'activer, compl\xE9tez votre profil jusqu'\xE0 sa validation compl\xE8te (Marketplace Ready).",
      body_no_company: "Nous avons bien re\xE7u votre candidature pour \xAB {jobTitle} \xBB. Vous pouvez continuer \xE0 postuler \xE0 d'autres offres : toutes vos candidatures sont enregistr\xE9es. Cette candidature ne peut pas encore \xEAtre pr\xE9sent\xE9e \xE0 l'entreprise ; pour l'activer, compl\xE9tez votre profil jusqu'\xE0 sa validation compl\xE8te (Marketplace Ready).",
      note: "Votre candidature N'A PAS \xE9t\xE9 rejet\xE9e : elle attend simplement la validation de votre profil. D\xE8s que votre profil est Marketplace Ready, elle sera automatiquement examin\xE9e pour \xEAtre pr\xE9sent\xE9e aux entreprises.",
      pending_intro: "Ce qui manque \xE0 votre profil :",
      pending_items: {
        photo: "Photo de profil",
        basic_details: "Nom et profession",
        location: "Localisation",
        years_experience: "Ann\xE9es d'exp\xE9rience",
        skills: "Comp\xE9tences",
        bio: "\xC0 propos de vous (bio)",
        cv: "CV",
        experience: "Exp\xE9rience professionnelle",
        certifications: "Certifications",
        documents: "Documents"
      },
      button: "Compl\xE9ter mon profil",
      footer_reason: "Vous recevez ce message car vous avez postul\xE9 \xE0 une offre sur PIPINGBOX."
    },
    marketplace_ready: {
      subject: "PIPINGBOX \xB7 Profil valid\xE9 \u2014 vos candidatures peuvent maintenant \xEAtre examin\xE9es",
      preheader: "Votre profil est d\xE9sormais Marketplace Ready.",
      heading: "Profil valid\xE9 \u2014 vos candidatures peuvent maintenant \xEAtre examin\xE9es",
      body_single: "Votre profil est d\xE9sormais valid\xE9 et vous \xEAtes Marketplace Ready. Votre candidature pour \xAB {jobTitle} \xBB peut maintenant \xEAtre examin\xE9e en vue de sa pr\xE9sentation aux entreprises.",
      body_multiple: "Votre profil est d\xE9sormais valid\xE9 et vous \xEAtes Marketplace Ready. Vos {count} candidatures en attente peuvent maintenant \xEAtre examin\xE9es en vue de leur pr\xE9sentation aux entreprises.",
      activated_list_intro: "Candidatures activ\xE9es :",
      note: "Vous n'avez rien d'autre \xE0 faire : notre \xE9quipe examine chaque candidature selon les exigences propres \xE0 chaque offre et vous contactera.",
      button: "Voir mes candidatures",
      footer_reason: "Vous recevez ce message car votre profil PIPINGBOX a atteint Marketplace Ready."
    },
    cv_review_pending: {
      subject: "PIPINGBOX \xB7 Nous avons re\xE7u votre CV \u2014 v\xE9rifiez votre profil",
      preheader: "Nous avons pr\xE9par\xE9 votre profil professionnel \xE0 partir de votre CV.",
      heading: "Votre profil professionnel est pr\xEAt \xE0 \xEAtre v\xE9rifi\xE9",
      body: "Bonjour, nous avons re\xE7u votre CV et pr\xE9par\xE9 votre profil professionnel \xE0 partir de celui-ci. V\xE9rifiez les donn\xE9es pour que PIPINGBOX puisse vous prendre en compte pour des opportunit\xE9s compatibles.",
      button: "V\xE9rifier mon profil",
      note: "Rien n'a encore \xE9t\xE9 publi\xE9 : les donn\xE9es extraites ne font partie de votre profil qu'apr\xE8s votre v\xE9rification et confirmation. Les certifications mentionn\xE9es dans votre CV sont enregistr\xE9es comme d\xE9clar\xE9es, non v\xE9rifi\xE9es.",
      footer_reason: "Vous recevez ce message parce que PIPINGBOX a re\xE7u un CV associ\xE9 \xE0 votre compte."
    }
  }
};
var fr_default = fr;

// _shared/email-i18n/locales/de.ts
var de = {
  code: "de",
  common: {
    brand_tagline: "Professionelle Plattform f\xFCr Schwei\xDFtechnik und Industriebau",
    button_fallback: "Falls die Schaltfl\xE4che nicht funktioniert, kopieren Sie diese Adresse in Ihren Browser:",
    security_title: "Sicherheitshinweise",
    expires: "Dieser Link ist {minutes} Minuten g\xFCltig und kann nur einmal verwendet werden. Ist er abgelaufen, k\xF6nnen Sie \xFCber die Anmeldeseite von PIPINGBOX einen neuen anfordern.",
    never_share: "Geben Sie diesen Link oder Code niemals weiter. PIPINGBOX wird Sie nie per E-Mail, Telefon oder Chat nach Ihrem Passwort fragen.",
    support_prompt: "Wenn Sie Zweifel an dieser Nachricht haben, wenden Sie sich an {support}, bevor Sie den Link \xF6ffnen.",
    not_you: "Wenn Sie diese \xC4nderung nicht vorgenommen haben, wenden Sie sich sofort an {support} und setzen Sie Ihr Passwort zur\xFCck.",
    footer_no_reply: "Automatische Nachricht von PIPINGBOX. Antworten an diese Adresse werden nicht gelesen; bei Fragen schreiben Sie an {support}.",
    code_label: "Ihr Best\xE4tigungscode"
  },
  templates: {
    confirmation: {
      subject: "PIPINGBOX \xB7 Best\xE4tigen Sie Ihr Konto",
      preheader: "Best\xE4tigen Sie Ihre E-Mail-Adresse, um Ihr PIPINGBOX-Konto zu aktivieren.",
      heading: "Best\xE4tigen Sie Ihr Konto",
      body: "Vielen Dank f\xFCr Ihre Registrierung bei PIPINGBOX mit der Adresse {email}. Um Ihr Konto zu aktivieren, best\xE4tigen Sie bitte, dass diese E-Mail-Adresse Ihnen geh\xF6rt.",
      button: "Mein Konto best\xE4tigen",
      note: "Falls Sie sich nicht bei PIPINGBOX registriert haben, m\xFCssen Sie nichts tun: Das Konto bleibt unbest\xE4tigt, wird nicht aktiviert und kann nicht f\xFCr den Zugang zur Plattform genutzt werden.",
      footer_reason: "Sie erhalten diese Nachricht, weil jemand die Erstellung eines PIPINGBOX-Kontos mit dieser Adresse angefordert hat."
    },
    recovery: {
      subject: "PIPINGBOX \xB7 Passwort zur\xFCcksetzen",
      preheader: "Wir haben eine Anfrage zum Zur\xFCcksetzen des Passworts Ihres PIPINGBOX-Kontos erhalten.",
      heading: "Passwort zur\xFCcksetzen",
      body: "Wir haben eine Anfrage zum Zur\xFCcksetzen des Passworts f\xFCr das PIPINGBOX-Konto mit der Adresse {email} erhalten. W\xE4hlen Sie \xFCber die Schaltfl\xE4che unten ein neues Passwort.",
      button: "Neues Passwort w\xE4hlen",
      note: "Falls Sie diese \xC4nderung nicht angefordert haben, k\xF6nnen Sie diese Nachricht ignorieren: Ihr Passwort bleibt unver\xE4ndert.",
      footer_reason: "Sie erhalten diese Nachricht, weil f\xFCr diese Adresse das Zur\xFCcksetzen des Passworts angefordert wurde."
    },
    magic_link: {
      subject: "PIPINGBOX \xB7 Ihr Anmeldelink",
      preheader: "Verwenden Sie diesen Link, um sich bei PIPINGBOX anzumelden.",
      heading: "Bei PIPINGBOX anmelden",
      body: "Melden Sie sich \xFCber die Schaltfl\xE4che unten mit der Adresse {email} bei PIPINGBOX an.",
      button: "Anmelden",
      note: "Falls Sie diesen Link nicht angefordert haben, k\xF6nnen Sie diese Nachricht ignorieren: Ohne den Link kann sich niemand anmelden.",
      footer_reason: "Sie erhalten diese Nachricht, weil f\xFCr diese Adresse ein Anmeldelink angefordert wurde."
    },
    invite: {
      subject: "PIPINGBOX \xB7 Sie wurden eingeladen",
      preheader: "Sie wurden eingeladen, PIPINGBOX beizutreten.",
      heading: "Sie wurden zu PIPINGBOX eingeladen",
      body: "Sie wurden eingeladen, ein PIPINGBOX-Konto mit der Adresse {email} zu erstellen. Nehmen Sie die Einladung \xFCber die Schaltfl\xE4che unten an und richten Sie Ihr Konto ein.",
      button: "Einladung annehmen",
      note: "Falls Sie diese Einladung nicht erwartet haben, k\xF6nnen Sie diese Nachricht ignorieren.",
      footer_reason: "Sie erhalten diese Nachricht, weil jemand diese Adresse zu PIPINGBOX eingeladen hat."
    },
    email_change_current: {
      subject: "PIPINGBOX \xB7 Best\xE4tigen Sie die \xC4nderung Ihrer E-Mail-Adresse",
      preheader: "Best\xE4tigen Sie die \xC4nderung der E-Mail-Adresse Ihres PIPINGBOX-Kontos.",
      heading: "Best\xE4tigen Sie die \xC4nderung Ihrer E-Mail-Adresse",
      body: "Es wurde beantragt, die E-Mail-Adresse Ihres PIPINGBOX-Kontos von {email} zu {newEmail} zu \xE4ndern. Um die \xC4nderung zu genehmigen, best\xE4tigen Sie sie von Ihrer aktuellen Adresse aus.",
      button: "\xC4nderung best\xE4tigen",
      note: "Falls Sie diese \xC4nderung nicht angefordert haben, verwenden Sie den Link nicht: Wenden Sie sich sofort an {support} und setzen Sie Ihr Passwort zur\xFCck.",
      footer_reason: "Sie erhalten diese Nachricht, weil f\xFCr das Konto mit dieser Adresse eine \xC4nderung der E-Mail-Adresse beantragt wurde."
    },
    email_change_new: {
      subject: "PIPINGBOX \xB7 Best\xE4tigen Sie Ihre neue E-Mail-Adresse",
      preheader: "Best\xE4tigen Sie {newEmail} als neue Adresse Ihres PIPINGBOX-Kontos.",
      heading: "Best\xE4tigen Sie Ihre neue E-Mail-Adresse",
      body: "Best\xE4tigen Sie {newEmail} als neue E-Mail-Adresse Ihres PIPINGBOX-Kontos.",
      button: "Neue Adresse best\xE4tigen",
      note: "Falls Sie diese \xC4nderung nicht angefordert haben, k\xF6nnen Sie diese Nachricht ignorieren: Die Adresse wird nicht ge\xE4ndert.",
      footer_reason: "Sie erhalten diese Nachricht, weil diese Adresse als neue Adresse eines PIPINGBOX-Kontos vorgeschlagen wurde."
    },
    reauthentication: {
      subject: "PIPINGBOX \xB7 Ihr Best\xE4tigungscode",
      preheader: "Verwenden Sie diesen Code, um Ihre Identit\xE4t bei PIPINGBOX zu best\xE4tigen.",
      heading: "Ihr Best\xE4tigungscode",
      body: "Geben Sie den folgenden Code bei PIPINGBOX ein, um Ihre Identit\xE4t zu best\xE4tigen. Er ist {minutes} Minuten g\xFCltig und kann nur einmal verwendet werden.",
      footer_reason: "Sie erhalten diese Nachricht, weil eine sicherheitsrelevante Aktion in Ihrem PIPINGBOX-Konto eine Identit\xE4tspr\xFCfung erforderte."
    },
    password_changed_notification: {
      subject: "PIPINGBOX \xB7 Ihr Passwort wurde ge\xE4ndert",
      preheader: "Das Passwort Ihres PIPINGBOX-Kontos wurde ge\xE4ndert.",
      heading: "Ihr Passwort wurde ge\xE4ndert",
      body: "Das Passwort des PIPINGBOX-Kontos mit der Adresse {email} wurde k\xFCrzlich ge\xE4ndert.",
      footer_reason: "Sie erhalten diesen Sicherheitshinweis aufgrund einer \xC4nderung an Ihrem PIPINGBOX-Konto."
    },
    email_changed_notification: {
      subject: "PIPINGBOX \xB7 Ihre E-Mail-Adresse wurde ge\xE4ndert",
      preheader: "Die E-Mail-Adresse Ihres PIPINGBOX-Kontos wurde ge\xE4ndert.",
      heading: "Ihre E-Mail-Adresse wurde ge\xE4ndert",
      body: "Die E-Mail-Adresse Ihres PIPINGBOX-Kontos wurde von {oldEmail} zu {email} ge\xE4ndert.",
      footer_reason: "Sie erhalten diesen Sicherheitshinweis aufgrund einer \xC4nderung an Ihrem PIPINGBOX-Konto."
    },
    phone_changed_notification: {
      subject: "PIPINGBOX \xB7 Ihre Telefonnummer wurde ge\xE4ndert",
      preheader: "Die Telefonnummer Ihres PIPINGBOX-Kontos wurde ge\xE4ndert.",
      heading: "Ihre Telefonnummer wurde ge\xE4ndert",
      body: "Die Telefonnummer Ihres PIPINGBOX-Kontos wurde von {oldPhone} zu {phone} ge\xE4ndert.",
      footer_reason: "Sie erhalten diesen Sicherheitshinweis aufgrund einer \xC4nderung an Ihrem PIPINGBOX-Konto."
    },
    identity_linked_notification: {
      subject: "PIPINGBOX \xB7 Neue Anmeldemethode verkn\xFCpft",
      preheader: "Mit Ihrem PIPINGBOX-Konto wurde eine neue Anmeldemethode verkn\xFCpft.",
      heading: "Neue Anmeldemethode verkn\xFCpft",
      body: "Ihr {provider}-Konto wurde als neue Anmeldemethode f\xFCr {email} verkn\xFCpft.",
      footer_reason: "Sie erhalten diesen Sicherheitshinweis aufgrund einer \xC4nderung an Ihrem PIPINGBOX-Konto."
    },
    identity_unlinked_notification: {
      subject: "PIPINGBOX \xB7 Anmeldemethode entfernt",
      preheader: "Aus Ihrem PIPINGBOX-Konto wurde eine Anmeldemethode entfernt.",
      heading: "Anmeldemethode entfernt",
      body: "Ihr {provider}-Konto wurde als Anmeldemethode f\xFCr {email} entfernt.",
      footer_reason: "Sie erhalten diesen Sicherheitshinweis aufgrund einer \xC4nderung an Ihrem PIPINGBOX-Konto."
    },
    mfa_factor_enrolled_notification: {
      subject: "PIPINGBOX \xB7 Neue Verifizierungsmethode hinzugef\xFCgt",
      preheader: "Ihrem PIPINGBOX-Konto wurde eine neue Verifizierungsmethode hinzugef\xFCgt.",
      heading: "Neue Verifizierungsmethode hinzugef\xFCgt",
      body: "Ihrem PIPINGBOX-Konto wurde eine neue Anmelde-Verifizierungsmethode ({factorType}) hinzugef\xFCgt.",
      footer_reason: "Sie erhalten diesen Sicherheitshinweis aufgrund einer \xC4nderung an Ihrem PIPINGBOX-Konto."
    },
    mfa_factor_unenrolled_notification: {
      subject: "PIPINGBOX \xB7 Verifizierungsmethode entfernt",
      preheader: "Aus Ihrem PIPINGBOX-Konto wurde eine Verifizierungsmethode entfernt.",
      heading: "Verifizierungsmethode entfernt",
      body: "Aus Ihrem PIPINGBOX-Konto wurde eine Anmelde-Verifizierungsmethode ({factorType}) entfernt.",
      footer_reason: "Sie erhalten diesen Sicherheitshinweis aufgrund einer \xC4nderung an Ihrem PIPINGBOX-Konto."
    },
    job_match: {
      subject: "PIPINGBOX \xB7 Neues Stellenangebot passend zu Ihrem Profil: {jobTitle}",
      preheader: "{score} % \xDCbereinstimmung mit \u201E{jobTitle}\u201C.",
      heading: "Neues Stellenangebot passend zu Ihrem Profil",
      body: "Wir haben ein Stellenangebot mit {score} % \xDCbereinstimmung mit Ihrem Profil gefunden: \u201E{jobTitle}\u201C bei {company}.",
      body_no_company: "Wir haben ein Stellenangebot mit {score} % \xDCbereinstimmung mit Ihrem Profil gefunden: \u201E{jobTitle}\u201C.",
      button: "Angebot ansehen",
      note: "Sie erhalten Stellenbenachrichtigungen, weil diese in Ihrem PIPINGBOX-Profil aktiviert sind. Sie k\xF6nnen sie jederzeit in Ihren Matching-Einstellungen deaktivieren.",
      footer_reason: "Sie erhalten diese Nachricht, weil in Ihrem PIPINGBOX-Konto Stellenbenachrichtigungen aktiviert sind."
    },
    workforce_match: {
      subject: "PIPINGBOX \xB7 Neue Personalanfrage passend zu Ihrem Profil",
      preheader: "Ein Unternehmen sucht Fachkr\xE4fte ({workerType}) in {country}.",
      heading: "Neue Personalanfrage",
      body: "Ein Unternehmen hat eine Personalanfrage mit {score} % \xDCbereinstimmung mit Ihrem Profil ver\xF6ffentlicht: {workerType} in {country}.",
      button: "Anfrage ansehen",
      note: "Sie erhalten diese Benachrichtigungen, weil sie in Ihrem PIPINGBOX-Profil aktiviert sind. Sie k\xF6nnen sie jederzeit in Ihren Matching-Einstellungen deaktivieren.",
      footer_reason: "Sie erhalten diese Nachricht, weil in Ihrem PIPINGBOX-Konto Stellenbenachrichtigungen aktiviert sind."
    },
    cert_expiry: {
      subject: "PIPINGBOX \xB7 Ihre Zertifizierung {certName} l\xE4uft bald ab",
      preheader: "{certName} l\xE4uft am {expiresOn} ab.",
      heading: "Zertifizierung l\xE4uft bald ab",
      body: "Ihre Zertifizierung {certName} l\xE4uft am {expiresOn} ab. Halten Sie Ihr Profil aktuell, damit Unternehmen Ihre g\xFCltigen Zertifizierungen sehen.",
      button: "Meine Zertifizierungen aktualisieren",
      note: "Sie erhalten diese Benachrichtigungen, weil sie in Ihrem PIPINGBOX-Profil aktiviert sind.",
      footer_reason: "Sie erhalten diese Nachricht, weil in Ihrem PIPINGBOX-Konto Zertifizierungsbenachrichtigungen aktiviert sind."
    },
    lead_receipt: {
      subject: "PIPINGBOX \xB7 Wir haben Ihre Anfrage erhalten",
      preheader: "Vielen Dank f\xFCr Ihre Kontaktaufnahme mit PIPINGBOX.",
      heading: "Wir haben Ihre Anfrage erhalten",
      body: "Guten Tag {name}, vielen Dank f\xFCr Ihre Kontaktaufnahme mit PIPINGBOX. Wir haben Ihre Personalanfrage erhalten, und unser Team wird sich in K\xFCrze mit einem Angebot bei Ihnen melden.",
      footer_reason: "Sie erhalten diese Nachricht, weil Sie ein Kontaktformular auf pipingbox.com abgesendet haben."
    },
    application_pending_profile: {
      subject: "PIPINGBOX \xB7 Bewerbung eingegangen \u2014 vervollst\xE4ndigen Sie Ihr Profil zur Aktivierung",
      preheader: "Wir haben Ihre Bewerbung f\xFCr {jobTitle} erhalten.",
      heading: "Bewerbung eingegangen \u2014 vervollst\xE4ndigen Sie Ihr Profil zur Aktivierung",
      body: "Wir haben Ihre Bewerbung f\xFCr \u201E{jobTitle}\u201C bei {company} erhalten. Sie k\xF6nnen sich weiterhin auf andere Stellenangebote bewerben: alle Ihre Bewerbungen werden gespeichert. Diese Bewerbung kann dem Unternehmen noch nicht vorgelegt werden; um sie zu aktivieren, vervollst\xE4ndigen Sie Ihr Profil, bis es vollst\xE4ndig validiert ist (Marketplace Ready).",
      body_no_company: "Wir haben Ihre Bewerbung f\xFCr \u201E{jobTitle}\u201C erhalten. Sie k\xF6nnen sich weiterhin auf andere Stellenangebote bewerben: alle Ihre Bewerbungen werden gespeichert. Diese Bewerbung kann dem Unternehmen noch nicht vorgelegt werden; um sie zu aktivieren, vervollst\xE4ndigen Sie Ihr Profil, bis es vollst\xE4ndig validiert ist (Marketplace Ready).",
      note: "Ihre Bewerbung wurde NICHT abgelehnt: sie wartet nur auf die Validierung Ihres Profils. Sobald Ihr Profil Marketplace Ready ist, wird sie automatisch f\xFCr die Vorlage bei Unternehmen gepr\xFCft.",
      pending_intro: "Was in Ihrem Profil noch fehlt:",
      pending_items: {
        photo: "Profilfoto",
        basic_details: "Name und Beruf",
        location: "Standort",
        years_experience: "Jahre Berufserfahrung",
        skills: "F\xE4higkeiten",
        bio: "\xDCber Sie (Bio)",
        cv: "Lebenslauf",
        experience: "Berufserfahrung",
        certifications: "Zertifizierungen",
        documents: "Dokumente"
      },
      button: "Mein Profil vervollst\xE4ndigen",
      footer_reason: "Sie erhalten diese Nachricht, weil Sie sich bei PIPINGBOX auf eine Stelle beworben haben."
    },
    marketplace_ready: {
      subject: "PIPINGBOX \xB7 Profil validiert \u2014 Ihre Bewerbungen k\xF6nnen jetzt gepr\xFCft werden",
      preheader: "Ihr Profil ist jetzt Marketplace Ready.",
      heading: "Profil validiert \u2014 Ihre Bewerbungen k\xF6nnen jetzt gepr\xFCft werden",
      body_single: "Ihr Profil ist jetzt validiert und Sie sind Marketplace Ready. Ihre Bewerbung f\xFCr \u201E{jobTitle}\u201C kann jetzt f\xFCr die Vorlage bei Unternehmen gepr\xFCft werden.",
      body_multiple: "Ihr Profil ist jetzt validiert und Sie sind Marketplace Ready. Ihre {count} ausstehenden Bewerbungen k\xF6nnen jetzt f\xFCr die Vorlage bei Unternehmen gepr\xFCft werden.",
      activated_list_intro: "Aktivierte Bewerbungen:",
      note: "Sie m\xFCssen nichts weiter tun: Unser Team pr\xFCft jede Bewerbung anhand der spezifischen Anforderungen jeder Stelle und meldet sich bei Ihnen.",
      button: "Meine Bewerbungen ansehen",
      footer_reason: "Sie erhalten diese Nachricht, weil Ihr PIPINGBOX-Profil Marketplace Ready erreicht hat."
    },
    cv_review_pending: {
      subject: "PIPINGBOX \xB7 Wir haben Ihren Lebenslauf erhalten \u2014 pr\xFCfen Sie Ihr Profil",
      preheader: "Wir haben Ihr Berufsprofil anhand Ihres Lebenslaufs erstellt.",
      heading: "Ihr Berufsprofil ist zur Pr\xFCfung bereit",
      body: "Hallo! Wir haben Ihren Lebenslauf erhalten und daraus Ihr Berufsprofil erstellt. Pr\xFCfen Sie die Angaben, damit PIPINGBOX Sie f\xFCr passende Projekte ber\xFCcksichtigen kann.",
      button: "Mein Profil pr\xFCfen",
      note: "Es wurde noch nichts ver\xF6ffentlicht: Die extrahierten Daten werden erst nach Ihrer Pr\xFCfung und Best\xE4tigung Teil Ihres Profils. Im Lebenslauf genannte Zertifikate werden als angegeben, nicht als verifiziert erfasst.",
      footer_reason: "Sie erhalten diese Nachricht, weil PIPINGBOX einen mit Ihrem Konto verkn\xFCpften Lebenslauf erhalten hat."
    }
  }
};
var de_default = de;

// _shared/email-i18n/locales/pt.ts
var pt = {
  code: "pt",
  common: {
    brand_tagline: "Plataforma profissional para soldadura e constru\xE7\xE3o industrial",
    button_fallback: "Se o bot\xE3o n\xE3o funcionar, copie este endere\xE7o para o seu navegador:",
    security_title: "Informa\xE7\xF5es de seguran\xE7a",
    expires: "Esta liga\xE7\xE3o expira em {minutes} minutos e s\xF3 pode ser utilizada uma vez. Se expirar, pode pedir uma nova no ecr\xE3 de in\xEDcio de sess\xE3o da PIPINGBOX.",
    never_share: "Nunca partilhe esta liga\xE7\xE3o nem este c\xF3digo. A PIPINGBOX nunca lhe pedir\xE1 a palavra-passe por e-mail, telefone ou mensagem.",
    support_prompt: "Se tiver d\xFAvidas sobre esta mensagem, escreva para {support} antes de abrir a liga\xE7\xE3o.",
    not_you: "Se n\xE3o foi voc\xEA quem fez esta altera\xE7\xE3o, contacte imediatamente {support} e redefina a sua palavra-passe.",
    footer_no_reply: "Mensagem autom\xE1tica da PIPINGBOX. Este endere\xE7o n\xE3o aceita respostas; para qualquer quest\xE3o, escreva para {support}.",
    code_label: "O seu c\xF3digo de verifica\xE7\xE3o"
  },
  templates: {
    confirmation: {
      subject: "PIPINGBOX \xB7 Confirme a sua conta",
      preheader: "Confirme o seu endere\xE7o de e-mail para ativar a sua conta PIPINGBOX.",
      heading: "Confirme a sua conta",
      body: "Obrigado por se registar na PIPINGBOX com o endere\xE7o {email}. Para ativar a sua conta, confirme que este endere\xE7o de e-mail \xE9 seu.",
      button: "Confirmar a minha conta",
      note: "Se n\xE3o se registou na PIPINGBOX, n\xE3o precisa de fazer nada: a conta ficar\xE1 por confirmar, n\xE3o ser\xE1 ativada e n\xE3o poder\xE1 ser utilizada para aceder \xE0 plataforma.",
      footer_reason: "Recebe esta mensagem porque algu\xE9m pediu a cria\xE7\xE3o de uma conta PIPINGBOX com este endere\xE7o."
    },
    recovery: {
      subject: "PIPINGBOX \xB7 Redefinir a sua palavra-passe",
      preheader: "Recebemos um pedido para redefinir a palavra-passe da sua conta PIPINGBOX.",
      heading: "Redefinir a sua palavra-passe",
      body: "Recebemos um pedido para redefinir a palavra-passe da conta PIPINGBOX associada a {email}. Utilize o bot\xE3o abaixo para escolher uma nova palavra-passe.",
      button: "Escolher uma nova palavra-passe",
      note: "Se n\xE3o pediu esta altera\xE7\xE3o, pode ignorar esta mensagem: a sua palavra-passe continuar\xE1 a ser a mesma.",
      footer_reason: "Recebe esta mensagem porque foi pedida a redefini\xE7\xE3o da palavra-passe deste endere\xE7o."
    },
    magic_link: {
      subject: "PIPINGBOX \xB7 A sua liga\xE7\xE3o de acesso",
      preheader: "Utilize esta liga\xE7\xE3o para iniciar sess\xE3o na PIPINGBOX.",
      heading: "Iniciar sess\xE3o na PIPINGBOX",
      body: "Utilize o bot\xE3o abaixo para iniciar sess\xE3o na PIPINGBOX com o endere\xE7o {email}.",
      button: "Iniciar sess\xE3o",
      note: "Se n\xE3o pediu esta liga\xE7\xE3o, pode ignorar esta mensagem: ningu\xE9m pode iniciar sess\xE3o sem ela.",
      footer_reason: "Recebe esta mensagem porque foi pedida uma liga\xE7\xE3o de acesso para este endere\xE7o."
    },
    invite: {
      subject: "PIPINGBOX \xB7 Foi convidado",
      preheader: "Foi convidado a juntar-se \xE0 PIPINGBOX.",
      heading: "Foi convidado para a PIPINGBOX",
      body: "Foi convidado a criar uma conta PIPINGBOX com o endere\xE7o {email}. Utilize o bot\xE3o abaixo para aceitar o convite e configurar a sua conta.",
      button: "Aceitar o convite",
      note: "Se n\xE3o esperava este convite, pode ignorar esta mensagem.",
      footer_reason: "Recebe esta mensagem porque algu\xE9m convidou este endere\xE7o para a PIPINGBOX."
    },
    email_change_current: {
      subject: "PIPINGBOX \xB7 Confirme a altera\xE7\xE3o do e-mail",
      preheader: "Confirme a altera\xE7\xE3o do endere\xE7o de e-mail da sua conta PIPINGBOX.",
      heading: "Confirme a altera\xE7\xE3o do e-mail",
      body: "Foi pedida a altera\xE7\xE3o do endere\xE7o de e-mail da sua conta PIPINGBOX de {email} para {newEmail}. Para autorizar a altera\xE7\xE3o, confirme-a a partir do seu endere\xE7o atual.",
      button: "Confirmar a altera\xE7\xE3o",
      note: "Se n\xE3o pediu esta altera\xE7\xE3o, n\xE3o utilize a liga\xE7\xE3o: contacte imediatamente {support} e redefina a sua palavra-passe.",
      footer_reason: "Recebe esta mensagem porque foi pedida uma altera\xE7\xE3o de e-mail na conta associada a este endere\xE7o."
    },
    email_change_new: {
      subject: "PIPINGBOX \xB7 Confirme o seu novo endere\xE7o de e-mail",
      preheader: "Confirme {newEmail} como novo endere\xE7o da sua conta PIPINGBOX.",
      heading: "Confirme o seu novo endere\xE7o de e-mail",
      body: "Confirme {newEmail} como novo endere\xE7o de e-mail da sua conta PIPINGBOX.",
      button: "Confirmar o novo endere\xE7o",
      note: "Se n\xE3o pediu esta altera\xE7\xE3o, pode ignorar esta mensagem: o endere\xE7o n\xE3o ser\xE1 alterado.",
      footer_reason: "Recebe esta mensagem porque este endere\xE7o foi proposto como novo endere\xE7o de uma conta PIPINGBOX."
    },
    reauthentication: {
      subject: "PIPINGBOX \xB7 O seu c\xF3digo de verifica\xE7\xE3o",
      preheader: "Utilize este c\xF3digo para confirmar a sua identidade na PIPINGBOX.",
      heading: "O seu c\xF3digo de verifica\xE7\xE3o",
      body: "Introduza o c\xF3digo abaixo na PIPINGBOX para confirmar a sua identidade. Expira em {minutes} minutos e s\xF3 pode ser utilizado uma vez.",
      footer_reason: "Recebe esta mensagem porque uma a\xE7\xE3o sens\xEDvel na sua conta PIPINGBOX exigiu a verifica\xE7\xE3o da sua identidade."
    },
    password_changed_notification: {
      subject: "PIPINGBOX \xB7 A sua palavra-passe foi alterada",
      preheader: "A palavra-passe da sua conta PIPINGBOX foi alterada.",
      heading: "A sua palavra-passe foi alterada",
      body: "A palavra-passe da conta PIPINGBOX associada a {email} foi alterada recentemente.",
      footer_reason: "Recebe este aviso de seguran\xE7a devido a uma altera\xE7\xE3o na sua conta PIPINGBOX."
    },
    email_changed_notification: {
      subject: "PIPINGBOX \xB7 O seu endere\xE7o de e-mail foi alterado",
      preheader: "O endere\xE7o de e-mail da sua conta PIPINGBOX foi alterado.",
      heading: "O seu endere\xE7o de e-mail foi alterado",
      body: "O endere\xE7o de e-mail da sua conta PIPINGBOX foi alterado de {oldEmail} para {email}.",
      footer_reason: "Recebe este aviso de seguran\xE7a devido a uma altera\xE7\xE3o na sua conta PIPINGBOX."
    },
    phone_changed_notification: {
      subject: "PIPINGBOX \xB7 O seu n\xFAmero de telefone foi alterado",
      preheader: "O n\xFAmero de telefone da sua conta PIPINGBOX foi alterado.",
      heading: "O seu n\xFAmero de telefone foi alterado",
      body: "O n\xFAmero de telefone da sua conta PIPINGBOX foi alterado de {oldPhone} para {phone}.",
      footer_reason: "Recebe este aviso de seguran\xE7a devido a uma altera\xE7\xE3o na sua conta PIPINGBOX."
    },
    identity_linked_notification: {
      subject: "PIPINGBOX \xB7 Foi associado um novo m\xE9todo de acesso",
      preheader: "Foi associado um novo m\xE9todo de acesso \xE0 sua conta PIPINGBOX.",
      heading: "Foi associado um novo m\xE9todo de acesso",
      body: "A sua conta {provider} foi associada como novo m\xE9todo de acesso para {email}.",
      footer_reason: "Recebe este aviso de seguran\xE7a devido a uma altera\xE7\xE3o na sua conta PIPINGBOX."
    },
    identity_unlinked_notification: {
      subject: "PIPINGBOX \xB7 Foi removido um m\xE9todo de acesso",
      preheader: "Foi removido um m\xE9todo de acesso da sua conta PIPINGBOX.",
      heading: "Foi removido um m\xE9todo de acesso",
      body: "A sua conta {provider} foi removida como m\xE9todo de acesso para {email}.",
      footer_reason: "Recebe este aviso de seguran\xE7a devido a uma altera\xE7\xE3o na sua conta PIPINGBOX."
    },
    mfa_factor_enrolled_notification: {
      subject: "PIPINGBOX \xB7 Foi adicionado um novo m\xE9todo de verifica\xE7\xE3o",
      preheader: "Foi adicionado um novo m\xE9todo de verifica\xE7\xE3o \xE0 sua conta PIPINGBOX.",
      heading: "Foi adicionado um novo m\xE9todo de verifica\xE7\xE3o",
      body: "Foi adicionado um novo m\xE9todo de verifica\xE7\xE3o de acesso ({factorType}) \xE0 sua conta PIPINGBOX.",
      footer_reason: "Recebe este aviso de seguran\xE7a devido a uma altera\xE7\xE3o na sua conta PIPINGBOX."
    },
    mfa_factor_unenrolled_notification: {
      subject: "PIPINGBOX \xB7 Foi removido um m\xE9todo de verifica\xE7\xE3o",
      preheader: "Foi removido um m\xE9todo de verifica\xE7\xE3o da sua conta PIPINGBOX.",
      heading: "Foi removido um m\xE9todo de verifica\xE7\xE3o",
      body: "Foi removido um m\xE9todo de verifica\xE7\xE3o de acesso ({factorType}) da sua conta PIPINGBOX.",
      footer_reason: "Recebe este aviso de seguran\xE7a devido a uma altera\xE7\xE3o na sua conta PIPINGBOX."
    },
    job_match: {
      subject: "PIPINGBOX \xB7 Nova oferta compat\xEDvel com o seu perfil: {jobTitle}",
      preheader: "{score}% de compatibilidade com \xAB{jobTitle}\xBB.",
      heading: "Nova oferta compat\xEDvel com o seu perfil",
      body: "Encontr\xE1mos uma oferta de emprego com {score}% de compatibilidade com o seu perfil: \xAB{jobTitle}\xBB na {company}.",
      body_no_company: "Encontr\xE1mos uma oferta de emprego com {score}% de compatibilidade com o seu perfil: \xAB{jobTitle}\xBB.",
      button: "Ver a oferta",
      note: "Recebe alertas de emprego porque est\xE3o ativados no seu perfil PIPINGBOX. Pode desativ\xE1-los a qualquer momento nas suas prefer\xEAncias de compatibilidade.",
      footer_reason: "Recebe esta mensagem porque os alertas de emprego est\xE3o ativados na sua conta PIPINGBOX."
    },
    workforce_match: {
      subject: "PIPINGBOX \xB7 Novo pedido de pessoal compat\xEDvel com o seu perfil",
      preheader: "Uma empresa procura profissionais de {workerType} em {country}.",
      heading: "Novo pedido de pessoal",
      body: "Uma empresa publicou um pedido de pessoal com {score}% de compatibilidade com o seu perfil: {workerType} em {country}.",
      button: "Ver o pedido",
      note: "Recebe estes alertas porque est\xE3o ativados no seu perfil PIPINGBOX. Pode desativ\xE1-los a qualquer momento nas suas prefer\xEAncias de compatibilidade.",
      footer_reason: "Recebe esta mensagem porque os alertas de emprego est\xE3o ativados na sua conta PIPINGBOX."
    },
    cert_expiry: {
      subject: "PIPINGBOX \xB7 A sua certifica\xE7\xE3o {certName} expira em breve",
      preheader: "{certName} expira em {expiresOn}.",
      heading: "Certifica\xE7\xE3o prestes a expirar",
      body: "A sua certifica\xE7\xE3o {certName} expira em {expiresOn}. Mantenha o seu perfil atualizado para que as empresas vejam as suas certifica\xE7\xF5es v\xE1lidas.",
      button: "Atualizar as minhas certifica\xE7\xF5es",
      note: "Recebe estes alertas porque est\xE3o ativados no seu perfil PIPINGBOX.",
      footer_reason: "Recebe esta mensagem porque os alertas de certifica\xE7\xF5es est\xE3o ativados na sua conta PIPINGBOX."
    },
    lead_receipt: {
      subject: "PIPINGBOX \xB7 Recebemos o seu pedido",
      preheader: "Obrigado por contactar a PIPINGBOX.",
      heading: "Recebemos o seu pedido",
      body: "Ol\xE1, {name}. Obrigado por contactar a PIPINGBOX. Recebemos o seu pedido de pessoal e a nossa equipa entrar\xE1 em contacto consigo em breve com uma proposta.",
      footer_reason: "Recebe esta mensagem porque enviou um formul\xE1rio de contacto em pipingbox.com."
    },
    application_pending_profile: {
      subject: "PIPINGBOX \xB7 Candidatura recebida \u2014 complete o seu perfil para a ativar",
      preheader: "Recebemos a sua candidatura para {jobTitle}.",
      heading: "Candidatura recebida \u2014 complete o seu perfil para a ativar",
      body: "Recebemos corretamente a sua candidatura para \xAB{jobTitle}\xBB na {company}. Pode continuar a candidatar-se a outras ofertas: todas as suas candidaturas ficam guardadas. Esta candidatura ainda n\xE3o pode ser apresentada \xE0 empresa; para a ativar, complete o seu perfil at\xE9 estar totalmente validado (Marketplace Ready).",
      body_no_company: "Recebemos corretamente a sua candidatura para \xAB{jobTitle}\xBB. Pode continuar a candidatar-se a outras ofertas: todas as suas candidaturas ficam guardadas. Esta candidatura ainda n\xE3o pode ser apresentada \xE0 empresa; para a ativar, complete o seu perfil at\xE9 estar totalmente validado (Marketplace Ready).",
      note: "A sua candidatura N\xC3O foi rejeitada: est\xE1 apenas \xE0 espera da valida\xE7\xE3o do seu perfil. Assim que o seu perfil for Marketplace Ready, passar\xE1 automaticamente a revis\xE3o para apresenta\xE7\xE3o \xE0s empresas.",
      pending_intro: "O que falta no seu perfil:",
      pending_items: {
        photo: "Foto de perfil",
        basic_details: "Nome e profiss\xE3o",
        location: "Localiza\xE7\xE3o",
        years_experience: "Anos de experi\xEAncia",
        skills: "Compet\xEAncias",
        bio: "Sobre si (bio)",
        cv: "CV",
        experience: "Experi\xEAncia profissional",
        certifications: "Certifica\xE7\xF5es",
        documents: "Documentos"
      },
      button: "Completar o meu perfil",
      footer_reason: "Recebe esta mensagem porque se candidatou a uma oferta no PIPINGBOX."
    },
    marketplace_ready: {
      subject: "PIPINGBOX \xB7 Perfil validado \u2014 as suas candidaturas j\xE1 podem ser revistas",
      preheader: "O seu perfil j\xE1 \xE9 Marketplace Ready.",
      heading: "Perfil validado \u2014 as suas candidaturas j\xE1 podem ser revistas",
      body_single: "O seu perfil j\xE1 est\xE1 validado e \xE9 Marketplace Ready. A sua candidatura para \xAB{jobTitle}\xBB j\xE1 pode ser revista para apresenta\xE7\xE3o \xE0s empresas.",
      body_multiple: "O seu perfil j\xE1 est\xE1 validado e \xE9 Marketplace Ready. As suas {count} candidaturas pendentes j\xE1 podem ser revistas para apresenta\xE7\xE3o \xE0s empresas.",
      activated_list_intro: "Candidaturas ativadas:",
      note: "N\xE3o tem mais nada a fazer: a nossa equipa rev\xEA cada candidatura de acordo com os requisitos espec\xEDficos de cada oferta e entrar\xE1 em contacto consigo.",
      button: "Ver as minhas candidaturas",
      footer_reason: "Recebe esta mensagem porque o seu perfil PIPINGBOX alcan\xE7ou Marketplace Ready."
    },
    cv_review_pending: {
      subject: "PIPINGBOX \xB7 Recebemos o seu CV \u2014 reveja o seu perfil",
      preheader: "Prepar\xE1mos o seu perfil profissional a partir do seu CV.",
      heading: "O seu perfil profissional est\xE1 pronto para revis\xE3o",
      body: "Ol\xE1: recebemos o seu CV e preparamos o seu perfil profissional a partir dele. Reveja os dados para que a PIPINGBOX possa consider\xE1-lo para oportunidades compat\xEDveis.",
      button: "Rever o meu perfil",
      note: "Ainda nada foi publicado: os dados extra\xEDdos s\xF3 fazem parte do seu perfil depois de os rever e confirmar. As certifica\xE7\xF5es mencionadas no seu CV s\xE3o registadas como declaradas, n\xE3o verificadas.",
      footer_reason: "Recebe esta mensagem porque a PIPINGBOX recebeu um CV associado \xE0 sua conta."
    }
  }
};
var pt_default = pt;

// _shared/email-i18n/locales/it.ts
var it = {
  code: "it",
  common: {
    brand_tagline: "Piattaforma professionale per saldatura e costruzioni industriali",
    button_fallback: "Se il pulsante non funziona, copia questo indirizzo nel tuo browser:",
    security_title: "Informazioni di sicurezza",
    expires: "Questo link scade tra {minutes} minuti e pu\xF2 essere utilizzato una sola volta. Se \xE8 scaduto, puoi richiederne uno nuovo dalla schermata di accesso di PIPINGBOX.",
    never_share: "Non condividere mai questo link o questo codice. PIPINGBOX non ti chieder\xE0 mai la password via e-mail, telefono o chat.",
    support_prompt: "Se hai dubbi su questo messaggio, scrivi a {support} prima di aprire il link.",
    not_you: "Se non sei stato tu a effettuare questa modifica, contatta immediatamente {support} e reimposta la tua password.",
    footer_no_reply: "Messaggio automatico di PIPINGBOX. Questo indirizzo non accetta risposte; per qualsiasi domanda scrivi a {support}.",
    code_label: "Il tuo codice di verifica"
  },
  templates: {
    confirmation: {
      subject: "PIPINGBOX \xB7 Conferma il tuo account",
      preheader: "Conferma il tuo indirizzo e-mail per attivare il tuo account PIPINGBOX.",
      heading: "Conferma il tuo account",
      body: "Grazie per esserti registrato su PIPINGBOX con l'indirizzo {email}. Per attivare il tuo account, conferma che questo indirizzo e-mail \xE8 tuo.",
      button: "Conferma il mio account",
      note: "Se non ti sei registrato su PIPINGBOX, non devi fare nulla: l'account rester\xE0 non confermato, non verr\xE0 attivato e non potr\xE0 essere utilizzato per accedere alla piattaforma.",
      footer_reason: "Ricevi questo messaggio perch\xE9 qualcuno ha richiesto la creazione di un account PIPINGBOX con questo indirizzo."
    },
    recovery: {
      subject: "PIPINGBOX \xB7 Reimposta la tua password",
      preheader: "Abbiamo ricevuto una richiesta di reimpostazione della password del tuo account PIPINGBOX.",
      heading: "Reimposta la tua password",
      body: "Abbiamo ricevuto una richiesta di reimpostazione della password dell'account PIPINGBOX associato a {email}. Usa il pulsante qui sotto per scegliere una nuova password.",
      button: "Scegli una nuova password",
      note: "Se non hai richiesto questa modifica, puoi ignorare questo messaggio: la tua password rester\xE0 invariata.",
      footer_reason: "Ricevi questo messaggio perch\xE9 \xE8 stata richiesta la reimpostazione della password per questo indirizzo."
    },
    magic_link: {
      subject: "PIPINGBOX \xB7 Il tuo link di accesso",
      preheader: "Usa questo link per accedere a PIPINGBOX.",
      heading: "Accedi a PIPINGBOX",
      body: "Usa il pulsante qui sotto per accedere a PIPINGBOX con l'indirizzo {email}.",
      button: "Accedi",
      note: "Se non hai richiesto questo link, puoi ignorare questo messaggio: nessuno pu\xF2 accedere senza di esso.",
      footer_reason: "Ricevi questo messaggio perch\xE9 \xE8 stato richiesto un link di accesso per questo indirizzo."
    },
    invite: {
      subject: "PIPINGBOX \xB7 Sei stato invitato",
      preheader: "Sei stato invitato a unirti a PIPINGBOX.",
      heading: "Sei stato invitato su PIPINGBOX",
      body: "Sei stato invitato a creare un account PIPINGBOX con l'indirizzo {email}. Usa il pulsante qui sotto per accettare l'invito e configurare il tuo account.",
      button: "Accetta l'invito",
      note: "Se non aspettavi questo invito, puoi ignorare questo messaggio.",
      footer_reason: "Ricevi questo messaggio perch\xE9 qualcuno ha invitato questo indirizzo su PIPINGBOX."
    },
    email_change_current: {
      subject: "PIPINGBOX \xB7 Conferma la modifica dell'e-mail",
      preheader: "Conferma la modifica dell'indirizzo e-mail del tuo account PIPINGBOX.",
      heading: "Conferma la modifica dell'e-mail",
      body: "\xC8 stata richiesta la modifica dell'indirizzo e-mail del tuo account PIPINGBOX da {email} a {newEmail}. Per autorizzare la modifica, confermala dal tuo indirizzo attuale.",
      button: "Conferma la modifica",
      note: "Se non hai richiesto questa modifica, non usare il link: contatta immediatamente {support} e reimposta la tua password.",
      footer_reason: "Ricevi questo messaggio perch\xE9 \xE8 stata richiesta una modifica dell'e-mail sull'account associato a questo indirizzo."
    },
    email_change_new: {
      subject: "PIPINGBOX \xB7 Conferma il tuo nuovo indirizzo e-mail",
      preheader: "Conferma {newEmail} come nuovo indirizzo del tuo account PIPINGBOX.",
      heading: "Conferma il tuo nuovo indirizzo e-mail",
      body: "Conferma {newEmail} come nuovo indirizzo e-mail del tuo account PIPINGBOX.",
      button: "Conferma il nuovo indirizzo",
      note: "Se non hai richiesto questa modifica, puoi ignorare questo messaggio: l'indirizzo non verr\xE0 modificato.",
      footer_reason: "Ricevi questo messaggio perch\xE9 questo indirizzo \xE8 stato proposto come nuovo indirizzo di un account PIPINGBOX."
    },
    reauthentication: {
      subject: "PIPINGBOX \xB7 Il tuo codice di verifica",
      preheader: "Usa questo codice per confermare la tua identit\xE0 su PIPINGBOX.",
      heading: "Il tuo codice di verifica",
      body: "Inserisci il codice qui sotto su PIPINGBOX per confermare la tua identit\xE0. Scade tra {minutes} minuti e pu\xF2 essere utilizzato una sola volta.",
      footer_reason: "Ricevi questo messaggio perch\xE9 un'azione sensibile sul tuo account PIPINGBOX ha richiesto la verifica dell'identit\xE0."
    },
    password_changed_notification: {
      subject: "PIPINGBOX \xB7 La tua password \xE8 stata modificata",
      preheader: "La password del tuo account PIPINGBOX \xE8 stata modificata.",
      heading: "La tua password \xE8 stata modificata",
      body: "La password dell'account PIPINGBOX associato a {email} \xE8 stata modificata di recente.",
      footer_reason: "Ricevi questo avviso di sicurezza a causa di una modifica al tuo account PIPINGBOX."
    },
    email_changed_notification: {
      subject: "PIPINGBOX \xB7 Il tuo indirizzo e-mail \xE8 stato modificato",
      preheader: "L'indirizzo e-mail del tuo account PIPINGBOX \xE8 stato modificato.",
      heading: "Il tuo indirizzo e-mail \xE8 stato modificato",
      body: "L'indirizzo e-mail del tuo account PIPINGBOX \xE8 stato modificato da {oldEmail} a {email}.",
      footer_reason: "Ricevi questo avviso di sicurezza a causa di una modifica al tuo account PIPINGBOX."
    },
    phone_changed_notification: {
      subject: "PIPINGBOX \xB7 Il tuo numero di telefono \xE8 stato modificato",
      preheader: "Il numero di telefono del tuo account PIPINGBOX \xE8 stato modificato.",
      heading: "Il tuo numero di telefono \xE8 stato modificato",
      body: "Il numero di telefono del tuo account PIPINGBOX \xE8 stato modificato da {oldPhone} a {phone}.",
      footer_reason: "Ricevi questo avviso di sicurezza a causa di una modifica al tuo account PIPINGBOX."
    },
    identity_linked_notification: {
      subject: "PIPINGBOX \xB7 \xC8 stato collegato un nuovo metodo di accesso",
      preheader: "\xC8 stato collegato un nuovo metodo di accesso al tuo account PIPINGBOX.",
      heading: "\xC8 stato collegato un nuovo metodo di accesso",
      body: "Il tuo account {provider} \xE8 stato collegato come nuovo metodo di accesso per {email}.",
      footer_reason: "Ricevi questo avviso di sicurezza a causa di una modifica al tuo account PIPINGBOX."
    },
    identity_unlinked_notification: {
      subject: "PIPINGBOX \xB7 \xC8 stato rimosso un metodo di accesso",
      preheader: "\xC8 stato rimosso un metodo di accesso dal tuo account PIPINGBOX.",
      heading: "\xC8 stato rimosso un metodo di accesso",
      body: "Il tuo account {provider} \xE8 stato rimosso come metodo di accesso per {email}.",
      footer_reason: "Ricevi questo avviso di sicurezza a causa di una modifica al tuo account PIPINGBOX."
    },
    mfa_factor_enrolled_notification: {
      subject: "PIPINGBOX \xB7 \xC8 stato aggiunto un nuovo metodo di verifica",
      preheader: "\xC8 stato aggiunto un nuovo metodo di verifica al tuo account PIPINGBOX.",
      heading: "\xC8 stato aggiunto un nuovo metodo di verifica",
      body: "\xC8 stato aggiunto un nuovo metodo di verifica dell'accesso ({factorType}) al tuo account PIPINGBOX.",
      footer_reason: "Ricevi questo avviso di sicurezza a causa di una modifica al tuo account PIPINGBOX."
    },
    mfa_factor_unenrolled_notification: {
      subject: "PIPINGBOX \xB7 \xC8 stato rimosso un metodo di verifica",
      preheader: "\xC8 stato rimosso un metodo di verifica dal tuo account PIPINGBOX.",
      heading: "\xC8 stato rimosso un metodo di verifica",
      body: "\xC8 stato rimosso un metodo di verifica dell'accesso ({factorType}) dal tuo account PIPINGBOX.",
      footer_reason: "Ricevi questo avviso di sicurezza a causa di una modifica al tuo account PIPINGBOX."
    },
    job_match: {
      subject: "PIPINGBOX \xB7 Nuova offerta compatibile con il tuo profilo: {jobTitle}",
      preheader: "{score}% di compatibilit\xE0 con \xAB{jobTitle}\xBB.",
      heading: "Nuova offerta compatibile con il tuo profilo",
      body: "Abbiamo trovato un'offerta di lavoro con una compatibilit\xE0 del {score}% con il tuo profilo: \xAB{jobTitle}\xBB presso {company}.",
      body_no_company: "Abbiamo trovato un'offerta di lavoro con una compatibilit\xE0 del {score}% con il tuo profilo: \xAB{jobTitle}\xBB.",
      button: "Vedi l'offerta",
      note: "Ricevi gli avvisi di lavoro perch\xE9 sono attivi nel tuo profilo PIPINGBOX. Puoi disattivarli in qualsiasi momento dalle tue preferenze di compatibilit\xE0.",
      footer_reason: "Ricevi questo messaggio perch\xE9 gli avvisi di lavoro sono attivi sul tuo account PIPINGBOX."
    },
    workforce_match: {
      subject: "PIPINGBOX \xB7 Nuova richiesta di personale compatibile con il tuo profilo",
      preheader: "Un'azienda cerca professionisti {workerType} in {country}.",
      heading: "Nuova richiesta di personale",
      body: "Un'azienda ha pubblicato una richiesta di personale con una compatibilit\xE0 del {score}% con il tuo profilo: {workerType} in {country}.",
      button: "Vedi la richiesta",
      note: "Ricevi questi avvisi perch\xE9 sono attivi nel tuo profilo PIPINGBOX. Puoi disattivarli in qualsiasi momento dalle tue preferenze di compatibilit\xE0.",
      footer_reason: "Ricevi questo messaggio perch\xE9 gli avvisi di lavoro sono attivi sul tuo account PIPINGBOX."
    },
    cert_expiry: {
      subject: "PIPINGBOX \xB7 La tua certificazione {certName} scade presto",
      preheader: "{certName} scade il {expiresOn}.",
      heading: "Certificazione in scadenza",
      body: "La tua certificazione {certName} scade il {expiresOn}. Mantieni aggiornato il tuo profilo affinch\xE9 le aziende vedano le tue certificazioni valide.",
      button: "Aggiorna le mie certificazioni",
      note: "Ricevi questi avvisi perch\xE9 sono attivi nel tuo profilo PIPINGBOX.",
      footer_reason: "Ricevi questo messaggio perch\xE9 gli avvisi sulle certificazioni sono attivi sul tuo account PIPINGBOX."
    },
    lead_receipt: {
      subject: "PIPINGBOX \xB7 Abbiamo ricevuto la tua richiesta",
      preheader: "Grazie per aver contattato PIPINGBOX.",
      heading: "Abbiamo ricevuto la tua richiesta",
      body: "Ciao {name}, grazie per aver contattato PIPINGBOX. Abbiamo ricevuto la tua richiesta di personale e il nostro team ti ricontatter\xE0 a breve con una proposta.",
      footer_reason: "Ricevi questo messaggio perch\xE9 hai inviato un modulo di contatto su pipingbox.com."
    },
    application_pending_profile: {
      subject: "PIPINGBOX \xB7 Candidatura ricevuta \u2014 completa il profilo per attivarla",
      preheader: "Abbiamo ricevuto la tua candidatura per {jobTitle}.",
      heading: "Candidatura ricevuta \u2014 completa il profilo per attivarla",
      body: "Abbiamo ricevuto correttamente la tua candidatura per \xAB{jobTitle}\xBB presso {company}. Puoi continuare a candidarti per altre offerte: tutte le tue candidature vengono salvate. Questa candidatura non pu\xF2 ancora essere presentata all'azienda; per attivarla, completa il tuo profilo finch\xE9 non \xE8 completamente validato (Marketplace Ready).",
      body_no_company: "Abbiamo ricevuto correttamente la tua candidatura per \xAB{jobTitle}\xBB. Puoi continuare a candidarti per altre offerte: tutte le tue candidature vengono salvate. Questa candidatura non pu\xF2 ancora essere presentata all'azienda; per attivarla, completa il tuo profilo finch\xE9 non \xE8 completamente validato (Marketplace Ready).",
      note: "La tua candidatura NON \xE8 stata respinta: sta solo aspettando la validazione del tuo profilo. Non appena il tuo profilo sar\xE0 Marketplace Ready, verr\xE0 automaticamente esaminata per la presentazione alle aziende.",
      pending_intro: "Cosa manca al tuo profilo:",
      pending_items: {
        photo: "Foto del profilo",
        basic_details: "Nome e professione",
        location: "Localit\xE0",
        years_experience: "Anni di esperienza",
        skills: "Competenze",
        bio: "Chi sei (bio)",
        cv: "CV",
        experience: "Esperienza lavorativa",
        certifications: "Certificazioni",
        documents: "Documenti"
      },
      button: "Completa il mio profilo",
      footer_reason: "Ricevi questo messaggio perch\xE9 ti sei candidato a un'offerta su PIPINGBOX."
    },
    marketplace_ready: {
      subject: "PIPINGBOX \xB7 Profilo validato \u2014 le tue candidature possono ora essere esaminate",
      preheader: "Il tuo profilo \xE8 ora Marketplace Ready.",
      heading: "Profilo validato \u2014 le tue candidature possono ora essere esaminate",
      body_single: "Il tuo profilo \xE8 ora validato e sei Marketplace Ready. La tua candidatura per \xAB{jobTitle}\xBB pu\xF2 ora essere esaminata per la presentazione alle aziende.",
      body_multiple: "Il tuo profilo \xE8 ora validato e sei Marketplace Ready. Le tue {count} candidature in sospeso possono ora essere esaminate per la presentazione alle aziende.",
      activated_list_intro: "Candidature attivate:",
      note: "Non devi fare altro: il nostro team esamina ogni candidatura in base ai requisiti specifici di ogni offerta e ti contatter\xE0.",
      button: "Vedi le mie candidature",
      footer_reason: "Ricevi questo messaggio perch\xE9 il tuo profilo PIPINGBOX ha raggiunto Marketplace Ready."
    },
    cv_review_pending: {
      subject: "PIPINGBOX \xB7 Abbiamo ricevuto il tuo CV \u2014 controlla il tuo profilo",
      preheader: "Abbiamo preparato il tuo profilo professionale dal tuo CV.",
      heading: "Il tuo profilo professionale \xE8 pronto per la revisione",
      body: "Ciao! Abbiamo ricevuto il tuo CV e abbiamo preparato il tuo profilo professionale. Controlla i dati cos\xEC PIPINGBOX pu\xF2 prenderti in considerazione per opportunit\xE0 compatibili.",
      button: "Rivedi il mio profilo",
      note: "Non \xE8 ancora stato pubblicato nulla: i dati estratti entrano nel tuo profilo solo dopo la tua revisione e conferma. Le certificazioni indicate nel CV vengono registrate come dichiarate, non verificate.",
      footer_reason: "Ricevi questo messaggio perch\xE9 PIPINGBOX ha ricevuto un CV associato al tuo account."
    }
  }
};
var it_default = it;

// _shared/email-i18n/locales/ro.ts
var ro = {
  code: "ro",
  common: {
    brand_tagline: "Platform\u0103 profesional\u0103 pentru sudur\u0103 \u0219i construc\u021Bii industriale",
    button_fallback: "Dac\u0103 butonul nu func\u021Bioneaz\u0103, copiaz\u0103 aceast\u0103 adres\u0103 \xEEn browser:",
    security_title: "Informa\u021Bii de securitate",
    expires: "Acest link expir\u0103 \xEEn {minutes} de minute \u0219i poate fi folosit o singur\u0103 dat\u0103. Dac\u0103 a expirat, po\u021Bi solicita unul nou din ecranul de autentificare PIPINGBOX.",
    never_share: "Nu transmite nim\u0103nui acest link sau cod. PIPINGBOX nu \xEE\u021Bi va cere niciodat\u0103 parola prin e-mail, telefon sau mesagerie.",
    support_prompt: "Dac\u0103 ai \xEEndoieli cu privire la acest mesaj, scrie la {support} \xEEnainte de a deschide linkul.",
    not_you: "Dac\u0103 nu tu ai f\u0103cut aceast\u0103 modificare, contacteaz\u0103 imediat {support} \u0219i reseteaz\u0103-\u021Bi parola.",
    footer_no_reply: "Mesaj automat de la PIPINGBOX. Aceast\u0103 adres\u0103 nu accept\u0103 r\u0103spunsuri; pentru orice \xEEntrebare, scrie la {support}.",
    code_label: "Codul t\u0103u de verificare"
  },
  templates: {
    confirmation: {
      subject: "PIPINGBOX \xB7 Confirm\u0103-\u021Bi contul",
      preheader: "Confirm\u0103 adresa de e-mail pentru a-\u021Bi activa contul PIPINGBOX.",
      heading: "Confirm\u0103-\u021Bi contul",
      body: "\xCE\u021Bi mul\u021Bumim c\u0103 te-ai \xEEnregistrat pe PIPINGBOX cu adresa {email}. Pentru a-\u021Bi activa contul, confirm\u0103 c\u0103 aceast\u0103 adres\u0103 de e-mail \xEE\u021Bi apar\u021Bine.",
      button: "Confirm contul meu",
      note: "Dac\u0103 nu te-ai \xEEnregistrat pe PIPINGBOX, nu trebuie s\u0103 faci nimic: contul va r\u0103m\xE2ne neconfirmat, nu va fi activat \u0219i nu va putea fi folosit pentru a accesa platforma.",
      footer_reason: "Prime\u0219ti acest mesaj pentru c\u0103 cineva a solicitat crearea unui cont PIPINGBOX cu aceast\u0103 adres\u0103."
    },
    recovery: {
      subject: "PIPINGBOX \xB7 Reseteaz\u0103-\u021Bi parola",
      preheader: "Am primit o solicitare de resetare a parolei contului t\u0103u PIPINGBOX.",
      heading: "Reseteaz\u0103-\u021Bi parola",
      body: "Am primit o solicitare de resetare a parolei pentru contul PIPINGBOX asociat adresei {email}. Folose\u0219te butonul de mai jos pentru a alege o parol\u0103 nou\u0103.",
      button: "Alege o parol\u0103 nou\u0103",
      note: "Dac\u0103 nu ai solicitat aceast\u0103 modificare, po\u021Bi ignora acest mesaj: parola ta r\u0103m\xE2ne neschimbat\u0103.",
      footer_reason: "Prime\u0219ti acest mesaj pentru c\u0103 s-a solicitat resetarea parolei pentru aceast\u0103 adres\u0103."
    },
    magic_link: {
      subject: "PIPINGBOX \xB7 Linkul t\u0103u de autentificare",
      preheader: "Folose\u0219te acest link pentru a te autentifica pe PIPINGBOX.",
      heading: "Autentific\u0103-te pe PIPINGBOX",
      body: "Folose\u0219te butonul de mai jos pentru a te autentifica pe PIPINGBOX cu adresa {email}.",
      button: "Autentificare",
      note: "Dac\u0103 nu ai solicitat acest link, po\u021Bi ignora acest mesaj: nimeni nu se poate autentifica f\u0103r\u0103 el.",
      footer_reason: "Prime\u0219ti acest mesaj pentru c\u0103 s-a solicitat un link de autentificare pentru aceast\u0103 adres\u0103."
    },
    invite: {
      subject: "PIPINGBOX \xB7 Ai fost invitat",
      preheader: "Ai fost invitat s\u0103 te al\u0103turi PIPINGBOX.",
      heading: "Ai fost invitat pe PIPINGBOX",
      body: "Ai fost invitat s\u0103 \xEE\u021Bi creezi un cont PIPINGBOX cu adresa {email}. Folose\u0219te butonul de mai jos pentru a accepta invita\u021Bia \u0219i a-\u021Bi configura contul.",
      button: "Accept invita\u021Bia",
      note: "Dac\u0103 nu te a\u0219teptai la aceast\u0103 invita\u021Bie, po\u021Bi ignora acest mesaj.",
      footer_reason: "Prime\u0219ti acest mesaj pentru c\u0103 cineva a invitat aceast\u0103 adres\u0103 pe PIPINGBOX."
    },
    email_change_current: {
      subject: "PIPINGBOX \xB7 Confirm\u0103 schimbarea adresei de e-mail",
      preheader: "Confirm\u0103 schimbarea adresei de e-mail a contului t\u0103u PIPINGBOX.",
      heading: "Confirm\u0103 schimbarea adresei de e-mail",
      body: "S-a solicitat schimbarea adresei de e-mail a contului t\u0103u PIPINGBOX de la {email} la {newEmail}. Pentru a autoriza schimbarea, confirm-o de pe adresa ta actual\u0103.",
      button: "Confirm schimbarea",
      note: "Dac\u0103 nu ai solicitat aceast\u0103 schimbare, nu folosi linkul: contacteaz\u0103 imediat {support} \u0219i reseteaz\u0103-\u021Bi parola.",
      footer_reason: "Prime\u0219ti acest mesaj pentru c\u0103 s-a solicitat o schimbare a adresei de e-mail pentru contul asociat acestei adrese."
    },
    email_change_new: {
      subject: "PIPINGBOX \xB7 Confirm\u0103 noua adres\u0103 de e-mail",
      preheader: "Confirm\u0103 {newEmail} ca nou\u0103 adres\u0103 a contului t\u0103u PIPINGBOX.",
      heading: "Confirm\u0103 noua adres\u0103 de e-mail",
      body: "Confirm\u0103 {newEmail} ca nou\u0103 adres\u0103 de e-mail a contului t\u0103u PIPINGBOX.",
      button: "Confirm noua adres\u0103",
      note: "Dac\u0103 nu ai solicitat aceast\u0103 schimbare, po\u021Bi ignora acest mesaj: adresa nu va fi modificat\u0103.",
      footer_reason: "Prime\u0219ti acest mesaj pentru c\u0103 aceast\u0103 adres\u0103 a fost propus\u0103 ca nou\u0103 adres\u0103 a unui cont PIPINGBOX."
    },
    reauthentication: {
      subject: "PIPINGBOX \xB7 Codul t\u0103u de verificare",
      preheader: "Folose\u0219te acest cod pentru a-\u021Bi confirma identitatea pe PIPINGBOX.",
      heading: "Codul t\u0103u de verificare",
      body: "Introdu codul de mai jos \xEEn PIPINGBOX pentru a-\u021Bi confirma identitatea. Expir\u0103 \xEEn {minutes} de minute \u0219i poate fi folosit o singur\u0103 dat\u0103.",
      footer_reason: "Prime\u0219ti acest mesaj pentru c\u0103 o ac\u021Biune sensibil\u0103 din contul t\u0103u PIPINGBOX a necesitat verificarea identit\u0103\u021Bii."
    },
    password_changed_notification: {
      subject: "PIPINGBOX \xB7 Parola ta a fost schimbat\u0103",
      preheader: "Parola contului t\u0103u PIPINGBOX a fost schimbat\u0103.",
      heading: "Parola ta a fost schimbat\u0103",
      body: "Parola contului PIPINGBOX asociat adresei {email} a fost schimbat\u0103 recent.",
      footer_reason: "Prime\u0219ti aceast\u0103 notificare de securitate din cauza unei modific\u0103ri a contului t\u0103u PIPINGBOX."
    },
    email_changed_notification: {
      subject: "PIPINGBOX \xB7 Adresa ta de e-mail a fost schimbat\u0103",
      preheader: "Adresa de e-mail a contului t\u0103u PIPINGBOX a fost schimbat\u0103.",
      heading: "Adresa ta de e-mail a fost schimbat\u0103",
      body: "Adresa de e-mail a contului t\u0103u PIPINGBOX a fost schimbat\u0103 de la {oldEmail} la {email}.",
      footer_reason: "Prime\u0219ti aceast\u0103 notificare de securitate din cauza unei modific\u0103ri a contului t\u0103u PIPINGBOX."
    },
    phone_changed_notification: {
      subject: "PIPINGBOX \xB7 Num\u0103rul t\u0103u de telefon a fost schimbat",
      preheader: "Num\u0103rul de telefon al contului t\u0103u PIPINGBOX a fost schimbat.",
      heading: "Num\u0103rul t\u0103u de telefon a fost schimbat",
      body: "Num\u0103rul de telefon al contului t\u0103u PIPINGBOX a fost schimbat de la {oldPhone} la {phone}.",
      footer_reason: "Prime\u0219ti aceast\u0103 notificare de securitate din cauza unei modific\u0103ri a contului t\u0103u PIPINGBOX."
    },
    identity_linked_notification: {
      subject: "PIPINGBOX \xB7 A fost asociat\u0103 o nou\u0103 metod\u0103 de autentificare",
      preheader: "O nou\u0103 metod\u0103 de autentificare a fost asociat\u0103 contului t\u0103u PIPINGBOX.",
      heading: "A fost asociat\u0103 o nou\u0103 metod\u0103 de autentificare",
      body: "Contul t\u0103u {provider} a fost asociat ca nou\u0103 metod\u0103 de autentificare pentru {email}.",
      footer_reason: "Prime\u0219ti aceast\u0103 notificare de securitate din cauza unei modific\u0103ri a contului t\u0103u PIPINGBOX."
    },
    identity_unlinked_notification: {
      subject: "PIPINGBOX \xB7 A fost eliminat\u0103 o metod\u0103 de autentificare",
      preheader: "O metod\u0103 de autentificare a fost eliminat\u0103 din contul t\u0103u PIPINGBOX.",
      heading: "A fost eliminat\u0103 o metod\u0103 de autentificare",
      body: "Contul t\u0103u {provider} a fost eliminat ca metod\u0103 de autentificare pentru {email}.",
      footer_reason: "Prime\u0219ti aceast\u0103 notificare de securitate din cauza unei modific\u0103ri a contului t\u0103u PIPINGBOX."
    },
    mfa_factor_enrolled_notification: {
      subject: "PIPINGBOX \xB7 A fost ad\u0103ugat\u0103 o nou\u0103 metod\u0103 de verificare",
      preheader: "O nou\u0103 metod\u0103 de verificare a fost ad\u0103ugat\u0103 contului t\u0103u PIPINGBOX.",
      heading: "A fost ad\u0103ugat\u0103 o nou\u0103 metod\u0103 de verificare",
      body: "O nou\u0103 metod\u0103 de verificare a autentific\u0103rii ({factorType}) a fost ad\u0103ugat\u0103 contului t\u0103u PIPINGBOX.",
      footer_reason: "Prime\u0219ti aceast\u0103 notificare de securitate din cauza unei modific\u0103ri a contului t\u0103u PIPINGBOX."
    },
    mfa_factor_unenrolled_notification: {
      subject: "PIPINGBOX \xB7 A fost eliminat\u0103 o metod\u0103 de verificare",
      preheader: "O metod\u0103 de verificare a fost eliminat\u0103 din contul t\u0103u PIPINGBOX.",
      heading: "A fost eliminat\u0103 o metod\u0103 de verificare",
      body: "O metod\u0103 de verificare a autentific\u0103rii ({factorType}) a fost eliminat\u0103 din contul t\u0103u PIPINGBOX.",
      footer_reason: "Prime\u0219ti aceast\u0103 notificare de securitate din cauza unei modific\u0103ri a contului t\u0103u PIPINGBOX."
    },
    job_match: {
      subject: "PIPINGBOX \xB7 Ofert\u0103 nou\u0103 compatibil\u0103 cu profilul t\u0103u: {jobTitle}",
      preheader: "{score}% compatibilitate cu \u201E{jobTitle}\u201D.",
      heading: "Ofert\u0103 nou\u0103 compatibil\u0103 cu profilul t\u0103u",
      body: "Am g\u0103sit o ofert\u0103 de munc\u0103 cu o compatibilitate de {score}% cu profilul t\u0103u: \u201E{jobTitle}\u201D la {company}.",
      body_no_company: "Am g\u0103sit o ofert\u0103 de munc\u0103 cu o compatibilitate de {score}% cu profilul t\u0103u: \u201E{jobTitle}\u201D.",
      button: "Vezi oferta",
      note: "Prime\u0219ti alerte de angajare pentru c\u0103 sunt activate \xEEn profilul t\u0103u PIPINGBOX. Le po\u021Bi dezactiva oric\xE2nd din preferin\u021Bele de compatibilitate.",
      footer_reason: "Prime\u0219ti acest mesaj pentru c\u0103 alertele de angajare sunt activate \xEEn contul t\u0103u PIPINGBOX."
    },
    workforce_match: {
      subject: "PIPINGBOX \xB7 Cerere nou\u0103 de personal compatibil\u0103 cu profilul t\u0103u",
      preheader: "O companie caut\u0103 profesioni\u0219ti {workerType} \xEEn {country}.",
      heading: "Cerere nou\u0103 de personal",
      body: "O companie a publicat o cerere de personal cu o compatibilitate de {score}% cu profilul t\u0103u: {workerType} \xEEn {country}.",
      button: "Vezi cererea",
      note: "Prime\u0219ti aceste alerte pentru c\u0103 sunt activate \xEEn profilul t\u0103u PIPINGBOX. Le po\u021Bi dezactiva oric\xE2nd din preferin\u021Bele de compatibilitate.",
      footer_reason: "Prime\u0219ti acest mesaj pentru c\u0103 alertele de angajare sunt activate \xEEn contul t\u0103u PIPINGBOX."
    },
    cert_expiry: {
      subject: "PIPINGBOX \xB7 Certificarea ta {certName} expir\u0103 cur\xE2nd",
      preheader: "{certName} expir\u0103 la {expiresOn}.",
      heading: "Certificare pe cale s\u0103 expire",
      body: "Certificarea ta {certName} expir\u0103 la {expiresOn}. Men\u021Bine-\u021Bi profilul actualizat pentru ca firmele s\u0103 vad\u0103 certific\u0103rile tale valabile.",
      button: "Actualizeaz\u0103 certific\u0103rile mele",
      note: "Prime\u0219ti aceste alerte pentru c\u0103 sunt activate \xEEn profilul t\u0103u PIPINGBOX.",
      footer_reason: "Prime\u0219ti acest mesaj pentru c\u0103 alertele privind certific\u0103rile sunt activate \xEEn contul t\u0103u PIPINGBOX."
    },
    lead_receipt: {
      subject: "PIPINGBOX \xB7 Am primit solicitarea ta",
      preheader: "\xCE\u021Bi mul\u021Bumim c\u0103 ai contactat PIPINGBOX.",
      heading: "Am primit solicitarea ta",
      body: "Bun\u0103, {name}. \xCE\u021Bi mul\u021Bumim c\u0103 ai contactat PIPINGBOX. Am primit solicitarea ta de personal \u0219i echipa noastr\u0103 te va contacta \xEEn cur\xE2nd cu o propunere.",
      footer_reason: "Prime\u0219ti acest mesaj pentru c\u0103 ai trimis un formular de contact pe pipingbox.com."
    },
    application_pending_profile: {
      subject: "PIPINGBOX \xB7 Candidatur\u0103 primit\u0103 \u2014 completeaz\u0103-\u021Bi profilul pentru a o activa",
      preheader: "Am primit candidatura ta pentru {jobTitle}.",
      heading: "Candidatur\u0103 primit\u0103 \u2014 completeaz\u0103-\u021Bi profilul pentru a o activa",
      body: "Am primit corect candidatura ta pentru \xAB{jobTitle}\xBB la {company}. Po\u021Bi continua s\u0103 aplici la alte oferte: toate candidaturile tale sunt salvate. Aceast\u0103 candidatur\u0103 nu poate fi \xEEnc\u0103 prezentat\u0103 companiei; pentru a o activa, completeaz\u0103-\u021Bi profilul p\xE2n\u0103 este pe deplin validat (Marketplace Ready).",
      body_no_company: "Am primit corect candidatura ta pentru \xAB{jobTitle}\xBB. Po\u021Bi continua s\u0103 aplici la alte oferte: toate candidaturile tale sunt salvate. Aceast\u0103 candidatur\u0103 nu poate fi \xEEnc\u0103 prezentat\u0103 companiei; pentru a o activa, completeaz\u0103-\u021Bi profilul p\xE2n\u0103 este pe deplin validat (Marketplace Ready).",
      note: "Candidatura ta NU a fost respins\u0103: a\u0219teapt\u0103 doar validarea profilului t\u0103u. Imediat ce profilul t\u0103u devine Marketplace Ready, va fi analizat\u0103 automat pentru prezentarea c\u0103tre companii.",
      pending_intro: "Ce lipse\u0219te din profilul t\u0103u:",
      pending_items: {
        photo: "Fotografia de profil",
        basic_details: "Nume \u0219i profesie",
        location: "Loca\u021Bie",
        years_experience: "Ani de experien\u021B\u0103",
        skills: "Competen\u021Be",
        bio: "Despre tine (bio)",
        cv: "CV",
        experience: "Experien\u021B\u0103 profesional\u0103",
        certifications: "Certific\u0103ri",
        documents: "Documente"
      },
      button: "Completeaz\u0103-mi profilul",
      footer_reason: "Prime\u0219ti acest mesaj pentru c\u0103 ai aplicat la o ofert\u0103 pe PIPINGBOX."
    },
    marketplace_ready: {
      subject: "PIPINGBOX \xB7 Profil validat \u2014 candidaturile tale pot fi acum analizate",
      preheader: "Profilul t\u0103u este acum Marketplace Ready.",
      heading: "Profil validat \u2014 candidaturile tale pot fi acum analizate",
      body_single: "Profilul t\u0103u este acum validat \u0219i e\u0219ti Marketplace Ready. Candidatura ta pentru \xAB{jobTitle}\xBB poate fi acum analizat\u0103 pentru prezentarea c\u0103tre companii.",
      body_multiple: "Profilul t\u0103u este acum validat \u0219i e\u0219ti Marketplace Ready. Cele {count} candidaturi \xEEn a\u0219teptare pot fi acum analizate pentru prezentarea c\u0103tre companii.",
      activated_list_intro: "Candidaturi activate:",
      note: "Nu trebuie s\u0103 faci nimic altceva: echipa noastr\u0103 analizeaz\u0103 fiecare candidatur\u0103 \xEEn func\u021Bie de cerin\u021Bele specifice ale fiec\u0103rei oferte \u0219i te va contacta.",
      button: "Vezi candidaturile mele",
      footer_reason: "Prime\u0219ti acest mesaj pentru c\u0103 profilul t\u0103u PIPINGBOX a atins Marketplace Ready."
    },
    cv_review_pending: {
      subject: "PIPINGBOX \xB7 Am primit CV-ul t\u0103u \u2014 verific\u0103-\u021Bi profilul",
      preheader: "\u021Ai-am preg\u0103tit profilul profesionist pe baza CV-ului.",
      heading: "Profilul t\u0103u profesionist este gata de verificat",
      body: "Salut! Am primit CV-ul t\u0103u \u0219i \u021Bi-am preg\u0103tit profilul profesionist pe baza lui. Verific\u0103 datele pentru ca PIPINGBOX s\u0103 te poat\u0103 lua \xEEn calcul pentru oportunit\u0103\u021Bi compatibile.",
      button: "Verific\u0103-mi profilul",
      note: "Nu s-a publicat \xEEnc\u0103 nimic: datele extrase fac parte din profilul t\u0103u doar dup\u0103 ce le verifici \u0219i le confirmi. Certific\u0103rile men\u021Bionate \xEEn CV sunt \xEEnregistrate ca declarate, nu verificate.",
      footer_reason: "Prime\u0219ti acest mesaj pentru c\u0103 PIPINGBOX a primit un CV asociat contului t\u0103u."
    }
  }
};
var ro_default = ro;

// _shared/email-i18n/locales/uk.ts
var uk = {
  code: "uk",
  common: {
    brand_tagline: "\u041F\u0440\u043E\u0444\u0435\u0441\u0456\u0439\u043D\u0430 \u043F\u043B\u0430\u0442\u0444\u043E\u0440\u043C\u0430 \u0434\u043B\u044F \u0437\u0432\u0430\u0440\u044E\u0432\u0430\u043D\u043D\u044F \u0442\u0430 \u043F\u0440\u043E\u043C\u0438\u0441\u043B\u043E\u0432\u043E\u0433\u043E \u0431\u0443\u0434\u0456\u0432\u043D\u0438\u0446\u0442\u0432\u0430",
    button_fallback: "\u042F\u043A\u0449\u043E \u043A\u043D\u043E\u043F\u043A\u0430 \u043D\u0435 \u043F\u0440\u0430\u0446\u044E\u0454, \u0441\u043A\u043E\u043F\u0456\u044E\u0439\u0442\u0435 \u0446\u044E \u0430\u0434\u0440\u0435\u0441\u0443 \u0443 \u0441\u0432\u0456\u0439 \u0431\u0440\u0430\u0443\u0437\u0435\u0440:",
    security_title: "\u0406\u043D\u0444\u043E\u0440\u043C\u0430\u0446\u0456\u044F \u043F\u0440\u043E \u0431\u0435\u0437\u043F\u0435\u043A\u0443",
    expires: "\u0426\u0435 \u043F\u043E\u0441\u0438\u043B\u0430\u043D\u043D\u044F \u0434\u0456\u0439\u0441\u043D\u0435 \u043F\u0440\u043E\u0442\u044F\u0433\u043E\u043C {minutes} \u0445\u0432\u0438\u043B\u0438\u043D \u0456 \u043C\u043E\u0436\u0435 \u0431\u0443\u0442\u0438 \u0432\u0438\u043A\u043E\u0440\u0438\u0441\u0442\u0430\u043D\u0435 \u043B\u0438\u0448\u0435 \u043E\u0434\u0438\u043D \u0440\u0430\u0437. \u042F\u043A\u0449\u043E \u0432\u043E\u043D\u043E \u0432\u0436\u0435 \u043D\u0435\u0434\u0456\u0439\u0441\u043D\u0435, \u0432\u0438 \u043C\u043E\u0436\u0435\u0442\u0435 \u0437\u0430\u043F\u0440\u043E\u0441\u0438\u0442\u0438 \u043D\u043E\u0432\u0435 \u043D\u0430 \u0441\u0442\u043E\u0440\u0456\u043D\u0446\u0456 \u0432\u0445\u043E\u0434\u0443 PIPINGBOX.",
    never_share: "\u041D\u0456\u043A\u043E\u043B\u0438 \u043D\u0435 \u043F\u0435\u0440\u0435\u0434\u0430\u0432\u0430\u0439\u0442\u0435 \u043D\u0456\u043A\u043E\u043C\u0443 \u0446\u0435 \u043F\u043E\u0441\u0438\u043B\u0430\u043D\u043D\u044F \u0430\u0431\u043E \u043A\u043E\u0434. PIPINGBOX \u043D\u0456\u043A\u043E\u043B\u0438 \u043D\u0435 \u0437\u0430\u043F\u0438\u0442\u0443\u0454 \u0432\u0430\u0448 \u043F\u0430\u0440\u043E\u043B\u044C \u0435\u043B\u0435\u043A\u0442\u0440\u043E\u043D\u043D\u043E\u044E \u043F\u043E\u0448\u0442\u043E\u044E, \u0442\u0435\u043B\u0435\u0444\u043E\u043D\u043E\u043C \u0447\u0438 \u0432 \u043C\u0435\u0441\u0435\u043D\u0434\u0436\u0435\u0440\u0430\u0445.",
    support_prompt: "\u042F\u043A\u0449\u043E \u0443 \u0432\u0430\u0441 \u0454 \u0441\u0443\u043C\u043D\u0456\u0432\u0438 \u0449\u043E\u0434\u043E \u0446\u044C\u043E\u0433\u043E \u043F\u043E\u0432\u0456\u0434\u043E\u043C\u043B\u0435\u043D\u043D\u044F, \u043D\u0430\u043F\u0438\u0448\u0456\u0442\u044C \u043D\u0430 {support}, \u043F\u0435\u0440\u0448 \u043D\u0456\u0436 \u0432\u0456\u0434\u043A\u0440\u0438\u0432\u0430\u0442\u0438 \u043F\u043E\u0441\u0438\u043B\u0430\u043D\u043D\u044F.",
    not_you: "\u042F\u043A\u0449\u043E \u0446\u0456 \u0437\u043C\u0456\u043D\u0438 \u0432\u043D\u0435\u0441\u043B\u0438 \u043D\u0435 \u0432\u0438, \u043D\u0435\u0433\u0430\u0439\u043D\u043E \u0437\u0432\u0435\u0440\u043D\u0456\u0442\u044C\u0441\u044F \u043D\u0430 {support} \u0456 \u0441\u043A\u0438\u043D\u044C\u0442\u0435 \u043F\u0430\u0440\u043E\u043B\u044C.",
    footer_no_reply: "\u0410\u0432\u0442\u043E\u043C\u0430\u0442\u0438\u0447\u043D\u0435 \u043F\u043E\u0432\u0456\u0434\u043E\u043C\u043B\u0435\u043D\u043D\u044F \u0432\u0456\u0434 PIPINGBOX. \u0426\u044F \u0430\u0434\u0440\u0435\u0441\u0430 \u043D\u0435 \u043F\u0440\u0438\u0439\u043C\u0430\u0454 \u0432\u0456\u0434\u043F\u043E\u0432\u0456\u0434\u0435\u0439; \u0437 \u0431\u0443\u0434\u044C-\u044F\u043A\u0438\u0445 \u043F\u0438\u0442\u0430\u043D\u044C \u043F\u0438\u0448\u0456\u0442\u044C \u043D\u0430 {support}.",
    code_label: "\u0412\u0430\u0448 \u043A\u043E\u0434 \u043F\u0456\u0434\u0442\u0432\u0435\u0440\u0434\u0436\u0435\u043D\u043D\u044F"
  },
  templates: {
    confirmation: {
      subject: "PIPINGBOX \xB7 \u041F\u0456\u0434\u0442\u0432\u0435\u0440\u0434\u044C\u0442\u0435 \u0441\u0432\u0456\u0439 \u043E\u0431\u043B\u0456\u043A\u043E\u0432\u0438\u0439 \u0437\u0430\u043F\u0438\u0441",
      preheader: "\u041F\u0456\u0434\u0442\u0432\u0435\u0440\u0434\u044C\u0442\u0435 \u0430\u0434\u0440\u0435\u0441\u0443 \u0435\u043B\u0435\u043A\u0442\u0440\u043E\u043D\u043D\u043E\u0457 \u043F\u043E\u0448\u0442\u0438, \u0449\u043E\u0431 \u0430\u043A\u0442\u0438\u0432\u0443\u0432\u0430\u0442\u0438 \u043E\u0431\u043B\u0456\u043A\u043E\u0432\u0438\u0439 \u0437\u0430\u043F\u0438\u0441 PIPINGBOX.",
      heading: "\u041F\u0456\u0434\u0442\u0432\u0435\u0440\u0434\u044C\u0442\u0435 \u0441\u0432\u0456\u0439 \u043E\u0431\u043B\u0456\u043A\u043E\u0432\u0438\u0439 \u0437\u0430\u043F\u0438\u0441",
      body: "\u0414\u044F\u043A\u0443\u0454\u043C\u043E \u0437\u0430 \u0440\u0435\u0454\u0441\u0442\u0440\u0430\u0446\u0456\u044E \u0432 PIPINGBOX \u0437 \u0430\u0434\u0440\u0435\u0441\u043E\u044E {email}. \u0429\u043E\u0431 \u0430\u043A\u0442\u0438\u0432\u0443\u0432\u0430\u0442\u0438 \u043E\u0431\u043B\u0456\u043A\u043E\u0432\u0438\u0439 \u0437\u0430\u043F\u0438\u0441, \u043F\u0456\u0434\u0442\u0432\u0435\u0440\u0434\u044C\u0442\u0435, \u0449\u043E \u0446\u044F \u0430\u0434\u0440\u0435\u0441\u0430 \u0435\u043B\u0435\u043A\u0442\u0440\u043E\u043D\u043D\u043E\u0457 \u043F\u043E\u0448\u0442\u0438 \u043D\u0430\u043B\u0435\u0436\u0438\u0442\u044C \u0432\u0430\u043C.",
      button: "\u041F\u0456\u0434\u0442\u0432\u0435\u0440\u0434\u0438\u0442\u0438 \u043E\u0431\u043B\u0456\u043A\u043E\u0432\u0438\u0439 \u0437\u0430\u043F\u0438\u0441",
      note: "\u042F\u043A\u0449\u043E \u0432\u0438 \u043D\u0435 \u0440\u0435\u0454\u0441\u0442\u0440\u0443\u0432\u0430\u043B\u0438\u0441\u044F \u0432 PIPINGBOX, \u043D\u0456\u0447\u043E\u0433\u043E \u0440\u043E\u0431\u0438\u0442\u0438 \u043D\u0435 \u043F\u043E\u0442\u0440\u0456\u0431\u043D\u043E: \u043E\u0431\u043B\u0456\u043A\u043E\u0432\u0438\u0439 \u0437\u0430\u043F\u0438\u0441 \u0437\u0430\u043B\u0438\u0448\u0438\u0442\u044C\u0441\u044F \u043D\u0435\u043F\u0456\u0434\u0442\u0432\u0435\u0440\u0434\u0436\u0435\u043D\u0438\u043C, \u043D\u0435 \u0431\u0443\u0434\u0435 \u0430\u043A\u0442\u0438\u0432\u043E\u0432\u0430\u043D\u0438\u0439 \u0456 \u043D\u0435 \u0437\u043C\u043E\u0436\u0435 \u0432\u0438\u043A\u043E\u0440\u0438\u0441\u0442\u043E\u0432\u0443\u0432\u0430\u0442\u0438\u0441\u044F \u0434\u043B\u044F \u0434\u043E\u0441\u0442\u0443\u043F\u0443 \u0434\u043E \u043F\u043B\u0430\u0442\u0444\u043E\u0440\u043C\u0438.",
      footer_reason: "\u0412\u0438 \u043E\u0442\u0440\u0438\u043C\u0430\u043B\u0438 \u0446\u0435 \u043F\u043E\u0432\u0456\u0434\u043E\u043C\u043B\u0435\u043D\u043D\u044F, \u043E\u0441\u043A\u0456\u043B\u044C\u043A\u0438 \u0445\u0442\u043E\u0441\u044C \u0437\u0430\u043F\u0440\u043E\u0441\u0438\u0432 \u0441\u0442\u0432\u043E\u0440\u0435\u043D\u043D\u044F \u043E\u0431\u043B\u0456\u043A\u043E\u0432\u043E\u0433\u043E \u0437\u0430\u043F\u0438\u0441\u0443 PIPINGBOX \u0437 \u0446\u0456\u0454\u044E \u0430\u0434\u0440\u0435\u0441\u043E\u044E."
    },
    recovery: {
      subject: "PIPINGBOX \xB7 \u0421\u043A\u0438\u0434\u0430\u043D\u043D\u044F \u043F\u0430\u0440\u043E\u043B\u044F",
      preheader: "\u041C\u0438 \u043E\u0442\u0440\u0438\u043C\u0430\u043B\u0438 \u0437\u0430\u043F\u0438\u0442 \u043D\u0430 \u0441\u043A\u0438\u0434\u0430\u043D\u043D\u044F \u043F\u0430\u0440\u043E\u043B\u044F \u0432\u0430\u0448\u043E\u0433\u043E \u043E\u0431\u043B\u0456\u043A\u043E\u0432\u043E\u0433\u043E \u0437\u0430\u043F\u0438\u0441\u0443 PIPINGBOX.",
      heading: "\u0421\u043A\u0438\u0434\u0430\u043D\u043D\u044F \u043F\u0430\u0440\u043E\u043B\u044F",
      body: "\u041C\u0438 \u043E\u0442\u0440\u0438\u043C\u0430\u043B\u0438 \u0437\u0430\u043F\u0438\u0442 \u043D\u0430 \u0441\u043A\u0438\u0434\u0430\u043D\u043D\u044F \u043F\u0430\u0440\u043E\u043B\u044F \u043E\u0431\u043B\u0456\u043A\u043E\u0432\u043E\u0433\u043E \u0437\u0430\u043F\u0438\u0441\u0443 PIPINGBOX, \u043F\u043E\u0432'\u044F\u0437\u0430\u043D\u043E\u0433\u043E \u0437 \u0430\u0434\u0440\u0435\u0441\u043E\u044E {email}. \u041D\u0430\u0442\u0438\u0441\u043D\u0456\u0442\u044C \u043A\u043D\u043E\u043F\u043A\u0443 \u043D\u0438\u0436\u0447\u0435, \u0449\u043E\u0431 \u043E\u0431\u0440\u0430\u0442\u0438 \u043D\u043E\u0432\u0438\u0439 \u043F\u0430\u0440\u043E\u043B\u044C.",
      button: "\u041E\u0431\u0440\u0430\u0442\u0438 \u043D\u043E\u0432\u0438\u0439 \u043F\u0430\u0440\u043E\u043B\u044C",
      note: "\u042F\u043A\u0449\u043E \u0432\u0438 \u043D\u0435 \u043D\u0430\u0434\u0441\u0438\u043B\u0430\u043B\u0438 \u0446\u0435\u0439 \u0437\u0430\u043F\u0438\u0442, \u043F\u0440\u043E\u0441\u0442\u043E \u043F\u0440\u043E\u0456\u0433\u043D\u043E\u0440\u0443\u0439\u0442\u0435 \u0446\u0435 \u043F\u043E\u0432\u0456\u0434\u043E\u043C\u043B\u0435\u043D\u043D\u044F: \u0432\u0430\u0448 \u043F\u0430\u0440\u043E\u043B\u044C \u0437\u0430\u043B\u0438\u0448\u0438\u0442\u044C\u0441\u044F \u0431\u0435\u0437 \u0437\u043C\u0456\u043D.",
      footer_reason: "\u0412\u0438 \u043E\u0442\u0440\u0438\u043C\u0430\u043B\u0438 \u0446\u0435 \u043F\u043E\u0432\u0456\u0434\u043E\u043C\u043B\u0435\u043D\u043D\u044F, \u043E\u0441\u043A\u0456\u043B\u044C\u043A\u0438 \u0434\u043B\u044F \u0446\u0456\u0454\u0457 \u0430\u0434\u0440\u0435\u0441\u0438 \u0431\u0443\u043B\u043E \u0437\u0430\u043F\u0440\u043E\u0448\u0435\u043D\u043E \u0441\u043A\u0438\u0434\u0430\u043D\u043D\u044F \u043F\u0430\u0440\u043E\u043B\u044F."
    },
    magic_link: {
      subject: "PIPINGBOX \xB7 \u0412\u0430\u0448\u0435 \u043F\u043E\u0441\u0438\u043B\u0430\u043D\u043D\u044F \u0434\u043B\u044F \u0432\u0445\u043E\u0434\u0443",
      preheader: "\u0421\u043A\u043E\u0440\u0438\u0441\u0442\u0430\u0439\u0442\u0435\u0441\u044F \u0446\u0438\u043C \u043F\u043E\u0441\u0438\u043B\u0430\u043D\u043D\u044F\u043C, \u0449\u043E\u0431 \u0443\u0432\u0456\u0439\u0442\u0438 \u0432 PIPINGBOX.",
      heading: "\u0412\u0445\u0456\u0434 \u0443 PIPINGBOX",
      body: "\u041D\u0430\u0442\u0438\u0441\u043D\u0456\u0442\u044C \u043A\u043D\u043E\u043F\u043A\u0443 \u043D\u0438\u0436\u0447\u0435, \u0449\u043E\u0431 \u0443\u0432\u0456\u0439\u0442\u0438 \u0432 PIPINGBOX \u0437 \u0430\u0434\u0440\u0435\u0441\u043E\u044E {email}.",
      button: "\u0423\u0432\u0456\u0439\u0442\u0438",
      note: "\u042F\u043A\u0449\u043E \u0432\u0438 \u043D\u0435 \u0437\u0430\u043F\u0438\u0442\u0443\u0432\u0430\u043B\u0438 \u0446\u0435 \u043F\u043E\u0441\u0438\u043B\u0430\u043D\u043D\u044F, \u043F\u0440\u043E\u0441\u0442\u043E \u043F\u0440\u043E\u0456\u0433\u043D\u043E\u0440\u0443\u0439\u0442\u0435 \u0446\u0435 \u043F\u043E\u0432\u0456\u0434\u043E\u043C\u043B\u0435\u043D\u043D\u044F: \u0431\u0435\u0437 \u043D\u044C\u043E\u0433\u043E \u043D\u0456\u0445\u0442\u043E \u043D\u0435 \u0437\u043C\u043E\u0436\u0435 \u0443\u0432\u0456\u0439\u0442\u0438.",
      footer_reason: "\u0412\u0438 \u043E\u0442\u0440\u0438\u043C\u0430\u043B\u0438 \u0446\u0435 \u043F\u043E\u0432\u0456\u0434\u043E\u043C\u043B\u0435\u043D\u043D\u044F, \u043E\u0441\u043A\u0456\u043B\u044C\u043A\u0438 \u0434\u043B\u044F \u0446\u0456\u0454\u0457 \u0430\u0434\u0440\u0435\u0441\u0438 \u0431\u0443\u043B\u043E \u0437\u0430\u043F\u0440\u043E\u0448\u0435\u043D\u043E \u043F\u043E\u0441\u0438\u043B\u0430\u043D\u043D\u044F \u0434\u043B\u044F \u0432\u0445\u043E\u0434\u0443."
    },
    invite: {
      subject: "PIPINGBOX \xB7 \u0412\u0430\u0441 \u0437\u0430\u043F\u0440\u043E\u0441\u0438\u043B\u0438",
      preheader: "\u0412\u0430\u0441 \u0437\u0430\u043F\u0440\u043E\u0441\u0438\u043B\u0438 \u043F\u0440\u0438\u0454\u0434\u043D\u0430\u0442\u0438\u0441\u044F \u0434\u043E PIPINGBOX.",
      heading: "\u0412\u0430\u0441 \u0437\u0430\u043F\u0440\u043E\u0441\u0438\u043B\u0438 \u0434\u043E PIPINGBOX",
      body: "\u0412\u0430\u0441 \u0437\u0430\u043F\u0440\u043E\u0441\u0438\u043B\u0438 \u0441\u0442\u0432\u043E\u0440\u0438\u0442\u0438 \u043E\u0431\u043B\u0456\u043A\u043E\u0432\u0438\u0439 \u0437\u0430\u043F\u0438\u0441 PIPINGBOX \u0437 \u0430\u0434\u0440\u0435\u0441\u043E\u044E {email}. \u041D\u0430\u0442\u0438\u0441\u043D\u0456\u0442\u044C \u043A\u043D\u043E\u043F\u043A\u0443 \u043D\u0438\u0436\u0447\u0435, \u0449\u043E\u0431 \u043F\u0440\u0438\u0439\u043D\u044F\u0442\u0438 \u0437\u0430\u043F\u0440\u043E\u0448\u0435\u043D\u043D\u044F \u0442\u0430 \u043D\u0430\u043B\u0430\u0448\u0442\u0443\u0432\u0430\u0442\u0438 \u043E\u0431\u043B\u0456\u043A\u043E\u0432\u0438\u0439 \u0437\u0430\u043F\u0438\u0441.",
      button: "\u041F\u0440\u0438\u0439\u043D\u044F\u0442\u0438 \u0437\u0430\u043F\u0440\u043E\u0448\u0435\u043D\u043D\u044F",
      note: "\u042F\u043A\u0449\u043E \u0432\u0438 \u043D\u0435 \u043E\u0447\u0456\u043A\u0443\u0432\u0430\u043B\u0438 \u0446\u044C\u043E\u0433\u043E \u0437\u0430\u043F\u0440\u043E\u0448\u0435\u043D\u043D\u044F, \u043F\u0440\u043E\u0441\u0442\u043E \u043F\u0440\u043E\u0456\u0433\u043D\u043E\u0440\u0443\u0439\u0442\u0435 \u0446\u0435 \u043F\u043E\u0432\u0456\u0434\u043E\u043C\u043B\u0435\u043D\u043D\u044F.",
      footer_reason: "\u0412\u0438 \u043E\u0442\u0440\u0438\u043C\u0430\u043B\u0438 \u0446\u0435 \u043F\u043E\u0432\u0456\u0434\u043E\u043C\u043B\u0435\u043D\u043D\u044F, \u043E\u0441\u043A\u0456\u043B\u044C\u043A\u0438 \u0445\u0442\u043E\u0441\u044C \u0437\u0430\u043F\u0440\u043E\u0441\u0438\u0432 \u0446\u044E \u0430\u0434\u0440\u0435\u0441\u0443 \u0434\u043E PIPINGBOX."
    },
    email_change_current: {
      subject: "PIPINGBOX \xB7 \u041F\u0456\u0434\u0442\u0432\u0435\u0440\u0434\u044C\u0442\u0435 \u0437\u043C\u0456\u043D\u0443 \u0430\u0434\u0440\u0435\u0441\u0438 \u0435\u043B\u0435\u043A\u0442\u0440\u043E\u043D\u043D\u043E\u0457 \u043F\u043E\u0448\u0442\u0438",
      preheader: "\u041F\u0456\u0434\u0442\u0432\u0435\u0440\u0434\u044C\u0442\u0435 \u0437\u043C\u0456\u043D\u0443 \u0430\u0434\u0440\u0435\u0441\u0438 \u0435\u043B\u0435\u043A\u0442\u0440\u043E\u043D\u043D\u043E\u0457 \u043F\u043E\u0448\u0442\u0438 \u0432\u0430\u0448\u043E\u0433\u043E \u043E\u0431\u043B\u0456\u043A\u043E\u0432\u043E\u0433\u043E \u0437\u0430\u043F\u0438\u0441\u0443 PIPINGBOX.",
      heading: "\u041F\u0456\u0434\u0442\u0432\u0435\u0440\u0434\u044C\u0442\u0435 \u0437\u043C\u0456\u043D\u0443 \u0430\u0434\u0440\u0435\u0441\u0438 \u0435\u043B\u0435\u043A\u0442\u0440\u043E\u043D\u043D\u043E\u0457 \u043F\u043E\u0448\u0442\u0438",
      body: "\u041D\u0430\u0434\u0456\u0439\u0448\u043E\u0432 \u0437\u0430\u043F\u0438\u0442 \u043D\u0430 \u0437\u043C\u0456\u043D\u0443 \u0430\u0434\u0440\u0435\u0441\u0438 \u0435\u043B\u0435\u043A\u0442\u0440\u043E\u043D\u043D\u043E\u0457 \u043F\u043E\u0448\u0442\u0438 \u0432\u0430\u0448\u043E\u0433\u043E \u043E\u0431\u043B\u0456\u043A\u043E\u0432\u043E\u0433\u043E \u0437\u0430\u043F\u0438\u0441\u0443 PIPINGBOX \u0437 {email} \u043D\u0430 {newEmail}. \u0429\u043E\u0431 \u0434\u043E\u0437\u0432\u043E\u043B\u0438\u0442\u0438 \u0437\u043C\u0456\u043D\u0443, \u043F\u0456\u0434\u0442\u0432\u0435\u0440\u0434\u044C\u0442\u0435 \u0457\u0457 \u0437 \u0432\u0430\u0448\u043E\u0457 \u043F\u043E\u0442\u043E\u0447\u043D\u043E\u0457 \u0430\u0434\u0440\u0435\u0441\u0438.",
      button: "\u041F\u0456\u0434\u0442\u0432\u0435\u0440\u0434\u0438\u0442\u0438 \u0437\u043C\u0456\u043D\u0443",
      note: "\u042F\u043A\u0449\u043E \u0432\u0438 \u043D\u0435 \u0437\u0430\u043F\u0438\u0442\u0443\u0432\u0430\u043B\u0438 \u0446\u044E \u0437\u043C\u0456\u043D\u0443, \u043D\u0435 \u0432\u0456\u0434\u043A\u0440\u0438\u0432\u0430\u0439\u0442\u0435 \u043F\u043E\u0441\u0438\u043B\u0430\u043D\u043D\u044F: \u043D\u0435\u0433\u0430\u0439\u043D\u043E \u0437\u0432\u0435\u0440\u043D\u0456\u0442\u044C\u0441\u044F \u043D\u0430 {support} \u0456 \u0441\u043A\u0438\u043D\u044C\u0442\u0435 \u043F\u0430\u0440\u043E\u043B\u044C.",
      footer_reason: "\u0412\u0438 \u043E\u0442\u0440\u0438\u043C\u0430\u043B\u0438 \u0446\u0435 \u043F\u043E\u0432\u0456\u0434\u043E\u043C\u043B\u0435\u043D\u043D\u044F, \u043E\u0441\u043A\u0456\u043B\u044C\u043A\u0438 \u0434\u043B\u044F \u043E\u0431\u043B\u0456\u043A\u043E\u0432\u043E\u0433\u043E \u0437\u0430\u043F\u0438\u0441\u0443 \u0437 \u0446\u0456\u0454\u044E \u0430\u0434\u0440\u0435\u0441\u043E\u044E \u0431\u0443\u043B\u043E \u0437\u0430\u043F\u0440\u043E\u0448\u0435\u043D\u043E \u0437\u043C\u0456\u043D\u0443 \u0435\u043B\u0435\u043A\u0442\u0440\u043E\u043D\u043D\u043E\u0457 \u043F\u043E\u0448\u0442\u0438."
    },
    email_change_new: {
      subject: "PIPINGBOX \xB7 \u041F\u0456\u0434\u0442\u0432\u0435\u0440\u0434\u044C\u0442\u0435 \u043D\u043E\u0432\u0443 \u0430\u0434\u0440\u0435\u0441\u0443 \u0435\u043B\u0435\u043A\u0442\u0440\u043E\u043D\u043D\u043E\u0457 \u043F\u043E\u0448\u0442\u0438",
      preheader: "\u041F\u0456\u0434\u0442\u0432\u0435\u0440\u0434\u044C\u0442\u0435 {newEmail} \u044F\u043A \u043D\u043E\u0432\u0443 \u0430\u0434\u0440\u0435\u0441\u0443 \u0432\u0430\u0448\u043E\u0433\u043E \u043E\u0431\u043B\u0456\u043A\u043E\u0432\u043E\u0433\u043E \u0437\u0430\u043F\u0438\u0441\u0443 PIPINGBOX.",
      heading: "\u041F\u0456\u0434\u0442\u0432\u0435\u0440\u0434\u044C\u0442\u0435 \u043D\u043E\u0432\u0443 \u0430\u0434\u0440\u0435\u0441\u0443 \u0435\u043B\u0435\u043A\u0442\u0440\u043E\u043D\u043D\u043E\u0457 \u043F\u043E\u0448\u0442\u0438",
      body: "\u041F\u0456\u0434\u0442\u0432\u0435\u0440\u0434\u044C\u0442\u0435 {newEmail} \u044F\u043A \u043D\u043E\u0432\u0443 \u0430\u0434\u0440\u0435\u0441\u0443 \u0435\u043B\u0435\u043A\u0442\u0440\u043E\u043D\u043D\u043E\u0457 \u043F\u043E\u0448\u0442\u0438 \u0432\u0430\u0448\u043E\u0433\u043E \u043E\u0431\u043B\u0456\u043A\u043E\u0432\u043E\u0433\u043E \u0437\u0430\u043F\u0438\u0441\u0443 PIPINGBOX.",
      button: "\u041F\u0456\u0434\u0442\u0432\u0435\u0440\u0434\u0438\u0442\u0438 \u043D\u043E\u0432\u0443 \u0430\u0434\u0440\u0435\u0441\u0443",
      note: "\u042F\u043A\u0449\u043E \u0432\u0438 \u043D\u0435 \u0437\u0430\u043F\u0438\u0442\u0443\u0432\u0430\u043B\u0438 \u0446\u044E \u0437\u043C\u0456\u043D\u0443, \u043F\u0440\u043E\u0441\u0442\u043E \u043F\u0440\u043E\u0456\u0433\u043D\u043E\u0440\u0443\u0439\u0442\u0435 \u0446\u0435 \u043F\u043E\u0432\u0456\u0434\u043E\u043C\u043B\u0435\u043D\u043D\u044F: \u0430\u0434\u0440\u0435\u0441\u0443 \u043D\u0435 \u0431\u0443\u0434\u0435 \u0437\u043C\u0456\u043D\u0435\u043D\u043E.",
      footer_reason: "\u0412\u0438 \u043E\u0442\u0440\u0438\u043C\u0430\u043B\u0438 \u0446\u0435 \u043F\u043E\u0432\u0456\u0434\u043E\u043C\u043B\u0435\u043D\u043D\u044F, \u043E\u0441\u043A\u0456\u043B\u044C\u043A\u0438 \u0446\u044E \u0430\u0434\u0440\u0435\u0441\u0443 \u0437\u0430\u043F\u0440\u043E\u043F\u043E\u043D\u043E\u0432\u0430\u043D\u043E \u044F\u043A \u043D\u043E\u0432\u0443 \u0430\u0434\u0440\u0435\u0441\u0443 \u043E\u0431\u043B\u0456\u043A\u043E\u0432\u043E\u0433\u043E \u0437\u0430\u043F\u0438\u0441\u0443 PIPINGBOX."
    },
    reauthentication: {
      subject: "PIPINGBOX \xB7 \u0412\u0430\u0448 \u043A\u043E\u0434 \u043F\u0456\u0434\u0442\u0432\u0435\u0440\u0434\u0436\u0435\u043D\u043D\u044F",
      preheader: "\u0421\u043A\u043E\u0440\u0438\u0441\u0442\u0430\u0439\u0442\u0435\u0441\u044F \u0446\u0438\u043C \u043A\u043E\u0434\u043E\u043C, \u0449\u043E\u0431 \u043F\u0456\u0434\u0442\u0432\u0435\u0440\u0434\u0438\u0442\u0438 \u0441\u0432\u043E\u044E \u043E\u0441\u043E\u0431\u0443 \u0432 PIPINGBOX.",
      heading: "\u0412\u0430\u0448 \u043A\u043E\u0434 \u043F\u0456\u0434\u0442\u0432\u0435\u0440\u0434\u0436\u0435\u043D\u043D\u044F",
      body: "\u0412\u0432\u0435\u0434\u0456\u0442\u044C \u043D\u0430\u0432\u0435\u0434\u0435\u043D\u0438\u0439 \u043D\u0438\u0436\u0447\u0435 \u043A\u043E\u0434 \u0443 PIPINGBOX, \u0449\u043E\u0431 \u043F\u0456\u0434\u0442\u0432\u0435\u0440\u0434\u0438\u0442\u0438 \u0441\u0432\u043E\u044E \u043E\u0441\u043E\u0431\u0443. \u0412\u0456\u043D \u0434\u0456\u0439\u0441\u043D\u0438\u0439 {minutes} \u0445\u0432\u0438\u043B\u0438\u043D \u0456 \u043C\u043E\u0436\u0435 \u0431\u0443\u0442\u0438 \u0432\u0438\u043A\u043E\u0440\u0438\u0441\u0442\u0430\u043D\u0438\u0439 \u043B\u0438\u0448\u0435 \u043E\u0434\u0438\u043D \u0440\u0430\u0437.",
      footer_reason: "\u0412\u0438 \u043E\u0442\u0440\u0438\u043C\u0430\u043B\u0438 \u0446\u0435 \u043F\u043E\u0432\u0456\u0434\u043E\u043C\u043B\u0435\u043D\u043D\u044F, \u043E\u0441\u043A\u0456\u043B\u044C\u043A\u0438 \u0432\u0430\u0436\u043B\u0438\u0432\u0430 \u0434\u0456\u044F \u0443 \u0432\u0430\u0448\u043E\u043C\u0443 \u043E\u0431\u043B\u0456\u043A\u043E\u0432\u043E\u043C\u0443 \u0437\u0430\u043F\u0438\u0441\u0456 PIPINGBOX \u0432\u0438\u043C\u0430\u0433\u0430\u043B\u0430 \u043F\u0456\u0434\u0442\u0432\u0435\u0440\u0434\u0436\u0435\u043D\u043D\u044F \u043E\u0441\u043E\u0431\u0438."
    },
    password_changed_notification: {
      subject: "PIPINGBOX \xB7 \u0412\u0430\u0448 \u043F\u0430\u0440\u043E\u043B\u044C \u0437\u043C\u0456\u043D\u0435\u043D\u043E",
      preheader: "\u041F\u0430\u0440\u043E\u043B\u044C \u0432\u0430\u0448\u043E\u0433\u043E \u043E\u0431\u043B\u0456\u043A\u043E\u0432\u043E\u0433\u043E \u0437\u0430\u043F\u0438\u0441\u0443 PIPINGBOX \u0431\u0443\u043B\u043E \u0437\u043C\u0456\u043D\u0435\u043D\u043E.",
      heading: "\u0412\u0430\u0448 \u043F\u0430\u0440\u043E\u043B\u044C \u0437\u043C\u0456\u043D\u0435\u043D\u043E",
      body: "\u041F\u0430\u0440\u043E\u043B\u044C \u043E\u0431\u043B\u0456\u043A\u043E\u0432\u043E\u0433\u043E \u0437\u0430\u043F\u0438\u0441\u0443 PIPINGBOX, \u043F\u043E\u0432'\u044F\u0437\u0430\u043D\u043E\u0433\u043E \u0437 \u0430\u0434\u0440\u0435\u0441\u043E\u044E {email}, \u0431\u0443\u043B\u043E \u043D\u0435\u0449\u043E\u0434\u0430\u0432\u043D\u043E \u0437\u043C\u0456\u043D\u0435\u043D\u043E.",
      footer_reason: "\u0412\u0438 \u043E\u0442\u0440\u0438\u043C\u0430\u043B\u0438 \u0446\u0435 \u043F\u043E\u0432\u0456\u0434\u043E\u043C\u043B\u0435\u043D\u043D\u044F \u043F\u0440\u043E \u0431\u0435\u0437\u043F\u0435\u043A\u0443 \u0447\u0435\u0440\u0435\u0437 \u0437\u043C\u0456\u043D\u0443 \u0443 \u0432\u0430\u0448\u043E\u043C\u0443 \u043E\u0431\u043B\u0456\u043A\u043E\u0432\u043E\u043C\u0443 \u0437\u0430\u043F\u0438\u0441\u0456 PIPINGBOX."
    },
    email_changed_notification: {
      subject: "PIPINGBOX \xB7 \u0412\u0430\u0448\u0443 \u0430\u0434\u0440\u0435\u0441\u0443 \u0435\u043B\u0435\u043A\u0442\u0440\u043E\u043D\u043D\u043E\u0457 \u043F\u043E\u0448\u0442\u0438 \u0437\u043C\u0456\u043D\u0435\u043D\u043E",
      preheader: "\u0410\u0434\u0440\u0435\u0441\u0443 \u0435\u043B\u0435\u043A\u0442\u0440\u043E\u043D\u043D\u043E\u0457 \u043F\u043E\u0448\u0442\u0438 \u0432\u0430\u0448\u043E\u0433\u043E \u043E\u0431\u043B\u0456\u043A\u043E\u0432\u043E\u0433\u043E \u0437\u0430\u043F\u0438\u0441\u0443 PIPINGBOX \u0431\u0443\u043B\u043E \u0437\u043C\u0456\u043D\u0435\u043D\u043E.",
      heading: "\u0412\u0430\u0448\u0443 \u0430\u0434\u0440\u0435\u0441\u0443 \u0435\u043B\u0435\u043A\u0442\u0440\u043E\u043D\u043D\u043E\u0457 \u043F\u043E\u0448\u0442\u0438 \u0437\u043C\u0456\u043D\u0435\u043D\u043E",
      body: "\u0410\u0434\u0440\u0435\u0441\u0443 \u0435\u043B\u0435\u043A\u0442\u0440\u043E\u043D\u043D\u043E\u0457 \u043F\u043E\u0448\u0442\u0438 \u0432\u0430\u0448\u043E\u0433\u043E \u043E\u0431\u043B\u0456\u043A\u043E\u0432\u043E\u0433\u043E \u0437\u0430\u043F\u0438\u0441\u0443 PIPINGBOX \u0431\u0443\u043B\u043E \u0437\u043C\u0456\u043D\u0435\u043D\u043E \u0437 {oldEmail} \u043D\u0430 {email}.",
      footer_reason: "\u0412\u0438 \u043E\u0442\u0440\u0438\u043C\u0430\u043B\u0438 \u0446\u0435 \u043F\u043E\u0432\u0456\u0434\u043E\u043C\u043B\u0435\u043D\u043D\u044F \u043F\u0440\u043E \u0431\u0435\u0437\u043F\u0435\u043A\u0443 \u0447\u0435\u0440\u0435\u0437 \u0437\u043C\u0456\u043D\u0443 \u0443 \u0432\u0430\u0448\u043E\u043C\u0443 \u043E\u0431\u043B\u0456\u043A\u043E\u0432\u043E\u043C\u0443 \u0437\u0430\u043F\u0438\u0441\u0456 PIPINGBOX."
    },
    phone_changed_notification: {
      subject: "PIPINGBOX \xB7 \u0412\u0430\u0448 \u043D\u043E\u043C\u0435\u0440 \u0442\u0435\u043B\u0435\u0444\u043E\u043D\u0443 \u0437\u043C\u0456\u043D\u0435\u043D\u043E",
      preheader: "\u041D\u043E\u043C\u0435\u0440 \u0442\u0435\u043B\u0435\u0444\u043E\u043D\u0443 \u0432\u0430\u0448\u043E\u0433\u043E \u043E\u0431\u043B\u0456\u043A\u043E\u0432\u043E\u0433\u043E \u0437\u0430\u043F\u0438\u0441\u0443 PIPINGBOX \u0431\u0443\u043B\u043E \u0437\u043C\u0456\u043D\u0435\u043D\u043E.",
      heading: "\u0412\u0430\u0448 \u043D\u043E\u043C\u0435\u0440 \u0442\u0435\u043B\u0435\u0444\u043E\u043D\u0443 \u0437\u043C\u0456\u043D\u0435\u043D\u043E",
      body: "\u041D\u043E\u043C\u0435\u0440 \u0442\u0435\u043B\u0435\u0444\u043E\u043D\u0443 \u0432\u0430\u0448\u043E\u0433\u043E \u043E\u0431\u043B\u0456\u043A\u043E\u0432\u043E\u0433\u043E \u0437\u0430\u043F\u0438\u0441\u0443 PIPINGBOX \u0431\u0443\u043B\u043E \u0437\u043C\u0456\u043D\u0435\u043D\u043E \u0437 {oldPhone} \u043D\u0430 {phone}.",
      footer_reason: "\u0412\u0438 \u043E\u0442\u0440\u0438\u043C\u0430\u043B\u0438 \u0446\u0435 \u043F\u043E\u0432\u0456\u0434\u043E\u043C\u043B\u0435\u043D\u043D\u044F \u043F\u0440\u043E \u0431\u0435\u0437\u043F\u0435\u043A\u0443 \u0447\u0435\u0440\u0435\u0437 \u0437\u043C\u0456\u043D\u0443 \u0443 \u0432\u0430\u0448\u043E\u043C\u0443 \u043E\u0431\u043B\u0456\u043A\u043E\u0432\u043E\u043C\u0443 \u0437\u0430\u043F\u0438\u0441\u0456 PIPINGBOX."
    },
    identity_linked_notification: {
      subject: "PIPINGBOX \xB7 \u041F\u0440\u0438\u0432'\u044F\u0437\u0430\u043D\u043E \u043D\u043E\u0432\u0438\u0439 \u0441\u043F\u043E\u0441\u0456\u0431 \u0432\u0445\u043E\u0434\u0443",
      preheader: "\u0414\u043E \u0432\u0430\u0448\u043E\u0433\u043E \u043E\u0431\u043B\u0456\u043A\u043E\u0432\u043E\u0433\u043E \u0437\u0430\u043F\u0438\u0441\u0443 PIPINGBOX \u043F\u0440\u0438\u0432'\u044F\u0437\u0430\u043D\u043E \u043D\u043E\u0432\u0438\u0439 \u0441\u043F\u043E\u0441\u0456\u0431 \u0432\u0445\u043E\u0434\u0443.",
      heading: "\u041F\u0440\u0438\u0432'\u044F\u0437\u0430\u043D\u043E \u043D\u043E\u0432\u0438\u0439 \u0441\u043F\u043E\u0441\u0456\u0431 \u0432\u0445\u043E\u0434\u0443",
      body: "\u0412\u0430\u0448 \u043E\u0431\u043B\u0456\u043A\u043E\u0432\u0438\u0439 \u0437\u0430\u043F\u0438\u0441 {provider} \u043F\u0440\u0438\u0432'\u044F\u0437\u0430\u043D\u043E \u044F\u043A \u043D\u043E\u0432\u0438\u0439 \u0441\u043F\u043E\u0441\u0456\u0431 \u0432\u0445\u043E\u0434\u0443 \u0434\u043B\u044F {email}.",
      footer_reason: "\u0412\u0438 \u043E\u0442\u0440\u0438\u043C\u0430\u043B\u0438 \u0446\u0435 \u043F\u043E\u0432\u0456\u0434\u043E\u043C\u043B\u0435\u043D\u043D\u044F \u043F\u0440\u043E \u0431\u0435\u0437\u043F\u0435\u043A\u0443 \u0447\u0435\u0440\u0435\u0437 \u0437\u043C\u0456\u043D\u0443 \u0443 \u0432\u0430\u0448\u043E\u043C\u0443 \u043E\u0431\u043B\u0456\u043A\u043E\u0432\u043E\u043C\u0443 \u0437\u0430\u043F\u0438\u0441\u0456 PIPINGBOX."
    },
    identity_unlinked_notification: {
      subject: "PIPINGBOX \xB7 \u0412\u0438\u0434\u0430\u043B\u0435\u043D\u043E \u0441\u043F\u043E\u0441\u0456\u0431 \u0432\u0445\u043E\u0434\u0443",
      preheader: "\u0417 \u0432\u0430\u0448\u043E\u0433\u043E \u043E\u0431\u043B\u0456\u043A\u043E\u0432\u043E\u0433\u043E \u0437\u0430\u043F\u0438\u0441\u0443 PIPINGBOX \u0432\u0438\u0434\u0430\u043B\u0435\u043D\u043E \u0441\u043F\u043E\u0441\u0456\u0431 \u0432\u0445\u043E\u0434\u0443.",
      heading: "\u0412\u0438\u0434\u0430\u043B\u0435\u043D\u043E \u0441\u043F\u043E\u0441\u0456\u0431 \u0432\u0445\u043E\u0434\u0443",
      body: "\u0412\u0430\u0448 \u043E\u0431\u043B\u0456\u043A\u043E\u0432\u0438\u0439 \u0437\u0430\u043F\u0438\u0441 {provider} \u0432\u0438\u0434\u0430\u043B\u0435\u043D\u043E \u0437\u0456 \u0441\u043F\u043E\u0441\u043E\u0431\u0456\u0432 \u0432\u0445\u043E\u0434\u0443 \u0434\u043B\u044F {email}.",
      footer_reason: "\u0412\u0438 \u043E\u0442\u0440\u0438\u043C\u0430\u043B\u0438 \u0446\u0435 \u043F\u043E\u0432\u0456\u0434\u043E\u043C\u043B\u0435\u043D\u043D\u044F \u043F\u0440\u043E \u0431\u0435\u0437\u043F\u0435\u043A\u0443 \u0447\u0435\u0440\u0435\u0437 \u0437\u043C\u0456\u043D\u0443 \u0443 \u0432\u0430\u0448\u043E\u043C\u0443 \u043E\u0431\u043B\u0456\u043A\u043E\u0432\u043E\u043C\u0443 \u0437\u0430\u043F\u0438\u0441\u0456 PIPINGBOX."
    },
    mfa_factor_enrolled_notification: {
      subject: "PIPINGBOX \xB7 \u0414\u043E\u0434\u0430\u043D\u043E \u043D\u043E\u0432\u0438\u0439 \u0441\u043F\u043E\u0441\u0456\u0431 \u043F\u0456\u0434\u0442\u0432\u0435\u0440\u0434\u0436\u0435\u043D\u043D\u044F",
      preheader: "\u0414\u043E \u0432\u0430\u0448\u043E\u0433\u043E \u043E\u0431\u043B\u0456\u043A\u043E\u0432\u043E\u0433\u043E \u0437\u0430\u043F\u0438\u0441\u0443 PIPINGBOX \u0434\u043E\u0434\u0430\u043D\u043E \u043D\u043E\u0432\u0438\u0439 \u0441\u043F\u043E\u0441\u0456\u0431 \u043F\u0456\u0434\u0442\u0432\u0435\u0440\u0434\u0436\u0435\u043D\u043D\u044F.",
      heading: "\u0414\u043E\u0434\u0430\u043D\u043E \u043D\u043E\u0432\u0438\u0439 \u0441\u043F\u043E\u0441\u0456\u0431 \u043F\u0456\u0434\u0442\u0432\u0435\u0440\u0434\u0436\u0435\u043D\u043D\u044F",
      body: "\u0414\u043E \u0432\u0430\u0448\u043E\u0433\u043E \u043E\u0431\u043B\u0456\u043A\u043E\u0432\u043E\u0433\u043E \u0437\u0430\u043F\u0438\u0441\u0443 PIPINGBOX \u0434\u043E\u0434\u0430\u043D\u043E \u043D\u043E\u0432\u0438\u0439 \u0441\u043F\u043E\u0441\u0456\u0431 \u043F\u0456\u0434\u0442\u0432\u0435\u0440\u0434\u0436\u0435\u043D\u043D\u044F \u0432\u0445\u043E\u0434\u0443 ({factorType}).",
      footer_reason: "\u0412\u0438 \u043E\u0442\u0440\u0438\u043C\u0430\u043B\u0438 \u0446\u0435 \u043F\u043E\u0432\u0456\u0434\u043E\u043C\u043B\u0435\u043D\u043D\u044F \u043F\u0440\u043E \u0431\u0435\u0437\u043F\u0435\u043A\u0443 \u0447\u0435\u0440\u0435\u0437 \u0437\u043C\u0456\u043D\u0443 \u0443 \u0432\u0430\u0448\u043E\u043C\u0443 \u043E\u0431\u043B\u0456\u043A\u043E\u0432\u043E\u043C\u0443 \u0437\u0430\u043F\u0438\u0441\u0456 PIPINGBOX."
    },
    mfa_factor_unenrolled_notification: {
      subject: "PIPINGBOX \xB7 \u0412\u0438\u0434\u0430\u043B\u0435\u043D\u043E \u0441\u043F\u043E\u0441\u0456\u0431 \u043F\u0456\u0434\u0442\u0432\u0435\u0440\u0434\u0436\u0435\u043D\u043D\u044F",
      preheader: "\u0417 \u0432\u0430\u0448\u043E\u0433\u043E \u043E\u0431\u043B\u0456\u043A\u043E\u0432\u043E\u0433\u043E \u0437\u0430\u043F\u0438\u0441\u0443 PIPINGBOX \u0432\u0438\u0434\u0430\u043B\u0435\u043D\u043E \u0441\u043F\u043E\u0441\u0456\u0431 \u043F\u0456\u0434\u0442\u0432\u0435\u0440\u0434\u0436\u0435\u043D\u043D\u044F.",
      heading: "\u0412\u0438\u0434\u0430\u043B\u0435\u043D\u043E \u0441\u043F\u043E\u0441\u0456\u0431 \u043F\u0456\u0434\u0442\u0432\u0435\u0440\u0434\u0436\u0435\u043D\u043D\u044F",
      body: "\u0417 \u0432\u0430\u0448\u043E\u0433\u043E \u043E\u0431\u043B\u0456\u043A\u043E\u0432\u043E\u0433\u043E \u0437\u0430\u043F\u0438\u0441\u0443 PIPINGBOX \u0432\u0438\u0434\u0430\u043B\u0435\u043D\u043E \u0441\u043F\u043E\u0441\u0456\u0431 \u043F\u0456\u0434\u0442\u0432\u0435\u0440\u0434\u0436\u0435\u043D\u043D\u044F \u0432\u0445\u043E\u0434\u0443 ({factorType}).",
      footer_reason: "\u0412\u0438 \u043E\u0442\u0440\u0438\u043C\u0430\u043B\u0438 \u0446\u0435 \u043F\u043E\u0432\u0456\u0434\u043E\u043C\u043B\u0435\u043D\u043D\u044F \u043F\u0440\u043E \u0431\u0435\u0437\u043F\u0435\u043A\u0443 \u0447\u0435\u0440\u0435\u0437 \u0437\u043C\u0456\u043D\u0443 \u0443 \u0432\u0430\u0448\u043E\u043C\u0443 \u043E\u0431\u043B\u0456\u043A\u043E\u0432\u043E\u043C\u0443 \u0437\u0430\u043F\u0438\u0441\u0456 PIPINGBOX."
    },
    job_match: {
      subject: "PIPINGBOX \xB7 \u041D\u043E\u0432\u0430 \u0432\u0430\u043A\u0430\u043D\u0441\u0456\u044F, \u0449\u043E \u0432\u0456\u0434\u043F\u043E\u0432\u0456\u0434\u0430\u0454 \u0432\u0430\u0448\u043E\u043C\u0443 \u043F\u0440\u043E\u0444\u0456\u043B\u044E: {jobTitle}",
      preheader: "{score}% \u0432\u0456\u0434\u043F\u043E\u0432\u0456\u0434\u043D\u043E\u0441\u0442\u0456 \u0432\u0430\u043A\u0430\u043D\u0441\u0456\u0457 \xAB{jobTitle}\xBB.",
      heading: "\u041D\u043E\u0432\u0430 \u0432\u0430\u043A\u0430\u043D\u0441\u0456\u044F, \u0449\u043E \u0432\u0456\u0434\u043F\u043E\u0432\u0456\u0434\u0430\u0454 \u0432\u0430\u0448\u043E\u043C\u0443 \u043F\u0440\u043E\u0444\u0456\u043B\u044E",
      body: "\u041C\u0438 \u0437\u043D\u0430\u0439\u0448\u043B\u0438 \u0432\u0430\u043A\u0430\u043D\u0441\u0456\u044E \u0437 \u0432\u0456\u0434\u043F\u043E\u0432\u0456\u0434\u043D\u0456\u0441\u0442\u044E {score}% \u0432\u0430\u0448\u043E\u043C\u0443 \u043F\u0440\u043E\u0444\u0456\u043B\u044E: \xAB{jobTitle}\xBB \u0443 \u043A\u043E\u043C\u043F\u0430\u043D\u0456\u0457 {company}.",
      body_no_company: "\u041C\u0438 \u0437\u043D\u0430\u0439\u0448\u043B\u0438 \u0432\u0430\u043A\u0430\u043D\u0441\u0456\u044E \u0437 \u0432\u0456\u0434\u043F\u043E\u0432\u0456\u0434\u043D\u0456\u0441\u0442\u044E {score}% \u0432\u0430\u0448\u043E\u043C\u0443 \u043F\u0440\u043E\u0444\u0456\u043B\u044E: \xAB{jobTitle}\xBB.",
      button: "\u041F\u0435\u0440\u0435\u0433\u043B\u044F\u043D\u0443\u0442\u0438 \u0432\u0430\u043A\u0430\u043D\u0441\u0456\u044E",
      note: "\u0412\u0438 \u043E\u0442\u0440\u0438\u043C\u0443\u0454\u0442\u0435 \u0441\u043F\u043E\u0432\u0456\u0449\u0435\u043D\u043D\u044F \u043F\u0440\u043E \u0432\u0430\u043A\u0430\u043D\u0441\u0456\u0457, \u043E\u0441\u043A\u0456\u043B\u044C\u043A\u0438 \u0432\u043E\u043D\u0438 \u0443\u0432\u0456\u043C\u043A\u043D\u0435\u043D\u0456 \u0443 \u0432\u0430\u0448\u043E\u043C\u0443 \u043F\u0440\u043E\u0444\u0456\u043B\u0456 PIPINGBOX. \u0412\u0438 \u043C\u043E\u0436\u0435\u0442\u0435 \u0431\u0443\u0434\u044C-\u043A\u043E\u043B\u0438 \u0432\u0438\u043C\u043A\u043D\u0443\u0442\u0438 \u0457\u0445 \u0443 \u043D\u0430\u043B\u0430\u0448\u0442\u0443\u0432\u0430\u043D\u043D\u044F\u0445 \u043F\u0456\u0434\u0431\u043E\u0440\u0443.",
      footer_reason: "\u0412\u0438 \u043E\u0442\u0440\u0438\u043C\u0430\u043B\u0438 \u0446\u0435 \u043F\u043E\u0432\u0456\u0434\u043E\u043C\u043B\u0435\u043D\u043D\u044F, \u043E\u0441\u043A\u0456\u043B\u044C\u043A\u0438 \u0443 \u0432\u0430\u0448\u043E\u043C\u0443 \u043E\u0431\u043B\u0456\u043A\u043E\u0432\u043E\u043C\u0443 \u0437\u0430\u043F\u0438\u0441\u0456 PIPINGBOX \u0443\u0432\u0456\u043C\u043A\u043D\u0435\u043D\u043E \u0441\u043F\u043E\u0432\u0456\u0449\u0435\u043D\u043D\u044F \u043F\u0440\u043E \u0432\u0430\u043A\u0430\u043D\u0441\u0456\u0457."
    },
    workforce_match: {
      subject: "PIPINGBOX \xB7 \u041D\u043E\u0432\u0438\u0439 \u0437\u0430\u043F\u0438\u0442 \u043D\u0430 \u043F\u0435\u0440\u0441\u043E\u043D\u0430\u043B, \u0449\u043E \u0432\u0456\u0434\u043F\u043E\u0432\u0456\u0434\u0430\u0454 \u0432\u0430\u0448\u043E\u043C\u0443 \u043F\u0440\u043E\u0444\u0456\u043B\u044E",
      preheader: "\u041A\u043E\u043C\u043F\u0430\u043D\u0456\u044F \u0448\u0443\u043A\u0430\u0454 \u0444\u0430\u0445\u0456\u0432\u0446\u0456\u0432 ({workerType}) \u0443 \u043A\u0440\u0430\u0457\u043D\u0456: {country}.",
      heading: "\u041D\u043E\u0432\u0438\u0439 \u0437\u0430\u043F\u0438\u0442 \u043D\u0430 \u043F\u0435\u0440\u0441\u043E\u043D\u0430\u043B",
      body: "\u041A\u043E\u043C\u043F\u0430\u043D\u0456\u044F \u043E\u043F\u0443\u0431\u043B\u0456\u043A\u0443\u0432\u0430\u043B\u0430 \u0437\u0430\u043F\u0438\u0442 \u043D\u0430 \u043F\u0435\u0440\u0441\u043E\u043D\u0430\u043B \u0437 \u0432\u0456\u0434\u043F\u043E\u0432\u0456\u0434\u043D\u0456\u0441\u0442\u044E {score}% \u0432\u0430\u0448\u043E\u043C\u0443 \u043F\u0440\u043E\u0444\u0456\u043B\u044E: {workerType}, {country}.",
      button: "\u041F\u0435\u0440\u0435\u0433\u043B\u044F\u043D\u0443\u0442\u0438 \u0437\u0430\u043F\u0438\u0442",
      note: "\u0412\u0438 \u043E\u0442\u0440\u0438\u043C\u0443\u0454\u0442\u0435 \u0446\u0456 \u0441\u043F\u043E\u0432\u0456\u0449\u0435\u043D\u043D\u044F, \u043E\u0441\u043A\u0456\u043B\u044C\u043A\u0438 \u0432\u043E\u043D\u0438 \u0443\u0432\u0456\u043C\u043A\u043D\u0435\u043D\u0456 \u0443 \u0432\u0430\u0448\u043E\u043C\u0443 \u043F\u0440\u043E\u0444\u0456\u043B\u0456 PIPINGBOX. \u0412\u0438 \u043C\u043E\u0436\u0435\u0442\u0435 \u0431\u0443\u0434\u044C-\u043A\u043E\u043B\u0438 \u0432\u0438\u043C\u043A\u043D\u0443\u0442\u0438 \u0457\u0445 \u0443 \u043D\u0430\u043B\u0430\u0448\u0442\u0443\u0432\u0430\u043D\u043D\u044F\u0445 \u043F\u0456\u0434\u0431\u043E\u0440\u0443.",
      footer_reason: "\u0412\u0438 \u043E\u0442\u0440\u0438\u043C\u0430\u043B\u0438 \u0446\u0435 \u043F\u043E\u0432\u0456\u0434\u043E\u043C\u043B\u0435\u043D\u043D\u044F, \u043E\u0441\u043A\u0456\u043B\u044C\u043A\u0438 \u0443 \u0432\u0430\u0448\u043E\u043C\u0443 \u043E\u0431\u043B\u0456\u043A\u043E\u0432\u043E\u043C\u0443 \u0437\u0430\u043F\u0438\u0441\u0456 PIPINGBOX \u0443\u0432\u0456\u043C\u043A\u043D\u0435\u043D\u043E \u0441\u043F\u043E\u0432\u0456\u0449\u0435\u043D\u043D\u044F \u043F\u0440\u043E \u0432\u0430\u043A\u0430\u043D\u0441\u0456\u0457."
    },
    cert_expiry: {
      subject: "PIPINGBOX \xB7 \u0422\u0435\u0440\u043C\u0456\u043D \u0434\u0456\u0457 \u0432\u0430\u0448\u043E\u0433\u043E \u0441\u0435\u0440\u0442\u0438\u0444\u0456\u043A\u0430\u0442\u0430 {certName} \u0441\u043A\u043E\u0440\u043E \u0437\u0430\u043A\u0456\u043D\u0447\u0443\u0454\u0442\u044C\u0441\u044F",
      preheader: "\u0422\u0435\u0440\u043C\u0456\u043D \u0434\u0456\u0457 {certName} \u0437\u0430\u043A\u0456\u043D\u0447\u0443\u0454\u0442\u044C\u0441\u044F {expiresOn}.",
      heading: "\u0422\u0435\u0440\u043C\u0456\u043D \u0434\u0456\u0457 \u0441\u0435\u0440\u0442\u0438\u0444\u0456\u043A\u0430\u0442\u0430 \u0441\u043A\u043E\u0440\u043E \u0437\u0430\u043A\u0456\u043D\u0447\u0443\u0454\u0442\u044C\u0441\u044F",
      body: "\u0422\u0435\u0440\u043C\u0456\u043D \u0434\u0456\u0457 \u0432\u0430\u0448\u043E\u0433\u043E \u0441\u0435\u0440\u0442\u0438\u0444\u0456\u043A\u0430\u0442\u0430 {certName} \u0437\u0430\u043A\u0456\u043D\u0447\u0443\u0454\u0442\u044C\u0441\u044F {expiresOn}. \u041F\u0456\u0434\u0442\u0440\u0438\u043C\u0443\u0439\u0442\u0435 \u043F\u0440\u043E\u0444\u0456\u043B\u044C \u0430\u043A\u0442\u0443\u0430\u043B\u044C\u043D\u0438\u043C, \u0449\u043E\u0431 \u043A\u043E\u043C\u043F\u0430\u043D\u0456\u0457 \u0431\u0430\u0447\u0438\u043B\u0438 \u0432\u0430\u0448\u0456 \u0447\u0438\u043D\u043D\u0456 \u0441\u0435\u0440\u0442\u0438\u0444\u0456\u043A\u0430\u0442\u0438.",
      button: "\u041E\u043D\u043E\u0432\u0438\u0442\u0438 \u043C\u043E\u0457 \u0441\u0435\u0440\u0442\u0438\u0444\u0456\u043A\u0430\u0442\u0438",
      note: "\u0412\u0438 \u043E\u0442\u0440\u0438\u043C\u0443\u0454\u0442\u0435 \u0446\u0456 \u0441\u043F\u043E\u0432\u0456\u0449\u0435\u043D\u043D\u044F, \u043E\u0441\u043A\u0456\u043B\u044C\u043A\u0438 \u0432\u043E\u043D\u0438 \u0443\u0432\u0456\u043C\u043A\u043D\u0435\u043D\u0456 \u0443 \u0432\u0430\u0448\u043E\u043C\u0443 \u043F\u0440\u043E\u0444\u0456\u043B\u0456 PIPINGBOX.",
      footer_reason: "\u0412\u0438 \u043E\u0442\u0440\u0438\u043C\u0430\u043B\u0438 \u0446\u0435 \u043F\u043E\u0432\u0456\u0434\u043E\u043C\u043B\u0435\u043D\u043D\u044F, \u043E\u0441\u043A\u0456\u043B\u044C\u043A\u0438 \u0443 \u0432\u0430\u0448\u043E\u043C\u0443 \u043E\u0431\u043B\u0456\u043A\u043E\u0432\u043E\u043C\u0443 \u0437\u0430\u043F\u0438\u0441\u0456 PIPINGBOX \u0443\u0432\u0456\u043C\u043A\u043D\u0435\u043D\u043E \u0441\u043F\u043E\u0432\u0456\u0449\u0435\u043D\u043D\u044F \u043F\u0440\u043E \u0441\u0435\u0440\u0442\u0438\u0444\u0456\u043A\u0430\u0442\u0438."
    },
    lead_receipt: {
      subject: "PIPINGBOX \xB7 \u041C\u0438 \u043E\u0442\u0440\u0438\u043C\u0430\u043B\u0438 \u0432\u0430\u0448 \u0437\u0430\u043F\u0438\u0442",
      preheader: "\u0414\u044F\u043A\u0443\u0454\u043C\u043E, \u0449\u043E \u0437\u0432\u0435\u0440\u043D\u0443\u043B\u0438\u0441\u044F \u0434\u043E PIPINGBOX.",
      heading: "\u041C\u0438 \u043E\u0442\u0440\u0438\u043C\u0430\u043B\u0438 \u0432\u0430\u0448 \u0437\u0430\u043F\u0438\u0442",
      body: "\u0412\u0456\u0442\u0430\u0454\u043C\u043E, {name}! \u0414\u044F\u043A\u0443\u0454\u043C\u043E, \u0449\u043E \u0437\u0432\u0435\u0440\u043D\u0443\u043B\u0438\u0441\u044F \u0434\u043E PIPINGBOX. \u041C\u0438 \u043E\u0442\u0440\u0438\u043C\u0430\u043B\u0438 \u0432\u0430\u0448 \u0437\u0430\u043F\u0438\u0442 \u043D\u0430 \u043F\u0435\u0440\u0441\u043E\u043D\u0430\u043B, \u0456 \u043D\u0430\u0448\u0430 \u043A\u043E\u043C\u0430\u043D\u0434\u0430 \u043D\u0435\u0437\u0430\u0431\u0430\u0440\u043E\u043C \u0437\u0432'\u044F\u0436\u0435\u0442\u044C\u0441\u044F \u0437 \u0432\u0430\u043C\u0438 \u0437 \u043F\u0440\u043E\u043F\u043E\u0437\u0438\u0446\u0456\u0454\u044E.",
      footer_reason: "\u0412\u0438 \u043E\u0442\u0440\u0438\u043C\u0430\u043B\u0438 \u0446\u0435 \u043F\u043E\u0432\u0456\u0434\u043E\u043C\u043B\u0435\u043D\u043D\u044F, \u043E\u0441\u043A\u0456\u043B\u044C\u043A\u0438 \u043D\u0430\u0434\u0456\u0441\u043B\u0430\u043B\u0438 \u043A\u043E\u043D\u0442\u0430\u043A\u0442\u043D\u0443 \u0444\u043E\u0440\u043C\u0443 \u043D\u0430 pipingbox.com."
    },
    application_pending_profile: {
      subject: "PIPINGBOX \xB7 \u0417\u0430\u044F\u0432\u043A\u0443 \u043E\u0442\u0440\u0438\u043C\u0430\u043D\u043E \u2014 \u0437\u0430\u043F\u043E\u0432\u043D\u0456\u0442\u044C \u043F\u0440\u043E\u0444\u0456\u043B\u044C, \u0449\u043E\u0431 \u0430\u043A\u0442\u0438\u0432\u0443\u0432\u0430\u0442\u0438 \u0457\u0457",
      preheader: "\u041C\u0438 \u043E\u0442\u0440\u0438\u043C\u0430\u043B\u0438 \u0432\u0430\u0448\u0443 \u0437\u0430\u044F\u0432\u043A\u0443 \u043D\u0430 {jobTitle}.",
      heading: "\u0417\u0430\u044F\u0432\u043A\u0443 \u043E\u0442\u0440\u0438\u043C\u0430\u043D\u043E \u2014 \u0437\u0430\u043F\u043E\u0432\u043D\u0456\u0442\u044C \u043F\u0440\u043E\u0444\u0456\u043B\u044C, \u0449\u043E\u0431 \u0430\u043A\u0442\u0438\u0432\u0443\u0432\u0430\u0442\u0438 \u0457\u0457",
      body: "\u041C\u0438 \u043E\u0442\u0440\u0438\u043C\u0430\u043B\u0438 \u0432\u0430\u0448\u0443 \u0437\u0430\u044F\u0432\u043A\u0443 \u043D\u0430 \xAB{jobTitle}\xBB \u0443 \u043A\u043E\u043C\u043F\u0430\u043D\u0456\u0457 {company}. \u0412\u0438 \u043C\u043E\u0436\u0435\u0442\u0435 \u043F\u0440\u043E\u0434\u043E\u0432\u0436\u0443\u0432\u0430\u0442\u0438 \u043F\u043E\u0434\u0430\u0447\u0443 \u0437\u0430\u044F\u0432\u043E\u043A \u043D\u0430 \u0456\u043D\u0448\u0456 \u043F\u0440\u043E\u043F\u043E\u0437\u0438\u0446\u0456\u0457: \u0443\u0441\u0456 \u0432\u0430\u0448\u0456 \u0437\u0430\u044F\u0432\u043A\u0438 \u0437\u0431\u0435\u0440\u0435\u0436\u0435\u043D\u043E. \u0426\u044E \u0437\u0430\u044F\u0432\u043A\u0443 \u0449\u0435 \u043D\u0435 \u043C\u043E\u0436\u043D\u0430 \u043F\u0440\u0435\u0434\u0441\u0442\u0430\u0432\u0438\u0442\u0438 \u043A\u043E\u043C\u043F\u0430\u043D\u0456\u0457; \u0449\u043E\u0431 \u0430\u043A\u0442\u0438\u0432\u0443\u0432\u0430\u0442\u0438 \u0457\u0457, \u0437\u0430\u043F\u043E\u0432\u043D\u0456\u0442\u044C \u043F\u0440\u043E\u0444\u0456\u043B\u044C \u0434\u043E \u043F\u043E\u0432\u043D\u043E\u0457 \u0432\u0430\u043B\u0456\u0434\u0430\u0446\u0456\u0457 (Marketplace Ready).",
      body_no_company: "\u041C\u0438 \u043E\u0442\u0440\u0438\u043C\u0430\u043B\u0438 \u0432\u0430\u0448\u0443 \u0437\u0430\u044F\u0432\u043A\u0443 \u043D\u0430 \xAB{jobTitle}\xBB. \u0412\u0438 \u043C\u043E\u0436\u0435\u0442\u0435 \u043F\u0440\u043E\u0434\u043E\u0432\u0436\u0443\u0432\u0430\u0442\u0438 \u043F\u043E\u0434\u0430\u0447\u0443 \u0437\u0430\u044F\u0432\u043E\u043A \u043D\u0430 \u0456\u043D\u0448\u0456 \u043F\u0440\u043E\u043F\u043E\u0437\u0438\u0446\u0456\u0457: \u0443\u0441\u0456 \u0432\u0430\u0448\u0456 \u0437\u0430\u044F\u0432\u043A\u0438 \u0437\u0431\u0435\u0440\u0435\u0436\u0435\u043D\u043E. \u0426\u044E \u0437\u0430\u044F\u0432\u043A\u0443 \u0449\u0435 \u043D\u0435 \u043C\u043E\u0436\u043D\u0430 \u043F\u0440\u0435\u0434\u0441\u0442\u0430\u0432\u0438\u0442\u0438 \u043A\u043E\u043C\u043F\u0430\u043D\u0456\u0457; \u0449\u043E\u0431 \u0430\u043A\u0442\u0438\u0432\u0443\u0432\u0430\u0442\u0438 \u0457\u0457, \u0437\u0430\u043F\u043E\u0432\u043D\u0456\u0442\u044C \u043F\u0440\u043E\u0444\u0456\u043B\u044C \u0434\u043E \u043F\u043E\u0432\u043D\u043E\u0457 \u0432\u0430\u043B\u0456\u0434\u0430\u0446\u0456\u0457 (Marketplace Ready).",
      note: "\u0412\u0430\u0448\u0443 \u0437\u0430\u044F\u0432\u043A\u0443 \u041D\u0415 \u0432\u0456\u0434\u0445\u0438\u043B\u0435\u043D\u043E: \u0432\u043E\u043D\u0430 \u043F\u0440\u043E\u0441\u0442\u043E \u043E\u0447\u0456\u043A\u0443\u0454 \u043D\u0430 \u0432\u0430\u043B\u0456\u0434\u0430\u0446\u0456\u044E \u0432\u0430\u0448\u043E\u0433\u043E \u043F\u0440\u043E\u0444\u0456\u043B\u044E. \u0429\u043E\u0439\u043D\u043E \u0432\u0430\u0448 \u043F\u0440\u043E\u0444\u0456\u043B\u044C \u0441\u0442\u0430\u043D\u0435 Marketplace Ready, \u0457\u0457 \u0430\u0432\u0442\u043E\u043C\u0430\u0442\u0438\u0447\u043D\u043E \u0431\u0443\u0434\u0435 \u0440\u043E\u0437\u0433\u043B\u044F\u043D\u0443\u0442\u043E \u0434\u043B\u044F \u043F\u043E\u0434\u0430\u043D\u043D\u044F \u043A\u043E\u043C\u043F\u0430\u043D\u0456\u044F\u043C.",
      pending_intro: "\u0427\u043E\u0433\u043E \u043D\u0435 \u0432\u0438\u0441\u0442\u0430\u0447\u0430\u0454 \u0443 \u0432\u0430\u0448\u043E\u043C\u0443 \u043F\u0440\u043E\u0444\u0456\u043B\u0456:",
      pending_items: {
        photo: "\u0424\u043E\u0442\u043E \u043F\u0440\u043E\u0444\u0456\u043B\u044E",
        basic_details: "\u0406\u043C'\u044F \u0442\u0430 \u043F\u0440\u043E\u0444\u0435\u0441\u0456\u044F",
        location: "\u041B\u043E\u043A\u0430\u0446\u0456\u044F",
        years_experience: "\u0420\u043E\u043A\u0438 \u0434\u043E\u0441\u0432\u0456\u0434\u0443",
        skills: "\u041D\u0430\u0432\u0438\u0447\u043A\u0438",
        bio: "\u041F\u0440\u043E \u0432\u0430\u0441 (\u0431\u0456\u043E)",
        cv: "\u0420\u0435\u0437\u044E\u043C\u0435 (CV)",
        experience: "\u0414\u043E\u0441\u0432\u0456\u0434 \u0440\u043E\u0431\u043E\u0442\u0438",
        certifications: "\u0421\u0435\u0440\u0442\u0438\u0444\u0456\u043A\u0430\u0442\u0438",
        documents: "\u0414\u043E\u043A\u0443\u043C\u0435\u043D\u0442\u0438"
      },
      button: "\u0417\u0430\u043F\u043E\u0432\u043D\u0438\u0442\u0438 \u043F\u0440\u043E\u0444\u0456\u043B\u044C",
      footer_reason: "\u0412\u0438 \u043E\u0442\u0440\u0438\u043C\u0443\u0454\u0442\u0435 \u0446\u0435 \u043F\u043E\u0432\u0456\u0434\u043E\u043C\u043B\u0435\u043D\u043D\u044F, \u0442\u043E\u043C\u0443 \u0449\u043E \u043F\u043E\u0434\u0430\u043B\u0438 \u0437\u0430\u044F\u0432\u043A\u0443 \u043D\u0430 \u0432\u0430\u043A\u0430\u043D\u0441\u0456\u044E \u0432 PIPINGBOX."
    },
    marketplace_ready: {
      subject: "PIPINGBOX \xB7 \u041F\u0440\u043E\u0444\u0456\u043B\u044C \u0432\u0430\u043B\u0456\u0434\u043E\u0432\u0430\u043D\u043E \u2014 \u0432\u0430\u0448\u0456 \u0437\u0430\u044F\u0432\u043A\u0438 \u0432\u0436\u0435 \u043C\u043E\u0436\u0443\u0442\u044C \u0440\u043E\u0437\u0433\u043B\u044F\u0434\u0430\u0442\u0438\u0441\u044F",
      preheader: "\u0412\u0430\u0448 \u043F\u0440\u043E\u0444\u0456\u043B\u044C \u0442\u0435\u043F\u0435\u0440 Marketplace Ready.",
      heading: "\u041F\u0440\u043E\u0444\u0456\u043B\u044C \u0432\u0430\u043B\u0456\u0434\u043E\u0432\u0430\u043D\u043E \u2014 \u0432\u0430\u0448\u0456 \u0437\u0430\u044F\u0432\u043A\u0438 \u0432\u0436\u0435 \u043C\u043E\u0436\u0443\u0442\u044C \u0440\u043E\u0437\u0433\u043B\u044F\u0434\u0430\u0442\u0438\u0441\u044F",
      body_single: "\u0412\u0430\u0448 \u043F\u0440\u043E\u0444\u0456\u043B\u044C \u0432\u0430\u043B\u0456\u0434\u043E\u0432\u0430\u043D\u043E, \u0456 \u0432\u0438 \u0442\u0435\u043F\u0435\u0440 Marketplace Ready. \u0412\u0430\u0448\u0443 \u0437\u0430\u044F\u0432\u043A\u0443 \u043D\u0430 \xAB{jobTitle}\xBB \u0432\u0436\u0435 \u043C\u043E\u0436\u0435 \u0431\u0443\u0442\u0438 \u0440\u043E\u0437\u0433\u043B\u044F\u043D\u0443\u0442\u043E \u0434\u043B\u044F \u043F\u043E\u0434\u0430\u043D\u043D\u044F \u043A\u043E\u043C\u043F\u0430\u043D\u0456\u044F\u043C.",
      body_multiple: "\u0412\u0430\u0448 \u043F\u0440\u043E\u0444\u0456\u043B\u044C \u0432\u0430\u043B\u0456\u0434\u043E\u0432\u0430\u043D\u043E, \u0456 \u0432\u0438 \u0442\u0435\u043F\u0435\u0440 Marketplace Ready. \u0412\u0430\u0448\u0456 {count} \u0437\u0430\u044F\u0432\u043E\u043A \u0443 \u043E\u0447\u0456\u043A\u0443\u0432\u0430\u043D\u043D\u0456 \u0432\u0436\u0435 \u043C\u043E\u0436\u0443\u0442\u044C \u0431\u0443\u0442\u0438 \u0440\u043E\u0437\u0433\u043B\u044F\u043D\u0443\u0442\u0456 \u0434\u043B\u044F \u043F\u043E\u0434\u0430\u043D\u043D\u044F \u043A\u043E\u043C\u043F\u0430\u043D\u0456\u044F\u043C.",
      activated_list_intro: "\u0410\u043A\u0442\u0438\u0432\u043E\u0432\u0430\u043D\u0456 \u0437\u0430\u044F\u0432\u043A\u0438:",
      note: "\u0412\u0430\u043C \u0431\u0456\u043B\u044C\u0448\u0435 \u043D\u0456\u0447\u043E\u0433\u043E \u043D\u0435 \u043F\u043E\u0442\u0440\u0456\u0431\u043D\u043E \u0440\u043E\u0431\u0438\u0442\u0438: \u043D\u0430\u0448\u0430 \u043A\u043E\u043C\u0430\u043D\u0434\u0430 \u0440\u043E\u0437\u0433\u043B\u044F\u0434\u0430\u0454 \u043A\u043E\u0436\u043D\u0443 \u0437\u0430\u044F\u0432\u043A\u0443 \u0432\u0456\u0434\u043F\u043E\u0432\u0456\u0434\u043D\u043E \u0434\u043E \u043A\u043E\u043D\u043A\u0440\u0435\u0442\u043D\u0438\u0445 \u0432\u0438\u043C\u043E\u0433 \u043A\u043E\u0436\u043D\u043E\u0457 \u0432\u0430\u043A\u0430\u043D\u0441\u0456\u0457 \u0442\u0430 \u0437\u0432'\u044F\u0436\u0435\u0442\u044C\u0441\u044F \u0437 \u0432\u0430\u043C\u0438.",
      button: "\u041F\u0435\u0440\u0435\u0433\u043B\u044F\u043D\u0443\u0442\u0438 \u043C\u043E\u0457 \u0437\u0430\u044F\u0432\u043A\u0438",
      footer_reason: "\u0412\u0438 \u043E\u0442\u0440\u0438\u043C\u0443\u0454\u0442\u0435 \u0446\u0435 \u043F\u043E\u0432\u0456\u0434\u043E\u043C\u043B\u0435\u043D\u043D\u044F, \u0442\u043E\u043C\u0443 \u0449\u043E \u0432\u0430\u0448 \u043F\u0440\u043E\u0444\u0456\u043B\u044C PIPINGBOX \u0434\u043E\u0441\u044F\u0433 \u0441\u0442\u0430\u0442\u0443\u0441\u0443 Marketplace Ready."
    },
    cv_review_pending: {
      subject: "PIPINGBOX \xB7 \u041C\u0438 \u043E\u0442\u0440\u0438\u043C\u0430\u043B\u0438 \u0432\u0430\u0448\u0435 \u0440\u0435\u0437\u044E\u043C\u0435 \u2014 \u043F\u0435\u0440\u0435\u0433\u043B\u044F\u043D\u044C\u0442\u0435 \u0441\u0432\u0456\u0439 \u043F\u0440\u043E\u0444\u0456\u043B\u044C",
      preheader: "\u041C\u0438 \u043F\u0456\u0434\u0433\u043E\u0442\u0443\u0432\u0430\u043B\u0438 \u0432\u0430\u0448 \u043F\u0440\u043E\u0444\u0435\u0441\u0456\u0439\u043D\u0438\u0439 \u043F\u0440\u043E\u0444\u0456\u043B\u044C \u043D\u0430 \u043E\u0441\u043D\u043E\u0432\u0456 \u0440\u0435\u0437\u044E\u043C\u0435.",
      heading: "\u0412\u0430\u0448 \u043F\u0440\u043E\u0444\u0435\u0441\u0456\u0439\u043D\u0438\u0439 \u043F\u0440\u043E\u0444\u0456\u043B\u044C \u0433\u043E\u0442\u043E\u0432\u0438\u0439 \u0434\u043E \u043F\u0435\u0440\u0435\u0433\u043B\u044F\u0434\u0443",
      body: "\u0412\u0456\u0442\u0430\u0454\u043C\u043E! \u041C\u0438 \u043E\u0442\u0440\u0438\u043C\u0430\u043B\u0438 \u0432\u0430\u0448\u0435 \u0440\u0435\u0437\u044E\u043C\u0435 \u0442\u0430 \u043F\u0456\u0434\u0433\u043E\u0442\u0443\u0432\u0430\u043B\u0438 \u043D\u0430 \u0439\u043E\u0433\u043E \u043E\u0441\u043D\u043E\u0432\u0456 \u0432\u0430\u0448 \u043F\u0440\u043E\u0444\u0435\u0441\u0456\u0439\u043D\u0438\u0439 \u043F\u0440\u043E\u0444\u0456\u043B\u044C. \u041F\u0435\u0440\u0435\u0433\u043B\u044F\u043D\u044C\u0442\u0435 \u0434\u0430\u043D\u0456, \u0449\u043E\u0431 PIPINGBOX \u043C\u043E\u0433\u043B\u043E \u0440\u043E\u0437\u0433\u043B\u044F\u0434\u0430\u0442\u0438 \u0432\u0430\u0441 \u0434\u043B\u044F \u0441\u0443\u043C\u0456\u0441\u043D\u0438\u0445 \u043C\u043E\u0436\u043B\u0438\u0432\u043E\u0441\u0442\u0435\u0439.",
      button: "\u041F\u0435\u0440\u0435\u0433\u043B\u044F\u043D\u0443\u0442\u0438 \u043C\u0456\u0439 \u043F\u0440\u043E\u0444\u0456\u043B\u044C",
      note: "\u041D\u0456\u0447\u043E\u0433\u043E \u0449\u0435 \u043D\u0435 \u043E\u043F\u0443\u0431\u043B\u0456\u043A\u043E\u0432\u0430\u043D\u043E: \u0432\u0438\u0442\u044F\u0433\u043D\u0443\u0442\u0456 \u0434\u0430\u043D\u0456 \u0441\u0442\u0430\u043D\u0443\u0442\u044C \u0447\u0430\u0441\u0442\u0438\u043D\u043E\u044E \u0432\u0430\u0448\u043E\u0433\u043E \u043F\u0440\u043E\u0444\u0456\u043B\u044E \u043B\u0438\u0448\u0435 \u043F\u0456\u0441\u043B\u044F \u043F\u0435\u0440\u0435\u0433\u043B\u044F\u0434\u0443 \u0442\u0430 \u043F\u0456\u0434\u0442\u0432\u0435\u0440\u0434\u0436\u0435\u043D\u043D\u044F. \u0421\u0435\u0440\u0442\u0438\u0444\u0456\u043A\u0430\u0442\u0438, \u0437\u0433\u0430\u0434\u0430\u043D\u0456 \u0432 \u0440\u0435\u0437\u044E\u043C\u0435, \u0440\u0435\u0454\u0441\u0442\u0440\u0443\u044E\u0442\u044C\u0441\u044F \u044F\u043A \u0437\u0430\u0434\u0435\u043A\u043B\u0430\u0440\u043E\u0432\u0430\u043D\u0456, \u0430 \u043D\u0435 \u043F\u0435\u0440\u0435\u0432\u0456\u0440\u0435\u043D\u0456.",
      footer_reason: "\u0412\u0438 \u043E\u0442\u0440\u0438\u043C\u0443\u0454\u0442\u0435 \u0446\u0435 \u043F\u043E\u0432\u0456\u0434\u043E\u043C\u043B\u0435\u043D\u043D\u044F, \u043E\u0441\u043A\u0456\u043B\u044C\u043A\u0438 PIPINGBOX \u043E\u0442\u0440\u0438\u043C\u0430\u043B\u043E \u0440\u0435\u0437\u044E\u043C\u0435, \u043F\u043E\u0432'\u044F\u0437\u0430\u043D\u0435 \u0437 \u0432\u0430\u0448\u0438\u043C \u043E\u0431\u043B\u0456\u043A\u043E\u0432\u0438\u043C \u0437\u0430\u043F\u0438\u0441\u043E\u043C."
    }
  }
};
var uk_default = uk;

// _shared/email-i18n/locales/pl.ts
var pl = {
  code: "pl",
  common: {
    brand_tagline: "Profesjonalna platforma dla spawalnictwa i budownictwa przemys\u0142owego",
    button_fallback: "Je\u015Bli przycisk nie dzia\u0142a, skopiuj ten adres do przegl\u0105darki:",
    security_title: "Informacje o bezpiecze\u0144stwie",
    expires: "Ten link wygasa za {minutes} minut i mo\u017Ce zosta\u0107 u\u017Cyty tylko raz. Je\u015Bli wygas\u0142, mo\u017Cesz poprosi\u0107 o nowy na ekranie logowania PIPINGBOX.",
    never_share: "Nigdy nie udost\u0119pniaj nikomu tego linku ani kodu. PIPINGBOX nigdy nie poprosi Ci\u0119 o has\u0142o przez e-mail, telefon ani komunikator.",
    support_prompt: "Je\u015Bli masz w\u0105tpliwo\u015Bci co do tej wiadomo\u015Bci, napisz na {support}, zanim otworzysz link.",
    not_you: "Je\u015Bli to nie Ty wprowadzi\u0142e\u015B t\u0119 zmian\u0119, natychmiast skontaktuj si\u0119 z {support} i zresetuj has\u0142o.",
    footer_no_reply: "Automatyczna wiadomo\u015B\u0107 od PIPINGBOX. Ten adres nie przyjmuje odpowiedzi; w razie pyta\u0144 napisz na {support}.",
    code_label: "Tw\xF3j kod weryfikacyjny"
  },
  templates: {
    confirmation: {
      subject: "PIPINGBOX \xB7 Potwierd\u017A swoje konto",
      preheader: "Potwierd\u017A adres e-mail, aby aktywowa\u0107 konto PIPINGBOX.",
      heading: "Potwierd\u017A swoje konto",
      body: "Dzi\u0119kujemy za rejestracj\u0119 w PIPINGBOX z adresem {email}. Aby aktywowa\u0107 konto, potwierd\u017A, \u017Ce ten adres e-mail nale\u017Cy do Ciebie.",
      button: "Potwierdzam konto",
      note: "Je\u015Bli nie rejestrowa\u0142e\u015B si\u0119 w PIPINGBOX, nie musisz nic robi\u0107: konto pozostanie niepotwierdzone, nie zostanie aktywowane i nie b\u0119dzie mo\u017Cna z niego korzysta\u0107.",
      footer_reason: "Otrzymujesz t\u0119 wiadomo\u015B\u0107, poniewa\u017C kto\u015B poprosi\u0142 o utworzenie konta PIPINGBOX z tym adresem."
    },
    recovery: {
      subject: "PIPINGBOX \xB7 Zresetuj has\u0142o",
      preheader: "Otrzymali\u015Bmy pro\u015Bb\u0119 o zresetowanie has\u0142a do Twojego konta PIPINGBOX.",
      heading: "Zresetuj has\u0142o",
      body: "Otrzymali\u015Bmy pro\u015Bb\u0119 o zresetowanie has\u0142a do konta PIPINGBOX powi\u0105zanego z adresem {email}. U\u017Cyj poni\u017Cszego przycisku, aby wybra\u0107 nowe has\u0142o.",
      button: "Wybierz nowe has\u0142o",
      note: "Je\u015Bli nie prosi\u0142e\u015B o t\u0119 zmian\u0119, zignoruj t\u0119 wiadomo\u015B\u0107: Twoje has\u0142o pozostanie bez zmian.",
      footer_reason: "Otrzymujesz t\u0119 wiadomo\u015B\u0107, poniewa\u017C dla tego adresu poproszono o zresetowanie has\u0142a."
    },
    magic_link: {
      subject: "PIPINGBOX \xB7 Tw\xF3j link do logowania",
      preheader: "U\u017Cyj tego linku, aby zalogowa\u0107 si\u0119 do PIPINGBOX.",
      heading: "Zaloguj si\u0119 do PIPINGBOX",
      body: "U\u017Cyj poni\u017Cszego przycisku, aby zalogowa\u0107 si\u0119 do PIPINGBOX z adresem {email}.",
      button: "Zaloguj si\u0119",
      note: "Je\u015Bli nie prosi\u0142e\u015B o ten link, zignoruj t\u0119 wiadomo\u015B\u0107: bez niego nikt nie mo\u017Ce si\u0119 zalogowa\u0107.",
      footer_reason: "Otrzymujesz t\u0119 wiadomo\u015B\u0107, poniewa\u017C dla tego adresu poproszono o link do logowania."
    },
    invite: {
      subject: "PIPINGBOX \xB7 Otrzyma\u0142e\u015B zaproszenie",
      preheader: "Zosta\u0142e\u015B zaproszony do PIPINGBOX.",
      heading: "Zosta\u0142e\u015B zaproszony do PIPINGBOX",
      body: "Zosta\u0142e\u015B zaproszony do utworzenia konta PIPINGBOX z adresem {email}. U\u017Cyj poni\u017Cszego przycisku, aby przyj\u0105\u0107 zaproszenie i skonfigurowa\u0107 konto.",
      button: "Przyjmij zaproszenie",
      note: "Je\u015Bli nie spodziewa\u0142e\u015B si\u0119 tego zaproszenia, zignoruj t\u0119 wiadomo\u015B\u0107.",
      footer_reason: "Otrzymujesz t\u0119 wiadomo\u015B\u0107, poniewa\u017C kto\u015B zaprosi\u0142 ten adres do PIPINGBOX."
    },
    email_change_current: {
      subject: "PIPINGBOX \xB7 Potwierd\u017A zmian\u0119 adresu e-mail",
      preheader: "Potwierd\u017A zmian\u0119 adresu e-mail Twojego konta PIPINGBOX.",
      heading: "Potwierd\u017A zmian\u0119 adresu e-mail",
      body: "Poproszono o zmian\u0119 adresu e-mail Twojego konta PIPINGBOX z {email} na {newEmail}. Aby zatwierdzi\u0107 zmian\u0119, potwierd\u017A j\u0105 ze swojego obecnego adresu.",
      button: "Potwierd\u017A zmian\u0119",
      note: "Je\u015Bli nie prosi\u0142e\u015B o t\u0119 zmian\u0119, nie u\u017Cywaj linku: natychmiast skontaktuj si\u0119 z {support} i zresetuj has\u0142o.",
      footer_reason: "Otrzymujesz t\u0119 wiadomo\u015B\u0107, poniewa\u017C dla konta powi\u0105zanego z tym adresem poproszono o zmian\u0119 adresu e-mail."
    },
    email_change_new: {
      subject: "PIPINGBOX \xB7 Potwierd\u017A nowy adres e-mail",
      preheader: "Potwierd\u017A {newEmail} jako nowy adres Twojego konta PIPINGBOX.",
      heading: "Potwierd\u017A nowy adres e-mail",
      body: "Potwierd\u017A {newEmail} jako nowy adres e-mail Twojego konta PIPINGBOX.",
      button: "Potwierd\u017A nowy adres",
      note: "Je\u015Bli nie prosi\u0142e\u015B o t\u0119 zmian\u0119, zignoruj t\u0119 wiadomo\u015B\u0107: adres nie zostanie zmieniony.",
      footer_reason: "Otrzymujesz t\u0119 wiadomo\u015B\u0107, poniewa\u017C ten adres zaproponowano jako nowy adres konta PIPINGBOX."
    },
    reauthentication: {
      subject: "PIPINGBOX \xB7 Tw\xF3j kod weryfikacyjny",
      preheader: "U\u017Cyj tego kodu, aby potwierdzi\u0107 swoj\u0105 to\u017Csamo\u015B\u0107 w PIPINGBOX.",
      heading: "Tw\xF3j kod weryfikacyjny",
      body: "Wpisz poni\u017Cszy kod w PIPINGBOX, aby potwierdzi\u0107 swoj\u0105 to\u017Csamo\u015B\u0107. Wygasa za {minutes} minut i mo\u017Ce zosta\u0107 u\u017Cyty tylko raz.",
      footer_reason: "Otrzymujesz t\u0119 wiadomo\u015B\u0107, poniewa\u017C wra\u017Cliwa operacja na Twoim koncie PIPINGBOX wymaga\u0142a potwierdzenia to\u017Csamo\u015Bci."
    },
    password_changed_notification: {
      subject: "PIPINGBOX \xB7 Twoje has\u0142o zosta\u0142o zmienione",
      preheader: "Has\u0142o do Twojego konta PIPINGBOX zosta\u0142o zmienione.",
      heading: "Twoje has\u0142o zosta\u0142o zmienione",
      body: "Has\u0142o do konta PIPINGBOX powi\u0105zanego z adresem {email} zosta\u0142o niedawno zmienione.",
      footer_reason: "Otrzymujesz to powiadomienie o bezpiecze\u0144stwie z powodu zmiany na Twoim koncie PIPINGBOX."
    },
    email_changed_notification: {
      subject: "PIPINGBOX \xB7 Tw\xF3j adres e-mail zosta\u0142 zmieniony",
      preheader: "Adres e-mail Twojego konta PIPINGBOX zosta\u0142 zmieniony.",
      heading: "Tw\xF3j adres e-mail zosta\u0142 zmieniony",
      body: "Adres e-mail Twojego konta PIPINGBOX zosta\u0142 zmieniony z {oldEmail} na {email}.",
      footer_reason: "Otrzymujesz to powiadomienie o bezpiecze\u0144stwie z powodu zmiany na Twoim koncie PIPINGBOX."
    },
    phone_changed_notification: {
      subject: "PIPINGBOX \xB7 Tw\xF3j numer telefonu zosta\u0142 zmieniony",
      preheader: "Numer telefonu Twojego konta PIPINGBOX zosta\u0142 zmieniony.",
      heading: "Tw\xF3j numer telefonu zosta\u0142 zmieniony",
      body: "Numer telefonu Twojego konta PIPINGBOX zosta\u0142 zmieniony z {oldPhone} na {phone}.",
      footer_reason: "Otrzymujesz to powiadomienie o bezpiecze\u0144stwie z powodu zmiany na Twoim koncie PIPINGBOX."
    },
    identity_linked_notification: {
      subject: "PIPINGBOX \xB7 Powi\u0105zano now\u0105 metod\u0119 logowania",
      preheader: "Z Twoim kontem PIPINGBOX powi\u0105zano now\u0105 metod\u0119 logowania.",
      heading: "Powi\u0105zano now\u0105 metod\u0119 logowania",
      body: "Twoje konto {provider} zosta\u0142o powi\u0105zane jako nowa metoda logowania dla {email}.",
      footer_reason: "Otrzymujesz to powiadomienie o bezpiecze\u0144stwie z powodu zmiany na Twoim koncie PIPINGBOX."
    },
    identity_unlinked_notification: {
      subject: "PIPINGBOX \xB7 Usuni\u0119to metod\u0119 logowania",
      preheader: "Z Twojego konta PIPINGBOX usuni\u0119to metod\u0119 logowania.",
      heading: "Usuni\u0119to metod\u0119 logowania",
      body: "Twoje konto {provider} zosta\u0142o usuni\u0119te jako metoda logowania dla {email}.",
      footer_reason: "Otrzymujesz to powiadomienie o bezpiecze\u0144stwie z powodu zmiany na Twoim koncie PIPINGBOX."
    },
    mfa_factor_enrolled_notification: {
      subject: "PIPINGBOX \xB7 Dodano now\u0105 metod\u0119 weryfikacji",
      preheader: "Do Twojego konta PIPINGBOX dodano now\u0105 metod\u0119 weryfikacji.",
      heading: "Dodano now\u0105 metod\u0119 weryfikacji",
      body: "Do Twojego konta PIPINGBOX dodano now\u0105 metod\u0119 weryfikacji logowania ({factorType}).",
      footer_reason: "Otrzymujesz to powiadomienie o bezpiecze\u0144stwie z powodu zmiany na Twoim koncie PIPINGBOX."
    },
    mfa_factor_unenrolled_notification: {
      subject: "PIPINGBOX \xB7 Usuni\u0119to metod\u0119 weryfikacji",
      preheader: "Z Twojego konta PIPINGBOX usuni\u0119to metod\u0119 weryfikacji.",
      heading: "Usuni\u0119to metod\u0119 weryfikacji",
      body: "Z Twojego konta PIPINGBOX usuni\u0119to metod\u0119 weryfikacji logowania ({factorType}).",
      footer_reason: "Otrzymujesz to powiadomienie o bezpiecze\u0144stwie z powodu zmiany na Twoim koncie PIPINGBOX."
    },
    job_match: {
      subject: "PIPINGBOX \xB7 Nowa oferta pasuj\u0105ca do Twojego profilu: {jobTitle}",
      preheader: "{score}% zgodno\u015Bci z ofert\u0105 \u201E{jobTitle}\u201D.",
      heading: "Nowa oferta pasuj\u0105ca do Twojego profilu",
      body: "Znale\u017Ali\u015Bmy ofert\u0119 pracy o zgodno\u015Bci {score}% z Twoim profilem: \u201E{jobTitle}\u201D w {company}.",
      body_no_company: "Znale\u017Ali\u015Bmy ofert\u0119 pracy o zgodno\u015Bci {score}% z Twoim profilem: \u201E{jobTitle}\u201D.",
      button: "Zobacz ofert\u0119",
      note: "Otrzymujesz powiadomienia o ofertach, poniewa\u017C s\u0105 w\u0142\u0105czone w Twoim profilu PIPINGBOX. Mo\u017Cesz je w ka\u017Cdej chwili wy\u0142\u0105czy\u0107 w preferencjach dopasowania.",
      footer_reason: "Otrzymujesz t\u0119 wiadomo\u015B\u0107, poniewa\u017C na Twoim koncie PIPINGBOX w\u0142\u0105czone s\u0105 powiadomienia o ofertach pracy."
    },
    workforce_match: {
      subject: "PIPINGBOX \xB7 Nowe zapotrzebowanie na pracownik\xF3w pasuj\u0105ce do Twojego profilu",
      preheader: "Firma szuka specjalist\xF3w ({workerType}) w kraju: {country}.",
      heading: "Nowe zapotrzebowanie na pracownik\xF3w",
      body: "Firma opublikowa\u0142a zapotrzebowanie na pracownik\xF3w o zgodno\u015Bci {score}% z Twoim profilem: {workerType}, {country}.",
      button: "Zobacz zapotrzebowanie",
      note: "Otrzymujesz te powiadomienia, poniewa\u017C s\u0105 w\u0142\u0105czone w Twoim profilu PIPINGBOX. Mo\u017Cesz je w ka\u017Cdej chwili wy\u0142\u0105czy\u0107 w preferencjach dopasowania.",
      footer_reason: "Otrzymujesz t\u0119 wiadomo\u015B\u0107, poniewa\u017C na Twoim koncie PIPINGBOX w\u0142\u0105czone s\u0105 powiadomienia o ofertach pracy."
    },
    cert_expiry: {
      subject: "PIPINGBOX \xB7 Tw\xF3j certyfikat {certName} wkr\xF3tce wygasa",
      preheader: "{certName} wygasa {expiresOn}.",
      heading: "Certyfikat wkr\xF3tce wygasa",
      body: "Tw\xF3j certyfikat {certName} wygasa {expiresOn}. Aktualizuj sw\xF3j profil, aby firmy widzia\u0142y Twoje wa\u017Cne certyfikaty.",
      button: "Aktualizuj moje certyfikaty",
      note: "Otrzymujesz te powiadomienia, poniewa\u017C s\u0105 w\u0142\u0105czone w Twoim profilu PIPINGBOX.",
      footer_reason: "Otrzymujesz t\u0119 wiadomo\u015B\u0107, poniewa\u017C na Twoim koncie PIPINGBOX w\u0142\u0105czone s\u0105 powiadomienia o certyfikatach."
    },
    lead_receipt: {
      subject: "PIPINGBOX \xB7 Otrzymali\u015Bmy Twoje zapytanie",
      preheader: "Dzi\u0119kujemy za kontakt z PIPINGBOX.",
      heading: "Otrzymali\u015Bmy Twoje zapytanie",
      body: "Dzie\u0144 dobry, {name}. Dzi\u0119kujemy za kontakt z PIPINGBOX. Otrzymali\u015Bmy Twoje zapotrzebowanie na pracownik\xF3w i nasz zesp\xF3\u0142 wkr\xF3tce skontaktuje si\u0119 z Tob\u0105 z propozycj\u0105.",
      footer_reason: "Otrzymujesz t\u0119 wiadomo\u015B\u0107, poniewa\u017C wys\u0142a\u0142e\u015B formularz kontaktowy na pipingbox.com."
    },
    application_pending_profile: {
      subject: "PIPINGBOX \xB7 Zg\u0142oszenie przyj\u0119te \u2014 uzupe\u0142nij profil, aby je aktywowa\u0107",
      preheader: "Otrzymali\u015Bmy Twoje zg\u0142oszenie na {jobTitle}.",
      heading: "Zg\u0142oszenie przyj\u0119te \u2014 uzupe\u0142nij profil, aby je aktywowa\u0107",
      body: "Otrzymali\u015Bmy poprawnie Twoje zg\u0142oszenie na \xAB{jobTitle}\xBB w firmie {company}. Mo\u017Cesz dalej aplikowa\u0107 na inne oferty: wszystkie Twoje zg\u0142oszenia s\u0105 zapisywane. Tego zg\u0142oszenia nie mo\u017Cna jeszcze przedstawi\u0107 firmie; aby je aktywowa\u0107, uzupe\u0142nij profil do pe\u0142nej walidacji (Marketplace Ready).",
      body_no_company: "Otrzymali\u015Bmy poprawnie Twoje zg\u0142oszenie na \xAB{jobTitle}\xBB. Mo\u017Cesz dalej aplikowa\u0107 na inne oferty: wszystkie Twoje zg\u0142oszenia s\u0105 zapisywane. Tego zg\u0142oszenia nie mo\u017Cna jeszcze przedstawi\u0107 firmie; aby je aktywowa\u0107, uzupe\u0142nij profil do pe\u0142nej walidacji (Marketplace Ready).",
      note: "Twoje zg\u0142oszenie NIE zosta\u0142o odrzucone: czeka jedynie na walidacj\u0119 Twojego profilu. Gdy tylko Tw\xF3j profil stanie si\u0119 Marketplace Ready, zostanie automatycznie przekazane do przegl\u0105du pod k\u0105tem prezentacji firmom.",
      pending_intro: "Czego brakuje w Twoim profilu:",
      pending_items: {
        photo: "Zdj\u0119cie profilowe",
        basic_details: "Imi\u0119 i zaw\xF3d",
        location: "Lokalizacja",
        years_experience: "Lata do\u015Bwiadczenia",
        skills: "Umiej\u0119tno\u015Bci",
        bio: "O Tobie (bio)",
        cv: "CV",
        experience: "Do\u015Bwiadczenie zawodowe",
        certifications: "Certyfikaty",
        documents: "Dokumenty"
      },
      button: "Uzupe\u0142nij m\xF3j profil",
      footer_reason: "Otrzymujesz t\u0119 wiadomo\u015B\u0107, poniewa\u017C aplikowa\u0142e\u015B na ofert\u0119 w PIPINGBOX."
    },
    marketplace_ready: {
      subject: "PIPINGBOX \xB7 Profil zwalidowany \u2014 Twoje zg\u0142oszenia mog\u0105 by\u0107 ju\u017C przegl\u0105dane",
      preheader: "Tw\xF3j profil jest ju\u017C Marketplace Ready.",
      heading: "Profil zwalidowany \u2014 Twoje zg\u0142oszenia mog\u0105 by\u0107 ju\u017C przegl\u0105dane",
      body_single: "Tw\xF3j profil zosta\u0142 zwalidowany i jeste\u015B Marketplace Ready. Twoje zg\u0142oszenie na \xAB{jobTitle}\xBB mo\u017Ce by\u0107 ju\u017C przegl\u0105dane pod k\u0105tem prezentacji firmom.",
      body_multiple: "Tw\xF3j profil zosta\u0142 zwalidowany i jeste\u015B Marketplace Ready. Twoje {count} oczekuj\u0105cych zg\u0142osze\u0144 mo\u017Ce by\u0107 ju\u017C przegl\u0105danych pod k\u0105tem prezentacji firmom.",
      activated_list_intro: "Aktywowane zg\u0142oszenia:",
      note: "Nie musisz nic wi\u0119cej robi\u0107: nasz zesp\xF3\u0142 przegl\u0105da ka\u017Cde zg\u0142oszenie wed\u0142ug specyficznych wymaga\u0144 ka\u017Cdej oferty i skontaktuje si\u0119 z Tob\u0105.",
      button: "Zobacz moje zg\u0142oszenia",
      footer_reason: "Otrzymujesz t\u0119 wiadomo\u015B\u0107, poniewa\u017C Tw\xF3j profil PIPINGBOX osi\u0105gn\u0105\u0142 status Marketplace Ready."
    },
    cv_review_pending: {
      subject: "PIPINGBOX \xB7 Otrzymali\u015Bmy Twoje CV \u2014 sprawd\u017A sw\xF3j profil",
      preheader: "Przygotowali\u015Bmy Tw\xF3j profil zawodowy na podstawie CV.",
      heading: "Tw\xF3j profil zawodowy jest gotowy do sprawdzenia",
      body: "Cze\u015B\u0107! Otrzymali\u015Bmy Twoje CV i przygotowali\u015Bmy na jego podstawie Tw\xF3j profil zawodowy. Sprawd\u017A dane, aby PIPINGBOX mog\u0142o bra\u0107 Ci\u0119 pod uwag\u0119 dla pasuj\u0105cych mo\u017Cliwo\u015Bci.",
      button: "Sprawd\u017A m\xF3j profil",
      note: "Nic jeszcze nie opublikowano: wyodr\u0119bnione dane stan\u0105 si\u0119 cz\u0119\u015Bci\u0105 Twojego profilu dopiero po sprawdzeniu i potwierdzeniu. Certyfikaty wymienione w CV s\u0105 rejestrowane jako zadeklarowane, niezweryfikowane.",
      footer_reason: "Otrzymujesz t\u0119 wiadomo\u015B\u0107, poniewa\u017C PIPINGBOX otrzyma\u0142o CV powi\u0105zane z Twoim kontem."
    }
  }
};
var pl_default = pl;

// _shared/email-i18n/locales/bg.ts
var bg = {
  code: "bg",
  common: {
    brand_tagline: "\u041F\u0440\u043E\u0444\u0435\u0441\u0438\u043E\u043D\u0430\u043B\u043D\u0430 \u043F\u043B\u0430\u0442\u0444\u043E\u0440\u043C\u0430 \u0437\u0430 \u0437\u0430\u0432\u0430\u0440\u044F\u0432\u0430\u043D\u0435 \u0438 \u043F\u0440\u043E\u043C\u0438\u0448\u043B\u0435\u043D\u043E \u0441\u0442\u0440\u043E\u0438\u0442\u0435\u043B\u0441\u0442\u0432\u043E",
    button_fallback: "\u0410\u043A\u043E \u0431\u0443\u0442\u043E\u043D\u044A\u0442 \u043D\u0435 \u0440\u0430\u0431\u043E\u0442\u0438, \u043A\u043E\u043F\u0438\u0440\u0430\u0439\u0442\u0435 \u0442\u043E\u0437\u0438 \u0430\u0434\u0440\u0435\u0441 \u0432 \u0431\u0440\u0430\u0443\u0437\u044A\u0440\u0430 \u0441\u0438:",
    security_title: "\u0418\u043D\u0444\u043E\u0440\u043C\u0430\u0446\u0438\u044F \u0437\u0430 \u0441\u0438\u0433\u0443\u0440\u043D\u043E\u0441\u0442",
    expires: "\u0422\u043E\u0437\u0438 \u043B\u0438\u043D\u043A \u0435 \u0432\u0430\u043B\u0438\u0434\u0435\u043D {minutes} \u043C\u0438\u043D\u0443\u0442\u0438 \u0438 \u043C\u043E\u0436\u0435 \u0434\u0430 \u0441\u0435 \u0438\u0437\u043F\u043E\u043B\u0437\u0432\u0430 \u0441\u0430\u043C\u043E \u0432\u0435\u0434\u043D\u044A\u0436. \u0410\u043A\u043E \u0435 \u0438\u0437\u0442\u0435\u043A\u044A\u043B, \u043C\u043E\u0436\u0435\u0442\u0435 \u0434\u0430 \u043F\u043E\u0438\u0441\u043A\u0430\u0442\u0435 \u043D\u043E\u0432 \u043E\u0442 \u0435\u043A\u0440\u0430\u043D\u0430 \u0437\u0430 \u0432\u0445\u043E\u0434 \u0432 PIPINGBOX.",
    never_share: "\u041D\u0438\u043A\u043E\u0433\u0430 \u043D\u0435 \u0441\u043F\u043E\u0434\u0435\u043B\u044F\u0439\u0442\u0435 \u0442\u043E\u0437\u0438 \u043B\u0438\u043D\u043A \u0438\u043B\u0438 \u043A\u043E\u0434 \u0441 \u043D\u0438\u043A\u043E\u0433\u043E. PIPINGBOX \u043D\u0438\u043A\u043E\u0433\u0430 \u043D\u044F\u043C\u0430 \u0434\u0430 \u043F\u043E\u0438\u0441\u043A\u0430 \u043F\u0430\u0440\u043E\u043B\u0430\u0442\u0430 \u0432\u0438 \u043F\u043E \u0438\u043C\u0435\u0439\u043B, \u0442\u0435\u043B\u0435\u0444\u043E\u043D \u0438\u043B\u0438 \u0447\u0430\u0442.",
    support_prompt: "\u0410\u043A\u043E \u0438\u043C\u0430\u0442\u0435 \u0441\u044A\u043C\u043D\u0435\u043D\u0438\u044F \u043E\u0442\u043D\u043E\u0441\u043D\u043E \u0442\u043E\u0432\u0430 \u0441\u044A\u043E\u0431\u0449\u0435\u043D\u0438\u0435, \u043F\u0438\u0448\u0435\u0442\u0435 \u043D\u0430 {support}, \u043F\u0440\u0435\u0434\u0438 \u0434\u0430 \u043E\u0442\u0432\u043E\u0440\u0438\u0442\u0435 \u043B\u0438\u043D\u043A\u0430.",
    not_you: "\u0410\u043A\u043E \u043D\u0435 \u0432\u0438\u0435 \u0441\u0442\u0435 \u043D\u0430\u043F\u0440\u0430\u0432\u0438\u043B\u0438 \u0442\u0430\u0437\u0438 \u043F\u0440\u043E\u043C\u044F\u043D\u0430, \u043D\u0435\u0437\u0430\u0431\u0430\u0432\u043D\u043E \u0441\u0435 \u0441\u0432\u044A\u0440\u0436\u0435\u0442\u0435 \u0441 {support} \u0438 \u043D\u0443\u043B\u0438\u0440\u0430\u0439\u0442\u0435 \u043F\u0430\u0440\u043E\u043B\u0430\u0442\u0430 \u0441\u0438.",
    footer_no_reply: "\u0410\u0432\u0442\u043E\u043C\u0430\u0442\u0438\u0447\u043D\u043E \u0441\u044A\u043E\u0431\u0449\u0435\u043D\u0438\u0435 \u043E\u0442 PIPINGBOX. \u0422\u043E\u0437\u0438 \u0430\u0434\u0440\u0435\u0441 \u043D\u0435 \u043F\u0440\u0438\u0435\u043C\u0430 \u043E\u0442\u0433\u043E\u0432\u043E\u0440\u0438; \u0437\u0430 \u0432\u0441\u044F\u043A\u0430\u043A\u0432\u0438 \u0432\u044A\u043F\u0440\u043E\u0441\u0438 \u043F\u0438\u0448\u0435\u0442\u0435 \u043D\u0430 {support}.",
    code_label: "\u0412\u0430\u0448\u0438\u044F\u0442 \u043A\u043E\u0434 \u0437\u0430 \u043F\u043E\u0442\u0432\u044A\u0440\u0436\u0434\u0435\u043D\u0438\u0435"
  },
  templates: {
    confirmation: {
      subject: "PIPINGBOX \xB7 \u041F\u043E\u0442\u0432\u044A\u0440\u0434\u0435\u0442\u0435 \u0430\u043A\u0430\u0443\u043D\u0442\u0430 \u0441\u0438",
      preheader: "\u041F\u043E\u0442\u0432\u044A\u0440\u0434\u0435\u0442\u0435 \u0438\u043C\u0435\u0439\u043B \u0430\u0434\u0440\u0435\u0441\u0430 \u0441\u0438, \u0437\u0430 \u0434\u0430 \u0430\u043A\u0442\u0438\u0432\u0438\u0440\u0430\u0442\u0435 \u0430\u043A\u0430\u0443\u043D\u0442\u0430 \u0441\u0438 \u0432 PIPINGBOX.",
      heading: "\u041F\u043E\u0442\u0432\u044A\u0440\u0434\u0435\u0442\u0435 \u0430\u043A\u0430\u0443\u043D\u0442\u0430 \u0441\u0438",
      body: "\u0411\u043B\u0430\u0433\u043E\u0434\u0430\u0440\u0438\u043C \u0432\u0438, \u0447\u0435 \u0441\u0435 \u0440\u0435\u0433\u0438\u0441\u0442\u0440\u0438\u0440\u0430\u0445\u0442\u0435 \u0432 PIPINGBOX \u0441 \u0430\u0434\u0440\u0435\u0441 {email}. \u0417\u0430 \u0434\u0430 \u0430\u043A\u0442\u0438\u0432\u0438\u0440\u0430\u0442\u0435 \u0430\u043A\u0430\u0443\u043D\u0442\u0430 \u0441\u0438, \u043F\u043E\u0442\u0432\u044A\u0440\u0434\u0435\u0442\u0435, \u0447\u0435 \u0442\u043E\u0437\u0438 \u0438\u043C\u0435\u0439\u043B \u0430\u0434\u0440\u0435\u0441 \u0435 \u0432\u0430\u0448.",
      button: "\u041F\u043E\u0442\u0432\u044A\u0440\u0436\u0434\u0430\u0432\u0430\u043C \u0430\u043A\u0430\u0443\u043D\u0442\u0430 \u0441\u0438",
      note: "\u0410\u043A\u043E \u043D\u0435 \u0441\u0442\u0435 \u0441\u0435 \u0440\u0435\u0433\u0438\u0441\u0442\u0440\u0438\u0440\u0430\u043B\u0438 \u0432 PIPINGBOX, \u043D\u0435 \u0435 \u043D\u0435\u043E\u0431\u0445\u043E\u0434\u0438\u043C\u043E \u0434\u0430 \u043F\u0440\u0430\u0432\u0438\u0442\u0435 \u043D\u0438\u0449\u043E: \u0430\u043A\u0430\u0443\u043D\u0442\u044A\u0442 \u0449\u0435 \u043E\u0441\u0442\u0430\u043D\u0435 \u043D\u0435\u043F\u043E\u0442\u0432\u044A\u0440\u0434\u0435\u043D, \u043D\u044F\u043C\u0430 \u0434\u0430 \u0431\u044A\u0434\u0435 \u0430\u043A\u0442\u0438\u0432\u0438\u0440\u0430\u043D \u0438 \u043D\u044F\u043C\u0430 \u0434\u0430 \u043C\u043E\u0436\u0435 \u0434\u0430 \u0441\u0435 \u0438\u0437\u043F\u043E\u043B\u0437\u0432\u0430 \u0437\u0430 \u0434\u043E\u0441\u0442\u044A\u043F \u0434\u043E \u043F\u043B\u0430\u0442\u0444\u043E\u0440\u043C\u0430\u0442\u0430.",
      footer_reason: "\u041F\u043E\u043B\u0443\u0447\u0430\u0432\u0430\u0442\u0435 \u0442\u043E\u0432\u0430 \u0441\u044A\u043E\u0431\u0449\u0435\u043D\u0438\u0435, \u0437\u0430\u0449\u043E\u0442\u043E \u043D\u044F\u043A\u043E\u0439 \u0435 \u043F\u043E\u0438\u0441\u043A\u0430\u043B \u0441\u044A\u0437\u0434\u0430\u0432\u0430\u043D\u0435 \u043D\u0430 \u0430\u043A\u0430\u0443\u043D\u0442 \u0432 PIPINGBOX \u0441 \u0442\u043E\u0437\u0438 \u0430\u0434\u0440\u0435\u0441."
    },
    recovery: {
      subject: "PIPINGBOX \xB7 \u041D\u0443\u043B\u0438\u0440\u0430\u043D\u0435 \u043D\u0430 \u043F\u0430\u0440\u043E\u043B\u0430\u0442\u0430",
      preheader: "\u041F\u043E\u043B\u0443\u0447\u0438\u0445\u043C\u0435 \u0437\u0430\u044F\u0432\u043A\u0430 \u0437\u0430 \u043D\u0443\u043B\u0438\u0440\u0430\u043D\u0435 \u043D\u0430 \u043F\u0430\u0440\u043E\u043B\u0430\u0442\u0430 \u043D\u0430 \u0432\u0430\u0448\u0438\u044F \u0430\u043A\u0430\u0443\u043D\u0442 \u0432 PIPINGBOX.",
      heading: "\u041D\u0443\u043B\u0438\u0440\u0430\u043D\u0435 \u043D\u0430 \u043F\u0430\u0440\u043E\u043B\u0430\u0442\u0430",
      body: "\u041F\u043E\u043B\u0443\u0447\u0438\u0445\u043C\u0435 \u0437\u0430\u044F\u0432\u043A\u0430 \u0437\u0430 \u043D\u0443\u043B\u0438\u0440\u0430\u043D\u0435 \u043D\u0430 \u043F\u0430\u0440\u043E\u043B\u0430\u0442\u0430 \u043D\u0430 \u0430\u043A\u0430\u0443\u043D\u0442\u0430 \u0432 PIPINGBOX, \u0441\u0432\u044A\u0440\u0437\u0430\u043D \u0441 {email}. \u0418\u0437\u043F\u043E\u043B\u0437\u0432\u0430\u0439\u0442\u0435 \u0431\u0443\u0442\u043E\u043D\u0430 \u043F\u043E-\u0434\u043E\u043B\u0443, \u0437\u0430 \u0434\u0430 \u0438\u0437\u0431\u0435\u0440\u0435\u0442\u0435 \u043D\u043E\u0432\u0430 \u043F\u0430\u0440\u043E\u043B\u0430.",
      button: "\u0418\u0437\u0431\u043E\u0440 \u043D\u0430 \u043D\u043E\u0432\u0430 \u043F\u0430\u0440\u043E\u043B\u0430",
      note: "\u0410\u043A\u043E \u043D\u0435 \u0441\u0442\u0435 \u043F\u043E\u0438\u0441\u043A\u0430\u043B\u0438 \u0442\u0430\u0437\u0438 \u043F\u0440\u043E\u043C\u044F\u043D\u0430, \u043C\u043E\u0436\u0435\u0442\u0435 \u0434\u0430 \u0438\u0433\u043D\u043E\u0440\u0438\u0440\u0430\u0442\u0435 \u0442\u043E\u0432\u0430 \u0441\u044A\u043E\u0431\u0449\u0435\u043D\u0438\u0435: \u043F\u0430\u0440\u043E\u043B\u0430\u0442\u0430 \u0432\u0438 \u043E\u0441\u0442\u0430\u0432\u0430 \u043D\u0435\u043F\u0440\u043E\u043C\u0435\u043D\u0435\u043D\u0430.",
      footer_reason: "\u041F\u043E\u043B\u0443\u0447\u0430\u0432\u0430\u0442\u0435 \u0442\u043E\u0432\u0430 \u0441\u044A\u043E\u0431\u0449\u0435\u043D\u0438\u0435, \u0437\u0430\u0449\u043E\u0442\u043E \u0435 \u043F\u043E\u0438\u0441\u043A\u0430\u043D\u043E \u043D\u0443\u043B\u0438\u0440\u0430\u043D\u0435 \u043D\u0430 \u043F\u0430\u0440\u043E\u043B\u0430\u0442\u0430 \u0437\u0430 \u0442\u043E\u0437\u0438 \u0430\u0434\u0440\u0435\u0441."
    },
    magic_link: {
      subject: "PIPINGBOX \xB7 \u0412\u0430\u0448\u0438\u044F\u0442 \u043B\u0438\u043D\u043A \u0437\u0430 \u0432\u0445\u043E\u0434",
      preheader: "\u0418\u0437\u043F\u043E\u043B\u0437\u0432\u0430\u0439\u0442\u0435 \u0442\u043E\u0437\u0438 \u043B\u0438\u043D\u043A, \u0437\u0430 \u0434\u0430 \u0432\u043B\u0435\u0437\u0435\u0442\u0435 \u0432 PIPINGBOX.",
      heading: "\u0412\u0445\u043E\u0434 \u0432 PIPINGBOX",
      body: "\u0418\u0437\u043F\u043E\u043B\u0437\u0432\u0430\u0439\u0442\u0435 \u0431\u0443\u0442\u043E\u043D\u0430 \u043F\u043E-\u0434\u043E\u043B\u0443, \u0437\u0430 \u0434\u0430 \u0432\u043B\u0435\u0437\u0435\u0442\u0435 \u0432 PIPINGBOX \u0441 \u0430\u0434\u0440\u0435\u0441 {email}.",
      button: "\u0412\u0445\u043E\u0434",
      note: "\u0410\u043A\u043E \u043D\u0435 \u0441\u0442\u0435 \u043F\u043E\u0438\u0441\u043A\u0430\u043B\u0438 \u0442\u043E\u0437\u0438 \u043B\u0438\u043D\u043A, \u043C\u043E\u0436\u0435\u0442\u0435 \u0434\u0430 \u0438\u0433\u043D\u043E\u0440\u0438\u0440\u0430\u0442\u0435 \u0442\u043E\u0432\u0430 \u0441\u044A\u043E\u0431\u0449\u0435\u043D\u0438\u0435: \u0431\u0435\u0437 \u043D\u0435\u0433\u043E \u043D\u0438\u043A\u043E\u0439 \u043D\u0435 \u043C\u043E\u0436\u0435 \u0434\u0430 \u0432\u043B\u0435\u0437\u0435.",
      footer_reason: "\u041F\u043E\u043B\u0443\u0447\u0430\u0432\u0430\u0442\u0435 \u0442\u043E\u0432\u0430 \u0441\u044A\u043E\u0431\u0449\u0435\u043D\u0438\u0435, \u0437\u0430\u0449\u043E\u0442\u043E \u0435 \u043F\u043E\u0438\u0441\u043A\u0430\u043D \u043B\u0438\u043D\u043A \u0437\u0430 \u0432\u0445\u043E\u0434 \u0437\u0430 \u0442\u043E\u0437\u0438 \u0430\u0434\u0440\u0435\u0441."
    },
    invite: {
      subject: "PIPINGBOX \xB7 \u041F\u043E\u043B\u0443\u0447\u0438\u0445\u0442\u0435 \u043F\u043E\u043A\u0430\u043D\u0430",
      preheader: "\u041F\u043E\u043A\u0430\u043D\u0435\u043D\u0438 \u0441\u0442\u0435 \u0434\u0430 \u0441\u0435 \u043F\u0440\u0438\u0441\u044A\u0435\u0434\u0438\u043D\u0438\u0442\u0435 \u043A\u044A\u043C PIPINGBOX.",
      heading: "\u041F\u043E\u043A\u0430\u043D\u0435\u043D\u0438 \u0441\u0442\u0435 \u0432 PIPINGBOX",
      body: "\u041F\u043E\u043A\u0430\u043D\u0435\u043D\u0438 \u0441\u0442\u0435 \u0434\u0430 \u0441\u044A\u0437\u0434\u0430\u0434\u0435\u0442\u0435 \u0430\u043A\u0430\u0443\u043D\u0442 \u0432 PIPINGBOX \u0441 \u0430\u0434\u0440\u0435\u0441 {email}. \u0418\u0437\u043F\u043E\u043B\u0437\u0432\u0430\u0439\u0442\u0435 \u0431\u0443\u0442\u043E\u043D\u0430 \u043F\u043E-\u0434\u043E\u043B\u0443, \u0437\u0430 \u0434\u0430 \u043F\u0440\u0438\u0435\u043C\u0435\u0442\u0435 \u043F\u043E\u043A\u0430\u043D\u0430\u0442\u0430 \u0438 \u0434\u0430 \u043D\u0430\u0441\u0442\u0440\u043E\u0438\u0442\u0435 \u0430\u043A\u0430\u0443\u043D\u0442\u0430 \u0441\u0438.",
      button: "\u041F\u0440\u0438\u0435\u043C\u0430\u043C \u043F\u043E\u043A\u0430\u043D\u0430\u0442\u0430",
      note: "\u0410\u043A\u043E \u043D\u0435 \u0441\u0442\u0435 \u043E\u0447\u0430\u043A\u0432\u0430\u043B\u0438 \u0442\u0430\u0437\u0438 \u043F\u043E\u043A\u0430\u043D\u0430, \u043C\u043E\u0436\u0435\u0442\u0435 \u0434\u0430 \u0438\u0433\u043D\u043E\u0440\u0438\u0440\u0430\u0442\u0435 \u0442\u043E\u0432\u0430 \u0441\u044A\u043E\u0431\u0449\u0435\u043D\u0438\u0435.",
      footer_reason: "\u041F\u043E\u043B\u0443\u0447\u0430\u0432\u0430\u0442\u0435 \u0442\u043E\u0432\u0430 \u0441\u044A\u043E\u0431\u0449\u0435\u043D\u0438\u0435, \u0437\u0430\u0449\u043E\u0442\u043E \u043D\u044F\u043A\u043E\u0439 \u0435 \u043F\u043E\u043A\u0430\u043D\u0438\u043B \u0442\u043E\u0437\u0438 \u0430\u0434\u0440\u0435\u0441 \u0432 PIPINGBOX."
    },
    email_change_current: {
      subject: "PIPINGBOX \xB7 \u041F\u043E\u0442\u0432\u044A\u0440\u0434\u0435\u0442\u0435 \u043F\u0440\u043E\u043C\u044F\u043D\u0430\u0442\u0430 \u043D\u0430 \u0438\u043C\u0435\u0439\u043B \u0430\u0434\u0440\u0435\u0441\u0430",
      preheader: "\u041F\u043E\u0442\u0432\u044A\u0440\u0434\u0435\u0442\u0435 \u043F\u0440\u043E\u043C\u044F\u043D\u0430\u0442\u0430 \u043D\u0430 \u0438\u043C\u0435\u0439\u043B \u0430\u0434\u0440\u0435\u0441\u0430 \u043D\u0430 \u0432\u0430\u0448\u0438\u044F \u0430\u043A\u0430\u0443\u043D\u0442 \u0432 PIPINGBOX.",
      heading: "\u041F\u043E\u0442\u0432\u044A\u0440\u0434\u0435\u0442\u0435 \u043F\u0440\u043E\u043C\u044F\u043D\u0430\u0442\u0430 \u043D\u0430 \u0438\u043C\u0435\u0439\u043B \u0430\u0434\u0440\u0435\u0441\u0430",
      body: "\u041F\u043E\u0438\u0441\u043A\u0430\u043D\u0430 \u0435 \u043F\u0440\u043E\u043C\u044F\u043D\u0430 \u043D\u0430 \u0438\u043C\u0435\u0439\u043B \u0430\u0434\u0440\u0435\u0441\u0430 \u043D\u0430 \u0432\u0430\u0448\u0438\u044F \u0430\u043A\u0430\u0443\u043D\u0442 \u0432 PIPINGBOX \u043E\u0442 {email} \u043D\u0430 {newEmail}. \u0417\u0430 \u0434\u0430 \u0440\u0430\u0437\u0440\u0435\u0448\u0438\u0442\u0435 \u043F\u0440\u043E\u043C\u044F\u043D\u0430\u0442\u0430, \u043F\u043E\u0442\u0432\u044A\u0440\u0434\u0435\u0442\u0435 \u044F \u043E\u0442 \u0442\u0435\u043A\u0443\u0449\u0438\u044F \u0441\u0438 \u0430\u0434\u0440\u0435\u0441.",
      button: "\u041F\u043E\u0442\u0432\u044A\u0440\u0436\u0434\u0430\u0432\u0430\u043C \u043F\u0440\u043E\u043C\u044F\u043D\u0430\u0442\u0430",
      note: "\u0410\u043A\u043E \u043D\u0435 \u0441\u0442\u0435 \u043F\u043E\u0438\u0441\u043A\u0430\u043B\u0438 \u0442\u0430\u0437\u0438 \u043F\u0440\u043E\u043C\u044F\u043D\u0430, \u043D\u0435 \u0438\u0437\u043F\u043E\u043B\u0437\u0432\u0430\u0439\u0442\u0435 \u043B\u0438\u043D\u043A\u0430: \u043D\u0435\u0437\u0430\u0431\u0430\u0432\u043D\u043E \u0441\u0435 \u0441\u0432\u044A\u0440\u0436\u0435\u0442\u0435 \u0441 {support} \u0438 \u043D\u0443\u043B\u0438\u0440\u0430\u0439\u0442\u0435 \u043F\u0430\u0440\u043E\u043B\u0430\u0442\u0430 \u0441\u0438.",
      footer_reason: "\u041F\u043E\u043B\u0443\u0447\u0430\u0432\u0430\u0442\u0435 \u0442\u043E\u0432\u0430 \u0441\u044A\u043E\u0431\u0449\u0435\u043D\u0438\u0435, \u0437\u0430\u0449\u043E\u0442\u043E \u0435 \u043F\u043E\u0438\u0441\u043A\u0430\u043D\u0430 \u043F\u0440\u043E\u043C\u044F\u043D\u0430 \u043D\u0430 \u0438\u043C\u0435\u0439\u043B \u0430\u0434\u0440\u0435\u0441\u0430 \u043D\u0430 \u0430\u043A\u0430\u0443\u043D\u0442\u0430, \u0441\u0432\u044A\u0440\u0437\u0430\u043D \u0441 \u0442\u043E\u0437\u0438 \u0430\u0434\u0440\u0435\u0441."
    },
    email_change_new: {
      subject: "PIPINGBOX \xB7 \u041F\u043E\u0442\u0432\u044A\u0440\u0434\u0435\u0442\u0435 \u043D\u043E\u0432\u0438\u044F \u0441\u0438 \u0438\u043C\u0435\u0439\u043B \u0430\u0434\u0440\u0435\u0441",
      preheader: "\u041F\u043E\u0442\u0432\u044A\u0440\u0434\u0435\u0442\u0435 {newEmail} \u043A\u0430\u0442\u043E \u043D\u043E\u0432 \u0430\u0434\u0440\u0435\u0441 \u043D\u0430 \u0432\u0430\u0448\u0438\u044F \u0430\u043A\u0430\u0443\u043D\u0442 \u0432 PIPINGBOX.",
      heading: "\u041F\u043E\u0442\u0432\u044A\u0440\u0434\u0435\u0442\u0435 \u043D\u043E\u0432\u0438\u044F \u0441\u0438 \u0438\u043C\u0435\u0439\u043B \u0430\u0434\u0440\u0435\u0441",
      body: "\u041F\u043E\u0442\u0432\u044A\u0440\u0434\u0435\u0442\u0435 {newEmail} \u043A\u0430\u0442\u043E \u043D\u043E\u0432 \u0438\u043C\u0435\u0439\u043B \u0430\u0434\u0440\u0435\u0441 \u043D\u0430 \u0432\u0430\u0448\u0438\u044F \u0430\u043A\u0430\u0443\u043D\u0442 \u0432 PIPINGBOX.",
      button: "\u041F\u043E\u0442\u0432\u044A\u0440\u0436\u0434\u0430\u0432\u0430\u043C \u043D\u043E\u0432\u0438\u044F \u0430\u0434\u0440\u0435\u0441",
      note: "\u0410\u043A\u043E \u043D\u0435 \u0441\u0442\u0435 \u043F\u043E\u0438\u0441\u043A\u0430\u043B\u0438 \u0442\u0430\u0437\u0438 \u043F\u0440\u043E\u043C\u044F\u043D\u0430, \u043C\u043E\u0436\u0435\u0442\u0435 \u0434\u0430 \u0438\u0433\u043D\u043E\u0440\u0438\u0440\u0430\u0442\u0435 \u0442\u043E\u0432\u0430 \u0441\u044A\u043E\u0431\u0449\u0435\u043D\u0438\u0435: \u0430\u0434\u0440\u0435\u0441\u044A\u0442 \u043D\u044F\u043C\u0430 \u0434\u0430 \u0431\u044A\u0434\u0435 \u043F\u0440\u043E\u043C\u0435\u043D\u0435\u043D.",
      footer_reason: "\u041F\u043E\u043B\u0443\u0447\u0430\u0432\u0430\u0442\u0435 \u0442\u043E\u0432\u0430 \u0441\u044A\u043E\u0431\u0449\u0435\u043D\u0438\u0435, \u0437\u0430\u0449\u043E\u0442\u043E \u0442\u043E\u0437\u0438 \u0430\u0434\u0440\u0435\u0441 \u0435 \u043F\u0440\u0435\u0434\u043B\u043E\u0436\u0435\u043D \u043A\u0430\u0442\u043E \u043D\u043E\u0432 \u0430\u0434\u0440\u0435\u0441 \u043D\u0430 \u0430\u043A\u0430\u0443\u043D\u0442 \u0432 PIPINGBOX."
    },
    reauthentication: {
      subject: "PIPINGBOX \xB7 \u0412\u0430\u0448\u0438\u044F\u0442 \u043A\u043E\u0434 \u0437\u0430 \u043F\u043E\u0442\u0432\u044A\u0440\u0436\u0434\u0435\u043D\u0438\u0435",
      preheader: "\u0418\u0437\u043F\u043E\u043B\u0437\u0432\u0430\u0439\u0442\u0435 \u0442\u043E\u0437\u0438 \u043A\u043E\u0434, \u0437\u0430 \u0434\u0430 \u043F\u043E\u0442\u0432\u044A\u0440\u0434\u0438\u0442\u0435 \u0441\u0430\u043C\u043E\u043B\u0438\u0447\u043D\u043E\u0441\u0442\u0442\u0430 \u0441\u0438 \u0432 PIPINGBOX.",
      heading: "\u0412\u0430\u0448\u0438\u044F\u0442 \u043A\u043E\u0434 \u0437\u0430 \u043F\u043E\u0442\u0432\u044A\u0440\u0436\u0434\u0435\u043D\u0438\u0435",
      body: "\u0412\u044A\u0432\u0435\u0434\u0435\u0442\u0435 \u043A\u043E\u0434\u0430 \u043F\u043E-\u0434\u043E\u043B\u0443 \u0432 PIPINGBOX, \u0437\u0430 \u0434\u0430 \u043F\u043E\u0442\u0432\u044A\u0440\u0434\u0438\u0442\u0435 \u0441\u0430\u043C\u043E\u043B\u0438\u0447\u043D\u043E\u0441\u0442\u0442\u0430 \u0441\u0438. \u0422\u043E\u0439 \u0435 \u0432\u0430\u043B\u0438\u0434\u0435\u043D {minutes} \u043C\u0438\u043D\u0443\u0442\u0438 \u0438 \u043C\u043E\u0436\u0435 \u0434\u0430 \u0441\u0435 \u0438\u0437\u043F\u043E\u043B\u0437\u0432\u0430 \u0441\u0430\u043C\u043E \u0432\u0435\u0434\u043D\u044A\u0436.",
      footer_reason: "\u041F\u043E\u043B\u0443\u0447\u0430\u0432\u0430\u0442\u0435 \u0442\u043E\u0432\u0430 \u0441\u044A\u043E\u0431\u0449\u0435\u043D\u0438\u0435, \u0437\u0430\u0449\u043E\u0442\u043E \u0447\u0443\u0432\u0441\u0442\u0432\u0438\u0442\u0435\u043B\u043D\u043E \u0434\u0435\u0439\u0441\u0442\u0432\u0438\u0435 \u0432\u044A\u0432 \u0432\u0430\u0448\u0438\u044F \u0430\u043A\u0430\u0443\u043D\u0442 \u0432 PIPINGBOX \u0438\u0437\u0438\u0441\u043A\u0432\u0430\u0448\u0435 \u043F\u043E\u0442\u0432\u044A\u0440\u0436\u0434\u0435\u043D\u0438\u0435 \u043D\u0430 \u0441\u0430\u043C\u043E\u043B\u0438\u0447\u043D\u043E\u0441\u0442\u0442\u0430."
    },
    password_changed_notification: {
      subject: "PIPINGBOX \xB7 \u041F\u0430\u0440\u043E\u043B\u0430\u0442\u0430 \u0432\u0438 \u0431\u0435\u0448\u0435 \u043F\u0440\u043E\u043C\u0435\u043D\u0435\u043D\u0430",
      preheader: "\u041F\u0430\u0440\u043E\u043B\u0430\u0442\u0430 \u043D\u0430 \u0432\u0430\u0448\u0438\u044F \u0430\u043A\u0430\u0443\u043D\u0442 \u0432 PIPINGBOX \u0431\u0435\u0448\u0435 \u043F\u0440\u043E\u043C\u0435\u043D\u0435\u043D\u0430.",
      heading: "\u041F\u0430\u0440\u043E\u043B\u0430\u0442\u0430 \u0432\u0438 \u0431\u0435\u0448\u0435 \u043F\u0440\u043E\u043C\u0435\u043D\u0435\u043D\u0430",
      body: "\u041F\u0430\u0440\u043E\u043B\u0430\u0442\u0430 \u043D\u0430 \u0430\u043A\u0430\u0443\u043D\u0442\u0430 \u0432 PIPINGBOX, \u0441\u0432\u044A\u0440\u0437\u0430\u043D \u0441 {email}, \u0431\u0435\u0448\u0435 \u043F\u0440\u043E\u043C\u0435\u043D\u0435\u043D\u0430 \u043D\u0430\u0441\u043A\u043E\u0440\u043E.",
      footer_reason: "\u041F\u043E\u043B\u0443\u0447\u0430\u0432\u0430\u0442\u0435 \u0442\u043E\u0432\u0430 \u0438\u0437\u0432\u0435\u0441\u0442\u0438\u0435 \u0437\u0430 \u0441\u0438\u0433\u0443\u0440\u043D\u043E\u0441\u0442 \u043F\u043E\u0440\u0430\u0434\u0438 \u043F\u0440\u043E\u043C\u044F\u043D\u0430 \u0432\u044A\u0432 \u0432\u0430\u0448\u0438\u044F \u0430\u043A\u0430\u0443\u043D\u0442 \u0432 PIPINGBOX."
    },
    email_changed_notification: {
      subject: "PIPINGBOX \xB7 \u0418\u043C\u0435\u0439\u043B \u0430\u0434\u0440\u0435\u0441\u044A\u0442 \u0432\u0438 \u0431\u0435\u0448\u0435 \u043F\u0440\u043E\u043C\u0435\u043D\u0435\u043D",
      preheader: "\u0418\u043C\u0435\u0439\u043B \u0430\u0434\u0440\u0435\u0441\u044A\u0442 \u043D\u0430 \u0432\u0430\u0448\u0438\u044F \u0430\u043A\u0430\u0443\u043D\u0442 \u0432 PIPINGBOX \u0431\u0435\u0448\u0435 \u043F\u0440\u043E\u043C\u0435\u043D\u0435\u043D.",
      heading: "\u0418\u043C\u0435\u0439\u043B \u0430\u0434\u0440\u0435\u0441\u044A\u0442 \u0432\u0438 \u0431\u0435\u0448\u0435 \u043F\u0440\u043E\u043C\u0435\u043D\u0435\u043D",
      body: "\u0418\u043C\u0435\u0439\u043B \u0430\u0434\u0440\u0435\u0441\u044A\u0442 \u043D\u0430 \u0432\u0430\u0448\u0438\u044F \u0430\u043A\u0430\u0443\u043D\u0442 \u0432 PIPINGBOX \u0431\u0435\u0448\u0435 \u043F\u0440\u043E\u043C\u0435\u043D\u0435\u043D \u043E\u0442 {oldEmail} \u043D\u0430 {email}.",
      footer_reason: "\u041F\u043E\u043B\u0443\u0447\u0430\u0432\u0430\u0442\u0435 \u0442\u043E\u0432\u0430 \u0438\u0437\u0432\u0435\u0441\u0442\u0438\u0435 \u0437\u0430 \u0441\u0438\u0433\u0443\u0440\u043D\u043E\u0441\u0442 \u043F\u043E\u0440\u0430\u0434\u0438 \u043F\u0440\u043E\u043C\u044F\u043D\u0430 \u0432\u044A\u0432 \u0432\u0430\u0448\u0438\u044F \u0430\u043A\u0430\u0443\u043D\u0442 \u0432 PIPINGBOX."
    },
    phone_changed_notification: {
      subject: "PIPINGBOX \xB7 \u0422\u0435\u043B\u0435\u0444\u043E\u043D\u043D\u0438\u044F\u0442 \u0432\u0438 \u043D\u043E\u043C\u0435\u0440 \u0431\u0435\u0448\u0435 \u043F\u0440\u043E\u043C\u0435\u043D\u0435\u043D",
      preheader: "\u0422\u0435\u043B\u0435\u0444\u043E\u043D\u043D\u0438\u044F\u0442 \u043D\u043E\u043C\u0435\u0440 \u043D\u0430 \u0432\u0430\u0448\u0438\u044F \u0430\u043A\u0430\u0443\u043D\u0442 \u0432 PIPINGBOX \u0431\u0435\u0448\u0435 \u043F\u0440\u043E\u043C\u0435\u043D\u0435\u043D.",
      heading: "\u0422\u0435\u043B\u0435\u0444\u043E\u043D\u043D\u0438\u044F\u0442 \u0432\u0438 \u043D\u043E\u043C\u0435\u0440 \u0431\u0435\u0448\u0435 \u043F\u0440\u043E\u043C\u0435\u043D\u0435\u043D",
      body: "\u0422\u0435\u043B\u0435\u0444\u043E\u043D\u043D\u0438\u044F\u0442 \u043D\u043E\u043C\u0435\u0440 \u043D\u0430 \u0432\u0430\u0448\u0438\u044F \u0430\u043A\u0430\u0443\u043D\u0442 \u0432 PIPINGBOX \u0431\u0435\u0448\u0435 \u043F\u0440\u043E\u043C\u0435\u043D\u0435\u043D \u043E\u0442 {oldPhone} \u043D\u0430 {phone}.",
      footer_reason: "\u041F\u043E\u043B\u0443\u0447\u0430\u0432\u0430\u0442\u0435 \u0442\u043E\u0432\u0430 \u0438\u0437\u0432\u0435\u0441\u0442\u0438\u0435 \u0437\u0430 \u0441\u0438\u0433\u0443\u0440\u043D\u043E\u0441\u0442 \u043F\u043E\u0440\u0430\u0434\u0438 \u043F\u0440\u043E\u043C\u044F\u043D\u0430 \u0432\u044A\u0432 \u0432\u0430\u0448\u0438\u044F \u0430\u043A\u0430\u0443\u043D\u0442 \u0432 PIPINGBOX."
    },
    identity_linked_notification: {
      subject: "PIPINGBOX \xB7 \u0414\u043E\u0431\u0430\u0432\u0435\u043D \u0435 \u043D\u043E\u0432 \u043C\u0435\u0442\u043E\u0434 \u0437\u0430 \u0432\u0445\u043E\u0434",
      preheader: "\u041A\u044A\u043C \u0432\u0430\u0448\u0438\u044F \u0430\u043A\u0430\u0443\u043D\u0442 \u0432 PIPINGBOX \u0431\u0435\u0448\u0435 \u0434\u043E\u0431\u0430\u0432\u0435\u043D \u043D\u043E\u0432 \u043C\u0435\u0442\u043E\u0434 \u0437\u0430 \u0432\u0445\u043E\u0434.",
      heading: "\u0414\u043E\u0431\u0430\u0432\u0435\u043D \u0435 \u043D\u043E\u0432 \u043C\u0435\u0442\u043E\u0434 \u0437\u0430 \u0432\u0445\u043E\u0434",
      body: "\u0412\u0430\u0448\u0438\u044F\u0442 \u0430\u043A\u0430\u0443\u043D\u0442 \u0432 {provider} \u0431\u0435\u0448\u0435 \u0441\u0432\u044A\u0440\u0437\u0430\u043D \u043A\u0430\u0442\u043E \u043D\u043E\u0432 \u043C\u0435\u0442\u043E\u0434 \u0437\u0430 \u0432\u0445\u043E\u0434 \u0437\u0430 {email}.",
      footer_reason: "\u041F\u043E\u043B\u0443\u0447\u0430\u0432\u0430\u0442\u0435 \u0442\u043E\u0432\u0430 \u0438\u0437\u0432\u0435\u0441\u0442\u0438\u0435 \u0437\u0430 \u0441\u0438\u0433\u0443\u0440\u043D\u043E\u0441\u0442 \u043F\u043E\u0440\u0430\u0434\u0438 \u043F\u0440\u043E\u043C\u044F\u043D\u0430 \u0432\u044A\u0432 \u0432\u0430\u0448\u0438\u044F \u0430\u043A\u0430\u0443\u043D\u0442 \u0432 PIPINGBOX."
    },
    identity_unlinked_notification: {
      subject: "PIPINGBOX \xB7 \u041F\u0440\u0435\u043C\u0430\u0445\u043D\u0430\u0442 \u0435 \u043C\u0435\u0442\u043E\u0434 \u0437\u0430 \u0432\u0445\u043E\u0434",
      preheader: "\u041E\u0442 \u0432\u0430\u0448\u0438\u044F \u0430\u043A\u0430\u0443\u043D\u0442 \u0432 PIPINGBOX \u0431\u0435\u0448\u0435 \u043F\u0440\u0435\u043C\u0430\u0445\u043D\u0430\u0442 \u043C\u0435\u0442\u043E\u0434 \u0437\u0430 \u0432\u0445\u043E\u0434.",
      heading: "\u041F\u0440\u0435\u043C\u0430\u0445\u043D\u0430\u0442 \u0435 \u043C\u0435\u0442\u043E\u0434 \u0437\u0430 \u0432\u0445\u043E\u0434",
      body: "\u0412\u0430\u0448\u0438\u044F\u0442 \u0430\u043A\u0430\u0443\u043D\u0442 \u0432 {provider} \u0431\u0435\u0448\u0435 \u043F\u0440\u0435\u043C\u0430\u0445\u043D\u0430\u0442 \u043A\u0430\u0442\u043E \u043C\u0435\u0442\u043E\u0434 \u0437\u0430 \u0432\u0445\u043E\u0434 \u0437\u0430 {email}.",
      footer_reason: "\u041F\u043E\u043B\u0443\u0447\u0430\u0432\u0430\u0442\u0435 \u0442\u043E\u0432\u0430 \u0438\u0437\u0432\u0435\u0441\u0442\u0438\u0435 \u0437\u0430 \u0441\u0438\u0433\u0443\u0440\u043D\u043E\u0441\u0442 \u043F\u043E\u0440\u0430\u0434\u0438 \u043F\u0440\u043E\u043C\u044F\u043D\u0430 \u0432\u044A\u0432 \u0432\u0430\u0448\u0438\u044F \u0430\u043A\u0430\u0443\u043D\u0442 \u0432 PIPINGBOX."
    },
    mfa_factor_enrolled_notification: {
      subject: "PIPINGBOX \xB7 \u0414\u043E\u0431\u0430\u0432\u0435\u043D \u0435 \u043D\u043E\u0432 \u043C\u0435\u0442\u043E\u0434 \u0437\u0430 \u043F\u043E\u0442\u0432\u044A\u0440\u0436\u0434\u0435\u043D\u0438\u0435",
      preheader: "\u041A\u044A\u043C \u0432\u0430\u0448\u0438\u044F \u0430\u043A\u0430\u0443\u043D\u0442 \u0432 PIPINGBOX \u0431\u0435\u0448\u0435 \u0434\u043E\u0431\u0430\u0432\u0435\u043D \u043D\u043E\u0432 \u043C\u0435\u0442\u043E\u0434 \u0437\u0430 \u043F\u043E\u0442\u0432\u044A\u0440\u0436\u0434\u0435\u043D\u0438\u0435.",
      heading: "\u0414\u043E\u0431\u0430\u0432\u0435\u043D \u0435 \u043D\u043E\u0432 \u043C\u0435\u0442\u043E\u0434 \u0437\u0430 \u043F\u043E\u0442\u0432\u044A\u0440\u0436\u0434\u0435\u043D\u0438\u0435",
      body: "\u041A\u044A\u043C \u0432\u0430\u0448\u0438\u044F \u0430\u043A\u0430\u0443\u043D\u0442 \u0432 PIPINGBOX \u0431\u0435\u0448\u0435 \u0434\u043E\u0431\u0430\u0432\u0435\u043D \u043D\u043E\u0432 \u043C\u0435\u0442\u043E\u0434 \u0437\u0430 \u043F\u043E\u0442\u0432\u044A\u0440\u0436\u0434\u0435\u043D\u0438\u0435 \u043F\u0440\u0438 \u0432\u0445\u043E\u0434 ({factorType}).",
      footer_reason: "\u041F\u043E\u043B\u0443\u0447\u0430\u0432\u0430\u0442\u0435 \u0442\u043E\u0432\u0430 \u0438\u0437\u0432\u0435\u0441\u0442\u0438\u0435 \u0437\u0430 \u0441\u0438\u0433\u0443\u0440\u043D\u043E\u0441\u0442 \u043F\u043E\u0440\u0430\u0434\u0438 \u043F\u0440\u043E\u043C\u044F\u043D\u0430 \u0432\u044A\u0432 \u0432\u0430\u0448\u0438\u044F \u0430\u043A\u0430\u0443\u043D\u0442 \u0432 PIPINGBOX."
    },
    mfa_factor_unenrolled_notification: {
      subject: "PIPINGBOX \xB7 \u041F\u0440\u0435\u043C\u0430\u0445\u043D\u0430\u0442 \u0435 \u043C\u0435\u0442\u043E\u0434 \u0437\u0430 \u043F\u043E\u0442\u0432\u044A\u0440\u0436\u0434\u0435\u043D\u0438\u0435",
      preheader: "\u041E\u0442 \u0432\u0430\u0448\u0438\u044F \u0430\u043A\u0430\u0443\u043D\u0442 \u0432 PIPINGBOX \u0431\u0435\u0448\u0435 \u043F\u0440\u0435\u043C\u0430\u0445\u043D\u0430\u0442 \u043C\u0435\u0442\u043E\u0434 \u0437\u0430 \u043F\u043E\u0442\u0432\u044A\u0440\u0436\u0434\u0435\u043D\u0438\u0435.",
      heading: "\u041F\u0440\u0435\u043C\u0430\u0445\u043D\u0430\u0442 \u0435 \u043C\u0435\u0442\u043E\u0434 \u0437\u0430 \u043F\u043E\u0442\u0432\u044A\u0440\u0436\u0434\u0435\u043D\u0438\u0435",
      body: "\u041E\u0442 \u0432\u0430\u0448\u0438\u044F \u0430\u043A\u0430\u0443\u043D\u0442 \u0432 PIPINGBOX \u0431\u0435\u0448\u0435 \u043F\u0440\u0435\u043C\u0430\u0445\u043D\u0430\u0442 \u043C\u0435\u0442\u043E\u0434 \u0437\u0430 \u043F\u043E\u0442\u0432\u044A\u0440\u0436\u0434\u0435\u043D\u0438\u0435 \u043F\u0440\u0438 \u0432\u0445\u043E\u0434 ({factorType}).",
      footer_reason: "\u041F\u043E\u043B\u0443\u0447\u0430\u0432\u0430\u0442\u0435 \u0442\u043E\u0432\u0430 \u0438\u0437\u0432\u0435\u0441\u0442\u0438\u0435 \u0437\u0430 \u0441\u0438\u0433\u0443\u0440\u043D\u043E\u0441\u0442 \u043F\u043E\u0440\u0430\u0434\u0438 \u043F\u0440\u043E\u043C\u044F\u043D\u0430 \u0432\u044A\u0432 \u0432\u0430\u0448\u0438\u044F \u0430\u043A\u0430\u0443\u043D\u0442 \u0432 PIPINGBOX."
    },
    job_match: {
      subject: "PIPINGBOX \xB7 \u041D\u043E\u0432\u0430 \u043E\u0431\u044F\u0432\u0430, \u043F\u043E\u0434\u0445\u043E\u0434\u044F\u0449\u0430 \u0437\u0430 \u0432\u0430\u0448\u0438\u044F \u043F\u0440\u043E\u0444\u0438\u043B: {jobTitle}",
      preheader: "{score}% \u0441\u044A\u043E\u0442\u0432\u0435\u0442\u0441\u0442\u0432\u0438\u0435 \u0441 \u201E{jobTitle}\u201C.",
      heading: "\u041D\u043E\u0432\u0430 \u043E\u0431\u044F\u0432\u0430, \u043F\u043E\u0434\u0445\u043E\u0434\u044F\u0449\u0430 \u0437\u0430 \u0432\u0430\u0448\u0438\u044F \u043F\u0440\u043E\u0444\u0438\u043B",
      body: "\u041D\u0430\u043C\u0435\u0440\u0438\u0445\u043C\u0435 \u043E\u0431\u044F\u0432\u0430 \u0437\u0430 \u0440\u0430\u0431\u043E\u0442\u0430 \u0441 {score}% \u0441\u044A\u043E\u0442\u0432\u0435\u0442\u0441\u0442\u0432\u0438\u0435 \u0441 \u0432\u0430\u0448\u0438\u044F \u043F\u0440\u043E\u0444\u0438\u043B: \u201E{jobTitle}\u201C \u0432 {company}.",
      body_no_company: "\u041D\u0430\u043C\u0435\u0440\u0438\u0445\u043C\u0435 \u043E\u0431\u044F\u0432\u0430 \u0437\u0430 \u0440\u0430\u0431\u043E\u0442\u0430 \u0441 {score}% \u0441\u044A\u043E\u0442\u0432\u0435\u0442\u0441\u0442\u0432\u0438\u0435 \u0441 \u0432\u0430\u0448\u0438\u044F \u043F\u0440\u043E\u0444\u0438\u043B: \u201E{jobTitle}\u201C.",
      button: "\u0412\u0438\u0436 \u043E\u0431\u044F\u0432\u0430\u0442\u0430",
      note: "\u041F\u043E\u043B\u0443\u0447\u0430\u0432\u0430\u0442\u0435 \u0438\u0437\u0432\u0435\u0441\u0442\u0438\u044F \u0437\u0430 \u0440\u0430\u0431\u043E\u0442\u0430, \u0437\u0430\u0449\u043E\u0442\u043E \u0441\u0430 \u0432\u043A\u043B\u044E\u0447\u0435\u043D\u0438 \u0432\u044A\u0432 \u0432\u0430\u0448\u0438\u044F \u043F\u0440\u043E\u0444\u0438\u043B \u0432 PIPINGBOX. \u041C\u043E\u0436\u0435\u0442\u0435 \u0434\u0430 \u0433\u0438 \u0438\u0437\u043A\u043B\u044E\u0447\u0438\u0442\u0435 \u043F\u043E \u0432\u0441\u044F\u043A\u043E \u0432\u0440\u0435\u043C\u0435 \u043E\u0442 \u043F\u0440\u0435\u0434\u043F\u043E\u0447\u0438\u0442\u0430\u043D\u0438\u044F\u0442\u0430 \u0437\u0430 \u0441\u044A\u043E\u0442\u0432\u0435\u0442\u0441\u0442\u0432\u0438\u0435.",
      footer_reason: "\u041F\u043E\u043B\u0443\u0447\u0430\u0432\u0430\u0442\u0435 \u0442\u043E\u0432\u0430 \u0441\u044A\u043E\u0431\u0449\u0435\u043D\u0438\u0435, \u0437\u0430\u0449\u043E\u0442\u043E \u0438\u0437\u0432\u0435\u0441\u0442\u0438\u044F\u0442\u0430 \u0437\u0430 \u0440\u0430\u0431\u043E\u0442\u0430 \u0441\u0430 \u0432\u043A\u043B\u044E\u0447\u0435\u043D\u0438 \u0432\u044A\u0432 \u0432\u0430\u0448\u0438\u044F \u0430\u043A\u0430\u0443\u043D\u0442 \u0432 PIPINGBOX."
    },
    workforce_match: {
      subject: "PIPINGBOX \xB7 \u041D\u043E\u0432\u0430 \u0437\u0430\u044F\u0432\u043A\u0430 \u0437\u0430 \u043F\u0435\u0440\u0441\u043E\u043D\u0430\u043B, \u043F\u043E\u0434\u0445\u043E\u0434\u044F\u0449\u0430 \u0437\u0430 \u0432\u0430\u0448\u0438\u044F \u043F\u0440\u043E\u0444\u0438\u043B",
      preheader: "\u041A\u043E\u043C\u043F\u0430\u043D\u0438\u044F \u0442\u044A\u0440\u0441\u0438 \u0441\u043F\u0435\u0446\u0438\u0430\u043B\u0438\u0441\u0442\u0438 ({workerType}) \u0432 {country}.",
      heading: "\u041D\u043E\u0432\u0430 \u0437\u0430\u044F\u0432\u043A\u0430 \u0437\u0430 \u043F\u0435\u0440\u0441\u043E\u043D\u0430\u043B",
      body: "\u041A\u043E\u043C\u043F\u0430\u043D\u0438\u044F \u043F\u0443\u0431\u043B\u0438\u043A\u0443\u0432\u0430 \u0437\u0430\u044F\u0432\u043A\u0430 \u0437\u0430 \u043F\u0435\u0440\u0441\u043E\u043D\u0430\u043B \u0441 {score}% \u0441\u044A\u043E\u0442\u0432\u0435\u0442\u0441\u0442\u0432\u0438\u0435 \u0441 \u0432\u0430\u0448\u0438\u044F \u043F\u0440\u043E\u0444\u0438\u043B: {workerType} \u0432 {country}.",
      button: "\u0412\u0438\u0436 \u0437\u0430\u044F\u0432\u043A\u0430\u0442\u0430",
      note: "\u041F\u043E\u043B\u0443\u0447\u0430\u0432\u0430\u0442\u0435 \u0442\u0435\u0437\u0438 \u0438\u0437\u0432\u0435\u0441\u0442\u0438\u044F, \u0437\u0430\u0449\u043E\u0442\u043E \u0441\u0430 \u0432\u043A\u043B\u044E\u0447\u0435\u043D\u0438 \u0432\u044A\u0432 \u0432\u0430\u0448\u0438\u044F \u043F\u0440\u043E\u0444\u0438\u043B \u0432 PIPINGBOX. \u041C\u043E\u0436\u0435\u0442\u0435 \u0434\u0430 \u0433\u0438 \u0438\u0437\u043A\u043B\u044E\u0447\u0438\u0442\u0435 \u043F\u043E \u0432\u0441\u044F\u043A\u043E \u0432\u0440\u0435\u043C\u0435 \u043E\u0442 \u043F\u0440\u0435\u0434\u043F\u043E\u0447\u0438\u0442\u0430\u043D\u0438\u044F\u0442\u0430 \u0437\u0430 \u0441\u044A\u043E\u0442\u0432\u0435\u0442\u0441\u0442\u0432\u0438\u0435.",
      footer_reason: "\u041F\u043E\u043B\u0443\u0447\u0430\u0432\u0430\u0442\u0435 \u0442\u043E\u0432\u0430 \u0441\u044A\u043E\u0431\u0449\u0435\u043D\u0438\u0435, \u0437\u0430\u0449\u043E\u0442\u043E \u0438\u0437\u0432\u0435\u0441\u0442\u0438\u044F\u0442\u0430 \u0437\u0430 \u0440\u0430\u0431\u043E\u0442\u0430 \u0441\u0430 \u0432\u043A\u043B\u044E\u0447\u0435\u043D\u0438 \u0432\u044A\u0432 \u0432\u0430\u0448\u0438\u044F \u0430\u043A\u0430\u0443\u043D\u0442 \u0432 PIPINGBOX."
    },
    cert_expiry: {
      subject: "PIPINGBOX \xB7 \u0412\u0430\u0448\u0438\u044F\u0442 \u0441\u0435\u0440\u0442\u0438\u0444\u0438\u043A\u0430\u0442 {certName} \u0438\u0437\u0442\u0438\u0447\u0430 \u0441\u043A\u043E\u0440\u043E",
      preheader: "{certName} \u0438\u0437\u0442\u0438\u0447\u0430 \u043D\u0430 {expiresOn}.",
      heading: "\u0421\u0435\u0440\u0442\u0438\u0444\u0438\u043A\u0430\u0442, \u043A\u043E\u0439\u0442\u043E \u0438\u0437\u0442\u0438\u0447\u0430 \u0441\u043A\u043E\u0440\u043E",
      body: "\u0412\u0430\u0448\u0438\u044F\u0442 \u0441\u0435\u0440\u0442\u0438\u0444\u0438\u043A\u0430\u0442 {certName} \u0438\u0437\u0442\u0438\u0447\u0430 \u043D\u0430 {expiresOn}. \u041F\u043E\u0434\u0434\u044A\u0440\u0436\u0430\u0439\u0442\u0435 \u043F\u0440\u043E\u0444\u0438\u043B\u0430 \u0441\u0438 \u0430\u043A\u0442\u0443\u0430\u043B\u0435\u043D, \u0437\u0430 \u0434\u0430 \u0432\u0438\u0436\u0434\u0430\u0442 \u043A\u043E\u043C\u043F\u0430\u043D\u0438\u0438\u0442\u0435 \u0432\u0430\u043B\u0438\u0434\u043D\u0438\u0442\u0435 \u0432\u0438 \u0441\u0435\u0440\u0442\u0438\u0444\u0438\u043A\u0430\u0442\u0438.",
      button: "\u0410\u043A\u0442\u0443\u0430\u043B\u0438\u0437\u0438\u0440\u0430\u0439 \u0441\u0435\u0440\u0442\u0438\u0444\u0438\u043A\u0430\u0442\u0438\u0442\u0435 \u043C\u0438",
      note: "\u041F\u043E\u043B\u0443\u0447\u0430\u0432\u0430\u0442\u0435 \u0442\u0435\u0437\u0438 \u0438\u0437\u0432\u0435\u0441\u0442\u0438\u044F, \u0437\u0430\u0449\u043E\u0442\u043E \u0441\u0430 \u0432\u043A\u043B\u044E\u0447\u0435\u043D\u0438 \u0432\u044A\u0432 \u0432\u0430\u0448\u0438\u044F \u043F\u0440\u043E\u0444\u0438\u043B \u0432 PIPINGBOX.",
      footer_reason: "\u041F\u043E\u043B\u0443\u0447\u0430\u0432\u0430\u0442\u0435 \u0442\u043E\u0432\u0430 \u0441\u044A\u043E\u0431\u0449\u0435\u043D\u0438\u0435, \u0437\u0430\u0449\u043E\u0442\u043E \u0438\u0437\u0432\u0435\u0441\u0442\u0438\u044F\u0442\u0430 \u0437\u0430 \u0441\u0435\u0440\u0442\u0438\u0444\u0438\u043A\u0430\u0442\u0438 \u0441\u0430 \u0432\u043A\u043B\u044E\u0447\u0435\u043D\u0438 \u0432\u044A\u0432 \u0432\u0430\u0448\u0438\u044F \u0430\u043A\u0430\u0443\u043D\u0442 \u0432 PIPINGBOX."
    },
    lead_receipt: {
      subject: "PIPINGBOX \xB7 \u041F\u043E\u043B\u0443\u0447\u0438\u0445\u043C\u0435 \u0432\u0430\u0448\u0435\u0442\u043E \u0437\u0430\u043F\u0438\u0442\u0432\u0430\u043D\u0435",
      preheader: "\u0411\u043B\u0430\u0433\u043E\u0434\u0430\u0440\u0438\u043C \u0432\u0438, \u0447\u0435 \u0441\u0435 \u0441\u0432\u044A\u0440\u0437\u0430\u0445\u0442\u0435 \u0441 PIPINGBOX.",
      heading: "\u041F\u043E\u043B\u0443\u0447\u0438\u0445\u043C\u0435 \u0432\u0430\u0448\u0435\u0442\u043E \u0437\u0430\u043F\u0438\u0442\u0432\u0430\u043D\u0435",
      body: "\u0417\u0434\u0440\u0430\u0432\u0435\u0439\u0442\u0435, {name}. \u0411\u043B\u0430\u0433\u043E\u0434\u0430\u0440\u0438\u043C \u0432\u0438, \u0447\u0435 \u0441\u0435 \u0441\u0432\u044A\u0440\u0437\u0430\u0445\u0442\u0435 \u0441 PIPINGBOX. \u041F\u043E\u043B\u0443\u0447\u0438\u0445\u043C\u0435 \u0432\u0430\u0448\u0430\u0442\u0430 \u0437\u0430\u044F\u0432\u043A\u0430 \u0437\u0430 \u043F\u0435\u0440\u0441\u043E\u043D\u0430\u043B \u0438 \u0435\u043A\u0438\u043F\u044A\u0442 \u043D\u0438 \u0441\u043A\u043E\u0440\u043E \u0449\u0435 \u0441\u0435 \u0441\u0432\u044A\u0440\u0436\u0435 \u0441 \u0432\u0430\u0441 \u0441 \u043F\u0440\u0435\u0434\u043B\u043E\u0436\u0435\u043D\u0438\u0435.",
      footer_reason: "\u041F\u043E\u043B\u0443\u0447\u0430\u0432\u0430\u0442\u0435 \u0442\u043E\u0432\u0430 \u0441\u044A\u043E\u0431\u0449\u0435\u043D\u0438\u0435, \u0437\u0430\u0449\u043E\u0442\u043E \u0441\u0442\u0435 \u0438\u0437\u043F\u0440\u0430\u0442\u0438\u043B\u0438 \u0444\u043E\u0440\u043C\u0443\u043B\u044F\u0440 \u0437\u0430 \u043A\u043E\u043D\u0442\u0430\u043A\u0442 \u043D\u0430 pipingbox.com."
    },
    application_pending_profile: {
      subject: "PIPINGBOX \xB7 \u041A\u0430\u043D\u0434\u0438\u0434\u0430\u0442\u0443\u0440\u0430\u0442\u0430 \u0435 \u043F\u043E\u043B\u0443\u0447\u0435\u043D\u0430 \u2014 \u0434\u043E\u043F\u044A\u043B\u043D\u0435\u0442\u0435 \u043F\u0440\u043E\u0444\u0438\u043B\u0430 \u0441\u0438, \u0437\u0430 \u0434\u0430 \u044F \u0430\u043A\u0442\u0438\u0432\u0438\u0440\u0430\u0442\u0435",
      preheader: "\u041F\u043E\u043B\u0443\u0447\u0438\u0445\u043C\u0435 \u0432\u0430\u0448\u0430\u0442\u0430 \u043A\u0430\u043D\u0434\u0438\u0434\u0430\u0442\u0443\u0440\u0430 \u0437\u0430 {jobTitle}.",
      heading: "\u041A\u0430\u043D\u0434\u0438\u0434\u0430\u0442\u0443\u0440\u0430\u0442\u0430 \u0435 \u043F\u043E\u043B\u0443\u0447\u0435\u043D\u0430 \u2014 \u0434\u043E\u043F\u044A\u043B\u043D\u0435\u0442\u0435 \u043F\u0440\u043E\u0444\u0438\u043B\u0430 \u0441\u0438, \u0437\u0430 \u0434\u0430 \u044F \u0430\u043A\u0442\u0438\u0432\u0438\u0440\u0430\u0442\u0435",
      body: "\u041F\u043E\u043B\u0443\u0447\u0438\u0445\u043C\u0435 \u043F\u0440\u0430\u0432\u0438\u043B\u043D\u043E \u0432\u0430\u0448\u0430\u0442\u0430 \u043A\u0430\u043D\u0434\u0438\u0434\u0430\u0442\u0443\u0440\u0430 \u0437\u0430 \xAB{jobTitle}\xBB \u0432 {company}. \u041C\u043E\u0436\u0435\u0442\u0435 \u0434\u0430 \u043F\u0440\u043E\u0434\u044A\u043B\u0436\u0438\u0442\u0435 \u0434\u0430 \u043A\u0430\u043D\u0434\u0438\u0434\u0430\u0442\u0441\u0442\u0432\u0430\u0442\u0435 \u0437\u0430 \u0434\u0440\u0443\u0433\u0438 \u043E\u0431\u044F\u0432\u0438: \u0432\u0441\u0438\u0447\u043A\u0438 \u0432\u0430\u0448\u0438 \u043A\u0430\u043D\u0434\u0438\u0434\u0430\u0442\u0443\u0440\u0438 \u0441\u0435 \u0437\u0430\u043F\u0430\u0437\u0432\u0430\u0442. \u0422\u0430\u0437\u0438 \u043A\u0430\u043D\u0434\u0438\u0434\u0430\u0442\u0443\u0440\u0430 \u0432\u0441\u0435 \u043E\u0449\u0435 \u043D\u0435 \u043C\u043E\u0436\u0435 \u0434\u0430 \u0431\u044A\u0434\u0435 \u043F\u0440\u0435\u0434\u0441\u0442\u0430\u0432\u0435\u043D\u0430 \u043D\u0430 \u043A\u043E\u043C\u043F\u0430\u043D\u0438\u044F\u0442\u0430; \u0437\u0430 \u0434\u0430 \u044F \u0430\u043A\u0442\u0438\u0432\u0438\u0440\u0430\u0442\u0435, \u0434\u043E\u043F\u044A\u043B\u043D\u0435\u0442\u0435 \u043F\u0440\u043E\u0444\u0438\u043B\u0430 \u0441\u0438 \u0434\u043E \u043F\u044A\u043B\u043D\u0430 \u0432\u0430\u043B\u0438\u0434\u0430\u0446\u0438\u044F (Marketplace Ready).",
      body_no_company: "\u041F\u043E\u043B\u0443\u0447\u0438\u0445\u043C\u0435 \u043F\u0440\u0430\u0432\u0438\u043B\u043D\u043E \u0432\u0430\u0448\u0430\u0442\u0430 \u043A\u0430\u043D\u0434\u0438\u0434\u0430\u0442\u0443\u0440\u0430 \u0437\u0430 \xAB{jobTitle}\xBB. \u041C\u043E\u0436\u0435\u0442\u0435 \u0434\u0430 \u043F\u0440\u043E\u0434\u044A\u043B\u0436\u0438\u0442\u0435 \u0434\u0430 \u043A\u0430\u043D\u0434\u0438\u0434\u0430\u0442\u0441\u0442\u0432\u0430\u0442\u0435 \u0437\u0430 \u0434\u0440\u0443\u0433\u0438 \u043E\u0431\u044F\u0432\u0438: \u0432\u0441\u0438\u0447\u043A\u0438 \u0432\u0430\u0448\u0438 \u043A\u0430\u043D\u0434\u0438\u0434\u0430\u0442\u0443\u0440\u0438 \u0441\u0435 \u0437\u0430\u043F\u0430\u0437\u0432\u0430\u0442. \u0422\u0430\u0437\u0438 \u043A\u0430\u043D\u0434\u0438\u0434\u0430\u0442\u0443\u0440\u0430 \u0432\u0441\u0435 \u043E\u0449\u0435 \u043D\u0435 \u043C\u043E\u0436\u0435 \u0434\u0430 \u0431\u044A\u0434\u0435 \u043F\u0440\u0435\u0434\u0441\u0442\u0430\u0432\u0435\u043D\u0430 \u043D\u0430 \u043A\u043E\u043C\u043F\u0430\u043D\u0438\u044F\u0442\u0430; \u0437\u0430 \u0434\u0430 \u044F \u0430\u043A\u0442\u0438\u0432\u0438\u0440\u0430\u0442\u0435, \u0434\u043E\u043F\u044A\u043B\u043D\u0435\u0442\u0435 \u043F\u0440\u043E\u0444\u0438\u043B\u0430 \u0441\u0438 \u0434\u043E \u043F\u044A\u043B\u043D\u0430 \u0432\u0430\u043B\u0438\u0434\u0430\u0446\u0438\u044F (Marketplace Ready).",
      note: "\u0412\u0430\u0448\u0430\u0442\u0430 \u043A\u0430\u043D\u0434\u0438\u0434\u0430\u0442\u0443\u0440\u0430 \u041D\u0415 \u0435 \u043E\u0442\u0445\u0432\u044A\u0440\u043B\u0435\u043D\u0430: \u0442\u044F \u043F\u0440\u043E\u0441\u0442\u043E \u0447\u0430\u043A\u0430 \u0432\u0430\u043B\u0438\u0434\u0430\u0446\u0438\u044F\u0442\u0430 \u043D\u0430 \u043F\u0440\u043E\u0444\u0438\u043B\u0430 \u0432\u0438. \u0412\u0435\u0434\u043D\u0430\u0433\u0430 \u0449\u043E\u043C \u043F\u0440\u043E\u0444\u0438\u043B\u044A\u0442 \u0432\u0438 \u0441\u0442\u0430\u043D\u0435 Marketplace Ready, \u0442\u044F \u0430\u0432\u0442\u043E\u043C\u0430\u0442\u0438\u0447\u043D\u043E \u0449\u0435 \u0431\u044A\u0434\u0435 \u0440\u0430\u0437\u0433\u043B\u0435\u0434\u0430\u043D\u0430 \u0437\u0430 \u043F\u0440\u0435\u0434\u0441\u0442\u0430\u0432\u044F\u043D\u0435 \u043D\u0430 \u043A\u043E\u043C\u043F\u0430\u043D\u0438\u0438\u0442\u0435.",
      pending_intro: "\u041A\u0430\u043A\u0432\u043E \u043B\u0438\u043F\u0441\u0432\u0430 \u0432 \u043F\u0440\u043E\u0444\u0438\u043B\u0430 \u0432\u0438:",
      pending_items: {
        photo: "\u041F\u0440\u043E\u0444\u0438\u043B\u043D\u0430 \u0441\u043D\u0438\u043C\u043A\u0430",
        basic_details: "\u0418\u043C\u0435 \u0438 \u043F\u0440\u043E\u0444\u0435\u0441\u0438\u044F",
        location: "\u041C\u0435\u0441\u0442\u043E\u043F\u043E\u043B\u043E\u0436\u0435\u043D\u0438\u0435",
        years_experience: "\u0413\u043E\u0434\u0438\u043D\u0438 \u043E\u043F\u0438\u0442",
        skills: "\u0423\u043C\u0435\u043D\u0438\u044F",
        bio: "\u0417\u0430 \u0432\u0430\u0441 (\u0431\u0438\u043E)",
        cv: "CV",
        experience: "\u041F\u0440\u043E\u0444\u0435\u0441\u0438\u043E\u043D\u0430\u043B\u0435\u043D \u043E\u043F\u0438\u0442",
        certifications: "\u0421\u0435\u0440\u0442\u0438\u0444\u0438\u043A\u0430\u0442\u0438",
        documents: "\u0414\u043E\u043A\u0443\u043C\u0435\u043D\u0442\u0438"
      },
      button: "\u0414\u043E\u043F\u044A\u043B\u043D\u0438 \u043F\u0440\u043E\u0444\u0438\u043B\u0430 \u043C\u0438",
      footer_reason: "\u041F\u043E\u043B\u0443\u0447\u0430\u0432\u0430\u0442\u0435 \u0442\u043E\u0432\u0430 \u0441\u044A\u043E\u0431\u0449\u0435\u043D\u0438\u0435, \u0437\u0430\u0449\u043E\u0442\u043E \u043A\u0430\u043D\u0434\u0438\u0434\u0430\u0442\u0441\u0442\u0432\u0430\u0445\u0442\u0435 \u0437\u0430 \u043E\u0431\u044F\u0432\u0430 \u0432 PIPINGBOX."
    },
    marketplace_ready: {
      subject: "PIPINGBOX \xB7 \u041F\u0440\u043E\u0444\u0438\u043B\u044A\u0442 \u0435 \u0432\u0430\u043B\u0438\u0434\u0438\u0440\u0430\u043D \u2014 \u0432\u0430\u0448\u0438\u0442\u0435 \u043A\u0430\u043D\u0434\u0438\u0434\u0430\u0442\u0443\u0440\u0438 \u0432\u0435\u0447\u0435 \u043C\u043E\u0433\u0430\u0442 \u0434\u0430 \u0431\u044A\u0434\u0430\u0442 \u0440\u0430\u0437\u0433\u043B\u0435\u0436\u0434\u0430\u043D\u0438",
      preheader: "\u0412\u0430\u0448\u0438\u044F\u0442 \u043F\u0440\u043E\u0444\u0438\u043B \u0432\u0435\u0447\u0435 \u0435 Marketplace Ready.",
      heading: "\u041F\u0440\u043E\u0444\u0438\u043B\u044A\u0442 \u0435 \u0432\u0430\u043B\u0438\u0434\u0438\u0440\u0430\u043D \u2014 \u0432\u0430\u0448\u0438\u0442\u0435 \u043A\u0430\u043D\u0434\u0438\u0434\u0430\u0442\u0443\u0440\u0438 \u0432\u0435\u0447\u0435 \u043C\u043E\u0433\u0430\u0442 \u0434\u0430 \u0431\u044A\u0434\u0430\u0442 \u0440\u0430\u0437\u0433\u043B\u0435\u0436\u0434\u0430\u043D\u0438",
      body_single: "\u0412\u0430\u0448\u0438\u044F\u0442 \u043F\u0440\u043E\u0444\u0438\u043B \u0432\u0435\u0447\u0435 \u0435 \u0432\u0430\u043B\u0438\u0434\u0438\u0440\u0430\u043D \u0438 \u0441\u0442\u0435 Marketplace Ready. \u0412\u0430\u0448\u0430\u0442\u0430 \u043A\u0430\u043D\u0434\u0438\u0434\u0430\u0442\u0443\u0440\u0430 \u0437\u0430 \xAB{jobTitle}\xBB \u0432\u0435\u0447\u0435 \u043C\u043E\u0436\u0435 \u0434\u0430 \u0431\u044A\u0434\u0435 \u0440\u0430\u0437\u0433\u043B\u0435\u0436\u0434\u0430\u043D\u0430 \u0437\u0430 \u043F\u0440\u0435\u0434\u0441\u0442\u0430\u0432\u044F\u043D\u0435 \u043D\u0430 \u043A\u043E\u043C\u043F\u0430\u043D\u0438\u0438\u0442\u0435.",
      body_multiple: "\u0412\u0430\u0448\u0438\u044F\u0442 \u043F\u0440\u043E\u0444\u0438\u043B \u0432\u0435\u0447\u0435 \u0435 \u0432\u0430\u043B\u0438\u0434\u0438\u0440\u0430\u043D \u0438 \u0441\u0442\u0435 Marketplace Ready. \u0412\u0430\u0448\u0438\u0442\u0435 {count} \u0447\u0430\u043A\u0430\u0449\u0438 \u043A\u0430\u043D\u0434\u0438\u0434\u0430\u0442\u0443\u0440\u0438 \u0432\u0435\u0447\u0435 \u043C\u043E\u0433\u0430\u0442 \u0434\u0430 \u0431\u044A\u0434\u0430\u0442 \u0440\u0430\u0437\u0433\u043B\u0435\u0436\u0434\u0430\u043D\u0438 \u0437\u0430 \u043F\u0440\u0435\u0434\u0441\u0442\u0430\u0432\u044F\u043D\u0435 \u043D\u0430 \u043A\u043E\u043C\u043F\u0430\u043D\u0438\u0438\u0442\u0435.",
      activated_list_intro: "\u0410\u043A\u0442\u0438\u0432\u0438\u0440\u0430\u043D\u0438 \u043A\u0430\u043D\u0434\u0438\u0434\u0430\u0442\u0443\u0440\u0438:",
      note: "\u041D\u0435 \u0435 \u043D\u0435\u043E\u0431\u0445\u043E\u0434\u0438\u043C\u043E \u0434\u0430 \u043F\u0440\u0430\u0432\u0438\u0442\u0435 \u043D\u0438\u0449\u043E \u0434\u0440\u0443\u0433\u043E: \u043D\u0430\u0448\u0438\u044F\u0442 \u0435\u043A\u0438\u043F \u0440\u0430\u0437\u0433\u043B\u0435\u0436\u0434\u0430 \u0432\u0441\u044F\u043A\u0430 \u043A\u0430\u043D\u0434\u0438\u0434\u0430\u0442\u0443\u0440\u0430 \u0441\u044A\u0433\u043B\u0430\u0441\u043D\u043E \u043A\u043E\u043D\u043A\u0440\u0435\u0442\u043D\u0438\u0442\u0435 \u0438\u0437\u0438\u0441\u043A\u0432\u0430\u043D\u0438\u044F \u043D\u0430 \u0432\u0441\u044F\u043A\u0430 \u043E\u0431\u044F\u0432\u0430 \u0438 \u0449\u0435 \u0441\u0435 \u0441\u0432\u044A\u0440\u0436\u0435 \u0441 \u0432\u0430\u0441.",
      button: "\u0412\u0438\u0436 \u043C\u043E\u0438\u0442\u0435 \u043A\u0430\u043D\u0434\u0438\u0434\u0430\u0442\u0443\u0440\u0438",
      footer_reason: "\u041F\u043E\u043B\u0443\u0447\u0430\u0432\u0430\u0442\u0435 \u0442\u043E\u0432\u0430 \u0441\u044A\u043E\u0431\u0449\u0435\u043D\u0438\u0435, \u0437\u0430\u0449\u043E\u0442\u043E \u0432\u0430\u0448\u0438\u044F\u0442 \u043F\u0440\u043E\u0444\u0438\u043B \u0432 PIPINGBOX \u0434\u043E\u0441\u0442\u0438\u0433\u043D\u0430 Marketplace Ready."
    },
    cv_review_pending: {
      subject: "PIPINGBOX \xB7 \u041F\u043E\u043B\u0443\u0447\u0438\u0445\u043C\u0435 \u0432\u0430\u0448\u0435\u0442\u043E CV \u2014 \u043F\u0440\u0435\u0433\u043B\u0435\u0434\u0430\u0439\u0442\u0435 \u043F\u0440\u043E\u0444\u0438\u043B\u0430 \u0441\u0438",
      preheader: "\u041F\u043E\u0434\u0433\u043E\u0442\u0432\u0438\u0445\u043C\u0435 \u0432\u0430\u0448\u0438\u044F \u043F\u0440\u043E\u0444\u0435\u0441\u0438\u043E\u043D\u0430\u043B\u0435\u043D \u043F\u0440\u043E\u0444\u0438\u043B \u0432\u044A\u0437 \u043E\u0441\u043D\u043E\u0432\u0430 \u043D\u0430 CV-\u0442\u043E.",
      heading: "\u0412\u0430\u0448\u0438\u044F\u0442 \u043F\u0440\u043E\u0444\u0435\u0441\u0438\u043E\u043D\u0430\u043B\u0435\u043D \u043F\u0440\u043E\u0444\u0438\u043B \u0435 \u0433\u043E\u0442\u043E\u0432 \u0437\u0430 \u043F\u0440\u0435\u0433\u043B\u0435\u0434",
      body: "\u0417\u0434\u0440\u0430\u0432\u0435\u0439\u0442\u0435! \u041F\u043E\u043B\u0443\u0447\u0438\u0445\u043C\u0435 \u0432\u0430\u0448\u0435\u0442\u043E CV \u0438 \u043F\u043E\u0434\u0433\u043E\u0442\u0432\u0438\u0445\u043C\u0435 \u0432\u0430\u0448\u0438\u044F \u043F\u0440\u043E\u0444\u0435\u0441\u0438\u043E\u043D\u0430\u043B\u0435\u043D \u043F\u0440\u043E\u0444\u0438\u043B \u0432\u044A\u0437 \u043E\u0441\u043D\u043E\u0432\u0430 \u043D\u0430 \u043D\u0435\u0433\u043E. \u041F\u0440\u0435\u0433\u043B\u0435\u0434\u0430\u0439\u0442\u0435 \u0434\u0430\u043D\u043D\u0438\u0442\u0435, \u0437\u0430 \u0434\u0430 \u043C\u043E\u0436\u0435 PIPINGBOX \u0434\u0430 \u0432\u0438 \u0432\u0437\u0435\u043C\u0430 \u043F\u0440\u0435\u0434\u0432\u0438\u0434 \u0437\u0430 \u0441\u044A\u0432\u043C\u0435\u0441\u0442\u0438\u043C\u0438 \u0432\u044A\u0437\u043C\u043E\u0436\u043D\u043E\u0441\u0442\u0438.",
      button: "\u041F\u0440\u0435\u0433\u043B\u0435\u0434\u0430\u0439 \u043F\u0440\u043E\u0444\u0438\u043B\u0430 \u043C\u0438",
      note: "\u041D\u0438\u0449\u043E \u043E\u0449\u0435 \u043D\u0435 \u0435 \u043F\u0443\u0431\u043B\u0438\u043A\u0443\u0432\u0430\u043D\u043E: \u0438\u0437\u0432\u043B\u0435\u0447\u0435\u043D\u0438\u0442\u0435 \u0434\u0430\u043D\u043D\u0438 \u0441\u0442\u0430\u0432\u0430\u0442 \u0447\u0430\u0441\u0442 \u043E\u0442 \u043F\u0440\u043E\u0444\u0438\u043B\u0430 \u0432\u0438 \u0435\u0434\u0432\u0430 \u0441\u043B\u0435\u0434 \u043A\u0430\u0442\u043E \u0433\u0438 \u043F\u0440\u0435\u0433\u043B\u0435\u0434\u0430\u0442\u0435 \u0438 \u043F\u043E\u0442\u0432\u044A\u0440\u0434\u0438\u0442\u0435. \u0421\u0435\u0440\u0442\u0438\u0444\u0438\u043A\u0430\u0442\u0438\u0442\u0435, \u0441\u043F\u043E\u043C\u0435\u043D\u0430\u0442\u0438 \u0432 CV-\u0442\u043E, \u0441\u0435 \u0440\u0435\u0433\u0438\u0441\u0442\u0440\u0438\u0440\u0430\u0442 \u043A\u0430\u0442\u043E \u0434\u0435\u043A\u043B\u0430\u0440\u0438\u0440\u0430\u043D\u0438, \u0430 \u043D\u0435 \u043F\u0440\u043E\u0432\u0435\u0440\u0435\u043D\u0438.",
      footer_reason: "\u041F\u043E\u043B\u0443\u0447\u0430\u0432\u0430\u0442\u0435 \u0442\u043E\u0432\u0430 \u0441\u044A\u043E\u0431\u0449\u0435\u043D\u0438\u0435, \u0437\u0430\u0449\u043E\u0442\u043E PIPINGBOX \u043F\u043E\u043B\u0443\u0447\u0438 CV, \u0441\u0432\u044A\u0440\u0437\u0430\u043D\u043E \u0441 \u0432\u0430\u0448\u0438\u044F \u043F\u0440\u043E\u0444\u0438\u043B."
    }
  }
};
var bg_default = bg;

// _shared/email-i18n/locales.ts
var LOCALES = { en: en_default, es: es_default, nl: nl_default, fr: fr_default, de: de_default, pt: pt_default, it: it_default, ro: ro_default, uk: uk_default, pl: pl_default, bg: bg_default };
function getLocale(lang) {
  const code = normalizeEmailLanguage(lang) ?? DEFAULT_EMAIL_LANGUAGE;
  return LOCALES[code] ?? LOCALES[DEFAULT_EMAIL_LANGUAGE];
}

// _shared/email-i18n/render.ts
var BRAND = {
  name: "PIPINGBOX",
  orange: "#E8611A",
  black: "#0B0B0B",
  text: "#1F2937",
  muted: "#6B7280",
  border: "#E5E7EB",
  bg: "#F3F4F6",
  support: "support@pipingbox.com",
  site: "https://pipingbox.com",
  /**
   * PB-I18N-EMAIL-001 — corrección de accesibilidad (revisión del PO,
   * 2026-10-11): el botón usaba texto blanco (#FFFFFF) sobre el naranja
   * corporativo (#E8611A), con un contraste de ~3.41:1 — por debajo del
   * mínimo WCAG AA para texto normal (4.5:1). Texto oscuro (#18181B) sobre el
   * mismo naranja da ~5.19:1, que sí cumple AA. Ver test de regresión en
   * `email-i18n_test.ts` ("contraste del botón cumple WCAG AA").
   */
  buttonText: "#18181B"
};
function escapeHtml(value) {
  return String(value ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}
function safeUrl(value) {
  const raw = String(value ?? "").trim();
  try {
    const u = new URL(raw);
    if (u.protocol !== "http:" && u.protocol !== "https:") throw new Error("scheme");
    return u.toString();
  } catch {
    throw new Error("email-i18n: unsafe or invalid URL");
  }
}
var PLACEHOLDER = /\{([a-zA-Z][a-zA-Z0-9_]*)\}/g;
function interpolate(template, vars, mode, missing) {
  return template.replace(PLACEHOLDER, (_m, key) => {
    const v = vars[key];
    if (v === void 0 || v === null || v === "") {
      missing.add(key);
      return "";
    }
    return mode === "html" ? escapeHtml(v) : String(v);
  });
}
function minutesFromSeconds(expSeconds) {
  const s = typeof expSeconds === "number" && expSeconds > 0 ? expSeconds : 3600;
  return String(Math.max(1, Math.round(s / 60)));
}
function layout(p) {
  const action = p.actionHtml ?? "";
  const code = p.codeHtml ?? "";
  const list = p.listHtml ?? "";
  return `<!DOCTYPE html>
<html lang="${p.lang}" dir="ltr" xmlns="http://www.w3.org/1999/xhtml">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<meta name="x-apple-disable-message-reformatting">
<meta name="color-scheme" content="light">
<title>${p.heading}</title>
</head>
<body style="margin:0; padding:0; background-color:${BRAND.bg}; font-family:Arial, Helvetica, sans-serif; color:${BRAND.text};">
<div style="display:none; max-height:0; overflow:hidden; opacity:0;">${p.preheader}</div>
<table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="background-color:${BRAND.bg};">
<tr><td align="center" style="padding:24px 12px;">
<table role="presentation" width="600" cellspacing="0" cellpadding="0" border="0" style="max-width:600px; width:100%; background-color:#FFFFFF; border-radius:8px; overflow:hidden;">
<tr><td style="background-color:${BRAND.black}; padding:20px 28px;">
  <span style="font-size:22px; font-weight:bold; letter-spacing:2px; color:#FFFFFF;">PIPING<span style="color:${BRAND.orange};">BOX</span></span>
</td></tr>
<tr><td style="padding:32px 28px 8px 28px;">
  <h1 style="margin:0 0 16px 0; font-size:22px; line-height:28px; color:${BRAND.black};">${p.heading}</h1>
  ${p.bodyHtml}
  ${list}
  ${code}
  ${action}
</td></tr>
<tr><td style="padding:8px 28px 24px 28px;">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="border-left:4px solid ${BRAND.orange}; background-color:#FFF7F2;">
  <tr><td style="padding:14px 16px; font-size:13px; line-height:20px; color:${BRAND.text};">
    ${p.securityHtml}
  </td></tr></table>
</td></tr>
<tr><td style="padding:16px 28px 24px 28px; border-top:1px solid ${BRAND.border}; font-size:12px; line-height:18px; color:${BRAND.muted};">
  <p style="margin:0 0 8px 0;">${p.footerReason}</p>
  <p style="margin:0 0 8px 0;">${p.footerNoReply}</p>
  <p style="margin:0;"><strong style="color:${BRAND.black};">PIPINGBOX</strong> \xB7 ${p.tagline} \xB7 <a href="${BRAND.site}" style="color:${BRAND.orange}; text-decoration:none;">pipingbox.com</a></p>
</td></tr>
</table>
</td></tr>
</table>
</body>
</html>`;
}
function paragraph(htmlText) {
  return `<p style="margin:0 0 16px 0; font-size:16px; line-height:24px; color:${BRAND.text};">${htmlText}</p>`;
}
function button(label, url, fallbackLabel) {
  const u = escapeHtml(url);
  return `<table role="presentation" cellspacing="0" cellpadding="0" border="0" style="margin:8px 0 20px 0;">
<tr><td align="center" bgcolor="${BRAND.orange}" style="border-radius:6px;">
  <a href="${u}" target="_blank" rel="noopener" style="display:inline-block; padding:14px 28px; font-size:16px; font-weight:bold; color:${BRAND.buttonText}; text-decoration:none; border-radius:6px; background-color:${BRAND.orange};">${label}</a>
</td></tr></table>
<p style="margin:0 0 16px 0; font-size:13px; line-height:20px; color:${BRAND.muted};">${fallbackLabel}<br>
<a href="${u}" style="color:${BRAND.orange}; word-break:break-all;">${u}</a></p>`;
}
function supportLink() {
  return `<a href="mailto:${BRAND.support}" style="color:${BRAND.orange}; text-decoration:none;">${BRAND.support}</a>`;
}
function pickLocale(lang) {
  const l = getLocale(lang);
  return { locale: l, lang: l.code };
}
function commonVars(vars, expiresInSeconds) {
  return { support: BRAND.support, minutes: minutesFromSeconds(expiresInSeconds), ...vars ?? {} };
}
function renderActionEmail(input) {
  const { locale, lang } = pickLocale(input.lang);
  const t = locale.templates[input.template];
  const c = locale.common;
  const vars = commonVars(input.vars, input.expiresInSeconds);
  const missing = /* @__PURE__ */ new Set();
  const url = safeUrl(input.actionUrl);
  const showExpiry = input.showExpiry ?? true;
  const bodyTpl = input.template === "job_match" && !vars.company && t.body_no_company ? t.body_no_company : t.body;
  const H = (s) => interpolate(s, vars, "html", missing);
  const T = (s) => interpolate(s, vars, "text", missing);
  const securityItems = [
    showExpiry ? H(c.expires) : null,
    H(c.never_share),
    H(c.support_prompt).replace(escapeHtml(BRAND.support), supportLink())
  ].filter(Boolean);
  const html = layout({
    lang,
    preheader: H(t.preheader),
    heading: H(t.heading),
    bodyHtml: paragraph(H(bodyTpl)) + paragraph(H(t.note).replace(escapeHtml(BRAND.support), supportLink())),
    actionHtml: button(H(t.button), url, H(c.button_fallback)),
    securityHtml: `<p style="margin:0 0 8px 0;"><strong>${H(c.security_title)}</strong></p>` + securityItems.map((s) => `<p style="margin:0 0 6px 0;">${s}</p>`).join(""),
    footerReason: H(t.footer_reason),
    footerNoReply: H(c.footer_no_reply).replace(escapeHtml(BRAND.support), supportLink()),
    tagline: H(c.brand_tagline)
  });
  const textLines = [
    `PIPINGBOX \u2014 ${T(t.heading)}`,
    "",
    T(bodyTpl),
    "",
    `${T(t.button)}: ${url}`,
    "",
    T(t.note),
    "",
    `${T(c.security_title).toUpperCase()}`,
    ...showExpiry ? [`- ${T(c.expires)}`] : [],
    `- ${T(c.never_share)}`,
    `- ${T(c.support_prompt)}`,
    "",
    T(t.footer_reason),
    T(c.footer_no_reply),
    `PIPINGBOX \xB7 ${T(c.brand_tagline)} \xB7 ${BRAND.site}`
  ];
  return {
    lang,
    template: input.template,
    subject: T(t.subject),
    html,
    text: textLines.join("\n"),
    missing: [...missing]
  };
}

// cv-extract/index.ts
var corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS"
};
var DRAFTS_TABLE = "app_cv_extraction_drafts";
var EVENTS_TABLE = "app_cv_extraction_events";
var PROFILES_TABLE = "app_14da0f1941_profiles";
var ALLOWED_CV_BUCKETS = ["app_14da0f1941_certificates"];
var USER_SCAN_PAGE_SIZE = 500;
var USER_SCAN_MAX_PAGES = 20;
function json(obj, status = 200) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" }
  });
}
function log(fields) {
  const allowed = [
    "fn",
    "mode",
    "event",
    "status",
    "error_code",
    "draft_id",
    "correlation_id",
    "fields_count",
    "experiences_count",
    "certifications_count",
    "attempt",
    "email_sent",
    "lang"
  ];
  const safe = Object.fromEntries(
    allowed.filter((k) => fields[k] !== void 0).map((k) => [k, fields[k]])
  );
  console.log(JSON.stringify({ ts: (/* @__PURE__ */ new Date()).toISOString(), ...safe }));
}
async function timingSafeEqual(a, b) {
  const enc = new TextEncoder();
  const [da, db] = await Promise.all([
    crypto.subtle.digest("SHA-256", enc.encode(a)),
    crypto.subtle.digest("SHA-256", enc.encode(b))
  ]);
  const va = new Uint8Array(da);
  const vb = new Uint8Array(db);
  const n = Math.max(va.length, vb.length);
  let diff = va.length === vb.length ? 0 : 1;
  for (let i = 0; i < n; i++) diff |= (va[i] ?? 0) ^ (vb[i] ?? 0);
  return diff === 0;
}
function isKnownErrorCode(code) {
  return CV_EXTRACTION_ERROR_CODES.includes(code);
}
async function emitEvent(supabase, userId, eventType, extra = {}) {
  try {
    await supabase.from(EVENTS_TABLE).insert({ user_id: userId, event_type: eventType, ...extra });
  } catch (e) {
    log({ event: "metric_insert_error", error_code: String(e).slice(0, 60) });
  }
}
async function findUserByEmail(supabase, email) {
  const target = email.trim().toLowerCase();
  if (!target || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(target)) return null;
  for (let page = 1; page <= USER_SCAN_MAX_PAGES; page++) {
    const { data, error } = await supabase.auth.admin.listUsers({
      page,
      perPage: USER_SCAN_PAGE_SIZE
    });
    if (error || !data) return null;
    const matches = data.users.filter((u) => (u.email ?? "").toLowerCase() === target);
    if (matches.length > 1) return "ambiguous";
    if (matches.length === 1) {
      const u = matches[0];
      const metaLang = typeof u.user_metadata?.["lang"] === "string" ? u.user_metadata["lang"] : null;
      let profileLang = null;
      const { data: profile } = await supabase.from(PROFILES_TABLE).select("preferred_language").eq("user_id", u.id).maybeSingle();
      if (profile?.preferred_language) profileLang = profile.preferred_language;
      return { id: u.id, lang: metaLang, profileLang };
    }
    if (data.users.length < USER_SCAN_PAGE_SIZE) return null;
  }
  return "ambiguous";
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
  let body = {};
  try {
    const parsed = await req.json();
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      body = parsed;
    }
  } catch {
  }
  const isServiceRole = await timingSafeEqual(bearer, serviceKey);
  let userId;
  let channel;
  let cvBucket = null;
  let cvPath = null;
  let supportEmail = null;
  let supportLang = null;
  if (isServiceRole) {
    channel = "support_inbound";
    cvBucket = typeof body.storage_bucket === "string" ? body.storage_bucket : null;
    cvPath = typeof body.storage_path === "string" ? body.storage_path : null;
    supportEmail = typeof body.candidate_email === "string" ? body.candidate_email : null;
    if (!cvBucket || !cvPath || !supportEmail) {
      return json({ error: "invalid_request", reason: "storage_bucket, storage_path and candidate_email are required in support mode" }, 400);
    }
    const match = await findUserByEmail(serviceClient, supportEmail);
    if (!match || match === "ambiguous") {
      log({ fn: "cv-extract", mode: "support", event: "manual_review", correlation_id: correlationId });
      return json({
        status: "manual_review",
        reason: match === "ambiguous" ? "ambiguous_or_beyond_scale_identity" : "no_unequivocal_match"
      });
    }
    userId = match.id;
    if (!cvPath.startsWith(`${userId}/`)) {
      return json({ error: "invalid_request", reason: "storage_path must be inside the candidate namespace" }, 400);
    }
    supportLang = match.profileLang ?? match.lang ?? "en";
  } else {
    channel = "user_upload";
    const { data: { user }, error: userError } = await serviceClient.auth.getUser(bearer);
    if (userError || !user) return json({ error: "unauthorized" }, 401);
    userId = user.id;
    const explicitBucket = typeof body.bucket === "string" ? body.bucket : null;
    const explicitPath = typeof body.path === "string" ? body.path : null;
    if (explicitBucket && explicitPath) {
      if (!ALLOWED_CV_BUCKETS.includes(explicitBucket) || !explicitPath.startsWith(`${userId}/`)) {
        return json({ error: "invalid_request", reason: "bucket or path outside the user namespace" }, 400);
      }
      cvBucket = explicitBucket;
      cvPath = explicitPath;
    } else {
      const { data: profile, error: profileError } = await serviceClient.from(PROFILES_TABLE).select("cv_storage_bucket, cv_storage_path").eq("user_id", userId).maybeSingle();
      if (profileError) return json({ error: "profile_read_failed" }, 500);
      if (profile?.cv_storage_bucket && profile?.cv_storage_path) {
        cvBucket = profile.cv_storage_bucket;
        cvPath = profile.cv_storage_path;
      }
    }
  }
  if (!cvBucket || !cvPath) {
    return json({ error: "no_cv", reason: "no canonical CV found for this user" }, 400);
  }
  if (!ALLOWED_CV_BUCKETS.includes(cvBucket)) {
    return json({ error: "invalid_request", reason: "cv bucket not in allowlist" }, 400);
  }
  const { data: fileData, error: downloadError } = await serviceClient.storage.from(cvBucket).download(cvPath);
  if (downloadError || !fileData) {
    log({ fn: "cv-extract", mode: channel, event: "storage_read_failed", correlation_id: correlationId });
    return json({ error: "storage_read_error" }, 502);
  }
  const bytes = new Uint8Array(await fileData.arrayBuffer());
  const hash = await sha256Hex(bytes);
  const fileName = cvPath.split("/").pop() || "cv";
  const mimeType = fileData.type || null;
  const { data: existing } = await serviceClient.from(DRAFTS_TABLE).select("id, extraction_status, attempt_count").eq("user_id", userId).eq("cv_sha256", hash).maybeSingle();
  let draftId;
  let attempt;
  let isRetry = false;
  if (existing && (existing.extraction_status === "pending_review" || existing.extraction_status === "review_confirmed" || existing.extraction_status === "dismissed")) {
    await emitEvent(serviceClient, userId, "cv_already_processed", { draft_id: existing.id });
    log({ fn: "cv-extract", mode: channel, event: "already_processed", draft_id: existing.id, correlation_id: correlationId });
    return json({ status: "already_processed", draft_id: existing.id, extraction_status: existing.extraction_status });
  }
  await emitEvent(serviceClient, userId, "cv_extraction_started", {});
  if (existing && existing.extraction_status === "extraction_failed") {
    draftId = existing.id;
    attempt = existing.attempt_count + 1;
    isRetry = true;
    await emitEvent(serviceClient, userId, "cv_extraction_retried", { draft_id: draftId, attempt });
  } else if (existing) {
    draftId = existing.id;
    attempt = existing.attempt_count + 1;
  } else {
    draftId = crypto.randomUUID();
    attempt = 1;
  }
  const textResult = await extractText(bytes, mimeType, fileName);
  const draftPayload = (status, extra) => ({
    id: draftId,
    user_id: userId,
    cv_sha256: hash,
    source_channel: channel,
    storage_bucket: cvBucket,
    storage_path: cvPath,
    file_name: fileName,
    mime_type: mimeType,
    file_size: bytes.byteLength,
    attempt_count: attempt,
    extraction_status: status,
    ...extra
  });
  const upsertDraft = async (payload) => {
    const { error } = await serviceClient.from(DRAFTS_TABLE).upsert(payload, { onConflict: "user_id,cv_sha256" });
    if (error) {
      log({ fn: "cv-extract", mode: channel, event: "draft_write_failed", correlation_id: correlationId });
      throw new Error("draft_write_failed");
    }
  };
  if (!textResult.ok) {
    const errorCode = isKnownErrorCode(textResult.error) ? textResult.error : "text_extraction_error";
    await upsertDraft(
      draftPayload("extraction_failed", {
        error_code: errorCode,
        extraction_method: "unavailable",
        cv_language: null,
        extracted_fields: [],
        proposed_experiences: [],
        proposed_certifications: []
      })
    );
    await emitEvent(serviceClient, userId, "cv_extraction_failed", { draft_id: draftId });
    log({ fn: "cv-extract", mode: channel, event: "extraction_failed", error_code: errorCode, draft_id: draftId, correlation_id: correlationId });
    return json({
      status: "extraction_failed",
      draft_id: draftId,
      error_code: errorCode,
      retry_supported: true
    });
  }
  const result = extractCv({
    text: textResult.text,
    sourceDocumentId: draftId,
    now: (/* @__PURE__ */ new Date()).toISOString()
  });
  await upsertDraft(
    draftPayload("pending_review", {
      error_code: null,
      cv_language: result.language,
      extraction_method: textResult.method === "docx_xml" ? "docx_xml" : "native_text",
      reviewed_at: null,
      extracted_fields: result.fields,
      proposed_experiences: result.experiences,
      proposed_certifications: result.certifications
    })
  );
  await emitEvent(serviceClient, userId, "cv_extraction_completed", {
    draft_id: draftId,
    fields_extracted_count: result.fields.length,
    experiences_extracted_count: result.experiences.length,
    certifications_proposed_count: result.certifications.length
  });
  log({
    fn: "cv-extract",
    mode: channel,
    event: "extraction_completed",
    draft_id: draftId,
    fields_count: result.fields.length,
    experiences_count: result.experiences.length,
    certifications_count: result.certifications.length,
    attempt,
    correlation_id: correlationId
  });
  let emailSent = false;
  if (channel === "support_inbound") {
    const lang = (typeof supportLang === "string" ? supportLang : "en") || "en";
    const appBaseUrl = (Deno.env.get("APP_BASE_URL") || "https://pipingbox.com").replace(/\/$/, "");
    const provider = createEmailProvider();
    if (provider.isConfigured()) {
      try {
        const rendered = renderActionEmail({
          template: "cv_review_pending",
          lang,
          actionUrl: `${appBaseUrl}/profile/cv-review`,
          vars: { name: "" },
          showExpiry: false
        });
        const r = await provider.send({
          to: supportEmail,
          subject: rendered.subject,
          html: rendered.html,
          text: rendered.text,
          fromName: "PipingBox"
        });
        emailSent = (r.rejected ?? 1) === 0;
      } catch {
        emailSent = false;
      }
    }
    log({ fn: "cv-extract", mode: "support", event: "review_email", email_sent: emailSent, lang, correlation_id: correlationId });
  }
  return json({
    status: isRetry ? "retried" : "completed",
    draft_id: draftId,
    extraction_status: "pending_review",
    language: result.language,
    fields_count: result.fields.length,
    experiences_count: result.experiences.length,
    certifications_count: result.certifications.length,
    email_sent: emailSent
  });
});
