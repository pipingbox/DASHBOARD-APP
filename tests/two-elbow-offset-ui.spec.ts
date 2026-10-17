import { expect, test } from '@playwright/test';

/**
 * PB-PIPE-COMB-CORRECTION-001 — P4
 * Two-elbow offset tool ("Desplazamiento con dos codos") UI contract.
 *
 * Expected numbers are the legacy W1.B.1 engine values for the R1-D PC-01
 * reference case (4 lines, 200→400 mm, 45°, CLR 152.4 = 6" LR), validated
 * against an independent geometric reconstruction in
 * scripts/test-two-elbow-offset-geometry.ts (263 assertions). The UI calls
 * the frozen engine exclusively; it never re-implements geometry.
 *
 * Covers the GO P4 acceptance set:
 *   - results update after editing; errors leave NO stale results
 *   - >= 20 mm/in cycles, checking BOTH phases each time
 *   - real editing in inches
 *   - delete/invalid followed by unit change (no silent recovery)
 *   - es/mm and en/in
 *   - 320/390 px and desktop
 *   - catalog (negative_cut) and invalid-field states
 */

const TOOL_EN = '/tools?t=two-elbow-offset&lng=en';
const TOOL_ES = '/tools?t=two-elbow-offset&lng=es';

async function openTool(page: import('@playwright/test').Page, url: string = TOOL_EN) {
  await page.goto(url);
  /* Beta modal mounts after hydration; dismiss deterministically
     (locale-independent selector, localized button text). */
  const betaDialog = page.locator('div[role="dialog"][data-state="open"]');
  const shown = await betaDialog.waitFor({ state: 'visible', timeout: 10_000 }).then(() => true).catch(() => false);
  if (shown) {
    await betaDialog.getByRole('button', { name: /continuar|continue/i }).click();
    await betaDialog.waitFor({ state: 'hidden' });
  }
}

function row(page: import('@playwright/test').Page, id: string) {
  return page.locator(`[data-testid="two-elbow-offset-row-${id}"]`);
}

