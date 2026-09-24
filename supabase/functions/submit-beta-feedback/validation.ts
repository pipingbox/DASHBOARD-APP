export const CATEGORIES = ['translation', 'ai_error', 'export', 'login_account', 'interface', 'performance', 'other'];
export const LOCALES = ['en', 'es', 'nl', 'fr', 'de', 'pt', 'it', 'ro', 'uk', 'pl', 'bg'];
const FIELDS = ['category', 'locale', 'route', 'visible_text', 'suggested_text', 'description', 'build_sha', 'screenshot_url'];

export function validateFeedback(value: unknown) {
  if (!value || typeof value !== 'object' || Array.isArray(value) ||
      Object.keys(value).some((key) => !FIELDS.includes(key))) return null;
  const body = value as Record<string, unknown>;
  const read = (key: string, max: number) => {
    const input = body[key];
    if (input === undefined) return '';
    if (typeof input !== 'string' || input.length > max) return null;
    return input.trim();
  };
  const category = read('category', 32);
  const localeInput = read('locale', 16);
  const locale = localeInput?.toLowerCase().split(/[-_]/)[0];
  const routeInput = read('route', 512);
  const visible = read('visible_text', 500);
  const suggested = read('suggested_text', 500);
  const description = read('description', 2000);
  const buildSha = read('build_sha', 40);
  const screenshot = read('screenshot_url', 256);
  if (!category || !CATEGORIES.includes(category) || !locale || !LOCALES.includes(locale) ||
      !routeInput || !routeInput.startsWith('/') || routeInput.startsWith('//') ||
      /[?#\\\x00-\x1f]/.test(routeInput) || !/^\/[\p{L}\p{N}/._~%-]*$/u.test(routeInput) ||
      !routeInput.split('/').every((part) => part !== '..' && part !== '.') ||
      buildSha === null || (buildSha && !/^[a-f0-9]{7,40}$/i.test(buildSha)) ||
      screenshot === null || visible === null || suggested === null || description === null ||
      (category === 'translation' ? !visible || !suggested : !description || visible !== '' || suggested !== '')) return null;
  if (screenshot && !/^feedback\/[0-9a-f-]{36}\/[0-9a-z-]{1,90}\.(jpg|jpeg|png|webp)$/.test(screenshot)) return null;
  return { category, locale, route: routeInput, visible, suggested, description, buildSha, screenshot };
}

export function resolveTranslation(text: string, locale: Record<string, unknown>, canonical: Record<string, unknown>) {
  const keys: string[] = [];
  function visit(node: Record<string, unknown>, prefix = '') {
    for (const [name, value] of Object.entries(node)) {
      const key = prefix ? `${prefix}.${name}` : name;
      if (typeof value === 'string' && value.trim() === text.trim()) keys.push(key);
      else if (value && typeof value === 'object' && !Array.isArray(value)) visit(value as Record<string, unknown>, key);
    }
  }
  visit(locale);
  const key = keys.length === 1 ? keys[0] : null;
  const canonicalText = key?.split('.').reduce<unknown>((node, part) =>
    node && typeof node === 'object' ? (node as Record<string, unknown>)[part] : null, canonical);
  return { key, candidates: keys.length > 1 ? keys.slice(0, 20) : [], canonical: typeof canonicalText === 'string' ? canonicalText : null };
}

export function rateLimitExceeded(attempts: number, limit: number) {
  return attempts > limit;
}
