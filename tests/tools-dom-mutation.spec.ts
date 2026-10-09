import { test, expect, devices } from '@playwright/test';
import { gunzipSync } from 'node:zlib';

/**
 * PB-UI-DOM-REMOVECHILD-RESIDUAL-001 — /tools under translator-grade DOM
 * mutation (Chrome Android class).
 *
 * Production incidents (app_version d969027, Chrome/Android/mobile, Regular
 * traffic): PB-ERR-WQ9NR9 + PB-ERR-JWCAD4 on /tools 2026-10-04 (~2 ms apart,
 * same distinct_id — one incident captured twice by the double
 * componentDidCatch; deduplication is covered by tests/observability.spec.ts).
 *
 * Root cause (reproduced on production before the fix): the premium banner
 * upgrade buttons rendered [conditional Loader2 icon + BARE text label].
 * Auto-translate font-wraps (detaches) the bare label; the checkoutLoading
 * transition then inserts the icon anchored at that detached text node →
 * NotFoundError insertBefore (same family as removeChild). The same latent
 * pattern existed in CertificationsSection/DocumentsSection (fixed too).
 *
 * /tools is PUBLIC (PB-WEB-005): this regression needs no QA account and no
 * DB writes. It drives, under the translate simulation, at mobile viewport
 * (production evidence is Chrome Android):
 *   1. catalog mount (mutate at paint + after load)
 *   2. catalog → tool detail → back (full view swap)
 *   3. premium banner upgrade click (icon insert + label swap — the crash)
 *   4. wall-thickness calculate (saving label swap)
 *
 * Asserts: no ErrorBoundary, zero NotFoundError/insertBefore/removeChild
 * browser errors, zero app_error on the PostHog wire, zero PII.
 */

const TRANSLATE_SIM = `(() => {
  const root = document.getElementById('root');
  if (!root) return 0;
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  const nodes = [];
  while (walker.nextNode()) if (walker.currentNode.nodeValue.trim()) nodes.push(walker.currentNode);
  for (const n of nodes) {
    if (n.parentNode && n.parentNode.tagName === 'FONT') continue;
    const font = document.createElement('font');
    font.style.verticalAlign = 'inherit';
    font.textContent = n.nodeValue;
    n.parentNode.replaceChild(font, n);
  }
  return nodes.length;
})()`;

// Production evidence is Chrome/Android mobile.
test.use({ ...devices['Pixel 7'] });

