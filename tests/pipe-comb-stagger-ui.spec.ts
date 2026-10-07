import { expect, test } from '@playwright/test';
import { solvePipeCombStagger } from '../app/frontend/src/tools/core/geometry/pipe-comb-stagger';
import { buildPipeCombStaggerScreenLayout } from '../app/frontend/src/tools/prefabrication/pipe-comb/pipe-comb-stagger-svg';

/**
 * PB-PIPE-COMB-CORRECTION-001 — P2
 * Genuine pipe comb (peines de tubería) UI: numeric + SVG contract.
 *
 * Expected numbers are NOT hand-written: they are the genuine Tubero source
 * corpus values (REF-01..REF-05) validated 5/5 by the P1 kernel, which the
 * panel calls exclusively (the UI never re-implements the geometry).
 */

const TOOL_URL = '/tools?t=pipe-comb&lng=en';
const TOOL_URL_ES = '/tools?t=pipe-comb&lng=es';

async function openTool(page: import('@playwright/test').Page, url: string = TOOL_URL) {
  await page.goto(url);
  /* The Beta modal mounts after hydration; dismiss it deterministically so
     it never intercepts pointer events (locale-independent selector). */
  const betaDialog = page.locator('div[role="dialog"][data-state="open"]');
  const shown = await betaDialog.waitFor({ state: 'visible', timeout: 10_000 }).then(() => true).catch(() => false);
  if (shown) {
    await betaDialog.getByRole('button', { name: /continuar|continue/i }).click();
    await betaDialog.waitFor({ state: 'hidden' });
  }
}

function metric(page: import('@playwright/test').Page, key: string) {
  return page.locator(`[data-testid="pipe-comb-stagger-metric"][data-metric="${key}"]`);
}

function setValues(page: import('@playwright/test').Page, values: Partial<Record<'count' | 'di' | 'df' | 'angle', string>>) {
  const map = {
    count: '#pipe-comb-pipe-count',
    di: '#pipe-comb-initial-spacing',
    df: '#pipe-comb-final-spacing',
    angle: '#pipe-comb-angle',
  } as const;
  return (async () => {
    for (const [key, selector] of Object.entries(map)) {
      const v = values[key as keyof typeof values];
      if (v === undefined) continue;
      await page.locator(selector).fill(v);
    }
  })();
}

test('A/B/C: tool opens with title and genuine REF-01 defaults', async ({ page }) => {
  await openTool(page);
  await expect(page.getByRole('heading', { name: 'Pipe Comb' })).toBeVisible();
  await expect(page.locator('#pipe-comb-pipe-count')).toHaveValue('4');
  await expect(page.locator('#pipe-comb-initial-spacing')).toHaveValue('200');
  await expect(page.locator('#pipe-comb-final-spacing')).toHaveValue('400');
  await expect(page.locator('#pipe-comb-angle')).toHaveValue('45');
  /* Core form must not expose the old advanced fields. */
  await expect(page.getByText('NPS', { exact: true })).toHaveCount(0);
  await expect(page.getByText('Schedule', { exact: true })).toHaveCount(0);
  await expect(page.getByText('CLR', { exact: true })).toHaveCount(0);
});

test('D/E/F/G: REF-01 results, table and cumulative values', async ({ page }) => {
  await openTool(page);
  await expect(metric(page, 'cotaA')).toHaveText('365.69 mm');
  await expect(metric(page, 'totalStagger')).toHaveText('1097.06 mm');
  await expect(metric(page, 'angle')).toHaveText('45°');
  await expect(metric(page, 'direction')).toHaveText('Stagger forward');
  const rows = page.locator('[data-testid="pipe-comb-stagger-row"]');
  await expect(rows).toHaveCount(4);
  await expect(rows.nth(0).locator('td').nth(1)).toHaveText('0 mm');
  await expect(rows.nth(0).locator('td').nth(2)).toHaveText('Reference');
  await expect(rows.nth(3).locator('td').nth(1)).toHaveText('1097.06 mm');
  await expect(rows.nth(3).locator('td').nth(2)).toHaveText('365.69 mm');
});

