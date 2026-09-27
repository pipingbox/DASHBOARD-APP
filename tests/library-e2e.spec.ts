import { test, expect, type Page, type Request } from '@playwright/test';

/**
 * PB-LIBRARY-COMPLETE-001 — Library V1 browser E2E (Stream B).
 *
 * Runs against the preview/prod Worker (baseURL from playwright.config).
 * The Library is a PUBLIC route (/tools?t=accessories-library) backed by a
 * fully static, bundled catalog — no auth, no Supabase, no storage calls.
 *
 * Scenarios pinned here (GO Library V1 §11):
 *   L1  Library loads (boot, no blank screen, no JS exceptions).
 *   L2  Catalog renders the expected Beta-visible content (56 publishable
 *       components incl. the WP6 bolting/grooved and WP7 pipe families).
 *   L3  Search finds a known item.
 *   L4  Search with no result shows the correct empty state.
 *   L5  Family filter behaves correctly.
 *   L6  Opening an item reaches the correct detail (deep-link ?c=).
 *   L7  Broken asset does NOT appear as success — access error event fires.
 *   L8  Navigation back to Library remains usable (catalog still rendered).
 *   L9  Analytics: usage events fire with approved closed payloads.
 *   L10 No PII leaks through instrumentation payloads.
 *   L11 Public route: no auth required, no privileged URLs in the DOM.
 *   L12 Mobile viewport: Library remains usable (tabs become a select).
 *
 * PostHog events are captured by intercepting the ingest endpoint — the
 * remote endpoint may be unreachable in CI, so interception happens at the
 * request layer (same discipline as the GA4 dataLayer checks).
 */

const LIBRARY_URL = '/tools?t=accessories-library';

const TXT = {
  title: 'Biblioteca de Accesorios',
  searchPlaceholder: /Buscar por nombre, tipo, material o norma/,
  emptyTitle: 'Ningún componente coincide',
  clearFilters: 'Limpiar filtros',
  knownItem: 'Codo 90° Long Radius Butt Weld ASME B16.',
  knownItemId: 'PB-COMP-ELBOW-90-LR-BW-ASME-B16-9',
  butterflyId: 'PB-COMP-VALVE-BUTTERFLY-API-609',
};

interface CapturedEvent {
  event: string;
  properties?: Record<string, unknown>;
}

/** Intercept PostHog ingest (single + batch) and collect captured events. */
function collectPostHogEvents(page: Page, sink: CapturedEvent[]) {
  return page.route(/(posthog\.com|posthog\.pipingbox)/, async (route) => {
    const request = route.request();
    try {
      const body = request.postData() ?? '';
      // PostHog sends either a single event or { batch: [...] }.
      const parsed = JSON.parse(body) as { event?: string; properties?: Record<string, unknown>; batch?: CapturedEvent[] };
      if (Array.isArray(parsed.batch)) sink.push(...parsed.batch);
      else if (parsed.event) sink.push(parsed as CapturedEvent);
    } catch {
      // Non-JSON PostHog traffic (feature flags, decide) — ignore.
    }
    await route.fulfill({ status: 200, contentType: 'application/json', body: '{"status":1}' });
  });
}

/** posthog-js batches captures (default flush interval ~10s). */
async function waitForPostHogFlush(page: Page, ms = 12000) {
  await page.waitForTimeout(ms);
}

async function openLibrary(page: Page) {
  const errors: string[] = [];
  page.on('pageerror', (err) => errors.push(err.message));
  await page.addInitScript(() => {
    localStorage.setItem('pipingbox_language', 'es');
    localStorage.setItem('pipingbox_beta_dismissed', 'true');
  });
  const response = await page.goto(LIBRARY_URL, { waitUntil: 'domcontentloaded' });
  expect(response?.status(), 'Library route must be served').toBeLessThan(400);
  await page.waitForTimeout(500);
  return errors;
}

const libraryEvents = (sink: CapturedEvent[]) => sink.filter((e) => e.event?.startsWith('library_'));

