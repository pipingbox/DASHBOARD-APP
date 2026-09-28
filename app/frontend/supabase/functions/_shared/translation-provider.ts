/**
 * Translation provider abstraction — PB-JOBS-PILOT-003 §7.
 *
 * The Jobs domain must stay independent of any concrete MT provider. The
 * single seam is `translateJobContent(source, sourceLocale, targetLocale)`:
 * the domain decides WHAT to translate and WHAT to do with the result; the
 * provider decides HOW.
 *
 * Two implementations:
 * - `LibreTranslateProvider` — self-hostable, project-keyed MT service. Wired
 *   via TRANSLATE_API_URL + TRANSLATE_API_KEY (project secrets).
 * - `NoopProvider` — the fail-open default when no provider is configured.
 *   Signals `configured: false` so the pipeline degrades to serving the
 *   canonical source content (never fabricates a translation).
 *
 * Adding a new provider = a new module exporting the same interface; nothing
 * in the Jobs domain changes.
 */

export interface TranslateJobContentRequest {
  /** The single canonical source-language job content. */
  source: {
    title: string;
    summary?: string | null;
    description?: string | null;
    requirements?: string | null;
  };
  sourceLocale: string;
  targetLocale: string;
}

export interface TranslatedJobContent {
  title: string;
  summary: string | null;
  description: string | null;
  requirements: string | null;
}

export interface TranslationResult {
  ok: boolean;
  /** Machine-translated content. Never present when ok === false. */
  translation?: TranslatedJobContent;
  /** Reason code when ok === false (observability; never the provider payload). */
  reason?: 'not_configured' | 'provider_error' | 'invalid_response';
  /** Human-safe diagnostic, no credentials, no request body. */
  detail?: string;
}

export interface TranslationProvider {
  readonly id: string;
  /** Whether this provider has the credentials/config to actually translate. */
  configured(): boolean;
  translate(req: TranslateJobContentRequest): Promise<TranslationResult>;
}

// ---------------------------------------------------------------------------
// Fail-open default (no provider configured)
// ---------------------------------------------------------------------------

export class NoopProvider implements TranslationProvider {
  readonly id = 'noop';
  configured(): boolean {
    return false;
  }
  async translate(): Promise<TranslationResult> {
    return { ok: false, reason: 'not_configured', detail: 'no translation provider configured' };
  }
}

// ---------------------------------------------------------------------------
// LibreTranslate (self-hostable, API-key keyed)
// ---------------------------------------------------------------------------

export interface LibreTranslateOptions {
  /** Base URL, e.g. https://translate.example.com (no trailing slash). */
  apiUrl?: string;
  apiKey?: string;
  /** Per-request timeout (provider slowness must not hang the pipeline). */
  timeoutMs?: number;
}

export class LibreTranslateProvider implements TranslationProvider {
  readonly id = 'libretranslate';
  private readonly apiUrl?: string;
  private readonly apiKey?: string;
  private readonly timeoutMs: number;

  constructor(opts: LibreTranslateOptions = {}) {
    this.apiUrl = opts.apiUrl?.replace(/\/+$/, '');
    this.apiKey = opts.apiKey;
    this.timeoutMs = opts.timeoutMs ?? 12_000;
  }

  configured(): boolean {
    return Boolean(this.apiUrl && this.apiKey);
  }

  private async translateText(text: string, sourceLocale: string, targetLocale: string): Promise<string> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);
    try {
      const res = await fetch(`${this.apiUrl}/translate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        signal: controller.signal,
        body: JSON.stringify({
          q: text,
          source: sourceLocale,
          target: targetLocale,
          format: 'text',
          api_key: this.apiKey,
        }),
      });
      if (!res.ok) throw new Error(`provider_http_${res.status}`);
      const data = (await res.json()) as { translatedText?: string };
      if (typeof data.translatedText !== 'string' || !data.translatedText) {
        throw new Error('provider_invalid_response');
      }
      return data.translatedText;
    } finally {
      clearTimeout(timer);
    }
  }

  async translate(req: TranslateJobContentRequest): Promise<TranslationResult> {
    if (!this.configured()) {
      return { ok: false, reason: 'not_configured', detail: 'LibreTranslate not configured' };
    }
    try {
      const { source, sourceLocale, targetLocale } = req;
      const [title, summary, description, requirements] = await Promise.all([
        this.translateText(source.title, sourceLocale, targetLocale),
        source.summary ? this.translateText(source.summary, sourceLocale, targetLocale) : Promise.resolve(null),
        source.description ? this.translateText(source.description, sourceLocale, targetLocale) : Promise.resolve(null),
        source.requirements ? this.translateText(source.requirements, sourceLocale, targetLocale) : Promise.resolve(null),
      ]);
      return { ok: true, translation: { title, summary, description, requirements } };
    } catch (err) {
      const msg = (err as Error).message ?? 'unknown';
      return {
        ok: false,
        reason: msg.includes('invalid_response') ? 'invalid_response' : 'provider_error',
        detail: msg,
      };
    }
  }
}

// ---------------------------------------------------------------------------
// Factory — the seam the domain uses
// ---------------------------------------------------------------------------

/**
 * Resolve the active provider from the runtime config (Deno env in the edge
 * function). Returns NoopProvider when the project has no provider configured
 * — the caller MUST treat that as a first-class outcome (serve source).
 */
export function getTranslationProvider(env: {
  TRANSLATE_PROVIDER?: string;
  TRANSLATE_API_URL?: string;
  TRANSLATE_API_KEY?: string;
}): TranslationProvider {
  const provider = (env.TRANSLATE_PROVIDER ?? '').toLowerCase();
  if (provider === 'libretranslate') {
    return new LibreTranslateProvider({ apiUrl: env.TRANSLATE_API_URL, apiKey: env.TRANSLATE_API_KEY });
  }
  return new NoopProvider();
}

/**
 * Domain-level operation. Kept provider-agnostic: given a provider, translate
 * one job's canonical content into one target locale.
 */
export function translateJobContent(
  provider: TranslationProvider,
  source: TranslateJobContentRequest['source'],
  sourceLocale: string,
  targetLocale: string,
): Promise<TranslationResult> {
  return provider.translate({ source, sourceLocale, targetLocale });
}