test('H/I: SVG present with Di/Df/A/theta annotations', async ({ page }) => {
  await openTool(page);
  const svg = page.locator('[data-testid="pipe-comb-stagger-svg"]');
  await expect(svg).toBeVisible();
  await expect(svg).toHaveAttribute('data-direction', 'positive');
  await expect(svg).toHaveAttribute('data-pipe-count', '4');
  await expect(svg.locator('[data-testid="pipe-comb-dim-initial"]')).toHaveText('Di 200 mm');
  await expect(svg.locator('[data-testid="pipe-comb-dim-final"]')).toHaveText('Df 400 mm');
  await expect(svg.locator('[data-testid="pipe-comb-dim-stagger"]')).toHaveText('A 365.69 mm');
  await expect(svg.locator('[data-testid="pipe-comb-angle-label"]')).toHaveText('Angle 45°');
  await expect(svg.locator('[data-testid="pipe-comb-pipe-label"]')).toHaveCount(4);
});

test('J: equal numerical spacing still staggers (REF-02)', async ({ page }) => {
  await openTool(page);
  await setValues(page, { di: '200', df: '200' });
  await expect(metric(page, 'cotaA')).toHaveText('82.84 mm');
  await expect(metric(page, 'direction')).toHaveText('Stagger forward');
});

test('K: negative stagger keeps the sign and flips the drawing (REF-03)', async ({ page }) => {
  await openTool(page);
  const svg = page.locator('[data-testid="pipe-comb-stagger-svg"]');
  await expect(svg).toHaveAttribute('data-direction', 'positive');
  await setValues(page, { di: '400', df: '200' });
  await expect(metric(page, 'cotaA')).toHaveText('-117.16 mm');
  await expect(metric(page, 'direction')).toHaveText('Stagger backward');
  await expect(svg).toHaveAttribute('data-direction', 'negative');
  /* The drawing itself must differ, not only the sign: with negative A the
     elbow screen-Y ordering is reversed (elbows stagger +u in the model,
     which flips on the SVG axis). */
  const ys = await svg.evaluate((el: SVGSVGElement) =>
    Array.from(el.querySelectorAll('circle')).map((c) => Number(c.getAttribute('cy'))),
  );
  expect(ys.length).toBe(4);
  /* Screen Y grows downward; model E_k.y = −k·A = +k·|A| increases with k,
     so screen cy must strictly DECREASE for the negative case. */
  const ascending = ys.every((y, i) => i === 0 || y < ys[i - 1]);
  expect(ascending).toBe(true);
});

test('L: 30 degree preset gives REF-04', async ({ page }) => {
  await openTool(page);
  await page.locator('[data-testid="pipe-comb-preset-30"]').click();
  await expect(page.locator('#pipe-comb-angle')).toHaveValue('30');
  await expect(metric(page, 'cotaA')).toHaveText('453.59 mm');
});

test('M: 90 degree preset gives REF-05', async ({ page }) => {
  await openTool(page);
  await page.locator('[data-testid="pipe-comb-preset-90"]').click();
  await expect(metric(page, 'cotaA')).toHaveText('400 mm');
  const svg = page.locator('[data-testid="pipe-comb-stagger-svg"]');
  await expect(svg).toBeVisible();
  await expect(svg).toHaveAttribute('data-direction', 'positive');
});

test('N: custom angle 37 degrees works', async ({ page }) => {
  await openTool(page);
  await setValues(page, { angle: '37' });
  await expect(page.locator('[data-testid="pipe-comb-error"]')).toHaveCount(0);
  await expect(metric(page, 'angle')).toHaveText('37°');
  const text = await metric(page, 'cotaA').textContent();
  expect(text).toMatch(/^3\d\d\.\d\d mm$/);
});