test.describe('PB-UI-DOM-REMOVECHILD-RESIDUAL-001 /tools under translator-grade DOM mutation', () => {
  test('mount + view swap + upgrade click + calculate survive Chrome-translate DOM mutation; zero app_error', async ({
    page,
  }) => {
    test.setTimeout(120_000);

    // Anonymous session determinism: same language every run.
    await page.addInitScript(() => {
      try {
        localStorage.setItem('pipingbox_language', 'es');
      } catch {
        /* storage unavailable */
      }
    });

    const browserErrors: string[] = [];
    page.on('console', (msg) => {
      if (msg.type() === 'error') browserErrors.push(msg.text().slice(0, 300));
    });
    page.on('pageerror', (err) => browserErrors.push('pageerror: ' + String(err).slice(0, 300)));

    const payloads: Buffer[] = [];
    page.on('request', (req) => {
      if (req.url().includes('posthog.com') && req.method() === 'POST') {
        const buf = req.postDataBuffer();
        if (buf) payloads.push(buf);
      }
    });

    const decodeAll = (): Record<string, unknown>[] =>
      payloads.flatMap((buf) => {
        let text: string;
        try {
          text = gunzipSync(buf).toString('utf8');
        } catch {
          text = buf.toString('utf8');
        }
        try {
          const json = JSON.parse(text) as Record<string, unknown> & { batch?: unknown[] };
          return (json.batch ?? [json]) as Record<string, unknown>[];
        } catch {
          return [];
        }
      });

    const boundaryVisible = () =>
      page
        .getByText(/Código de incidencia|Incident code/i)
        .first()
        .isVisible()
        .catch(() => false);

    const domErrors = () =>
      browserErrors.filter(
        (e) => e.includes('NotFoundError') || e.includes('removeChild') || e.includes('insertBefore'),
      );

    // ── 1. Catalog mount, mutate at paint + after load ──────────────────
    await page.goto('/tools');
    await page.locator('#root').first().waitFor({ state: 'attached', timeout: 15_000 });
    // The crash window is early paint; mutate as soon as the root exists.
    const atPaint = await page.evaluate(TRANSLATE_SIM);
    await page.waitForFunction(
      () => document.querySelectorAll('button.group').length >= 10,
      undefined,
      { timeout: 20_000 },
    );
    const afterLoad = await page.evaluate(TRANSLATE_SIM);
    expect(await boundaryVisible(), 'catalog mount must not crash').toBe(false);
    expect(domErrors(), 'no DOM reconciliation errors on mount').toHaveLength(0);

    // ── 2. Catalog → tool detail → back (full view swap) ────────────────
    // Locale-independent: match by stable data-tool-key attribute, not
    // translated copy. The regex this replaced assumed English/legacy
    // tool names and silently matched zero cards once es.json renamed
    // "branch-layout" to "Calculadora de Injertos" (PB-GROWTH-GATE-FINAL-001).
    await page.evaluate(() => {
      const card = document.querySelector('button[data-tool-key="branch-layout"]') as HTMLElement | null;
      if (card) card.click();
    });
    await page.waitForTimeout(1500);
    await page.evaluate(TRANSLATE_SIM); // translate the newly mounted tool view
    await expect(page).toHaveURL(/t=/, { timeout: 10_000 });
    // back to catalog (detail subtree unmounts under mutation)
    await page.evaluate(() => {
      const back = [...document.querySelectorAll('button')].find((b) =>
        /volver al cat|back to catalog/i.test(b.textContent ?? ''),
      );
      if (back) back.click();
    });
    await page.waitForTimeout(1500);
    await page.evaluate(TRANSLATE_SIM);
    expect(await boundaryVisible(), 'view swap must not crash').toBe(false);
    expect(domErrors(), 'no DOM reconciliation errors on view swap').toHaveLength(0);

    // ── 3. Premium banner upgrade click (icon insert + label swap) ──────
    // This is the exact reproduced crash: anonymous click → checkoutLoading
    // inserts Loader2 anchored at the (font-wrapped) bare label → NotFoundError.
    await page.evaluate(() => {
      const btns = [...document.querySelectorAll('button')];
      const b = btns.find((x) => /mensual|monthly/i.test(x.textContent ?? '') && x.className.includes('border'));
      if (b) b.click();
    });
    // Anonymous users get redirected to /login?next=/tools after the swap.
    await page.waitForTimeout(4000);
    expect(domErrors(), 'upgrade click must not throw removeChild/insertBefore').toHaveLength(0);

    // ── 4. Wall-thickness calculate (saving label swap) ─────────────────
    await page.goto('/tools?t=wall-thickness');
    await page.locator('#root').first().waitFor({ state: 'attached', timeout: 15_000 });
    await page.waitForTimeout(1500);
    const toolMutated = await page.evaluate(TRANSLATE_SIM);
    await page.evaluate(() => {
      const btns = [...document.querySelectorAll('button')];
      const b = btns.find((x) => /calcular|calculate/i.test(x.textContent ?? ''));
      if (b) b.click();
    });
    await page.waitForTimeout(3000);
    expect(await boundaryVisible(), 'calculate must not crash').toBe(false);
    expect(domErrors(), 'no DOM reconciliation errors on calculate').toHaveLength(0);

    // ── 5. Wire assertions: zero app_error, zero PII ────────────────────
    await page.waitForTimeout(4500); // past the 3s batch flush
    const decoded = decodeAll();
    const toolsErrors = decoded.filter((e) => {
      if (e.event !== 'app_error') return false;
      const p = (e.properties ?? {}) as Record<string, unknown>;
      return String(p.route ?? '').includes('/tools');
    });
    expect(
      toolsErrors,
      `zero app_error on /tools allowed; got ${JSON.stringify(toolsErrors.map((e) => (e.properties as Record<string, unknown>)?.incident_code))}`,
    ).toHaveLength(0);
    for (const e of decoded) {
      expect(JSON.stringify(e)).not.toContain('@');
    }

    console.log(
      `PASS: /tools translate-sim nodes (paint=${atPaint}, catalog=${afterLoad}, tool=${toolMutated}), app_error=0, zero PII`,
    );
  });
});
