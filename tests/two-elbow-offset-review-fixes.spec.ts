import { expect, test, type Page } from '@playwright/test';

/**
 * PB-PIPE-COMB-CORRECTION-001 — P4 REVIEW FIXES (candidate 5f09d60 review).
 *
 * Finding 2 — catalog CLR provenance: a non-tabulated NPS/type combination
 * must never silently reuse a previous radius. Both selection orders end in
 * the same explicit state (cleared field, visible notice, no results).
 *
 * Finding 3 — real SVG legibility: effective on-screen text size >= 11 CSS
 * px, annotations inside the SVG canvas, no overlapping labels, operable
 * controls. Measured in the real DOM after font/layout stabilization.
 *
 * Finding 4 — positive values never rendered as "0": precision extends so
 * 0.004 mm renders as "0.004 mm" / "0.0002 in", while true zero (tangent
 * elbows, reference line) keeps its distinct meaning.
 */

const TOOL_ES = '/tools?t=two-elbow-offset&lng=es';
const TOOL_EN = '/tools?t=two-elbow-offset&lng=en';

async function openTool(page: Page, url: string = TOOL_ES) {
  await page.goto(url);
  const betaDialog = page.locator('div[role="dialog"][data-state="open"]');
  const shown = await betaDialog.waitFor({ state: 'visible', timeout: 10_000 }).then(() => true).catch(() => false);
  if (shown) {
    await betaDialog.getByRole('button', { name: /continuar|continue/i }).click();
    await betaDialog.waitFor({ state: 'hidden' });
  }
}

async function fill(page: Page, values: Partial<Record<'count' | 'angle' | 'initial' | 'final' | 'clr', string>>) {
  const map = {
    count: '#teo-line-count',
    angle: '#teo-elbow-angle',
    initial: '#teo-initial-spacing',
    final: '#teo-final-spacing',
    clr: '#teo-clr',
  } as const;
  for (const [key, selector] of Object.entries(map)) {
    const v = values[key as keyof typeof values];
    if (v === undefined) continue;
    await page.locator(selector).fill(v);
  }
}

function row(page: Page, id: string) {
  return page.locator(`[data-testid="two-elbow-offset-row-${id}"]`);
}

async function selectNps(page: Page, label: string) {
  await page.getByRole('combobox', { name: 'NPS' }).click();
  await page.getByRole('option', { name: label, exact: true }).click();
}

async function selectElbowType(page: Page, label: string) {
  await page.getByRole('combobox', { name: /elbow type|tipo de codo/i }).click();
  await page.getByRole('option', { name: label, exact: true }).click();
}

/* ------------------------------------------------------------------ */
/* Finding 2 — catalog CLR provenance                                  */
/* ------------------------------------------------------------------ */

test('R2a: NPS 1/2 then SR — clears CLR, visible notice, no results', async ({ page }) => {
  await openTool(page, TOOL_EN);
  await expect(page.locator('#teo-clr')).toHaveValue('152.4');
  await selectNps(page, '1/2"');
  /* LR for NPS 1/2 IS tabulated: 1.5 in = 38.1 mm. */
  await expect(page.locator('#teo-clr')).toHaveValue('38.1');
  await expect(page.getByTestId('two-elbow-offset-clr-source')).toContainText('NPS 1/2" LR');
  /* Switching to SR (not tabulated at NPS 1/2) must NOT keep 38.1. */
  await selectElbowType(page, 'SR');
  await expect(page.locator('#teo-clr')).toHaveValue('');
  await expect(page.getByTestId('two-elbow-offset-clr-source')).toContainText('no tabulated CLR for NPS 1/2" SR');
  /* No stale results presented as current. */
  await expect(row(page, '2')).toHaveCount(0);
  await expect(page.locator('[data-testid="two-elbow-offset-diagram"]')).toHaveCount(0);
});