test.describe('Library V1 E2E (PB-LIBRARY-COMPLETE-001)', () => {
  test('L1+L2: Library loads and renders the Beta-visible catalog', async ({ page }) => {
    const errors = await openLibrary(page);
    await expect(page.getByRole('heading', { name: TXT.title }).first()).toBeVisible();
    // Catalog totals footer: 56 publishable components.
    const body = await page.locator('body').innerText();
    expect(body).toContain('56');
    // WP6/WP7 families are Beta-visible: bolting, grooved, pipes.
    expect(body).toMatch(/ESPÁRRAGO|ESPARRAGO|Stud/i);
    expect(body).toMatch(/ranurad|grooved/i);
    expect(body).toMatch(/TUBO|PIPE/i);
    const bootErrors = errors.filter((e) => !e.includes('routes-scanner'));
    expect(bootErrors, `Uncaught JS errors:\n${bootErrors.join('\n')}`).toEqual([]);
  });

  test('L3: search finds a known item', async ({ page }) => {
    await openLibrary(page);
    await page.getByPlaceholder(TXT.searchPlaceholder).fill('mariposa');
    await expect(page.getByText(/Válvula de Mariposa API 609/).first()).toBeVisible();
    // Unrelated families are filtered out of the result set.
    await expect(page.getByText(TXT.knownItem)).toHaveCount(0);
  });

  test('L4: search with no result shows the correct empty state', async ({ page }) => {
    await openLibrary(page);
    await page.getByPlaceholder(TXT.searchPlaceholder).fill('zzz-no-existe-zzz');
    await expect(page.getByText(TXT.emptyTitle)).toBeVisible();
    await expect(page.getByRole('button', { name: TXT.clearFilters }).first()).toBeVisible();
  });

  test('L5: family filter narrows the catalog correctly', async ({ page }) => {
    await openLibrary(page);
    // Family filters are chips with technical labels (Gaskets, Flanges…).
    await page.getByRole('button', { name: /^Gaskets/ }).click();
    await expect(page.getByText(/Gasket/i).first()).toBeVisible();
    await expect(page.getByText(TXT.knownItem)).toHaveCount(0);
    await expect(page.getByRole('button', { name: TXT.clearFilters }).first()).toBeVisible();
    // Clear restores the full catalog.
    await page.getByRole('button', { name: TXT.clearFilters }).first().click();
    await expect(page.getByText(TXT.knownItem).first()).toBeVisible();
  });

  test('L6: opening an item reaches its detail view with deep-link state', async ({ page }) => {
    await openLibrary(page);
    await page.getByText(TXT.knownItem).first().click();
    await expect(page).toHaveURL(new RegExp(`c=${TXT.knownItemId}`));
    // Detail renders the component name and its tab bar.
    await expect(page.getByRole('heading', { name: new RegExp('Codo 90° Long Radius') }).first()).toBeVisible();
  });

  test('L6b: deep link opens the detail directly', async ({ page }) => {
    await page.addInitScript(() => {
      localStorage.setItem('pipingbox_language', 'es');
      localStorage.setItem('pipingbox_beta_dismissed', 'true');
    });
    await page.goto(`${LIBRARY_URL}&c=${TXT.butterflyId}`, { waitUntil: 'domcontentloaded' });
    await expect(page.getByRole('heading', { name: /Válvula de Mariposa API 609/ }).first()).toBeVisible();
  });

  // Production ships opt_out_useragent_filter=false: posthog-js drops events
  // from HeadlessChrome client-side (GO §5). A non-bot UA lets the client
  // emit; the PostHog route interception fulfills locally, so no QA event is
  // ever delivered to the production project.
  test.describe('analytics emission (non-bot UA — bot filter satisfied)', () => {
    test.use({
      userAgent:
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
    });

    test('L7: a broken asset does NOT appear as success — access error is emitted', async ({ page }) => {
      const sink: CapturedEvent[] = [];
      await collectPostHogEvents(page, sink);
      // Break every catalog drawing asset for this run only.
      await page.route('**/catalog/2d/**', (route) => route.fulfill({ status: 404, body: 'gone' }));
      await openLibrary(page);
      await page.getByText(TXT.knownItem).first().click();
      // Wait for the broken-img handler first, then for the PostHog batch flush.
      await page.waitForTimeout(1500);
      await waitForPostHogFlush(page);
      // The app never renders a broken image as a successful sheet.
      const accessErrors = libraryEvents(sink).filter((e) => e.event === 'library_access_error');
      expect(accessErrors.length, 'library_access_error must fire for the broken drawing').toBeGreaterThan(0);
      expect(accessErrors[0].properties?.component_id).toBe(TXT.knownItemId);
      expect(accessErrors[0].properties?.reason_code).toBe('asset_load_failed');
    });

    test('L8: back navigation returns to a usable catalog', async ({ page }) => {
      await openLibrary(page);
      await page.getByText(TXT.knownItem).first().click();
      await expect(page).toHaveURL(/c=PB-COMP/);
      await page.goBack();
      await expect(page.getByRole('heading', { name: TXT.title }).first()).toBeVisible();
      await expect(page.getByText(TXT.knownItem).first()).toBeVisible();
      // Catalog still interactive after back.
      await page.getByPlaceholder(TXT.searchPlaceholder).fill('mariposa');
      await expect(page.getByText(/Válvula de Mariposa API 609/).first()).toBeVisible();
    });

    test('L9+L10: usage analytics fire with closed payloads and no PII', async ({ page }) => {
      const sink: CapturedEvent[] = [];
      await collectPostHogEvents(page, sink);
      await openLibrary(page);
      await page.waitForTimeout(400);

      // 1) search (with a PII-shaped term) — debounced emission, length only
      await page.getByPlaceholder(TXT.searchPlaceholder).fill('ana.garcia@empresa.com brida');
      await page.waitForTimeout(1200);

      // 2) empty-result query (asserted via library_empty_result)
      await page.getByPlaceholder(TXT.searchPlaceholder).fill('zzz-no-existe-zzz');
      await page.waitForTimeout(1200);

      // 3) clear + family chip → filter_selected with closed enum
      await page.getByRole('button', { name: TXT.clearFilters }).first().click();
      await page.getByRole('button', { name: /^Gaskets/ }).click();
      await page.waitForTimeout(300);

      // 4) clear + open item → item_opened with closed PB-COMP id
      await page.getByRole('button', { name: TXT.clearFilters }).first().click();
      await page.getByText(TXT.knownItem).first().click();
      await page.waitForTimeout(300);

      // 5) explicit 2D preview switch (size tab) → resource_action preview_2d
      const sizeButtons = page.locator('button.font-mono');
      if ((await sizeButtons.count()) > 1) {
        await sizeButtons.nth(1).click();
        await page.waitForTimeout(200);
      }

      // 6) download → resource_action download_2d/download_3d.
      // The detail opens in field mode ("Modo obra") with a single tab; the
      // Downloads tab lives in engineering mode.
      await page.getByRole('button', { name: /Ver ficha completa/i }).click();
      await page.getByRole('button', { name: /^Descargas$/ }).click();
      const dlLink = page.locator('a[download]').first();
      await expect(dlLink).toBeVisible();
      await dlLink.click();
      await page.waitForTimeout(300);

      // posthog-js batches captures — wait for the flush, then assert everything.
      await waitForPostHogFlush(page);
      const events = libraryEvents(sink);
      const names = events.map((e) => e.event);
      for (const required of [
        'library_viewed',
        'library_search_performed',
        'library_empty_result',
        'library_filter_selected',
        'library_item_opened',
      ]) {
        expect(names, `missing ${required}`).toContain(required);
      }

      const viewed = events.find((e) => e.event === 'library_viewed');
      expect(viewed?.properties?.results_count).toBe(56);
      expect(Object.keys(viewed?.properties ?? {})).toEqual(
        expect.arrayContaining(['results_count', 'environment', 'app_version']),
      );

      const searches = events.filter((e) => e.event === 'library_search_performed');
      const piiSearch = searches.find((e) => e.properties?.query_length === 28);
      expect(piiSearch, 'search event carries only the query length').toBeTruthy();
      expect(JSON.stringify(piiSearch?.properties)).not.toContain('ana.garcia@empresa.com');
      expect(JSON.stringify(piiSearch?.properties)).not.toContain('brida');

      const filters = events.filter((e) => e.event === 'library_filter_selected');
      expect(filters[0]?.properties?.filter_type).toBe('family');
      expect(filters[0]?.properties?.filter_value).toBe('gaskets');

      const opened = events.filter((e) => e.event === 'library_item_opened');
      expect(opened[0]?.properties?.component_id).toBe(TXT.knownItemId);

      const actions = events.filter((e) => e.event === 'library_resource_action');
      const actionTypes = actions.map((e) => e.properties?.resource_type);
      expect(actionTypes).toContain('preview_2d');
      expect(actionTypes.some((t) => t === 'download_2d' || t === 'download_3d')).toBe(true);

      // L10 — global PII assertion across EVERY library payload captured.
      for (const ev of events) {
        const json = JSON.stringify(ev.properties ?? {});
        expect(json).not.toMatch(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i);
        expect(json).not.toContain('ana.garcia');
      }
    });
  });

  test('L11: public route without auth and no privileged URLs in the DOM', async ({ page }) => {
    await page.context().clearCookies();
    await openLibrary(page);
    await expect(page.getByRole('heading', { name: TXT.title }).first()).toBeVisible();
    const html = await page.content();
    // No Supabase service-role key, storage signed URLs or internal tokens.
    expect(html).not.toContain('service_role');
    expect(html).not.toContain('supabase.co/storage');
    expect(html).not.toMatch(/eyJ[A-Za-z0-9_-]{20,}\./); // no JWT-shaped strings
  });

  test('L12: mobile viewport keeps the Library usable', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await openLibrary(page);
    await expect(page.getByRole('heading', { name: TXT.title }).first()).toBeVisible();
    await page.getByText(TXT.knownItem).first().click();
    await expect(page).toHaveURL(/c=PB-COMP/);
    // Detail renders at mobile width (heading visible, no horizontal overflow crash).
    await expect(page.getByRole('heading', { name: /Codo 90° Long Radius/ }).first()).toBeVisible();
  });
});
