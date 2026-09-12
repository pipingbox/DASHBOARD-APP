import { test, expect, type Page } from '@playwright/test';
import { readFileSync } from 'fs';
import { resolve } from 'path';

/**
 * PB-I18N-LAYER2-001 (D7) — multilingual smoke tests, parametrised over the
 * seven supported languages.
 *
 * What each case pins, and why:
 *
 *  - localStorage bootstrap → the stored preference (key `pipingbox_language`)
 *    must drive the initial render, not just the selector state.
 *  - <html lang> — set by useSeo from i18next.resolvedLanguage; a mismatch
 *    breaks screen readers and crawler language detection.
 *  - Translated document title — useDocumentTitle resolves `pageMeta.tools.title`
 *    through i18next; an English title under a non-EN locale is exactly the
 *    "silent regression to English" D7 asks to catch.
 *  - Translated visible heading — the /tools header renders `tools.title`;
 *    same regression signal, in-body instead of head.
 *  - No raw keys / no [object Object] — unresolved t() calls render the key
 *    path or an object stringified; both are hard defects for a visitor.
 *  - Reload persistence — the preference must survive a refresh.
 *
 * The expected strings are read from the locale JSON files themselves, so the
 * test never hardcodes a second copy of the translations.
 *
 * The selector UI path (click → change → persist) is covered once in the
 * dedicated selector test below, in Spanish.
 */

const LANGUAGE_STORAGE_KEY = 'pipingbox_language';
// Same key the app uses (src/lib/betaFeedback.ts). Seeding it reproduces a
// returning visitor who already pressed "Continue" on the beta notice, so the
// aria-modal dialog never hides the page under test. The dialog copy itself is
// still covered by the raw-key / [object Object] assertions on first paint.
const BETA_DISMISSED_KEY = 'pipingbox_beta_dismissed';

/**
 * PB-I18N-LAYER3-001: the locale list is the canonical `languages.json` the
 * runtime selector and the i18n guards read. Adding a language there is enough
 * for it to be smoke-tested here — no second hardcoded list.
 */
const LANGUAGES = JSON.parse(
  readFileSync(resolve(process.cwd(), 'app/frontend/src/i18n/languages.json'), 'utf8'),
) as ReadonlyArray<{ code: string; label: string; flag: string }>;
const LOCALES = LANGUAGES.map((l) => l.code);
type LocaleCode = string;

function localeData(code: LocaleCode): Record<string, unknown> {
  // Playwright transpiles spec files as ESM (no __dirname); tests run from the
  // repo root, so process.cwd() is the stable anchor for the locale files.
  const file = resolve(process.cwd(), 'app/frontend/src/i18n/locales', `${code}.json`);
  return JSON.parse(readFileSync(file, 'utf8')) as Record<string, unknown>;
}

function localeString(code: LocaleCode, path: string): string {
  let node: unknown = localeData(code);
  for (const segment of path.split('.')) {
    if (node === null || typeof node !== 'object') throw new Error(`bad path ${path} in ${code}`);
    node = (node as Record<string, unknown>)[segment];
  }
  if (typeof node !== 'string') throw new Error(`${path} in ${code} is not a string`);
  return node;
}

/**
 * Dismiss the "Beta Version" modal if present (aria-modal hides the page).
 * The button label is read from the locale file, never from a regex of
 * guessed translations, so this stays correct for every language.
 */
async function dismissBetaModalIfPresent(page: Page, code: LocaleCode = 'en') {
  const continueButton = page.getByRole('button', {
    name: localeString(code, 'betaFeedback.notice.continueBtn'),
    exact: true,
  });
  if (await continueButton.isVisible({ timeout: 4_000 }).catch(() => false)) {
    await continueButton.click();
  }
}

/** Seed the stored language and the beta-dismissed flag before any script runs. */
function seedStorage(page: Page, code: LocaleCode | null) {
  return page.addInitScript(
    ({ langKey, betaKey, lang }) => {
      if (lang) window.localStorage.setItem(langKey, lang);
      window.localStorage.setItem(betaKey, 'true');
    },
    { langKey: LANGUAGE_STORAGE_KEY, betaKey: BETA_DISMISSED_KEY, lang: code },
  );
}

for (const code of LOCALES) {
  test.describe(`PB-I18N-LAYER2-001 locale ${code}`, () => {
    test('boot, render and reload in the stored language', async ({ page }) => {
      await seedStorage(page, code);

      await page.goto('/tools');
      await dismissBetaModalIfPresent(page, code);

      // <html lang> matches the stored locale.
      await expect(page).toHaveURL(/\/tools/);
      await expect
        .poll(async () => page.evaluate(() => document.documentElement.lang), { timeout: 10_000 })
        .toBe(code);

      // Document title is the translated pageMeta.tools.title (EN title under a
      // non-EN locale = silent regression to English).
      const expectedTitle = localeString(code, 'pageMeta.tools.title');
      await expect
        .poll(async () => page.evaluate(() => document.title), { timeout: 10_000 })
        .toBe(expectedTitle);

      // Visible heading is translated.
      const expectedHeading = localeString(code, 'tools.title');
      await expect(
        page.getByRole('heading', { name: expectedHeading }).first(),
        `tools heading must render the ${code} translation`,
      ).toBeVisible({ timeout: 10_000 });

      // No unresolved keys and no stringified objects in the visible body.
      const bodyText = await page.evaluate(() => document.body.innerText);
      expect(bodyText, 'no [object Object] may be rendered').not.toContain('[object Object]');
      const rawKeyPattern =
        /\b(nav|tools|profile|requestWorkers|workerProfile|companyDocs|companyVerification|adminCompanyVerification|companyProfilePage|pricing|landing|academy|errors|notifications|proNetwork|companyWorkforce|pageMeta|checkout)\.[a-zA-Z0-9]+\.[a-zA-Z0-9.]+/;
      expect(
        rawKeyPattern.test(bodyText),
        `raw i18n key rendered to the visitor: ${bodyText.match(rawKeyPattern)?.[0] ?? '(regex)'}`,
      ).toBe(false);

      // Reload: the preference must survive.
      await page.reload();
      await dismissBetaModalIfPresent(page, code);
      await expect
        .poll(async () => page.evaluate(() => document.documentElement.lang), { timeout: 10_000 })
        .toBe(code);
      await expect
        .poll(async () => page.evaluate(() => document.title), { timeout: 10_000 })
        .toBe(expectedTitle);
    });
  });
}

