// PB-I18N-EMAIL-001 — Persistencia de la preferencia de idioma del usuario.
//
// Fuente de verdad (decisión aprobada): `auth.users.raw_user_meta_data.lang`
// (user_metadata.lang). Está disponible en el signUp (antes de que exista el
// perfil) y en el payload del Send Email Auth Hook, por lo que es el único
// lugar del que se puede leer el idioma del destinatario para el correo de
// confirmación. Se replica a `profiles.preferred_language` para consultas SQL
// y notificaciones transaccionales.
//
// Reglas:
//   * Solo se persiste para el usuario de la sesión activa (nunca para otro).
//   * Nunca se infiere por país, nacionalidad o correo. Si no hay valor en el
//     servidor, no se escribe nada: los correos usan `en` hasta que el
//     usuario elija idioma autenticado.
//   * Los códigos se normalizan a `languages.json` (11 códigos).
import type { User } from '@supabase/supabase-js';
import { supabase, TABLES } from '@/lib/supabase';
import i18n, {
  changeAppLanguage,
  toSupportedCode,
  type SupportedLanguageCode,
} from '@/i18n';

/** Clave en user_metadata. Debe coincidir con `_shared/email-i18n/languages.ts`. */
export const USER_METADATA_LANG_KEY = 'lang';
/** Columna réplica en app_14da0f1941_profiles (sql/029a). */
export const PROFILE_LANGUAGE_COLUMN = 'preferred_language';

export function readUserLanguage(user: User | null | undefined): SupportedLanguageCode | null {
  const raw = user?.user_metadata?.[USER_METADATA_LANG_KEY];
  return typeof raw === 'string' ? toSupportedCode(raw) : null;
}

/**
 * Aplica en la UI el idioma guardado en el servidor para el usuario que acaba
 * de iniciar sesión (sincronización entre dispositivos). Si el servidor no
 * tiene preferencia, se mantiene la UI local y se devuelve `false` (no se
 * sube la preferencia local automáticamente: la elección debe ser explícita).
 */
export function applyUserLanguageFromSession(user: User | null | undefined): boolean {
  const serverLang = readUserLanguage(user);
  if (!serverLang) return false;
  const current = toSupportedCode(i18n.resolvedLanguage || i18n.language);
  if (current !== serverLang) changeAppLanguage(serverLang);
  return true;
}

/**
 * Persiste la preferencia de idioma del usuario autenticado en
 * user_metadata.lang y en profiles.preferred_language. No hace nada sin
 * sesión. Devuelve `true` si user_metadata quedó actualizado.
 */
export async function persistUserLanguage(code: SupportedLanguageCode): Promise<boolean> {
  const lang = toSupportedCode(code);
  if (!lang) return false;
  const { data } = await supabase.auth.getSession();
  const sessionUser = data.session?.user;
  if (!sessionUser) return false;

  if (readUserLanguage(sessionUser) !== lang) {
    const { error } = await supabase.auth.updateUser({ data: { [USER_METADATA_LANG_KEY]: lang } });
    if (error) {
      console.warn('[userLanguage] updateUser failed:', error.message);
      return false;
    }
  }

  // Réplica para SQL/notificaciones; RLS profiles_update_own limita a la fila propia.
  const { error: profileError } = await supabase
    .from(TABLES.profiles)
    .update({ [PROFILE_LANGUAGE_COLUMN]: lang })
    .eq('user_id', sessionUser.id);
  if (profileError) {
    // No bloqueante: user_metadata es la fuente de verdad.
    console.warn('[userLanguage] profile replica update failed:', profileError.message);
  }
  return true;
}