test('O: 12 pipes render 12 rows and a finite SVG', async ({ page }) => {
  await openTool(page);
  await setValues(page, { count: '12' });
  await expect(page.locator('[data-testid="pipe-comb-stagger-row"]')).toHaveCount(12);
  const svg = page.locator('[data-testid="pipe-comb-stagger-svg"]');
  await expect(svg).toHaveAttribute('data-pipe-count', '12');
  /* All 12 pipes are drawn; labels follow the documented no-overlap
     subset rule (P1 and PN always present). */
  await expect(svg.locator('circle')).toHaveCount(12);
  const labelTexts = await svg.locator('[data-testid="pipe-comb-pipe-label"]').allTextContents();
  expect(labelTexts.length).toBeGreaterThanOrEqual(2);
  expect(labelTexts.length).toBeLessThanOrEqual(12);
  expect(labelTexts[0]).toContain('1');
  expect(labelTexts[labelTexts.length - 1]).toContain('12');
  /* Visible labels must not overlap each other. */
  const boxes = await svg.locator('[data-testid="pipe-comb-pipe-label"]').evaluateAll((els) =>
    els.map((el) => {
      const r = el.getBoundingClientRect();
      return { x: r.x, y: r.y, w: r.width, h: r.height };
    }),
  );
  for (let i = 0; i < boxes.length; i++) {
    for (let j = i + 1; j < boxes.length; j++) {
      const overlap =
        boxes[i].x < boxes[j].x + boxes[j].w &&
        boxes[j].x < boxes[i].x + boxes[i].w &&
        boxes[i].y < boxes[j].y + boxes[j].h &&
        boxes[j].y < boxes[i].y + boxes[i].h;
      expect(overlap).toBe(false);
    }
  }
});

test('P: invalid spacing shows a localized error', async ({ page }) => {
  await openTool(page);
  await setValues(page, { di: '0' });
  const error = page.locator('[data-testid="pipe-comb-error"]');
  await expect(error).toBeVisible();
  await expect(error).toHaveAttribute('role', 'alert');
  await expect(error).toHaveAttribute('data-code', 'initial_spacing_positive');
  await expect(error).not.toHaveText('');
  await expect(page.locator('[data-testid="pipe-comb-stagger-results"] table')).toHaveCount(0);
});

test('Q: angle 0 is invalid', async ({ page }) => {
  await openTool(page);
  await setValues(page, { angle: '0' });
  const error = page.locator('[data-testid="pipe-comb-error"]');
  await expect(error).toBeVisible();
  await expect(error).toHaveAttribute('data-code', 'elbow_angle_range');
});

test('R: angle above 90 is invalid', async ({ page }) => {
  await openTool(page);
  await setValues(page, { angle: '90.0001' });
  const error = page.locator('[data-testid="pipe-comb-error"]');
  await expect(error).toBeVisible();
  await expect(error).toHaveAttribute('data-code', 'elbow_angle_range');
});

test('S: mm/in toggle preserves the physical result', async ({ page }) => {
  await openTool(page);
  await expect(metric(page, 'cotaA')).toHaveText('365.69 mm');
  await page.getByRole('button', { name: 'in', exact: true }).click();
  /* 365.685424... mm = 14.397 in — same physical value, converted. */
  await expect(metric(page, 'cotaA')).toHaveText('14.397 in');
  await expect(page.locator('#pipe-comb-initial-spacing')).toHaveValue('7.874');
  await page.getByRole('button', { name: 'mm', exact: true }).click();
  await expect(metric(page, 'cotaA')).toHaveText('365.69 mm');
  await expect(page.locator('#pipe-comb-initial-spacing')).toHaveValue('200');
});

