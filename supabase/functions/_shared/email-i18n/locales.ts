// _shared/email-i18n/locales.ts
// PB-I18N-EMAIL-001 — Registro de locales. Importación estática (Deno Deploy
// no permite import dinámico por ruta construida) y fallback a `en`.
import { DEFAULT_EMAIL_LANGUAGE, normalizeEmailLanguage, type EmailLanguage } from "./languages.ts";
import type { EmailLocale } from "./types.ts";
import en from "./locales/en.ts";
import es from "./locales/es.ts";
import nl from "./locales/nl.ts";
import fr from "./locales/fr.ts";
import de from "./locales/de.ts";
import pt from "./locales/pt.ts";
import it from "./locales/it.ts";
import ro from "./locales/ro.ts";
import uk from "./locales/uk.ts";
import pl from "./locales/pl.ts";
import bg from "./locales/bg.ts";

export const LOCALES: Record<EmailLanguage, EmailLocale> = { en, es, nl, fr, de, pt, it, ro, uk, pl, bg };

/** Devuelve el locale del código dado o `en` si no está soportado. */
export function getLocale(lang: unknown): EmailLocale {
  const code = normalizeEmailLanguage(lang) ?? DEFAULT_EMAIL_LANGUAGE;
  return LOCALES[code] ?? LOCALES[DEFAULT_EMAIL_LANGUAGE];
}