test('R2b: SR then NPS 1/2 — same final state regardless of order', async ({ page }) => {
  await openTool(page, TOOL_EN);
  await selectElbowType(page, 'SR');
  await expect(page.locator('#teo-clr')).toHaveValue('101.6');
  await selectNps(page, '1/2"');
  /* Identical final selection as R2a: cleared field, notice, no results. */
  await expect(page.locator('#teo-clr')).toHaveValue('');
  await expect(page.getByTestId('two-elbow-offset-clr-source')).toContainText('no tabulated CLR for NPS 1/2" SR');
  await expect(row(page, '2')).toHaveCount(0);
});

test('R2c: NPS below the tabulated range (1/8) — explicit missing data', async ({ page }) => {
  await openTool(page, TOOL_EN);
  await selectNps(page, '1/8"');
  await expect(page.locator('#teo-clr')).toHaveValue('');
  await expect(page.getByTestId('two-elbow-offset-clr-source')).toContainText('no tabulated CLR for NPS 1/8" LR');
  await expect(row(page, '2')).toHaveCount(0);
});

test('R2d: available LR/SR combinations resolve from the catalog', async ({ page }) => {
  await openTool(page, TOOL_EN);
  /* NPS 1: both LR (1.5 in) and SR (1.0 in) tabulated. */
  await selectNps(page, '1"');
  await expect(page.locator('#teo-clr')).toHaveValue('38.1');
  await selectElbowType(page, 'SR');
  await expect(page.locator('#teo-clr')).toHaveValue('25.4');
  /* NPS 4 LR — PC-01 reference radius. */
  await selectNps(page, '4"');
  await selectElbowType(page, 'LR');
  await expect(page.locator('#teo-clr')).toHaveValue('152.4');
  await expect(row(page, '2')).toBeVisible();
});

test('R2e: recovery — returning to a valid combination restores results', async ({ page }) => {
  await openTool(page, TOOL_EN);
  await selectNps(page, '1/2"');
  await selectElbowType(page, 'SR');
  await expect(row(page, '2')).toHaveCount(0);
  /* Select a tabulated combination again. */
  await selectNps(page, '4"');
  await expect(page.locator('#teo-clr')).toHaveValue('101.6');
  await expect(row(page, '2')).toBeVisible();
  await expect(row(page, '2').locator('td').nth(4)).toHaveText('42.08 mm');
});

test('R2f: manual CLR entry after missing data — explicit custom provenance', async ({ page }) => {
  await openTool(page, TOOL_EN);
  await selectNps(page, '1/2"');
  await selectElbowType(page, 'SR');
  await expect(page.locator('#teo-clr')).toHaveValue('');
  /* Explicit user choice: entering a CLR makes the provenance visible. */
  await fill(page, { clr: '100' });
  await expect(page.getByTestId('two-elbow-offset-clr-source')).toContainText('Custom CLR');
  await expect(row(page, '2')).toBeVisible();
  await expect(row(page, '2').locator('td').nth(4)).toHaveText('41.42 mm'); /* 100·tan22.5° */
  /* Unit change keeps custom provenance and converts the text. */
  await page.locator('[data-testid="two-elbow-offset-unit-in"]').click();
  await expect(page.locator('#teo-clr')).toHaveValue('3.937');
  await expect(page.getByTestId('two-elbow-offset-clr-source')).toContainText('Custom CLR');
  await expect(row(page, '2').locator('td').nth(4)).toHaveText('1.631 in'); /* 41.4214 mm */
  await page.locator('[data-testid="two-elbow-offset-unit-mm"]').click();
  await expect(page.locator('#teo-clr')).toHaveValue('100');
  await expect(row(page, '2').locator('td').nth(4)).toHaveText('41.42 mm');
});

test('R2g: manual edit of a catalog CLR switches provenance to custom', async ({ page }) => {
  await openTool(page, TOOL_EN);
  await expect(page.getByTestId('two-elbow-offset-clr-source')).toContainText('NPS 4" LR');
  await fill(page, { clr: '160' });
  await expect(page.getByTestId('two-elbow-offset-clr-source')).toContainText('Custom CLR');
  await expect(row(page, '2').locator('td').nth(4)).toHaveText('66.27 mm'); /* 160·tan22.5° */
});

