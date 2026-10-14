// _shared/email-i18n/languages.ts
// PB-I18N-EMAIL-001 — Lista canónica de idiomas de correo.
//
// ESPEJO de app/frontend/src/i18n/languages.json (11 códigos). El test
// `email-i18n_test.ts` comprueba la paridad con ese archivo para que añadir un
// idioma en el frontend sin añadirlo aquí falle en CI.
//
// Regla de resolución del idioma del DESTINATARIO (nunca del actor):
//   user_metadata.lang (fuente de verdad)  →  profiles.preferred_language
//   (réplica)  →  valor explícito de la petición (solo leads externos)  →  'en'.
// Nunca se infiere por país, nacionalidad ni dominio del correo.

export const SUPPORTED_EMAIL_LANGUAGES = [
  "en", "es", "nl", "fr", "de", "pt", "it", "ro", "uk", "pl", "bg",
] as const;

export type EmailLanguage = (typeof SUPPORTED_EMAIL_LANGUAGES)[number];

export const DEFAULT_EMAIL_LANGUAGE: EmailLanguage = "en";

/** Clave en auth.users.raw_user_meta_data. Igual que app/frontend/src/lib/userLanguage.ts. */
export const USER_METADATA_LANG_KEY = "lang";

/** Normaliza "ro-RO", " PT ", "uk_UA" → código soportado, o null. */
export function normalizeEmailLanguage(value: unknown): EmailLanguage | null {
  if (typeof value !== "string") return null;
  const base = value.trim().slice(0, 2).toLowerCase();
  return (SUPPORTED_EMAIL_LANGUAGES as readonly string[]).includes(base)
    ? (base as EmailLanguage)
    : null;
}

export type LanguageSource = "user_metadata" | "profile" | "request" | "fallback";

export interface ResolvedLanguage {
  lang: EmailLanguage;
  source: LanguageSource;
}

export interface LanguageCandidates {
  /** auth.users.user_metadata (payload del hook o Admin API). */
  userMetadata?: Record<string, unknown> | null;
  /** app_14da0f1941_profiles.preferred_language. */
  profileLanguage?: string | null;
  /** Idioma declarado en la petición (solo destinatarios externos sin cuenta). */
  requested?: string | null;
}

export function resolveRecipientLanguage(c: LanguageCandidates): ResolvedLanguage {
  const fromMeta = normalizeEmailLanguage(c.userMetadata?.[USER_METADATA_LANG_KEY]);
  if (fromMeta) return { lang: fromMeta, source: "user_metadata" };
  const fromProfile = normalizeEmailLanguage(c.profileLanguage);
  if (fromProfile) return { lang: fromProfile, source: "profile" };
  const fromRequest = normalizeEmailLanguage(c.requested);
  if (fromRequest) return { lang: fromRequest, source: "request" };
  return { lang: DEFAULT_EMAIL_LANGUAGE, source: "fallback" };
}