test('T: navigating away and back through the catalog still renders', async ({ page }) => {
  await openTool(page);
  await expect(metric(page, 'cotaA')).toHaveText('365.69 mm');
  await page.getByRole('button', { name: 'Back to catalog' }).click();
  /* The catalog card itself carries an h3 "Pipe Comb", so assert on
     tool-specific markers instead of the heading. */
  await expect(page.locator('[data-testid="pipe-comb-stagger-results"]')).toHaveCount(0);
  await expect(page.locator('[data-testid="pipe-comb-stagger-svg"]')).toHaveCount(0);
  /* The catalog card's accessible name embeds its description text. */
  await page.getByRole('button', { name: /^Pipe Comb\b/ }).first().click();
  await expect(metric(page, 'cotaA')).toHaveText('365.69 mm');
  await expect(page.locator('[data-testid="pipe-comb-stagger-svg"]')).toBeVisible();
});

test('responsive: no page-level horizontal overflow at 320px / 390px', async ({ page }) => {
  for (const width of [320, 390]) {
    await page.setViewportSize({ width, height: 800 });
    await openTool(page);
    await expect(metric(page, 'cotaA')).toHaveText('365.69 mm');
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    expect(overflow).toBeLessThanOrEqual(1);
    /* Negative case: the signed value must not be clipped. */
    await setValues(page, { di: '400', df: '200' });
    await expect(metric(page, 'cotaA')).toHaveText('-117.16 mm');
    const overflowNeg = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    expect(overflowNeg).toBeLessThanOrEqual(1);
  }
});

/* ------------------------------------------------------------------ *
 * P2 FINAL REVIEW FIXES
 * ------------------------------------------------------------------ */

test('H1: unit toggle never changes the physical geometry (review repro)', async ({ page }) => {
  await openTool(page);
  await setValues(page, { di: '200.04', df: '100', angle: '60' });
  await expect(metric(page, 'cotaA')).toHaveText('-0.02 mm');
  await expect(metric(page, 'direction')).toHaveText('Stagger backward');

  /* mm -> in -> mm repeatedly: canonical value, A and direction must be
     bit-stable (previously drifted to 200 mm / "Elbows aligned"). */
  for (let i = 0; i < 5; i++) {
    await page.getByRole('button', { name: 'in', exact: true }).click();
    await page.getByRole('button', { name: 'mm', exact: true }).click();
  }
  await expect(page.locator('#pipe-comb-initial-spacing')).toHaveValue('200.04');
  await expect(page.locator('#pipe-comb-final-spacing')).toHaveValue('100');
  await expect(metric(page, 'cotaA')).toHaveText('-0.02 mm');
  await expect(metric(page, 'direction')).toHaveText('Stagger backward');
  await expect(metric(page, 'direction')).not.toHaveText('Elbows aligned');
});

test('H1: small valid values never collapse to zero across toggles', async ({ page }) => {
  await openTool(page);
  await setValues(page, { di: '0.5', df: '0.2', angle: '60' });
  await expect(metric(page, 'cotaA')).toHaveText('-0.06 mm');
  await expect(metric(page, 'direction')).toHaveText('Stagger backward');
  await page.getByRole('button', { name: 'in', exact: true }).click();
  const diIn = await page.locator('#pipe-comb-initial-spacing').inputValue();
  expect(Number(diIn)).toBeGreaterThan(0);
  await page.getByRole('button', { name: 'mm', exact: true }).click();
  await expect(page.locator('#pipe-comb-initial-spacing')).toHaveValue('0.5');
  await expect(metric(page, 'cotaA')).toHaveText('-0.06 mm');
  await expect(metric(page, 'direction')).toHaveText('Stagger backward');
});

test('decimal policy: point and comma accepted, ambiguous mixes rejected', async ({ page }) => {
  await openTool(page);
  await setValues(page, { angle: '22.5' });
  await expect(page.locator('[data-testid="pipe-comb-error"]')).toHaveCount(0);
  await expect(metric(page, 'angle')).toHaveText('22.5°');
  const withPoint = await metric(page, 'cotaA').textContent();

  await setValues(page, { angle: '22,5' });
  await expect(page.locator('[data-testid="pipe-comb-error"]')).toHaveCount(0);
  await expect(metric(page, 'angle')).toHaveText('22.5°');
  const withComma = await metric(page, 'cotaA').textContent();
  expect(withComma).toBe(withPoint);

  await setValues(page, { angle: '45', df: '300,5' });
  await expect(page.locator('[data-testid="pipe-comb-error"]')).toHaveCount(0);
  const withCommaDf = await metric(page, 'cotaA').textContent();
  await setValues(page, { df: '300.5' });
  const withPointDf = await metric(page, 'cotaA').textContent();
  expect(withPointDf).toBe(withCommaDf);

  await setValues(page, { df: '1.2,3' });
  const error = page.locator('[data-testid="pipe-comb-error"]');
  await expect(error).toBeVisible();
  await expect(error).toHaveAttribute('data-code', 'non_finite_input');
});

