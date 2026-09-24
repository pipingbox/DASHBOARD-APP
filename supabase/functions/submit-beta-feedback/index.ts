import { createClient } from 'jsr:@supabase/supabase-js@2';
import { validateFeedback, resolveTranslation } from './validation.ts';
import en from './locales/en.json' with { type: 'json' };
import es from './locales/es.json' with { type: 'json' };
import nl from './locales/nl.json' with { type: 'json' };
import fr from './locales/fr.json' with { type: 'json' };
import de from './locales/de.json' with { type: 'json' };
import pt from './locales/pt.json' with { type: 'json' };
import it from './locales/it.json' with { type: 'json' };
import ro from './locales/ro.json' with { type: 'json' };
import uk from './locales/uk.json' with { type: 'json' };
import pl from './locales/pl.json' with { type: 'json' };
import bg from './locales/bg.json' with { type: 'json' };

const translations: Record<string, Record<string, unknown>> = { en, es, nl, fr, de, pt, it, ro, uk, pl, bg };
const errors: Record<string, Record<string, string>> = {
  en: { invalid: 'Check the report fields and try again.', limited: 'Too many reports. Try again in an hour.', failed: 'The report could not be saved. Try again.', unauthorized: 'Please sign in again.' },
  es: { invalid: 'Revisa los campos e inténtalo de nuevo.', limited: 'Demasiados reportes. Inténtalo en una hora.', failed: 'No se pudo guardar el reporte.', unauthorized: 'Vuelve a iniciar sesión.' },
  ro: { invalid: 'Verificați câmpurile și încercați din nou.', limited: 'Prea multe rapoarte. Încercați din nou peste o oră.', failed: 'Raportul nu a putut fi salvat.', unauthorized: 'Autentificați-vă din nou.' },
  uk: { invalid: 'Перевірте поля та спробуйте ще раз.', limited: 'Забагато повідомлень. Спробуйте через годину.', failed: 'Не вдалося зберегти повідомлення.', unauthorized: 'Увійдіть повторно.' },
  pl: { invalid: 'Sprawdź pola i spróbuj ponownie.', limited: 'Zbyt wiele zgłoszeń. Spróbuj za godzinę.', failed: 'Nie udało się zapisać zgłoszenia.', unauthorized: 'Zaloguj się ponownie.' },
  bg: { invalid: 'Проверете полетата и опитайте отново.', limited: 'Твърде много сигнали. Опитайте след час.', failed: 'Сигналът не беше запазен.', unauthorized: 'Влезте отново.' },
  de: { invalid: 'Bitte Eingaben prüfen.', limited: 'Zu viele Meldungen. In einer Stunde erneut versuchen.', failed: 'Meldung konnte nicht gespeichert werden.', unauthorized: 'Bitte erneut anmelden.' },
  fr: { invalid: 'Vérifiez les champs.', limited: 'Trop de signalements. Réessayez dans une heure.', failed: 'Signalement non enregistré.', unauthorized: 'Reconnectez-vous.' },
  nl: { invalid: 'Controleer de velden.', limited: 'Te veel meldingen. Probeer het over een uur opnieuw.', failed: 'Melding niet opgeslagen.', unauthorized: 'Log opnieuw in.' },
  pt: { invalid: 'Verifique os campos.', limited: 'Demasiados relatórios. Tente daqui a uma hora.', failed: 'Não foi possível guardar o relatório.', unauthorized: 'Inicie sessão novamente.' },
  it: { invalid: 'Controlla i campi.', limited: 'Troppe segnalazioni. Riprova tra un’ora.', failed: 'Impossibile salvare la segnalazione.', unauthorized: 'Accedi di nuovo.' },
};

