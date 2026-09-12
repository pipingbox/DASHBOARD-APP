import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import LanguageDetector from 'i18next-browser-languagedetector';

import languages from './languages.json';
import en from './locales/en.json';
import es from './locales/es.json';
import nl from './locales/nl.json';
import fr from './locales/fr.json';
import de from './locales/de.json';
import pt from './locales/pt.json';
import it from './locales/it.json';
import ro from './locales/ro.json';
import uk from './locales/uk.json';

/**
 * PB-I18N-LAYER3-001: `languages.json` is the single canonical list of
 * interface languages. The selector, detection, persistence, the i18n guards
 * (`scripts/check-i18n-*.mjs`) and the Playwright smoke read the same file, so
 * adding a language is: add its entry there, add `locales/<code>.json` at 100%
 * parity with `en.json`, and register the resource below.
 */
export const SUPPORTED_LANGUAGES = languages as ReadonlyArray<{
  code: string;
  label: string;
  flag: string;
}>;

export type SupportedLanguageCode = (typeof SUPPORTED_LANGUAGES)[number]['code'];

export const DEFAULT_LANGUAGE: SupportedLanguageCode = 'en';
export const LANGUAGE_STORAGE_KEY = 'pipingbox_language';

const SUPPORTED_CODES = SUPPORTED_LANGUAGES.map((l) => l.code);

const RESOURCES: Record<string, { translation: Record<string, unknown> }> = {
  en: { translation: en },
  es: { translation: es },
  nl: { translation: nl },
  fr: { translation: fr },
  de: { translation: de },
  pt: { translation: pt },
  it: { translation: it },
  ro: { translation: ro },
  uk: { translation: uk },
};

for (const code of SUPPORTED_CODES) {
  if (!RESOURCES[code]) {
    throw new Error(`i18n: language "${code}" is listed in languages.json but has no bundled resource`);
  }
}

/** Normalise "ro-RO" / "uk-UA" / "PT" to a supported base code, or null. */
function toSupportedCode(value: string | null | undefined): SupportedLanguageCode | null {
  if (!value) return null;
  const base = value.trim().slice(0, 2).toLowerCase();
  return SUPPORTED_CODES.includes(base) ? base : null;
}

/**
 * Resolve the initial language:
 * 1. Explicit `?lng=` in the URL (shareable QA / deep links; also persisted).
 * 2. Previously stored preference in localStorage (if supported).
 * 3. Browser language (if supported).
 * 4. Fallback to English.
 *
 * `lng` is passed explicitly to i18next, which disables its detector for the
 * initial render, so the querystring MUST be honoured here or `?lng=` is dead.
 */
function resolveInitialLanguage(): SupportedLanguageCode {
  if (typeof window === 'undefined') return DEFAULT_LANGUAGE;
  try {
    const fromQuery = toSupportedCode(new URLSearchParams(window.location.search).get('lng'));
    if (fromQuery) {
      try {
        window.localStorage.setItem(LANGUAGE_STORAGE_KEY, fromQuery);
      } catch {
        // Ignore storage errors
      }
      return fromQuery;
    }
  } catch {
    // Ignore malformed URLs
  }
  try {
    const stored = window.localStorage.getItem(LANGUAGE_STORAGE_KEY);
    if (stored && SUPPORTED_CODES.includes(stored as SupportedLanguageCode)) {
      return stored as SupportedLanguageCode;
    }
  } catch {
    // Ignore storage errors (private mode, disabled storage, etc.)
  }
  return toSupportedCode(navigator.language) ?? DEFAULT_LANGUAGE;
}

void i18n
  .use(LanguageDetector)
  .use(initReactI18next)
  .init({
    lng: resolveInitialLanguage(),
    resources: RESOURCES,
    fallbackLng: DEFAULT_LANGUAGE,
    supportedLngs: SUPPORTED_CODES,
    nonExplicitSupportedLngs: true,
    interpolation: {
      escapeValue: false,
    },
    detection: {
      order: ['localStorage', 'querystring', 'navigator'],
      lookupLocalStorage: LANGUAGE_STORAGE_KEY,
      lookupQuerystring: 'lng',
      caches: ['localStorage'],
    },
    returnNull: false,
  });

export function changeAppLanguage(code: SupportedLanguageCode) {
  void i18n.changeLanguage(code);
  try {
    window.localStorage.setItem(LANGUAGE_STORAGE_KEY, code);
  } catch {
    // Ignore
  }
}

export default i18n;