test('H2: angle arc path is centred on the elbow (real DOM path)', async ({ page }) => {
  await openTool(page);
  for (const deg of [15, 45, 60, 90]) {
    await setValues(page, { angle: String(deg) });
    await expect(metric(page, 'angle')).toHaveText(`${deg}°`);
    const data = await page.locator('[data-testid="pipe-comb-stagger-svg"]').evaluate((el) => {
      const path = el.querySelector('path').getAttribute('d') ?? '';
      const m = path.match(
        /M\s*([\d.eE+-]+)\s+([\d.eE+-]+)\s+A\s+([\d.eE+-]+)\s+([\d.eE+-]+)\s+0\s+0\s+([01])\s+([\d.eE+-]+)\s+([\d.eE+-]+)/,
      );
      if (!m) throw new Error(`arc path not found: ${path}`);
      const circle = el.querySelector('circle');
      return {
        sx: +m[1], sy: +m[2], r: +m[3], sweep: +m[5], ex: +m[6], ey: +m[7],
        cx: +circle.getAttribute('cx'), cy: +circle.getAttribute('cy'),
      };
    });
    expect(data.sweep).toBe(0);
    /* Reconstruct the arc centre (SVG 1.1 F.6.5, phi = 0). */
    const x1p = (data.sx - data.ex) / 2;
    const y1p = (data.sy - data.ey) / 2;
    const d2 = x1p * x1p + y1p * y1p;
    const coef = Math.sqrt(Math.max(0, (data.r * data.r - d2) / d2));
    const sign = 0 !== data.sweep ? 1 : -1; // largeArc=0; F.6.5 sign rule
    const ccx = (data.sx + data.ex) / 2 + sign * coef * y1p;
    const ccy = (data.sy + data.ey) / 2 - sign * coef * x1p;
    const tol = Math.max(1e-3, data.r * 1e-6); // 6-decimal path serialization bound
    expect(Math.hypot(ccx - data.cx, ccy - data.cy)).toBeLessThanOrEqual(tol);
    /* Aperture equals theta. */
    const a0 = Math.atan2(data.sy - ccy, data.sx - ccx);
    let delta = Math.atan2(data.ey - ccy, data.ex - ccx) - a0;
    while (delta > 0) delta -= 2 * Math.PI;
    expect(Math.abs((-delta * 180) / Math.PI - deg)).toBeLessThanOrEqual(1e-3);
  }
});

/* ------------------------------------------------------------------ *
 * H3 FINAL INTEGRATION — real-DOM annotation audit.
 *
 * Validates the rendered SVG, not just the pure helper: joint collision
 * coverage of Di, Df, A, angle and ALL visible pipe labels with real DOM
 * boxes (getBBox + screen CTM, so the text halo stroke never inflates
 * the boxes), after fonts, ResizeObserver and the final layout settle.
 * Records viewportWidth and svgRenderedWidth separately — the viewport
 * width is never treated as the SVG width.
 * ------------------------------------------------------------------ */

/** Wait until webfonts, ResizeObserver and the re-layout have settled. */
async function waitForStableLayout(page: import('@playwright/test').Page) {
  await page.evaluate(() => document.fonts.ready);
  const sig = async () =>
    page.locator('[data-testid="pipe-comb-stagger-svg"]').evaluate((el) => {
      const texts = Array.from(el.querySelectorAll('text'))
        .map((t) => `${t.getAttribute('x')},${t.getAttribute('y')},${t.getAttribute('text-anchor')}`)
        .join(';');
      return `${el.getAttribute('viewBox')}|${texts}`;
    });
  let prev = '';
  let cur = await sig();
  for (let i = 0; i < 25 && cur !== prev; i++) {
    prev = cur;
    await page.waitForTimeout(120);
    cur = await sig();
  }
}