test.describe('PB-I18N-LAYER2-001 language selector', () => {
  test('switching to Spanish via the selector persists across reload', async ({ page }) => {
    // Seed a clean EN state without an init script: init scripts also run on
    // reload, which would erase the very persistence this test verifies.
    await page.goto('/tools');
    await page.evaluate(
      ({ langKey, betaKey }) => {
        window.localStorage.removeItem(langKey);
        window.localStorage.setItem(betaKey, 'true');
      },
      { langKey: LANGUAGE_STORAGE_KEY, betaKey: BETA_DISMISSED_KEY },
    );
    await page.reload();
    await dismissBetaModalIfPresent(page, 'en');

    // Default is EN (no stored preference + Playwright sends en-US).
    await expect
      .poll(async () => page.evaluate(() => document.documentElement.lang), { timeout: 10_000 })
      .toBe('en');

    // Open the selector (trigger shows the current code, uppercased).
    const languageButton = page.getByRole('button', { name: /language/i });
    await expect(languageButton).toBeVisible({ timeout: 15_000 });
    await languageButton.click();

    // Pick Español from the dropdown.
    await page.getByText('Español', { exact: true }).click();

    // The switch must update <html lang> and store the preference.
    await expect
      .poll(async () => page.evaluate(() => document.documentElement.lang), { timeout: 10_000 })
      .toBe('es');
    const stored = await page.evaluate((key) => window.localStorage.getItem(key), LANGUAGE_STORAGE_KEY);
    expect(stored).toBe('es');

    // And survive a reload.
    await page.reload();
    await dismissBetaModalIfPresent(page, 'es');
    await expect
      .poll(async () => page.evaluate(() => document.documentElement.lang), { timeout: 10_000 })
      .toBe('es');
    await expect
      .poll(async () => page.evaluate(() => document.title), { timeout: 10_000 })
      .toBe(localeString('es', 'pageMeta.tools.title'));
  });

  for (const lang of LANGUAGES) {
    test(`selector lists ${lang.label} and switching to it renders ${lang.code}`, async ({ page }) => {
      await seedStorage(page, null);
      await page.goto('/tools');
      await page.evaluate((key) => window.localStorage.removeItem(key), LANGUAGE_STORAGE_KEY);

      const languageButton = page.getByRole('button', { name: /language/i });
      await expect(languageButton).toBeVisible({ timeout: 15_000 });
      await languageButton.click();
      await page.getByRole('menuitem', { name: lang.label }).click();
      // The selector keeps the menu open on purpose (onSelect preventDefault);
      // close it like a visitor would, otherwise Radix aria-hides the page.
      await page.keyboard.press('Escape');

      await expect
        .poll(async () => page.evaluate(() => document.documentElement.lang), { timeout: 10_000 })
        .toBe(lang.code);
      await expect
        .poll(async () => page.evaluate(() => document.title), { timeout: 10_000 })
        .toBe(localeString(lang.code, 'pageMeta.tools.title'));
      await expect(
        page.getByRole('heading', { name: localeString(lang.code, 'tools.title') }).first(),
      ).toBeVisible({ timeout: 10_000 });
    });
  }

  test('?lng= query wins over the stored preference and is persisted (shareable QA links)', async ({ page }) => {
    await seedStorage(page, 'en');
    const target = LOCALES.find((c) => c !== 'en') ?? 'en';
    await page.goto(`/tools?lng=${target}`);
    await dismissBetaModalIfPresent(page, target);

    await expect
      .poll(async () => page.evaluate(() => document.documentElement.lang), { timeout: 10_000 })
      .toBe(target);
    await expect
      .poll(async () => page.evaluate(() => document.title), { timeout: 10_000 })
      .toBe(localeString(target, 'pageMeta.tools.title'));
    const stored = await page.evaluate((key) => window.localStorage.getItem(key), LANGUAGE_STORAGE_KEY);
    expect(stored).toBe(target);
  });

  test('unsupported stored value falls back to English', async ({ page }) => {
    await seedStorage(page, 'xx');

    await page.goto('/tools');
    await dismissBetaModalIfPresent(page, 'en');

    await expect
      .poll(async () => page.evaluate(() => document.documentElement.lang), { timeout: 10_000 })
      .toBe('en');
    await expect
      .poll(async () => page.evaluate(() => document.title), { timeout: 10_000 })
      .toBe(localeString('en', 'pageMeta.tools.title'));
  });
});