/* ------------------------------------------------------------------ */
/* Finding 3 — real SVG legibility (measured in the DOM)               */
/* ------------------------------------------------------------------ */

interface DiagramMetrics {
  effectiveFontPx: number;
  svgWidthPx: number;
  viewBoxWidth: number;
  textCount: number;
  allTextInside: boolean;
  overlapPairs: number;
  viewportWidth: number;
}

/** Stabilize fonts/layout, then measure the rendered diagram. */
async function measureDiagram(page: Page): Promise<DiagramMetrics> {
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(150);
  return page.evaluate(() => {
    const svg = document.querySelector('[data-testid="two-elbow-offset-diagram"]') as SVGSVGElement | null;
    if (!svg) throw new Error('diagram not found');
    const vb = svg.getAttribute('viewBox')!.split(/\s+/).map(Number);
    const viewBoxWidth = vb[2];
    const svgRect = svg.getBoundingClientRect();
    const texts = Array.from(svg.querySelectorAll('text'));
    const firstFont = parseFloat(texts[0].getAttribute('font-size')!);
    const effectiveFontPx = (svgRect.width / viewBoxWidth) * firstFont;
    let allTextInside = true;
    const rects = texts.map((t) => t.getBoundingClientRect());
    rects.forEach((r) => {
      if (r.left < svgRect.left - 1 || r.right > svgRect.right + 1 || r.top < svgRect.top - 1 || r.bottom > svgRect.bottom + 1) {
        allTextInside = false;
      }
    });
    let overlapPairs = 0;
    for (let i = 0; i < rects.length; i++) {
      for (let j = i + 1; j < rects.length; j++) {
        const a = rects[i];
        const b = rects[j];
        const ix = Math.min(a.right, b.right) - Math.max(a.left, b.left);
        const iy = Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top);
        if (ix > 1 && iy > 1) overlapPairs++;
      }
    }
    return {
      effectiveFontPx,
      svgWidthPx: svgRect.width,
      viewBoxWidth,
      textCount: texts.length,
      allTextInside,
      overlapPairs,
      viewportWidth: window.innerWidth,
    };
  });
}

async function assertLegible(page: Page) {
  const m = await measureDiagram(page);
  /* Console-visible evidence for the report. */
  console.log(`[legibility] viewport=${m.viewportWidth} svg=${m.svgWidthPx.toFixed(1)}px viewBox=${m.viewBoxWidth} effectiveFont=${m.effectiveFontPx.toFixed(2)}px texts=${m.textCount} inside=${m.allTextInside} overlaps=${m.overlapPairs}`);
  expect(m.effectiveFontPx, `effective font >= 11 CSS px at viewport ${m.viewportWidth}`).toBeGreaterThanOrEqual(11);
  expect(m.allTextInside, 'all annotations inside the SVG canvas').toBe(true);
  expect(m.overlapPairs, 'no overlapping annotations').toBe(0);
}

const GEOMETRIES: Record<string, Partial<Record<'count' | 'angle' | 'initial' | 'final' | 'clr', string>>> = {
  positive: {},
  negative: { count: '3', angle: '35', initial: '350', final: '250' },
  straight: { initial: '300', final: '300' },
  tangent: { count: '2', initial: '500', final: '558.578644', clr: '100' },
  n12: { count: '12', initial: '150', final: '250' },
};

for (const [width, height] of [[320, 800], [390, 844], [1440, 900]] as const) {
  test(`R3: ${width}px es/mm — legible diagram (positive case)`, async ({ page }) => {
    await page.setViewportSize({ width, height });
    await openTool(page, TOOL_ES);
    await assertLegible(page);
    /* Controls operable and not clipped by the viewport. */
    const mmBtn = page.locator('[data-testid="two-elbow-offset-unit-mm"]');
    const inBtn = page.locator('[data-testid="two-elbow-offset-unit-in"]');
    for (const btn of [mmBtn, inBtn]) {
      const box = await btn.boundingBox();
      expect(box).not.toBeNull();
      expect(box!.x).toBeGreaterThanOrEqual(0);
      expect(box!.x + box!.width).toBeLessThanOrEqual(width);
    }
    await inBtn.click();
    await expect(row(page, '2').locator('td').nth(3)).toHaveText('11.136 in');
  });

  test(`R3: ${width}px en/in — legible diagram (positive case)`, async ({ page }) => {
    await page.setViewportSize({ width, height });
    await openTool(page, TOOL_EN);
    await page.locator('[data-testid="two-elbow-offset-unit-in"]').click();
    await assertLegible(page);
  });
}