interface DomAudit {
  minEffectivePx: number;
  overlapPairs: string[];
  outsideLabels: string[];
  svgRenderedWidth: number;
  viewportWidth: number;
  pageOverflow: number;
}

/** Collect real DOM boxes of every annotation and audit them. */
async function auditAnnotations(page: import('@playwright/test').Page): Promise<DomAudit> {
  return page.locator('[data-testid="pipe-comb-stagger-svg"]').evaluate((el) => {
    const vb = el.getAttribute('viewBox')?.split(/\s+/).map(Number) ?? [0, 0, 1, 1];
    const svgRect = el.getBoundingClientRect();
    const selectors: Array<[string, string]> = [
      ['Di', '[data-testid="pipe-comb-dim-initial"]'],
      ['Df', '[data-testid="pipe-comb-dim-final"]'],
      ['A', '[data-testid="pipe-comb-dim-stagger"]'],
      ['angle', '[data-testid="pipe-comb-angle-label"]'],
      ['pipe', '[data-testid="pipe-comb-pipe-label"]'],
    ];
    const boxes: Array<{ name: string; x: number; y: number; w: number; h: number }> = [];
    const fontSizes: number[] = [];
    for (const [name, sel] of selectors) {
      el.querySelectorAll<SVGTextElement>(sel).forEach((t, idx) => {
        // getBBox + screen CTM: glyph box only (halo stroke excluded).
        const bb = t.getBBox();
        const m = t.getScreenCTM();
        if (!m) return;
        const corners = [
          new DOMPoint(bb.x, bb.y).matrixTransform(m),
          new DOMPoint(bb.x + bb.width, bb.y).matrixTransform(m),
          new DOMPoint(bb.x, bb.y + bb.height).matrixTransform(m),
          new DOMPoint(bb.x + bb.width, bb.y + bb.height).matrixTransform(m),
        ];
        const xs = corners.map((p) => p.x);
        const ys = corners.map((p) => p.y);
        boxes.push({
          name: `${name}#${idx}`,
          x: Math.min(...xs),
          y: Math.min(...ys),
          w: Math.max(...xs) - Math.min(...xs),
          h: Math.max(...ys) - Math.min(...ys),
        });
        fontSizes.push(Number(t.getAttribute('font-size')));
      });
    }
    const overlapPairs: string[] = [];
    // 1px slack absorbs sub-pixel rounding; anything larger is a real overlap.
    for (let i = 0; i < boxes.length; i++) {
      for (let j = i + 1; j < boxes.length; j++) {
        const ox = Math.min(boxes[i].x + boxes[i].w, boxes[j].x + boxes[j].w) - Math.max(boxes[i].x, boxes[j].x);
        const oy = Math.min(boxes[i].y + boxes[i].h, boxes[j].y + boxes[j].h) - Math.max(boxes[i].y, boxes[j].y);
        if (ox > 1 && oy > 1) overlapPairs.push(`${boxes[i].name} x ${boxes[j].name}`);
      }
    }
    const outsideLabels: string[] = [];
    for (const b of boxes) {
      if (
        b.x < svgRect.x - 1 ||
        b.y < svgRect.y - 1 ||
        b.x + b.w > svgRect.x + svgRect.width + 1 ||
        b.y + b.h > svgRect.y + svgRect.height + 1
      ) {
        outsideLabels.push(b.name);
      }
    }
    return {
      minEffectivePx: Math.min(...fontSizes.map((f) => (f * svgRect.width) / vb[2])),
      overlapPairs,
      outsideLabels,
      svgRenderedWidth: svgRect.width,
      viewportWidth: window.innerWidth,
      pageOverflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
    };
  });
}