async function fill(page: import('@playwright/test').Page, values: Partial<Record<'count' | 'angle' | 'initial' | 'final' | 'clr', string>>) {
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

test('A: opens with PC-01 defaults, title and catalog hint', async ({ page }) => {
  await openTool(page);
  await expect(page.getByRole('heading', { name: 'Two-elbow offset' })).toBeVisible();
  await expect(page.locator('#teo-line-count')).toHaveValue('4');
  await expect(page.locator('#teo-elbow-angle')).toHaveValue('45');
  await expect(page.locator('#teo-initial-spacing')).toHaveValue('200');
  await expect(page.locator('#teo-final-spacing')).toHaveValue('400');
  await expect(page.locator('#teo-clr')).toHaveValue('152.4');
});

test('B: PC-01 results table — reference line vs displaced lines', async ({ page }) => {
  await openTool(page);
  /* L1 reference: offset 0, everything else em-dash (straight run, NOT a 0 mm cut). */
  await expect(row(page, '1').locator('td').nth(1)).toHaveText('0 mm');
  for (const col of [2, 3, 4, 5, 6]) {
    await expect(row(page, '1').locator('td').nth(col)).toHaveText('—');
  }
  await expect(row(page, '1').locator('td').nth(7)).toHaveText('Reference (straight)');
  /* L2: offset +200, advance 200, travel 282.84, take-out 63.1, cut 156.59. */
  await expect(row(page, '2').locator('td').nth(1)).toHaveText('+200 mm');
  await expect(row(page, '2').locator('td').nth(2)).toHaveText('200 mm');
  await expect(row(page, '2').locator('td').nth(3)).toHaveText('282.84 mm');
  await expect(row(page, '2').locator('td').nth(4)).toHaveText('63.13 mm');
  await expect(row(page, '2').locator('td').nth(5)).toHaveText('156.59 mm');
  await expect(row(page, '2').locator('td').nth(7)).toHaveText('Offset');
  /* L4 (max |offset| = 600): travel 848.53, cut 722.33. */
  await expect(row(page, '4').locator('td').nth(1)).toHaveText('+600 mm');
  await expect(row(page, '4').locator('td').nth(3)).toHaveText('848.53 mm');
  await expect(row(page, '4').locator('td').nth(5)).toHaveText('722.28 mm');
  /* Summary cards (value also appears in the diagram dimension). */
  await expect(page.getByText('Widening', { exact: true })).toBeVisible();
  await expect(page.getByText('Max travel difference', { exact: true })).toBeVisible();
  await expect(page.getByText('848.53 mm', { exact: true }).first()).toBeVisible();
});

test('C: diagram renders with dimensions and line ids', async ({ page }) => {
  await openTool(page);
  const svg = page.locator('[data-testid="two-elbow-offset-diagram"]');
  await expect(svg).toBeVisible();
  /* Dimension labels carry engine values with explicit origin/destination. */
  await expect(svg.getByText('Initial spacing 200 mm')).toBeVisible();
  await expect(svg.getByText('Final spacing 400 mm')).toBeVisible();
  await expect(svg.getByText('Offset 600 mm')).toBeVisible();
  await expect(svg.getByText('Advance 600 mm')).toBeVisible();
  await expect(svg.getByText('Travel 848.53 mm')).toBeVisible();
  await expect(svg.getByText('Straight 722.28 mm')).toBeVisible();
  await expect(svg.getByText('Angle 45°')).toBeVisible();
  /* Line identifiers relate the drawing to the table. */
  for (const id of ['L1', 'L2', 'L3', 'L4']) {
    await expect(svg.getByText(id, { exact: true })).toBeVisible();
  }
});

test('D: results update after editing (3 lines, 35°, contracting)', async ({ page }) => {
  await openTool(page);
  await fill(page, { count: '3', angle: '35', initial: '350', final: '250' });
  /* Contracting: L3 offset = 2 * (250-350) = -200, drawn upward. */
  await expect(row(page, '3').locator('td').nth(1)).toHaveText('−200 mm');
  await expect(page.getByText('Narrowing', { exact: true })).toBeVisible();
  /* 35° is flagged as nominal geometry (no commercial-fitting claim). */
  await expect(
    page.getByText('Angle not commercially standardized: nominal geometry. Verify fitting availability before fabrication.'),
  ).toBeVisible();
});

test('E: equal spacings — straight lines, no fabricated elbows', async ({ page }) => {
  await openTool(page);
  await fill(page, { initial: '300', final: '300' });
  await expect(page.getByText('Straight lines', { exact: true })).toBeVisible();
  for (const id of ['1', '2', '3', '4']) {
    await expect(row(page, id).locator('td').nth(1)).toHaveText('0 mm');
    await expect(row(page, id).locator('td').nth(7)).toHaveText('Reference (straight)');
  }
});

test('F: negative cut — engine error surfaced, NO stale results', async ({ page }) => {
  await openTool(page);
  await expect(row(page, '4')).toBeVisible();
  /* CLR 700 with step 200 at 45°: intermediate cut negative. */
  await fill(page, { clr: '700' });
  await expect(page.locator('[role="alert"]')).toContainText('negative');
  await expect(row(page, '4')).toHaveCount(0);
  await expect(page.locator('[data-testid="two-elbow-offset-diagram"]')).toHaveCount(0);
  /* Recovery. */
  await fill(page, { clr: '152.4' });
  await expect(row(page, '4')).toBeVisible();
});

test('G: invalid/empty fields — no results, no silent recovery', async ({ page }) => {
  await openTool(page);
  await expect(row(page, '2')).toBeVisible();
  await fill(page, { initial: '' });
  await expect(row(page, '2')).toHaveCount(0);
  await expect(page.getByText('Check the fields: some values are empty or invalid.')).toBeVisible();
  /* Typing garbage stays invalid. */
  await fill(page, { initial: 'abc' });
  await expect(row(page, '2')).toHaveCount(0);
  /* Explicit correction restores results. */
  await fill(page, { initial: '200' });
  await expect(row(page, '2')).toBeVisible();
});

test('H: 20+ mm/in cycles — both phases verified each cycle', async ({ page }) => {
  await openTool(page);
  const inBtn = page.locator('[data-testid="two-elbow-offset-unit-in"]');
  const mmBtn = page.locator('[data-testid="two-elbow-offset-unit-mm"]');
  for (let i = 0; i < 20; i++) {
    await inBtn.click();
    /* Imperial phase: canonical mm values re-rendered as inches. */
    await expect(page.locator('#teo-initial-spacing')).toHaveValue('7.874');
    await expect(page.locator('#teo-clr')).toHaveValue('6');
    await expect(row(page, '2').locator('td').nth(3)).toHaveText('11.136 in'); /* 282.84 mm */
    await mmBtn.click();
    /* Metric phase: exact canonical values recover (no drift). */
    await expect(page.locator('#teo-initial-spacing')).toHaveValue('200');
    await expect(page.locator('#teo-final-spacing')).toHaveValue('400');
    await expect(page.locator('#teo-clr')).toHaveValue('152.4');
    await expect(row(page, '2').locator('td').nth(3)).toHaveText('282.84 mm');
    await expect(row(page, '2').locator('td').nth(5)).toHaveText('156.59 mm');
  }
});

test('I: real editing in inches feeds the engine in mm', async ({ page }) => {
  await openTool(page);
  await page.locator('[data-testid="two-elbow-offset-unit-in"]').click();
  /* 8 in = 203.2 mm exactly; results must reflect the canonical value. */
  await fill(page, { initial: '8' });
  await expect(page.locator('#teo-initial-spacing')).toHaveValue('8');
  /* L2 offset = 400 - 203.2 = 196.8 mm = 7.748 in. */
  await expect(row(page, '2').locator('td').nth(1)).toHaveText('+7.748 in');
});

test('J: delete followed by unit change — stays invalid, no recovery', async ({ page }) => {
  await openTool(page);
  await fill(page, { final: '' });
  await expect(row(page, '2')).toHaveCount(0);
  await page.locator('[data-testid="two-elbow-offset-unit-in"]').click();
  /* Still empty, still no results; the toggle must not resurrect a value. */
  await expect(page.locator('#teo-final-spacing')).toHaveValue('');
  await expect(row(page, '2')).toHaveCount(0);
  await page.locator('[data-testid="two-elbow-offset-unit-mm"]').click();
  await expect(page.locator('#teo-final-spacing')).toHaveValue('');
  await expect(row(page, '2')).toHaveCount(0);
});

test('K: Spanish locale — labels and results localized', async ({ page }) => {
  await openTool(page, TOOL_ES);
  await expect(page.getByRole('heading', { name: 'Desplazamiento con dos codos' })).toBeVisible();
  await expect(row(page, '1').locator('td').nth(7)).toHaveText('Referencia (recta)');
  await expect(row(page, '2').locator('td').nth(1)).toHaveText('+200 mm');
  await expect(page.getByText('Separación creciente', { exact: true })).toBeVisible();
  await expect(
    page.getByText('El recorrido es la distancia entre intersecciones teóricas de ejes; no es la longitud de arco del codo. El avance no es una longitud de corte.'),
  ).toBeVisible();
});

test('L: 320 px mobile — table scrolls horizontally, nothing clipped', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 800 });
  await openTool(page);
  await expect(page.getByRole('heading', { name: 'Two-elbow offset' })).toBeVisible();
  /* All four rows fully rendered at 320 px. */
  for (const id of ['1', '2', '3', '4']) {
    await expect(row(page, id)).toBeVisible();
  }
  await expect(row(page, '2').locator('td').nth(3)).toHaveText('282.84 mm');
  /* Unit buttons operable. */
  await page.locator('[data-testid="two-elbow-offset-unit-in"]').click();
  await expect(row(page, '2').locator('td').nth(3)).toHaveText('11.136 in');
});