for (const [name, values] of Object.entries(GEOMETRIES)) {
  if (name === 'positive') continue; // covered by the viewport matrix above
  test(`R3: desktop es/mm — legible diagram (${name})`, async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await openTool(page, TOOL_ES);
    await fill(page, values);
    await assertLegible(page);
  });
  test(`R3: 390px es/mm — legible diagram (${name})`, async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await openTool(page, TOOL_ES);
    await fill(page, values);
    await assertLegible(page);
  });
}

/* ------------------------------------------------------------------ */
/* Finding 4 — positive values never rendered as zero                  */
/* ------------------------------------------------------------------ */

test('R4a: 0.004 mm straight cut renders as non-zero (mm and in)', async ({ page }) => {
  await openTool(page, TOOL_ES);
  /* Review reproduction: N=2, Di=200, Df=400.004, theta=90, CLR=100. */
  await fill(page, { count: '2', angle: '90', initial: '200', final: '400.004', clr: '100' });
  const cut = row(page, '2').locator('td').nth(5);
  /* Engine: straightCutLengthMm = 0.004, status displaced — the display
     must preserve the non-zero character in table AND diagram dimension. */
  await expect(cut).toHaveText('0.004 mm');
  await expect(row(page, '2').locator('td').nth(7)).toHaveText('Desplazada');
  await expect(page.locator('[data-testid="two-elbow-offset-diagram"]')).toContainText('Tramo recto 0.004 mm');
  /* mm -> in -> mm: still non-zero in both unit systems. */
  await page.locator('[data-testid="two-elbow-offset-unit-in"]').click();
  await expect(cut).toHaveText('0.0002 in');
  await page.locator('[data-testid="two-elbow-offset-unit-mm"]').click();
  await expect(cut).toHaveText('0.004 mm');
});

test('R4b: true zero keeps its distinct meaning (tangent elbows)', async ({ page }) => {
  await openTool(page, TOOL_ES);
  /* delta = 2·R·tan(theta/2)·sin(theta) with R=100, theta=45°. */
  await fill(page, { count: '2', initial: '500', final: '558.578644', clr: '100' });
  await expect(row(page, '2').locator('td').nth(5)).toHaveText('0 mm');
  await expect(row(page, '2').locator('td').nth(7)).toHaveText('Codos tangentes');
  /* Reference line keeps the em-dash (no cut order at all). */
  await expect(row(page, '1').locator('td').nth(5)).toHaveText('—');
  await expect(row(page, '1').locator('td').nth(7)).toHaveText('Referencia (recta)');
});

test('R4c: small take-out and travel values stay visible', async ({ page }) => {
  await openTool(page, TOOL_ES);
  /* Tiny offset: 0.004 mm at 45° with a tiny CLR keeps the geometry valid. */
  await fill(page, { count: '2', initial: '200', final: '200.004', clr: '0.001' });
  await expect(row(page, '2').locator('td').nth(1)).toHaveText('+0.004 mm');
  await expect(row(page, '2').locator('td').nth(2)).toHaveText('0.004 mm');
  await expect(row(page, '2').locator('td').nth(3)).toHaveText('0.01 mm');
  await expect(row(page, '2').locator('td').nth(4)).toHaveText('0.0004 mm');
  await expect(row(page, '2').locator('td').nth(5)).not.toHaveText('0 mm');
  await expect(row(page, '2').locator('td').nth(5)).not.toHaveText('—');
});