const H3_CASES: Array<{ name: string; values: Partial<Record<'count' | 'di' | 'df' | 'angle', string>> }> = [
  { name: 'REF-01 positive N=4', values: { count: '4', di: '200', df: '400', angle: '45' } },
  { name: 'negative N=4', values: { count: '4', di: '400', df: '200', angle: '45' } },
  { name: 'REF-05 90deg', values: { count: '4', di: '200', df: '400', angle: '90' } },
  { name: 'aligned N=4', values: { count: '4', di: '200', df: '100', angle: '60' } },
  { name: 'tiny-A negative', values: { count: '4', di: '200.04', df: '100', angle: '60' } },
  { name: 'N=12', values: { count: '12', di: '200', df: '400', angle: '45' } },
];

async function runH3Matrix(page: import('@playwright/test').Page, url: string, imperial: boolean, tag: string) {
  for (const width of [320, 390]) {
    await page.setViewportSize({ width, height: 800 });
    await openTool(page, url);
    for (const c of H3_CASES) {
      await setValues(page, c.values);
      if (imperial) {
        await page.getByRole('button', { name: 'in', exact: true }).click();
      }
      await waitForStableLayout(page);
      const audit = await auditAnnotations(page);
      console.log(
        `H3 ${tag} ${c.name} @viewport=${audit.viewportWidth}px svg=${audit.svgRenderedWidth.toFixed(1)}px minFont=${audit.minEffectivePx.toFixed(1)}px`,
      );
      expect(audit.overlapPairs, `${tag} ${c.name} @${width}px: overlapping annotations`).toEqual([]);
      expect(audit.outsideLabels, `${tag} ${c.name} @${width}px: annotations outside the visible area`).toEqual([]);
      expect(audit.minEffectivePx, `${tag} ${c.name} @${width}px: text below 11 CSS px`).toBeGreaterThanOrEqual(11);
      expect(audit.pageOverflow, `${tag} ${c.name} @${width}px: page overflow`).toBeLessThanOrEqual(1);
      if (imperial) {
        await page.getByRole('button', { name: 'mm', exact: true }).click();
      }
    }
  }
}

test('H3: real-DOM annotation audit (es, mm) at 320px / 390px', async ({ page }) => {
  await runH3Matrix(page, TOOL_URL_ES, false, 'es/mm');
});

test('H3: real-DOM annotation audit (en, in) at 320px / 390px', async ({ page }) => {
  await runH3Matrix(page, TOOL_URL, true, 'en/in');
});

test('H3: PO isolated widths 212px / 282px confirmed in the real app', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 800 });
  await openTool(page);
  for (const forcedWidth of [212, 282]) {
    for (const c of [
      { name: 'negative N=4', values: { count: '4', di: '400', df: '200', angle: '45' } },
      { name: 'REF-01 positive N=4', values: { count: '4', di: '200', df: '400', angle: '45' } },
      { name: 'N=12', values: { count: '12', di: '200', df: '400', angle: '45' } },
    ]) {
      await setValues(page, c.values);
      await page.evaluate((w) => {
        const svg = document.querySelector('[data-testid="pipe-comb-stagger-svg"]');
        const parent = svg?.parentElement as HTMLElement | null;
        if (parent) parent.style.width = `${w}px`;
      }, forcedWidth);
      await waitForStableLayout(page);
      const audit = await auditAnnotations(page);
      console.log(
        `H3 forced ${c.name} @viewport=${audit.viewportWidth}px svg=${audit.svgRenderedWidth.toFixed(1)}px minFont=${audit.minEffectivePx.toFixed(1)}px`,
      );
      expect(audit.svgRenderedWidth, `${c.name}: forced width not applied`).toBeGreaterThan(forcedWidth - 2);
      expect(audit.svgRenderedWidth, `${c.name}: forced width not applied`).toBeLessThan(forcedWidth + 2);
      expect(audit.overlapPairs, `${c.name} @${forcedWidth}px: overlapping annotations`).toEqual([]);
      expect(audit.outsideLabels, `${c.name} @${forcedWidth}px: annotations outside the visible area`).toEqual([]);
      expect(audit.minEffectivePx, `${c.name} @${forcedWidth}px: text below 11 CSS px`).toBeGreaterThanOrEqual(11);
    }
  }
});