Deno.serve(async (request) => {
  const origin = request.headers.get('origin') || '';
  const allowed = /^https:\/\/(pipingbox\.com|app\.pipingbox\.com|pipingbox-app\.pipingbox\.workers\.dev)$/.test(origin) || /^http:\/\/localhost:\d+$/.test(origin);
  const headers = { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': allowed ? origin : 'https://pipingbox-app.pipingbox.workers.dev', 'Access-Control-Allow-Headers': 'authorization, apikey, content-type, x-client-info', 'Access-Control-Allow-Methods': 'POST, OPTIONS', 'Vary': 'Origin' };
  const reply = (status: number, code: string, locale = 'en', id?: string) => new Response(JSON.stringify(id ? { created: true, id } : { created: false, code, error: (errors[locale] || errors.en)[code] }), { status, headers });
  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers });
  if (request.method !== 'POST') return reply(405, 'invalid');
  if (!allowed || Number(request.headers.get('content-length') || 0) > 8192) return reply(400, 'invalid');
  let raw: unknown;
  try {
    const reader = request.body?.getReader();
    if (!reader) return reply(400, 'invalid');
    const chunks: Uint8Array[] = [];
    let total = 0;
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > 8192) {
        await reader.cancel();
        return reply(413, 'invalid');
      }
      chunks.push(value);
    }
    const body = new Uint8Array(total);
    let offset = 0;
    for (const chunk of chunks) {
      body.set(chunk, offset);
      offset += chunk.byteLength;
    }
    raw = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(body));
  } catch { return reply(400, 'invalid'); }
  const locale = typeof raw === 'object' && raw !== null && !Array.isArray(raw) && typeof (raw as Record<string, unknown>).locale === 'string'
    ? (raw as { locale: string }).locale.toLowerCase().slice(0, 2) : 'en';
  const payload = validateFeedback(raw);
  if (!payload) return reply(400, 'invalid', locale);
  const url = Deno.env.get('SUPABASE_URL')!;
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY')!;
  const admin = createClient(url, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, { auth: { persistSession: false } });
  const token = request.headers.get('authorization')?.replace(/^Bearer /i, '') || '';
  let userId: string | null = null;
  if (token && token !== anonKey) {
    const { data, error } = await admin.auth.getUser(token);
    if (!error && data.user) userId = data.user.id;
    else {
      let role: unknown;
      try { role = JSON.parse(atob(token.split('.')[1])).role; } catch { return reply(401, 'unauthorized', payload.locale); }
      if (role !== 'anon') return reply(401, 'unauthorized', payload.locale);
    }
  }
  if (payload.screenshot && (!userId || !payload.screenshot.startsWith(`feedback/${userId}/`))) return reply(400, 'invalid', payload.locale);
  if (payload.screenshot) {
    const path = payload.screenshot.split('/');
    const { data, error } = await admin.storage.from('feedback-screenshots').list(path.slice(0, 2).join('/'), { search: path[2], limit: 10 });
    if (error || !data?.some((item) => item.name === path[2])) return reply(400, 'invalid', payload.locale);
  }
  // Only `cf-connecting-ip` is trusted. The Supabase gateway rewrites it with the
  // real client address, while `x-real-ip` / `x-forwarded-for` can be forged by the
  // caller and would hand an abuser an unlimited supply of fresh rate-limit buckets.
  // Without a trusted address every anonymous report shares one bucket, so the
  // limiter degrades closed rather than silently disappearing.
  const forwarded = request.headers.get('cf-connecting-ip')?.trim() || '';
  const source = /^[0-9a-f.:]{3,45}$/i.test(forwarded) ? forwarded : 'unknown';
  const bytes = new TextEncoder().encode(`${Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')}:${userId || source}`);
  const hash = Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', bytes)), (byte) => byte.toString(16).padStart(2, '0')).join('');
  const match = payload.category === 'translation' ? resolveTranslation(payload.visible, translations[payload.locale], en) : { key: null, candidates: [], canonical: null };
  const { data, error } = await admin.rpc('submit_controlled_feedback', {
    p_subject: hash, p_limit: userId ? 20 : 5, p_category: payload.category,
    p_description: payload.category === 'translation' ? `${payload.visible} → ${payload.suggested}` : payload.description,
    p_locale: payload.locale, p_route: payload.route, p_visible_text: payload.visible || null,
    p_suggested_text: payload.suggested || null, p_i18n_key: match.key,
    p_i18n_candidates: match.candidates, p_canonical_text: match.canonical,
    p_build_sha: payload.buildSha || null, p_user_id: userId, p_screenshot_url: payload.screenshot || null,
  });
  if (error) return reply(error.message.includes('rate_limited') ? 429 : 500, error.message.includes('rate_limited') ? 'limited' : 'failed', payload.locale);
  if (typeof data !== 'string' || !/^[0-9a-f-]{36}$/.test(data)) return reply(500, 'failed', payload.locale);
  return reply(201, '', payload.locale, data);
});