test('M: 390 px mobile — same contract', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await openTool(page);
  for (const id of ['1', '2', '3', '4']) {
    await expect(row(page, id)).toBeVisible();
  }
  await expect(page.locator('[data-testid="two-elbow-offset-diagram"]')).toBeVisible();
});

test('N: N=12 — all rows and diagram render', async ({ page }) => {
  await openTool(page);
  await fill(page, { count: '12', initial: '150', final: '250' });
  for (let i = 1; i <= 12; i++) {
    await expect(row(page, String(i))).toBeVisible();
  }
  /* L12 offset = 11 * 100 = 1100 mm. */
  await expect(row(page, '12').locator('td').nth(1)).toHaveText('+1100 mm');
});

test('O: tangent elbows — zero cut flagged as tangent, not a 0 mm cut order', async ({ page }) => {
  await openTool(page);
  /* δ = 2·R·tan(θ/2)·sin(θ) with R=100, θ=45° → final = 500 + 58.5786. */
  await fill(page, { count: '2', initial: '500', final: '558.578644', clr: '100' });
  await expect(row(page, '2').locator('td').nth(7)).toHaveText('Tangent elbows');
  await expect(row(page, '2').locator('td').nth(5)).toHaveText('0 mm');
  await expect(
    page.getByText('Some intermediate straight is zero: the elbows end up tangent to each other (not an order to cut 0 mm).'),
  ).toBeVisible();
});

test('P: catalog CLR selector writes the field (SR)', async ({ page }) => {
  await openTool(page);
  /* Default NPS 4: LR = 152.4 mm (6 in); SR = 4 × 25.4 = 101.6 mm. */
  await page.getByRole('combobox', { name: 'Elbow type' }).click();
  await page.getByRole('option', { name: 'SR', exact: true }).click();
  await expect(page.locator('#teo-clr')).toHaveValue('101.6');
  await expect(row(page, '2').locator('td').nth(4)).toHaveText('42.08 mm'); /* 101.6·tan22.5° */
});