test('H3: rendered text-anchor matches the computed layout anchors', async ({ page }) => {
  const expectAnchors = async (
    count: number,
    di: number,
    df: number,
    angle: number,
    tag: string,
  ) => {
    await waitForStableLayout(page);
    const svg = page.locator('[data-testid="pipe-comb-stagger-svg"]');
    const containerWidth = await svg.evaluate((el) => el.parentElement?.clientWidth ?? 0);
    const res = solvePipeCombStagger({
      pipeCount: count,
      initialSpacingMm: di,
      finalSpacingMm: df,
      elbowAngleDeg: angle,
    });
    if (!res.success) throw new Error(`kernel rejected ${tag}`);
    const layout = buildPipeCombStaggerScreenLayout(res.result, containerWidth);
    const dfAnchor = await page.locator('[data-testid="pipe-comb-dim-final"]').getAttribute('text-anchor');
    const aAnchor = await page.locator('[data-testid="pipe-comb-dim-stagger"]').getAttribute('text-anchor');
    const angleAnchor = await page.locator('[data-testid="pipe-comb-angle-label"]').getAttribute('text-anchor');
    expect(dfAnchor, `${tag}: Df anchor (layout=${layout.dimFinal.labelAnchor})`).toBe(layout.dimFinal.labelAnchor);
    expect(aAnchor, `${tag}: A anchor (layout=${layout.dimStagger.labelAnchor})`).toBe(layout.dimStagger.labelAnchor);
    expect(angleAnchor, `${tag}: angle anchor (layout=${layout.angleLabelAnchor})`).toBe(layout.angleLabelAnchor);
    const domPipeAnchors = await svg.locator('[data-testid="pipe-comb-pipe-label"]').evaluateAll((els) =>
      els.map((el) => el.getAttribute('text-anchor')),
    );
    const layoutPipeAnchors = layout.pipes.filter((p) => p.labelPos !== null).map((p) => p.labelAnchor);
    expect(domPipeAnchors, `${tag}: pipe label anchors`).toEqual(layoutPipeAnchors);
  };

  /* Desktop default (REF-01). */
  await openTool(page);
  await expectAnchors(4, 200, 400, 45, 'desktop REF-01');

  /* Negative case at the PO's 282px rig: layout picks Df=end. */
  await setValues(page, { di: '400', df: '200' });
  await page.evaluate(() => {
    const svg = document.querySelector('[data-testid="pipe-comb-stagger-svg"]');
    const parent = svg?.parentElement as HTMLElement | null;
    if (parent) parent.style.width = '282px';
  });
  await expectAnchors(4, 400, 200, 45, 'negative@282');

  /* N=12 at the PO's 212px rig: layout picks Df=end and A=end. */
  await setValues(page, { count: '12', di: '200', df: '400' });
  await page.evaluate(() => {
    const svg = document.querySelector('[data-testid="pipe-comb-stagger-svg"]');
    const parent = svg?.parentElement as HTMLElement | null;
    if (parent) parent.style.width = '212px';
  });
  await expectAnchors(12, 200, 400, 45, 'N=12@212');

  /* Aligned case at 390px viewport (invisible-stagger branch). */
  await page.evaluate(() => {
    const svg = document.querySelector('[data-testid="pipe-comb-stagger-svg"]');
    const parent = svg?.parentElement as HTMLElement | null;
    if (parent) parent.style.width = '';
  });
  await page.setViewportSize({ width: 390, height: 800 });
  await setValues(page, { count: '4', di: '200', df: '100', angle: '60' });
  await expectAnchors(4, 200, 100, 60, 'aligned@390');
});
