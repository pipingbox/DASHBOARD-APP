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
 *
 * Finding (2026-10-22 preview review) — editable field coherence: the
 * EDITABLE length fields must never hide a fraction the engine uses. The
 * shared read-only formatter rounded mm to 2 decimals, so Df = 400.004 mm
 * redisplayed as "400" after a mm -> in -> mm round trip while the result
 * stayed 0.004 mm / displaced. R4a2-R4a4 inspect the field values, not only
 * the results, and pin the adopted imperial precision.
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
  /* Unit change keeps custom provenance and converts the text. The inch
     text carries the precision needed to reproduce 100 mm within 1e-6 mm
     (updated 2026-10-22: the previous "3.937" expectation encoded the lossy
     4-decimal text, which reparsed to 99.9998 mm). */
  await page.locator('[data-testid="two-elbow-offset-unit-in"]').click();
  await expect(page.locator('#teo-clr')).toHaveValue('3.9370079');
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
  const status = row(page, '2').locator('td').nth(7);
  /* Engine: straightCutLengthMm = 0.004, status displaced — the display
     must preserve the non-zero character in table AND diagram dimension. */
  await expect(cut).toHaveText('0.004 mm');
  await expect(status).toHaveText('Desplazada');
  await expect(page.locator('[data-testid="two-elbow-offset-diagram"]')).toContainText('Tramo recto 0.004 mm');
  /* mm -> in -> mm: still non-zero in both unit systems. */
  await page.locator('[data-testid="two-elbow-offset-unit-in"]').click();
  await expect(cut).toHaveText('0.0002 in');
  await page.locator('[data-testid="two-elbow-offset-unit-mm"]').click();
  await expect(cut).toHaveText('0.004 mm');
});

test('R4a2: the editable field never hides a fraction the engine uses (2026-10-22 finding)', async ({ page }) => {
  await openTool(page, TOOL_ES);
  /* Reported defect: after mm -> in -> mm the field redisplayed "400" while
     the engine kept 400.004 mm, so the visible input contradicted the
     result and retyping the visible value silently changed the geometry.
     This test inspects the FIELDS, not only the results. */
  await fill(page, { count: '2', angle: '90', initial: '200', final: '400.004', clr: '100' });
  const dfField = page.locator('#teo-final-spacing');
  const cut = row(page, '2').locator('td').nth(5);
  const status = row(page, '2').locator('td').nth(7);

  await expect(dfField).toHaveValue('400.004');
  await expect(cut).toHaveText('0.004 mm');
  await expect(status).toHaveText('Desplazada');

  /* mm -> in: the inch text must be faithful, not the lossy "15.7482". */
  await page.locator('[data-testid="two-elbow-offset-unit-in"]').click();
  const inchText = await dfField.inputValue();
  expect(inchText).not.toBe('15.7482');
  /* Adopted imperial precision: enough digits to reproduce 400.004 mm
     within 1e-6 mm (see two-elbow-offset-fields.ts). */
  expect(inchText).toBe('15.748189');
  expect(Math.abs(Number(inchText) * 25.4 - 400.004)).toBeLessThanOrEqual(1e-6);
  await expect(cut).toHaveText('0.0002 in');
  /* The other fields keep their own faithful inch representation. */
  await expect(page.locator('#teo-initial-spacing')).toHaveValue('7.87401575');
  await expect(page.locator('#teo-clr')).toHaveValue('3.9370079');

  /* in -> mm: the fraction is visible again. This is the regression. */
  await page.locator('[data-testid="two-elbow-offset-unit-mm"]').click();
  await expect(dfField).toHaveValue('400.004');
  await expect(cut).toHaveText('0.004 mm');
  await expect(status).toHaveText('Desplazada');
  await expect(page.locator('#teo-initial-spacing')).toHaveValue('200');
  await expect(page.locator('#teo-clr')).toHaveValue('100');

  /* Retyping what is visible, with trailing zeros, must not change anything. */
  await dfField.fill('400.0040');
  await expect(cut).toHaveText('0.004 mm');
  await expect(status).toHaveText('Desplazada');

  /* And the value the field shows is the value the engine used: retyping the
     displayed text verbatim reproduces the same result. */
  await dfField.fill(await dfField.inputValue());
  await expect(cut).toHaveText('0.004 mm');
  await expect(status).toHaveText('Desplazada');

  /* Only a real edit to a different number changes the geometry: typing the
     rounded "400" is now an explicit user decision, not a hidden one. */
  await dfField.fill('400');
  await expect(cut).toHaveText('0 mm');
  await expect(status).toHaveText('Codos tangentes');
});

test('R4a3: tangent 45 degree case survives a unit round trip', async ({ page }) => {
  await openTool(page, TOOL_ES);
  /* delta = 2·R·tan(22.5°)·sin(45°) with R=100 -> exact tangent elbows.
     Six decimals in the field must survive mm -> in -> mm. */
  await fill(page, { count: '2', angle: '45', initial: '500', final: '558.578644', clr: '100' });
  const dfField = page.locator('#teo-final-spacing');
  const cut = row(page, '2').locator('td').nth(5);
  const status = row(page, '2').locator('td').nth(7);

  await expect(dfField).toHaveValue('558.578644');
  await expect(cut).toHaveText('0 mm');
  await expect(status).toHaveText('Codos tangentes');

  await page.locator('[data-testid="two-elbow-offset-unit-in"]').click();
  const inchText = await dfField.inputValue();
  expect(Math.abs(Number(inchText) * 25.4 - 558.578644)).toBeLessThanOrEqual(1e-6);
  await expect(status).toHaveText('Codos tangentes');

  await page.locator('[data-testid="two-elbow-offset-unit-mm"]').click();
  await expect(dfField).toHaveValue('558.578644');
  await expect(cut).toHaveText('0 mm');
  await expect(status).toHaveText('Codos tangentes');
  /* The true zero stays distinguishable from the 0.004 mm case above. */
  await expect(row(page, '1').locator('td').nth(5)).toHaveText('—');
  await expect(row(page, '1').locator('td').nth(7)).toHaveText('Referencia (recta)');
});

test('R4a4: empty, invalid and cleared CLR fields survive a unit toggle', async ({ page }) => {
  await openTool(page, TOOL_ES);
  /* The faithful formatter must not resurrect the last valid value. */
  await fill(page, { final: '' });
  await page.locator('[data-testid="two-elbow-offset-unit-in"]').click();
  await expect(page.locator('#teo-final-spacing')).toHaveValue('');
  await expect(page.locator('[data-testid^="two-elbow-offset-row-"]')).toHaveCount(0);

  await fill(page, { final: 'abc' });
  await page.locator('[data-testid="two-elbow-offset-unit-mm"]').click();
  await expect(page.locator('#teo-final-spacing')).toHaveValue('abc');
  await expect(page.locator('[data-testid^="two-elbow-offset-row-"]')).toHaveCount(0);

  /* Untabulated catalog combination clears the CLR; a toggle keeps it clear. */
  await fill(page, { final: '400' });
  await selectNps(page, '1/2"');
  await selectElbowType(page, 'SR');
  await expect(page.locator('#teo-clr')).toHaveValue('');
  await page.locator('[data-testid="two-elbow-offset-unit-in"]').click();
  await expect(page.locator('#teo-clr')).toHaveValue('');
  await expect(page.locator('[data-testid^="two-elbow-offset-row-"]')).toHaveCount(0);
  /* Recovery: a tabulated combination refills the field in the active unit. */
  await selectElbowType(page, 'LR');
  await expect(page.locator('#teo-clr')).toHaveValue('1.5');
  await expect(page.locator('[data-testid^="two-elbow-offset-row-"]')).not.toHaveCount(0);
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
